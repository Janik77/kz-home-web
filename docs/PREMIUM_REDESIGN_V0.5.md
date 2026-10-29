# Web v0.5 — premium UI/UX redesign

## Scope and screen plan

Started with clean Web `feature/premium-redesign-v0.5`. Read architecture, design
system, actual Core DTOs/services/Protocol v1, adapter mappings, session and
mentor-demo requirements before changing presentation. Core is read-only; its
pre-existing modified `deploy/MENTOR_DEMO_RU.md` was preserved byte-for-byte.

The design direction was proposed before implementation: warm ivory and graphite,
sage accents, quiet typography and borders, meaningful spacing, no decorative
dashboard telemetry. Preserve Home's status/attention/devices priority; refine
Rooms/detail, device cards, Scenes, Login, Settings and all navigation as one
system. Keep Core controls read-only and mock controls clearly simulated.

## Implemented system

- Shared semantic tokens now define ivory/graphite themes, sage actions, larger
  page typography, 14–28px radii and restrained shadows. Component CSS and the
  responsive layout were updated in place, not layered behind a second framework.
- Home shows connection counts, lighting and measured/reported/sample temperature
  only when the existing adapter supplies data. Offline attention remains linked
  to affected rooms/devices; controls remain easy to reach at compact widths.
- Desktop uses a composed sidebar, tablet an 88px rail, mobile fixed bottom
  navigation. Under 540px device/scene controls use one column. Focus/44px targets,
  keyboard sliders, cancel/retry behavior and reduced motion remain supported.
- Rooms retain mock photos. Core rooms get neutral door-icon surfaces, not
  invented customer photos. Room detail uses a calm header and capability groups.
- Scenes use uniform surfaces, inspectable actions and separate run buttons only
  in mock mode. Settings previews show light/dark/system choices and retain the
  account/home selection and signout boundary.
- Login uses a CSS architectural window illustration on desktop and a focused
  form on mobile; ThemeToggle is shared with the shell. Password visibility uses
  a separately labeled button and does not put the password in React state.
- Loading, empty, API unavailable and explicit 403 restriction states have clear
  separate treatments. No roles/permission summaries are inferred from empty lists.
- Manrope/Cyrillic assets stay local; long Cyrillic entity names and ru heading
  styles were browser-tested. ru/kk logical wrapping is preparation, not a claim
  of translated product UI. No dependencies were added; version is 0.5.0.

## Device-state boundaries

DTO `online` remains the only connectivity source in the Core mapping; an ON
state never implies connection. A last-known ON device with `online=false` stays
offline, is excluded from active counts and retains its last-known state. Core
cards say **Reported online/offline**; temperature averages are reported with
unknown freshness. `updated_at` was not turned into a sensor measurement time.

Core never renders real mutation controls and the repository still rejects
commands/scene execution before HTTP. API network/server errors say **Core is
unavailable**, not that individual devices went offline; 403 says **Access is
limited**. A failed home query removes device content rather than presenting stale
controls as current.

Mock mode has a persistent **Local preview · Simulation** notice, including at
320px. Device pending/success copy says simulation; scene outcomes explicitly say
**Simulation only**. Sample sensor timestamps are labeled sample readings.
Confirmed/pending/error logic, serialization, offline control guards and explicit
retries remain at the existing repository/Query boundary. No firmware, backend,
real MQTT, endpoint or token-storage behavior was changed.

## Validation and evidence

Chrome matrix: 1440, 1024, 834, 390 and 320px. Existing mock and intercepted Core
contract suites still run separately. The Core suite now also checks password
visibility, long Cyrillic names, offline last-known ON state and 403 behavior.
Unit additions cover source connectivity versus state and three distinct Core
error kinds. Password-selector ambiguity and a transient theme-switch contrast
issue found in initial runs were fixed before the final run.

Final results:

| Command/check | Result |
| --- | --- |
| `npm.cmd run typecheck` | Passed |
| `npm.cmd run lint` | Passed, zero warnings |
| `npm.cmd test` | 71 passed / 12 test files |
| `npm.cmd run build`, Core and mock environments | Both passed |
| `PLAYWRIGHT_CHANNEL=chrome npm.cmd run test:e2e` | 25 passed, all five widths |
| `PLAYWRIGHT_CHANNEL=chrome npm.cmd run test:e2e:core` | 20 passed, all five widths; intercepted contract responses |
| axe, keyboard/focus, reduced motion, overflow, broken images | Passed as covered by the browser suites; not a full accessibility certification |
| `git diff --check` | Passed |

Screenshots are generated/ignored under `test-results/premium/`: `home`, `rooms`,
`room`, `scenes`, `settings`, `login`, each with `-light.png` and `-dark.png`;
mobile viewport captures are `home-320.png` / `home-390.png`. Mock data is explicitly
labeled. Login captures show the empty real Core sign-in surface with no submitted
credentials. `core-contract-home-dark.png` is exported from the **intercepted**
contract suite and must not be presented as live Core authentication evidence.
The generated capture helper is ignored too. Tests may replace these artifacts.

Temporary local preview servers were started at `http://127.0.0.1:5190` (mock)
and `http://127.0.0.1:5191` (Core sign-in) for visual QA. To reproduce from a new
PowerShell session, use `$env:VITE_DATA_MODE='mock'` then
`npm.cmd run dev -- --port 5190 --strictPort`; Core preview additionally uses
`VITE_DATA_MODE=core`, `VITE_API_URL=/core-api`,
`CORE_DEV_PROXY_TARGET=http://127.0.0.1:18000`. No local environment file was changed.

Live boundary: the actual local Core was available. Through the real Vite proxy,
`GET /health` and `/ready` returned 200; unauthenticated `/auth/me` and `/houses`
returned 401. An independent read-only PostgreSQL count found **zero users**.
The existing authenticated live suite provisions/deletes disposable user/house
fixtures. It was not run because this task prohibits Core modification/user-data
deletion and supplied no existing credentials. No account, fixture or data was
created/deleted. Intercepted Core tests and screenshots are not live auth evidence.

The existing Docker stack was not stopped/recreated and no container or volume
was deleted. The original Core dirty-file hash remained
`0ADE5B0B8DCDA72C8F5266E40EDC316C57B3802DC15ACFAD34501E1DE9C53838`.
No commits, pushes, merges, PRs or branch changes were performed.

## Final file inventory / Git

Web: `feature/premium-redesign-v0.5`, 24 modified and two untracked files; nothing staged:

```text
 M README.md
 M docs/DESIGN_SYSTEM.md
 M e2e/core.spec.ts
 M e2e/home.spec.ts
 M package-lock.json
 M package.json
 M src/app/app-shell.tsx
 M src/components/ui/state-panel.tsx
 M src/data/core/mapping.test.ts
 M src/features/auth/login-page.tsx
 M src/features/devices/device-card.tsx
 M src/features/devices/device-grid.test.tsx
 M src/features/home/home-data-boundary.test.tsx
 M src/features/home/home-data-boundary.tsx
 M src/features/home/home-page.tsx
 M src/features/home/home-summary.tsx
 M src/features/rooms/room-card.tsx
 M src/features/scenes/scene-controls.test.tsx
 M src/features/scenes/scene-controls.tsx
 M src/features/settings/settings-page.tsx
 M src/styles/components.css
 M src/styles/global.css
 M src/styles/layout.css
 M src/styles/tokens.css
?? docs/PREMIUM_REDESIGN_V0.5.md
?? src/components/ui/theme-toggle.tsx
```

Core: `main`, only the pre-existing ` M deploy/MENTOR_DEMO_RU.md`, unchanged by
this task. Firmware was not modified. Frameworks, routes, data adapters, session
ownership and dependency versions are preserved; lockfile changes only the root
package version. Real hardware, authenticated live UI, full localization,
screen-reader/device-lab testing and a commercial security audit remain unverified.
