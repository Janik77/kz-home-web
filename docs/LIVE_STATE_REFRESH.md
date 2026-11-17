# Visible Home and device state

Stacked on Web #27. No changes to command/scene receipt contracts or Core required.

- One polling observer in AppShell for authenticated Core Home (`/`) and device detail (`/devices/:id`).
- Shared existing home query; cards do not create timers. Five-second read interval; hidden tabs and offline clients pause. Focus/network recovery refetches.
- On failed reads, 30-second backoff (no immediate retries). Authorization/not-found errors stop the interval and fail closed.
- Background errors retain the mounted controls and local drafts, explicitly label the snapshot as last-known/unconfirmed and disable relay actions until a successful read. Receipt status is never inferred from polling; no automatic command resend.
- Other routes and demo mode gain no new interval. Existing automation-specific polling is unchanged.
- Query clients remain scoped to authenticated user/house and clear on logout/house switch.

Verification: new fake-timer regression tests cover external update, single shared request, route departure, background/offline pause and recovery, backoff and draft preservation. Existing receipt race/success tests pass. Live Core browser recording is a separate acceptance gate, not claimed by these tests.

## Real browser acceptance

The full live run [44121726970](https://github.com/Janik77/kz-home-web/actions/runs/44121726970) passed on Web `f85f27f6efc9d8f5485f58d1d8fc453c405baf5e` and Core `193937fcb30c68b50d443b6745e42117c007639d`. Web checks run44121727314 also passed.

The isolated fixture uses actual PostgreSQL17, MQTT TLS, Core and a software relay:
- external state changes appear on Home and the open device page without reload;
- bounded snapshot reads (2–3 per11seconds), no timer reads in the real hidden tab or offline;
- return to tab/network restores the latest external state;
- an unsaved automation name/action survives offline/reconnect;
- no command writes, MQTT SETs or persisted commands are produced by this read-only scenario.

Native Chrome runs with its sandbox, a disposable profile and loopback CDP. Supported `connectOverCDP({noDefaults:true})` avoids Playwright's forced focus emulation; assertions check genuine `document.visibilityState` after a real tab switch. No visibility getter injection or security bypass. Xvfb and ffmpeg capture the screen.

The workflow now pins Core `f4b6787c6ee630d7cb7b2fd19b6fdb4c2b16d315` for the final rerun. Core app tree is identical to the preceding acceptance (`4d8e01049a45ab8cb32132fd77f173015a603e70`); later Core changes are tests, tools and documentation. Check exact HEAD CI before acceptance. No physical-device testing is claimed.

To reproduce on an isolated Linux host with Docker, Chrome, Xvfb and ffmpeg:
```sh
npm ci
export LIVE_CORE_SOURCE=/absolute/path/to/pinned/kz-home-core
export PLAYWRIGHT_CHANNEL=chrome LIVE_STATE_ONLY=1
xvfb-run -a --server-args="-screen 0 1440x1000x24" /path/to/core-venv/bin/python -B e2e/automation-live-runner.py
```
This creates disposable loopback PostgreSQL/Mosquitto services, not an existing user profile. Do not point it at physical devices. Evidence is under `test-results/state-live-evidence.json`, `state-live/` and `live-state-*.png`.
