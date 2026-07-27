begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

select plan(34);

select ok(
  (
    select bool_and(
      has_function_privilege('authenticated', signature, 'EXECUTE')
    )
    from unnest(array[
      'public.m2_record_media_review(uuid,uuid,text,text,text,text,jsonb,uuid)',
      'public.m2_stage_release(uuid,uuid,uuid,uuid,jsonb,uuid)',
      'public.m2_revoke_staged_release(uuid,uuid,text,uuid)'
    ]) as signature
  ),
  'authenticated humans can execute every exact M2.2 governed command'
);
select ok(
  (
    select bool_and(
      not has_function_privilege('anon', signature, 'EXECUTE')
    )
    from unnest(array[
      'public.m2_record_media_review(uuid,uuid,text,text,text,text,jsonb,uuid)',
      'public.m2_stage_release(uuid,uuid,uuid,uuid,jsonb,uuid)',
      'public.m2_revoke_staged_release(uuid,uuid,text,uuid)'
    ]) as signature
  ),
  'anonymous callers cannot execute M2.2 commands'
);
select ok(
  (
    select bool_and(
      not has_function_privilege('service_role', signature, 'EXECUTE')
    )
    from unnest(array[
      'public.m2_record_media_review(uuid,uuid,text,text,text,text,jsonb,uuid)',
      'public.m2_stage_release(uuid,uuid,uuid,uuid,jsonb,uuid)',
      'public.m2_revoke_staged_release(uuid,uuid,text,uuid)'
    ]) as signature
  ),
  'service_role cannot impersonate M2.2 human authority'
);
select ok(
  (
    select bool_and(
      not has_table_privilege('authenticated', table_name, privilege)
    )
    from unnest(array[
      'public.media_reviews',
      'public.staged_release_bundles',
      'public.staged_release_revocations'
    ]) as table_name
    cross join unnest(array['INSERT', 'UPDATE', 'DELETE']) as privilege
  ),
  'browser roles cannot bypass governed commands with direct table DML'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'm2_media_objects_exact_member_select'
      and qual like '%allow_any_operation%'
      and qual like '%object.get_authenticated%'
      and qual not like '%object.list%'
  ),
  'private object selection is limited to authenticated retrieval operations'
);
select ok(
  not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and roles && array['anon', 'authenticated']::name[]
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ),
  'M2.2 adds no browser Storage mutation policy'
);
select ok(
  (
    select not public
      and file_size_limit = 26214400
      and allowed_mime_types = array['audio/wav']::text[]
    from storage.buckets
    where id = 'strongr-os-media'
  ),
  'the Strongr OS media bucket remains private and allowlisted'
);

insert into public.organizations (id, name, slug)
values
  (
    '28000000-0000-4000-8000-000000000001',
    'M2.2 Review Tenant',
    'm2-2-review-tenant'
  ),
  (
    '28000000-0000-4000-8000-000000000002',
    'M2.2 Other Tenant',
    'm2-2-other-tenant'
  );

set session_replication_role = replica;
insert into public.profiles (id, display_name)
values
  ('28000000-0000-4000-8000-000000000011', 'M2.2 Owner'),
  ('28000000-0000-4000-8000-000000000012', 'M2.2 Other Owner');
set session_replication_role = origin;

insert into public.memberships (id, organization_id, profile_id)
values
  (
    '28000000-0000-4000-8000-000000000021',
    '28000000-0000-4000-8000-000000000001',
    '28000000-0000-4000-8000-000000000011'
  ),
  (
    '28000000-0000-4000-8000-000000000022',
    '28000000-0000-4000-8000-000000000002',
    '28000000-0000-4000-8000-000000000012'
  );

insert into public.roles (
  id, organization_id, key, name, description, is_system
)
values
  (
    '28000000-0000-4000-8000-000000000031',
    '28000000-0000-4000-8000-000000000001',
    'owner',
    'M2.2 Owner',
    'Test owner authority',
    true
  ),
  (
    '28000000-0000-4000-8000-000000000032',
    '28000000-0000-4000-8000-000000000002',
    'owner',
    'M2.2 Other Owner',
    'Other test owner authority',
    true
  );

