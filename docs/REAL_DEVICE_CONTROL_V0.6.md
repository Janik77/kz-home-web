# Web v0.6 — real device control foundation / safe read-only stop

## Result

**Real ON/OFF is blocked by the current Core HTTP contract.** Per requirement 12,
Web stays read-only. This milestone establishes the verified boundary, explains
it in Home/Room Detail, and tests that no real mutation can escape that boundary.
It does **not** claim a completed real-device control flow.

Both repositories were clean before editing. Web was already on
`feature/real-device-control-v0.6` at `46707007d99ac3cf541adeef7dc8314ee651f441`;
Core was on `main` at `d3fe1eeb4d31cb79efde69670f462eb50203266f`.
No branch changes. Only Web files are changed.

## Verified actual Core contract

Inspected Core `PROJECT_STATUS.md`, `DEVICE_PROTOCOL.md` (§§5–9, 19),
`deploy/MENTOR_DEMO_RU.md`, simulator acceptance documentation, and implementation:

| Source | Established behavior |
| --- | --- |
| `app/api/routes.py` | POST `/devices/{entity_id}/on`, POST `/devices/{entity_id}/off`; no request body, returns `DeviceRead`, HTTP 200 by default. PATCH `/devices/{entity_id}/state` accepts a raw desired-state object such as `{"on":true}`, also returns `DeviceRead`. All require `device.control` in the resource's house. |
| `app/api/dependencies.py`, `app/security.py`, `app/services/auth_service.py` | Bearer access JWT; active user and house membership. Foreign resources hidden as 404, insufficient permission is 403, missing/invalid auth 401. Superuser metadata is not a house bypass. |
| `app/services/state_validator.py` | `on` requires declared `on_off` and a boolean for transported commands. Empty, invalid, unsupported and read-only command fields are rejected. A named capability is not a permission or completion guarantee. |
| `app/services/device_service.py:update_state` | Physical binding must be active. A physical command needs transport. With transport, validates and dispatches desired state, **returns the pre-command current DeviceRead**, without waiting for ACK/state. It discards the ID returned by transport. It does not check `online` before dispatch. Without transport, virtual/test records may update directly; that is not physical confirmation. |
| `app/transports/mqtt.py:send_command` | Generates unique `command_id` and a correlation ID (when none supplied); publishes v1 `/set` at QoS 1, not retained; returns only command ID internally. HTTP routes supply no correlation ID and return neither ID/header/receipt to the caller. |
| `app/transports/mqtt_models.py` | ACK statuses: `accepted`, `applied`, `rejected`, `failed`; both IDs required, timestamp/error fields optional. This is the MQTT envelope schema, **not a Web-accessible command-status API**. |
| `app/transports/mqtt.py:_route` | ACK is normalized as `device_ack_received`, with command ID in payload and correlation ID on event. An ACK alone does not mutate state. State is routed separately. |
| `app/main.py`, `app/services/device_service.py:report_state/_persist_state` | Incoming state passes active house/device binding and value/capability checks. Changed fields update the repository and publish `device_state_changed` with correlation. Equal state produces no state-change event. |
| `app/services/event_log_service.py`, `app/repositories/event_log_repository.py`, `app/models/entities.py` | State/ACK/status events persist as EventLog entries; payload redaction is key based. ACK rows are history, not a durable validated command ledger. Logging failures are caught/logged; a successful state read is not proof that matching history was persisted. |
| `app/api/routes.py:list_events`, `app/schemas/entities.py:EventLogRead` | GET `/events?house_id=…&event_type=…&limit=…` returns a descending-time array, default limit 100, max 500. Fields: id, house_id, event_type, entity_id, payload, correlation_id, created_at. No command-ID/correlation/cursor/since query or per-command result endpoint. |
| `app/main.py:/ws`, `app/websocket.py` | WebSocket requires `Authorization: Bearer` in upgrade headers. Native browser WebSocket cannot provide that arbitrary header. No browser-compatible cookie/subprotocol/query-token alternative is implemented or added. |

Read responses expose `state`, `online`, `capabilities`, `metadata`, record
timestamps, identity and location. `updated_at` is not a measurement timestamp.
Core does not implement heartbeat expiry, receipt-time freshness enforcement or
retained-state ordering. Online and last-known ON are independent facts.

### RBAC matters for confirmation

The current owner, installer, technician and resident roles all include
`device.control`. Owner/installer/technician include `event.read`; **resident
does not**. `/auth/me` returns identity, not house permissions. House membership
enumeration requires `member.read` (owner); it is not a universal permission API.
Web neither calls it nor infers a role from a successful device read. No new
permission-denied or writable status is fabricated. Existing real 403/401/404
read failures keep their established handling.

