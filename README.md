# Astronaut Health Monitor (AHM)

An offline-first, multi-astronaut health self-assessment app for long space
missions. Each crew member types in their own daily check-in (vital signs,
sleep, exercise, symptoms, mood). A deterministic, explainable rule engine
turns that into a green / yellow / red / critical status with the rule id and
value behind every result, simple next steps, and an escalation block for red
and critical. The app also has trends, an interactive 3D body, reminders,
gamification, and a read-only crew overview for the commander and flight
surgeon.

Built for the NASA Space Apps Challenge using public NASA Human Research
Program (HRP) resources. **This app is not endorsed by NASA** (see
[NASA non-endorsement](#nasa-non-endorsement)).

> **Not a medical device.** This tool supports self-assessment and does not
> replace a flight surgeon or medical care. Ranges are configurable defaults.
> If you feel unwell or a result is red or critical, follow your mission
> medical procedures and contact the flight surgeon.

---

## Contents

- [What is in the repo](#what-is-in-the-repo)
- [Requirements](#requirements)
- [Run it: three deployment modes](#run-it-three-deployment-modes)
  - [LOCAL_ONLY](#1-local_only-no-server-at-all)
  - [HABITAT_LAN](#2-habitat_lan-fastapi--sqlite-on-the-local-network)
  - [GROUND_SYNC](#3-ground_sync-fastapi--neon-postgres-in-the-cloud)
- [Tests and quality checks](#tests-and-quality-checks)
- [Acceptance criteria status (SPEC §19)](#acceptance-criteria-status-spec-19)
- [Honest limitations](#honest-limitations)
- [References](#references)
- [Third-party assets and licences](#third-party-assets-and-licences)
- [NASA non-endorsement](#nasa-non-endorsement)

---

## What is in the repo

| Path | What |
|---|---|
| `frontend/` | Next.js (App Router, TypeScript) PWA: Tailwind, Zustand, React Hook Form + Zod, Recharts, Framer Motion, React Three Fiber. All data lives in IndexedDB (Dexie) first. |
| `frontend/config/` | Thresholds (`thresholds.ts`), symptoms, measurements, body regions, environments, badges. Every threshold has `source` and `verified` fields. |
| `frontend/lib/rules/` | The TypeScript rule engine (pure functions). |
| `backend/` | FastAPI + SQLAlchemy 2 + Alembic + Pydantic v2: auth, data endpoints, `/evaluate` (Python port of the rule engine), `/sync/push` and `/sync/pull`. |
| `shared/` | `rule-test-vectors.json` (test data run by **both** engines) and `rule-engine-golden.json` (TS engine output the Python engine must match exactly). |
| `docs/SPEC.md` | Full specification (source of truth). |
| `docs/DECISIONS.md` | Every assumption and design choice, dated. |
| `docs/PITCH.md` | Demo script and pitch notes. |

There is no demo data anywhere. A fresh install has **0 astronauts and 0
logs**; every value you see was typed into a form.

## Requirements

- Node.js 22 or newer (tested with 24), npm.
- Python 3.11 or newer (backend only; not needed for LOCAL_ONLY).
- A Chromium-based browser for the installable PWA (Chrome, Edge). Firefox and
  Safari run the app but install/notification support differs.

The frontend dev and production servers run on port **3100** (not the Next.js
default 3000).

---

## Run it: three deployment modes

The three modes from SPEC §5.2. The frontend is the same build in every mode;
the difference is only whether, and where, a sync server is connected.

| Mode | Backend | Database | Use |
|---|---|---|---|
| `LOCAL_ONLY` | none | IndexedDB in the browser | Minimum setup, demo without any server |
| `HABITAT_LAN` | FastAPI on a machine in the habitat | SQLite file | Several devices in the habitat, no internet |
| `GROUND_SYNC` | FastAPI in the cloud | Neon Postgres | Ground / flight-surgeon view, history backup |

### 1. LOCAL_ONLY (no server at all)

```bash
cd frontend
npm ci
npm run build      # production build; generates the service worker (public/sw.js)
npm run start      # http://localhost:3100
```

1. Open http://localhost:3100 in Chrome or Edge once while the server is
   running. The service worker caches the app.
2. Optional: install it (address-bar install icon, or browser menu →
   *Install app*).
3. From now on it works with the network off. Read and accept the consent
   screen, register an astronaut (name, crew ID, role, environment, mission
   dates, PIN), unlock with the PIN and start a check-in.

`npm run dev` (Turbopack, http://localhost:3100) is for development only: the
service worker is switched off there, so it does **not** work offline.

To register several astronauts, use *Switch astronaut* in the top bar, then
*+ Register another astronaut*. Data is stored per astronaut and each one
unlocks with their own PIN.

### 2. HABITAT_LAN (FastAPI + SQLite on the local network)

One machine in the habitat runs the backend. Every tablet runs the PWA and
syncs with it over the LAN. No internet is needed.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows Git Bash: source .venv/Scripts/activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `backend/.env`:

```ini
MODE=HABITAT_LAN
DATABASE_URL=sqlite+aiosqlite:///./ahm.db
SECRET_KEY=<a long random string>      # signs login tokens; must not stay "change-me"
SYNC_KEY=<another long random string>  # typed into each device's Sync screen
# Browsers on private LAN addresses (192.168.x.x, 10.x.x.x, 172.16-31.x.x) and
# localhost are allowed by default. Add a hosted frontend origin here if needed:
CORS_ORIGINS=http://localhost:3100
```

Then:

```bash
alembic upgrade head                                   # creates the SQLite schema (no data)
uvicorn app.main:app --host 0.0.0.0 --port 8000        # reachable from the LAN
# check: http://<this-machine-ip>:8000/api/v1/health
```

Serve the frontend from the same machine (`npm run build && npm run start`) or
from each device's own install. On each device: **More → Sync and data →
Server address** `http://<server-ip>:8000`, **Sync key** = the `SYNC_KEY`
value, **Save**. A new device can also load the crew before anyone has
unlocked, from the Crew screen: *Load crew from a server*.

Sync runs on app start, when the link comes back, when the tab becomes
visible, and on **Sync now**. It never blocks the UI. Conflicts never lose
data: the version not in use is kept and shown under *Kept copies*.

> Security on a LAN: there is no TLS in this setup. Use an isolated network,
> or put the API behind a reverse proxy with a local TLS certificate
> (SPEC §13). The sync key gives read/write access to every astronaut's
> records.

### 3. GROUND_SYNC (FastAPI + Neon Postgres in the cloud)

Same backend, same code. Only `DATABASE_URL` changes.

1. Create a Neon project and copy its connection string.
2. In `backend/.env` (or the host's environment variables):

   ```ini
   MODE=GROUND_SYNC
   DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@HOST/DB?sslmode=require
   SECRET_KEY=<long random string>
   SYNC_KEY=<long random string>
   CORS_ORIGINS=https://<where-the-frontend-is-hosted>
   ```

   Paste the Neon string as given. `sslmode=require` is translated for the
   asyncpg driver automatically.
3. `alembic upgrade head` once, then run
   `uvicorn app.main:app --host 0.0.0.0 --port $PORT` on any Python host
   behind HTTPS.
4. On each device: More → Sync and data → server address `https://…`, sync
   key, Save.

The devices still work fully offline. GROUND_SYNC only adds a copy on the
ground when a link exists.

### Backend API, briefly

All under `/api/v1`: `GET /health`; `POST /auth/login` (crew ID + PIN → JWT);
astronauts, logs, symptoms, reminders, followups, gamification; `POST /evaluate`;
`POST /sync/push`, `GET /sync/pull?since=`. Interactive docs at
`http://<server>:8000/docs` while the server runs. Roles: an astronaut reads and
writes only their own data; commander / surgeon / admin can read everyone
(read-only for other astronauts' health data); reads of another astronaut's data
are written to the audit log.

---

## Tests and quality checks

```bash
# from frontend/
npm run check:no-fake-data   # fails on Math.random()/faker/literal health data in app code
npm run typecheck            # (first run on a fresh clone: npx next typegen)
npm run lint
npm test                     # Vitest: rule engine vectors, repositories, sync, crew, CI check
npm run test:e2e             # Playwright on the dev server: smoke, empty states, axe, keyboard, reduced motion
npm run build && npm run test:e2e:offline
                             # Playwright on the production build + a throwaway backend:
                             # offline register → check-in → reload → online → outbox drains once
# after changing a threshold or rule: regenerate the server mirror + golden file
AHM_WRITE_PARITY=1 npx vitest run tests/rules/serverParity.test.ts

# from backend/
pytest                       # temp SQLite under backend/.pytest_tmp, no network
```

The offline test starts the backend itself (fresh SQLite file, test-only sync
key). It needs a Python that has `backend/requirements.txt` installed. Set
`AHM_PYTHON` to it if `python3` / `python` is not that interpreter, e.g.
`AHM_PYTHON=backend/.venv/bin/python`.

There is no hosted CI. The checks run locally: the no-fake-data check runs
automatically before every `npm run build` (`prebuild`), so a build fails on a
finding, and again inside `npm test`.

**No-fake-data check** (`frontend/scripts/check-no-fake-data.mjs`) scans
`frontend/{app,components,lib,content,worker}` and `backend/{app,alembic}`,
skipping `tests/` and `config/`. It fails on `Math.random()`, Python `random`,
`faker`, a health field assigned a number literal (`heart_rate: 72`), a number
array named after a health measure, and any literal array of 6 or more
numbers. A reviewed exception needs a `no-fake-data-ok: <reason>` comment and is
printed on every run. There are currently two exceptions, both weekday lists
`[1..7]` in the backend.

### Results of the C16 pass

RESULTS_PLACEHOLDER

---

## Acceptance criteria status (SPEC §19)

CRITERIA_PLACEHOLDER

---

## Honest limitations

- **Thresholds are configurable defaults, not validated space-medicine
  limits.** They come from general adult clinical references (each indicator's
  `source` in `frontend/config/thresholds.ts`) and are marked `verified: false`
  until a qualified person has checked them. They must be reviewed by a flight
  surgeon before any real use.
- **Not a medical device.** No diagnosis, no drug names or doses. Guidance is
  limited to self-care steps and "contact the flight surgeon".
- **Manual input only.** No wearables, Bluetooth or OCR. Values are only as
  good as what is typed in.
- **Local data is not encrypted.** Each astronaut has a PIN (PBKDF2-hashed),
  and roles are enforced in the app's data layer. But anyone with the device
  and browser developer tools can read IndexedDB. PIN-derived encryption of
  local data (SPEC §13) is a later enhancement.
- **PIN hashes are synced** so a second device can unlock the same astronaut.
  A 4 to 6 digit PIN hash is weak if intercepted, so use TLS or an isolated
  network.
- **Sync uses one shared device key**, not per-astronaut tokens. Anyone with
  the key can read and write every record on the server.
- **3D body: organs are separate meshes, but data is per region.** The
  model has 16 organ meshes; several organs share one region panel (liver,
  stomach, pancreas and both intestines open "Gut"; spleen and thymus open
  "Immune system"). There is no liver-, stomach- or spleen-specific
  measurement in the app, so none is shown. Mind, muscles and skin have no
  organ mesh and appear as markers. The model is one adult male body
  (the only one BodyParts3D release 3.0 provides) and is simplified for
  size, so fine anatomical detail is reduced; it is an illustration, not
  a diagnostic image.
- **Reminders** fire from the open app (or its service worker while the
  browser keeps it alive). There is no push server, so a fully closed browser
  cannot fire a notification. The in-app banner catches up when the app
  opens.
- **Crew overview on one device reads that device's data.** Astronauts from
  other devices appear only after a sync.
- **Surgeon notes** are not shown to the astronaut they are about (open
  question, see `docs/DECISIONS.md`).
- **Browser support:** developed and tested in Chromium. Playwright runs only
  Chromium. Safari's PWA and notification behaviour has not been tested.
- **Performance targets** in SPEC §14 (first load < 2 s on a mid-range
  tablet, charts < 100 ms for 180 days) have not been measured on a real
  tablet.
- **Next steps:** wearable integration, flight-surgeon-validated ranges,
  on-device anomaly detection, encrypted local storage, per-device sync
  credentials.

---

## References

From SPEC Appendix E. Learn pages, risk cards and body-region panels in the
app list the exact links each one uses. All app text is our own paraphrase;
no NASA text is copied.

### NASA Human Research Program (HRP)

- Five Hazards of Human Spaceflight: https://www.nasa.gov/hrp/hazards/
  - Space radiation: https://www.nasa.gov/hrp/hazard-space-radiation/
  - Isolation and confinement: https://www.nasa.gov/hrp/hazard-isolation-and-confinement/
  - Distance from Earth: https://www.nasa.gov/hrp/hazard-distance-from-earth/
  - Gravity fields: https://www.nasa.gov/hrp/hazard-gravity-fields/
  - Hostile/closed environments: https://www.nasa.gov/hrp/hazard-hostile-closed-environments/
- Risks of Human Spaceflight (overview): https://www.nasa.gov/hrp/risks/
- Ongoing HRP research in space: https://www.nasa.gov/hrp/ongoing-hrp-research/

### Per-risk reference pages

| # | Risk | Link |
|---|---|---|
| 1 | Altered immune system responses | https://www.nasa.gov/reference/risk-of-altered-immune-system-responses/ |
| 2 | Altered sensorimotor and vestibular function | https://www.nasa.gov/reference/risk-of-altered-sensorimotor-and-vestibular-function/ |
| 3 | Cardiovascular adaptations | https://www.nasa.gov/reference/risk-of-cardiovascular-adaptations/ |
| 4 | Decompression sickness | https://www.nasa.gov/reference/risk-of-decompression-sickness/ |
| 5 | Host-microorganism interactions | https://www.nasa.gov/reference/risk-of-host-microorganism-interactions/ |
| 6 | Hypoxia | https://www.nasa.gov/reference/risk-of-hypoxia/ |
| 7 | Inadequate food and nutrition | https://www.nasa.gov/reference/risk-of-inadequate-food-and-nutrition/ |
| 8 | Injury and compromised performance from EVA | https://www.nasa.gov/reference/risk-of-injury-and-compromised-performance-from-extravehicular-activity-eva/ |
| 9 | Reduced cardiorespiratory and musculoskeletal fitness | https://www.nasa.gov/reference/risk-of-reduced-cardiorespiratory-and-musculoskeletal-fitness/ |
| 10 | Spaceflight-associated neuro-ocular syndrome (SANS) | https://www.nasa.gov/reference/risk-of-spaceflight-associated-neuro-ocular-syndrome-sans/ |
| 11 | Spaceflight-induced bone changes | https://www.nasa.gov/reference/risk-of-spaceflight-induced-bone-changes/ |
| 12 | Behavioral conditions and psychiatric disorders | https://www.nasa.gov/reference/risk-of-behavioral-conditions-and-psychiatric-disorders/ |
| 13 | Inadequate teamwork | https://www.nasa.gov/reference/risk-of-inadequate-teamwork/ |
| 14 | Inadequate sleep and irregular schedules | https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/ |
| 15 | Injury from dynamic loads | https://www.nasa.gov/reference/risk-of-injury-from-dynamic-loads/ |
| 16 | Radiation-induced cancers | https://www.nasa.gov/reference/risk-of-radiation-induced-cancers/ |
| 17 | Inadequate systems operations support | https://www.nasa.gov/reference/risk-of-inadequate-systems-operations-support/ |

### Canadian Space Agency (CSA)

- Monitoring Radiation for Astronaut Health: https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp
- Why Do We Conduct Science Experiments in Space?: https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp

### Vital-sign default ranges

NASA HRP pages describe risks and countermeasures, not numeric limits. The
default ranges for heart rate, blood pressure, glucose, temperature, SpO2 and
sleep come from general adult clinical references, cited per indicator in
`frontend/config/thresholds.ts` (`source`). All are `verified: false`.

---

## Third-party assets and licences

No third-party fonts, images, analytics or CDN resources are loaded at
runtime. Everything, including the 3D body model and its decoder, ships
with the app and is served from the app's own origin.

### Assets

| Asset | Author / source | Licence | Used for | Modifications |
|---|---|---|---|---|
| 3D human body with organs (`frontend/public/models/body.glb`) | [BodyParts3D](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html), release 3.0 (2011-09-15), © The Database Center for Life Science. Fetched as STL from the mirror [Kevin-Mattheus-Moerman/BodyParts3D](https://github.com/Kevin-Mattheus-Moerman/BodyParts3D). Reference: Mitsuhashi N. et al., *BodyParts3D: 3D structure database for anatomical concepts*, Nucleic Acids Res. 2009, [doi:10.1093/nar/gkn613](https://doi.org/10.1093/nar/gkn613) | [CC BY-SA 2.1 Japan](https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en). Required credit: "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution-Share Alike 2.1 Japan". **Share-alike:** `body.glb` is a derivative and is offered under the same licence; the app's code is not affected. | Interactive 3D body: skin shell plus 16 separately selectable organ meshes | Built by `frontend/scripts/body-model/build.mjs`: 17 anatomical concepts (FMA ids listed in that script) merged from their source parts, converted from millimetres/Z-up to metres/Y-up, simplified from about 4.4 million to about 130,000 triangles, normals recomputed, Draco-compressed, meshes renamed `body_skin` / `organ_*`. No shapes were edited by hand. |
| Fallback 3D body | Built in this project from three.js primitives (`frontend/components/body3d/ProceduralBodyModel.tsx`) | Project's own code | Shown only if `body.glb` cannot be loaded | n/a |
| Draco geometry decoder (`frontend/public/draco/`) | Google Draco, as shipped in `three/examples/jsm/libs/draco` | Apache-2.0 | Decoding `body.glb` (bundled so nothing comes from a CDN) | None |
| App icon (`frontend/public/icons/icon.svg`) | This project | Project's own | PWA icon | n/a |
| Icons in the UI | [Lucide](https://lucide.dev) via `lucide-react` | ISC | Status icons, navigation, buttons | None |
| Fonts | The device's system font stack (`ui-sans-serif, system-ui, …`) | n/a | All text | No web fonts are bundled or downloaded |

### Frontend libraries (runtime)

| Library | Version | Licence |
|---|---|---|
| Next.js | 16.4.6 | MIT |
| React, React DOM | 19.3.0 | MIT |
| @ducanh2912/next-pwa (Workbox) | 10.2.9 | MIT |
| Tailwind CSS | 4.3.3 | MIT |
| Zustand | 5.1.0 | MIT |
| React Hook Form | 7.92.0 | MIT |
| @hookform/resolvers | 7.0.6 | MIT |
| Zod | 4.6.7 | MIT |
| Recharts | 3.10.1 | MIT |
| Framer Motion | 14.14.0 | MIT |
| three.js | 0.187.0 | MIT |
| @react-three/fiber | 9.8.2 | MIT |
| @react-three/drei | 10.7.9 | MIT |
| Dexie, dexie-react-hooks | 4.4.7 / 4.4.0 | Apache-2.0 |
| lucide-react | 1.72.0 | ISC |

Development only: TypeScript, ESLint, Prettier, Vitest (MIT), Playwright
(Apache-2.0), @axe-core/playwright (MPL-2.0), fake-indexeddb (Apache-2.0).

### Backend libraries

| Library | Licence |
|---|---|
| FastAPI | MIT |
| Uvicorn | BSD-3-Clause |
| Pydantic, pydantic-settings | MIT |
| SQLAlchemy | MIT |
| Alembic | MIT |
| aiosqlite | MIT |
| asyncpg | Apache-2.0 |
| PyJWT | MIT |
| httpx, pytest (tests) | BSD-3-Clause / MIT |

### Content

Learn pages, risk explanations and body-region texts are original paraphrases
written for this project. They link to their sources and do not reproduce
NASA or CSA text. No NASA logo, insignia or other branding is used.

---

## NASA non-endorsement

This project was built for the NASA Space Apps Challenge using public NASA
Human Research Program resources. NASA does not endorse any non-U.S.
Government entity and is not responsible for information on non-U.S.
Government websites. This app is not an official NASA product, has no official
status, and does not imply endorsement by NASA or the Canadian Space Agency.
Participants must comply with the data-use terms of every non-NASA website
used; the licences of every third-party asset are listed
[above](#third-party-assets-and-licences).