insert into public.membership_role_grants (
  organization_id, membership_id, role_id, granted_by_membership_id
)
values
  (
    '28000000-0000-4000-8000-000000000001',
    '28000000-0000-4000-8000-000000000021',
    '28000000-0000-4000-8000-000000000031',
    '28000000-0000-4000-8000-000000000021'
  ),
  (
    '28000000-0000-4000-8000-000000000002',
    '28000000-0000-4000-8000-000000000022',
    '28000000-0000-4000-8000-000000000032',
    '28000000-0000-4000-8000-000000000022'
  );

insert into public.role_permission_grants (
  organization_id, role_id, permission_id, granted_by_membership_id
)
select
  role.organization_id,
  role.id,
  permission.id,
  case role.organization_id
    when '28000000-0000-4000-8000-000000000001'
      then '28000000-0000-4000-8000-000000000021'::uuid
    else '28000000-0000-4000-8000-000000000022'::uuid
  end
from public.roles as role
cross join public.permissions as permission
where role.id in (
  '28000000-0000-4000-8000-000000000031',
  '28000000-0000-4000-8000-000000000032'
)
and permission.key in ('media.review', 'release.stage', 'release.revoke');

set session_replication_role = replica;
insert into public.production_packages (
  id, organization_id, approval_snapshot_id, manifest, manifest_hash,
  created_by_membership_id
)
values
  (
    '28000000-0000-4000-8000-000000000041',
    '28000000-0000-4000-8000-000000000001',
    '28000000-0000-4000-8000-000000000051',
    '{"fixture":"m2-2-package"}'::jsonb,
    repeat('a', 64),
    '28000000-0000-4000-8000-000000000021'
  ),
  (
    '28000000-0000-4000-8000-000000000042',
    '28000000-0000-4000-8000-000000000001',
    '28000000-0000-4000-8000-000000000052',
    '{"fixture":"m2-2-revoked-package"}'::jsonb,
    repeat('b', 64),
    '28000000-0000-4000-8000-000000000021'
  );
set session_replication_role = origin;

insert into public.media_jobs (
  id, organization_id, production_package_id, output_spec_id,
  requested_by_membership_id, adapter_key, adapter_version,
  idempotency_key, input_hash, correlation_id, state, attempt_count,
  started_at, finished_at
)
values
  (
    '28000000-0000-4000-8000-000000000061',
    '28000000-0000-4000-8000-000000000001',
    '28000000-0000-4000-8000-000000000041',
    '20000000-0000-4000-8000-000000000001',
    '28000000-0000-4000-8000-000000000021',
    'strongr.synthetic_audio',
    '1.0.0',
    'm2-2-media-job-one',
    repeat('c', 64),
    '28000000-0000-4000-8000-000000000071',
    'succeeded',
    1,
    statement_timestamp(),
    statement_timestamp()
  ),
  (
    '28000000-0000-4000-8000-000000000062',
    '28000000-0000-4000-8000-000000000001',
    '28000000-0000-4000-8000-000000000042',
    '20000000-0000-4000-8000-000000000001',
    '28000000-0000-4000-8000-000000000021',
    'strongr.synthetic_audio',
    '1.0.0',
    'm2-2-media-job-two',
    repeat('d', 64),
    '28000000-0000-4000-8000-000000000072',
    'succeeded',
    1,
    statement_timestamp(),
    statement_timestamp()
  );

