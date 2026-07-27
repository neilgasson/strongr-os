# Strongr OS project checkpoint

## Checkpoint identity

- **Checkpoint:** M3.1 accepted — identity, tenant context, and canonical work queue
- **Recorded:** 2026-07-27
- **Repository:** `neilgasson/strongr-os`
- **Protected branch:** `main`
- **Protected-main checkpoint commit:** `a66f1f09046b4626c669b56cd627b09a48ddcffc`
- **M3 scope approval commit:** `001096279eaf1117b18ac213a3627d2a0d4ca44b`
- **M3.1 implementation commit:** `a618a227e9eb40ee0844c6df38c6f1b5d01a7a86`
- **M3.0 implementation commit:** `ff597682c242f5ae58e5866c443f58486de0ce73`
- **M2 remotely tested implementation commit:** `5df45797bc5502030982b182d2adeb8be54dd7ff`
- **Overall status:** Acceptance-proven pre-production platform core with an
  accessible authenticated Strongr Studio identity, tenant-selection, MFA, and
  canonical work-queue foundation; governed browser actions, deployment, and a
  finished user-facing product remain incomplete

This file is the durable restart point for Strongr OS work after M3.1. If a
future task or conversation loses context, begin here and follow the restart
procedure below. The canonical M0.2–M2 acceptance records remain the authority
for detailed backend test, artifact, workflow, and commit identifiers.

## Executive summary

Strongr OS now has a secure and tested platform foundation, one complete
governed audio-reflection workflow, and an accessible authenticated Strongr
Studio browser foundation. The backend can accept a tenant-scoped brief, create
durable generation and media jobs, produce deterministic draft and WAV fixtures,
run automated checks, preserve separate human review authority, approve an exact
version, create a governed package, store media privately, stage an immutable
release manifest, revoke authority or staged content, and prove backup and exact
byte recovery.

The implementation has passed clean local replay and non-production remote
acceptance against Supabase/PostgreSQL, Auth, row-level security, and private
Storage. M3.0 added the static React/Vite browser shell and restrictive preview
boundary. M3.1 connected supported Supabase Auth session and TOTP operations,
active-organization discovery and selection, permission-aware navigation, and a
canonical tenant-scoped work queue while retaining database authorization as
the authority. Governed brief, review, approval, package, media, and release
actions are not yet exposed in the browser. The Studio is not deployed, does not
use live external AI or voice providers, and does not publish content.

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
- M3.1 added sign-in and sign-out, safe session-expiry handling, supported TOTP
  enrollment and verification, active-organization selection, explicit tenant
  context, permission-aware navigation, and the canonical read-only work queue.
- M3.1 uses only existing authenticated `SELECT` grants and RLS policies for
  tenant-scoped data. UI permissions remain hints, never authorization, and no
  governed write or service credential moved into the browser.
- Recorded the M3.1 boundary in
  [`docs/architecture/M3_1_IDENTITY_TENANT_WORK_QUEUE.md`](docs/architecture/M3_1_IDENTITY_TENANT_WORK_QUEUE.md).
