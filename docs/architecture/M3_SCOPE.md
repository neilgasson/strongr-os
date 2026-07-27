# M3 — Strongr Studio Operator Console

- **Status:** Approved for protected implementation
- **Date:** July 27, 2026
- **Owner:** Neil Gasson / Strongr Society
- **Approval record:** The repository owner explicitly approved this exact scope
  in the controlling Codex task on July 27, 2026. PR #27 is the durable approval
  record.
- **Approval gate:** Satisfied by explicit repository-owner approval
- **Production authority:** None

## Entry condition

M2 is accepted. The canonical record is stored at
`evidence/m2/acceptance-record.json`, and the durable project checkpoint is
stored at `PROJECT_STATUS.md` on protected `main` at
`3b2ffe31879937e2c3896bcfe003e1d1eca6c5e8`.

Approval of this document authorizes implementation planning and protected M3.0
through M3.4 pull requests. It does not authorize production deployment,
publication, public Storage, browser uploads, live AI or media providers, or
any change to the current Strongr Daily application.

## Decision being proposed

M3 will turn the accepted Strongr OS application contracts into the first usable
Strongr Studio operator console.

The first user is an authenticated internal Strongr Society operator, reviewer,
or approver with an active organization membership. The primary success
scenario is:

> Using only the browser interface, an authorized operator can sign in, select
> an organization, create one synthetic audio-reflection brief, follow the
> durable draft and review workflow, approve an exact version at AAL2, request
> deterministic media, verify and review the private artifact, create an
> immutable non-public staged release, revoke it, and inspect the resulting
> status and evidence.

The operator must not need SQL, the Supabase dashboard, a CLI, copied UUIDs, or
service credentials to complete the scenario.

## Purpose

M0 through M2 proved the secure engine room. M3 will prove that an authorized
human can operate that engine safely through an accessible interface without
moving authorization into the browser or weakening any accepted boundary.

M3 ends at an owner-usable, login-protected non-production preview connected to
the isolated Strongr OS development environment and deterministic providers.
It does not publish content or deploy a production service.

## Product principles

1. **Human authority remains visible.** Automated checks and generated drafts
   are clearly labeled as evidence or suggestions, never approvals.
2. **The interface is not the security boundary.** The database re-evaluates
   membership, permission, tenant, workflow state, object identity, revocation,
   and AAL inside each governed command.
3. **Safe defaults beat flexible shortcuts.** The console guides operators
   through valid next actions and never offers direct table edits, public URLs,
   arbitrary object paths, or destructive Storage operations.
4. **Exact identity is understandable.** Operators see titles, versions,
   timestamps, states, and integrity summaries while stable identifiers remain
   available in an evidence detail view rather than as required input.
5. **Failure is a first-class state.** Queued, running, retrying, blocked,
   failed, dead-lettered, revoked, and recovered states are distinct and
   actionable.
6. **Accessibility is part of acceptance.** The critical workflow targets WCAG
   2.2 AA from the first browser shell.

## Governed operator workflow

1. A provisioned user signs in through Supabase Auth.
2. The console loads only active organizations visible through accepted RLS and
   lets the user choose the current tenant context.
3. When the session can reach AAL2, the console offers TOTP enrollment or
   challenge without treating the browser result as authorization.
4. The operator creates and validates one audio-reflection brief.
5. The console requests generation with a stable idempotency key and shows
   queued, running, retry, success, or failure state from canonical records.
6. The operator opens the immutable generated version, creates a manual
   successor if needed, and submits an exact version.
7. The console displays automated-check evidence separately from Scripture,
   theology, editorial, and rights review.
8. Authorized humans record the required evidence and review decisions.
9. An AAL2-authorized approver approves the exact evidence snapshot and creates
   the immutable production-package manifest.
10. An AAL2-authorized operator requests deterministic media for that exact
    unrevoked package.
11. The console shows durable media-worker status, retrieves only the exact
    private artifact, verifies its byte count and SHA-256, and provides
    accessible audio playback and transcript review.
12. An authorized human records media, transcript, and accessibility evidence.
13. An AAL2-authorized human creates an immutable non-public staged release
    bundle.