insert into public.media_job_attempts (
  id, organization_id, media_job_id, attempt_number, adapter_key,
  adapter_version, status, input_hash, output_hash, byte_count,
  latency_ms, cost_microunits, provider_correlation_id, correlation_id,
  started_at, finished_at
)
values
  (
    '28000000-0000-4000-8000-000000000081',
    '28000000-0000-4000-8000-000000000001',
    '28000000-0000-4000-8000-000000000061',
    1,
    'strongr.synthetic_audio',
    '1.0.0',
    'succeeded',
    repeat('c', 64),
    '2976da01e205a110c9fa41d47659e238a5c6d3c3f3137582f2949853faa201dd',
    3244,
    25,
    0,
    'synthetic-m2-2-fixture-one',
    '28000000-0000-4000-8000-000000000071',
    statement_timestamp(),
    statement_timestamp()
  ),
  (
    '28000000-0000-4000-8000-000000000082',
    '28000000-0000-4000-8000-000000000001',
    '28000000-0000-4000-8000-000000000062',
    1,
    'strongr.synthetic_audio',
    '1.0.0',
    'succeeded',
    repeat('d', 64),
    '2976da01e205a110c9fa41d47659e238a5c6d3c3f3137582f2949853faa201dd',
    3244,
    25,
    0,
    'synthetic-m2-2-fixture-two',
    '28000000-0000-4000-8000-000000000072',
    statement_timestamp(),
    statement_timestamp()
  );

insert into public.media_artifacts (
  id, organization_id, media_job_id, production_package_id, output_spec_id,
  successful_attempt_id, object_path, mime_type, container, codec, channels,
  sample_rate_hz, bits_per_sample, duration_ms, byte_count, sha256,
  validation_schema_id, validated_at, correlation_id
)
values
  (
    '28000000-0000-4000-8000-000000000091',
    '28000000-0000-4000-8000-000000000001',
    '28000000-0000-4000-8000-000000000061',
    '28000000-0000-4000-8000-000000000041',
    '20000000-0000-4000-8000-000000000001',
    '28000000-0000-4000-8000-000000000081',
    '28000000-0000-4000-8000-000000000001/'
      || '28000000-0000-4000-8000-000000000041/'
      || '28000000-0000-4000-8000-000000000091.wav',
    'audio/wav',
    'wav',
    'pcm_s16le',
    1,
    16000,
    16,
    100,
    3244,
    '2976da01e205a110c9fa41d47659e238a5c6d3c3f3137582f2949853faa201dd',
    'strongr.media_validation.v1',
    statement_timestamp(),
    '28000000-0000-4000-8000-000000000071'
  ),
  (
    '28000000-0000-4000-8000-000000000092',
    '28000000-0000-4000-8000-000000000001',
    '28000000-0000-4000-8000-000000000062',
    '28000000-0000-4000-8000-000000000042',
    '20000000-0000-4000-8000-000000000001',
    '28000000-0000-4000-8000-000000000082',
    '28000000-0000-4000-8000-000000000001/'
      || '28000000-0000-4000-8000-000000000042/'
      || '28000000-0000-4000-8000-000000000092.wav',
    'audio/wav',
    'wav',
    'pcm_s16le',
    1,
    16000,
    16,
    100,
    3244,
    '2976da01e205a110c9fa41d47659e238a5c6d3c3f3137582f2949853faa201dd',
    'strongr.media_validation.v1',
    statement_timestamp(),
    '28000000-0000-4000-8000-000000000072'
  );

