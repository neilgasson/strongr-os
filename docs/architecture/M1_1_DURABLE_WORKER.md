# M1.1 Durable Generation Worker

## Status

Accepted on protected `main` through owner-approved PR #14 at commit
`da6418a793b244afa973cfecaa69a797cf41bc2c`. M1.0 was accepted through PR #13
at commit `58fdcd9d3ff9736faf505c776d03c4367b7dbd9a`.

M1.1 added a non-deployed, server-side worker slice. At its acceptance
boundary, it did not create a draft version, begin M1.2 operator flows, connect
an external AI provider, publish content, or modify the current Strongr Daily
application.

## Delivery contract

The generation worker uses at-least-once delivery:

1. `m1_claim_generation_events` claims only
   `content.generation_requested.v1` events with `FOR UPDATE SKIP LOCKED`.
2. Each claim has an expiring, random lease token.
3. `m1_begin_generation_attempt` validates that exact lease before locking the
   generation job and appending one private attempt claim with its exact worker,
   token, provider/model, prompt checksum, schema, and start time.
4. The provider-neutral adapter runs outside the database transaction.
5. `m1_complete_generation_attempt` appends one immutable terminal attempt fact
   with the exact provider response, response schema, latency, and provenance,
   then stores the output hash on the generation job.
6. `m0_ack_outbox_event` records one immutable delivery receipt with the stable
   delivery key `generation-<event-id>`.

If the worker completes generation but crashes before acknowledgement, the
event lease expires. A recovery worker receives `already_succeeded`, skips the
external generation side effect, and records the original stable delivery
receipt.

## Retry and dead letter

- Invalid briefs, adapter failures, and provenance mismatches use stable,
  machine-readable error codes.
- `m1_fail_generation_attempt` appends the immutable failed attempt fact and
  moves the job to `failed` or `dead_letter`.
- `m0_fail_outbox_event` applies the same retry delay and maximum-attempt
  boundary to delivery.
- An expired running attempt is recorded as an immutable
  `worker_lease_expired` failure before a new private attempt claim is appended.
- Database or acknowledgement ambiguity is not retried in-process. The worker
  leaves the current lease to expire so tokenized recovery can determine the
  durable state.

## Security boundary

- The worker accepts exactly one Supabase secret key or transitional legacy
  service-role key.
- Modern `sb_secret_...` values are sent only in the `apikey` header. Legacy
  JWT service-role keys additionally use the required bearer header.
- Mutating RPC calls are issued exactly once by the worker transport; no
  automatic POST retry is enabled.
- The four M1.1 database commands are `SECURITY DEFINER` with fixed search
  paths, revoked `PUBLIC`, `anon`, and `authenticated` execution, and explicit
  `service_role` execution only.
- The private attempt-claim ledger has RLS enabled, an immutable trigger, and no
  direct grant to `anon`, `authenticated`, or `service_role`.
- The worker receives no direct DML grant. Public attempt history remains
  append-only. Browser RLS, grants, human permissions, AAL2 gates, and approval
  boundaries are unchanged.
- Structured application and database evidence contains identifiers, counts,
  dispositions, and error codes only. Brief text, generated output, API keys,
  and lease tokens are excluded.

## Acceptance proof

- Unit tests cover success, completion replay, retry, dead letter, invalid
  input, acknowledgement ambiguity, modern secret headers, legacy
  service-role headers, and the no-automatic-retry boundary.
- pgTAP tests cover role grants, filtered claims, lease recovery, stale-token
  denial, private-claim isolation and immutability, append-only attempt
  provenance, idempotent begin/completion, completion-before-ack recovery,
  synchronized retry/dead-letter state, and structured audit events.
- The existing Database contract and M0.2 reliability checks still reset from
  zero and run on every protected pull request.
- The M1 application artifact is uploaded with `if: always()` so application
  evidence remains available on failure.

## Rollback

The application code and service-role-only command migration can be reverted
before any deployment. If the migration has been applied to a shared
non-production environment, use a reviewed forward repair that revokes the four
public command signatures and removes their bodies and private attempt-claim
ledger only after the worker is stopped and in-flight claims are resolved. Do
not edit an applied migration and do not roll back unrelated M0.2 outbox
reliability primitives.
