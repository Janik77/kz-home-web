# Durable waits: bounded Web stage

This branch builds on Web schedule PR30 (96c953f40f3a8eff464e2b57b5e7817456569206).
Candidate Core PR55: af6dcadddcfc2d5bee97da4386021495a54d1f9a, schema 0016_durable_waits. This is not a release-ready claim; full exact-pair CI and independent review remain required.

## Scope
Create a new scene containing confirmed relay action → durable wait → relay action. Automation action editor uses the same ordered component. Existing saved scenes retain name-only CAS editing; full action editing is a later CRUD stage. Legacy delay definitions remain read-only, never silently converted.

Waits are server-owned, begin only after ACK plus matching state, and survive page closure. UI reads progress but never implements the timer or sends a successor action. Explicit cancellation is available only for persisted waiting checkpoints and only with appropriate permissions. It cancels remaining steps, not already accepted commands. Conflict/network uncertainty causes a read, never a cancellation retry.

Limits: 16 total steps, integer wait 1–3600 seconds, combined wait ≤3600 seconds, no leading/trailing/consecutive waits. Immutable plan deadline and 30-second resume grace are enforced by Core. No overdue catchup.

## Checks
```
npm ci
npm run typecheck
npm run lint
npx vitest run
npm run build
npx playwright test --config playwright.durable.config.ts
```
Contract fixtures cover both themes at 1440/390, save/readback, exact ordered payload, axe and horizontal overflow. They are not evidence of real Core or physical devices.

On the existing disposable Linux CI runner only:
```
LIVE_DURABLE_ONLY=1 LIVE_CORE_SOURCE=/path/to/exact/core python -B e2e/automation-live-runner.py
```
The existing isolated fixture provides PostgreSQL, MQTT TLS and software relay. Browser creates two scenes: successful A→wait→B, then A→wait→cancel. The strict existing MQTT/SQL verifier requires exactly three applied ACK+state-correlated commands and no cancelled successor. Video/screenshots/evidence upload is configured, not claimed complete until CI succeeds.

No local containers, persistent profiles, production, hardware, main merge, daemon restart or binding bypass are required or performed. Do not run disposal/cleanup commands against the owner's local stack. Stand upgrade is a separately reviewed integration task.
