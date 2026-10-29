# Core integration — v0.4

The [verified HTTP contract](CORE_HTTP_CONTRACT.md) records actual Core sources,
schemas and tests at `d1124e4`, rechecked against live OpenAPI and Core source
`de500d1` for v0.4. No Core file is changed by this milestone. The separate
[live acceptance procedure/report](LIVE_CORE_ACCEPTANCE_V0.4.md) describes
disposable operator fixtures and actual browser HTTP verification.

## Configuration

Copy `.env.example` to `.env.local` **in kz-home-web**. Both are frontend development
configuration; the example is tracked-ready and `.env` / `.env.*` / `*.local` are
already ignored (except the example). Every VITE variable is public build input.

| Variable | Meaning |
| --- | --- |
| `VITE_DATA_MODE` | `mock` or `core`; absent means mock |
| `VITE_API_URL` | Required in Core mode; e.g. `/core-api` or approved HTTPS Core base URL |
| `CORE_DEV_PROXY_TARGET` | Vite development server only; local Docker Core is `http://127.0.0.1:18000` |

Invalid Core configuration shows a configuration error; it never silently
substitutes sample data. URLs reject embedded credentials, query/fragment tokens,
non-HTTP schemes and remote plain HTTP. HTTP is allowed only for loopback
development. Remote credentials require HTTPS. Tokens/passwords, signing keys,
MQTT credentials and database settings do not belong in any frontend environment
file. Vite does not expose CORE_DEV_PROXY_TARGET to the client.

## Exact local procedure

1. Have an independently managed, migrated local Core instance available at
   `http://127.0.0.1:18000`, with an existing active user and house membership.
   Core's operator owns its setup. Web does not migrate, seed, start, or change
   Core. Never use production accounts/data for disposable acceptance testing.
2. In `C:/projects/kz-home-web`, run `npm.cmd ci` if dependencies are absent.
3. Copy `.env.example` to `.env.local`; set `VITE_DATA_MODE=core`, keep
   `VITE_API_URL=/core-api` and the loopback CORE_DEV_PROXY_TARGET.
4. Run `npm.cmd run dev -- --port 5173 --strictPort`. Open
   `http://127.0.0.1:5173` (the default bind is loopback). Restart Vite after
   changing environment configuration.
5. Sign in using the existing Core account. Choose a house if more than one is
   accessible. Browse Home, Rooms, room detail and Scenes. Use Refresh home to
   fetch another snapshot; use Account & homes to switch house or sign out.
6. To return to isolated UI development, set VITE_DATA_MODE=mock and restart.

The Vite proxy forwards `/core-api/...` to `/...` on the configured Core target.
It does not bypass Core bearer authentication or house RBAC and does not add a
frontend backend. Direct cross-origin use still requires the exact Core CORS
change described in the contract. `vite preview` is a static-bundle check, not
this development proxy. Production needs separately reviewed same-origin API
routing or Core CORS plus HTTPS; no deployment infrastructure is provided.

## Authentication and cache ownership

CoreSession keeps access and refresh tokens only in per-tab JavaScript memory.
Credentials are taken from the native form and the password field is cleared
immediately. No credential is stored in React state, Query, localStorage,
sessionStorage, URL or console. The browser/password manager can independently
offer password autofill; Web does not persist it.

Login is POST JSON followed by an authenticated GET /auth/me. Only a verified
active current user opens the workspace. Reloading or opening another tab starts
at login. Persistent login is deliberately unavailable; Core has no protected
cookie-session contract. Memory still has the normal browser XSS exposure, so
this is not a claim of XSS-proof token storage.

Reads refresh the pair near the returned expires_in deadline or after one access
401. Concurrent requests share one rotation; a later stale 401 uses the current
pair. A 403 is never treated as expiration. Only the failed GET is retried once;
rotating refresh is not automatically replayed after a lost response. Failed
rotation clears the local session and requires sign-in. Idle sessions are checked
on the next read, not kept alive by a background timer.

Signout removes the workspace, cancels/clears Query data and revokes the current
refresh token with Core. An already-running rotation settles before revocation.
Local tokens are discarded even when revocation fails; login then explains that
remote revocation could not be confirmed. Core logout does not invalidate issued
access JWTs; they remain valid until expiration/deactivation. Reload/closing a tab
cannot guarantee server revocation because in-memory credentials are discarded.

House lists are scoped to the current user. Each selected house gets its own
repository and QueryClient; switching clears/cancels the previous cache. Auth
changes unmount that scope and clear the house-list cache. Late requests cannot
reopen a signed-out session. House membership lists are refreshed on sign-in or
explicit retry after an empty/error result; this is not a live permissions feed.

## Domain mapping and scope

Components consume existing domain models through HomeRepository, never DTOs.
`data/core/dtos.ts` checks consumed fields at runtime. `mapping.ts` filters
accessible floor/room/scene lists by the selected house, orders floors by Core
order, and maps house-filtered devices. Inconsistent device location fails
visibly instead of silently hiding records. Separate GETs are not an atomic
snapshot; a concurrent structure change may require a retry.

Complete lights, relays/sockets/switches and curtains reuse existing card state.
Non-dimming/incomplete lights do not invent brightness. Empty states and other
types have a general read-only reported-state card. Single-field temperature and
humidity sensors contribute only the numeric measurement actually present to
room/home summaries. Updated_at is never labeled as a measurement timestamp.
There is no freshness guarantee or real-time subscription.

Core provides no photos, room descriptions, location, favorites or scene purpose
copy. Those fields remain empty; room cards use neutral surfaces. Home shows all
devices rather than invented favorites. Scene read actions preserve each action's
device and state-field descriptions, including multiple fields per action.

Core controls are unavailable in UI and rejected by the repository before any
HTTP call. The only POSTs are login, refresh and logout. Mock controls and their
confirmed/pending/failure behavior remain intact. Core scene reads reflect
permissions; an empty scene list is not proof the house has no stored scenes.
No roles, onboarding, account recovery, WebSocket fallback, MQTT or mutation
acknowledgment behavior is invented.

## Testing and verification boundary

`npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`,
`npm.cmd run build`, `npm.cmd run test:e2e` (mock), and
`npm.cmd run test:e2e:core` (Core frontend with intercepted contract fixtures).
Use `$env:PLAYWRIGHT_CHANNEL = 'chrome'` for installed Chrome. Both browser suites
cover 1440/1024/834/390/320 widths. The Core suite uses its own dev port 5174,
explicit Core environment, and separate artifacts under test-results/core.
Never point these disposable fixture tests at a real account or claim they
constitute live Core acceptance.

The [historical v0.3 report](CORE_FOUNDATION_V0.3.md) records fixture-only results
when Core was unavailable. The [v0.4 live report](LIVE_CORE_ACCEPTANCE_V0.4.md)
separately records actual local Core login/read/refresh/logout acceptance.
