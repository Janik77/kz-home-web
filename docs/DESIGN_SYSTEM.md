# Design system foundation

KZ Home uses an understated house mark, a distinctive `KZ Home.` wordmark, natural photography, spacious layout, and sage accents. The dashboard emphasizes rooms and everyday actions. There are no technical telemetry widgets, account impersonation, or unavailable-feature navigation.

## Tokens

`src/styles/tokens.css` is the shared source for typography, weights, a 4px spacing scale, radii, surfaces, borders, semantic colors, shadows, and motion timing. Light/dark themes override semantic values; components do not choose their own alternate dark palette. `data-theme` on the root resolves light/dark while preference can be light, dark, or system.

| Token family | Purpose |
| --- | --- |
| `--font-sans`, `--text-*`, `--weight-*` | Locally served Manrope and type hierarchy |
| `--space-*` | Consistent spacing rhythm |
| `--radius-*` | Controls, cards, hero surfaces, pills |
| `--color-bg`, `--color-surface*`, `--color-sidebar` | Application and elevated surfaces |
| `--color-text`, `--color-muted`, `--color-subtle` | Content hierarchy |
| `--color-accent*`, `--color-on-accent` | Action, selection and focus-related states |
| `--color-danger*`, `--color-warning` | Failures and offline notices |
| `--color-active-*`, `--color-switch-track` | Confirmed device/control state |
| `--color-scene-*` | Restrained contextual scene surfaces |
| `--shadow-*`, `--duration-fast`, `--ease-out` | Small depth and interaction feedback |

The hero’s photo scrim and photo labels use stable white/dark overlays for legibility in either theme. Blur is limited to the small desktop photo caption. There is no general glass UI. State is always described with text and/or control semantics as well as color.

## Components

Shared foundations include Button, Switch, RangeControl, StatePanel, InlineError, PageHeading, SectionHeading, and Wordmark. Feature cards own their product semantics: DeviceCard understands a device capability, RoomCard summarizes a room, and SceneControls reports scene execution. A UI component never imports mock data or makes network requests.

Switch uses a native button with `role="switch"`, a meaningful label, and `aria-checked`. Sliders use native range inputs, visible labels/values, and device-specific accessible names. They keep a draft while moving and commit on release, key-up or blur. Cards are semantic articles or links; action cards are buttons. There are no click-only divs or nested interactive room-card controls.

## Responsive behavior

- Desktop: persistent sidebar, broad hero, and four-column room/device/scene grids.
- Tablet: a narrower sidebar and two-column grids.
- Mobile below 768px: compact header, two-column grids, and bottom navigation with safe-area padding.
- Compact 320px: devices and appearance choices become single-column; summary labels and actions adapt.

The page footer reserves space for fixed mobile navigation. Grids use `minmax(0, 1fr)` and cards tolerate wrapping. At high zoom, the same breakpoints provide mobile layout. Browser tests inspect overflow from 320px through 1440px; manual screenshot review supplements them.

## Accessibility and motion

The shell includes a skip link, labeled navigation and a main landmark. Route navigation focuses main content. Controls have visible focus outlines and generous targets; switches reserve a 44px target despite their smaller visual track. Feedback uses polite live regions; errors use alerts. Offline controls are disabled with a written reason, and offline last-known state is never counted as active.

Hover effects are small. `prefers-reduced-motion` disables significant transitions and animated loading motion. Theme follows OS changes in system mode, initializes before paint, and tolerates blocked browser storage.

Browser tests run axe’s WCAG A/AA checks in light/dark dashboard themes and on rooms, room detail, scenes and settings. Complete screen-reader/device testing and a full accessibility audit remain follow-up work; automated checks cover only part of accessibility.
