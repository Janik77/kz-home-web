# KZ Home Web v0.3 — Core integration foundation

Started clean on `feature/core-integration-v0.3` at
`ef5a2bbc3516a6ec8e87c722e0ecd4555c8dd2d2`. Core started clean on `main` at
`d1124e461715bec01c24c987e97a46cfbc02427a` and was read-only throughout.
Web README/docs, existing structure, source boundaries and Git state were
inspected before editing. Core's requested documents were read before inspecting
active routers, schemas, auth/RBAC implementation and relevant contract tests.
The [HTTP contract](CORE_HTTP_CONTRACT.md) was written before adapter implementation.

## Delivered and preserved architecture

- Existing React/strict TypeScript/Vite/Router/Query stack, v0.2 tokens/components,
  routes and HomeRepository boundary retained. No dependency added.
- Explicit mock/Core composition; validated public environment and safe sample.
- Fetch-based JSON HTTP client, runtime DTO checks, abort/15-second deadline,
  cookie omission, no response cache, redirect refusal and safe typed errors.
- Real Core login/me, memory-only bearer/rotating-refresh session and logout.
  Single-flight rotation, one GET retry, no rotating-refresh replay, explicit
  expiration/revocation-failure feedback, and cache cancellation/isolation.
- Accessible-house selection and house-scoped floor/room/device/scene mapping.
  Core reads display supported complete state and partial/other reported state.
  No mock photos, favorites, locations, measurement timestamps or scene purpose
  are inserted into a real home. Unknown state is never defaulted to off/zero.
- Read-only Core UI with Refresh home and account/house settings. Real device and
  scene mutations reject before HTTP. Authentication is the only enabled POST path.
- Mock controls, scenes, themes, responsive navigation and existing 23 regression
  unit/component tests preserved. No mock fixture or mock adapter implementation
  was changed. Package/lock metadata identify 0.3.0.

## Actual contract and blockers

Core has no API prefix. Login accepts email/password JSON; refresh/logout accept
refresh_token JSON; me uses Authorization Bearer. Access defaults to 15 minutes,
refresh to 30 days, configurable by Core. Refresh tokens rotate and are revoked
server-side. Logout does not revoke already-issued access JWTs. Web uses no
credential browser storage and makes no protected-cookie-session claim.

Authenticated GETs used: /auth/me, /houses, /houses/{id}, /floors, /rooms,
/devices?house_id={id}, /scenes. Lists are bare arrays scoped by Core's membership
permissions. Web filters unfiltered floor/room/scene lists to the chosen house.
Foreign resource 404 and member-without-permission 403 remain distinct from 401.
Technicians may receive no scenes because they lack scene.read.

Core has no CORS middleware. Web offers a loopback Vite dev proxy; direct
cross-origin use needs separately approved explicit Core origin/header/method
configuration. Production HTTPS/same-origin routing or CORS remains operator work.
Browser WebSockets cannot supply Core's required Authorization upgrade header.
No alternate auth transport was invented. Device state has no guaranteed freshness
or measurement timestamp, and HTTP mutation acceptance is not physical success.
Onboarding/lifecycle, recovery, permission summaries and commands remain outside
Web v0.3. See the contract for exact evidence and unsupported product fields.

## Configuration and local development

`.env.example` is ready to track; local `.env`, `.env.*` and `*.local` remain ignored.
VITE_DATA_MODE defaults to mock; Core requires a safe VITE_API_URL.
CORE_DEV_PROXY_TARGET configures only the dev server. No credentials/secrets are
present in the example. Invalid Core configuration never falls back to mock.
See [exact local procedure and session limits](CORE_INTEGRATION.md).

## Final validation

| Check | Result |
| --- | --- |
| npm run typecheck | Passed |
| npm run lint | Passed, 0 warnings |
| npm test | 67 passed across 12 files |
| npm run build (mock/default) | Passed |
| Core-configured npm run build -- --outDir dist/core | Passed |
| Mock development Playwright | 25 passed at five widths |
| Core development Playwright, intercepted contract fixtures | 15 passed at five widths |
| Core production preview Playwright, intercepted contract fixtures | 15 passed at five widths, including Rooms and room detail |
| git diff --check | Passed |

Browser widths: 1440, 1024, 834, 390 and 320px. Installed Chrome was used because
the in-app browser execution tool was unavailable. Mock checks include existing
keyboard/reduced-motion/theme/controls/scene/image/overflow/axe coverage. Core
checks include keyboard form submit, invalid login, Core unavailability, empty
houses/devices/scenes, partial/offline state, authenticated navigation, house
switching without cached data leakage, read-only controls, session expiry,
logout and absence of token browser storage. Core production checks navigate
Rooms and room detail as well as Home, Scenes and Settings.

