# KZ Home v0.2 — product UI/UX refinement

Implemented on `feature/ui-refinement-v0.2`, starting from a clean working tree at `28a8aae`. README, every existing document, source/configuration files, fixtures, repository behavior and tests were inspected before editing. The backend and firmware repositories were not accessed.

## Architecture

The React/TypeScript/Vite stack and UI → domain/query → HomeRepository → mock adapter direction are unchanged. Routes, providers, query keys, command serialization, adapter interface and mock command behavior are preserved. No dependency was added. Package and lockfile metadata now identify version 0.2.0.

New room/scene selectors derive summaries from existing domain values. Shared StatusBadge and Feedback components provide consistent availability and operation states. Device groups use a small capability configuration, with existing cards reused. The only mock-data edit is clearer scene-purpose text; no backend contract, authentication, MQTT, secret, transport, or deployment infrastructure was added.

## Product changes

- Home removes the photographic hero and prioritizes connectivity/lighting/climate, offline-device attention, favorites, rooms and scenes.
- Shared typography is smaller and spacing is more purposeful. The existing wordmark, font, sage palette and light/dark semantic surfaces remain.
- Sidebar context shows the house and device availability instead of marketing copy. Appearance settings retain only the supported preferences and preview information.
- Rooms show active-device count, available temperature, and explicit online/offline counts. Floor filtering is preserved.
- Room detail replaces a large banner with a compact desktop identifier, room status, and Lighting, Curtains, Power, and Climate & sensors groups. Mobile omits the identifier photo.
- Device cards separate availability from power/brightness/position and show pending, confirmed and failed attempts beside the affected control. Offline devices expose last-known state and no usable controls. Failures use homeowner-friendly text and explicit retries rather than raw adapter errors.
- Switches/ranges preserve focus while pending with guarded aria-disabled behavior. Confirmed data remains authoritative. Sliders retain their input node, discard rejected/old drafts, and cancel interrupted pointer changes without a command.
- Scenes have dedicated Run scene buttons, purpose, unique affected devices/rooms, unavailable-action warnings and expandable control lists. Results distinguish full success, partial success, no controls updated, and failure. Skipped counts describe controls, matching the existing adapter result semantics.
- Offline attention links open the affected room and focus its device. Heading levels follow the page/section hierarchy. Shared loading/empty/error foundations remain in use with more compact presentation.
- No blur, glow or decorative gradient remains. Navigation/action background animation was removed after rendered testing exposed temporary low contrast during theme changes.

## Exact validation results

| Check | Final result |
| --- | --- |
| `npm run typecheck` | Passed; strict application, tests and configuration typing |
| `npm run lint` | Passed; 0 warnings |
| `npm test` | 23 passed across 6 files |
| `npm run build` | Passed; JS 336.58 kB / 104.95 kB gzip; CSS 31.64 kB / 8.91 kB gzip |
| Development Playwright suite | 25 passed across five viewport projects |
| Production Playwright suite | 25 passed across the same five viewport projects |
| `git diff --check` | Passed |

The unit/component suite covers repository isolation, invalid/offline commands, cancellation, scene atomicity, selectors, data-error recovery, pending commands, duplicate guards, explicit retries, rejected drafts/focus, pointer cancellation, empty devices, partial/all-offline availability, and full/partial/all-skipped/failed scene execution. Deferred/rejecting repository implementations are injected only in tests; no artificial failure settings or API endpoints were added to the app.

Browser checks used installed Chrome through Playwright. The in-app browser execution tool was unavailable. The production suite targeted a built Vite preview on `http://127.0.0.1:4182`; the development server is at `http://127.0.0.1:5173`.

## Responsive and accessibility checks

| Width | Height | Dev tests | Production tests |
| --- | --- | --- | --- |
| 1440px | 1000px | 5 passed | 5 passed |
| 1024px | 900px | 5 passed | 5 passed |
| 834px | 1112px | 5 passed | 5 passed |
| 390px | 844px | 5 passed | 5 passed |
| 320px | 740px | 5 passed | 5 passed |

