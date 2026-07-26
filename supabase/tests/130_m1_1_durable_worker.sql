begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

select plan(37);

select ok(
  not has_function_privilege(
    'anon',
    'public.m1_claim_generation_events(text,integer,integer)',
    'EXECUTE'
  ),
  'anon cannot claim generation events'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.m1_claim_generation_events(text,integer,integer)',
    'EXECUTE'
  ),
  'authenticated cannot claim generation events'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.m1_claim_generation_events(text,integer,integer)',
    'EXECUTE'
  ),
  'service_role can claim generation events'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.m1_begin_generation_attempt(uuid,text,uuid,text,text)',
    'EXECUTE'
  ),
  'anon cannot begin generation attempts'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.m1_begin_generation_attempt(uuid,text,uuid,text,text)',
    'EXECUTE'
  ),
  'authenticated cannot begin generation attempts'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.m1_begin_generation_attempt(uuid,text,uuid,text,text)',
    'EXECUTE'
  ),
  'service_role can begin generation attempts'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.m1_complete_generation_attempt(uuid,text,uuid,uuid,text,text,text,integer)',
    'EXECUTE'
  ),
  'anon cannot complete generation attempts'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.m1_complete_generation_attempt(uuid,text,uuid,uuid,text,text,text,integer)',
    'EXECUTE'
  ),
  'authenticated cannot complete generation attempts'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.m1_complete_generation_attempt(uuid,text,uuid,uuid,text,text,text,integer)',
    'EXECUTE'
  ),
  'service_role can complete generation attempts'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.m1_fail_generation_attempt(uuid,text,uuid,uuid,text,integer)',
    'EXECUTE'
  ),
  'anon cannot fail generation attempts'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.m1_fail_generation_attempt(uuid,text,uuid,uuid,text,integer)',
    'EXECUTE'
  ),
  'authenticated cannot fail generation attempts'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.m1_fail_generation_attempt(uuid,text,uuid,uuid,text,integer)',
    'EXECUTE'
  ),
  'service_role can fail generation attempts'
);
select ok(
  not has_table_privilege(
    'anon',
    'app_private.m1_generation_attempt_claims',
    'SELECT'
  ),
  'anon cannot read private generation attempt claims'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'app_private.m1_generation_attempt_claims',
    'SELECT'
  ),
  'authenticated cannot read private generation attempt claims'
);
select ok(
  not has_table_privilege(
    'service_role',
    'app_private.m1_generation_attempt_claims',
    'SELECT'
  ),
  'service_role cannot bypass the generation attempt commands'
);

insert into public.organizations (id, name, slug)
values (
  '13000000-0000-4000-8000-000000000001',
  'M1.1 Durable Worker Tenant',
  'm11-durable-worker'
);

set session_replication_role = replica;
insert into public.profiles (id, display_name)
values (
  '13000000-0000-4000-8000-000000000002',
  'M1.1 Fixture Owner'
);
set session_replication_role = origin;

insert into public.memberships (id, organization_id, profile_id)
values (
  '13000000-0000-4000-8000-000000000003',
  '13000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000002'
);

insert into public.content_items (
  id, organization_id, title, created_by_membership_id
) values (
  '13000000-0000-4000-8000-000000000004',
  '13000000-0000-4000-8000-000000000001',
  'M1.1 durable worker fixture',
  '13000000-0000-4000-8000-000000000003'
);

insert into public.content_briefs (
  id, organization_id, content_item_id, payload, payload_hash,
  created_by_membership_id
) values (
  '13000000-0000-4000-8000-000000000005',
  '13000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000004',
  '{
    "audience":"Synthetic adult test audience",
    "constraints":["Use synthetic content only"],
    "objectives":["Prove durable worker recovery"],
    "schema_id":"strongr.audio_reflection_brief.v1",
    "scripture_references":[{
      "reference":"Synthetic Reference 1:1",
      "source_citation":"Synthetic fixture; not a quotation",
      "translation":"TEST"
    }],
    "target_duration_seconds":300,
    "theme":"Durable worker acceptance",
    "title":"M1.1 durable worker fixture",
    "tone":"reflective"
  }'::jsonb,
  repeat('a', 64),
  '13000000-0000-4000-8000-000000000003'
);

