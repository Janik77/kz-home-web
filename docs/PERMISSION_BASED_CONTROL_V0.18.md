# Web v0.18 — permission-based relay control

## Discovery before editing

Both repositories started clean: Web on feature/permission-based-control-v0.18,
Core on main. No branch switches. Inspected Core HOUSE_PERMISSIONS_V0.17.md,
the FastAPI route, HousePermissionsRead DTO, AuthorizationService and permission
tests, plus Web v0.16 implementation/live reports, session, house workspace,
repository, relay client, UI and tests. The old Web adapter enumerated members and
required its own matching owner role before every intent. That assumption is now
superseded by the server-calculated permission read. Web's separate house query
clients, session revision checks, relay-only eligibility and lifecycle remain needed.

Verified contract: authenticated GET /v1/houses/{house_id}/me/permissions returns
200 with {house_id: string, permissions: Permission[]} and Cache-Control: no-store.
401 covers absent/invalid/expired auth and inactive users; 404 hides absent/foreign
houses or revoked membership; 403 means member without house.read. Existing Core
policy gives device.read/device.control to owner/resident/installer/technician.
Web must not copy that role matrix. Command POST independently authorizes the
device's actual house and device.control, including idempotent replays.

## Frontend authorization and lifecycle

The typed readHousePermissions call uses the existing authenticated, no-store,
abortable Core session HTTP client. Both fields are validated at runtime: house_id
must match the requested house, permissions must be an array of nonempty strings,
duplicates are rejected. Additional permission strings are forward-compatible;
only the exact device.control and device.read identifiers authorize this flow.
No role name, member enumeration, superuser flag or locally copied role matrix
is used. Unknown strings never confer an additional capability.

Both device.control (issuance) and device.read (safe result observation) are
required. All four current Core roles possess both. Permissions are read on UI
eligibility discovery and again before every new intent. Missing grants, malformed
or foreign responses, HTTP errors and network failure cannot authorize a POST.
The UI disables controls during eligibility refetch and after an eligibility error.
The last permission read is not a lease: Core may still reject a subsequent POST,
and its actual resource-house/device.control checks remain authoritative.

Each selected house owns its repository/query client. House change/unmount cancels
queries and command observation and disposes the old cache. Session lifetime now
also aborts authenticated reads on logout/expiry; a new login creates a new
lifetime. Revision guards and post-response AbortSignal checks reject late results
even if a transport ignores cancellation. Aborted reads cannot rotate/revive a
session through the read client's 401 refresh path. Shared token refresh remains
independent of one component's cancellation.

The supported subset remains actual type relay + declared on_off + reported online
+ boolean observed state. Socket/switch display aliases do not enable mutations.
Scenes, dimmers, curtains and arbitrary real mutations remain unavailable. Mock
mode keeps its existing interactive, explicitly labelled simulation.

Command handling retains one UUID Idempotency-Key per new absolute intent, one
POST with no automatic retry, HTTP 202 receipt validation and bounded sequential
house-scoped GET polling. All identity/intent/deadline fields must remain matched.
queued/dispatched remain pending; only server applied confirms the command.
failed/device failure, timed_out, publication uncertainty, network errors and
401/403/404 keep their distinct handling. A network/publish/deadline uncertainty
never becomes a fabricated physical success or cancellation. No optimistic state
write is performed. After applied, authoritative state is refreshed; refresh
failure preserves explicit confirmation alongside displayed last-known state.
Aborting observation never cancels a physical command. A later click after an
unknown result is a new explicit intent, with the existing warning to the user.

## Verification and evidence

Typecheck, ESLint and 132 unit/component tests (18 files) passed. Both mock/core
production builds passed. New tests cover malformed/missing/foreign permission
responses, missing grants, revocation before POST, 403/404/5xx, network loss,
rejected session refresh and delayed permission responses after house cancellation
or logout. Existing lifecycle/session/component tests cover terminal outcomes,
POST 401/403/404, no retries, duplicate clicks, unsupported/offline devices,
poll cancellation, no optimistic state, refresh failure and house isolation.

