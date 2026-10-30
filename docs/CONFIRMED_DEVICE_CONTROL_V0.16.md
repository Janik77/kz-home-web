# Web v0.16 — confirmed relay control

## Scope and verified sources

Web started clean on main at f9a97d37951cfb835b682e67eef0e6d916741c81 and was
switched to the existing requested feature/confirmed-device-control-v0.16 branch.
Core main was clean at 080061c8c3a6f353aaa4b47712f31d113a2168e7 and remained read-only.
Inspected COMMAND_LIFECYCLE_V0.15.md, DEVICE_PROTOCOL.md, deploy/MENTOR_DEMO_RU.md,
app/api/commands.py, routes.py, dependencies.py, schemas/commands.py, schemas/auth.py,
security.py, services/command_service.py, and lifecycle/RBAC tests. The mentor guide
describes an older read-only Web demo; no deployment procedure was executed.

POST /v1/devices/{device_id}/commands requires Bearer authentication and
device.control in the device's actual house. Body is exactly {"on": boolean};
Idempotency-Key is required (16–128 ASCII letters/digits/underscore/hyphen).
Only relay + on_off is supported. Offline, busy, inactive physical binding and key
conflicts return 409; unsupported/invalid intent 422; unavailable transport 503.
202 contains CommandRead, never proof of execution. GET
/v1/houses/{house_id}/commands/{command_id} requires device.read and returns the
same receipt with house isolation. 401/403/404 retain their existing meanings.
429 is handled defensively as rate limiting; Core does not promise a retry delay.
Other 5xx and network/protocol errors never trigger a POST replay.

Consumed receipt fields: command_id, correlation_id, house_id, device_id,
requested_on, status, expires_at, failure_code. Additional Core fields are
ack_status, reported_on, created_at, updated_at, dispatch_started_at,
dispatched_at, ack_received_at, state_received_at, completed_at. Web deliberately
does not use ACK or reported_on as a completion shortcut.

queued/dispatched are pending; applied requires Core's matching applied ACK and
validated live non-retained correlated state before the 30-second deadline.
failed is terminal; publish_unconfirmed means execution is unknown. timed_out
also means unknown, not cancellation. Applied is historical protocol confirmation,
not electrical/physical attestation or a guarantee of the present state.

## Implemented behavior and authorization limitation

Separate relayControl adapter; legacy snapshot mutations and scenes remain locked.
Real HTTP client uses memory-only session credentials, no-store reads, 202 checking,
one UUID per new absolute ON/OFF intent and no automatic POST retries (including 401).
No same-intent retry UI is offered: a subsequent explicit ON/OFF click is a new intent
with a new key. Unknown outcome copy explicitly warns that execution may have occurred.
Keys/receipts are not persisted across reloads.

The existing contract has no universal current-user permission endpoint. /auth/me
has identity only. GET /houses/{house_id}/members requires member.read, currently
owner-only. Web checks the authenticated user's own matching house membership is
owner, whose device.control grant was verified in security.py. Unknown roles,
missing membership, denied/failed reads and non-owner accounts fail closed. This
is a source-verified v0.15 owner subset, not a role inferred from device reads or
superuser metadata. Eligibility is re-read immediately before every command;
Core still authorizes the mutation independently. A revoked permission can produce
403 after eligibility was read. No mutation is used to probe authorization.

Resident, installer and technician controls remain blocked in Web even though
standard Core roles can issue commands directly. The smallest backend prerequisite
for widening access is a house-scoped own-permissions read available to those users.
Do not broaden membership/audit access just to expose a toggle.

Only actual relay type + on_off + reported online + boolean observed state can
be enabled. The display's socket/switch aliases do not enable commands. Physical
binding admission remains a server check. Other devices have disabled controls.

Polling is sequential at up to one GET/second until terminal status, with one final
deadline read. It uses the receipt deadline with a 30-second local ceiling; HTTP
calls retain the existing 15-second timeout. Local deadline/clock mismatch or a
failed result read produces unknown outcome, never fabricated timed_out/applied.
Network failure stops observation; no background retry/resend worker exists.
Component cancellation and session loss abort polling; receipts must match all
house/device/intent/command/correlation/deadline identifiers. Repository locks and
synchronous UI guards suppress duplicate intent while pending. House workspaces
have separate repositories/query clients; unmount aborts and late results are ignored.
Aborting observation does not cancel the physical command.

Russian UX: «Отправляем команду», «Ожидаем подтверждение» (queued marked in queue),
«Выполнено», «Не удалось выполнить», «Нет подтверждения — состояние неизвестно».
No optimistic state change. After applied, refresh the authoritative home snapshot;
if it fails, confirmation remains explicit alongside last-known displayed state.
Signature Home and Room cards share the control; themes/mobile styles and simulated
Mock mutations are preserved. Dimming, curtains, arbitrary commands and scenes are
not enabled in Core mode.

Core's POST has no expected-house precondition. If an administrator moves a device
between the preflight read and POST, Core authorizes against its actual house; Web
rejects a foreign receipt but cannot retroactively prevent a server-authorized
dispatch. Server support would be required to make that race atomic. Reported
online is also not a heartbeat freshness guarantee. These are contract limitations.

## Validation

Typecheck, lint, both mock/core builds and git diff --check passed. Unit/component:
111 passed in 17 files. Playwright: 25 Mock and 30 Core-contract tests passed.
Tests cover delayed
pending states, ON/OFF confirmation, deadlines, publication uncertainty, HTTP
errors, network loss, duplicate clicks/keys, unsupported/offline devices, permission
gating, expired sessions, cancellation and late responses, no optimistic state,
post-confirmation refresh failure, existing house-switch isolation and Mock behavior.
Browser tests use intercepted HTTP contract fixtures, including owner control on
five widths (1440/1024/834/390/320), both themes and accessibility checks.

Live isolated Core/PostgreSQL/MQTT acceptance was not run: Docker API preflight
failed because the dockerDesktopLinuxEngine named pipe was absent. No Docker
startup/reset, provisioning, database/secrets/container/deployment modification,
Core execution or physical-device validation is claimed. No commits, staging,
pushes, merges, PRs or deployment.

Next: expose own house permissions in a separate Core milestone, then extend Web
eligibility beyond owner. When Docker is available, run isolated browser-to-Core
software-relay acceptance before deployment; keep physical validation separate.

## Exact files and final Git status

Web: feature/confirmed-device-control-v0.16, 14 modified + 5 untracked; nothing staged.
Core: main, clean; no tracked or untracked changes. Both diff checks passed.

Modified:

- docs/CORE_HTTP_CONTRACT.md
- e2e/core.spec.ts
- src/app/app-shell.tsx
- src/app/core-workspace.tsx
- src/data/core/core-home-repository.ts
- src/data/core/errors.ts
- src/data/core/http-client.ts
- src/data/core/session.ts
- src/data/home-repository.ts
- src/features/devices/core-control-notice.test.tsx
- src/features/devices/core-control-notice.tsx
- src/features/devices/device-card.tsx
- src/features/home/home-page.tsx
- src/features/settings/settings-page.tsx

Created:

- docs/CONFIRMED_DEVICE_CONTROL_V0.16.md
- src/data/core/relay-control.test.ts
- src/data/core/relay-control.ts
- src/features/devices/confirmed-relay-control.test.tsx
- src/features/devices/confirmed-relay-control.tsx