- M3.1 was owner-accepted and squash-merged through PR #30.

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
- M3.1 identity, tenant context, and canonical work queue:
  [PR #30](https://github.com/neilgasson/strongr-os/pull/30), merged to protected
  `main` as `a66f1f09046b4626c669b56cd627b09a48ddcffc`.
  - 63 unit tests passed.
  - 16 Playwright tests passed across desktop and 360-pixel Chromium.
  - Sign-in, session expiry, TOTP enrollment and verification, tenant switching,
    permission-aware navigation, canonical work-queue reads, accessibility, and
    browser-boundary checks passed.
  - All six pull-request checks passed before merge.
  - No migration, RLS, grant, Storage policy, Supabase project, deployment,
    production, or Strongr Daily file changed.
- Protected-main replays after M3.1:
  - [M3 application run 30313224413](https://github.com/neilgasson/strongr-os/actions/runs/30313224413)
    passed.
  - [M1 application run 30313224416](https://github.com/neilgasson/strongr-os/actions/runs/30313224416)
    passed.
  - [M1 acceptance run 30313224381](https://github.com/neilgasson/strongr-os/actions/runs/30313224381)
    applied all migrations once to an isolated clean database, verified migration
    history and contracts, passed the real application boundary, and uploaded
    evidence.
  - [M2 acceptance run 30313224359](https://github.com/neilgasson/strongr-os/actions/runs/30313224359)
    applied all migrations once to an isolated clean database, verified migration
    history and contracts, passed the governed end-to-end workflow, and uploaded
    evidence.
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
audio-content workflow with an acceptance-proven authenticated browser
foundation. Strongr Studio can sign an operator in and out, safely handle
session expiry, support TOTP MFA, show only RLS-visible active organizations,
keep the selected tenant explicit, and reconstruct a canonical read-only work
queue. It does not yet operate the governed workflow and is not a complete
Strongr Society operating system or a user-facing production product.

The repository currently does **not** provide:

- Browser operation of the accepted brief, draft, evidence, human review,
  approval, package, media, staging, and revocation workflow.
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

1. M3.2 — implement the browser-guided brief-to-draft, immutable version,
   separate evidence/review, exact approval/revocation, and package workflow.
2. M3.3 — implement deterministic media request and status, exact private
   checksum-verified playback, transcript/accessibility review, immutable
   staging, and revocation.
3. M3.4 — deliver the owner-accessible isolated non-production preview, complete
   browser acceptance evidence, canonical M3 acceptance record, and explicit
   owner acceptance.
4. Decide whether and when to introduce live AI and media providers. Each must
   preserve deterministic test adapters, provenance, privacy, retries, cost
   controls, and human authority.
5. Define production architecture and operations: deployment environments,
   secret management, monitoring, alerting, scheduled backups, restore drills,
   release procedures, and incident response.
6. Add performance, load, concurrency, failure-injection, and longer-running
   reliability evidence appropriate to the approved production target.
7. Define publication and distribution only after private staging and revocation
   controls remain proven end to end.
8. Plan each additional Strongr Society product as a separately governed scope
   built on the shared platform.

## Next action

The next safe action is **M3.2 — brief through governed package** on a new
protected branch from checkpoint commit `a66f1f0`.

M3.2 should guide an authorized operator through brief submission, durable draft
generation status, immutable version inspection, automated evidence review,
separate Scripture/theology/editorial human review, exact-version AAL2 approval
and revocation, and immutable production-package creation. Every governed
mutation must use the existing narrow command boundary with an explicit active
organization, exact target identity, idempotency key, confirmation, and canonical
reread after completion or uncertainty.

M3.2 must not grant the browser direct table writes, service credentials, human
approval authority to automation, publication, public Storage, production
configuration, deployment, or Strongr Daily changes. If the accepted M0–M2
contracts reveal a genuine database gap, stop and use the separately approved
append-only migration process instead of broadening the browser boundary.

## Restart procedure

When resuming Strongr OS work:

1. Confirm protected `main` contains checkpoint commit
   `a66f1f09046b4626c669b56cd627b09a48ddcffc` or a documented successor.
2. Read this file, the approved M3 scope, and the three canonical acceptance
   records:
   - `docs/architecture/M3_SCOPE.md`
   - `evidence/m0-2/acceptance-record.json`
   - `evidence/m1/acceptance-record.json`
   - `evidence/m2/acceptance-record.json`
3. Review `README.md`, `docs/architecture/M3_1_IDENTITY_TENANT_WORK_QUEUE.md`,
   `docs/architecture/M1_2_BRIEF_TO_DRAFT.md`,
   `docs/architecture/M1_3_REVIEW_TO_PACKAGE.md`, and the accepted Studio gateway
   and command contracts that M3.2 will consume.
4. Confirm the `main protection` ruleset remains active with no bypass actors and
   the required checks remain strict.
5. Confirm the current Strongr Daily application has not been changed.
6. Start from current protected `main` on a new `agent/*` branch.
7. Implement M3.2 only; do not begin M3.3 until M3.2 is owner-accepted.
8. Run all existing required checks plus the M3 application check and new
   M3.2-specific acceptance checks before merge.

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