insert into public.generation_jobs (
  id, organization_id, brief_id, requested_by_membership_id, prompt_key,
  prompt_version, idempotency_key, input_hash, correlation_id
) values (
  '13000000-0000-4000-8000-000000000006',
  '13000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000005',
  '13000000-0000-4000-8000-000000000003',
  'strongr.audio_reflection.fixture',
  1,
  'm11-durable-worker-success',
  repeat('b', 64),
  '13000000-0000-4000-8000-000000000007'
);

insert into public.outbox_events (
  id, organization_id, event_type, aggregate_type, aggregate_id,
  payload, correlation_id
) values
  (
    '13000000-0000-4000-8000-000000000008',
    '13000000-0000-4000-8000-000000000001',
    'content.generation_requested.v1',
    'generation_job',
    '13000000-0000-4000-8000-000000000006',
    '{"job_id":"13000000-0000-4000-8000-000000000006"}'::jsonb,
    '13000000-0000-4000-8000-000000000007'
  ),
  (
    '13000000-0000-4000-8000-000000000009',
    '13000000-0000-4000-8000-000000000001',
    'content.review_requested.v1',
    'content_version',
    '13000000-0000-4000-8000-000000000004',
    '{"case":"unrelated"}'::jsonb,
    '13000000-0000-4000-8000-000000000010'
  );

create temporary table m11_claims (
  label text primary key,
  event_id uuid not null,
  attempt_number integer not null,
  lease_token uuid not null
);
grant select, insert, update, delete on table m11_claims to service_role;

create temporary table m11_attempts (
  label text primary key,
  disposition text not null,
  generation_job_id uuid not null,
  prompt_checksum text not null,
  attempt_id uuid,
  attempt_number integer not null,
  max_attempts integer not null
);
grant select, insert, update, delete on table m11_attempts to service_role;

set local role service_role;

insert into m11_claims (label, event_id, attempt_number, lease_token)
select 'success-first', event_id, attempt_number, lease_token
from public.m1_claim_generation_events('m11-worker-first', 10, 60);

reset role;

select is(
  (
    select status
    from public.outbox_events
    where id = '13000000-0000-4000-8000-000000000009'
  ),
  'pending',
  'the generation worker leaves unrelated outbox events untouched'
);
select is(
  (
    select event_id
    from m11_claims
    where label = 'success-first'
  ),
  '13000000-0000-4000-8000-000000000008'::uuid,
  'the generation worker claims the intended generation event'
);

set local role service_role;

insert into m11_attempts (
  label, disposition, generation_job_id, prompt_checksum,
  attempt_id, attempt_number, max_attempts
)
select
  'success-first', disposition, generation_job_id, prompt_checksum,
  attempt_id, attempt_number, max_attempts
from public.m1_begin_generation_attempt(
  '13000000-0000-4000-8000-000000000008',
  'm11-worker-first',
  (select lease_token from m11_claims where label = 'success-first'),
  'deterministic-test',
  'strongr.fixture.audio-reflection.v1'
);

insert into m11_attempts (
  label, disposition, generation_job_id, prompt_checksum,
  attempt_id, attempt_number, max_attempts
)
select
  'success-first-replay', disposition, generation_job_id, prompt_checksum,
  attempt_id, attempt_number, max_attempts
from public.m1_begin_generation_attempt(
  '13000000-0000-4000-8000-000000000008',
  'm11-worker-first',
  (select lease_token from m11_claims where label = 'success-first'),
  'deterministic-test',
  'strongr.fixture.audio-reflection.v1'
);

reset role;

