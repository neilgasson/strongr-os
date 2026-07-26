# M1.2 Governed Brief-to-Draft Flow

## Status

Implementation candidate for protected review. M1.1 was accepted through
owner-approved PR #14 at commit
`da6418a793b244afa973cfecaa69a797cf41bc2c`.

M1.2 adds a non-deployed operator and persistence slice from a validated
audio-reflection brief to one immutable AI-assisted draft. It does not connect
an external AI provider, approve, export, publish, or deploy content, and it
does not modify the current Strongr Daily application.

## Operator contract

An authenticated Studio user can:

1. Validate and create an audio-reflection brief through
   `m1_create_audio_brief`.
2. Request its durable generation job through `m1_request_generation`.
3. Observe only tenant-scoped briefs, generation jobs, and content versions.
4. Create a manual draft through `m1_create_manual_version`.
5. Explicitly submit a selected draft through `m1_submit_version`.

The browser transport uses a Supabase publishable key in `apikey` and the
authenticated user's access token in `Authorization`. Reads include an explicit
organization filter and remain protected by RLS. Governed writes remain RPC
commands; there is no browser direct-table mutation.

Brief creation and generation request are separate durable commands. If the
request fails after brief creation, the flow returns only the durable brief and
content-item identities in a typed recovery error. It does not silently create
another brief or automatically retry a mutating request.

## Draft persistence contract

The M1.1 worker validates the adapter output against the checked-in content
schema and recomputes its canonical adapter hash before calling
`m1_complete_generation_attempt`.

The service-role-only completion command then atomically:

1. Revalidates the current event lease and immutable attempt provenance.
2. Locks the generation job and its content item in a stable order.
3. Appends one immutable successful generation-attempt fact.
4. Allocates the next content version number.
5. Inserts one tenant-scoped, AI-assisted draft linked to its source job,
   brief, content item, and requesting membership.
6. Computes the immutable payload hash in PostgreSQL.
7. Records the initial draft workflow transition and redacted audit evidence.
8. Marks the generation job succeeded with exact provider provenance.

A partial unique index on `(organization_id, source_job_id)` guarantees at most
one generated draft for a job. An exact completion replay returns the original
content-version identity; a changed replay is rejected.

The worker's adapter hash and the database payload hash intentionally serve
different boundaries. The adapter hash proves the canonical generated object
observed by the worker. PostgreSQL independently hashes the stored JSONB value
for immutable database integrity.

## Security boundary

- `m1_complete_generation_attempt` is `SECURITY DEFINER` with a fixed search
  path, revoked from `PUBLIC`, `anon`, and `authenticated`, and granted only to
  `service_role`.
- The legacy hash-only completion signature is removed.
- `service_role` receives no direct insert, update, or delete privilege on
  `content_versions`; generated drafts must cross the completion command.
- Existing authenticated RLS, tenant membership checks, command permissions,
  browser write denials, immutable triggers, AAL2 approval gates, and
  production-package boundaries are unchanged.
- Generated output is never included in worker evidence. Evidence contains
  identifiers, state, counts, and stable machine codes only.
- Submission is a separate authenticated human command. Generation completion
  never submits, reviews, approves, exports, publishes, or deploys a draft.

## Acceptance proof

- Unit tests cover exact browser RPC payloads, publishable-key and user-token
  headers, bounded tenant reads, response parsing, no automatic mutation retry,
  recovery identities, explicit manual draft and submission commands, output
  validation, completion payload transport, and returned draft identity.
- pgTAP proves command grants, cross-tenant denial, generation-request
  idempotency, worker claim and completion, immutable draft provenance, exact
  replay behavior, duplicate prevention, workflow and audit evidence, RLS
  isolation, and explicit human submission.
- Protected database checks reset a clean disposable database and apply the
  ordered migration set once. Migration history is then verified by the
  existing remote-acceptance harness.
- Protected evidence uploads use `if: always()` so diagnostic artifacts remain
  available even when a validation step fails.

## Rollback

Before deployment, application changes can be reverted normally. If the
migration has been applied to a shared non-production environment, stop the
worker and use a reviewed forward repair. The repair must preserve any existing
generated draft and attempt evidence, revoke the new command signature, and
restore a compatible completion contract without editing an applied migration.
Do not weaken RLS or grant direct content-version mutation as a rollback.
