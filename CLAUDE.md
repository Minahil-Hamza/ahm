# CLAUDE.md: Astronaut Health Monitor (AHM)

Offline-first, visual, multi-astronaut health self-assessment tool for long space missions.
**Full spec: `docs/SPEC.md`** (source of truth). Do not load all of it every time. Read only the sections listed in the current chunk.

---

## 1. Fixed Stack (do not change)

- **Frontend:** Next.js (App Router, TypeScript), Tailwind CSS, installable PWA (service worker), Zustand, React Hook Form + Zod, Recharts, Framer Motion, React Three Fiber (`three`, `@react-three/fiber`, `@react-three/drei`).
- **Local data (primary source of truth for the UI):** IndexedDB via Dexie.
- **Backend:** FastAPI (Python 3.11+), SQLAlchemy 2.x, Alembic, Pydantic v2.
- **Database:** Neon (PostgreSQL) for sync/ground store. Locally the same backend runs on SQLite (switch with `DATABASE_URL`).
- **Tests:** Vitest + Playwright (frontend), Pytest (backend).

## 2. Non-Negotiable Rules

1. **Offline-first.** Every screen works with zero internet. All reads/writes go to IndexedDB first. Network is optional background sync, never a dependency. Never block the UI on a network call.
2. **Manual input only.** Data comes from forms the astronaut fills in. No device/Bluetooth/OCR integration, no "simulate" or "autofill" buttons.
3. **No fake data.** No hardcoded, seeded, mocked, random or generated health data and no pre-created astronauts in app code. Fresh install = 0 astronauts, 0 logs, with proper empty states. Test fixtures only under `tests/` and `shared/`.
4. **Multi-astronaut.** Every record is scoped by `astronautId`. Every screen shows `Name · ID`. Astronaut sees only own data; commander/surgeon see all (read-only).
5. **Rule engine is deterministic and explainable** (no LLM at runtime). Every status shows rule id + value. Thresholds live in `config/thresholds.ts` (and `thresholds.json` on the server), never inside components.
6. **Do not change medical threshold values** or write medical advice on your own. Use what is in the spec. No drug names or doses anywhere. Ranges are defaults to be verified by the user.
7. **3D body is required** (React Three Fiber). Must work offline (bundled model, no CDN assets: do not use drei `<Environment preset>` or default `<Text>` fonts). 2D fallback only if WebGL is unavailable.
8. **Accessibility:** colour is never the only signal (colour + icon + text), touch targets >= 44px, respect `prefers-reduced-motion`, 3D body has a keyboard-accessible region list.
9. **Disclaimer** is shown at onboarding and on result screens. Red/critical always shows an escalation block.
10. No external CDNs, fonts, analytics or APIs at runtime.

## 3. Folder Structure

```text
ahm/
├─ CLAUDE.md
├─ docs/  SPEC.md  DECISIONS.md
├─ shared/  rule-test-vectors.json          # used by BOTH TS and Python tests
│           rule-engine-golden.json         # TS engine's full output per vector; Python must match exactly (generated)
├─ frontend/
│  ├─ app/ (app)/{page,checkin,body,trends,learn,reminders,rewards,environment,sync,settings,crew}
│  ├─ components/ status/ body3d/ crew/ checkin/ charts/ guidance/ game/ reminders/ sync/ common/
│  ├─ lib/ rules/ db/ sync/ notifications/ gamification/ time/ pwa/
│  ├─ config/ thresholds.ts hazards.ts bodyParts.ts symptoms.ts measurements.ts environments.ts learn.ts badges.ts
│  ├─ content/ learn/*.md risks.ts riskGuidance.ts sources.ts
│  ├─ worker/ index.js                     # extra service-worker code (notification click), bundled by next-pwa
│  ├─ public/ models/body.glb  draco/  icons/  manifest
│  ├─ scripts/ check-no-fake-data.mjs  body-model/   # body-model: one-off builder for body.glb (own package.json)
│  └─ tests/
└─ backend/
   ├─ app/ main.py deps.py core/ db/ schemas/ routers/ services/rule_engine/ tests/
   ├─ alembic.ini  alembic/ env.py versions/
   └─ requirements.txt
```

