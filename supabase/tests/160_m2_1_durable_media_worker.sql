begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

select plan(36);

select has_table(
  'app_private',
  'm2_media_attempt_claims',
  'M2.1 private media attempt claims table exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.m2_request_media(uuid,uuid,uuid,text,text,text,uuid)',
    'EXECUTE'
  ),
  'authenticated operators can invoke the governed media request command'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.m2_request_media(uuid,uuid,uuid,text,text,text,uuid)',
    'EXECUTE'
  ),
  'anonymous callers cannot request media'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.m2_request_media(uuid,uuid,uuid,text,text,text,uuid)',
    'EXECUTE'
  ),
  'service_role cannot impersonate a human media requester'
);
select ok(
  (
    select bool_and(
      has_function_privilege('service_role', signature, 'EXECUTE')
    )
    from unnest(array[
      'public.m2_claim_media_events(text,integer,integer)',
      'public.m2_begin_media_attempt(uuid,text,uuid,text,text)',
      'public.m2_complete_media_attempt(uuid,text,uuid,uuid,text,text,text,integer,integer,integer,integer,bigint,text,text,text,text,integer,bigint)',
      'public.m2_fail_media_attempt(uuid,text,uuid,uuid,text,integer)',
      'public.m2_record_media_reconciliation(uuid,text,uuid,uuid,text,text,text,text,text)'
    ]) as signature
  ),
  'service_role can execute every exact M2.1 worker command'
);
select ok(
  (
    select bool_and(
      not has_function_privilege('anon', signature, 'EXECUTE')
    )
    from unnest(array[
      'public.m2_claim_media_events(text,integer,integer)',
      'public.m2_begin_media_attempt(uuid,text,uuid,text,text)',
      'public.m2_complete_media_attempt(uuid,text,uuid,uuid,text,text,text,integer,integer,integer,integer,bigint,text,text,text,text,integer,bigint)',
      'public.m2_fail_media_attempt(uuid,text,uuid,uuid,text,integer)',
      'public.m2_record_media_reconciliation(uuid,text,uuid,uuid,text,text,text,text,text)'
    ]) as signature
  ),
  'anonymous callers cannot execute any M2.1 worker command'
);
select ok(
  (
    select bool_and(
      not has_function_privilege('authenticated', signature, 'EXECUTE')
    )
    from unnest(array[
      'public.m2_claim_media_events(text,integer,integer)',
      'public.m2_begin_media_attempt(uuid,text,uuid,text,text)',
      'public.m2_complete_media_attempt(uuid,text,uuid,uuid,text,text,text,integer,integer,integer,integer,bigint,text,text,text,text,integer,bigint)',
      'public.m2_fail_media_attempt(uuid,text,uuid,uuid,text,integer)',
      'public.m2_record_media_reconciliation(uuid,text,uuid,uuid,text,text,text,text,text)'
    ]) as signature
  ),
  'browser-authenticated callers cannot execute M2.1 worker commands'
);
select ok(
  (
    select c.relrowsecurity
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'app_private'
      and c.relname = 'm2_media_attempt_claims'
  ),
  'private media attempt claims have RLS enabled'
);
select ok(
  (
    select bool_and(
      not has_table_privilege(role_name, 'app_private.m2_media_attempt_claims', privilege)
    )
    from unnest(array['anon', 'authenticated', 'service_role']) as role_name
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as privilege
  ),
  'no application role can directly access private media attempt claims'
);
select ok(
  not has_table_privilege('service_role', 'public.media_jobs', 'INSERT')
    and not has_table_privilege('service_role', 'public.media_jobs', 'UPDATE')
    and not has_table_privilege('service_role', 'public.media_artifacts', 'INSERT')
    and not has_table_privilege(
      'service_role',
      'public.media_reconciliation_events',
      'INSERT'
    ),
  'service_role cannot bypass governed worker commands with direct table DML'
);
select ok(
  not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'm2_media_%'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ),
  'M2.1 adds no browser Storage mutation policy'
);

insert into public.organizations (id, name, slug)
values (
  '27000000-0000-4000-8000-000000000001',
  'M2.1 Worker Tenant',
  'm2-1-worker-tenant'
);