Core axe/overflow checks cover login (including failures/dark post-signout), Home
in both themes, Scenes, Rooms, room detail, Settings, empty-house and expired-session
views at each width. Successful-flow console/runtime checks found no errors;
intentional 401/503 responses are exercised separately. Desktop dark Home, mobile
light login and compact dark Home screenshots were visually inspected. Safari,
Firefox, physical devices and full assistive-technology conformance remain untested.

The first Core browser run exposed a native-fetch receiver binding error that
Node fetch mocks did not reveal; the detached call and a unit regression test
fixed it. Two test locators were tightened to distinguish loading headings and
use the house combobox's accessible role. Passing results refer to later runs.
Playwright reports an environment NO_COLOR/FORCE_COLOR warning; no application
failure follows from it.

**Real Core E2E was not run.** A minimal unauthenticated GET to
http://127.0.0.1:8000/health failed to connect. No Core instance was started, no
account provisioned, no database/installation/device data changed. Intercepted
contract responses verify Web behavior, not the running backend contract/CORS
or physical device state. Core tests were read as evidence, not executed.

## Git safety and next smallest milestone

Web changes remain unstaged; HEAD/branch are unchanged. Core remains clean on
main at the starting HEAD. All 121 tracked Core files matched their starting
SHA-256 byte hashes. No Core files were written/created and no branch/history
operation, commit, push, merge, PR or deployment was performed.

Next smallest milestone: controlled **live read/auth acceptance** with an
independently managed disposable Core instance/account. Prove login, scoped
house/room/device/scene reads, refresh rotation, logout and negative RBAC through
the browser/proxy before enabling physical commands. Real controls should follow
only after command acknowledgment/outcome semantics are agreed with Core.

## Exact Web file inventory

Generated/ignored output is excluded. This includes the report itself.

- Modified: `README.md`
- Modified: `docs/ARCHITECTURE.md`
- Modified: `docs/ASSETS.md`
- Modified: `docs/DESIGN_SYSTEM.md`
- Modified: `docs/MILESTONE.md`
- Modified: `docs/UI_REFINEMENT_V0.2.md`
- Modified: `package-lock.json`
- Modified: `package.json`
- Modified: `playwright.config.ts`
- Modified: `src/app/app-shell.tsx`
- Modified: `src/data/home-repository.ts`
- Modified: `src/domain/home.ts`
- Modified: `src/domain/selectors.ts`
- Modified: `src/features/devices/device-card.tsx`
- Modified: `src/features/devices/device-grid.tsx`
- Modified: `src/features/devices/device-groups.tsx`
- Modified: `src/features/home/availability-notice.tsx`
- Modified: `src/features/home/home-data-boundary.tsx`
- Modified: `src/features/home/home-page.tsx`
- Modified: `src/features/home/home-summary.tsx`
- Modified: `src/features/home/use-home.ts`
- Modified: `src/features/rooms/room-card.tsx`
- Modified: `src/features/rooms/room-page.tsx`
- Modified: `src/features/rooms/rooms-page.tsx`
- Modified: `src/features/scenes/scene-controls.tsx`
- Modified: `src/features/scenes/scene-details.tsx`
- Modified: `src/features/scenes/scenes-page.tsx`
- Modified: `src/features/settings/settings-page.tsx`
- Modified: `src/main.tsx`
- Modified: `src/styles/components.css`
- Modified: `tsconfig.node.json`
- Modified: `vite.config.ts`
- Created: `.env.example`
- Created: `docs/CORE_FOUNDATION_V0.3.md`
- Created: `docs/CORE_HTTP_CONTRACT.md`
- Created: `docs/CORE_INTEGRATION.md`
- Created: `e2e/core.spec.ts`
- Created: `playwright.core.config.ts`
- Created: `src/app/core-workspace.test.tsx`
- Created: `src/app/core-workspace.tsx`
- Created: `src/app/runtime-context.ts`
- Created: `src/config/environment.test.ts`
- Created: `src/config/environment.ts`
- Created: `src/data/core/core-home-repository.ts`
- Created: `src/data/core/dtos.ts`
- Created: `src/data/core/errors.ts`
- Created: `src/data/core/http-client.test.ts`
- Created: `src/data/core/http-client.ts`
- Created: `src/data/core/mapping.test.ts`
- Created: `src/data/core/mapping.ts`
- Created: `src/data/core/session.test.ts`
- Created: `src/data/core/session.ts`
- Created: `src/data/create-services.test.ts`
- Created: `src/data/create-services.ts`
- Created: `src/domain/session.ts`
- Created: `src/features/auth/login-page.tsx`
- Created: `src/test/core-fixtures.ts`
