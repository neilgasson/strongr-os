begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

select plan(26);

select ok(
  not has_function_privilege(
    'anon',
    'public.m1_record_check_run(uuid,uuid,text,text,text,jsonb,uuid)',
    'EXECUTE'
  ),
  'anon cannot execute the automated check worker command'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.m1_record_check_run(uuid,uuid,text,text,text,jsonb,uuid)',
    'EXECUTE'
  ),
  'authenticated cannot execute the automated check worker command'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.m1_record_check_run(uuid,uuid,text,text,text,jsonb,uuid)',
    'EXECUTE'
  ),
  'service_role alone can execute the automated check worker command'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.m0_claim_outbox_events(text,integer,integer)',
    'EXECUTE'
  ),
  'anon cannot claim outbox work'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.m0_claim_outbox_events(text,integer,integer)',
    'EXECUTE'
  ),
  'authenticated cannot claim outbox work'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.m0_claim_outbox_events(text,integer,integer)',
    'EXECUTE'
  ),
  'service_role can claim outbox work'
);

insert into public.organizations (id, name, slug)
values (
  '11000000-0000-4000-8000-000000000001',
  'M0.2 Outbox Tenant',
  'm02-outbox-tenant'
);

select is(
  public.m0_operational_health() ->> 'status',
  'ok',
  'operational health is initially healthy'
);

create temporary table m02_claims (
  label text primary key,
  event_id uuid not null,
  attempt_number integer not null,
  lease_token uuid not null
);
grant select, insert, update, delete on table m02_claims to service_role;

insert into public.outbox_events (
  id, organization_id, event_type, aggregate_type, aggregate_id,
  payload, correlation_id
)
values (
  '11000000-0000-4000-8000-000000000011',
  '11000000-0000-4000-8000-000000000001',
  'acceptance.retry.v1',
  'acceptance',
  '11000000-0000-4000-8000-000000000012',
  '{"case":"retry"}'::jsonb,
  '11000000-0000-4000-8000-000000000013'
);

set local role service_role;

insert into m02_claims (label, event_id, attempt_number, lease_token)
select 'retry-first', event_id, attempt_number, lease_token
from public.m0_claim_outbox_events('worker-a', 1, 60);

reset role;

select is(
  (select count(*) from m02_claims where label = 'retry-first'),
  1::bigint,
  'the first worker claims exactly one event'
);
select ok(
  (
    select e.status = 'processing'
      and e.attempts = 1
      and e.lease_owner = 'worker-a'
      and e.lease_token = c.lease_token
    from public.outbox_events e
    join m02_claims c on c.event_id = e.id
    where c.label = 'retry-first'
  ),
  'claim records attempt one and an owned lease token'
);

set local role service_role;

select is(
  public.m0_fail_outbox_event(
    '11000000-0000-4000-8000-000000000011',
    'worker-a',
    (select lease_token from m02_claims where label = 'retry-first'),
    'acceptance.transient',
    0,
    5
  ),
  'failed',
  'a transient failure schedules the event for retry'
);

reset role;

select ok(
  (
    select status = 'failed'
      and lease_owner is null
      and lease_token is null
      and lease_expires_at is null
      and last_error_code = 'acceptance.transient'
    from public.outbox_events
    where id = '11000000-0000-4000-8000-000000000011'
  ),
  'retry state clears the previous lease and preserves the error code'
);

set local role service_role;

insert into m02_claims (label, event_id, attempt_number, lease_token)
select 'retry-second', event_id, attempt_number, lease_token
from public.m0_claim_outbox_events('worker-b', 1, 60);

reset role;

select ok(
  (
    select
      second.event_id = first.event_id
      and second.attempt_number = 2
      and second.lease_token <> first.lease_token
    from m02_claims first
    cross join m02_claims second
    where first.label = 'retry-first'
      and second.label = 'retry-second'
  ),
  'retry reclaims the same event with attempt two and a new token'
);

create temporary table m02_receipts (
  label text primary key,
  receipt_id uuid not null
);
grant select, insert, update, delete on table m02_receipts to service_role;

set local role service_role;

insert into m02_receipts (label, receipt_id)
select
  'retry-ack',
  public.m0_ack_outbox_event(
    '11000000-0000-4000-8000-000000000011',
    'worker-b',
    (select lease_token from m02_claims where label = 'retry-second'),
    'delivery-11000000-0000-4000-8000-000000000011'
  );

reset role;

select ok(
  (select receipt_id is not null from m02_receipts where label = 'retry-ack'),
  'successful delivery creates a receipt'
);
select ok(
  (
    select status = 'delivered'
      and delivered_at is not null
      and lease_owner is null
    from public.outbox_events
    where id = '11000000-0000-4000-8000-000000000011'
  ),
  'acknowledgement marks the event delivered and clears its lease'
);

set local role service_role;

select is(
  public.m0_ack_outbox_event(
    '11000000-0000-4000-8000-000000000011',
    'worker-b',
    (select lease_token from m02_claims where label = 'retry-second'),
    'delivery-11000000-0000-4000-8000-000000000011'
  ),
  (select receipt_id from m02_receipts where label = 'retry-ack'),
  'duplicate acknowledgement returns the original receipt'
);

