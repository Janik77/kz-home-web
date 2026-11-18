# Numeric sensors / threshold substage

Base: Web #28 `6f8f72f`; Core #51 `d405505637bc65f6a23083570dd8d43ddf9a465b`.

- Supported advertised capabilities: temperature (-100..150 °C), humidity (0..100%), illuminance (0..200000 lx).
- Trigger `numeric_threshold`: strict lt/gt, positive hysteresis, reset boundary within sensor range. First fresh sample establishes baseline only. Numeric AND uses `numeric_state` and eq/neq/lt/lte/gt/gte.
- UI does not silently convert legacy `device_state` numeric rules. Commands remain confirmed relay on/off only.
- `numeric_observed_at` is per-field. Numeric timestamp is not `updated_at`. Missing timestamp means unknown freshness; offline, older than120s, >5s future or invalid values are not displayed as fresh.
- Mixed power/numeric devices retain power controls and nonnumeric readings.

## Checks

Use supported Node24 (local verification24.22.3), `npm ci` then:

```sh
npm run typecheck
npm run lint
npm test
npm run build
PLAYWRIGHT_CHANNEL=chrome npx playwright test --config playwright.numeric.config.ts
```

The numeric UI suite uses intercepted contract fixtures, NOT real Core evidence. Captures in `test-results/numeric-fixture` cover1440px/390px and both themes.

The existing GitHub Actions `live-software.yml` checks out exact Core SHA and runs:

```sh
LIVE_CORE_SOURCE=/absolute/core LIVE_NUMERIC_ONLY=1 python -B e2e/automation-live-runner.py
```

Requires Core dev requirements, Chrome, Docker already running. Creates disposable loopback PostgreSQL/TLS MQTT only. Reuses exact fixture_house/fixture_relay ACL and software allowlist; adds numeric capabilities to that same software relay. No production profile, physical devices, persistent secret or ACL change. `numeric-live-evidence.json` independently verifies MQTT SET/ACK/state against PostgreSQL receipts. Browser videos and desktop/mobile screenshots are CI artifacts. No local Docker/WSL restart is performed.

At initial implementation:306 unit/component tests, typecheck/lint/build,4 fixture browser tests passed. Live job is pending; do not interpret these as physical or live success. Existing lockfile npm audit reports15 vulnerabilities; separate triage required. No schedules/durable delays in this substage.
