# KZ Home Web

A consumer interface for KZ Home. The current milestone is **v0.5: premium UI/UX redesign** with warm ivory/graphite themes, an architectural visual language and explicit device-state semantics. Core/mock repositories, session handling and read-only real controls are preserved. See the [v0.5 report](docs/PREMIUM_REDESIGN_V0.5.md) and the historical [v0.4 live acceptance procedure](docs/LIVE_CORE_ACCEPTANCE_V0.4.md). Firmware remains separate.

Home, Rooms, room detail, Scenes and appearance settings retain the v0.2 design. **Mock mode** remains an isolated local preview with simulated controls. **Core mode** provides real JSON login, in-memory bearer sessions, house selection and read-only home data through the existing repository boundary. Real device control and scene execution are deliberately unavailable. No browser MQTT, frontend backend or deployment infrastructure is included.

## Development

Use Node.js 22.12+ (Node 24 LTS recommended) and npm. The lockfile is checked into the working tree for reproducible installs.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. On Windows PowerShell with script execution restricted, use `npm.cmd` in place of `npm`.

```sh
npm run typecheck   # strict TypeScript, including test/config files
npm run lint        # ESLint; warnings fail
npm test            # domain, adapter, and error-recovery tests
npm run test:watch  # interactive unit test runner
npm run build       # type check and optimized production bundle
npm run preview     # inspect the built bundle locally
```

For browser tests, either install Playwright’s Chromium once or use an existing Chrome/Edge installation:

```sh
npx playwright install chromium
npm run test:e2e
npm run test:e2e:core # Core frontend against intercepted contract responses, not live Core
```

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome' # or 'msedge'
npm.cmd run test:e2e
```

The browser suite starts a local Vite server if needed. It covers **1440, 1024, 834, 390, and 320px**, device and scene controls, keyboard focus, reduced motion, theme persistence, touch-target geometry, broken images, overflow, console/runtime errors, and axe WCAG checks. Both themes are checked on Home, Rooms, room detail, Scenes and Settings. Screenshots and failure traces are saved under the ignored `test-results/` directory. Automated checks supplement manual review; they do not establish complete accessibility conformance.

To test a production bundle, run `npm run build`, start `npm run preview -- --port 4182 --strictPort`, and set `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4182` before `npm run test:e2e`. In PowerShell, assign it with `$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:4182'`. Keep the preview server running while the tests execute.

## Stack

React 19 and strict TypeScript provide a typed component foundation. Vite 8 supplies fast local development and static builds. React Router 7 owns browser navigation; TanStack Query 5 owns asynchronous data, request cancellation, and confirmed command results. Native CSS, a locally hosted Manrope font, and Lucide icons keep presentation lightweight without a component framework or animation library.

Local control state lives near each component. Server-like home state lives in Query’s cache. Theme preference uses a small context and optional browser storage. There is no global state library or persistence of device state.

## Structure

```text
src/
  app/                 Composition, routing, shell, theme, error boundary
  components/
    brand/             KZ Home wordmark
    ui/                Small reusable, accessible UI foundations
  domain/              Framework-independent home models and selectors
  data/
    home-repository.ts Application data boundary (not a wire contract)
    mock/              Fixtures and isolated in-memory adapter
    core/              HTTP, session, validated DTOs, mapping, read-only adapter
  config/              Validated public environment selection
  features/
    home/              Dashboard, query/control hooks, data states, summary
    rooms/             Overview, floor filter, room detail and cards
    devices/           Device cards and command presentation
    scenes/            Quick controls, scene details and feedback
    settings/          Appearance preference and preview information
    auth/              Real Core sign-in/session feedback
  styles/              Semantic tokens, global rules, components and layout
  test/                Unit/component test setup
e2e/                   Rendered browser tests
public/                Local imagery, favicon, pre-paint theme initialization
docs/                  Architecture, design system and image sources
```

See [architecture](docs/ARCHITECTURE.md), [verified Core contract](docs/CORE_HTTP_CONTRACT.md), [Core configuration and local procedure](docs/CORE_INTEGRATION.md), [v0.3 report](docs/CORE_FOUNDATION_V0.3.md), [design system](docs/DESIGN_SYSTEM.md), [image sources](docs/ASSETS.md), and the historical [v0.2](docs/UI_REFINEMENT_V0.2.md) / [v0.1](docs/MILESTONE.md) reports.

## Mock and Core modes

Only `src/data/mock/` defines the sample home or simulates device changes. `createServices` chooses the adapter from validated configuration; `RepositoryProvider` still injects the selected house repository. Features use query hooks and domain models, never transport DTOs or raw fetch. Core mode is labeled **Core · Read only**; mock mode remains labeled **Local preview**.

Copy `.env.example` to ignored `.env.local` in Web. Default `VITE_DATA_MODE=mock` needs no Core. To connect the independently managed local Docker Core, set `VITE_DATA_MODE=core`, `VITE_API_URL=/core-api`, and `CORE_DEV_PROXY_TARGET=http://127.0.0.1:18000`, then restart Vite. The local proxy handles differing development origins without editing Core, whose current implementation has no CORS middleware. It is not a production routing solution. Remote connections require HTTPS.

Sign in with an existing Core account; Web provides no registration or recovery. Access and rotating refresh tokens remain only in tab memory, and reload requires sign-in. Core-mode reads cover accessible houses, floors, rooms, devices and permission-scoped scenes. Missing photos/favorites/state values are not filled from mocks. See the [exact procedure and security/contract gaps](docs/CORE_INTEGRATION.md).

## Preserved mock scope

- One sample house, two floors, four rooms and ten devices.
- Light brightness/power, relay power, curtain position, and read-only climate sensors.
- Availability summaries and offline-device links, with room controls grouped by capability.
- Confirmed device state, visible pending/failure/success feedback and explicit command retries.
- Sliders preserve their input node and keyboard focus, reset rejected drafts, and cancel interrupted pointer changes.
- Four scenes with inspectable actions, explicit run buttons, affected rooms/devices, and full/partial/no-update/failure results.
- Light, dark, and system appearance; only appearance is persisted.
- Loading, empty, recoverable data errors, render errors, and unknown routes.
- Desktop sidebar, tablet layout, and mobile bottom navigation.

Reloading resets the simulated home. Mock photographs and sensor timestamps are illustrative fixture values. Core mode does not use them and preserves partial/unknown state in read-only cards. Onboarding, automations, energy, notifications and AI remain outside Web scope. `test:e2e:core` still intercepts contract fixtures; the separate opt-in `test:e2e:live` suite uses actual Core HTTP, disposable accounts and PostgreSQL reads. Browser history routing will eventually require a host fallback to `index.html`, but no hosting configuration is added here.