set session_replication_role = replica;
insert into public.profiles (id, display_name)
values ('27000000-0000-4000-8000-000000000011', 'M2.1 Owner');
set session_replication_role = origin;

insert into public.memberships (id, organization_id, profile_id)
values (
  '27000000-0000-4000-8000-000000000021',
  '27000000-0000-4000-8000-000000000001',
  '27000000-0000-4000-8000-000000000011'
);

insert into public.roles (
  id, organization_id, key, name, description, is_system
)
values (
  '27000000-0000-4000-8000-000000000031',
  '27000000-0000-4000-8000-000000000001',
  'owner',
  'M2.1 Owner',
  'Test owner authority',
  true
);

insert into public.membership_role_grants (
  organization_id, membership_id, role_id, granted_by_membership_id
)
values (
  '27000000-0000-4000-8000-000000000001',
  '27000000-0000-4000-8000-000000000021',
  '27000000-0000-4000-8000-000000000031',
  '27000000-0000-4000-8000-000000000021'
);

insert into public.role_permission_grants (
  organization_id, role_id, permission_id, granted_by_membership_id
)
select
  '27000000-0000-4000-8000-000000000001',
  '27000000-0000-4000-8000-000000000031',
  id,
  '27000000-0000-4000-8000-000000000021'
from public.permissions
where key = 'media.request';

set session_replication_role = replica;
insert into public.production_packages (
  id, organization_id, approval_snapshot_id, manifest, manifest_hash,
  created_by_membership_id
)
values
  (
    '27000000-0000-4000-8000-000000000041',
    '27000000-0000-4000-8000-000000000001',
    '27000000-0000-4000-8000-000000000051',
    '{"fixture":"m2-1-package"}'::jsonb,
    repeat('a', 64),
    '27000000-0000-4000-8000-000000000021'
  ),
  (
    '27000000-0000-4000-8000-000000000042',
    '27000000-0000-4000-8000-000000000001',
    '27000000-0000-4000-8000-000000000052',
    '{"fixture":"m2-1-revoked-package"}'::jsonb,
    repeat('b', 64),
    '27000000-0000-4000-8000-000000000021'
  );

insert into public.approval_revocations (
  id, organization_id, approval_snapshot_id, revoked_by_membership_id,
  reason_code
)
values (
  '27000000-0000-4000-8000-000000000061',
  '27000000-0000-4000-8000-000000000001',
  '27000000-0000-4000-8000-000000000052',
  '27000000-0000-4000-8000-000000000021',
  'test_revocation'
);
set session_replication_role = origin;

select set_config(
  'request.jwt.claims',
  '{"sub":"27000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select throws_ok(
  $sql$
    select public.m2_request_media(
      '27000000-0000-4000-8000-000000000001',
      '27000000-0000-4000-8000-000000000041',
      '20000000-0000-4000-8000-000000000001',
      'strongr.synthetic_audio',
      '1.0.0',
      'm2-1-request-key',
      '27000000-0000-4000-8000-000000000071'
    )
  $sql$,
  '42501',
  'aal2 authentication required',
  'AAL1 cannot request media'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"27000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal2"}',
  true
);

select lives_ok(
  $sql$
    select public.m2_request_media(
      '27000000-0000-4000-8000-000000000001',
      '27000000-0000-4000-8000-000000000041',
      '20000000-0000-4000-8000-000000000001',
      'strongr.synthetic_audio',
      '1.0.0',
      'm2-1-request-key',
      '27000000-0000-4000-8000-000000000071'
    )
  $sql$,
  'an AAL2 owner can request deterministic media'
);

reset role;

select is(
  (
    select count(*)
    from public.media_jobs
    where organization_id = '27000000-0000-4000-8000-000000000001'
      and idempotency_key = 'm2-1-request-key'
  ),
  1::bigint,
  'the governed request creates exactly one durable media job'
);
select is(
  (
    select count(*)
    from public.outbox_events
    where event_type = 'media.generation_requested.v1'
      and aggregate_id = (
        select id
        from public.media_jobs
        where idempotency_key = 'm2-1-request-key'
      )
  ),
  1::bigint,
  'the media job and outbox intent are persisted atomically'
);