## 4. Commands

> Project root is `E:\ahm` (moved off `C:` during C0 — that drive was nearly out of space; see DECISIONS.md). The frontend dev/start server runs on port **3100**, not the Next.js default 3000 — this machine already has an unrelated server bound to 3000.

```bash
# Frontend (from E:\ahm\frontend)
npm run dev           # http://localhost:3100 (Turbopack; PWA disabled in dev)
npm run typecheck && npm run lint && npm test
npm run build         # next build --webpack (webpack required: see DECISIONS.md) -- generates public/sw.js
npm run start         # http://localhost:3100, production mode, PWA active
npm run test:e2e      # Playwright (Chromium only installed so far)
npm run format        # prettier --write .
# Rebuild the 3D body model (needs internet once; output: public/models/body.glb, about 665 KB):
(cd scripts/body-model && npm install && npm run build)
# After changing a threshold or a rule, regenerate the server mirror + golden file, then run pytest:
AHM_WRITE_PARITY=1 npx vitest run tests/rules/serverParity.test.ts

# Backend (from E:\ahm\backend)
python -m venv .venv && source .venv/Scripts/activate   # Windows Git Bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000    # http://127.0.0.1:8000/api/v1/health
alembic upgrade head                         # creates/updates the schema in DATABASE_URL (run once before first start)
pytest                                       # temp SQLite files under backend/.pytest_tmp, no network
# Env (backend/.env, see .env.example):
#      DATABASE_URL=sqlite+aiosqlite:///./ahm.db   (local/offline, default)
#      DATABASE_URL=postgresql+asyncpg://...        (Neon; paste the Neon string as given)
#      SECRET_KEY=...                               (must be changed from the default)
#      SYNC_KEY=...                                 (enables /sync; type the same key into each device's Sync screen)
```

## 5. Conventions

- TypeScript strict. Small, typed, pure modules. No `any` without a comment.
- Dates: always through `lib/time/missionDate.ts` (`getMissionDate()`); never `new Date().toISOString().slice(0,10)` in components.
- IDs: client-generated `crypto.randomUUID()`. Every write also enqueues an outbox row (from C2 onward the repository layer does this, components never write to Dexie directly).
- Status type: `"green" | "yellow" | "red" | "critical"`. Worst status wins.
- Validation: Zod on the client, Pydantic on the server, with the same ranges (HR 20 to 250, SpO2 50 to 100, temp 30 to 43, etc.).
- Every user-facing text is short, plain language, with units.
- Add unit tests with each module. Rule engine changes must keep `shared/rule-test-vectors.json` passing in both languages.
- Git: one commit per finished chunk: `C5: home dashboard`.

---

## 6. How to Work: Chunk Protocol

Work on **ONE chunk at a time**, in order. For the chunk you are given (or the first unchecked one below):

1. Read the chunk and **only** the SPEC sections it lists. Do not read or edit unrelated parts.
2. State a short plan (files to create/change). If something in the spec is ambiguous, choose the simplest option and record it in `docs/DECISIONS.md`.
3. Implement, with tests.
4. Run typecheck, lint and tests. Fix failures. Actually run the app if the chunk has UI, and describe what I should click to verify.
5. Tick the checkbox in Section 7 and update this file's commands if they changed.
6. Summarize: what works, what is stubbed, how to test. **Stop. Do not start the next chunk.**

If a chunk is too big for one session, split it yourself into C#a / C#b, add both to the list, and finish the first part only.

---

## 7. Chunks (checklist)

> **MVP cut line:** C0 to C8, basic C9, basic C11. Backend and sync (C12 to C14) are enhancements. The product must be fully valid without them.

