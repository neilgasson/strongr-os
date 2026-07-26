# M1.3 Governed Review-to-Package Flow

## Status

Implementation candidate for protected review. M1.2 was accepted through
owner-approved PR #15 at commit
`a960262d09a011cb443c52cb3505c84763a1d8af`.

M1.3 connects the existing submitted-version database contract to the Studio
and worker application boundaries. It stops after creating an immutable
production-package manifest. It does not publish, deploy, connect an external
AI provider, create media, or modify the current Strongr Daily application.

No migration is required. The accepted migration set already contains the
tenant constraints, RLS, explicit grants, append-only evidence tables,
service-role-only check command, human permission checks, AAL2 gates,
revocation, and immutable package command required by this slice.

## Automated check boundary

The worker runs a deterministic, versioned `strongr.m1_3.deterministic@1.0.0`
check engine over a strictly parsed `strongr.audio_reflection.v1` payload. It
records one result for each definition in the checked-in eight-check registry:

- Scripture reference and translation presence;
- conservative divine-impersonation and harmful-certainty patterns;
- required editorial structure;
- declared source evidence;
- transcript readiness; and
- a non-blocking Strongr pronunciation warning.

Results contain only rule identifiers, booleans, and counts. Draft text,
credentials, and private database errors are excluded from structured evidence.
Unsupported definition versions produce `error` evidence and therefore fail
closed at approval. Mutating RPCs are attempted once and are never
automatically retried.

These checks are evidence, not theological, pastoral, editorial, rights, or
approval authority. Pattern checks can have false negatives. The database still
requires separate approved Scripture, theology, and editorial decisions, plus
verified Scripture evidence and a cleared rights snapshot, for the exact
submitted version.

## Human operator boundary

The authenticated Studio flow exposes separate, explicit commands to:

1. activate a versioned review policy;
2. record Scripture evidence;
3. record a rights snapshot;
4. record one human decision in each review lane;
5. approve the exact version, policy, check run, evidence records, and three
   review decision IDs;
6. create an immutable production-package manifest from an unrevoked approval;
7. revoke an approval with a machine reason code.

The browser transport continues to send only the publishable key and the
signed-in user's access token. It cannot use the service role and has no direct
insert, update, or delete grants on governed tables. Reads are bounded and
explicitly filtered by organization in addition to RLS.

Studio does not claim or cache authentication assurance. PostgreSQL evaluates
the current JWT `aal` claim, active membership, and exact permission inside
each privileged transaction. Policy activation, Scripture/rights evidence,
human reviews, approval, revocation, and package creation require AAL2 at the
database boundary.

## Approval and package integrity

Approval remains one database transaction that locks the submitted version,
verifies the active policy and complete check results, verifies cleared
evidence, binds the exact three approved human decisions, records AAL2, and
hashes the evidence bundle.

Package creation remains a separate AAL2 command. It accepts only an unrevoked
approval and stores one append-only manifest containing the exact content,
payload hash, evidence-bundle hash, policy, check run/results, Scripture and
rights evidence, and review IDs. Package creation does not publish or transfer
the manifest.

Revocation is append-only. A focused pgTAP assertion proves that AAL1 cannot
revoke, AAL2 can revoke, and a revoked approval cannot authorize another
package request.

## Acceptance proof

- Unit tests cover strict input validation, separate command orchestration,
  exact RPC payloads, publishable-key/user-token headers, no mutation retry,
  tenant-scoped reads, all eight deterministic results, fail-closed risk
  patterns, redacted success/failure evidence, and service-role check
  transport.
- Existing pgTAP tests prove tenant isolation, anonymous and browser-write
  denial, exact evidence binding, AAL1 denial/AAL2 success, append-only
  evidence, and manifest hashing. M1.3 extends the proof for AAL2 revocation
  and post-revocation package denial.
- Protected application evidence is uploaded with `if: always()`. The database
  and reliability workflows continue to reset a clean disposable database,
  apply the ordered migration set once, and run the complete pgTAP contract.

## Recovery and rollback

There is no M1.3 schema change to roll back. Before deployment, application
changes can be reverted normally. A failed human command is not automatically
retried; the operator reloads tenant-scoped evidence, verifies the current AAL2
session and exact identifiers, then explicitly retries the intended command.

If check recording fails, no approval is created and failure evidence contains
only safe identifiers and a stable error code. If package creation fails after
approval, the durable approval identity remains visible for an explicit retry.
Never recover by granting browser DML, exposing a service credential, weakening
RLS, bypassing AAL2, editing append-only evidence, or publishing manually.
