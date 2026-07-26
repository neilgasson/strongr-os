# Outbox Retry and Recovery Runbook

## Delivery contract

Strongr OS uses at-least-once delivery:

1. A governed transaction creates the domain row and outbox event together.
2. A service worker claims work with `m0_claim_outbox_events`.
3. Each claim increments `attempts` and receives a unique `lease_token`.
4. Only the current unexpired token may fail or acknowledge the event.
5. An expired lease may be reclaimed with a new token.
6. A successful acknowledgement creates one immutable delivery receipt.
7. A repeated acknowledgement with the same delivery key returns that receipt.

An external consumer must deduplicate on the stable outbox `event_id`. No
database design can prevent a remote side effect from being repeated if a
worker crashes after the remote system accepts it but before the local
acknowledgement commits.

## M1.1 generation worker

The M1.1 worker calls `m1_claim_generation_events` so it never leases unrelated
outbox event types. It then calls `m1_begin_generation_attempt` with the exact
worker ID and lease token before invoking the provider-neutral adapter.

On success, the worker calls `m1_complete_generation_attempt` and then
acknowledges through `m0_ack_outbox_event` with
`generation-<event-id>` as the stable delivery key. If completion commits but
acknowledgement does not, allow the lease to expire. The recovery worker will
receive `already_succeeded`, skip generation, and acknowledge the same delivery
key.

Do not retry an ambiguous mutating RPC in process. Lease recovery is the source
of truth.

## Normal retry

Call `m0_fail_outbox_event` with:

- the claimed event ID;
- current worker ID;
- current lease token;
- a stable machine-readable error code;
- retry delay; and
- maximum attempts.

Before the maximum, the event returns to `failed` with a future
`available_at`. At the maximum it moves to `dead_letter`.

## Crash recovery

If a worker terminates:

- do not manually reset the event;
- wait for `lease_expires_at`;
- allow another worker to claim it normally; and
- verify the new claim has a different token and incremented attempt number.

The old token cannot acknowledge after recovery.

## Dead letter

1. Stop automatic retries for that event.
2. Read the event, attempt history fields, and correlated audit events.
3. Confirm whether the external side effect occurred using `event_id`.
4. Record the incident and root cause.
5. Repair the worker or payload defect.
6. Add a forward-only replay command in a reviewed migration or operator tool.

Do not update a dead-letter row manually in the dashboard.

## Duplicate acknowledgement

A duplicate acknowledgement is safe only when it uses the original
`delivery_key`. A different key is rejected because it could conceal a second
external delivery.

## Evidence queries

```sql
select public.m0_operational_health();

select *
from public.m0_operational_metrics()
order by metric_name;

select id, event_type, status, attempts, available_at,
       lease_owner, lease_expires_at, last_error_code
from public.outbox_events
where status <> 'delivered'
order by created_at;
```

Run these only through an approved service or database operator session.