### [x] C0: Project setup
- **Read:** SPEC 0, 5, 8.1, 8.2
- **Build:** Next.js + Tailwind + TS + PWA skeleton (manifest, service worker precaching app shell, local fonts); FastAPI skeleton with `/api/v1/health`; ESLint/Prettier/Vitest/Playwright/Pytest configs; folder structure above; `docs/DECISIONS.md`; fill in the commands in Section 4.
- **Done when:** both apps start; `npm test` and `pytest` run (even with 1 trivial test); the PWA is installable and the shell loads with the network off.

### [x] C1: Rule engine (TypeScript) + thresholds
- **Read:** SPEC 2.1, 3, 4 (all), Appendix B
- **Build:** `config/thresholds.ts`, `config/symptoms.ts`, `lib/rules/{bands,combos,trends,guidance,engine}.ts`, types (`EvaluationResult`), `RULES_VERSION`; `shared/rule-test-vectors.json` with boundary cases (HR 100/101, SpO2 92/91, BP two-part worst-of, every combination rule, every trend rule, escalation levels).
- **Done when:** Vitest passes all vectors; thresholds can be edited in config and results change; no component imports are needed to run the engine (pure functions).
- **Note:** the vectors are test data only. They must not be imported by app code.
- **Also:** include the rules `CMB-HYPOX-01`, `CMB-DCS-01`, `CMB-IMM-01`, `TRD-TEAM-01`; every indicator config has `source` and `verified` fields; create `content/risks.ts` from SPEC 2.1.

### [x] C2: Local database + crew registry (multi-astronaut)
- **Read:** SPEC 1.1, 5.1 (items 7 to 9), 6.1, 8.3 screen 0, 13, 16
- **Build:** Dexie schema + repository layer with outbox writes; `Astronaut` registry; **Register astronaut** form (full name, unique crew ID, role, environment, mission dates, PIN with PBKDF2 hash via WebCrypto); crew picker cards; PIN pad unlock; active-astronaut store; `ActiveAstronautBar` on every screen; auto-lock; disclaimer/consent screen; app shell with bottom navigation; empty states.
- **Done when:** fresh install shows "No astronauts registered yet"; I can register 3 astronauts with unique IDs (duplicate ID rejected), switch between them with PINs, and the bar shows the right `Name · ID`; data survives reload; nothing is pre-created.

### [x] C3: Check-in part 1: measurement entry
- **Read:** SPEC 3.1, 3.3, 8.3 screen 2 (step 3), 10, 17 (items 1, 4)
- **Build:** `config/measurements.ts` (one config drives form, validation, how-to sheet); Zod schemas; measurement cards (HR, BP, glucose, temperature, SpO2, sleep hours/quality, exercise, hydration, weight, radiation optional); "(?) How to measure" bottom sheets; numeric keypad inputs with steppers; skip allowed; **late-entry date picker (last 14 days)** setting `is_backdated`; optional **team relations (1 to 5)** slider and a **"Spacewalk (EVA) today?"** toggle; borderline value prompt ("rest and measure again", store both readings); save to Dexie for the active astronaut.
- **Done when:** I can enter values for the active astronaut, impossible values are rejected with clear messages, saved logs appear in Dexie scoped to that astronaut, and one log per astronaut per date is enforced (update instead of duplicate).

### [x] C4: Check-in part 2: wizard, symptoms, result
- **Read:** SPEC 4.3, 4.5, 8.3 screen 2 (all steps), 10, 15
- **Build:** stepper wizard (yesterday recap with advice follow-up Yes/Partly/No -> symptoms with severity -> measurements (C3) -> mood/stress incl. the safety question -> review -> save); run the rule engine; store the evaluation with `rulesVersion`; animated result screen (status, "why" lines, actions, escalation); followups saved; transactional save (log + symptoms + evaluation + followups + outbox).
- **Done when:** a full check-in works offline end-to-end; chest pain, CO2 combination and mood safety scenarios (typed manually) show the right escalation; "yesterday" step shows nothing fake when there is no previous log.