select ok(
  (
    select
      disposition = 'ready'
      and attempt_number = 1
      and prompt_checksum ~ '^[a-f0-9]{64}$'
    from m11_attempts
    where label = 'success-first'
  ),
  'the first claim begins attempt one with deterministic prompt provenance'
);
select ok(
  (
    select
      original.attempt_id = replay.attempt_id
      and original.attempt_number = replay.attempt_number
      and original.prompt_checksum = replay.prompt_checksum
    from m11_attempts as original
    cross join m11_attempts as replay
    where original.label = 'success-first'
      and replay.label = 'success-first-replay'
  ),
  'replaying begin with the same lease returns the same attempt identity'
);
select ok(
  (
    select
      j.state = 'running'
      and j.attempt_count = 1
      and not exists (
        select 1
        from public.generation_job_attempts as a
        where a.generation_job_id = j.id
      )
      and exists (
        select 1
        from app_private.m1_generation_attempt_claims as c
        join m11_attempts as a on a.attempt_id = c.attempt_id
        where a.label = 'success-first'
          and c.generation_job_id = j.id
          and c.attempt_number = 1
          and c.provider = 'deterministic-test'
      )
    from public.generation_jobs as j
    where j.id = '13000000-0000-4000-8000-000000000006'
  ),
  'begin keeps mutable state on the job and records one private claim'
);
select throws_ok(
  $sql$
    update app_private.m1_generation_attempt_claims
    set worker_id = worker_id
    where attempt_id = (
      select attempt_id
      from m11_attempts
      where label = 'success-first'
    )
  $sql$,
  '55000',
  'm1_generation_attempt_claims is append-only',
  'private generation attempt claims are append-only'
);

update public.outbox_events
set lease_expires_at = statement_timestamp() - interval '1 second'
where id = '13000000-0000-4000-8000-000000000008';

set local role service_role;

insert into m11_claims (label, event_id, attempt_number, lease_token)
select 'success-recovered', event_id, attempt_number, lease_token
from public.m1_claim_generation_events('m11-worker-recovery', 10, 60);

select throws_ok(
  $sql$
    select *
    from public.m1_begin_generation_attempt(
      '13000000-0000-4000-8000-000000000008',
      'm11-worker-first',
      (select lease_token from m11_claims where label = 'success-first'),
      'deterministic-test',
      'strongr.fixture.audio-reflection.v1'
    )
  $sql$,
  '55000',
  'generation outbox lease is not owned',
  'the stale worker cannot begin after lease recovery'
);

insert into m11_attempts (
  label, disposition, generation_job_id, prompt_checksum,
  attempt_id, attempt_number, max_attempts
)
select
  'success-recovered', disposition, generation_job_id, prompt_checksum,
  attempt_id, attempt_number, max_attempts
from public.m1_begin_generation_attempt(
  '13000000-0000-4000-8000-000000000008',
  'm11-worker-recovery',
  (select lease_token from m11_claims where label = 'success-recovered'),
  'deterministic-test',
  'strongr.fixture.audio-reflection.v1'
);

reset role;

select ok(
  (
    select
      recovered.disposition = 'ready'
      and recovered.attempt_number = 2
      and recovered.attempt_id <> original.attempt_id
    from m11_attempts recovered
    cross join m11_attempts original
    where recovered.label = 'success-recovered'
      and original.label = 'success-first'
  ),
  'lease recovery starts one new attempt with a distinct identity'
);
select ok(
  (
    select
      count(*) = 1
      and count(*) filter (
        where attempt_number = 1
          and status = 'failed'
          and error_code = 'worker_lease_expired'
      ) = 1
    from public.generation_job_attempts
    where generation_job_id = '13000000-0000-4000-8000-000000000006'
  )
  and exists (
    select 1
    from app_private.m1_generation_attempt_claims as c
    join m11_attempts as a on a.attempt_id = c.attempt_id
    where a.label = 'success-recovered'
      and c.generation_job_id = '13000000-0000-4000-8000-000000000006'
      and c.attempt_number = 2
      and not exists (
        select 1
        from public.generation_job_attempts as h
        where h.id = c.attempt_id
      )
  ),
  'recovery appends the abandoned failure and keeps the new attempt pending'
);

set local role service_role;

select is(
  public.m1_complete_generation_attempt(
    '13000000-0000-4000-8000-000000000008',
    'm11-worker-recovery',
    (select lease_token from m11_claims where label = 'success-recovered'),
    (select attempt_id from m11_attempts where label = 'success-recovered'),
    'fixture-provider-response',
    'strongr.audio_reflection.v1',
    repeat('c', 64),
    42
  ),
  'succeeded',
  'the current worker completes the generation attempt'
);