14. The operator can revoke the staged authority and see that it cannot be
    restaged.
15. The workflow stops before publication.

## In scope

### Browser application

- Convert `apps/studio` from application contracts and operator-flow libraries
  into an actual browser-only single-page operator application while preserving
  the accepted `StudioFoundation`, tenant-read, and governed-command boundaries.
- Record the frontend framework, build tool, routing, state ownership, and
  non-production hosting decision in an M3.0 ADR before implementation.
- Use a pinned supported browser Auth client with the Supabase publishable key
  for session and MFA operations. Continue using the accepted typed Studio
  gateway for tenant reads, governed RPCs, and exact private media retrieval.
- Add a small Strongr design-system foundation with semantic tokens and
  accessible components rather than importing the existing Studio prototype as
  a production foundation.
- Provide responsive layouts for desktop and tablet; critical workflows remain
  usable at a narrow mobile viewport without making mobile optimization the
  primary M3 goal.

### Identity and tenant context

- Sign-in, sign-out, session expiry, and safe return-to-sign-in behavior.
- TOTP enrollment, challenge/verification, factor visibility, and confirmed
  unenrollment through supported Supabase Auth APIs.
- Immediate session refresh after factor changes where required so the displayed
  assurance state is not stale.
- Organization discovery through existing membership and organization reads
  protected by current RLS.
- A clear active-organization indicator on every governed screen.
- Permission-aware controls for usability, with server/database denial remaining
  authoritative.
- No public sign-up, invitations, password administration, support
  impersonation, or cross-organization administration.

### Operator workspaces

- A home/work-queue view showing briefs, generation jobs, versions, incomplete
  reviews, packages, media jobs, artifacts, staged releases, revocations, and
  safe failure states for the active organization.
- A guided brief-to-draft workspace using the accepted content schemas and
  existing M1 command contracts.
- An immutable version view and manual-successor editor; submitted versions are
  never edited in place.
- A review workspace that keeps automated evidence separate from Scripture,
  theology, editorial, and rights authority.
- AAL2 step-up guidance for approval, package, media request, staging, and
  revocation where the accepted authorization matrix requires it.
- A media workspace with durable job status, exact private retrieval,
  browser-side byte-count and SHA-256 verification, an accessible audio player,
  transcript status, and media/accessibility review.
- A staged-release view that shows exact package/artifact/review/configuration
  identity, integrity hashes, actor, assurance, revocation, and blocked states.
- Safe operator-facing error messages using stable reason codes and correlation
  IDs without exposing secrets, tokens, private payloads, stack traces, or
  connection details.

### Non-production preview and evidence

- One owner-accessible, login-protected non-production preview using synthetic
  fixtures and the isolated `strongr-os-dev` Supabase project.
- A separately reviewed preview configuration with allowlisted Auth redirect
  origins, publishable browser configuration only, secure headers, and no
  production or Strongr Daily credentials.
- Browser end-to-end acceptance covering the exact primary success scenario.
- Automated accessibility, responsive-layout, keyboard, screen-reader,
  session-expiry, two-tenant, AAL1/AAL2, permission-denial, idempotency,
  refresh/resume, and failure-state evidence.
- Evidence artifacts uploaded even when a preceding browser or acceptance step
  fails.

## Supabase platform constraints

These constraints were verified against current Supabase documentation and
changelog entries on July 27, 2026:

- Browser code receives only the project URL and publishable key. A secret or
  legacy service-role key remains worker/CI-only and is rejected by source,
  environment, bundle, log, and artifact checks.
- TOTP MFA uses supported enrollment, challenge, verify, list, and unenroll
  APIs. The console may call
  `mfa.getAuthenticatorAssuranceLevel()` to guide the user, but the database
  remains the final authority for AAL-sensitive commands.
- MFA UI alone is not security. Existing PostgreSQL commands continue to enforce
  real AAL, current membership, and exact permission inside the transaction.
- Data API grants and RLS remain separate controls. M3 prefers existing exposed
  reads and commands; any new exposed object requires explicit least-privilege
  grants, RLS, and positive and negative tests.
- Authorization never trusts `user_metadata`. Existing membership and permission
  records remain authoritative.