set local role authenticated;
select is(
  public.m2_request_media(
    '27000000-0000-4000-8000-000000000001',
    '27000000-0000-4000-8000-000000000041',
    '20000000-0000-4000-8000-000000000001',
    'strongr.synthetic_audio',
    '1.0.0',
    'm2-1-request-key',
    '27000000-0000-4000-8000-000000000072'
  ),
  (
    select id
    from public.media_jobs
    where idempotency_key = 'm2-1-request-key'
  ),
  'an exact idempotent replay returns the canonical media job'
);
select throws_ok(
  $sql$
    select public.m2_request_media(
      '27000000-0000-4000-8000-000000000001',
      '27000000-0000-4000-8000-000000000041',
      '20000000-0000-4000-8000-000000000001',
      'strongr.synthetic_audio',
      '2.0.0',
      'm2-1-request-key',
      '27000000-0000-4000-8000-000000000073'
    )
  $sql$,
  '22023',
  'idempotency key reused with different media request',
  'changed media request reuse is rejected'
);
select throws_ok(
  $sql$
    select public.m2_request_media(
      '27000000-0000-4000-8000-000000000001',
      '27000000-0000-4000-8000-000000000042',
      '20000000-0000-4000-8000-000000000001',
      'strongr.synthetic_audio',
      '1.0.0',
      'm2-1-revoked-key',
      '27000000-0000-4000-8000-000000000074'
    )
  $sql$,
  '55000',
  'production package is absent or revoked',
  'a revoked package cannot authorize media intent'
);
reset role;

set local role service_role;
create temp table m21_claim as
select *
from public.m2_claim_media_events('m2-1-worker', 10, 120);
reset role;

select is(
  (select count(*) from m21_claim),
  1::bigint,
  'the media-specific claim command claims exactly its pending event'
);

set local role service_role;
create temp table m21_attempt as
select *
from public.m2_begin_media_attempt(
  (select event_id from m21_claim),
  'm2-1-worker',
  (select lease_token from m21_claim),
  'strongr.synthetic_audio',
  '1.0.0'
);
reset role;

select is(
  (select disposition from m21_attempt),
  'ready',
  'the first owned lease begins one ready media attempt'
);
select ok(
  (
    select state = 'running' and attempt_count = 1
    from public.media_jobs
    where id = (select media_job_id from m21_attempt)
  ),
  'beginning the attempt moves the job to running exactly once'
);
select is(
  (select object_path from m21_attempt),
  '27000000-0000-4000-8000-000000000001/'
    || '27000000-0000-4000-8000-000000000041/'
    || (select artifact_id::text from m21_attempt) || '.wav',
  'the worker receives an opaque tenant/package/artifact write-once path'
);

set local role service_role;
select is(
  (
    select attempt_id
    from public.m2_begin_media_attempt(
      (select event_id from m21_claim),
      'm2-1-worker',
      (select lease_token from m21_claim),
      'strongr.synthetic_audio',
      '1.0.0'
    )
  ),
  (select attempt_id from m21_attempt),
  'repeating begin under the same lease is idempotent'
);
select throws_ok(
  format(
    $sql$
      select public.m2_begin_media_attempt(
        %L, 'm2-1-worker', %L, 'strongr.other_adapter', '1.0.0'
      )
    $sql$,
    (select event_id from m21_claim),
    (select lease_token from m21_claim)
  ),
  '22023',
  'media claim does not match job provenance',
  'the worker cannot swap adapter provenance'
);

select lives_ok(
  format(
    $sql$
      select public.m2_record_media_reconciliation(
        %L, 'm2-1-worker', %L, null,
        'upload_ambiguous', 'detected', %L, null,
        'storage_upload_response_ambiguous'
      )
    $sql$,
    (select event_id from m21_claim),
    (select lease_token from m21_claim),
    (select object_path from m21_attempt)
  ),
  'the worker can append partial-upload reconciliation evidence'
);
reset role;

select is(
  (
    select count(*)
    from public.media_reconciliation_events
    where media_job_id = (select media_job_id from m21_attempt)
      and event_type = 'upload_ambiguous'
      and outcome = 'detected'
  ),
  1::bigint,
  'ambiguous upload evidence is durable and job scoped'
);

