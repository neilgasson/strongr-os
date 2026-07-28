# Strongr OS project checkpoint

## Checkpoint identity

- **Checkpoint:** M4.1 staging decision accepted — provider cost confirmation pending
- **Recorded:** 2026-07-28
- **Repository:** `neilgasson/strongr-os`
- **Protected branch:** `main`
- **Protected-main checkpoint commit:** `3078e2fd3f94d3663648fc27664957af60ebe714`
- **M4.0 implementation commit:** `b8c8b3383b6d896f3862c3a484790d7257a87603`
- **M4 scope approval commit:** `957c7751f00d1196e3a0ab01235cb1d5ce6abb16`
- **M3.4 implementation commit:** `d77aae3d69bf24e7278c7e45c79e6b72223260ff`
- **M3 scope approval commit:** `001096279eaf1117b18ac213a3627d2a0d4ca44b`
- **M3.3 implementation commit:** `f33b15ca7ea75101976b31d5708be991638c27ff`
- **M3.2 implementation commit:** `fa512a76e355cc7a0297d6128b4acfa240576bb9`
- **M3.1 implementation commit:** `a618a227e9eb40ee0844c6df38c6f1b5d01a7a86`
- **M3.0 implementation commit:** `ff597682c242f5ae58e5866c443f58486de0ce73`
- **M2 remotely tested implementation commit:** `5df45797bc5502030982b182d2adeb8be54dd7ff`
- **Overall status:** M3-accepted pre-production platform core with an
  owner-only deployed Strongr Studio preview covering the authenticated governed
  workflow from tenant-scoped brief through checksum-verified private media,
  human media review, immutable non-public release staging, and append-only
  revocation; M4.0 production-readiness architecture and the exact M4.1 staging
  resource proposal are accepted, while provider cost confirmation,
  provisioning, staging acceptance, production launch, live providers, and the
  wider product remain incomplete

This file is the durable restart point for Strongr OS work after M4.0
acceptance. If a
future task or conversation loses context, begin here and follow the restart
procedure below. The canonical M0.2–M3 acceptance records remain the authority
for detailed test, artifact, workflow, deployment, and commit identifiers.

## Executive summary

Strongr OS now has a secure and tested platform foundation, one complete
governed audio-reflection workflow, and an accepted owner-only Strongr Studio
preview. The backend can accept a tenant-scoped brief, create
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
canonical tenant-scoped work queue. M3.2 added the browser-guided governed flow
for schema-valid briefs, durable generation requests, immutable versions,
separate automated evidence and human review, exact AAL2 approval, immutable
non-public package creation, and append-only approval revocation while retaining
database authorization as the authority. Governed media and release actions are
now exposed through authenticated exact-object retrieval, browser-side
byte-count and SHA-256 verification, human transcript/accessibility review,
non-public staging, and append-only staged-release revocation. The Studio is
deployed only as an owner-accessible isolated non-production preview. It does
not use live external AI or voice providers and does not publish content.

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
- M3.2 added a schema-driven brief form, stable generation idempotency,
  canonical generation and immutable-version status, manual-successor creation,
  explicit submission, separate automated evidence and human governance,
  exact-evidence AAL2 approval, immutable non-public package creation, and
  append-only approval revocation.
- M3.2 uses only the accepted authenticated tenant reads and narrow `m1_*`
  command boundary. It added no migration, direct governed-table browser write,
  service credential, public Storage, publication, deployment, production
  configuration, or Strongr Daily change.
- Recorded the M3.2 boundary in
  [`docs/architecture/M3_2_BRIEF_TO_GOVERNED_PACKAGE.md`](docs/architecture/M3_2_BRIEF_TO_GOVERNED_PACKAGE.md).
- M3.2 was owner-accepted and squash-merged through PR #32.
- M3.3 added AAL2 deterministic media requests, canonical durable media status,
  exact authenticated private-object retrieval with byte-count and SHA-256
  verification before playback, short-lived in-memory playback URLs, human
  transcript/accessibility review evidence, AAL2 immutable non-public release
  staging, and append-only staged-release revocation.
- M3.3 uses only accepted tenant reads, the four narrow `m2_*` browser commands,
  and the exact authenticated Storage object endpoint. It added no migration,
  grant, RLS or Storage-policy change, service credential, direct browser
  mutation, public or signed media URL, upload, deployment, publication,
  production configuration, or Strongr Daily change.
- Recorded the M3.3 boundary in
  [`docs/architecture/M3_3_MEDIA_RELEASE_STAGING.md`](docs/architecture/M3_3_MEDIA_RELEASE_STAGING.md).
- M3.3 was owner-accepted and squash-merged through PR #34.
- M3.4 added a repository-traceable static hosting worker, exact HTTPS/security
  header and SPA-fallback contracts, same-origin public runtime configuration,
  failure-preserving preview evidence, and an owner-only OpenAI Sites
  deployment bound only to `strongr-os-dev`.
