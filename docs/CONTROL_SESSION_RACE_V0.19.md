# Web v0.19 — control/session race safety

## Audit and boundaries

Started with clean Web feature/control-session-race-v0.19 and clean Core main.
No branches switched. Reviewed v0.18 report, session, permissions, relay client,
house workspace, control component and their tests; mentor deployment guide was
read without executing deployment steps. Core remains read-only.

Existing safeguards retained:

- Each selected house creates/disposes its own repository and QueryClient.
  Session loss unmounts its workspace; house navigation/unmount cancels query reads
  and component command observation. Cache keys are local to that client.
- CoreSession combines caller and session-lifetime AbortSignals and verifies
  revision after HTTP responses; login creates a new lifetime. Logout/expiry
  aborts reads. Token refresh is shared, bounded and never used to replay POST.
- Permission response house_id/schema validation and fresh pre-command read of
  device.control/device.read; relay/on_off/online/boolean-state eligibility.
- Synchronous UI guard plus repository busy set prevent another same-device
  command while pending. One key and one POST per accepted new intent; HTTP
  uncertainty never triggers automatic resubmission.
- Receipt identity/intent/deadline checking, sequential bounded result polling,
  applied-only confirmation, and explicit distinction between confirmation and
  refreshing observed state. Browser abort is observation cancellation only.

These mechanisms already handle house/session races. The milestone extends their
coverage rather than adding a second session, RBAC or command state machine.

## Reproduced defect and minimal fix

Two different device cards could confirm commands concurrently and each call
getHome followed by setQueryData on the entire shared home snapshot. Those direct
reads were not tracked by QueryClient.cancelQueries. A later-returning older
snapshot could overwrite the newer confirmed snapshot, despite both commands
having applied. A controlled component regression reproduced the second device
reverting from true to false in the cache before the fix.

Post-applied reads now share a dedicated cancellable TanStack query key inside
the existing house QueryClient. A later command refresh cancels the earlier one;
even an abort-ignoring transport cannot resolve the canceled query into a cache
write. The successful result is copied to the normal home cache only after the
tracked query resolves and the component lifetime is still active. Refresh errors
remain separate from the main home query's error state, preserving the explicit
applied confirmation and last-known state. No state is changed optimistically.

The UI additionally explains pending permission discovery and reported offline
state in Russian using the existing footnote; layout, theme and controls are
unchanged. Sending/waiting/confirmed/failure/unknown/session messages remain.

## Deterministic automated race coverage

New workspace tests hold real Web HTTP-client responses (network fixture only)
while rendering the actual authenticated CoreWorkspace in StrictMode:

- House A → B during pre-command permissions, command POST, command result GET,
  and post-applied device refresh. Assert AbortSignal, release the old response
  despite cancellation, verify B stays OFF and no A result/label leaks.
- Logout and rejected-refresh session expiry during permissions, POST and polling.
  Release the late response; assert login replaces house data, no later requests
  restart observation and POST count stays zero before submission or one after it.
- Concurrent devices with reversed snapshot response order. Assert the actual
  query cache and rendered state retain the newer snapshot.

Ten new desktop Playwright contract scenarios cover the same four house-switch
phases and three phases for logout/expiry. Responses are gated by explicit promises,
not arbitrary sleeps. They run once on desktop; existing UI/browser regression
continues at five widths and both themes. These tests use intercepted HTTP fixtures
and are not real Core integration. Forty duplicate viewport cases are explicitly
skipped because they repeat viewport-independent synchronization logic.

Existing tests continue to cover permission revocation (including before POST),
malformed/foreign responses, role grants, rapid duplicate actions, per-device busy
conflicts, POST HTTP/network failures, delayed ACK/result, timeout, publication
uncertainty, session changes, no optimistic success and interactive Mock behavior.

## Live verification approach

The existing exclusively owned fixture builds Core from its read-only source,
creates new PostgreSQL/Mosquitto TLS resources and credentials, migrates only its
new empty database, and uses the existing software Relay. No existing Docker
container, network, image, volume, configuration, secret or MQTT ACL is adopted.