- The browser never mutates the managed `auth` or `storage` schemas directly.
  Auth factor operations and exact private media reads use supported APIs.
- Supabase JavaScript client libraries no longer support Node.js 20. M3 retains
  the repository's Node.js 22-or-later requirement and pins every new package in
  the lockfile.
- Passkeys are currently beta and remain outside M3. TOTP is the accepted second
  factor for this milestone.
- M3 is a browser-only application. Introducing SSR, an application server, or
  an Edge Function requires an explicit scope amendment and threat review.

References:

- <https://supabase.com/docs/guides/auth/auth-mfa>
- <https://supabase.com/docs/guides/auth/auth-mfa/totp>
- <https://supabase.com/docs/reference/javascript/auth-mfa-getauthenticatorassurancelevel>
- <https://supabase.com/docs/guides/api/securing-your-api>
- <https://supabase.com/docs/guides/storage/security/access-control>
- <https://supabase.com/changelog/45715-deprecation-notice-dropping-support-for-node-js-20>

## Trust and security boundaries

- Supabase/PostgreSQL remains canonical for identity linkage, organization
  membership, permissions, workflow state, immutable content identity, review,
  approval, package identity, artifact identity, staging, revocation, and audit.
- UI visibility, routing, disabled buttons, cached state, and client-side AAL
  display are never treated as authorization.
- Every governed mutation continues through an accepted narrow RPC. The browser
  receives no direct DML grant to governed records.
- The service role remains exclusive to the server-side worker and acceptance
  fixtures. M3 adds no server credential, privileged browser proxy, or generic
  admin endpoint.
- The browser selects an organization only from current membership reads. Every
  subsequent request includes an explicit organization ID and remains subject to
  database tenant checks; changing a URL or browser state cannot cross tenants.
- Content, evidence, reason text, titles, and provider data render as text, not
  trusted HTML. Unsafe HTML injection, dynamic script execution, and model-
  generated markup are prohibited.
- The preview uses a restrictive Content Security Policy, clickjacking defense,
  secure referrer policy, no secret-bearing URLs, and allowlisted Auth redirect
  destinations.
- Access tokens, refresh tokens, TOTP secrets/codes, passwords, private draft
  text, plaintext media bytes, and service credentials are excluded from logs,
  analytics, error tracking, screenshots, and retained acceptance artifacts.
- Private media uses exact canonical retrieval. The browser verifies bytes before
  playback, creates only a short-lived in-memory object URL, disables caching,
  and revokes the URL when playback ends or the view closes.
- Refresh and navigation reconstruct state from canonical reads. The interface
  does not silently assume a previous command succeeded.
- Irreversible or authority-changing actions use a clear confirmation that names
  the exact version, package, artifact, or staged bundle and explains the effect.
- The current Strongr Daily application, its Auth users, databases, Storage,
  domains, deployments, secrets, and analytics remain isolated and unchanged.

## Threats M3 must add to the living threat model

| Threat | Required control |
| --- | --- |
| Stored content executes in Studio | Text-only rendering, schema validation, no unsafe HTML, CSP, and malicious-fixture browser tests |
| Browser bundle exposes a privileged key | Environment allowlist plus source and built-bundle secret scanning |
| UI displays one tenant but sends another | Canonical tenant context, explicit organization ID on every operation, RLS/RPC recheck, and two-tenant end-to-end tests |
| Hidden or enabled controls imply authority | Permission-aware UX plus mandatory server denial tests for every privileged action |
| Stale AAL display authorizes a command | Database AAL enforcement; UI refreshes session and treats AAL only as step-up guidance |
| Session expires during a multi-step flow | Safe sign-in redirect, no lost canonical state, and refresh/resume acceptance |
| Double-click or browser retry duplicates work | Stable idempotency keys, disabled in-flight submission, canonical result recovery, and concurrency tests |
| Failure is mistaken for success | Explicit pending/failure states, correlation ID, canonical reread, and no optimistic authority state |
| Private media persists in browser storage | No Cache API/local persistence, no public URL, short-lived object URL, checksum verification, and cleanup |
| Preview origin is misconfigured as production | Separate preview configuration, synthetic data only, allowlisted redirects, and environment-boundary tests |
| Third-party frontend dependency compromises Studio | Pinned versions, lockfile, dependency review, minimal package set, and no remote runtime scripts |
| Approval or revocation is triggered accidentally | Exact-target summary, AAL2, explicit confirmation, reason code, and immutable audit evidence |

