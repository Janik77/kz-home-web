# Server-owned one-click scene execution

Based on Web #25 (`d6533042b950ded2f8b90dbec1af5a05fd078ce0`). Requires the matching Core server-scene implementation; old Core is rejected, never silently downgraded to legacy scene execution.

Previously, Core persisted a manual plan and each `/actions/{position}/dispatch` required an explicit UI click. Removing those clicks alone would make the browser an unreliable orchestrator. This client instead calls `POST /v1/houses/{house}/scene-runs/execute` exactly once, carrying the scene revision and an idempotency key. Core owns validation, authorization, ordered dispatch and acknowledgment tracking.

- The UI only polls GET after launch. Closing/navigation aborts observation, **not** execution.
- A lost launch response retains its original intent key in the authenticated repository's memory across navigation. The explicit recovery button performs GET `/by-key/{key}`, never a POST retry.
- Reload/sign-out discards session memory. No automatic relaunch occurs. Run ID readback remains available; creating a separate intent requires fresh scene review and an explicit incomplete-history acknowledgement.
- A server-run response must include `execution_mode: server`. Existing `manual` run history is read-only and is not continued by this UI.
- Pending is not success. `succeeded`, `partial`, `refused`, `unknown`, `expired` are distinct. Each action shows its receipt/status and diagnostic code. Unknown/timed-out does not imply the device is off.
- Observation lasts up to 35 seconds per read session. Core continues afterward; the user can refresh the result (GET only).
- Only software relay integration is claimed. No physical relay tests or controls.

## Local development

Use Node >=22.12, `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Use the existing isolated live runner for the matching Core SHA; do not update the old persistent profile for this test. See the final integration report for exact tested Core/Web commits and evidence.
