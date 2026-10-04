# Application architecture

## Decisions

This is a client-rendered consumer application, with a separately owned Core backend. React, TypeScript, Vite, and React Router fit that boundary without introducing a frontend server. The choice follows the [React guidance for an application built from scratch](https://react.dev/learn/build-a-react-app-from-scratch), [Vite’s development/build model](https://vite.dev/guide/), and [React Router’s declarative routing](https://reactrouter.com/start/declarative/installation).

TanStack Query owns asynchronous home data, cancellation and mutation status. A home snapshot is sufficient for this small first milestone; it avoids speculative caches for backend resources that have not been defined. Commands are serialized under one mutation scope and controls are disabled while a command runs. Results replace the cache only after the adapter confirms them. Reads are cancelled before a mutation to prevent an older read from overwriting a command result. Mutations are not retried automatically, since future device operations may be unsafe to repeat.

There is no Redux/Zustand, CSS framework, UI component framework, form framework, custom backend, or browser MQTT client. Native HTML controls, plain CSS and small React components cover the present scope. Runtime dependencies are React, React DOM, React Router, TanStack Query, Lucide, and a local font package. Test/build tooling is development-only.

## Dependency direction

```text
main.tsx -> providers + injected HomeRepository -> App + routes
features -> shared UI + query hooks + domain
query hooks -> repository boundary + Query cache
mock adapter -> frontend domain + isolated fixtures
domain -> no React, transport, browser, or UI dependencies
```

`domain/home.ts` models a house, its floors/rooms, discriminated device capabilities, scene actions, and a snapshot. These are frontend models, not a proposed Core schema. Only implemented capabilities are modeled. New domains should be added when their actual requirements exist, rather than adding empty modules for every future feature.

The routes are `/`, `/rooms`, `/rooms/:roomId`, `/scenes`, and `/settings`. Unknown room IDs and URLs have recovery views. Route changes update the document title, reset scroll, and focus the main landmark. This keeps keyboard and assistive-technology users oriented even while data loads.

## State ownership

| State | Owner | Persistence |
| --- | --- | --- |
| Home snapshot | Repository and Query cache | In memory only |
| Device/scene requests | Query mutations | None |
| Slider draft and floor filter | Feature/UI components | None |
| Appearance preference | Theme context | Optional localStorage |
| Navigation | React Router/browser history | Browser history |

## v0.2 refinement

The stack, routes, providers, query keys and `HomeRepository` interface are preserved. No dependencies or transport mechanisms were added. Pure room/scene selectors derive availability, active-device counts, available climate measurements, unique affected devices/rooms and unavailable action counts from the existing domain. Capability grouping is a small presentation configuration in the devices feature; no generic plugin registry was introduced.

Device feedback is attached to the card for the current mutation attempt; scene feedback is attached to the scene being run. Raw adapter error strings are not shown. Device failures retain the last confirmed state and offer an explicit retry. Scene runs use dedicated buttons and show pending, full success, partial success, no-update and failure outcomes. `SceneResult.applied` and `.skipped` count commands, so results say **controls**, while scope summaries deduplicate devices and rooms. A run with every action skipped is never presented as success.

Controls remain locked across the home while mutations serialize. Offline switches use native disabled behavior, with last-known-state text; pending switches/ranges use guarded `aria-disabled` behavior to retain focus. Pointer/key events and click handlers reject input while busy. Range drafts are discarded when confirmed data or operation revision changes, with the same input node retained. Pointer cancellation restores the confirmed value without issuing a command. Feedback describes the last attempt in the mounted view; it is not a persistent operation history.

Home prioritizes status, attention, favorites, rooms and scenes. Room detail groups controls by capability and derives room status from available devices. No sample-house identity, scene outcomes, or device changes are hardcoded in these views. Photography is kept for room recognition. Offline links navigate to the affected room/device and focus that card. Standard navigation still focuses the main landmark.

The mock repository is a factory. It clones its seed and returned snapshots so consumers and tests cannot mutate shared fixtures. It simulates latency, accepts read cancellation, rejects offline or incompatible commands, validates percentages, and reports scene actions skipped because devices are missing/offline. Invalid scene actions do not persist a partially changed snapshot. A scene result counts controls, since one scene can contain multiple commands for a device.

In this adapter, zero brightness turns a light off. Turning it on from zero restores 100% brightness. That is a documented simulation rule; real behavior must be mapped from Core’s device semantics. All online/measurement states are sample data, not a claim about a connected house.

## Integrating the real Core

1. Inspect the actual Core documentation/schema and establish supported operations, identity, house membership, permissions, error responses, and command acknowledgment semantics with its maintainers.
2. Implement a new data adapter behind `HomeRepository`. Keep transport DTOs, runtime response validation, and DTO-to-domain mapping within `data/`; never trust TypeScript alone to validate network input. Adapt this application boundary if Core’s operations cannot honestly fulfill it.
3. Inject the real adapter in the application composition. Keep the mock adapter available for tests and intentional local development, with an explicit mode indicator. Define public configuration only when required; every frontend environment variable is public, including `VITE_*`. Never put credentials or secrets in this bundle.
4. Add the agreed authentication/session flow and authorization-aware routes when Core’s model is known. Do not turn the preview into a fake login or use browser storage as a production credential store without a reviewed session design.
5. Distinguish accepted requests from confirmed physical state. If Core acknowledges a command before a device reports state, extend the domain/data boundary and UI with pending/failed/confirmed operation state. Do not label transport acceptance as physical completion.
6. For multiple houses, pass the selected authorized house identity through routes and query keys. The present `['home', 'current']` key deliberately scopes the single repository-selected house without embedding a fixture identity in the UI. Add separate resource queries and invalidation only as the real read/write topology requires them.
7. Handle stale measurements, disconnects, permission failures, reconnection and partial scene failures. Align any real-time mechanism with Core’s supported browser transport, with cleanup and cache updates in the data layer. Do not expose firmware MQTT credentials or connect MQTT directly from the browser.
8. Add contract tests against verified responses, then end-to-end tests with a controlled Core environment. Keep existing fixture/interaction tests as independent frontend coverage.

The frontend currently knows nothing about Core’s endpoint paths, wire payloads, session scheme, or event protocol. Backend and firmware repositories were not accessed.

## Growing the product

Add cohesive features under `features/` and their models/adapters as requirements become real. Accounts/roles, device onboarding, automations, notifications, energy and AI each deserve explicit product requirements and Core integration. The shared shell, query boundary, theme, tokens, and state panels can serve those routes without expanding this milestone’s navigation with unavailable features.

Start splitting/lazy-loading routes when bundle measurements or page size justify it. The initial bundle remains deliberately simple. Do not introduce a generic device-plugin registry, design-system package, or global event bus before there is a concrete need.
