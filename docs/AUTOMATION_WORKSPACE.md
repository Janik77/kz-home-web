# Automations: event → confirmed result

This branch builds on Web #26 (c55dba53cb093c55d006dcd76f54b823a6f6e2be).
Runtime candidate: Core #49 `193937fcb30c68b50d443b6745e42117c007639d`.
Requires the matching Core confirmed-automation API; old Core does not silently fall
back to the legacy unconfirmed `/automations/{id}/run` path.

## Supported user path

- Create a rule using **Когда → При условиях → Выполнить**. Only actual relay
  DTOs with `on_off` and Boolean current `on` are offered. Offline devices remain
  identifiable in definitions; Core separately checks availability/freshness at execution.
- First slice: Boolean `on`, `eq`/`neq`, zero or more conjunctive device-state
  conditions, 1–16 ON/OFF actions. Existing time/delay/other-field rules remain
  readable and are not lossy-converted by the editor. Existing name-only rename
  remains available for these legacy rules through the minimal revision-checked
  PATCH; it never rewrites actions, conditions or enabled state.
- New rule saves disabled; save/readback must agree. Enabling is an explicit
  acknowledged operation because subsequent state events can send commands.
- Edits and enabling first require a successful current-revision dry-run API response,
  so older Core cannot silently activate its legacy unconfirmed executor. Disabling
  remains available. Edits and enable/disable PATCH carry the captured `expected_revision`. Conflict
  keeps draft and original version; comparison is read-only. No automatic retry.
- Draft guard protects navigation, house/session context changes and page reload
  through the existing app guard. Drafts are memory-only, not durable autosave.
- **Проверить условия (без команд)** calls only dry-run on a saved definition.
  Disabled, current-condition match and eligibility are separate facts. No manual
  execute button or MQTT access exists in this UI.
- Expand **Результаты запусков** for persistent last 20 runs from Core and each
  action's ACK/current-state outcome. Sending is not success; timeout/publish
  ambiguity/restart unknown remain explicit. No retry controls for unknown commands.

## Contract

Existing GET `/automations`, GET/PATCH `/automations/{id}`, POST `/automations`.
New read-only-effect POST `/automations/{id}/dry-run`, GET
`/automations/{id}/runs` (array; house/rule scope validated).
Run statuses/actions use the common receipt semantics. The frontend requires
receipts for queued/dispatched/applied/failed/timed_out and rejects success without
all actions applied. New devices/permissions/list are fetched independently, so
lack of automation access never hides the home view.

Rule list polls every 10 s; expanded histories every 3 s only with visible document
(default TanStack background polling disabled). Collapsed histories do not poll.
Authentication/house repository remount continues to clear scoped query data.

## Verification commands

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Focused tests: `npm test -- src/data/core/automations.test.ts
src/features/automations/automation-workspace.test.tsx`.

Browser/live verification is separate from unit tests. See the automation live
runner and final integration report for exact compatible Core SHA and actual
PostgreSQL/MQTT/TLS evidence. No physical hardware tested by this branch.
