# Interface / Core #42: supported surface and independent follow-ups

Inspected contract: 82653a849d2b61479de1c3bb4d74e7f388523667, especially
app/api/routes.py, app/schemas/entities.py, services/device_service.py.
Web base: accepted #21 dc05b09f02243c41423023179bcf21d65f5e288f.

Implemented reads: houses, floors, rooms, devices, scenes, rules, latest 100
house-scoped events. Device search is a client-side filter of this snapshot,
not a server search or an exhaustive audit. Details use the same real snapshot.
Room/floor creation: POST /rooms and /floors, house.read + house.manage, fresh
permissions and target-floor ownership check; stable generated ID, one request,
GET readback. No device state, metadata, binding or command mutations.
Existing scene creation/name editing, automation name editing and explicit
software-only scene steps remain supported. Definition edits use revision CAS.
Confirmed relay commands remain exclusively on the eligibility/receipt contract.
Demo brightness, curtains and climate are not claimed as live integrations.

## Separate Core task A: atomic metadata editing

Core has PATCH /houses/{id}, /floors/{id}, /rooms/{id}, /devices/{id}, but their
read schemas lack revision and PATCH lacks expected_revision. Device PATCH also
accepts state/online/capabilities/metadata; Web must never send those implicitly.
Do not pretend a preflight GET prevents ABA or a write race. Required completion:
- migration: monotonic integer revision >=1 for all four entity types;
- all old/new writers increment it; PATCH accepts expected_revision, checks and
  updates atomically; mismatch returns 409 with stable conflict code;
- unchanged/ABA edits still invalidate older revisions;
- device editor whitelist: name and room_id only; no command or state side effect;
- target room/floor membership and PhysicalBindingGuard remain server-enforced;
- contract tests: two clients, legacy writer ABA, cross-house target, permissions,
  no MQTT publish, rollback and preservation of other fields.
Web follow-up: forms capture revision, preserve drafts on 409, explicit comparison
before adopting current version, no hidden retry. Until then these metadata
fields are shown read-only; this is a concurrency gap, not an absent PATCH route.

## Separate Core task B: per-user, per-house favorites

No favorites endpoint/schema exists. Do not repurpose device.metadata or browser
localStorage: those cannot provide user+house isolation and authoritative persistence.
Proposed independent contract (not an implemented endpoint): GET /v1/houses/{house}/me/favorites
returns {house_id, revision, device_ids}; PUT at same path accepts
{expected_revision, device_ids}. Atomic CAS; unique device IDs, explicit bounded
maximum, only readable devices in that house; no user_id from client. Owner derived
from authenticated session. GET cannot disclose another user's favorites. Clear
stale inaccessible/deleted references on read or mark explicitly. Migration key:
(user_id, house_id), plus device references; no new privileges required. Test two
users/two homes, revoked access, deletion, concurrent changes and persistence.
Web follow-up only after contract lands: real favorite control and Home grouping.
Current Core Home says "Устройства дома"; only clearly marked demo uses favorite.

## Separate Core task C: safe creation and complete history

POST /devices creates a database device, not a discovered/provisioned physical
unit. A generic "Add real device" button would be misleading. Onboarding/profile
bindings require their separate reviewed flow; this UI does not bypass it.
POST /houses is available to authenticated users; participant management remains
outside this stage. Automated rule enable/run can cause device commands and is
not exposed as harmless metadata. Full action/trigger editing needs a typed editor
preserving unknown supported fields, explicit effect review, and revision CAS.
GET /events?house_id=...&limit=100 is a bounded journal, not full command history.
Scene history is still the existing limited in-memory list, not a server audit.
A paginated, permission-scoped receipt/run-history API is a separate Core task.

## Dependency sequence / integration

This Web PR stacks on accepted #21; Core #42 remains live-test pin. Core tasks A/B
can be reviewed independently, then separate Web integration PRs implement editors
and favorites against exact new Core SHAs. No Web change edits the persistent
launcher/profile bindings/clean-checkout enforcement. The integration owner must
produce and test a new agreed pair before updating a persistent stack. No manual
binding changes, merge, production deploy or physical-device test is part of this PR.
