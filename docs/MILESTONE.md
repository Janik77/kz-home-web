# Foundation 0.1 milestone report

This is a historical report of v0.1. Its validation and Git state describe that milestone only. See [v0.2 UI refinement](UI_REFINEMENT_V0.2.md) for the previous UI milestone and [v0.3 Core foundation](CORE_FOUNDATION_V0.3.md) for current behavior and validation.

Implemented on `feature/web-foundation-v0.1`. The initial repository contained only `README.md` and untracked IDE settings. Those settings were inspected and preserved; `.idea/` is now ignored. Backend and firmware repositories were not accessed.

## Delivered

- React 19, strict TypeScript 5.9, Vite 8, React Router 7, and TanStack Query 5.
- Separate composition, domain, data adapter, feature, and shared UI layers.
- KZ Home wordmark and SVG favicon; semantic design tokens with light/dark/system themes.
- Responsive shell with desktop/tablet sidebar and mobile bottom navigation.
- Home dashboard with local photography, climate/lighting/connectivity summary, scenes, room cards and favorites.
- Room overview, floor filters, individual room controls, and unknown-room recovery.
- Light power/brightness, relay power, curtain position, read-only sensors, and disabled offline controls.
- Quick scenes plus inspectable scene actions and explicit partial-execution feedback.
- Appearance settings, optional theme persistence, pre-paint theme initialization.
- Loading, empty, data error/retry, mutation error, render-error and unknown-route foundations.
- Keyboard semantics, visible focus, skip navigation, route focus/title handling, live feedback and reduced motion.
- Architecture, design-system, asset-provenance and development documentation.

## Validation

| Check | Result |
| --- | --- |
| Dependency installation | Passed; lockfile generated; installation audit reported 0 vulnerabilities |
| `npm run typecheck` | Passed, including app, domain, tests and tooling |
| `npm run lint` | Passed, 0 warnings, supported ESLint 10 |
| `npm test` | 9 tests passed across 3 files |
| `npm run build` | Passed; optimized JS approximately 333 kB / 104 kB gzip, CSS approximately 30 kB / 9 kB gzip |
| Development browser suite | 16 tests passed at 1440, 834, 390 and 320px |
| Production preview browser suite | 8 tests passed on desktop and mobile |
| Rendered accessibility | 0 axe WCAG A/AA violations in tested dashboard themes and routes |
| Rendered behavior | Device power, keyboard sliders, scenes/offline skips, floor filtering, navigation, unknown routes, theme persistence/system changes and reduced motion passed |
| Browser health | No tested browser runtime errors, broken images or horizontal overflow |
| Visual review | Desktop light/dark and mobile screenshots reviewed |
| `git diff --check` | Passed |

Browser validation used installed Chrome through Playwright because the in-app browser execution tool was unavailable. Generated screenshots, traces, build output, dependencies, and IDE settings are ignored. No deployment configuration was created.

## Limits and next block

The single sample house is in memory; reloading resets devices and scenes. Sensor readings and connectivity are sample values. There is no real authentication, Core transport, onboarding, scene editor, automations, notifications, energy monitoring, or AI integration. Browser validation covers Chrome; Safari/Firefox, physical mobile devices, and a full assistive-technology audit remain follow-up work.

The next smallest block is a **read-only Core home adapter**, starting with verified Core API documentation and session requirements. Map house, floor, room and device reads into the existing frontend domain and exercise real loading/error states. Agree command acknowledgment and physical-state semantics before enabling real controls.

## Git state

Branch remains `feature/web-foundation-v0.1`. `README.md` is modified and foundation files are untracked. Nothing is staged. No commit, push, merge, PR, or history change was performed.

## Exact files created/changed

The inventory below excludes generated/ignored files and includes this report. `README.md` is the only modified pre-existing project file; all other listed files are newly created.

- `.editorconfig`
- `.gitattributes`
- `.gitignore`
- `docs/ARCHITECTURE.md`
- `docs/ASSETS.md`
- `docs/DESIGN_SYSTEM.md`
- `docs/MILESTONE.md`
- `e2e/home.spec.ts`
- `eslint.config.js`
- `index.html`
- `package.json`
- `package-lock.json`
- `playwright.config.ts`
- `public/favicon.svg`
- `public/images/bedroom.jpg`
- `public/images/kitchen.jpg`
- `public/images/living-room.jpg`
- `public/images/office.jpg`
- `public/theme-init.js`
- `README.md`
- `src/app/app.tsx`
- `src/app/app-shell.tsx`
- `src/app/error-boundary.tsx`
- `src/app/navigation-effects.tsx`
- `src/app/services.tsx`
- `src/app/theme-context.ts`
- `src/app/theme-provider.tsx`
- `src/components/brand/wordmark.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/page-heading.tsx`
- `src/components/ui/range-control.tsx`
- `src/components/ui/section-heading.tsx`
- `src/components/ui/state-panel.tsx`
- `src/components/ui/switch.tsx`
- `src/data/home-repository.ts`
- `src/data/mock/fixtures.ts`
- `src/data/mock/mock-home-repository.test.ts`
- `src/data/mock/mock-home-repository.ts`
- `src/domain/home.ts`
- `src/domain/selectors.test.ts`
- `src/domain/selectors.ts`
- `src/features/devices/device-card.tsx`
- `src/features/devices/device-grid.tsx`
- `src/features/home/home-data-boundary.test.tsx`
- `src/features/home/home-data-boundary.tsx`
- `src/features/home/home-page.tsx`
- `src/features/home/home-summary.tsx`
- `src/features/home/use-home.ts`
- `src/features/rooms/room-card.tsx`
- `src/features/rooms/room-grid.tsx`
- `src/features/rooms/room-page.tsx`
- `src/features/rooms/rooms-page.tsx`
- `src/features/scenes/scene-controls.tsx`
- `src/features/scenes/scenes-page.tsx`
- `src/features/settings/settings-page.tsx`
- `src/main.tsx`
- `src/styles/components.css`
- `src/styles/global.css`
- `src/styles/layout.css`
- `src/styles/tokens.css`
- `src/test/setup.ts`
- `tsconfig.app.json`
- `tsconfig.json`
- `tsconfig.node.json`
- `vite.config.ts`
