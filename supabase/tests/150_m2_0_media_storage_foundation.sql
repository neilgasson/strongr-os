begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

select plan(33);

select has_table('public', 'media_output_specs', 'M2.0 output specs table exists');
select has_table('public', 'media_jobs', 'M2.0 media jobs table exists');
select has_table('public', 'media_job_attempts', 'M2.0 media attempts table exists');
select has_table('public', 'media_artifacts', 'M2.0 media artifacts table exists');
select has_table('public', 'media_reviews', 'M2.0 media reviews table exists');
select has_table('public', 'staged_release_bundles', 'M2.0 staged bundles table exists');
select has_table(
  'public',
  'staged_release_revocations',
  'M2.0 staged release revocations table exists'
);
select has_table(
  'public',
  'media_reconciliation_events',
  'M2.0 reconciliation evidence table exists'
);

select ok(
  (
    select bool_and(c.relrowsecurity)
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'media_output_specs',
        'media_jobs',
        'media_job_attempts',
        'media_artifacts',
        'media_reviews',
        'staged_release_bundles',
        'staged_release_revocations',
        'media_reconciliation_events'
      )
  ),
  'every M2.0 public table has RLS enabled'
);

select is(
  (
    select count(*)
    from public.permissions
    where key in ('media.request', 'media.review', 'release.stage', 'release.revoke')
  ),
  4::bigint,
  'the four approved M2 permission keys are registered'
);

select ok(
  exists (
    select 1
    from public.media_output_specs
    where id = '20000000-0000-4000-8000-000000000001'
      and key = 'strongr.synthetic_audio'
      and version = 1
      and mime_type = 'audio/wav'
      and codec = 'pcm_s16le'
      and max_bytes = 26214400
      and spec_hash ~ '^[a-f0-9]{64}$'
  ),
  'the deterministic synthetic WAV output spec is immutable and versioned'
);

select ok(
  not has_table_privilege('anon', 'public.media_artifacts', 'SELECT'),
  'anonymous callers cannot read canonical media artifacts'
);
select ok(
  not has_table_privilege('authenticated', 'public.media_artifacts', 'INSERT'),
  'authenticated callers cannot insert canonical media artifacts'
);
select ok(
  has_table_privilege('authenticated', 'public.media_artifacts', 'SELECT'),
  'authenticated callers have RLS-filtered media artifact reads'
);
select ok(
  not has_table_privilege('service_role', 'public.media_artifacts', 'INSERT'),
  'service_role cannot bypass future governed artifact commands with table writes'
);
select ok(
  not has_table_privilege('authenticated', 'public.media_job_attempts', 'SELECT'),
  'browser callers cannot read worker attempt provenance'
);
select ok(
  not has_table_privilege('authenticated', 'public.media_reconciliation_events', 'SELECT'),
  'browser callers cannot read worker reconciliation evidence'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'm2_media_objects_exact_member_select'
      and cmd = 'SELECT'
      and 'authenticated' = any(roles)
  ),
  'private Storage reads require the exact M2 authenticated policy'
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
  'M2.0 grants no application Storage mutation policy'
);
select ok(
  (
    select qual not ilike '%owner_id%'
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'm2_media_objects_exact_member_select'
  ),
  'Storage authorization does not trust service-upload ownership metadata'
);

insert into public.organizations (id, name, slug)
values
  (
    '25000000-0000-4000-8000-000000000001',
    'M2 Foundation Tenant One',
    'm2-foundation-one'
  ),
  (
    '25000000-0000-4000-8000-000000000002',
    'M2 Foundation Tenant Two',
    'm2-foundation-two'
  );

set session_replication_role = replica;
insert into public.profiles (id, display_name)
values
  ('25000000-0000-4000-8000-000000000011', 'M2 Owner One'),
  ('25000000-0000-4000-8000-000000000012', 'M2 Owner Two');
set session_replication_role = origin;

insert into public.memberships (id, organization_id, profile_id)
values
  (
    '25000000-0000-4000-8000-000000000021',
    '25000000-0000-4000-8000-000000000001',
    '25000000-0000-4000-8000-000000000011'
  ),
  (
    '25000000-0000-4000-8000-000000000022',
    '25000000-0000-4000-8000-000000000002',
    '25000000-0000-4000-8000-000000000012'
  );

