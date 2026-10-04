# KZ Home Web

A consumer control interface for KZ Home, built independently of `kz-home-core` and `kz-home-firmware`. The current milestone is **v0.2: product UI/UX refinement**.

Home opens with connectivity, lighting and climate status, offline-device attention, and frequently used controls. Rooms provide availability summaries and grouped control surfaces. Scenes show their purpose, affected rooms/devices and inspectable actions, with explicit execution results. Appearance settings remain simple. **All home data and commands are simulated** behind the existing repository boundary. The interface labels this as a local preview. No authentication, backend transport, MQTT, or deployment infrastructure is included.

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
  features/
    home/              Dashboard, query/control hooks, data states, summary
    rooms/             Overview, floor filter, room detail and cards
    devices/           Device cards and command presentation
    scenes/            Quick controls, scene details and feedback
    settings/          Appearance preference and preview information
  styles/              Semantic tokens, global rules, components and layout
  test/                Unit/component test setup
e2e/                   Rendered browser tests
public/                Local imagery, favicon, pre-paint theme initialization
docs/                  Architecture, design system and image sources
```

See [architecture and Core integration](docs/ARCHITECTURE.md), [design system](docs/DESIGN_SYSTEM.md), [image sources](docs/ASSETS.md), the [v0.2 report](docs/UI_REFINEMENT_V0.2.md), and the [historical v0.1 report](docs/MILESTONE.md).

## Mock data and future Core integration

Only `src/data/mock/` defines the sample home or simulates device changes. `src/main.tsx` injects that adapter through `RepositoryProvider`. Features use query hooks and domain models; they never import fixtures, perform network requests, or know transport details.

The next API milestone should begin with the actual Core documentation and authentication model. Add an adapter that maps verified Core responses into frontend domain models, then replace the repository injection. No backend endpoint, payload, authentication behavior, or event protocol has been assumed. See the architecture document for handling confirmed device state, concurrency, errors, and multiple houses.

## Current scope

- One sample house, two floors, four rooms and ten devices.
- Light brightness/power, relay power, curtain position, and read-only climate sensors.
- Availability summaries and offline-device links, with room controls grouped by capability.
- Confirmed device state, visible pending/failure/success feedback and explicit command retries.
- Sliders preserve their input node and keyboard focus, reset rejected drafts, and cancel interrupted pointer changes.
- Four scenes with inspectable actions, explicit run buttons, affected rooms/devices, and full/partial/no-update/failure results.
- Light, dark, and system appearance; only appearance is persisted.
- Loading, empty, recoverable data errors, render errors, and unknown routes.
- Desktop sidebar, tablet layout, and mobile bottom navigation.

Reloading resets the simulated home. Photos are illustrative and appear in room cards and a compact desktop room identifier, rather than a Home hero. Sensor timestamps are fixed fixture values; device cards show the measurement date/time in the browser locale. The global preview indicator and Settings explain the sample data. Future accounts, onboarding, automations, energy, notifications, and AI are not represented as working integrations. Browser history routing will eventually require a host fallback to `index.html`, but no hosting configuration is added here.
