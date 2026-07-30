begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

select plan(8);

select ok(
  not has_function_privilege(
    'anon',
    'public.m1_request_generation(uuid,uuid,text,integer,text,uuid)',
    'EXECUTE'
  ),
  'anon cannot request a generation job'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.m1_request_generation(uuid,uuid,text,integer,text,uuid)',
    'EXECUTE'
  ),
  'authenticated may use the governed generation request command'
);

insert into public.organizations (id, name, slug)
values (
  '12000000-0000-4000-8000-000000000001',
  'M0.2 Idempotency Tenant',
  'm02-idempotency-tenant'
);

set session_replication_role = replica;
insert into public.profiles (id, display_name)
values (
  '12000000-0000-4000-8000-000000000011',
  'M0.2 Idempotency Owner'
);
set session_replication_role = origin;

insert into public.memberships (id, organization_id, profile_id)
values (
  '12000000-0000-4000-8000-000000000021',
  '12000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000011'
);

insert into public.roles (id, organization_id, key, name)
values (
  '12000000-0000-4000-8000-000000000031',
  '12000000-0000-4000-8000-000000000001',
  'owner',
  'Owner'
);

insert into public.membership_role_grants (
  organization_id, membership_id, role_id, granted_by_membership_id
)
values (
  '12000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000021',
  '12000000-0000-4000-8000-000000000031',
  '12000000-0000-4000-8000-000000000021'
);

insert into public.role_permission_grants (
  organization_id, role_id, permission_id, granted_by_membership_id
)
select
  '12000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000031',
  id,
  '12000000-0000-4000-8000-000000000021'
from public.permissions;

insert into public.content_items (
  id, organization_id, title, created_by_membership_id
)
values
  (
    '12000000-0000-4000-8000-000000000041',
    '12000000-0000-4000-8000-000000000001',
    'Idempotency brief one',
    '12000000-0000-4000-8000-000000000021'
  ),
  (
    '12000000-0000-4000-8000-000000000042',
    '12000000-0000-4000-8000-000000000001',
    'Idempotency brief two',
    '12000000-0000-4000-8000-000000000021'
  );

insert into public.content_briefs (
  id, organization_id, content_item_id, payload, payload_hash,
  created_by_membership_id
)
values
  (
    '12000000-0000-4000-8000-000000000051',
    '12000000-0000-4000-8000-000000000001',
    '12000000-0000-4000-8000-000000000041',
    '{"purpose":"same payload","schema_id":"strongr.audio_reflection_brief.v1"}'::jsonb,
    app_private.sha256_jsonb('{"purpose":"same payload","schema_id":"strongr.audio_reflection_brief.v1"}'::jsonb),
    '12000000-0000-4000-8000-000000000021'
  ),
  (
    '12000000-0000-4000-8000-000000000052',
    '12000000-0000-4000-8000-000000000001',
    '12000000-0000-4000-8000-000000000042',
    '{"purpose":"same payload","schema_id":"strongr.audio_reflection_brief.v1"}'::jsonb,
    app_private.sha256_jsonb('{"purpose":"same payload","schema_id":"strongr.audio_reflection_brief.v1"}'::jsonb),
    '12000000-0000-4000-8000-000000000021'
  );

select set_config(
  'request.jwt.claims',
  '{"sub":"12000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

create temporary table m02_generation_results (
  label text primary key,
  generation_job_id uuid not null
);
grant select, insert on table m02_generation_results to authenticated;

insert into m02_generation_results (label, generation_job_id)
select
  'first',
  public.m1_request_generation(
    '12000000-0000-4000-8000-000000000001',
    '12000000-0000-4000-8000-000000000051',
    'm0_2.idempotency',
    1,
    'm0-2-idempotency-key',
    '12000000-0000-4000-8000-000000000061'
  );

select ok(
  (select generation_job_id is not null
   from m02_generation_results where label = 'first'),
  'the first request creates a generation job'
);

insert into m02_generation_results (label, generation_job_id)
select
  'exact-replay',
  public.m1_request_generation(
    '12000000-0000-4000-8000-000000000001',
    '12000000-0000-4000-8000-000000000051',
    'm0_2.idempotency',
    1,
    'm0-2-idempotency-key',
    '12000000-0000-4000-8000-000000000062'
  );

select is(
  (select generation_job_id
   from m02_generation_results where label = 'exact-replay'),
  (select generation_job_id
   from m02_generation_results where label = 'first'),
  'an exact replay returns the original generation job'
);

reset role;

select is(
  (
    select count(*)
    from public.generation_jobs
    where organization_id = '12000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'an exact replay creates no duplicate generation job'
);
select is(
  (
    select count(*)
    from public.outbox_events
    where organization_id = '12000000-0000-4000-8000-000000000001'
      and aggregate_type = 'generation_job'
  ),
  1::bigint,
  'an exact replay creates no duplicate outbox event'
);

set local role authenticated;

select throws_ok(
  $sql$
    select public.m1_request_generation(
      '12000000-0000-4000-8000-000000000001',
      '12000000-0000-4000-8000-000000000051',
      'm0_2.idempotency',
      2,
      'm0-2-idempotency-key',
      '12000000-0000-4000-8000-000000000063'
    )
  $sql$,
  '22023',
  'idempotency key reused with different request',
  'the same key with a different prompt version is rejected'
);

select throws_ok(
  $sql$
    select public.m1_request_generation(
      '12000000-0000-4000-8000-000000000001',
      '12000000-0000-4000-8000-000000000052',
      'm0_2.idempotency',
      1,
      'm0-2-idempotency-key',
      '12000000-0000-4000-8000-000000000064'
    )
  $sql$,
  '22023',
  'idempotency key reused with different request',
  'the same key with a different brief identity is rejected'
);

reset role;
select * from finish();
rollback;