select set_config(
  'request.jwt.claims',
  '{"sub":"28000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select is(
  (
    select count(*)
    from public.media_artifacts
    where organization_id = '28000000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'an active tenant member can read its canonical artifact metadata'
);

create temp table m22_review as
select public.m2_record_media_review(
  '28000000-0000-4000-8000-000000000001',
  '28000000-0000-4000-8000-000000000091',
  'approved',
  'ready',
  'approved',
  'human_media_accepted',
  '{"transcript_checksum":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',
  '28000000-0000-4000-8000-0000000000a1'
) as review_id;

select ok(
  (select review_id is not null from m22_review),
  'an authorized human can record media and accessibility evidence'
);
reset role;

select ok(
  (
    select decision = 'approved'
      and transcript_status = 'ready'
      and accessibility_status = 'approved'
      and reviewer_membership_id =
        '28000000-0000-4000-8000-000000000021'
    from public.media_reviews
    where id = (select review_id from m22_review)
  ),
  'the media review records exact human authority and approval state'
);
select is(
  (
    select evidence_hash
    from public.media_reviews
    where id = (select review_id from m22_review)
  ),
  app_private.sha256_jsonb(jsonb_build_object(
    'accessibility_status', 'approved',
    'artifact_byte_count', 3244,
    'artifact_id', '28000000-0000-4000-8000-000000000091'::uuid,
    'artifact_sha256',
      '2976da01e205a110c9fa41d47659e238a5c6d3c3f3137582f2949853faa201dd',
    'decision', 'approved',
    'evidence',
      '{"transcript_checksum":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'::jsonb,
    'reason_code', 'human_media_accepted',
    'review_schema_id', 'strongr.media_review.v1',
    'reviewer_membership_id',
      '28000000-0000-4000-8000-000000000021'::uuid,
    'transcript_status', 'ready'
  )),
  'review evidence hash binds the exact artifact bytes and human evidence'
);

set local role authenticated;
select throws_ok(
  $sql$
    select public.m2_record_media_review(
      '28000000-0000-4000-8000-000000000001',
      '28000000-0000-4000-8000-000000000091',
      'approved', 'blocked', 'approved', 'invalid_approval',
      '{}'::jsonb,
      '28000000-0000-4000-8000-0000000000a2'
    )
  $sql$,
  '22023',
  'approved media requires ready transcript and accessibility',
  'a blocked transcript cannot be represented as approved media'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"28000000-0000-4000-8000-000000000012","role":"authenticated","aal":"aal2"}',
  true
);
set local role authenticated;
select is(
  (
    select count(*)
    from public.media_artifacts
    where organization_id = '28000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'RLS hides another tenant artifact metadata'
);
select throws_ok(
  $sql$
    select public.m2_record_media_review(
      '28000000-0000-4000-8000-000000000002',
      '28000000-0000-4000-8000-000000000091',
      'approved', 'ready', 'approved', 'cross_tenant_review',
      '{}'::jsonb,
      '28000000-0000-4000-8000-0000000000a3'
    )
  $sql$,
  'P0002',
  'canonical media artifact not found',
  'a tenant cannot review another tenant artifact'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"28000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;
select throws_ok(
  format(
    $sql$
      select public.m2_stage_release(
        '28000000-0000-4000-8000-000000000001',
        '28000000-0000-4000-8000-000000000041',
        '28000000-0000-4000-8000-000000000091',
        %L,
        '{"release_channel":"private_acceptance"}'::jsonb,
        '28000000-0000-4000-8000-0000000000b1'
      )
    $sql$,
    (select review_id from m22_review)
  ),
  '42501',
  'aal2 authentication required',
  'AAL1 cannot stage a release'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"28000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal2"}',
  true
);
set local role authenticated;
create temp table m22_bundle as
select public.m2_stage_release(
  '28000000-0000-4000-8000-000000000001',
  '28000000-0000-4000-8000-000000000041',
  '28000000-0000-4000-8000-000000000091',
  (select review_id from m22_review),
  '{"release_channel":"private_acceptance"}'::jsonb,
  '28000000-0000-4000-8000-0000000000b2'
) as bundle_id;
reset role;

select ok(
  (select bundle_id is not null from m22_bundle),
  'an AAL2-authorized human can create a private staged release bundle'
);
select ok(
  (
    select
      manifest_schema_id = 'strongr.staged_release_bundle.v1'
      and manifest_hash = app_private.sha256_jsonb(manifest)
      and manifest #>> '{production_package,id}' =
        '28000000-0000-4000-8000-000000000041'
      and manifest #>> '{production_package,manifest_hash}' = repeat('a', 64)
      and manifest #>> '{media_artifact,id}' =
        '28000000-0000-4000-8000-000000000091'
      and manifest #>> '{media_artifact,sha256}' =
        '2976da01e205a110c9fa41d47659e238a5c6d3c3f3137582f2949853faa201dd'
      and manifest #>> '{media_review,id}' =
        (select review_id::text from m22_review)
      and manifest #>> '{configuration,release_channel}' =
        'private_acceptance'
    from public.staged_release_bundles
    where id = (select bundle_id from m22_bundle)
  ),
  'the immutable staged manifest binds package, artifact, review, and configuration'
);
select ok(
  (
    select authentication_assurance = 'aal2'
      and staged_by_membership_id =
        '28000000-0000-4000-8000-000000000021'
    from public.staged_release_bundles
    where id = (select bundle_id from m22_bundle)
  ),
  'the staged bundle preserves exact AAL2 human authority'
);

set local role authenticated;
select is(
  public.m2_stage_release(
    '28000000-0000-4000-8000-000000000001',
    '28000000-0000-4000-8000-000000000041',
    '28000000-0000-4000-8000-000000000091',
    (select review_id from m22_review),
    '{"release_channel":"private_acceptance"}'::jsonb,
    '28000000-0000-4000-8000-0000000000b3'
  ),
  (select bundle_id from m22_bundle),
  'an exact staging replay returns the immutable bundle'
);
select throws_ok(
  format(
    $sql$
      select public.m2_stage_release(
        '28000000-0000-4000-8000-000000000001',
        '28000000-0000-4000-8000-000000000041',
        '28000000-0000-4000-8000-000000000091',
        %L,
        '{"release_channel":"changed"}'::jsonb,
        '28000000-0000-4000-8000-0000000000b4'
      )
    $sql$,
    (select review_id from m22_review)
  ),
  '22023',
  'media artifact already has a different staged bundle',
  'changed staging input cannot reuse the canonical artifact'
);
reset role;

select throws_ok(
  format(
    $sql$
      update public.staged_release_bundles
      set manifest_hash = %L
      where id = %L
    $sql$,
    repeat('f', 64),
    (select bundle_id from m22_bundle)
  ),
  '55000',
  'staged_release_bundles is append-only',
  'staged release bundles are immutable'
);
select throws_ok(
  format(
    $sql$
      update public.media_reviews
      set reason_code = 'changed'
      where id = %L
    $sql$,
    (select review_id from m22_review)
  ),
  '55000',
  'media_reviews is append-only',
  'human media reviews are immutable'
);

set session_replication_role = replica;
insert into public.approval_revocations (
  id, organization_id, approval_snapshot_id, revoked_by_membership_id,
  reason_code
)
values (
  '28000000-0000-4000-8000-0000000000c1',
  '28000000-0000-4000-8000-000000000001',
  '28000000-0000-4000-8000-000000000052',
  '28000000-0000-4000-8000-000000000021',
  'package_evidence_changed'
);
set session_replication_role = origin;

select set_config(
  'request.jwt.claims',
  '{"sub":"28000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;
create temp table m22_revoked_review as
select public.m2_record_media_review(
  '28000000-0000-4000-8000-000000000001',
  '28000000-0000-4000-8000-000000000092',
  'approved',
  'ready',
  'approved',
  'human_media_accepted',
  '{"transcript_checksum":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}',
  '28000000-0000-4000-8000-0000000000c2'
) as review_id;
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"28000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal2"}',
  true
);
set local role authenticated;
select throws_ok(
  format(
    $sql$
      select public.m2_stage_release(
        '28000000-0000-4000-8000-000000000001',
        '28000000-0000-4000-8000-000000000042',
        '28000000-0000-4000-8000-000000000092',
        %L,
        '{"release_channel":"private_acceptance"}'::jsonb,
        '28000000-0000-4000-8000-0000000000c3'
      )
    $sql$,
    (select review_id from m22_revoked_review)
  ),
  '55000',
  'production package is absent or revoked',
  'a revoked package cannot authorize a staged release'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"28000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;
select throws_ok(
  format(
    $sql$
      select public.m2_revoke_staged_release(
        '28000000-0000-4000-8000-000000000001',
        %L,
        'evidence_changed',
        '28000000-0000-4000-8000-0000000000d1'
      )
    $sql$,
    (select bundle_id from m22_bundle)
  ),
  '42501',
  'aal2 authentication required',
  'AAL1 cannot revoke staged release authority'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"28000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal2"}',
  true
);
set local role authenticated;
create temp table m22_revocation as
select public.m2_revoke_staged_release(
  '28000000-0000-4000-8000-000000000001',
  (select bundle_id from m22_bundle),
  'evidence_changed',
  '28000000-0000-4000-8000-0000000000d2'
) as revocation_id;
reset role;

