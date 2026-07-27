# M2.2 — Governed Review and Private Release Staging

- **Status:** Implemented for protected review
- **Scope authority:** `docs/architecture/M2_SCOPE.md`, approved through PR #19
- **Worker foundation:** M2.1 accepted through PR #21 at
  `9bae01e039e575c5a2e7eb6308d680a6586eb96c`
- **Remote authority:** None; M2.2 does not mutate a linked Supabase project

## Outcome

M2.2 lets an active tenant member retrieve one exact canonical private audio
artifact, record human media and accessibility evidence, and prepare or revoke
an immutable non-public release bundle. The browser cannot list the bucket,
mutate Storage, write governed tables, or publish anything.

Publication, production deployment, live providers, and Strongr Daily remain
out of scope.

## Exact private retrieval

Studio first retrieves canonical artifact metadata through a tenant-filtered
Data API query. It then requests only that exact path through Supabase's
authenticated private-object endpoint using the user's session. The Storage
policy permits object-get operations only when canonical `media_artifacts`
metadata matches the bucket and path and the caller is a current organization
member. It does not permit bucket listing.

Studio requires `audio/wav`, disables response caching, checks the exact byte
count, and calculates SHA-256 with browser WebCrypto before returning verified
bytes. Browser upload, overwrite, delete, list, and public URL flows remain
absent and are rejected by the environment-boundary check.

## Human review

`m2_record_media_review` re-evaluates active membership and `media.review`
inside PostgreSQL. It accepts evidence only for an exact succeeded canonical
artifact. An approved decision requires both a ready transcript and approved
accessibility status.

The database constructs the evidence hash from canonical artifact integrity
metadata, authenticated reviewer identity, all review statuses, reason,
evidence, and schema version. Review records and their audit events are
append-only. Automated workers and the service role cannot invoke this human
command.

## Staging and revocation

`m2_stage_release` requires `release.stage` and real AAL2. Under an
organization-and-artifact advisory lock, it resolves:

- an exact unrevoked M1 production package;
- the succeeded canonical media artifact;
- the current approved human review and its evidence hash;
- the immutable output specification;
- no unresolved blocked reconciliation; and
- bounded release configuration supplied by the client.

PostgreSQL constructs and hashes the complete immutable staged manifest. Exact
idempotent replay returns the original bundle; changed reuse is rejected.

`m2_revoke_staged_release` requires `release.revoke` and real AAL2. Revocation
is append-only and idempotent only for the exact same reason. A revoked bundle
cannot be recreated.

## Security boundary

The three M2.2 commands are `SECURITY DEFINER` functions with fixed search
paths, in-body identity and authorization checks, revoked default execution,
and exact authenticated grants. The service role has neither these human
authorities nor direct table DML. Existing tenant RLS and immutable-table
triggers remain intact.

The migration replaces the M2.0 placeholder object-read policy with an
operation-aware exact-retrieval policy. It adds no Storage mutation policy and
does not edit an accepted migration.

## Acceptance

Repository tests prove exact RPC bodies, tenant-scoped reads, byte-count and
checksum verification, no bucket listing, AAL1 staging/revocation denial, AAL2
success, immutable manifest binding, replay behavior, revocation, cross-tenant
denial, table immutability, audit evidence, and least-privilege grants.

M2.3 remains responsible for independent byte backup, complete inventory,
disposable restore, database/object reconciliation, local and non-production
remote acceptance, failure artifacts, observability, and the final M2 record.