set session_replication_role = replica;
insert into public.production_packages (
  id,
  organization_id,
  approval_snapshot_id,
  manifest,
  manifest_hash,
  created_by_membership_id
)
values
  (
    '25000000-0000-4000-8000-000000000031',
    '25000000-0000-4000-8000-000000000001',
    '25000000-0000-4000-8000-000000000041',
    '{"fixture":"m2-tenant-one"}'::jsonb,
    repeat('a', 64),
    '25000000-0000-4000-8000-000000000021'
  ),
  (
    '25000000-0000-4000-8000-000000000032',
    '25000000-0000-4000-8000-000000000002',
    '25000000-0000-4000-8000-000000000042',
    '{"fixture":"m2-tenant-two"}'::jsonb,
    repeat('b', 64),
    '25000000-0000-4000-8000-000000000022'
  ),
  (
    '25000000-0000-4000-8000-000000000033',
    '25000000-0000-4000-8000-000000000001',
    '25000000-0000-4000-8000-000000000043',
    '{"fixture":"m2-tenant-one-alternate"}'::jsonb,
    repeat('3', 64),
    '25000000-0000-4000-8000-000000000021'
  );
set session_replication_role = origin;

insert into public.media_jobs (
  id,
  organization_id,
  production_package_id,
  output_spec_id,
  requested_by_membership_id,
  adapter_key,
  adapter_version,
  idempotency_key,
  input_hash,
  correlation_id
)
values
  (
    '25000000-0000-4000-8000-000000000051',
    '25000000-0000-4000-8000-000000000001',
    '25000000-0000-4000-8000-000000000031',
    '20000000-0000-4000-8000-000000000001',
    '25000000-0000-4000-8000-000000000021',
    'strongr.synthetic_audio',
    '1.0.0',
    'm2-foundation-tenant-one',
    repeat('c', 64),
    '25000000-0000-4000-8000-000000000061'
  ),
  (
    '25000000-0000-4000-8000-000000000052',
    '25000000-0000-4000-8000-000000000002',
    '25000000-0000-4000-8000-000000000032',
    '20000000-0000-4000-8000-000000000001',
    '25000000-0000-4000-8000-000000000022',
    'strongr.synthetic_audio',
    '1.0.0',
    'm2-foundation-tenant-two',
    repeat('d', 64),
    '25000000-0000-4000-8000-000000000062'
  );

select throws_ok(
  $sql$
    insert into public.media_jobs (
      organization_id,
      production_package_id,
      output_spec_id,
      requested_by_membership_id,
      adapter_key,
      adapter_version,
      idempotency_key,
      input_hash,
      correlation_id
    )
    values (
      '25000000-0000-4000-8000-000000000002',
      '25000000-0000-4000-8000-000000000031',
      '20000000-0000-4000-8000-000000000001',
      '25000000-0000-4000-8000-000000000022',
      'strongr.synthetic_audio',
      '1.0.0',
      'm2-cross-tenant-package',
      repeat('e', 64),
      '25000000-0000-4000-8000-000000000063'
    )
  $sql$,
  '23503',
  null,
  'a media job cannot bind another tenant production package'
);

update public.media_jobs
set
  state = 'running',
  attempt_count = 1,
  started_at = statement_timestamp()
where id = '25000000-0000-4000-8000-000000000051';

insert into public.media_job_attempts (
  id,
  organization_id,
  media_job_id,
  attempt_number,
  adapter_key,
  adapter_version,
  status,
  input_hash,
  output_hash,
  byte_count,
  latency_ms,
  cost_microunits,
  correlation_id,
  started_at,
  finished_at
)
values (
  '25000000-0000-4000-8000-000000000071',
  '25000000-0000-4000-8000-000000000001',
  '25000000-0000-4000-8000-000000000051',
  1,
  'strongr.synthetic_audio',
  '1.0.0',
  'succeeded',
  repeat('c', 64),
  repeat('f', 64),
  3244,
  10,
  0,
  '25000000-0000-4000-8000-000000000061',
  statement_timestamp(),
  statement_timestamp()
);