Home, Rooms, Living room detail, Scenes and Settings were checked with axe WCAG A/AA tags in both light and dark themes. Home office offline controls were also checked. The final runs found zero axe violations, horizontal overflow, console errors or runtime errors. All Home room images were checked for successful loading; the final image set is unchanged. Browser tests exercise keyboard power/slider/scene controls, retained slider focus, skip navigation, reduced motion, theme persistence/system changes, floor filtering, unknown routes, offline links/focus, and 44px switch/range geometry. Screenshots of Home, grouped room detail and expanded scene details were generated. Desktop, 1024px, tablet, mobile and compact screenshots were visually reviewed across light/dark samples.

The first development run found an animated-theme contrast problem and an overly strict nested-text test locator. Both were corrected; the later development and final production runs passed. Final results above refer to those passing runs.

## Limits

- One sample house; device/scene changes remain in memory and reset on reload.
- No Core connection, authentication, onboarding, scene editor, automations, notifications, energy or AI integration.
- Measurement timestamps and availability are fixture values. The preview indicator and Settings explain sample data; cards show the provided measurement date/time.
- Commands serialize across the home. Feedback represents the latest attempt in the mounted feature, not a persistent operation history or cross-route notification system.
- Real accepted-versus-confirmed physical-state behavior must be agreed with Core before integration; no assumptions were added here.
- Browser tests use Chrome with simulated viewport/touch conditions. Safari, Firefox, physical devices and full assistive-technology testing remain unverified. Axe does not establish full accessibility conformance.

## Next smallest milestone

Add a focused device-detail route for the four existing capabilities, reusing these controls and system states behind the same mock repository. This can strengthen device-level interaction without expanding into unsupported settings or introducing Core contracts.

## Git

Branch remains `feature/ui-refinement-v0.2`, HEAD remains `28a8aae`. Existing files are modified and new UI/test/report files are untracked. Nothing is staged. No commit, push, merge, PR or history edit was performed. Generated build/test output remains ignored.

## Files changed/created

The following inventory includes this report and excludes generated/ignored output. Entries marked modified are existing tracked files; entries marked created are new files.

- Modified: `docs/ARCHITECTURE.md`
- Modified: `docs/ASSETS.md`
- Modified: `docs/DESIGN_SYSTEM.md`
- Modified: `docs/MILESTONE.md`
- Modified: `e2e/home.spec.ts`
- Modified: `package.json`
- Modified: `package-lock.json`
- Modified: `playwright.config.ts`
- Modified: `README.md`
- Modified: `src/app/app-shell.tsx`
- Modified: `src/app/navigation-effects.tsx`
- Modified: `src/components/ui/range-control.tsx`
- Modified: `src/components/ui/switch.tsx`
- Modified: `src/data/mock/fixtures.ts`
- Modified: `src/domain/selectors.test.ts`
- Modified: `src/domain/selectors.ts`
- Modified: `src/features/devices/device-card.tsx`
- Modified: `src/features/devices/device-grid.tsx`
- Modified: `src/features/home/home-page.tsx`
- Modified: `src/features/home/home-summary.tsx`
- Modified: `src/features/rooms/room-card.tsx`
- Modified: `src/features/rooms/room-grid.tsx`
- Modified: `src/features/rooms/room-page.tsx`
- Modified: `src/features/rooms/rooms-page.tsx`
- Modified: `src/features/scenes/scene-controls.tsx`
- Modified: `src/features/scenes/scenes-page.tsx`
- Modified: `src/features/settings/settings-page.tsx`
- Modified: `src/styles/components.css`
- Modified: `src/styles/layout.css`
- Modified: `src/styles/tokens.css`
- Created: `docs/UI_REFINEMENT_V0.2.md`
- Created: `src/components/ui/feedback.tsx`
- Created: `src/components/ui/status-badge.tsx`
- Created: `src/features/devices/device-grid.test.tsx`
- Created: `src/features/devices/device-groups.tsx`
- Created: `src/features/home/availability-notice.test.tsx`
- Created: `src/features/home/availability-notice.tsx`
- Created: `src/features/scenes/scene-controls.test.tsx`
- Created: `src/features/scenes/scene-details.tsx`
- Created: `src/features/scenes/scene-result.ts`
- Created: `src/test/render-home.tsx`
