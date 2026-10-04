# Verified Core HTTP contract — Web v0.3

Discovery reference: `C:/projects/kz-home-core`, clean `main` at
`d1124e461715bec01c24c987e97a46cfbc02427a`. Core is read-only. This document
was written before implementing the Web adapter. It describes implementation,
not every normative requirement in DEVICE_PROTOCOL.md.

## Evidence

Read PROJECT_STATUS.md, ARCHITECTURE.md, README.md, DEVICE_PROTOCOL.md and
DEVICE_ONBOARDING.md first. The active contract is established by
`app/main.py`, `app/api/routes.py`, `app/api/dependencies.py`,
`app/schemas/auth.py`, `app/schemas/entities.py`, `app/services/auth_service.py`,
`app/security.py`, `app/services/state_validator.py`, scoped structure/scene
repositories, and `tests/test_auth.py` / `tests/test_rbac.py`.

The router has no API prefix. Successful lists are bare JSON arrays, not
pagination envelopes. Authentication failures are 401, with a Bearer challenge
on login/access dependencies. A foreign resource is deliberately hidden as 404;
an existing house member lacking permission gets 403. FastAPI errors use `detail`
(a string or validation array). Web does not display or retain arbitrary server
error bodies, which may contain submitted input.

## Authentication

| Method/path | Request | Success |
| --- | --- | --- |
| POST `/auth/login` | `{email, password}` | 200 token pair |
| POST `/auth/refresh` | `{refresh_token}` | 200 rotated token pair |
| POST `/auth/logout` | `{refresh_token}` | 204, no body |
| GET `/auth/me` | `Authorization: Bearer <access_token>` | 200 user |

Token pair: `{access_token: string, refresh_token: string, token_type: "bearer",
expires_in: integer}`; expires_in is access lifetime in seconds. Defaults are
15 minutes access / 30 days refresh, configurable in Core. Refresh JWT identifiers
are hashed in server-side sessions; each successful refresh revokes the old
refresh session. Logout revokes the supplied refresh session, **not already
issued access JWTs**. Inactive users cannot authenticate, refresh or access reads.
No cookie session, registration, password recovery or browser persistence
contract exists. Email is stripped/lowercased; login password is 1–256 characters
(creation has separate 12-character minimum). Me returns id, email, is_active,
is_superuser, created_at and updated_at. Superuser does not bypass house RBAC.

## Read path

Every domain request uses the bearer access header.

| GET path | Scope/filter | Relevant response fields |
| --- | --- | --- |
| `/houses` | house.read memberships | id, name |
| `/houses/{id}` | house.read | id, name |
| `/floors` | all house.read memberships; no house filter | id, house_id, name, order |
| `/rooms` | all house.read memberships; no house filter | id, floor_id, name, icon (nullable) |
| `/devices?house_id={id}` | device.read for that house | id, name, room_id, type, state, online, capabilities, metadata |
| `/scenes` | all scene.read memberships; no house filter | id, name, house_id, actions |

All these records also include created_at and updated_at timestamps. Rooms must
be selected through the selected house's floors. Scenes must be filtered by
house_id in the adapter. Technicians can read houses/devices but lack scene.read;
their `/scenes` list omits those houses rather than promising an empty scene store.
There is no general current-user permission summary. Member enumeration is
owner-only and must not be used as a universal permission-discovery endpoint.

Device types: light, relay, switch, motion_sensor, temperature_sensor,
humidity_sensor, leak_sensor, curtain, thermostat, socket. Capabilities are named
strings: on_off, brightness, open_close, position, temperature, target_temperature,
motion, humidity, leak, illuminance. They are **not** the future descriptor map.
State is a JSON object and can be empty/partial. Current field semantics include
on:boolean, brightness/position:integer 0–100, motion/leak:boolean,
temperature/humidity/illuminance/target_temperature values. Position 0 is closed,
100 open. State and online availability are separate. No measurement timestamp,
freshness guarantee or heartbeat-expiry implementation is exposed by these reads;
updated_at is a record update timestamp, not a measurement timestamp.

Scene actions are `{type:"device_state", device_id, state:object}`. One action
may change multiple state fields. Core exposes no scene description/icon and no
execution summary equivalent to Web's mock applied/skipped result.

## Gaps and deliberate boundaries

Core does not expose house location, room photos/descriptions, user favorites,
or scene-purpose copy. Web must not fill customer data with mock decoration.
Incomplete/unsupported device state must remain visible without invented values.
List reads are independently fetched, not a transactionally consistent snapshot.
Physical-device lifecycle reads exist separately; ordinary device reads do not
provide lifecycle or a complete browser control-availability model.

Real device/scene mutations are outside v0.3. With MQTT, HTTP command success is
dispatch acceptance, not confirmed physical execution; command/correlation IDs
and durable outcome tracking are not returned by the HTTP command endpoints.
No browser MQTT is permitted. `/ws` requires an Authorization upgrade header;
the native browser WebSocket API cannot supply that header. No query-token or
alternative WebSocket authentication will be invented.

## CORS and transport

No CORSMiddleware or CORS settings exist in the inspected Core application.
Direct cross-origin browser JSON login / Authorization reads therefore cannot
work without approved origin support. For direct development access, a separate
Core change must add an explicit origin allowlist (e.g. the chosen
`http://127.0.0.1:5173` origin), permit GET/POST/OPTIONS and Content-Type /
Authorization, keep allow_credentials false for this bearer contract, and never
use a wildcard as a production policy. Web v0.3 can instead use a loopback-only
Vite development proxy; that does not alter Core or supply production hosting.
Production needs HTTPS and either a same-origin API reverse proxy or reviewed
explicit Core CORS. Credentials/tokens must never travel over remote plain HTTP.