select ok(
  (select revocation_id is not null from m22_revocation),
  'an AAL2-authorized human can revoke staged release authority'
);
select ok(
  (
    select authentication_assurance = 'aal2'
      and revoked_by_membership_id =
        '28000000-0000-4000-8000-000000000021'
      and reason_code = 'evidence_changed'
    from public.staged_release_revocations
    where id = (select revocation_id from m22_revocation)
  ),
  'the revocation preserves exact AAL2 human authority and reason'
);

set local role authenticated;
select is(
  public.m2_revoke_staged_release(
    '28000000-0000-4000-8000-000000000001',
    (select bundle_id from m22_bundle),
    'evidence_changed',
    '28000000-0000-4000-8000-0000000000d3'
  ),
  (select revocation_id from m22_revocation),
  'an exact revocation replay returns the immutable revocation'
);
select throws_ok(
  format(
    $sql$
      select public.m2_revoke_staged_release(
        '28000000-0000-4000-8000-000000000001',
        %L,
        'different_reason',
        '28000000-0000-4000-8000-0000000000d4'
      )
    $sql$,
    (select bundle_id from m22_bundle)
  ),
  '55000',
  'staged release bundle is already revoked',
  'changed revocation input cannot replace existing authority'
);
select throws_ok(
  format(
    $sql$
      select public.m2_stage_release(
        '28000000-0000-4000-8000-000000000001',
        '28000000-0000-4000-8000-000000000041',
        '28000000-0000-4000-8000-000000000091',
        %L,
        '{"release_channel":"private_acceptance"}'::jsonb,
        '28000000-0000-4000-8000-0000000000d5'
      )
    $sql$,
    (select review_id from m22_review)
  ),
  '55000',
  'staged release authority is revoked',
  'revoked staged authority cannot be recreated'
);
reset role;

