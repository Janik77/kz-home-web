# Visible Home and device state

Stacked on Web #27. No changes to command/scene receipt contracts or Core required.

- One polling observer in AppShell for authenticated Core Home (`/`) and device detail (`/devices/:id`).
- Shared existing home query; cards do not create timers. Five-second read interval; hidden tabs and offline clients pause. Focus/network recovery refetches.
- On failed reads, 30-second backoff (no immediate retries). Authorization/not-found errors stop the interval and fail closed.
- Background errors retain the mounted controls and local drafts, explicitly label the snapshot as last-known/unconfirmed and disable relay actions until a successful read. Receipt status is never inferred from polling; no automatic command resend.
- Other routes and demo mode gain no new interval. Existing automation-specific polling is unchanged.
- Query clients remain scoped to authenticated user/house and clear on logout/house switch.

Verification: new fake-timer regression tests cover external update, single shared request, route departure, background/offline pause and recovery, backoff and draft preservation. Existing receipt race/success tests pass. Live Core browser recording is a separate acceptance gate, not claimed by these tests.