set local role service_role;
select throws_ok(
  format(
    $sql$
      select public.m2_record_media_reconciliation(
        %L, 'm2-1-worker', %L, null,
        'reconciled', 'verified',
        '27000000-0000-4000-8000-000000000001/'
          || '27000000-0000-4000-8000-000000000041/'
          || '27000000-0000-4000-8000-000000000099.wav',
        %L, 'wrong_path'
      )
    $sql$,
    (select event_id from m21_claim),
    (select lease_token from m21_claim),
    repeat('2', 64)
  ),
  '22023',
  'reconciliation object path is not canonical for media job',
  'reconciliation cannot be attached to a substituted object path'
);

create temp table m21_completion as
select public.m2_complete_media_attempt(
  (select event_id from m21_claim),
  'm2-1-worker',
  (select lease_token from m21_claim),
  (select attempt_id from m21_attempt),
  'audio/wav',
  'wav',
  'pcm_s16le',
  1,
  16000,
  16,
  100,
  3244,
  '2976da01e205a110c9fa41d47659e238a5c6d3c3f3137582f2949853faa201dd',
  '"fixture-etag"',
  'strongr.media_validation.v1',
  'synthetic-2976da01e205a110c9fa41d47659e238',
  25,
  0
) as artifact_id;
reset role;

select is(
  (select artifact_id from m21_completion),
  (select artifact_id from m21_attempt),
  'completion records the preallocated canonical artifact identity'
);
select ok(
  (
    select state = 'succeeded' and finished_at is not null
    from public.media_jobs
    where id = (select media_job_id from m21_attempt)
  ),
  'validated completion marks the durable media job succeeded'
);
select ok(
  (
    select
      status = 'succeeded'
      and adapter_key = 'strongr.synthetic_audio'
      and adapter_version = '1.0.0'
      and output_hash =
        '2976da01e205a110c9fa41d47659e238a5c6d3c3f3137582f2949853faa201dd'
      and byte_count = 3244
      and cost_microunits = 0
      and provider_correlation_id =
        'synthetic-2976da01e205a110c9fa41d47659e238'
    from public.media_job_attempts
    where id = (select attempt_id from m21_attempt)
  ),
  'the successful attempt preserves provider-neutral provenance and cost'
);
select ok(
  (
    select
      id = (select artifact_id from m21_attempt)
      and successful_attempt_id = (select attempt_id from m21_attempt)
      and bucket_id = 'strongr-os-media'
      and object_path = (select object_path from m21_attempt)
      and mime_type = 'audio/wav'
      and codec = 'pcm_s16le'
      and sha256 =
        '2976da01e205a110c9fa41d47659e238a5c6d3c3f3137582f2949853faa201dd'
      and byte_count = 3244
      and duration_ms = 100
    from public.media_artifacts
    where media_job_id = (select media_job_id from m21_attempt)
  ),
  'the immutable artifact binds exact job, attempt, path, bytes, and format'
);
select throws_ok(
  format(
    $sql$
      update public.media_artifacts
      set sha256 = %L
      where id = %L
    $sql$,
    repeat('f', 64),
    (select artifact_id from m21_attempt)
  ),
  '55000',
  'media_artifacts is append-only',
  'canonical media provenance cannot be altered after completion'
);

set local role service_role;
create temp table m21_ack as
select public.m0_ack_outbox_event(
  (select event_id from m21_claim),
  'm2-1-worker',
  (select lease_token from m21_claim),
  'media-' || (select event_id::text from m21_claim)
) as receipt_id;
reset role;

select ok(
  (select receipt_id is not null from m21_ack),
  'the exact media outbox event can be acknowledged after completion'
);
select is(
  (
    select status
    from public.outbox_events
    where id = (select event_id from m21_claim)
  ),
  'delivered',
  'the completed media event is durably delivered'
);

set local role service_role;
create temp table m21_empty_claim as
select *
from public.m2_claim_media_events('m2-1-worker', 10, 120);
reset role;

select is(
  (select count(*) from m21_empty_claim),
  0::bigint,
  'a delivered media event is never claimed twice'
);
select throws_ok(
  format(
    $sql$
      update app_private.m2_media_attempt_claims
      set worker_id = 'changed-worker'
      where attempt_id = %L
    $sql$,
    (select attempt_id from m21_attempt)
  ),
  '55000',
  'm2_media_attempt_claims is append-only',
  'private attempt authority is immutable'
);

select * from finish();
rollback;