A temporary authenticated-control loopback HTTP proxy forwards actual browser
requests to actual Core, reads the real response, then optionally holds delivery.
It does not synthesize permission/command results or alter Core authorization.
The test synchronizes on a response already received from Core; a held POST has
therefore reached Core and may already have executed. No claim of backend command
cancellation is made. Proxy logs store method/path/status only, never tokens.

The new live scenario switches to an empty second house while holding permission,
POST, poll and refresh responses; releases them and checks the second house remains
isolated. It also logs out after Core handled a POST and invalidates the fixture
owner account during held permissions, testing real 401/refresh rejection. The
fixture owner is restored only in its dedicated database. The prior live scenario
still covers normal ON/OFF, unchanged OFF, all roles, revocation before POST,
failed ACK, real timed_out, offline, foreign and anonymous access.

An initial proxy attempt exceeded the browser's initial-home readiness assertion:
creating a separate HTTP client per forwarded request imposed excessive startup
cost. The test harness now reuses one upstream client. This was a harness issue,
not evidence of a product race; its finally cleanup preserved the Docker inventory.

## Remaining limits and hardware

Permission GET remains a point-in-time observation; Core independently authorizes
every POST and there is no new atomic expected-house precondition. A command may
complete after browser logout/house change. Core's reported online is not a new
heartbeat guarantee. There are no API, dependency or production-setting changes.
Software relay protocol confirmation does not attest GPIO/electrical execution.
Physical hardware, ARM64/LAN and broker-failure live fault injection are unverified.
Live logout/session invalidation is sampled at specific phases; the complete
phase matrix is covered with deterministic contract/component tests.

## Results and exact files

TypeScript typecheck, ESLint, 143 unit/component tests in 18 files, both Mock/Core
production builds and git diff --check passed. The new stale-snapshot cache test
failed before the fix and passes after it. An existing immediate DOM assertion
was changed to waitFor to await TanStack's observer notification; no assertion of
state or confirmation was removed.

Final browser regression: Mock 25 passed (2.2 minutes); Core-contract 40 passed
and 40 intentionally skipped duplicate viewport race cases (2.2 minutes). This
is one complete successful final run of each suite, distinct from live acceptance.

Live: 2 passed (1.2 minutes). Baseline lifecycle test: 55.1 s; delayed-response race
test: 13.3 s. Final independent SQL: applied=14, failed=1, timed_out=1; zero invalid
applied rows. Additional artifact audit matched all 14 applied rows to actual MQTT
command/correlation IDs, applied ACK and correlated state. The POST/logout case
remained applied in PostgreSQL, demonstrating that abandoning its HTTP response
did not cancel server execution. Existing 4 containers/17 volumes and all inventory
fingerprints matched after cleanup. No physical hardware was used.

Local credential-free evidence is in test-results/confirmed-live-evidence.json
and test-results/confirmed-live-preservation.json (gitignored).

Starting Web: clean feature/control-session-race-v0.19 at
44b33b6acec7a5013400f908c228a63afcc9256c. Starting/final Core: clean main at
5f7db60647a29e1ba36c7613b990a06b25f0b462. Final Web keeps the same branch/HEAD,
with six modified files and this new report, nothing staged:

- src/features/devices/confirmed-relay-control.tsx — tracked/cancelable refresh, Russian eligibility footnote.
- src/features/devices/confirmed-relay-control.test.tsx — snapshot ordering regression and observer synchronization.
- src/app/core-workspace.test.tsx — house/session delayed-response matrix.
- e2e/core.spec.ts — deterministic browser contract race matrix.
- e2e/confirmed-live-runner.py — owned real-response delay proxy and fixture-only controls.
- e2e/confirmed-live.spec.ts — real house/logout/inactive-session race acceptance.
- docs/CONTROL_SESSION_RACE_V0.19.md — this report.

Core files and installed data/settings were not modified. No dependencies, commits,
pushes, merges, PRs, branch switches or deployment. Live restart/broker failures,
physical hardware and every possible manual-refresh/controller interleaving remain
outside this verification; no global ordering guarantee across external actors is
claimed.

Web v0.19 is ready for commit/PR review within the documented software-validation
scope. No commit or PR was created. The remaining physical/live-fault boundaries
above are not claimed as passed.