reset role;

select ok(
  (
    select
      j.state = 'succeeded'
      and j.output_hash = repeat('c', 64)
      and a.status = 'succeeded'
      and a.provider_response_id = 'fixture-provider-response'
      and a.latency_ms = 42
    from public.generation_jobs j
    join public.generation_job_attempts a
      on a.generation_job_id = j.id
     and a.organization_id = j.organization_id
    where j.id = '13000000-0000-4000-8000-000000000006'
      and a.attempt_number = 2
  ),
  'completion stores the exact output hash and provider provenance'
);

set local role service_role;

select is(
  public.m1_complete_generation_attempt(
    '13000000-0000-4000-8000-000000000008',
    'm11-worker-recovery',
    (select lease_token from m11_claims where label = 'success-recovered'),
    (select attempt_id from m11_attempts where label = 'success-recovered'),
    'fixture-provider-response',
    'strongr.audio_reflection.v1',
    repeat('c', 64),
    42
  ),
  'succeeded',
  'an exact completion replay is idempotent'
);

reset role;

update public.outbox_events
set lease_expires_at = statement_timestamp() - interval '1 second'
where id = '13000000-0000-4000-8000-000000000008';

set local role service_role;

insert into m11_claims (label, event_id, attempt_number, lease_token)
select 'success-ack-recovery', event_id, attempt_number, lease_token
from public.m1_claim_generation_events('m11-worker-ack-recovery', 10, 60);

insert into m11_attempts (
  label, disposition, generation_job_id, prompt_checksum,
  attempt_id, attempt_number, max_attempts
)
select
  'success-ack-recovery', disposition, generation_job_id, prompt_checksum,
  attempt_id, attempt_number, max_attempts
from public.m1_begin_generation_attempt(
  '13000000-0000-4000-8000-000000000008',
  'm11-worker-ack-recovery',
  (select lease_token from m11_claims where label = 'success-ack-recovery'),
  'deterministic-test',
  'strongr.fixture.audio-reflection.v1'
);

reset role;

select is(
  (
    select disposition
    from m11_attempts
    where label = 'success-ack-recovery'
  ),
  'already_succeeded',
  'recovery after completion skips the external generation side effect'
);
select is(
  (
    select count(*)
    from public.generation_job_attempts
    where generation_job_id = '13000000-0000-4000-8000-000000000006'
  ),
  2::bigint,
  'completion recovery does not create a duplicate generation attempt'
);

set local role service_role;

select lives_ok(
  $sql$
    select public.m0_ack_outbox_event(
      '13000000-0000-4000-8000-000000000008',
      'm11-worker-ack-recovery',
      (select lease_token from m11_claims where label = 'success-ack-recovery'),
      'generation-13000000-0000-4000-8000-000000000008'
    )
  $sql$,
  'the recovered worker acknowledges the completed event'
);

reset role;

select is(
  (
    select status
    from public.outbox_events
    where id = '13000000-0000-4000-8000-000000000008'
  ),
  'delivered',
  'completion recovery reaches the durable delivered state'
);

insert into public.generation_jobs (
  id, organization_id, brief_id, requested_by_membership_id, prompt_key,
  prompt_version, max_attempts, idempotency_key, input_hash, correlation_id
) values (
  '13000000-0000-4000-8000-000000000011',
  '13000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000005',
  '13000000-0000-4000-8000-000000000003',
  'strongr.audio_reflection.fixture',
  1,
  2,
  'm11-durable-worker-poison',
  repeat('d', 64),
  '13000000-0000-4000-8000-000000000012'
);

insert into public.outbox_events (
  id, organization_id, event_type, aggregate_type, aggregate_id,
  payload, correlation_id
) values (
  '13000000-0000-4000-8000-000000000013',
  '13000000-0000-4000-8000-000000000001',
  'content.generation_requested.v1',
  'generation_job',
  '13000000-0000-4000-8000-000000000011',
  '{"job_id":"13000000-0000-4000-8000-000000000011"}'::jsonb,
  '13000000-0000-4000-8000-000000000012'
);

set local role service_role;

