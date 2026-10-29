# Web v0.4 — live Core acceptance

Verified on 2026-10-29 against the independently running local Docker Core at
`http://127.0.0.1:18000`. Core source revision:
`de500d1ff328f36071b0197181c897c112750a1f`. Web started at `5709551` on
`feature/live-core-acceptance-v0.4`; Core remained clean on `main`.

## Local configuration and repeatable run

Ignored Web `.env.local` contains only:

```dotenv
VITE_DATA_MODE=core
VITE_API_URL=/core-api
CORE_DEV_PROXY_TARGET=http://127.0.0.1:18000
```

No tokens, passwords or signing keys are in frontend environment configuration.
`npm.cmd run dev -- --port 5173 --strictPort` opens normal Core-mode Web at
`http://127.0.0.1:5173`. Sign in with an operator-provisioned account; registration
is not exposed by Core. The acceptance account is automatically removed, so its
credentials are intentionally not published or left available for manual login.
To use mock mode set `VITE_DATA_MODE=mock` and restart Vite.

The isolated acceptance server uses port 5175 and refuses to reuse an existing
server. First check Core's configured SDK with the IDE `get_python_environment`
tool. This run returned `C:/projects/kz-home-core/.venv/Scripts/python.exe`.
It requires the existing Core SDK dependencies; it installs nothing in Core.

```powershell
cd C:\projects\kz-home-web
$env:LIVE_CORE_ACCEPTANCE = '1'
$env:LIVE_CORE_PYTHON = 'C:/projects/kz-home-core/.venv/Scripts/python.exe'
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm.cmd run test:e2e:live
```

`LIVE_CORE_SOURCE` optionally points to the read-only Core checkout; default is
`C:/projects/kz-home-core`. All these settings belong to the test runner, not
VITE-prefixed configuration. Source imports disable bytecode writes. The fixture
reads Docker runtime settings without printing credentials, checks project,
loopback port bindings and the isolated PostgreSQL volume, and refuses a nonlocal
database. There are no Compose lifecycle, volume or container mutations.

## Actual HTTP and PostgreSQL evidence

The live Playwright suite uses Chrome at 1440/1024/834/390/320 widths. It has no
request routing, response fulfillment or token fixtures. Browser requests use
the actual `/core-api` Vite proxy to Core. Token-bearing traces, screenshots and
video are disabled. Credentials and token responses remain in process memory.

Each run verifies:

- `/health` and `/ready` return 200; unauthenticated `/auth/me` and `/houses`
  return 401.
- Form login calls real `/auth/login` (200) and `/auth/me` (200). A fresh account
  has no accessible houses and displays the corresponding empty state.
- After isolated fixture setup and a new login, house selection displays actual
  house, floor, room, device and scene reads. A reported light shows 37%, an
  offline relay preserves its empty state, and scene details show the stored
  multi-field action without executing it.
- Switching to a truly empty second house clears prior data and displays empty
  rooms, devices and scenes. No sample photos or state are substituted.
- Advancing only the browser wall clock by 16 minutes makes the unmodified Web
  session rotate tokens through real `/auth/refresh` (200). Core's server clock,
  JWTs, access lifetime and responses are unchanged. Replaying the consumed
  refresh token returns 401. This tests proactive rotation, not a claim that
  15 minutes elapsed on Core or that server-expired access was tested live.
- Browser logout calls `/auth/logout` (204), clears the workspace and revokes
  the current refresh session; refresh replay returns 401. As Core documents,
  the already-issued access token still accesses `/auth/me` until expiry.
  Re-login succeeds; reload after final logout remains signed out.
- Separate operator PostgreSQL connections read committed HTTP-created houses,
  room, scene and device state, and count active/revoked refresh sessions.
  After browsing, the light remains at 37% rather than the scene's 25%.
- The entire browser request log permits only GET plus authentication POSTs.
  There are no device commands or scene execution requests; UI controls remain
  unavailable. Browser local/session storage contains no authentication state.

## Disposable fixtures and cleanup

Core has no public registration route. The operator helper calls Core's actual
`UserService(UserRepository(session)).create` with a random password and unique
`web-live-<128-bit random id>@example.invalid` email. It does not use demo seeds,
existing accounts or global migration/setup commands.

Operator-side HTTP then creates two unique houses with owner membership, one
floor/room, two ordinary unbound device records and a scene. No physical identity,
activation, device-state command or scene execution is involved. These setup
writes are separate from the read-only browser product flow.

A `finally` block deletes only that generated account's refresh sessions and
memberships and the two exactly named houses with their dependent fixture rows.
It refuses cleanup if another account has membership in those houses. Independent
reads assert the fixtures are absent afterward. Core's anonymous authentication
audit events are retained; existing audit/user data is never globally purged.
If the runner is forcibly killed, scoped fixtures can remain: inspect before
cleanup and never run broad prefix deletion against user data.

## Boundaries and next milestone

There is no live contract/auth incompatibility on the proxy path. Core has no
CORS middleware: a real OPTIONS preflight to `/auth/login` returned 405 with no
`Access-Control-Allow-Origin`, so direct cross-origin browser use remains unsupported; the
existing same-origin development proxy resolves local access. Production HTTPS,
routing/CORS, persistent protected sessions, WebSocket authentication, and device
command confirmation remain outside this milestone. Existing fixture-based
tests still cover simulated errors and UI regression; they are not live evidence.

The next milestone should define and verify production same-origin HTTPS routing
and session policy. Keep physical device control gated until a separately
approved command/ACK acceptance contract exists.

## Validation results

| Command/check | Result |
| --- | --- |
| `npm.cmd run typecheck` | Passed |
| `npm.cmd run lint` | Passed, zero warnings |
| `npm.cmd test` | 67 tests / 12 files passed |
| `npm.cmd run build` in Core and mock modes | Both passed |
| `npm.cmd run test:e2e:live` | 5 live browser tests passed, all five widths |
| `npm.cmd run test:e2e` | 25 mock browser regression tests passed |
| `npm.cmd run test:e2e:core` | 15 intercepted-contract browser tests passed |
| `git diff --check` | Passed |
| Core `docker compose ... config --quiet`, service health | Passed; three services healthy, migrate exited 0 |
| Independent final `psql` cleanup reads | Zero disposable users, houses, rooms, devices and scenes; migration `0005_device_onboarding` |

No application/UI/adapter behavior change was needed: the existing foundation
worked with actual Core. Added acceptance infrastructure is opt-in and excluded
from normal mock/contract browser runs. Package/lockfile version is 0.4.0;
dependencies did not change. Historical v0.3 UI labels remain as supplied.

Final Web inventory (unstaged/untracked; no commit or branch change):

- Modified: `.env.example`, `README.md`, `docs/CORE_HTTP_CONTRACT.md`,
  `docs/CORE_INTEGRATION.md`, `package.json`, `package-lock.json`,
  `playwright.config.ts`, `tsconfig.node.json`.
- Added: `docs/LIVE_CORE_ACCEPTANCE_V0.4.md`, `playwright.live.config.ts`,
  `e2e/live-core.spec.ts`, `e2e/live-core-support.ts`, `e2e/live-core-fixture.py`.
- Ignored local configuration: `.env.local` (not tracked). Generated builds and
  test artifacts remain ignored.

Core remains clean on `main`; no Core/Firmware files, Docker containers or volumes
were changed, reset or removed. Only isolated local DB fixture rows and their
authentication sessions were created/cleaned, with anonymous auth audit retained.
Production volume metadata stayed unchanged and those volumes were not mounted
by the local stack. No commits, pushes, merges or PRs were performed.