select throws_ok(
  $sql$
    insert into public.media_artifacts (
      id,
      organization_id,
      media_job_id,
      production_package_id,
      output_spec_id,
      successful_attempt_id,
      object_path,
      mime_type,
      container,
      codec,
      channels,
      sample_rate_hz,
      bits_per_sample,
      duration_ms,
      byte_count,
      sha256,
      validated_at,
      correlation_id
    )
    values (
      '25000000-0000-4000-8000-000000000080',
      '25000000-0000-4000-8000-000000000001',
      '25000000-0000-4000-8000-000000000051',
      '25000000-0000-4000-8000-000000000033',
      '20000000-0000-4000-8000-000000000001',
      '25000000-0000-4000-8000-000000000071',
      '25000000-0000-4000-8000-000000000001/25000000-0000-4000-8000-000000000033/25000000-0000-4000-8000-000000000080.wav',
      'audio/wav',
      'wav',
      'pcm_s16le',
      1,
      16000,
      16,
      100,
      3244,
      repeat('f', 64),
      statement_timestamp(),
      '25000000-0000-4000-8000-000000000061'
    )
  $sql$,
  '23503',
  null,
  'an artifact cannot swap the exact package bound to its media job'
);

update public.media_jobs
set
  state = 'succeeded',
  finished_at = statement_timestamp()
where id = '25000000-0000-4000-8000-000000000051';

select throws_ok(
  $sql$
    insert into public.media_artifacts (
      id,
      organization_id,
      media_job_id,
      production_package_id,
      output_spec_id,
      successful_attempt_id,
      object_path,
      mime_type,
      container,
      codec,
      channels,
      sample_rate_hz,
      bits_per_sample,
      duration_ms,
      byte_count,
      sha256,
      validated_at,
      correlation_id
    )
    values (
      '25000000-0000-4000-8000-000000000081',
      '25000000-0000-4000-8000-000000000001',
      '25000000-0000-4000-8000-000000000051',
      '25000000-0000-4000-8000-000000000031',
      '20000000-0000-4000-8000-000000000001',
      '25000000-0000-4000-8000-000000000071',
      'title-or-email-must-never-appear.wav',
      'audio/wav',
      'wav',
      'pcm_s16le',
      1,
      16000,
      16,
      100,
      3244,
      repeat('f', 64),
      statement_timestamp(),
      '25000000-0000-4000-8000-000000000061'
    )
  $sql$,
  '23514',
  null,
  'artifact paths must match the exact opaque tenant/package/artifact contract'
);

select lives_ok(
  $sql$
    insert into public.media_artifacts (
      id,
      organization_id,
      media_job_id,
      production_package_id,
      output_spec_id,
      successful_attempt_id,
      object_path,
      mime_type,
      container,
      codec,
      channels,
      sample_rate_hz,
      bits_per_sample,
      duration_ms,
      byte_count,
      sha256,
      validated_at,
      correlation_id
    )
    values (
      '25000000-0000-4000-8000-000000000081',
      '25000000-0000-4000-8000-000000000001',
      '25000000-0000-4000-8000-000000000051',
      '25000000-0000-4000-8000-000000000031',
      '20000000-0000-4000-8000-000000000001',
      '25000000-0000-4000-8000-000000000071',
      '25000000-0000-4000-8000-000000000001/25000000-0000-4000-8000-000000000031/25000000-0000-4000-8000-000000000081.wav',
      'audio/wav',
      'wav',
      'pcm_s16le',
      1,
      16000,
      16,
      100,
      3244,
      repeat('f', 64),
      statement_timestamp(),
      '25000000-0000-4000-8000-000000000061'
    )
  $sql$,
  'canonical media metadata accepts the exact validated synthetic WAV contract'
);

select ok(
  (
    select object_path ~
      '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.]wav$'
      and object_path not ilike '%@%'
    from public.media_artifacts
    where id = '25000000-0000-4000-8000-000000000081'
  ),
  'the canonical object path contains only opaque identifiers'
);

select throws_ok(
  $sql$
    update public.media_artifacts
    set sha256 = repeat('0', 64)
    where id = '25000000-0000-4000-8000-000000000081'
  $sql$,
  '55000',
  'media_artifacts is append-only',
  'canonical artifact metadata cannot be altered'
);

