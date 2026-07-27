# Strongr OS project checkpoint

## Checkpoint identity

- **Checkpoint:** M3.0 accepted — browser and design foundation
- **Recorded:** 2026-07-27
- **Repository:** `neilgasson/strongr-os`
- **Protected branch:** `main`
- **Protected-main checkpoint commit:** `0db978b4ad419164a270401bc9000ad6a895c69d`
- **M3 scope approval commit:** `001096279eaf1117b18ac213a3627d2a0d4ca44b`
- **M3.0 implementation commit:** `ff597682c242f5ae58e5866c443f58486de0ce73`
- **M2 remotely tested implementation commit:** `5df45797bc5502030982b182d2adeb8be54dd7ff`
- **Overall status:** Acceptance-proven pre-production platform core with an
  accessible static Strongr Studio browser foundation; not yet an authenticated
  operator workflow, production deployment, or finished user-facing product

This file is the durable restart point for Strongr OS work after M3.0. If a
future task or conversation loses context, begin here and follow the restart
procedure below. The canonical M0.2–M2 acceptance records remain the authority
for detailed backend test, artifact, workflow, and commit identifiers.

## Executive summary

Strongr OS now has a secure and tested platform foundation, one complete
governed audio-reflection workflow, and the first accessible Strongr Studio
browser foundation. The backend can accept a tenant-scoped brief, create durable
generation and media jobs, produce deterministic draft and WAV fixtures, run
automated checks, preserve separate human review authority, approve an exact
version, create a governed package, store media privately, stage an immutable
release manifest, revoke authority or staged content, and prove backup and exact
byte recovery.

The implementation has passed clean local replay and non-production remote
acceptance against Supabase/PostgreSQL, Auth, row-level security, and private
Storage. M3.0 adds a static React/Vite browser shell, routing, semantic design
tokens, an Auth-only Supabase package boundary, restrictive preview contracts,
and automated browser/accessibility evidence. The shell is not yet connected to
sign-in, organization discovery, or the governed operator workflow. It is not
deployed, does not use live external AI or voice providers, and does not publish
content.

## Completed and accepted

### M0 — governed platform kernel

- Established the modular platform and canonical Supabase/PostgreSQL data
  foundation.
- Implemented organizations, memberships, roles, authorization, auditability,
  governed commands, approvals, packages, and tenant isolation.
- Enforced row-level security and privileged database boundaries.

### M0.2 — reliability and operational acceptance

- Proved real AAL1 denial and AAL2 authorization for sensitive actions.
- Added request idempotency, including concurrent duplicate protection and
  changed-request rejection.
- Added durable outbox leasing, retries, poison-message visibility, and recovery.
- Rehearsed migration failure and forward repair.
- Rehearsed backup and restore to a disposable database.
- Added operational health and observability evidence.
- Recorded the canonical result in
  [`evidence/m0-2/acceptance-record.json`](evidence/m0-2/acceptance-record.json).

### M1 — governed audio-reflection application workflow

- M1.0: application foundation and environment boundaries.
- M1.1: durable worker commands, leases, retries, and recovery.
- M1.2: governed brief-to-draft flow with deterministic AI fixtures.
- M1.3: automated evidence, separate human review lanes, exact-version approval,
  package creation, and revocation.
- M1.4: clean local and non-production remote application acceptance,
  accessibility transcript contract, privacy checks, cleanup, and failure
  artifact preservation.
- Recorded the canonical result in
  [`evidence/m1/acceptance-record.json`](evidence/m1/acceptance-record.json).

### M2 — governed media, release staging, and recovery

- M2.0: private media Storage foundation, object metadata, tenant boundaries,
  and service-role-only write path.
- M2.1: durable media worker, deterministic WAV generation, byte validation,
  SHA-256 provenance, retry handling, and exact private retrieval.
- M2.2: human media/transcript/accessibility review, AAL2 release staging,
  immutable staged manifests, revocation, and denial after authority revocation.
- M2.3: complete object/database inventory, AES-256-GCM encrypted independent
  byte backup, exact restore, orphan and missing-object detection,
  reconciliation, measured recovery, observability, cleanup, and acceptance
  evidence.
- Corrected a narrow hosted Storage acceptance-harness compatibility issue
  without changing bucket privacy, RLS, permissions, or service-role boundaries.
- Recorded the canonical result in
  [`evidence/m2/acceptance-record.json`](evidence/m2/acceptance-record.json).

### M3 — Strongr Studio operator console

- The complete M3.0–M3.4 protected implementation scope, non-goals, threats,
  authority, delivery sequence, and acceptance matrix were owner-approved and
  merged through PR #27.
