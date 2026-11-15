# Pitch notes and demo script

Based on SPEC §20. Nothing in the demo is injected by code. Every value is
typed through the normal forms (SPEC §16 item 5).

## Story

"Earth is unreachable, so the crew's phone-sized doctor must work with no
internet."

## What makes it different

- **Offline-first PWA.** Every screen works with the network off. Data lives on
  the device first, and sync is a background extra.
- **Explainable rule engine.** No AI at runtime. Every status shows the rule id
  and the value that triggered it, linked to NASA's five hazards and the HRP
  risks.
- **Interactive 3D body.** Regions glow with the astronaut's latest real
  status. There is a keyboard-accessible region list and a 2D fallback.
- **Trend-aware guidance.** Personal baselines start after 14 logs. Until a rule
  has enough data, the app says exactly how many more days it needs.
- **Escalation to the flight surgeon.** Every red or critical result shows an
  escalation block.
- **Gamification for adherence, not competition.** No points for reporting
  symptoms, and no shaming on red days.
- **Five environments** (spacecraft, station, rover, Moon base, Mars base),
  each with its own tips and emphasis.
- **Crew overview** for the commander and surgeon: read-only, with an access
  log and surgeon notes.

## Before the demo

1. `npm run build && npm run start` in `frontend/`. Optionally start the
   backend for the sync step (README, HABITAT_LAN).
2. Open http://localhost:3100 once online so the service worker caches the
   app, then install it.
3. Register a commander and two astronauts. For astronaut A, enter earlier
   check-ins with the **late-entry date picker** (step 1 of the check-in) so the
   trends have data. Use real values typed by hand.

## Demo order (about 5 minutes)

1. **Crew screen:** two or three astronauts by name and crew ID. Tap A and enter
   the PIN.
2. **Check-in:** astronaut A types today's values. Show the result: status,
   why (rule id + value), actions. For the escalation demo, type a value or
   symptom that the spec marks red (for example chest pain) and show the
   escalation block.
3. **3D body:** rotate, zoom, tap the heart region. The panel shows function,
   hazards, latest real values and actions.
4. **Trends:** threshold bands, symptom-day markers, "need N more days" where
   data is short.
5. **Switch astronaut → B:** separate data and an empty state if B has not
   checked in.
6. **Commander → More → Crew overview:** everyone by name and ID, sorted worst
   first. Open A read-only (nothing editable). The access log records it.
7. **Offline:** turn Wi-Fi off live, add a log, reload. Everything is still
   there. Turn Wi-Fi on and watch *Sync and data* go to "Nothing to sync".

## Honest limits slide

- Thresholds are configurable defaults, **not validated medical limits**
  (`verified: false` until a flight surgeon checks them).
- **Not a medical device.** No diagnosis, no drug names or doses.
- Local data is PIN-protected per astronaut but not encrypted at rest yet.
- The 3D body is procedural. An anatomical CC0/CC-BY model can be dropped in
  without code changes outside `BodyModel.tsx` and `bodyParts.ts`.
- Next steps: wearable integration, flight-surgeon-validated ranges, on-device
  ML for anomaly detection, encrypted local storage.

## Wording

"Built for the NASA Space Apps Challenge using public NASA HRP resources."
Never imply NASA endorsement or official status, and don't use NASA logos or
insignia.
