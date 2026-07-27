# M1.4 Application Acceptance

## Status

Accepted through owner-approved PR #17 at implementation head
`d17343746017d495a33dc665c06607b45c315c78` and squash-merge commit
`fbd4fef747a53c69622a5aed33322e5008bacf6d`. The canonical acceptance record is
`evidence/m1/acceptance-record.json`.

M1.4 adds acceptance proof only. It adds no product capability, schema
migration, deployment, publication path, external AI provider, media
integration, or change to the current Strongr Daily application.

## Acceptance boundary

The M1 slice ends when an authorized human creates an immutable
production-package manifest. Acceptance must exercise the checked-in Studio
operator flows and durable worker against real Supabase boundaries:

1. two isolated tenant fixtures use real Auth sessions;
2. the operator creates a schema-valid brief and one idempotent generation
   request;
3. the service-role-only worker records a transient failure, retries through
   the durable lease path, and persists one AI-assisted immutable draft;
4. the operator submits the exact generated version;
5. the service-role-only deterministic check runner records all eight
   versioned checks;
6. AAL2 human commands separately record the active policy, Scripture
   evidence, rights evidence, and Scripture, theology, and editorial reviews;
7. AAL1 approval and package attempts fail, while AAL2 approval and package
   creation bind the exact version and evidence hashes;
8. revocation is append-only and prevents another package from the revoked
   approval; and
9. health, privacy, cleanup, and artifact evidence pass.

The deterministic adapter and all fixture content are synthetic. Automated
checks remain evidence only and never receive human approval authority.

M1.4 also aligns the generated-output hash with the existing PostgreSQL
`jsonb::text` evidence contract. Earlier unit tests proved deterministic replay
inside Node.js but did not cross the database completion boundary. The fixed
database-compatible vector is covered without changing the database hash
function, migration history, or immutable evidence semantics.

## Local proof

The `M1 acceptance / local` job starts an isolated Supabase stack, resets it
from zero, verifies that every repository migration has exactly one history
row, runs every pgTAP contract, then runs the application acceptance harness
through the local Data API and Auth service.

Local acceptance deliberately permits the CLI-generated local legacy keys and
HTTP loopback URL. Production-like remote acceptance still requires HTTPS, a
modern `sb_publishable_` browser key, and the service-role credential only in
the worker process.

## Non-production remote proof

The manual remote job is locked to project reference
`fifrlyddmjkogmdvyjdp` (`strongr-os-dev`). URL and database identities must
both match that reference.

The accepted M0.2 dev database predates the current repository filenames for
its baseline migrations. M1.4 does not rewrite that accepted history and does
not replay the baseline over populated tables. The guarded migration helper
verifies the accepted M0.2 object and history-name preconditions, then applies
only:

- `20260726161909_m1_1_durable_worker_commands.sql`; and
- `20260726205703_m1_2_brief_to_draft.sql`.

Each migration body and its exact repository version/name history row commit
in one transaction. A rerun verifies and skips an already recorded migration;
a history-name conflict, project mismatch, missing baseline, or partial schema
fails closed.

The remote application harness uses temporary users and organizations, emits
only identifiers, counts, stable status names, and hashes, then removes all
database and Auth fixtures even after a failed gate.

## Failure, recovery, and observability

The application harness deliberately fails the deterministic adapter once.
The first worker pass must record retry state in the generation attempt and
outbox. The next pass must claim the same durable work safely, create one draft,
acknowledge delivery, and leave operational health at `ok`.

The existing accepted M0.2 evidence remains the canonical proof for concurrent
leases, crash recovery, stale-token rejection, poison-message visibility,
forward repair, and backup/restore. M1.4 proves that the application-level
worker composes with those primitives without changing them.

Both local and remote jobs upload logs, JSONL evidence, health, metrics, and
checksums with `if: always()`. Fixture cleanup is part of the harness result,
not a best-effort workflow epilogue hidden from evidence.

## Accessibility and privacy

M1 remains a headless operator boundary; it does not ship a visual interface.
The acceptance gate therefore proves the current accessibility contract at
this boundary:

- the required `accessibility.transcript_ready` definition is blocking;
- the exact generated transcript-shaped content passes the versioned check;
- every acceptance result is machine-readable JSON with explicit test and
  status fields; and
- no access token, key, database URL, email address, password, draft body, or
  Scripture text is written to evidence.

A future visual Studio interface requires its own keyboard, focus, semantic
structure, contrast, zoom, and assistive-technology tests before deployment.
M1.4 does not claim those future UI checks.

## Evidence lifecycle

`evidence/m1/acceptance-record.template.json` defines the record contract. The
accepted record at `evidence/m1/acceptance-record.json` binds:

- the passing local and remote jobs on the reviewed implementation;
- exact workflow, job, artifact, migration, and recovery identifiers;
- protected checks on the final pull-request head and squash-merged `main`;
- the preserved artifact from the initial failed acceptance run;
- the active M1 branch-protection gates; and
- the repository owner's explicit M1.4 merge and protection approvals.

The committed record closes M1 only. It does not authorize M2 implementation,
deployment, publication, production acceptance, an external AI provider, or a
change to Strongr Daily. M2 requires its own owner-approved scope and gates.

## Rollback

The harness and workflow can be reverted without database rollback. If the
remote M1 delta has been applied, it remains forward-only; do not delete its
history rows or remove its security boundaries. A defect requires a new
reviewed forward-repair migration.

Never recover by replaying the baseline into `strongr-os-dev`, weakening RLS,
granting browser DML, exposing the service role, bypassing AAL2, editing
append-only evidence, or publishing manually.
