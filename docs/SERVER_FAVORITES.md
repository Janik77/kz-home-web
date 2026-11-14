# Server-owned device favorites

Depends on Web #22 `2a094b76253d03abf8086b7708ad5be69fc6cef6` and Core #43
`5b87f4b71a7a2a99d4dd3d288c7f1ec76ab781f2`, migration 0011. No Core or
persistent-profile launcher changes are included. Existing profile bindings must
be updated only by the separate integration workflow after verification.

GET `/v1/houses/{house}/me/device-favorites` reads `{device_ids: []}`.
PUT/DELETE `/v1/houses/{house}/me/device-favorites/{device}` set/unset one favorite
and return 204. No user ID, command, device metadata or localStorage writes.
Home, rooms, device list and detail share the same server-backed control. Demo
favorites remain explicitly demo data and never call this API.

No optimistic success: buttons wait for mutation and GET readback. Writes are
serialized within the active workspace, repeated clicks are ignored. Other
clients are last-write-wins; readback is a snapshot, not a guarantee against a
later concurrent change. Refresh rereads the server. Writes are never retried
implicitly, including after ambiguous errors. Unknown writes require an explicit
GET before another action. HTTP 404 means unavailable, not empty favorites.

The isolated QueryClient and FavoritesProvider are remounted for account/house;
old reads are cancelled and late writes cannot update the next context. Reload
and new login fetch the server again. No stale browser favorites are restored.
Logout does not claim immediate revocation of an already issued access JWT.
Core retains historical preferences across device moves: returning the device
to its original house may reveal its old preference again.

Command feedback is inline in its own device card. A reserved 52px minimum slot
keeps ordinary two-line success/pending notices from changing card height. Success
clears after four seconds; errors, unknown results and recovery text stay visible
and can expand for accessibility. No fixed overlapping toast stack. Neither
favorite changes nor feedback styling change command eligibility or ACK+state.

## Reproduce

Use Node 24, Python 3.12, Docker (Linux/WSL2), git and Chromium dependencies.
Checkout this PR's exact final Web SHA and the Core SHA above in sibling folders.

```sh
cd kz-home-web
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
npm run test:e2e:core
python3.12 -m venv ../kz-web-live-venv
../kz-web-live-venv/bin/python -m pip install -r ../kz-home-core/requirements-dev.txt
LIVE_CORE_SOURCE="$(cd ../kz-home-core && pwd)" ../kz-web-live-venv/bin/python -B e2e/confirmed-live-runner.py
```

Runner creates disposable loopback PostgreSQL/MQTT TLS, random test credentials,
software relay and browser, then verifies evidence and tears down its own services.
It does not start or modify an existing persistent installation. No Firmware source
checkout or physical board is required. The GitHub workflow also performs baseline
visual comparison using its explicitly checked-out historical Web source.

For explicitly labeled demo preview: `npm run dev -- --port 5173 --strictPort`
(default demo mode; verify no inherited VITE_DATA_MODE overrides). Live UI requires
an independently configured compatible Core proxy; do not bypass profile bindings.

Native videos exclude password entry: save and restored-after-login are separate
clips. The restored clip starts after real login and server GET; it is not a single
continuous recording of authentication. Space creation is recorded at 390×844.
