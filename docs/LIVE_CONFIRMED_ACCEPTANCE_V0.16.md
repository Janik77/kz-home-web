# Web v0.16 live integration acceptance — 2026-10-30

## Result

PASS: actual Chrome → Web → Vite proxy → Core v0.15 → PostgreSQL → Mosquitto TLS
→ existing software Relay → ACK/state → Core result polling → Web confirmation.
One live browser test passed in 44.0 seconds (Playwright total 46.1 seconds).
No intercepted routes, fake HTTP tokens, mocked Core transport or Core code changes.
This is software-relay acceptance, not physical hardware validation.

## Preflight and isolation

Web was on feature/confirmed-device-control-v0.16 with the prior implementation
uncommitted (14 modified, 5 untracked). Core main was clean at
080061c8c3a6f353aaa4b47712f31d113a2168e7. Docker Engine 29.8.0 was running.

The installed kzhome-local Core was explicitly checked, not assumed current:

- Image ID: ca60d19779ca75da2e84b4f51cedcddf0ccd55858b4c2f4cd093c2c0c921897b.
- OpenAPI advertised version 0.6.0b1; neither v0.15 command route was present.
- Read-only PostgreSQL query: alembic_version = 0005_device_onboarding.
- /ready returned ready. Readiness alone therefore did not establish v0.15 support.

The older Web live-core-support helper targets kzhome-local and was not executed.
Instead, the new runner reused Core's existing test_physical_acceptance_live.stack
fixture as a read-only import. This creates a random Compose project/image with
independent networks, volumes, random credentials, loopback ephemeral ports and
new TLS certificate/password/ACL inputs. It builds current Core source, migrates
only its new empty database and uses the existing inventory/provisioning helpers.
The application database role is non-superuser. TLS hostname/CA validation remains
enabled; no installed secrets or configuration files are adopted.

The isolated Core exposed both v0.15 routes and its independently queried database
reported 0006_command_lifecycle. Browser login used real owner credentials; Web's
actual in-memory session client sent commands and performed authorized result GETs.
Private fixture credentials were passed in process environment, never committed or
printed. Browser traces/screenshots/video were disabled for this credentialed run.

## Exact live scenarios

| Scenario | Observed result |
| --- | --- |
| Owner login and eligibility | Actual login 200; membership and device reads enabled supported relay controls. |
| ON with delayed software processing | POST 202 with UUID command/correlation IDs; at least two browser result GETs while UI said «Ожидаем подтверждение» and displayed OFF. Releasing the queued MQTT command through Relay.handle produced ACK/state, applied, refreshed ON. |
| Duplicate clicks while pending | Both buttons disabled; repeated native button clicks generated no additional POST. One receipt and one MQTT command. |
| OFF | New intent/key and POST 202; applied ACK/state, refreshed OFF. |
| Unchanged OFF | Another explicit OFF while already OFF still obtained its own receipt and applied ACK/state; no state-equality shortcut. |
| Device failure | Software device published an exact matching failed ACK through authenticated TLS MQTT; Core persisted failed/device_failed and Web showed «Не удалось выполнить», retaining OFF. |
| Missing ACK/state | Device received the command but deliberately withheld handling. Real server deadline elapsed (no fake browser/server clock); GET materialized timed_out/deadline_exceeded. Web showed «Нет подтверждения — состояние неизвестно», retaining OFF. |
| No automatic resend | No extra POST/MQTT command during pending, failure or timeout. Six accepted intents produced exactly six MQTT command envelopes with matching IDs; keys were unique. |
| Offline | Authenticated device status made Core report offline; manual Web refresh disabled controls. Actual browser-issued owner POST returned 409 and created no command row/MQTT envelope. |
| Recovery/final OFF | Online status plus a fresh explicit OFF returned applied; relay ended OFF. |
| Resident | Real resident login/read succeeded; Web controls remained disabled because membership enumeration cannot establish its permission. Resident is NOT claimed to be denied device.control by Core. |
| Foreign user | Real login with no accessible house; actual browser POST and receipt GET returned 404. No extra persisted command. |
| Anonymous | Actual browser command POST returned 401. No extra persisted command. |

The failure case is a device-negative ACK, not a broker publication failure.
Faults/delays were injected only at the software-device boundary. Normal ON/OFF
uses the existing unmodified Relay.handle implementation. Core was not patched,
monkeypatched, restarted or reconfigured to produce desired outcomes.

## Independent evidence

SQL was executed directly in the owned PostgreSQL container, independently of
Web and Core's HTTP response mapping. All six receipt IDs were present:

| Intent | command_id | Persisted status |
| --- | --- | --- |
| ON | c925dd2e-d577-44b8-90cc-ee3ee72f6e3b | applied |
| OFF | 88036c24-547c-42c9-b829-db4f24326458 | applied |
| Unchanged OFF | 8b54b4c9-3a6c-476f-88df-3bb7a9dfe528 | applied |
| Failed ON | c2a6be9a-db43-4fb6-a2e6-2c4c87d0ddc2 | failed |
| Unconfirmed ON | 6765303a-edfa-40c7-8a67-e7702e8d8e53 | timed_out |
| Final OFF | 23a25c5e-a62a-4271-8901-d31d3a77aae3 | applied |

Counts: applied=4, failed=1, timed_out=1. Zero applied rows lacked applied ACK,
state_received_at or matching requested_on/reported_on. An additional independent
artifact audit matched every SQL command/correlation/intent to the actual MQTT
envelope and all four applied rows to the emitted exact-ID ACK and correlated
boolean state. Browser assertions matched MQTT command/correlation IDs to its
202 receipts and checked the final rendered confirmation/refreshed state.

Example ON correlation_id: 31c972ef-eee7-4f11-9ece-845acb5552ef. PostgreSQL recorded
ACK at 2026-10-30T05:14:24.735502Z and state at 05:14:24.753839Z. For the timeout,
ack_status, reported_on and both evidence timestamps remained null.

The existing simulator publishes retained current-state messages by protocol;
their live delivery to Core's existing subscription is not a retained bootstrap
replay. ACKs and commands were non-retained. Successful lifecycle evidence came
from live delivery, not reading a retained matching state.

Local credential-free artifacts (gitignored, may be overwritten by later tests):

- test-results/confirmed-live-evidence.json: MQTT envelopes, emitted ACK/state,
  independently queried SQL rows and browser exit code.
- test-results/confirmed-live-preservation.json: before/after Docker inventory,
  configuration fingerprints and equality result.

## Preservation and cleanup

Exact before/after inventories matched: 4 pre-existing containers, 17 volumes,
16 image entries and 6 networks. Container IDs, image IDs, configuration/mount
fingerprints, running/exited states, StartedAt and RestartCount were unchanged.
This includes the existing kzhome-local core/postgres/mosquitto and exited migrate
containers. No pre-existing image was removed or retagged. Only the random fixture
project's containers, volumes, networks, image tag and temporary private files
were removed by its finally cleanup. No fixture Docker resource remained.

Existing data contents were not exported or modified. The only installed-database
operation was the requested read of its migration marker. No installed migration,
restart, recreate, reset, production access or deployment was performed.

## Test-only files and reproduction

Added: e2e/confirmed-live-runner.py, e2e/confirmed-live.spec.ts,
playwright.confirmed-live.config.ts, docs/LIVE_CONFIRMED_ACCEPTANCE_V0.16.md.
Modified: playwright.config.ts solely to exclude the opt-in live suite from Mock
regression. Existing v0.16 application changes were preserved without editing them
during this acceptance task. Core files were not modified.

After verifying the Core SDK with get_python_environment, run from Web:

```powershell
$env:PYTHONDONTWRITEBYTECODE = '1'
& 'C:/projects/kz-home-core/.venv/Scripts/python.exe' -B e2e/confirmed-live-runner.py
```

Requires Docker Linux Engine, cached fixture images, the Core test dependencies,
Web node_modules and installed Chrome. The runner uses only owned resources and
stops on setup/test failure; do not substitute the installed local stack.

Regression: typecheck, ESLint and 111 unit/component tests passed. Default
Playwright discovery lists exactly 25 Mock tests and excludes both live suites.
The 30-test Core-contract browser regression also passed (1.9 minutes); it uses
intercepted fixtures and is distinct from the live result above. Production builds
and the full Mock browser run were not repeated for these test-only changes.

Remaining limits: one desktop Chrome live run; no physical hardware, ARM64, LAN,
browser/network-loss, restart recovery, broker publish failure or live session-
expiration fault injection in this run. Existing owner-only Web authorization and
the device-house-move race documented in CONFIRMED_DEVICE_CONTROL_V0.16.md remain.
No commits, staging, pushes, merges, PRs or deployment.

Final Git: Web remains on feature/confirmed-device-control-v0.16 with 15 modified
and 9 untracked files (including the prior 19-file implementation); nothing staged.
Core remains clean on main at the same commit. git diff --check passed.