### [x] C5: Home dashboard
- **Read:** SPEC 8.3 screen 1, 8.4, 16 (empty states)
- **Build:** overall status ring (colour + icon + label), indicator cards with sparkline, today's actions (checkable), escalation card, mission day, offline badge, "Start/Update check-in" button, completeness score; all empty states.
- **Done when:** values and statuses come only from the active astronaut's saved data; switching astronaut changes everything; fresh astronaut shows empty state.

### [x] C6: Trends and charts
- **Read:** SPEC 4.4 (trend rules), 8.3 screen 4, 17 (item 5), 16 (minimum data)
- **Build:** range tabs (7/14/30/mission); charts per indicator with threshold bands, personal baseline (after 14 logs), symptom-day markers; BP sys/dia, sleep + mood overlay, exercise stacked bars, radiation vs budget; trend alerts list; "need N more days" states.
- **Done when:** charts reflect only real saved logs of the active astronaut and update right after saving a check-in.

### [x] C7: 3D body, part 1 (interactive core)
- **Read:** SPEC 8.1 (3D), 8.3 screen 3, 2
- **Build:** `Body3D` (client-only), anatomical body from `public/models/body.glb` with one `OrganMesh` per organ (raycast selection on the real geometry, hover halo + tooltip, status-coloured glow with pulse for critical), `RegionHotspot` markers for regions without an organ mesh, `CameraRig` fly-to + reset, orbit/zoom limits, `SceneFx` (orbital rings, scan sweep, floor), `RegionList` accessible alternative, `Body2DFallback` when WebGL is unavailable, neutral grey empty state, performance settings (`dpr`, `frameloop="demand"`), reduced-motion safe. `ProceduralBodyModel` remains only as the fallback if the GLB cannot load.
- **Done when:** body rotates/zooms, every organ is clickable, only one is selected at a time, colours come from the active astronaut's latest evaluation, works with the network off, no CDN requests in the network tab.
- **Replaced 2026-11-15** (was: primitive capsule body with sphere hotspots). See DECISIONS.md.

### [x] C8: 3D body, part 2 (content and model)
- **Read:** SPEC 8.3 screen 3 (panel + mapping table), 2, 3.1
- **Build:** `config/bodyParts.ts` (function text, spaceflight effect text, hazards, indicators, symptoms and **organ meshes** per region); `BodyPartPanel` + `OrganHealthIndicators` (function, hazard badges, latest real values with rule id and trend, recent symptoms, actions, Learn link, sources); `public/models/body.glb` built from BodyParts3D by `scripts/body-model/build.mjs` with named meshes (`organ_*`, `body_skin`).
- **Done when:** every organ opens its region's complete panel; swapping in another GLB requires no changes outside `BodyModel.tsx` and `bodyParts.ts`.
- **Model:** BodyParts3D 3.0, CC BY-SA 2.1 Japan; credit and modifications are in README. Do not replace it without updating that table.
- **Replaced 2026-11-15.** See DECISIONS.md.

### [x] C9: Reminders and notifications
- **Read:** SPEC 9
- **Build:** reminders per astronaut (CRUD), default set created from the astronaut's own onboarding choices (not hardcoded health data), client scheduler (timeouts + interval check), Notification API via service worker with permission pre-prompt, in-app banner fallback, missed-reminder logic, `TRD-MISS-01`.
- **Done when:** a reminder set 2 minutes ahead fires offline (notification or in-app banner); disabled reminders do not fire.