### Precise blockers — why events/state polling is insufficient

1. The browser cannot identify its own command attempt: HTTP discards the MQTT
   receipt IDs. Time proximity, latest event or matching desired state can belong
   to another browser, automation, replay or physical change.
2. Core stores ACKs but has no pending-command ledger, unknown-command validation,
   enforced terminal progression, durable completion/timeout or retry semantics.
   Persisted `applied` alone cannot be adopted as the outcome of this Web request.
3. Latest-500 history is bounded and independently permissioned; it can omit
   evidence under load, and residents cannot read it. Repeated GET `/devices`
   shows observed state, not why it changed. An unchanged report may emit no event.
4. `/ws` has no usable native-browser auth path; no alternative event stream has
   been invented. Browser MQTT or exposing broker/device credentials is prohibited.

The existing physical acceptance runner solves a **different, operator-only**
problem: exclusive relay control plus actual MQTT `/set` receipt provides both
IDs, then it requires correlated ACK/state and final GET. A normal browser has
neither that MQTT receipt nor exclusive ownership of command traffic.

## Implemented Web behavior

- Signature Home, both themes, responsive layout and mock mode are retained.
- Core mutation controls remain unmounted, rather than displaying a fabricated
  toggle with an unknown permission/confirmation model. ON/OFF, brightness,
  curtains and scene execution all remain unavailable. The repository rejects
  every command/scene with `CoreError('read-only')` **before any HTTP request**,
  including repeated/programmatic attempts and anonymous sessions.
- Each Core device card on Home and Room Detail has a native, keyboard-accessible
  disclosure: **«Почему управление недоступно»** / “Why controls are unavailable”.
  It explains the unverifiable outcome and unknown freshness/permissions. Offline and
  unsupported/partial/read-only sensor data receive their own reason. No false
  claim of denied permission is made for an online relay.
- Reported state remains readable; an offline last-known ON is not active/live
  control. Manual refresh uses existing authenticated GET reads, with AbortSignal,
  and updates observed state only. No polling, command queue or subscriptions added.
- No accepted/applied/timeout/rejected **real command UI** is fabricated. HTTP
  network/read errors stay read errors, not physical execution failure. A fetch
  deadline is not a device-command timeout. No optimistic Core state updates.
- Mock relay commands still use existing serialized TanStack mutations. Pending
  retains previous sample state, disables duplicate intent, and confirms only
  the repository's **simulation** result. Errors preserve state, retry is explicit.
  Mock confirmation is never claimed as an ACK or hardware confirmation.
- House switches cancel reads and dispose the old QueryClient; session revision
  guards reject late reads after signout. Added coverage releases a deliberately
  late, abort-ignoring response from the previous house and proves it cannot
  replace the newly selected house's state. No real mutation exists to race.

Transport, session, auth, DTO/domain mapping, Vite proxy, TLS, CORS and MQTT ACL
behavior are unchanged. No new dependency, secret, env flag or production setting.
`sendCommand(): Promise<HomeSnapshot>` remains a mock-oriented boundary; adapting
that interface into physical confirmation without an actual receipt is prohibited.

## Validation evidence

### Source/test inspection (not executed Core tests)

Reviewed the actual Core tests and acceptance procedure, including:

- `tests/test_mqtt.py:test_command_envelope_correlation_and_publish_policy`,
  `test_state_message_routing_and_correlation`, `test_ack_is_normalized_event`.
- `tests/test_mqtt_relay.py:test_applied_state_and_duplicate_does_not_reapply_old_intent`,
  `test_rejected_state`: software relay, bounded volatile deduplication.
- `tests/test_e2e_acceptance.py:test_stale_wrong_command_and_nonboolean_state_cannot_pass`,
  `test_negative_ack_fails_even_with_matching_state`.
- `tests/test_rbac.py:test_role_permissions_and_idor`, WebSocket auth tests;
  `tests/test_physical_acceptance.py` preflight/evidence checks.
- `simulator/PHYSICAL_ACCEPTANCE.md`: offline POST can return 200 without ACK/state;
  software evidence requires actual MQTT receipt, not an inferred HTTP association.

Core pytest/simulator/Docker were not run: Core is a read-only reference and
the missing runtime contract makes a new device-control acceptance misleading.

### Actual local HTTP (read-only, no fixture provisioning)

Against `http://127.0.0.1:18000` during this task:

| Check | Result |
| --- | --- |
| GET `/health`, `/ready` | 200, 200 |
| GET `/auth/me`, `/devices`, `/events` without credentials | 401, 401, 401 |
| GET `/openapi.json` | Success; ON/OFF POSTs and state PATCH return `DeviceRead`, with no command/correlation/result fields; event filters/limits match source. |