select throws_ok(
  format(
    $sql$
      update public.staged_release_revocations
      set reason_code = 'changed'
      where id = %L
    $sql$,
    (select revocation_id from m22_revocation)
  ),
  '55000',
  'staged_release_revocations is append-only',
  'staged release revocations are immutable'
);
select is(
  (
    select count(*)
    from public.audit_events
    where organization_id = '28000000-0000-4000-8000-000000000001'
      and action in (
        'media.review_recorded',
        'release.staged',
        'release.revoked'
      )
  ),
  4::bigint,
  'human review, staging, and revocation emit tenant audit evidence'
);
select ok(
  not exists (
    select 1
    from public.staged_release_bundles as bundle
    left join public.media_reviews as review
      on review.id = bundle.media_review_id
     and review.organization_id = bundle.organization_id
    where bundle.organization_id =
      '28000000-0000-4000-8000-000000000001'
      and (
        review.decision <> 'approved'
        or review.transcript_status <> 'ready'
        or review.accessibility_status <> 'approved'
      )
  ),
  'every staged bundle remains bound to approved human accessibility evidence'
);
select is(
  (
    select count(*)
    from public.staged_release_bundles
    where organization_id = '28000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'replays and rejected changes create exactly one staged bundle'
);
select is(
  (
    select count(*)
    from public.staged_release_revocations
    where organization_id = '28000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'revocation replays create exactly one append-only revocation'
);

select * from finish();
rollback;