### [x] C10: Learn pages and environments
- **Read:** SPEC 2, 2.1, 3.1, 4.4 (modifiers), 12, Appendix E
- **Build:** `/learn/[indicator]` pages (what, why in space with hazard badges, how to measure steps, ranges, when to worry) from `content/learn/*.md`, plus a Risks page listing the NASA HRP risks from SPEC 2.1 with short **paraphrased** explanations (never copy NASA text) and a **Sources** footer on every Learn page using the links in SPEC Appendix E; environment screen (spacecraft, station, rover, moon base, Mars base) with tip packs and rule modifiers wired into the engine.
- **Done when:** changing an astronaut's environment changes the emphasis/tips and the mission-phase modifiers (first 7 days softening only yellow, never red/critical).

### [x] C11: Gamification
- **Read:** SPEC 11
- **Build:** points, streaks (with freeze token), levels, badges, weekly challenge, rewards screen, per astronaut; guardrails (no points for symptom reporting, no shaming on red days, no rewards for unsafe behaviour).
- **Done when:** points/streaks come only from real saved check-ins and completed actions, and are separate per astronaut.

### [x] C12: Backend core (FastAPI)
- **Read:** SPEC 6.2, 7.1 to 7.3, 13, Appendix A
- **Build:** SQLAlchemy models + Alembic migrations (SQLite and Postgres via `DATABASE_URL`), Pydantic schemas with range validation, JWT auth with `crew_code` + PIN and roles, astronauts/logs/symptoms/reminders/followups/gamification endpoints with access rules, CORS for LAN origins.
- **Done when:** Pytest passes for CRUD and role access (astronaut cannot read another's data; commander/surgeon read-only); runs on SQLite with no internet; same code connects to Neon by env var. No seed data in migrations.

### [x] C13: Python rule engine + `/evaluate`
- **Read:** SPEC 4 (all), 14
- **Build:** Python port in `app/services/rule_engine/` using `thresholds.json`; `POST /evaluate`; store `rules_version`.
- **Done when:** the Python engine passes **the same** `shared/rule-test-vectors.json` as the TypeScript engine.

### [x] C14: Sync (outbox, push/pull)
- **Read:** SPEC 5.1, 7.4, 17 (items 2, 3, 8), Appendix C, D
- **Build:** reachability check (`/health` with timeout, not just `navigator.onLine`), outbox drain in batches with exponential backoff, `/sync/push` and `/sync/pull?since=`, idempotent upserts by UUID, soft deletes, version conflicts (never lose data), crew registry sync, sync screen (last synced, pending count, Sync now, export/import JSON/CSV).
- **Done when:** data entered offline reaches the server exactly once after reconnecting, a second device sees the same astronauts and logs, conflicts keep both versions, and tests cover push/pull/conflict/retry.

### [x] C15: Crew overview (commander/surgeon)
- **Read:** SPEC 8.3 screen 0 and 10, 13
- **Build:** crew overview table/grid by name and crew ID (last check-in, overall status, flags, sparklines), search/sort, read-only astronaut drill-down using the existing dashboard/trends/body components with `readOnly`, surgeon notes, audit log of who viewed whom.
- **Done when:** commander/surgeon see every astronaut; astronaut role cannot open the overview; nothing is editable in read-only mode.

### [ ] C16: Hardening and delivery
- **Read:** SPEC 14, 16, 17, 19, 20
- **Build:** CI check that fails on `Math.random()`/`faker`/literal health data outside `tests/` and `config/`; empty-state audit of every screen; accessibility pass (axe, keyboard, reduced motion); Playwright offline test (go offline, register, check-in, reload, data persists, go online, outbox drains); Lighthouse PWA/a11y; README (run in LOCAL_ONLY, HABITAT_LAN, GROUND_SYNC; References from SPEC Appendix E, third-party assets and licences table, NASA non-endorsement note, honest limitations); pitch notes.
- **Done when:** every item in SPEC section 19 is ticked or has a documented reason.

---

## 8. Decisions and Open Questions

Record every assumption in `docs/DECISIONS.md` (date, decision, reason). Known open items to confirm with me before changing: threshold values, 3D model choice, PIN/security level, whether the surgeon role is needed for the demo.