This verifies availability, unauthenticated read boundaries and the advertised
schema only. It does **not** verify authenticated browser control, MQTT delivery,
physical execution or PostgreSQL outcome persistence. No account/login/provisioning,
device command, simulator, database query or Docker mutation was performed.
OpenAPI agreement does not prove that the running image is built from the inspected
Git commit; its internal execution path was reviewed in source, not exercised live.

### Web checks

Run from the Web repository in PowerShell:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
$env:VITE_DATA_MODE = 'mock'
npm.cmd run build
$env:VITE_DATA_MODE = 'core'
$env:VITE_API_URL = '/core-api'
npm.cmd run build
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm.cmd run test:e2e
# Run after mock completes: its output root contains the Core artifact directory.
npm.cmd run test:e2e:core
git diff --check
```

Final results on Windows / installed Chrome:

| Check | Result |
| --- | --- |
| Typecheck / ESLint | Passed |
| Unit/component | **84 passed**, 15 test files |
| Mock Playwright | **25 passed** |
| Core-contract Playwright | **25 passed**; after final disclosure-copy refinement, the affected flow additionally passed **5/5** viewport cases |
| Mock / Core production builds | Both passed |
| `git diff --check` | Passed |

An initial concurrent browser run had an artifact-directory collision; the final
Core run was sequential and passed. The new request-count assertion uses the
pre-refresh baseline to account for StrictMode's canceled initial GET.

Unit/component coverage includes the fail-closed repository, observed-state
mapping (ACK-like additive fields cannot become confirmation), offline/unknown
reasons, mock relay pending/result/failure/retry and duplicate suppression,
house cancellation/late response isolation, plus existing authorization, session
expiry, abort, mapping and scene tests. Core-contract Playwright explicitly tests
online, offline last-known ON and partial relays, disclosure accessibility in
both themes, manual observed-state refresh, and no mutation traffic. These use
**intercepted contract fixtures**, not live Core E2E. Mock Playwright remains
sample simulation. Both browser suites cover 1440/1024/834/390/320px.

Live command acceptance is intentionally not run: the required command receipt
and verifiable outcome contract are absent. Disposable fixtures or a simulator
would not repair that missing browser capability; no existing user data is used.

## Smallest next milestone (separate Core work, not implemented here)

Define and implement a narrowly scoped, authenticated command receipt/result
contract tied to user, house, device and exact intent; expose IDs to the caller,
validate matching ACK/state against stored attempts, define terminal outcomes,
idempotency and timeout/unknown reconciliation, and make outcome reads available
to authorized controllers including residents. Define control eligibility for
physical lifecycle, capabilities and observed availability. Do not broaden
resident audit access or replace RBAC with a frontend role guess.

Only after that contract and its tests exist should Web add relay ON/OFF:
transport receipt → domain operation → pending → verified outcome/observed state,
with cross-house/session cancellation and no unsafe automatic command replay.
The future contract's route/payload names have deliberately not been invented.

## Exact changed files

Modified:

- `docs/CORE_HTTP_CONTRACT.md`
- `e2e/core.spec.ts`
- `src/app/core-workspace.test.tsx`
- `src/data/core/core-home-repository.ts` (boundary comment only)
- `src/features/devices/device-card.tsx`
- `src/features/home/home-page.tsx`
- `src/features/home/signature-home.test.tsx`
- `src/styles/components.css`

Created:

- `docs/REAL_DEVICE_CONTROL_V0.6.md`
- `src/data/core/core-home-repository.test.ts`
- `src/features/devices/core-control-notice.tsx`
- `src/features/devices/core-control-notice.test.tsx`

## Final Git status

Web: `feature/real-device-control-v0.6`, **8 modified + 4 untracked**, index empty:

```text
 M docs/CORE_HTTP_CONTRACT.md
 M e2e/core.spec.ts
 M src/app/core-workspace.test.tsx
 M src/data/core/core-home-repository.ts
 M src/features/devices/device-card.tsx
 M src/features/home/home-page.tsx
 M src/features/home/signature-home.test.tsx
 M src/styles/components.css
?? docs/REAL_DEVICE_CONTROL_V0.6.md
?? src/data/core/core-home-repository.test.ts
?? src/features/devices/core-control-notice.test.tsx
?? src/features/devices/core-control-notice.tsx
```

Core: `main` at `d3fe1eeb4d31cb79efde69670f462eb50203266f`, **clean before and after**;
`git diff --check` passed. No Core/Firmware/Docker/database/volume/secret/production
configuration changes. No commit, push, merge, PR, staging or branch change.