Mock and Core-contract Playwright regression are run separately from live
acceptance. They preserve responsive/theme/accessibility assertions at five widths.
Their API fixtures are explicitly mocked; they are not claims of real Core access.

Mock Playwright: 24 passed initially; one small-desktop navigation test hit
"Execution context was destroyed" during page navigation and passed its focused
rerun (1/1). Core Playwright's general /v1 fixture initially shadowed the new
permissions route with a command receipt; Web correctly failed closed. The test
handler was corrected to fall through to the specific permission response; all
five affected viewport cases passed their focused rerun (5/5). The original Core
run finished 27 passed/3 failed; all 30 distinct scenarios are covered successfully
across that run and the corrected rerun. No product authorization was
weakened for either test correction. Initial failures are retained in local logs.

The isolated live runner reused the existing Core exclusively owned fixture via
read-only imports, with Python bytecode disabled. It built current Core main
5f7db60647a29e1ba36c7613b990a06b25f0b462 into a unique image/project with fresh
credentials, networks and volumes. It verified the permission route exists and
PostgreSQL migration is 0006_command_lifecycle. It did not adopt or upgrade the
old installed kzhome-local stack or use installed secrets/ACL files.

Actual desktop Chrome traffic (no API interception) passed in 54.1 seconds:

- Owner ON, OFF, unchanged OFF; delayed MQTT handling retained OFF/pending UI;
  disabled duplicate clicks caused no extra POST or MQTT command.
- Exact negative device ACK produced failed; withheld ACK/state reached the real
  30-second timed_out deadline, with unknown-outcome UX and no automatic resend.
- Offline disabled controls and a direct authenticated browser probe returned 409.
- Resident, installer and technician each completed real confirmed ON and OFF.
  The owned fixture changed the same account's role through actual Core member
  APIs between logins; no frontend role mapping or Core policy override was used.
- Membership revocation through Core API caused preflight permission GET failure
  and no new command POST. Foreign and anonymous command probes returned 404/401;
  foreign receipt GET also returned 404.
- Independent SQL found 10 applied, 1 failed/device_failed, 1 timed_out/
  deadline_exceeded and zero invalid applied evidence rows. All 12 receipt IDs
  matched actual MQTT command/correlation IDs. A separate artifact audit matched
  every applied row to emitted applied ACK and correlated boolean state.

The existing software Relay.handle provides successful ACK/state; fault injection
occurs only at the software-device boundary. No physical hardware, GPIO/electrical
attestation, live broker publication fault, ARM64/LAN, live session-expiry or live
house-switch race acceptance is claimed. Session/house races have automated
contract/unit coverage. Core's device-move-between-preflight-and-POST race and
reported-online freshness limits remain unchanged.

Finally cleanup removed only owned fixture resources. Before/after inventories
matched for all pre-existing containers/configuration/start times/restart counts,
volumes, networks and image entries: 4 containers and 17 volumes preserved.
Credential-free local artifacts are test-results/confirmed-live-evidence.json and
test-results/confirmed-live-preservation.json (gitignored).

## Exact changed files and Git

Starting Web: clean feature/permission-based-control-v0.18 at
e2eb17427ae3ae1d9d780dc18d541d73032d43c3. Starting/final Core: clean main at
5f7db60647a29e1ba36c7613b990a06b25f0b462. No branch switches or staging.

Modified:

- src/data/core/relay-control.ts
- src/data/core/relay-control.test.ts
- src/data/core/session.ts
- src/features/devices/confirmed-relay-control.tsx
- src/features/settings/settings-page.tsx
- e2e/core.spec.ts
- e2e/confirmed-live.spec.ts
- e2e/confirmed-live-runner.py

Added:

- src/data/core/permissions.ts
- src/data/core/permissions.test.ts
- docs/PERMISSION_BASED_CONTROL_V0.18.md

No dependency, environment/deployment setting or Core file was changed. No commit,
push, merge, PR or deployment. Next smallest milestone: dedicated live browser
house/session switching during delayed permission/result reads, before physical
hardware acceptance and any deployment work.

Final Web status: same branch/HEAD, 8 modified and 3 untracked files, nothing staged.
Core remains clean on main. git diff --check passed.
