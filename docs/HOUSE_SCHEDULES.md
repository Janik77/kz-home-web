# House schedules (draft substage)

Base Web #29 `74b7238f10a9e56cbc600f9cac21b29a5c15b46e`. Initial Core schedule candidate #53 `d606c39a529a7e0afc92eae1f588cca95bbd7863` (not final acceptance yet).

- Existing automation editor: device/numeric triggers preserved; schedule trigger `{type:"schedule",time:"HH:MM",weekdays:[0..6]}`. Monday0, sorted unique nonempty.
- Explicit house IANA timezone in Settings. No browser/server default, no rule-specific timezone. PATCH uses `expected_timezone_revision`, verifies exact +1 and GET readback; conflict preserves original draft and base revision.
- Disabled schedule drafts may be saved without timezone. Enabling requires selected, readable timezone and Core authorization. Saving/enabling does not execute current minute.
- Missed offline times are not replayed; DST gap skipped, fold first occurrence only. Dry-run checks conditions/readiness, never means due now.
- Existing definition CAS, draft guards, session isolation, confirmed command semantics retained. Unknown remains unknown; refusal reasons displayed.

## Checks
Node24: `npm ci && npm run typecheck && npm run lint && npm test && npm run build`.
Contract fixture screenshots (NOT real Core proof): `PLAYWRIGHT_CHANNEL=chrome npx playwright test --config playwright.schedule.config.ts`.
Real CI-only gate with explicitly provisioned SOFTWARE fixture:
`LIVE_CORE_SOURCE=/absolute/core LIVE_SCHEDULE_ONLY=1 python -B e2e/automation-live-runner.py`.
Uses actual next wall-clock minute, no clock injection. Requires existing dev dependencies/Docker; do not run on protected local machine as standing permission. User requested no new local containers/deletions/restarts. This task uses GitHub Actions disposable runner only.

Current implementation local tests pass; live acceptance pending. No production deployment, physical relay, main merge, profile binding bypass, permanent secret/ACL changes. Delayed actions are a later separate stage.
