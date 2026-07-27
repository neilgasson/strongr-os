# M2.0 — Media and Private Storage Foundation

- **Status:** Implemented for protected review
- **Scope authority:** `docs/architecture/M2_SCOPE.md`, approved through PR #19
- **Remote authority:** None; M2.0 does not mutate a linked Supabase project

## Outcome

M2.0 establishes the schema, contracts, deterministic fixture, private-bucket
configuration, and tested access boundaries needed by later M2 stages. It does
not request media, run an adapter, upload an object, record a human decision,
stage a release, publish, deploy, or change Strongr Daily.

## Canonical model

| Record | Authority and mutability |
| --- | --- |
| `media_output_specs` | Immutable versioned allowlist for mono 16 kHz, 16-bit PCM WAV |
| `media_jobs` | Exact package/spec/request fingerprint with guarded worker state |
| `media_job_attempts` | Immutable final adapter provenance |
| `media_artifacts` | Immutable bucket/path/byte/checksum/validation authority |
| `media_reviews` | Immutable human media and accessibility evidence |
| `staged_release_bundles` | Immutable, non-public package/artifact/review manifest |
| `staged_release_revocations` | Immutable revocation authority |
| `media_reconciliation_events` | Immutable partial-failure evidence |

Every tenant-owned relationship carries `organization_id` and uses the
accepted composite tenant foreign-key pattern. Foreign-key, RLS, worker-ready,
and reconciliation paths are indexed.

## Storage boundary

The supported local Supabase configuration declares one bucket:
`strongr-os-media`. It is private, accepts only `audio/wav`, and is capped at
25 MiB. Migrations do not insert, update, or delete managed Storage metadata.

The only M2 Storage policy is authenticated `SELECT`. It joins the exact object
name and bucket to immutable `media_artifacts` metadata and re-evaluates active
organization membership. It does not trust `storage.objects.owner_id`.
Application roles receive no M2 Storage insert, update, or delete policy.

Object paths are write-once and exactly:

```text
<organization UUID>/<production package UUID>/<artifact UUID>.wav
```

No title, email address, private content, or human-readable identifier is
allowed in a canonical path.

## Role boundary

- `anon` receives no M2 table access.
- `authenticated` receives RLS-filtered reads for specifications, jobs,
  artifacts, reviews, staged bundles, and revocations.
- Browser callers cannot read worker attempt or reconciliation details.
- `authenticated` and `service_role` receive no direct M2 table DML.
- No M2 mutation function exists in this stage.
- The service credential remains server/CI-only and is rejected by the client
  boundary scan.

## Deferred work

M2.1 must add the durable request and worker commands, provider-neutral
synthetic adapter, byte validation, supported Storage API upload, retry/dead
letter handling, and executable reconciliation. M2.2 must add human review,
exact retrieval, AAL2 staging, and revocation commands. M2.3 must prove
inventory, independent byte backup, disposable restore, local/remote
acceptance, and measured recovery. None of those actions is authorized by this
record.

## Forward repair

The migration is atomic and forward-only. A failure on a clean disposable
database rolls back the entire migration. Once accepted or executed outside
ephemeral CI, repair is delivered by a new migration; the accepted file and
recorded migration history are never edited or replayed over populated
objects.