insert into m11_claims (label, event_id, attempt_number, lease_token)
select 'poison-first', event_id, attempt_number, lease_token
from public.m1_claim_generation_events('m11-worker-poison', 10, 60);

insert into m11_attempts (
  label, disposition, generation_job_id, prompt_checksum,
  attempt_id, attempt_number, max_attempts
)
select
  'poison-first', disposition, generation_job_id, prompt_checksum,
  attempt_id, attempt_number, max_attempts
from public.m1_begin_generation_attempt(
  '13000000-0000-4000-8000-000000000013',
  'm11-worker-poison',
  (select lease_token from m11_claims where label = 'poison-first'),
  'deterministic-test',
  'strongr.fixture.audio-reflection.v1'
);

select is(
  public.m1_fail_generation_attempt(
    '13000000-0000-4000-8000-000000000013',
    'm11-worker-poison',
    (select lease_token from m11_claims where label = 'poison-first'),
    (select attempt_id from m11_attempts where label = 'poison-first'),
    'generation.adapter_failed',
    0
  ),
  'failed',
  'the first generation failure schedules a retry'
);
select is(
  public.m0_fail_outbox_event(
    '13000000-0000-4000-8000-000000000013',
    'm11-worker-poison',
    (select lease_token from m11_claims where label = 'poison-first'),
    'generation.adapter_failed',
    0,
    2
  ),
  'failed',
  'the first delivery failure schedules the same retry'
);

insert into m11_claims (label, event_id, attempt_number, lease_token)
select 'poison-second', event_id, attempt_number, lease_token
from public.m1_claim_generation_events('m11-worker-poison', 10, 60);

insert into m11_attempts (
  label, disposition, generation_job_id, prompt_checksum,
  attempt_id, attempt_number, max_attempts
)
select
  'poison-second', disposition, generation_job_id, prompt_checksum,
  attempt_id, attempt_number, max_attempts
from public.m1_begin_generation_attempt(
  '13000000-0000-4000-8000-000000000013',
  'm11-worker-poison',
  (select lease_token from m11_claims where label = 'poison-second'),
  'deterministic-test',
  'strongr.fixture.audio-reflection.v1'
);

select is(
  public.m1_fail_generation_attempt(
    '13000000-0000-4000-8000-000000000013',
    'm11-worker-poison',
    (select lease_token from m11_claims where label = 'poison-second'),
    (select attempt_id from m11_attempts where label = 'poison-second'),
    'generation.adapter_failed',
    0
  ),
  'dead_letter',
  'the terminal generation failure becomes dead letter'
);
select is(
  public.m0_fail_outbox_event(
    '13000000-0000-4000-8000-000000000013',
    'm11-worker-poison',
    (select lease_token from m11_claims where label = 'poison-second'),
    'generation.adapter_failed',
    0,
    2
  ),
  'dead_letter',
  'the terminal delivery failure becomes dead letter'
);

reset role;

select ok(
  (
    select
      j.state = 'dead_letter'
      and j.attempt_count = 2
      and e.status = 'dead_letter'
      and (
        select count(*)
        from public.generation_job_attempts a
        where a.generation_job_id = j.id
      ) = 2
    from public.generation_jobs j
    join public.outbox_events e
      on e.aggregate_id = j.id
     and e.organization_id = j.organization_id
    where j.id = '13000000-0000-4000-8000-000000000011'
  ),
  'job and outbox expose the same terminal state with two attempt records'
);
select ok(
  (
    select
      count(*) filter (
        where action = 'generation.attempt_started'
      ) = 4
      and count(*) filter (
        where action = 'generation.attempt_succeeded'
      ) = 1
      and count(*) filter (
        where action = 'generation.attempt_failed'
      ) = 2
      and count(*) filter (
        where action = 'generation.attempt_failed'
          and reason_code = 'worker_lease_expired'
      ) = 1
      and count(*) filter (
        where action = 'generation.dead_lettered'
      ) = 1
    from public.audit_events
    where organization_id = '13000000-0000-4000-8000-000000000001'
      and source_channel = 'worker'
  ),
  'structured audit evidence records starts, success, retry, and dead letter'
);

select * from finish();
rollback;
