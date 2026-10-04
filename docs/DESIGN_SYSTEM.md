# Design system foundation

KZ Home v0.2 retains the house mark, `KZ Home.` wordmark, Manrope and sage accents. Compact headings, consistent surfaces and purposeful spacing make it a control interface. Home prioritizes status, offline-device attention and favorites. Room cards use photography for recognition; a small desktop room identifier replaces the previous room banner. The Home hero and marketing scene introduction were removed.

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

Photo labels use stable white/dark overlays for legibility in either theme. No blur, glow or decorative gradient remains. State is described with text and control semantics as well as color. Pending colors and warning surfaces now have their own light/dark semantic tokens. Navigation/action text and backgrounds change together when switching themes; removing background-color animation avoids transient low contrast.

## Components

Shared foundations include Button, Switch, RangeControl, StatePanel, InlineError, PageHeading, SectionHeading, Wordmark, StatusBadge and Feedback. Feedback covers pending, confirmed success, partial availability, offline and failure tones, with status/alert semantics. Feature cards own product semantics: DeviceCard understands a device capability, RoomCard summarizes a room, and SceneControls reports execution. A UI component never imports fixtures or makes network requests.

Switch uses a native button with `role="switch"`, a meaningful label, and `aria-checked`. Offline switches are natively disabled. Pending controls use guarded `aria-disabled` to keep keyboard focus. Sliders use native range inputs with visible labels/values and device-specific accessible names. They preview a draft while moving, commit on release/key-up/blur, discard old/rejected drafts, and cancel interrupted pointer movement. They retain the same input node across responses.

Room cards are links, devices are articles, and scene cards are articles with dedicated Run scene buttons. Native `details` expose scene actions and offline-device links. There are no nested buttons inside clickable cards. Card heading levels follow their enclosing section/page. Confirmation is shown only after a repository result; full, partial and no-update scene results have distinct text and tone.

## Responsive behavior

- Desktop: persistent sidebar, compact status band, four-column Home grids and two-column room control groups/detailed scenes.
- Tablet: a narrower sidebar and two-column grids.
- Mobile below 768px: compact header, two-column grids, and bottom navigation with safe-area padding.
- Compact 320px: devices, scenes and appearance choices become single-column; summary labels and actions adapt.

The page footer reserves space for fixed mobile navigation. Grids use `minmax(0, 1fr)` and tolerate wrapping. Mobile room detail omits its identification photo so controls stay prominent. At high zoom the same breakpoints provide mobile layout. The test matrix explicitly includes 1440, 1024, 834, 390 and 320px. Switches and range inputs reserve 44px of height; Run scene buttons, details summaries and navigation links also have practical touch targets.

## Accessibility and motion

The shell includes a skip link, labeled navigation and a main landmark. Route navigation focuses main content. Controls have visible focus outlines and generous targets; switches reserve a 44px target despite their smaller visual track. Feedback uses polite live regions; errors use alerts. Offline controls are disabled with a written reason, and offline last-known state is never counted as active.

Hover effects are small. `prefers-reduced-motion` disables significant transitions and animated loading motion. Theme follows OS changes in system mode, initializes before paint, and tolerates blocked browser storage.

Browser tests run axe’s WCAG A/AA checks in light/dark dashboard themes and on rooms, room detail, scenes and settings. Complete screen-reader/device testing and a full accessibility audit remain follow-up work; automated checks cover only part of accessibility.