## Explicit non-goals

- Production deployment, production credentials, production data, custom
  production domains, public launch, or production support commitments.
- Publication, scheduling, distribution, RSS/feed generation, CDN delivery,
  notifications, or public content pages.
- Public Storage, browser uploads, object overwrite/delete/list, arbitrary file
  download, or public/signed media URLs.
- Live AI, ElevenLabs, external text-to-speech, artwork, music, transcription, or
  any paid provider.
- Changes to the current Strongr Daily application or any Strongr Daily system.
- Self-service sign-up, invitations, user administration, password recovery
  operations, support impersonation, or organization administration.
- Real-time collaborative editing, comments, assignments, notifications, or
  presence.
- Recommendation, personalization, engagement, playback analytics, journaling,
  prayer, billing, family, child, care, or highly sensitive data features.
- Strongr Daily 2.0, Library, Trust, Flow, Guide, Insights, or public ecosystem
  integration.
- Replacing deterministic adapters or the existing server-side worker.
- Weakening RLS, grants, AAL, immutable records, audit evidence, private Storage,
  tenant integrity, or service-role isolation.

## Schema and migration rule

M3 should consume the accepted M0–M2 model and commands. A user-interface
preference is not sufficient reason to add a table, broaden a grant, or weaken a
policy.

If a genuine workflow or tenant-discovery gap requires a database change:

1. stop the affected M3 slice;
2. document the exact gap and threat impact;
3. create a new append-only migration through the accepted migration process;
4. keep browser writes behind narrow commands;
5. add positive, negative, cross-tenant, grant, RLS, and migration-history tests;
6. obtain owner approval through a separate protected pull request.

Accepted migrations are never edited or replayed over populated objects.

## Delivery sequence

Each stage is delivered through a small protected pull request. Every existing
required check must pass on the current head. No later stage begins until the
preceding stage is owner-accepted.

1. **M3.0 — Browser and design foundation**
   - frontend/hosting ADR;
   - pinned framework, Auth client, browser-test, and accessibility dependencies;
   - accessible application shell, routing, semantic design tokens, and error
     boundary;
   - secure headers/CSP and preview environment contract;
   - built-bundle credential and forbidden-boundary checks.
2. **M3.1 — Identity, tenant, and work queue**
   - sign-in/sign-out and session expiry;
   - TOTP enrollment, challenge, verification, factor visibility, and confirmed
     unenrollment;
   - active organization selection from current memberships;
   - permission-aware navigation and canonical work-queue status.
3. **M3.2 — Brief through governed package**
   - schema-driven brief creation;
   - durable generation status and recovery;
   - immutable draft/version navigation and manual successor;
   - submission, automated evidence, separate human review lanes, rights and
     Scripture evidence;
   - AAL2 approval/revocation and immutable package creation.
4. **M3.3 — Media through private release staging**
   - AAL2 deterministic media request and durable status;
   - exact checksum-verified private playback;
   - transcript and accessibility review;
   - AAL2 immutable staging and revocation with exact-target confirmation.
5. **M3.4 — Preview and acceptance**
   - owner-accessible non-production preview with synthetic fixtures;
   - local and `strongr-os-dev` browser end-to-end acceptance;
   - accessibility, responsive, security, tenant, permission, assurance,
     idempotency, failure/resume, privacy, observability, and artifact evidence;
   - final canonical `evidence/m3/acceptance-record.json`;
   - proposed M3 required check added to branch protection only after stable
     green proof on protected `main`.

## Acceptance matrix