reset role;

select is(
  (
    select count(*)
    from public.outbox_delivery_receipts
    where outbox_event_id = '11000000-0000-4000-8000-000000000011'
  ),
  1::bigint,
  'duplicate delivery creates only one durable receipt'
);

select throws_ok(
  $sql$
    update public.outbox_delivery_receipts
    set delivery_key = 'delivery-mutated'
    where outbox_event_id = '11000000-0000-4000-8000-000000000011'
  $sql$,
  '55000',
  'outbox_delivery_receipts is append-only',
  'delivery receipts are immutable'
);

insert into public.outbox_events (
  id, organization_id, event_type, aggregate_type, aggregate_id,
  payload, correlation_id
)
values (
  '11000000-0000-4000-8000-000000000021',
  '11000000-0000-4000-8000-000000000001',
  'acceptance.crash.v1',
  'acceptance',
  '11000000-0000-4000-8000-000000000022',
  '{"case":"crash"}'::jsonb,
  '11000000-0000-4000-8000-000000000023'
);

set local role service_role;

insert into m02_claims (label, event_id, attempt_number, lease_token)
select 'crash-first', event_id, attempt_number, lease_token
from public.m0_claim_outbox_events('worker-crashed', 1, 60);

reset role;

select is(
  (
    select event_id from m02_claims where label = 'crash-first'
  ),
  '11000000-0000-4000-8000-000000000021'::uuid,
  'crash fixture is leased by the first worker'
);

update public.outbox_events
set lease_expires_at = statement_timestamp() - interval '1 second'
where id = '11000000-0000-4000-8000-000000000021';
set local role service_role;

insert into m02_claims (label, event_id, attempt_number, lease_token)
select 'crash-recovered', event_id, attempt_number, lease_token
from public.m0_claim_outbox_events('worker-recovery', 1, 60);

reset role;

select ok(
  (
    select
      recovered.event_id = first.event_id
      and recovered.attempt_number = 2
      and recovered.lease_token <> first.lease_token
    from m02_claims first
    cross join m02_claims recovered
    where first.label = 'crash-first'
      and recovered.label = 'crash-recovered'
  ),
  'an expired lease is recovered with a new token and attempt number'
);

set local role service_role;

select throws_ok(
  $sql$
    select public.m0_ack_outbox_event(
      '11000000-0000-4000-8000-000000000021',
      'worker-crashed',
      (select lease_token from m02_claims where label = 'crash-first'),
      'delivery-11000000-0000-4000-8000-000000000021'
    )
  $sql$,
  '55000',
  'outbox lease is not owned',
  'the crashed worker cannot acknowledge with its stale lease token'
);

select lives_ok(
  $sql$
    select public.m0_ack_outbox_event(
      '11000000-0000-4000-8000-000000000021',
      'worker-recovery',
      (select lease_token from m02_claims where label = 'crash-recovered'),
      'delivery-11000000-0000-4000-8000-000000000021'
    )
  $sql$,
  'the recovery worker acknowledges with the current lease token'
);

reset role;

select is(
  (
    select status from public.outbox_events
    where id = '11000000-0000-4000-8000-000000000021'
  ),
  'delivered',
  'the crash-recovered event reaches delivered state'
);

insert into public.outbox_events (
  id, organization_id, event_type, aggregate_type, aggregate_id,
  payload, correlation_id, attempts
)
values (
  '11000000-0000-4000-8000-000000000031',
  '11000000-0000-4000-8000-000000000001',
  'acceptance.dead_letter.v1',
  'acceptance',
  '11000000-0000-4000-8000-000000000032',
  '{"case":"dead_letter"}'::jsonb,
  '11000000-0000-4000-8000-000000000033',
  4
);
set local role service_role;

insert into m02_claims (label, event_id, attempt_number, lease_token)
select 'dead-letter', event_id, attempt_number, lease_token
from public.m0_claim_outbox_events('worker-dead-letter', 1, 60);

reset role;

select is(
  (
    select attempt_number from m02_claims where label = 'dead-letter'
  ),
  5,
  'the terminal delivery attempt is numbered five'
);

set local role service_role;

select is(
  public.m0_fail_outbox_event(
    '11000000-0000-4000-8000-000000000031',
    'worker-dead-letter',
    (select lease_token from m02_claims where label = 'dead-letter'),
    'acceptance.permanent',
    0,
    5
  ),
  'dead_letter',
  'the terminal failure moves the event to dead letter'
);

reset role;

select ok(
  (
    select
      public.m0_operational_health() ->> 'status' = 'unhealthy'
      and (public.m0_operational_health() ->> 'outbox_dead_letters')::integer = 1
      and (
        select metric_value = 1
        from public.m0_operational_metrics()
        where metric_name = 'strongr_os_outbox_dead_letters'
      )
  ),
  'health and metrics expose the dead-letter condition'
);
select ok(
  (
    select count(*) >= 5
    from public.worker_heartbeats
    where last_seen_at is not null
  ),
  'worker heartbeats record retry, recovery, and terminal workers'
);

select * from finish();
rollback;
