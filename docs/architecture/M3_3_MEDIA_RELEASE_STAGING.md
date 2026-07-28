# M3.3 — Governed media and release staging

Status: owner-accepted and merged through PR #34 as protected-main commit
`f2a609db170d847a71cd760db3964fb70ce41c61`.

## Outcome

M3.3 exposes the already-accepted M2 media workflow through Strongr Studio without adding a
database migration or changing a security boundary. An authenticated operator can request
deterministic audio for an immutable production package, observe durable job and artifact state,
checksum-verify one exact private artifact before playback, record transcript and accessibility
review evidence, stage an immutable non-public release bundle, and append a revocation.

Staging is not deployment or publication.

## Trusted boundaries

- The browser uses only the public Supabase URL, publishable key, and the current user JWT.
- Tenant reads remain canonical, organization-filtered REST reads protected by RLS.
- Mutations remain the four narrow M2 RPCs: `m2_request_media`,
  `m2_record_media_review`, `m2_stage_release`, and `m2_revoke_staged_release`.
- PostgreSQL remains authoritative for tenant membership, permission, workflow identity, and AAL2.
- Media request, staging, and revocation require AAL2 in the database transaction.
- The browser never receives a service-role key and performs no direct table mutation.

## Private playback contract

1. The operator selects one canonical artifact identity.
2. The authenticated gateway reloads that exact artifact under the active organization.
3. It requests only the canonical private object path from the authenticated Storage endpoint.
4. `Cache-Control: no-store` is requested.
5. Returned MIME type, byte count, and SHA-256 must match canonical metadata before playback.
6. Only then does Studio create an in-memory object URL.
7. Studio revokes that URL when the artifact changes, playback ends, the playback view closes, the
   organization changes, or the page unmounts.

Studio does not list Storage, create a signed or public URL, upload from the browser, persist media
bytes, or log private media content.

## Operator confirmations

- Media request confirmation names the exact production package and allowlisted output spec and
  preserves a stable idempotency key until confirmed success.
- Review confirmation names the exact artifact and checksum and records human transcript and
  accessibility evidence.
- Stage confirmation names the exact package, artifact, and approved review, and explicitly states
  that the result is private staging only.
- Revocation confirmation names the exact staged bundle and records an append-only reason.

Each success is followed by a reload of canonical database state. A browser timeout or failed
response is not interpreted as success.

## Acceptance evidence

Acceptance must demonstrate:

- route and capability gating for governed media;
- AAL2 user experience plus database-enforced AAL2 boundaries;
- exact RPC bodies and stable request idempotency;
- durable job, artifact, review, bundle, and revocation reloads;
- exactly one authenticated object download for the selected canonical path;
- byte-count and SHA-256 verification before an audio element is exposed;
- object URL revocation lifecycle;
- no public/list/upload Storage access or direct database mutation;
- keyboard, narrow-layout, and automated accessibility checks;
- build, typecheck, lint, format, boundary, unit, and browser checks.

The M3 workflow uploads evidence even when a check fails.

The accepted implementation passed 66 unit and contract tests, 22 Playwright
tests across desktop and narrow Chromium, all six pull-request checks, and the
four protected-main regression workflows. It changed no migration, RLS policy,
grant, Storage policy, Supabase project, deployment, production system, or
Strongr Daily file.

## Rollback

The UI route, page, flow, tests, and this document can be reverted together. Because M3.3 adds no
migration, grant, policy, bucket change, or production deployment, rollback does not require a
database operation and cannot weaken the accepted M2 security posture.