- The deployed preview exposes only the Supabase project URL and publishable key.
  It added no migration, RLS, grant, Storage-policy, service-role, production,
  publication, live-provider, or Strongr Daily change.
- M3.4 was merged through PR #36 after all six pull-request checks passed. All
  four triggered protected-main replays passed, and the owner explicitly
  approved the authenticated live preview and final M3 acceptance.
- Recorded the canonical M3 result in
  [`evidence/m3/acceptance-record.json`](evidence/m3/acceptance-record.json).

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
- M3.2 brief through governed package:
  [PR #32](https://github.com/neilgasson/strongr-os/pull/32), merged to protected
  `main` as `3426f6c10b35e732cdcddbd609c47919bfd68907`.
  - 63 unit and contract tests passed.
  - 20 Playwright tests passed across desktop and narrow Chromium.
  - Stable generation idempotency, immutable version inspection, canonical
    evidence selection, AAL2 approval, non-public packaging, append-only
    revocation, tenant switching, session expiry, accessibility, and responsive
    operation passed.
  - All six pull-request checks passed before merge.
  - No migration, RLS, grant, Storage policy, Supabase project, deployment,
    production, or Strongr Daily file changed.
- Protected-main replays after M3.2:
  - [M3 application run 30326422276](https://github.com/neilgasson/strongr-os/actions/runs/30326422276)
    passed.
  - [M1 application run 30326422257](https://github.com/neilgasson/strongr-os/actions/runs/30326422257)
    passed.
  - [M1 acceptance run 30326422315](https://github.com/neilgasson/strongr-os/actions/runs/30326422315)
    passed.
  - [M2 acceptance run 30326422310](https://github.com/neilgasson/strongr-os/actions/runs/30326422310)
    passed.
- M3.3 governed media through private release staging:
  [PR #34](https://github.com/neilgasson/strongr-os/pull/34), merged to protected
  `main` as `f2a609db170d847a71cd760db3964fb70ce41c61`.
  - 66 unit and contract tests passed.
  - 22 Playwright tests passed across desktop and narrow Chromium.
  - Exact AAL2 media request payloads, stable idempotency, canonical job and
    artifact status, one exact authenticated private-object request, byte-count
    and SHA-256 verification before playback, short-lived object URL cleanup,
    human transcript/accessibility review, immutable non-public staging,
    append-only revocation, accessibility, and responsive operation passed.
  - All six pull-request checks passed before merge.
  - No migration, RLS, grant, Storage policy, Supabase project, deployment,
    production, or Strongr Daily file changed.
- Protected-main replays after M3.3:
  - [M3 application run 30328834197](https://github.com/neilgasson/strongr-os/actions/runs/30328834197)
    passed.
  - [M1 application run 30328834233](https://github.com/neilgasson/strongr-os/actions/runs/30328834233)
    passed.
  - [M1 acceptance run 30328834211](https://github.com/neilgasson/strongr-os/actions/runs/30328834211)
    passed.
  - [M2 acceptance run 30328834244](https://github.com/neilgasson/strongr-os/actions/runs/30328834244)
    passed.
- M3.4 owner-only isolated preview:
  [PR #36](https://github.com/neilgasson/strongr-os/pull/36), merged to protected
  `main` as `d77aae3d69bf24e7278c7e45c79e6b72223260ff`.
  - 68 unit and contract tests, 22 Playwright tests across desktop and narrow
    Chromium, and 7 preview-host contract tests passed.
  - Formatting, lint, generated schema, TypeScript, production build, browser
    boundaries, seven workflow YAML parses, and shell syntax passed.
  - The private deployment succeeded from source commit `8a72ea0`; access was
    reverified as one allowed owner, no groups, and no public access.
  - Runtime configuration contains exactly `PUBLIC_SUPABASE_URL` and
    `PUBLIC_SUPABASE_PUBLISHABLE_KEY` for isolated project `strongr-os-dev`.
  - The exact preview Auth redirect is allowlisted with no wildcard.
  - One transient local Supabase restart HTTP 502 occurred after clean migration
    application. Failure evidence uploaded successfully; the authorized rerun
    passed migration history, pgTAP, concurrency, forward repair, health,
    evidence upload, and teardown.
  - All six pull-request checks passed before merge.
- Protected-main replays after M3.4:
  - [M3 application run 30332827727](https://github.com/neilgasson/strongr-os/actions/runs/30332827727)
    passed.
  - [M1 application run 30332827603](https://github.com/neilgasson/strongr-os/actions/runs/30332827603)
    passed.
  - [M1 acceptance run 30332827594](https://github.com/neilgasson/strongr-os/actions/runs/30332827594)
    passed.
  - [M2 acceptance run 30332827615](https://github.com/neilgasson/strongr-os/actions/runs/30332827615)
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
- The approved M3 scope and M3.4 standing authority are fulfilled. M3 acceptance
  does not authorize production deployment, publication, public Storage, live
  external providers, or changes to Strongr Daily.

## Current functional boundary

Strongr OS is a functional pre-production backend/platform core for one governed
audio-content workflow with an M3-accepted, owner-only deployed browser
workspace. Strongr Studio can sign an operator in and out, safely handle session
expiry, support TOTP MFA, show only RLS-visible active organizations, keep the
selected tenant explicit, reconstruct a canonical work queue, and guide an
authorized operator from a schema-valid brief through immutable versions,
separate evidence and human review, exact AAL2 approval, immutable non-public
package creation, AAL2 deterministic media request, durable media status, exact
checksum-verified private playback, human transcript/accessibility review,
immutable non-public release staging, and append-only staged-release
revocation. The deployment is an isolated non-production preview, not a complete
Strongr Society operating system or a user-facing production product.

The repository currently does **not** provide:

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

1. Define and owner-approve the next milestone before implementation. The first
   decision is whether it targets production readiness, a tightly bounded live
   provider, or another separately governed Strongr Society product.
2. Decide whether and when to introduce live AI and media providers. Each must
   preserve deterministic test adapters, provenance, privacy, retries, cost
   controls, and human authority.
3. Define production architecture and operations: deployment environments,
   secret management, monitoring, alerting, scheduled backups, restore drills,
   release procedures, and incident response.
4. Add performance, load, concurrency, failure-injection, and longer-running
   reliability evidence appropriate to the approved production target.
5. Define publication and distribution only after private staging and revocation
   controls remain proven end to end.
6. Plan each additional Strongr Society product as a separately governed scope
   built on the shared platform.

## Next action

The M3 browser check has been promoted into the strict protected-main required
checks with no other protection weakened.

M4.0 was owner-accepted and merged through PR #39 as protected-main commit
`3078e2fd3f94d3663648fc27664957af60ebe714`. It defines the accepted environment,
trust, credential, promotion, recovery, service-objective, dependency, and
operational-threat boundaries without provisioning a resource.

The owner accepted the exact M4.1 staging proposal on 2026-07-28:

- a new `Strongr OS Staging` Supabase Pro organization with one
  `strongr-os-staging` Micro project in `ca-central-1`;
- a protected owner-approved GitHub Environment and bounded staging worker;
- a separate owner-only `Strongr Studio Staging` OpenAI Sites project;
- private encrypted Backblaze B2 recovery storage in Canada East;
- filtered Grafana Cloud Free telemetry in AWS `ca-central-1`;
- expected USD $25/month and a hard USD $35/month ceiling before tax.

The machine-readable contract is now `approved_unprovisioned` and
`approved: true`. The named Supabase staging organization does not yet exist.
No staging resource, credential, provider integration, database change, host,
production system, publication path, or Strongr Daily change may occur before
the owner separately confirms the provider-reported Supabase recurring cost.

## Restart procedure

When resuming Strongr OS work:

1. Confirm protected `main` contains checkpoint commit
   `3078e2fd3f94d3663648fc27664957af60ebe714` or a documented successor.
2. Read this file, the approved M3 scope, and the four canonical acceptance
   records:
   - `docs/architecture/M3_SCOPE.md`
   - `evidence/m0-2/acceptance-record.json`
   - `evidence/m1/acceptance-record.json`
   - `evidence/m2/acceptance-record.json`
   - `evidence/m3/acceptance-record.json`
3. Review `README.md`, `docs/architecture/M3_4_PREVIEW_HOSTING.md`,
   `docs/architecture/M3_4_PREVIEW_ACCEPTANCE.md`,
   `docs/adr/ADR-0003-static-browser-studio.md`, and the accepted Studio
   environment, browser-security, Auth, private-media, and command contracts.
4. Confirm the `main protection` ruleset remains active with no bypass actors and
   the required checks remain strict.
5. Confirm the current Strongr Daily application has not been changed.
6. Confirm the owner-only preview remains private and bound only to
   `strongr-os-dev`; do not retain owner session or passkey material.
7. Read `docs/architecture/M4_SCOPE.md`,
   `docs/architecture/M4_0_PRODUCTION_READINESS_ARCHITECTURE.md`, and the current
   M4.1 resource decision; implement only the owner-approved M4 slice.
8. Start any approved work from current protected `main` on a new `agent/*`
   branch and preserve the M0–M3 security boundaries.

## Protected-main checks at this checkpoint

The active strict required checks are:

1. `Database contract / test`
2. `M0.2 reliability proof / acceptance`
3. `M1 application / foundation`
4. `M1 acceptance / local`
5. `M2 acceptance / local`
6. `M3 application / browser foundation`

The `main protection` ruleset is active and strict with no bypass actors. Pull
requests and resolved conversations remain required; force pushes and deletions
remain blocked. The non-production remote acceptance workflows provide
additional explicit evidence and are recorded in the canonical milestone
records.
