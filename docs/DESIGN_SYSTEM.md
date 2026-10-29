# Design system — Web v0.5

## Signature Home supersedes the Home composition below

The approved Signature reference is implemented for Home and its shell only:
graphite `#101214` / warm ivory `#f5f2ec`, a photographic sample-home hero,
quick scenes → room photos → devices → system status. Scoped semantic overrides
live in `src/styles/signature.css`; the other pages retain their v0.5 styles.
Mobile keeps four quick scenes, two columns of rooms even at 320px, and bottom
navigation. Russian Home/navigation copy is frontend presentation, without a
backend localization contract. Photo fades are for text legibility. See
[Signature implementation and validation](SIGNATURE_HOME.md) for current behavior,
deliberate reference deviations, changed files and screenshots. The remainder of
this document describes the retained v0.5 foundations and other screens.

Quiet architectural surfaces, warm ivory (`#f6f4ef`) and deep graphite (`#191c1b`), restrained sage, locally served Manrope with Cyrillic coverage. Large, medium-weight page titles sit above concise body copy; cards use subtle borders and minimal shadows. No gradients, blur, neon or gold. The existing house mark and photography are retained; photography belongs only to the sample home, never invented Core rooms.

Home puts actual/sampled status, offline attention and everyday devices before rooms/scenes. Rooms use a clear floor filter and photo/neutral cards; detail pages group supported controls. Scenes have uniform calm surfaces and inspectable actions. Settings use explicit theme miniatures and separate account information. Login gets a two-column architectural composition on desktop, a focused form on mobile, a reusable theme toggle and accessible password visibility control. See [v0.5 report](PREMIUM_REDESIGN_V0.5.md).

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
- Tablet: an 88px navigation rail with readable labels and two-column grids.
- Mobile below 768px: compact header and bottom navigation with safe-area padding.
- Below 540px: devices, scenes and theme choices use one column; 320px rooms also use one column. A persistent simulation/Core notice stays visible even when the small topbar badge is hidden.

The page footer reserves space for fixed mobile navigation. Grids use `minmax(0, 1fr)` and tolerate wrapping. Mobile room detail omits its identification photo so controls stay prominent. At high zoom the same breakpoints provide mobile layout. The test matrix explicitly includes 1440, 1024, 834, 390 and 320px. Switches and range inputs reserve 44px of height; Run scene buttons, details summaries and navigation links also have practical touch targets.

## Accessibility and motion

v0.3 preserves these tokens and layouts. The sign-in/house-selection surfaces
reuse Wordmark, PageHeading, Button, StatePanel and Feedback. Form fields are
native, labeled, at least 48px tall, and use 16px text. Core mode has a persistent
read-only connection bar with Refresh home and Account & homes; it remains visible
at 320px even when the small topbar badge is hidden. Core rooms without photos use
neutral token surfaces. Unsupported/partial device states are readable rather
than hidden, and Core scenes have neutral surfaces and inspectable read actions.
Mock controls retain existing presentation/behavior. Authentication messages are
status/alert feedback; sign-in mounts focus its heading and update the title.

The shell includes a skip link, labeled navigation and a main landmark. Route navigation focuses main content. Controls have visible focus outlines and generous targets; switches reserve a 44px target despite their smaller visual track. Feedback uses polite live regions; errors use alerts. Offline controls are disabled with a written reason, and offline last-known state is never counted as active.

Hover effects are small: border/shadow changes and slight room-photo zoom. Color/background changes during theme switching are immediate to avoid transient contrast failures. `prefers-reduced-motion` disables significant transitions and animated loading motion. Theme follows OS changes in system mode, initializes before paint, and tolerates blocked browser storage. Logical spacing and wrapping plus ru/kk heading adjustments accommodate future localization; translated UI strings/locale selection are not implemented.

Browser tests run axe’s WCAG A/AA checks in light/dark dashboard themes and on rooms, room detail, scenes and settings. Complete screen-reader/device testing and a full accessibility audit remain follow-up work; automated checks cover only part of accessibility.