| Gate | Required proof |
| --- | --- |
| M3 entry | The accepted M2 record and durable checkpoint are present on protected `main`. |
| Scope isolation | The current Strongr Daily and all production environments remain unchanged. |
| Browser-only boundary | Studio builds as a static browser application with no server secret, SSR authority, Edge Function, or generic backend proxy. |
| Dependency integrity | New packages are minimal, pinned, locked, reviewed, and compatible with Node.js 22 or later. |
| Authentication | Provisioned users can sign in/out; expired sessions fail safely; tokens never enter URLs, logs, analytics, or artifacts. |
| MFA operation | TOTP enrollment/challenge works; real AAL1 denial and AAL2 success remain enforced by the database for sensitive commands. |
| Tenant discovery | The user sees only active organizations allowed by current RLS and cannot select or infer another tenant. |
| Tenant continuity | Every screen and command uses the active organization explicitly and two-tenant browser tests prove isolation. |
| Permission UX | Controls accurately explain availability, but hidden/enabled controls never replace server authorization; forced requests are denied. |
| Browser mutation boundary | Governed tables, Auth internals, and Storage metadata receive no direct browser mutation. |
| Service-role boundary | No privileged key or environment name appears in source, bundle, runtime configuration, logs, screenshots, or artifacts. |
| Workflow completeness | An authorized operator completes brief → draft → evidence → human review → approval → package → media → human media review → private staging → revocation without SQL, dashboard, CLI, or copied UUIDs. |
| Exact identity | Every decision names and binds the exact immutable version, evidence, package, artifact, manifest, and hash. |
| Idempotency | Double submission, refresh, retry, and concurrent interaction do not duplicate governed work or side effects. |
| Failure and resume | Queued, running, retrying, failed, dead-lettered, blocked, revoked, and recovered states are distinct; refresh reconstructs canonical state. |
| Private media | Only the exact authorized artifact is retrieved; type, byte count, and SHA-256 verify before playback; no listing, public URL, cache, or persistent browser copy exists. |
| Human governance | Automated output remains visibly separate from Scripture, theology, editorial, rights, media, transcript, accessibility, approval, staging, and revocation authority. |
| Confirmation safety | Approval, revocation, package creation, media request, and staging show exact targets and effects before submission. |
| Accessibility | Critical flows pass automated and manual WCAG 2.2 AA evidence for keyboard, focus, semantics, labels/errors, contrast, zoom, reduced motion, screen-reader status, transcript, and touch targets. |
| Responsive operation | The complete flow works at the approved desktop/tablet viewports and remains usable at a narrow viewport. |
| Browser security | CSP, clickjacking, referrer, redirect-origin, malicious-content, dependency, and built-bundle checks pass. |
| Privacy | No unnecessary personal data, private content, tokens, TOTP material, plaintext media, or secrets appear in telemetry or retained evidence. |
| Observability | Safe status, reason codes, correlation IDs, latency, retries, and worker health are visible without exposing confidential payloads. |
| Preview isolation | The preview uses synthetic data and isolated Strongr OS development credentials only; it cannot access production or Strongr Daily. |
| Evidence on failure | Browser logs, screenshots where privacy-safe, accessibility output, checksums, cleanup status, and test summaries upload even when a gate fails. |
| Existing regression | All M0–M2 required checks, migrations, tenant tests, Auth tests, private Storage tests, and acceptance records remain green and unchanged. |
| Owner usability | Neil completes or reviews the primary success scenario in the preview and explicitly accepts the operator experience. |
| Owner acceptance | Neil explicitly approves the final M3 acceptance record before merge or promotion. |

## Definition of done

M3 is complete only when:

- every accepted delivery slice is merged through protected pull requests;
- the exact browser application artifact passes source and bundle security
  checks;
- all existing M0–M2 gates remain green;
- the complete governed workflow passes locally and against `strongr-os-dev`
  through the real browser, Auth, RLS, RPC, worker, and private Storage
  boundaries;
- accessibility, two-tenant, AAL1/AAL2, permission-denial, idempotency,
  failure/resume, media-integrity, privacy, and preview-isolation evidence is
  preserved;
- the owner can use the non-production preview without SQL, dashboard, CLI, or
  copied identifiers;
- a canonical M3 acceptance record binds the exact commit, pull requests,
  workflow runs, artifacts, preview environment, dependencies, and owner
  approval; and
- the repository owner explicitly accepts M3.

M3 completion still does not authorize publication, a production deployment, a
public bucket, browser uploads, live external providers, new Strongr Society
products, or changes to the current Strongr Daily application.
