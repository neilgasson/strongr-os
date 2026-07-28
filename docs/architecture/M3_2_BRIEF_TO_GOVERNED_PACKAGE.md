# M3.2 Brief Through Governed Package

## Status

Implementation proposed under the owner-approved M3 scope after owner acceptance
of M3.1 through PR #30 and the durable checkpoint in PR #31.

M3.2 turns the accepted M1 brief, version, evidence, human-review, approval,
revocation, and package contracts into one accessible Strongr Studio browser
workspace. It stops at an immutable, non-public production-package manifest.
It does not implement media, release staging, publication, deployment, live
providers, production configuration, or changes to Strongr Daily.

## Existing boundary

No migration is required. M3.2 consumes the already accepted:

- authenticated tenant reads protected by current grants and RLS;
- typed `StudioFoundation`, `BriefToDraftOperatorFlow`, and
  `ReviewToPackageOperatorFlow`;
- narrow `m1_*` governed commands;
- durable generation worker and deterministic adapter;
- immutable version, evidence, review, approval, revocation, and package tables;
- real membership, permission, tenant, workflow, and AAL checks inside each
  database transaction.

The browser receives only the isolated Supabase URL, publishable key, and the
signed-in user's session token. It receives no service role, database password,
direct governed-table mutation, worker command, Storage write, or production
credential.

## Operator workflow

For the explicit active organization, an operator can:

1. create a schema-valid synthetic audio-reflection brief and request one
   durable generation job with a stable idempotency key;
2. refresh canonical brief, job, and immutable-version status without assuming
   a mutation succeeded;
3. inspect an exact immutable version and create a manual successor instead of
   editing a stored version;
4. submit one exact draft through the accepted human command;
5. inspect automated check evidence separately from human authority;
6. record Scripture evidence, a rights snapshot, and separate Scripture,
   theology, and editorial decisions;
7. select only canonical records for the exact submitted version;
8. confirm and request AAL2 approval of that exact evidence bundle;
9. confirm and create an immutable package from an unrevoked approval; and
10. confirm and append an approval revocation.

Titles, version numbers, states, timestamps, hashes, and safe identifiers are
shown so an operator does not need SQL, the Supabase dashboard, a CLI, or copied
UUIDs.

## Mutation safety

- Every command includes the active organization and a fresh correlation ID.
- Generation uses one stable idempotency key for the current form submission.
  Double-clicks are disabled and a changed request receives a new key.
- Other mutating commands are attempted once and are never automatically
  retried.
- A post-brief generation failure preserves the durable brief and content-item
  identities and requires an explicit operator recovery decision.
- After success, failure, uncertainty, refresh, or tenant change, Studio reloads
  canonical tenant records.
- Approval, package creation, and revocation require an exact-target summary,
  a confirmation checkbox, and a reason code where the command requires one.
- UI capability and AAL state are guidance. The database remains authoritative.
- Safe errors contain stable status/reason context but never tokens, passwords,
  private connection details, stack traces, or unredacted server errors.

## Human-governance separation

Automated checks are displayed as versioned evidence only. They never create or
imply Scripture, theology, editorial, rights, approval, export, publication, or
release authority.

Human review lanes remain separate. Approval is available only when the
operator selects the exact submitted version, active policy, completed check
run, verified Scripture evidence, cleared rights snapshot, and three approved
human decisions for that same version. PostgreSQL revalidates every relationship
and real AAL2 inside the approval transaction.

Package creation remains a separate AAL2 command and creates only the accepted
immutable manifest. Revocation remains append-only and prevents revoked
authority from authorizing another package.

## Acceptance proof

The M3 application workflow must prove:

- schema-driven brief validation and stable generation idempotency;
- disabled duplicate submission and no automatic mutation retry;
- canonical queued, running, failed, dead-letter, succeeded, submitted,
  approved, packaged, and revoked states;
- durable recovery identities when generation request fails after brief creation;
- immutable version rendering and manual-successor creation;
- automated evidence visually and semantically separated from human review;
- exact-version selection across evidence, review, approval, package, and
  revocation;
- permission-aware controls plus authoritative forced-request denial;
- AAL1 guidance and existing database AAL2 enforcement;
- tenant switching with no cross-tenant state or command;
- safe session expiry and canonical refresh/resume;
- exact-target confirmations for authority-changing commands;
- WCAG 2.2 A/AA automated checks, keyboard operation, narrow-viewport operation,
  and failure-preserving browser evidence; and
- source and built-bundle checks proving no privileged credential, direct table
  mutation, public Storage, runtime script, or Strongr Daily boundary entered
  the browser.

All existing M0-M2 database, reliability, application, and acceptance workflows
must remain green. Evidence artifacts continue to upload with `if: always()`.

## Recovery and rollback

There is no schema rollback. Before deployment, the M3.2 browser change can be
reverted normally.

On an uncertain command result, Studio does not retry automatically or claim
success. The operator reloads canonical tenant state, verifies the exact target,
current permission, and current AAL, then explicitly decides whether another
command is valid.

Never recover by granting direct browser DML, exposing a service credential,
weakening RLS or AAL, editing immutable evidence, fabricating a human decision,
or publishing a package.
