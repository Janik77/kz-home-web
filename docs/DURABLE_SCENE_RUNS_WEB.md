# Caller-driven software scene runs in Web

Stacked on Web #17; requires Core #39 at
`f946a07f67f9ccb1e8f62c99860a0842bf3a062b` and its `0010_scene_runs` migration.
The existing repository, session, router, forms, revision conflicts and direct relay
controls remain intact. Legacy scene run and automation execution are not called.

On the Scenes page, Prepare creates immutable intent with the exact displayed revision
and an in-memory idempotency key. It sends no device command. Every action requires an
explicit click. The browser observes GET receipts for up to 35 seconds; it never sends
the next action or replays a dispatch in the background. 201/202, accepted ACK, broker
PUBACK and a matching current device snapshot are not treated as applied. Only Core's
exact applied receipts establish success; the adapter validates house, device, intent,
command/correlation identity and immutable run timestamps across responses.

Core authoritatively allows only software relay Boolean ON/OFF actions and rejects
physical inventory, including mislabelled devices. Web does not infer physical safety
from names, online status or relay type. Existing transport/physical gates are unchanged.

A lost create response can be explicitly recovered using the same in-memory key and
original revision. A 409 does not silently replace that revision. Refresh/reopen the
scene deliberately to prepare a different revision. After a dispatch error only GET
observation is offered until refreshed evidence is available. Unknown, partial, expired,
failed and timed-out outcomes remain distinct from success. Timeout is not proof of OFF
or non-execution; no compensation is sent. The original five-minute admission deadline
is authoritative in Core; Web never extends it.

Copy the visible run ID before navigation; Open saved run by ID performs GET only.
No run key, token or payload is persisted to browser storage. Leaving stops observation,
not a command already admitted by Core. There is no list, cancellation, automatic resume
or automatic new run. Only the original creator may dispatch in Core. An older Core
returns an explicit unsupported/not-found error; no fallback to unconfirmed legacy runs.

Validation uses `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, mock
browser regressions and real `e2e/confirmed-live-runner.py`. The real runner first verifies
its original 18 commands unchanged, then starts a second browser phase: preparation
without MQTT, held ACK/state, explicit ON then OFF, partial device failure, and dropped
response timeout. All 23 commands are checked against actual SET/ACK/state and SQL.
PostgreSQL definition and scene-run suites run in its disposable database. Software
fixtures only; no separately built physical firmware is exercised.

Run the live workflow in an isolated Ubuntu runner, or locally where Docker is already
available, Node 24 and Python 3.12 are installed:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r ../kz-home-core/requirements-dev.txt
npm ci
npx playwright install chromium
docker pull postgres:17-bookworm@sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994
docker pull eclipse-mosquitto:2@sha256:75d6662dee52c947dc9dd9c29f1d8d7ffef78ddaf38001caa09755681e8bbc98
docker pull alpine/openssl:latest@sha256:6821afa2476e11be343f29275f2ca24291720ff0a7148bd131fd8e314ff26d9e
LIVE_CORE_SOURCE="$(realpath ../kz-home-core)" CORE_BASE_SHA=f946a07f67f9ccb1e8f62c99860a0842bf3a062b .venv/bin/python -B e2e/confirmed-live-runner.py
```

Checkout that exact Core SHA first. The GitHub workflow pins service image digests and
pre-pulls them before the inventory baseline; use that workflow for the complete
preservation check. The older Core launcher has a strict old-Web pin and is not claimed
compatible with this new Web commit. CI status and exact Web SHA are recorded in the PR.