- M3.0 established the pinned React/Vite/React Router browser application,
  accessible responsive shell, semantic design tokens, safe routing, and error
  boundary.
- Added an Auth-only Supabase browser dependency using PKCE and an exact public
  environment allowlist; no data, Storage, service-role, or production
  credential boundary moved into the browser.
- Added a restrictive preview security contract, source and built-bundle
  boundary validation, Playwright browser acceptance, WCAG 2.2 A/AA automated
  checks, and failure-preserving workflow evidence.
- Recorded the architecture decision in
  [`docs/adr/ADR-0003-static-browser-studio.md`](docs/adr/ADR-0003-static-browser-studio.md)
  and the implementation boundary in
  [`docs/architecture/M3_0_BROWSER_FOUNDATION.md`](docs/architecture/M3_0_BROWSER_FOUNDATION.md).
- M3.0 was owner-accepted and squash-merged through PR #28.

## Verified checkpoint evidence

- M3 scope approval:
  [PR #27](https://github.com/neilgasson/strongr-os/pull/27), merged as
  `001096279eaf1117b18ac213a3627d2a0d4ca44b`.
- M3.0 browser foundation:
  [PR #28](https://github.com/neilgasson/strongr-os/pull/28), merged to protected
  `main` as `0db978b4ad419164a270401bc9000ad6a895c69d`.
  - 58 unit tests passed.
  - 6 Playwright tests passed across desktop and 360-pixel Chromium.
  - Keyboard navigation, routing, safe empty states, horizontal overflow, and
    automated WCAG 2.2 A/AA checks passed.
  - Dependency quarantine, formatting, generated schema, TypeScript, production
    build, environment boundaries, built-bundle security, YAML, and shell checks
    passed.
  - No migration, RLS, grant, Storage policy, Supabase project, deployment,
    production, or Strongr Daily file changed.
- Protected-main M3.0 replay:
  [M3 application run 30306909699](https://github.com/neilgasson/strongr-os/actions/runs/30306909699)
  passed on checkpoint commit `0db978b`.
- Protected-main regression replays after M3.0:
  - [M1 application run 30306909733](https://github.com/neilgasson/strongr-os/actions/runs/30306909733)
    passed.
  - [M1 acceptance run 30306909680](https://github.com/neilgasson/strongr-os/actions/runs/30306909680)
    passed.
  - [M2 acceptance run 30306909850](https://github.com/neilgasson/strongr-os/actions/runs/30306909850)
    passed.
- Final M2 remote acceptance:
  [workflow run 30237884139](https://github.com/neilgasson/strongr-os/actions/runs/30237884139)
  - Local acceptance passed.
  - `strongr-os-dev` remote acceptance passed.
  - 45 of 45 remote assertions passed.
  - Storage, database, and Auth fixture cleanup passed.
- Final protected-main M2 replay:
  [workflow run 30238586637](https://github.com/neilgasson/strongr-os/actions/runs/30238586637)
  - Passed on checkpoint commit `623f57b` after retrying a transient local
    Supabase container HTTP 502.
  - Failure evidence was preserved on the failed attempt.
- Clean local migration replay:
  - 11 repository migrations applied from zero.
  - 11 migration-history rows recorded.
  - 11 distinct migration versions recorded.
  - 9 pgTAP files and 263 database assertions passed.
- Remote migration state:
  - The three M2 migration versions each have exactly one history row.
  - Migrations were verified, not reapplied, during final remote acceptance.
- Final M0.2 and M1 protected-main replays also passed.
- Pull requests #21 through #25 are merged and bind the accepted M2
  implementation and evidence to protected `main`.

The measured one-millisecond M2 restore is for a tiny deterministic acceptance
fixture. It proves the restore mechanism and byte equality; it is not a
production recovery-time benchmark.

## Security and governance boundaries that remain mandatory

- Do not weaken row-level security, database permissions, private Storage,
  service-role boundaries, tenant isolation, AAL requirements, auditability, or
  human approval authority.
- Anonymous and browser-direct privileged writes remain denied.
- Storage remains private; bucket listing remains restricted.
- AI and automated checks may provide drafts and evidence, but may not approve,
  export, publish, or replace authorized human review.
- The current Strongr Daily application remains unchanged unless a separately
  approved future scope explicitly authorizes work on it.
- Every migration must be reviewed and committed before execution.
- Protected `main` requires pull requests, resolved conversations, and strict
  passing checks. Force pushes and branch deletion are blocked.
- The existing M2.1–M2.3 standing authority is fulfilled.
- The approved M3 scope authorizes protected M3.0–M3.4 implementation pull
  requests only. It does not authorize production deployment, publication,
  public Storage, live external providers, or changes to Strongr Daily.

## Current functional boundary

Strongr OS is a functional pre-production backend/platform core for one governed
audio-content workflow with an acceptance-proven static browser foundation. The
shell is accessible and responsive, but it does not yet authenticate an
operator, load organizations, or operate the governed workflow. It is not yet a
complete Strongr Society operating system or a user-facing production product.

The repository currently does **not** provide:

- A connected Strongr Studio sign-in, MFA, tenant-selection, or work-queue
  experience.
- Browser operation of the accepted brief, review, package, media, staging, and
  revocation workflow.
- An owner-accessible deployed non-production Strongr Studio preview.
- Production hosting, domains, secrets, release operations, or a public launch.
- Live external AI writing or media/voice generation providers.
- Public Storage, browser-direct object upload, or public media delivery.
- Publication or distribution to Strongr products or external channels.
- Production-scale load, performance, soak, cost, or long-running operational
  proof.
- A production backup schedule and independently operated restore environment.
- Strongr Daily 2.0, Library, Trust, Flow, Guide, Insights, or the wider product
  ecosystem.

## Work remaining

1. M3.1 — implement sign-in, sign-out, safe session expiry, supported TOTP MFA,
   active-organization discovery and selection, permission-aware navigation,
   and the canonical work queue.
2. M3.2 — implement the browser-guided brief-to-draft, immutable version,
   separate evidence/review, exact approval/revocation, and package workflow.
3. M3.3 — implement deterministic media request and status, exact private
   checksum-verified playback, transcript/accessibility review, immutable
   staging, and revocation.
4. M3.4 — deliver the owner-accessible isolated non-production preview, complete
   browser acceptance evidence, canonical M3 acceptance record, and explicit
   owner acceptance.
5. Decide whether and when to introduce live AI and media providers. Each must
   preserve deterministic test adapters, provenance, privacy, retries, cost
   controls, and human authority.
6. Define production architecture and operations: deployment environments,
   secret management, monitoring, alerting, scheduled backups, restore drills,
   release procedures, and incident response.
7. Add performance, load, concurrency, failure-injection, and longer-running
   reliability evidence appropriate to the approved production target.
8. Define publication and distribution only after private staging and revocation
   controls remain proven end to end.
9. Plan each additional Strongr Society product as a separately governed scope
   built on the shared platform.

## Next action

The next safe action is **M3.1 — identity, tenant, and work queue** on a new
protected branch from checkpoint commit `0db978b`.

M3.1 should connect the M3.0 shell to supported Supabase Auth session and TOTP
operations, discover only active organizations visible through current RLS,
keep the active organization explicit on every governed screen, provide
permission-aware navigation without treating UI state as authorization, and
reconstruct the work queue from canonical tenant-scoped reads.

M3.1 must not add public sign-up, user administration, direct browser writes,
service credentials, production configuration, deployment, or Strongr Daily
changes. If the accepted M0–M2 contracts reveal a genuine database gap, stop and
use the separately approved append-only migration process rather than broadening
the browser boundary.

## Restart procedure

When resuming Strongr OS work:

1. Confirm protected `main` contains checkpoint commit
   `0db978b4ad419164a270401bc9000ad6a895c69d` or a documented successor.
2. Read this file, the approved M3 scope, and the three canonical acceptance
   records:
   - `docs/architecture/M3_SCOPE.md`
   - `evidence/m0-2/acceptance-record.json`
   - `evidence/m1/acceptance-record.json`
   - `evidence/m2/acceptance-record.json`
3. Review `README.md`, `docs/adr/ADR-0003-static-browser-studio.md`,
   `docs/architecture/M3_0_BROWSER_FOUNDATION.md`, and the M1/M2 Studio gateway
   and acceptance contracts that M3.1 will consume.
4. Confirm the `main protection` ruleset remains active with no bypass actors and
   the required checks remain strict.
5. Confirm the current Strongr Daily application has not been changed.
6. Start from current protected `main` on a new `agent/*` branch.
7. Implement M3.1 only; do not begin M3.2 until M3.1 is owner-accepted.
8. Run all existing required checks plus the M3 application check and new
   M3.1-specific acceptance checks before merge.

## Protected-main checks at this checkpoint

The active strict required checks are:

1. `Database contract / test`
2. `M0.2 reliability proof / acceptance`
3. `M1 application / foundation`
4. `M1 acceptance / local`
5. `M2 acceptance / local`

`M3 application / browser foundation` is green on protected `main` but is not
yet an active required status check. The approved M3 scope defers adding the
proposed M3 required check until stable protected-main proof and final M3.4
acceptance. The non-production remote acceptance workflows provide additional
explicit evidence and are recorded in the canonical milestone records.