select throws_ok(
  $sql$
    update public.media_jobs
    set
      state = 'succeeded',
      started_at = statement_timestamp(),
      finished_at = statement_timestamp()
    where id = '25000000-0000-4000-8000-000000000052'
  $sql$,
  '55000',
  'illegal media job transition',
  'queued media jobs cannot skip durable worker execution'
);

select throws_ok(
  $sql$
    update public.media_jobs
    set input_hash = repeat('0', 64)
    where id = '25000000-0000-4000-8000-000000000052'
  $sql$,
  '55000',
  'media job identity is immutable',
  'media request identity cannot be altered'
);

select throws_ok(
  $sql$
    insert into public.media_reviews (
      id,
      organization_id,
      media_artifact_id,
      reviewer_membership_id,
      decision,
      transcript_status,
      accessibility_status,
      reason_code,
      evidence,
      evidence_hash,
      correlation_id
    )
    values (
      '25000000-0000-4000-8000-000000000090',
      '25000000-0000-4000-8000-000000000001',
      '25000000-0000-4000-8000-000000000081',
      '25000000-0000-4000-8000-000000000021',
      'approved',
      'blocked',
      'approved',
      'transcript_not_ready',
      '{"fixture":"must-fail"}'::jsonb,
      repeat('0', 64),
      '25000000-0000-4000-8000-000000000061'
    )
  $sql$,
  '23514',
  null,
  'media approval cannot bypass transcript and accessibility readiness'
);

insert into public.media_reviews (
  id,
  organization_id,
  media_artifact_id,
  reviewer_membership_id,
  decision,
  transcript_status,
  accessibility_status,
  reason_code,
  evidence,
  evidence_hash,
  correlation_id
)
values (
  '25000000-0000-4000-8000-000000000091',
  '25000000-0000-4000-8000-000000000001',
  '25000000-0000-4000-8000-000000000081',
  '25000000-0000-4000-8000-000000000021',
  'approved',
  'ready',
  'approved',
  'synthetic_fixture_reviewed',
  '{"fixture":"human-governance-placeholder"}'::jsonb,
  repeat('1', 64),
  '25000000-0000-4000-8000-000000000061'
);

insert into public.staged_release_bundles (
  id,
  organization_id,
  production_package_id,
  media_artifact_id,
  media_review_id,
  manifest,
  manifest_hash,
  staged_by_membership_id,
  authentication_assurance,
  correlation_id
)
values (
  '25000000-0000-4000-8000-000000000101',
  '25000000-0000-4000-8000-000000000001',
  '25000000-0000-4000-8000-000000000031',
  '25000000-0000-4000-8000-000000000081',
  '25000000-0000-4000-8000-000000000091',
  '{"fixture":"non-public-staged-bundle"}'::jsonb,
  repeat('2', 64),
  '25000000-0000-4000-8000-000000000021',
  'aal2',
  '25000000-0000-4000-8000-000000000061'
);

select throws_ok(
  $sql$
    update public.staged_release_bundles
    set manifest = '{"fixture":"changed"}'::jsonb
    where id = '25000000-0000-4000-8000-000000000101'
  $sql$,
  '55000',
  'staged_release_bundles is append-only',
  'a staged release manifest cannot be altered'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"25000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select is(
  (
    select count(*)
    from public.media_jobs
    where organization_id = '25000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'an active member can read own-tenant media intent'
);
select is(
  (
    select count(*)
    from public.media_jobs
    where organization_id = '25000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'an active member cannot read another tenant media intent'
);

reset role;

select ok(
  (
    select count(*) = 10
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname in (
        'media_jobs_ready_idx',
        'media_jobs_package_idx',
        'media_job_attempts_job_idx',
        'media_artifacts_package_idx',
        'media_artifacts_attempt_idx',
        'media_reviews_artifact_idx',
        'staged_release_bundles_package_idx',
        'staged_release_revocations_bundle_idx',
        'media_reconciliation_events_job_idx',
        'media_reconciliation_events_artifact_idx'
      )
  ),
  'tenant, foreign-key, worker-ready, and reconciliation paths are indexed'
);

select * from finish();
rollback;
