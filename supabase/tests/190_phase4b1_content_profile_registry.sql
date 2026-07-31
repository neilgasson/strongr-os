begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

select plan(40);

select ok(
  to_regclass('app_private.strongr_daily_content_profiles') is not null,
  'the private content-profile registry exists'
);
select is(
  (select count(*) from app_private.strongr_daily_content_profiles),
  0::bigint,
  'the migration registers or activates no content profile'
);
select ok(
  (
    select c.relrowsecurity
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'app_private'
      and c.relname = 'strongr_daily_content_profiles'
  ),
  'the private registry has RLS enabled'
);
select ok(
  not has_table_privilege(
    'anon', 'app_private.strongr_daily_content_profiles',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'authenticated', 'app_private.strongr_daily_content_profiles',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'service_role', 'app_private.strongr_daily_content_profiles',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'browser and worker roles have no direct registry access'
);
select ok(
  (
    select pg_get_constraintdef(c.oid)
    from pg_catalog.pg_constraint as c
    where c.conrelid = 'app_private.strongr_daily_content_profiles'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%lifecycle_state%'
  ) like all (array[
    '%inventory_only%', '%source_required%', '%draft_unapproved%',
    '%owner_review%', '%owner_approved_inactive%', '%active%',
    '%superseded%', '%retired%'
  ]),
  'the registry uses the reviewed fail-closed lifecycle vocabulary'
);
select ok(
  (
    select count(*)
    from pg_catalog.pg_trigger as t
    where t.tgrelid =
      'app_private.strongr_daily_content_profiles'::regclass
      and t.tgfoid =
        'app_private.m1_guard_content_profile_registry_mutation()'::regprocedure
      and not t.tgisinternal
      and (t.tgtype & 2) = 2
      and (t.tgtype & 8) = 8
      and (t.tgtype & 16) = 16
  ) = 1,
  'the private registry guard runs before every update and delete'
);
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'content_briefs', 'generation_jobs', 'content_versions',
        'production_packages'
      )
      and column_name in (
        'content_profile_id', 'content_profile_version',
        'content_profile_checksum', 'content_profile_content_type',
        'content_profile_source_manifest_checksum'
      )
  ),
  20::bigint,
  'all four lifecycle tables expose the exact profile provenance columns'
);
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'content_briefs', 'generation_jobs', 'content_versions',
        'production_packages'
      )
      and column_name in (
        'content_profile_id', 'content_profile_version',
        'content_profile_checksum', 'content_profile_content_type',
        'content_profile_source_manifest_checksum'
      )
      and is_nullable = 'YES'
  ),
  20::bigint,
  'profile provenance remains nullable for backward-compatible legacy rows'
);
select ok(
  pg_get_function_result(
    'public.m1_begin_generation_attempt(uuid,text,uuid,text,text)'::regprocedure
  ) like '%content_profile jsonb%content_profile_source_manifest_checksum text%',
  'the worker lease returns exact profile and source-manifest provenance'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.m1_approve_version(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid)',
    'EXECUTE'
  ),
  'profile provenance gives the worker no approval authority'
);
select ok(
  pg_get_functiondef(
    'app_private.m1_guard_content_profile_provenance_update()'::regprocedure
  ) like all (array[
    '%new.content_profile_id%',
    '%new.content_profile_version%',
    '%new.content_profile_checksum%',
    '%new.content_profile_content_type%',
    '%new.content_profile_source_manifest_checksum%'
  ])
  and (
    select count(*)
    from pg_catalog.pg_trigger as t
    where t.tgfoid =
      'app_private.m1_guard_content_profile_provenance_update()'::regprocedure
      and not t.tgisinternal
  ) = 4,
  'all five provenance fields are immutable on all four lifecycle tables'
);

insert into public.organizations (id, name, slug)
values (
  '19000000-0000-4000-8000-000000000001',
  'Phase 4B.1 profile tenant',
  'phase-4b1-profile-tenant'
);

set session_replication_role = replica;
insert into public.profiles (id, display_name)
values (
  '19000000-0000-4000-8000-000000000011',
  'Phase 4B.1 profile owner'
);
set session_replication_role = origin;

insert into public.memberships (id, organization_id, profile_id)
values (
  '19000000-0000-4000-8000-000000000021',
  '19000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000011'
);
insert into public.roles (id, organization_id, key, name)
values (
  '19000000-0000-4000-8000-000000000031',
  '19000000-0000-4000-8000-000000000001',
  'owner',
  'Owner'
);
insert into public.membership_role_grants (
  organization_id, membership_id, role_id, granted_by_membership_id
) values (
  '19000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000021',
  '19000000-0000-4000-8000-000000000031',
  '19000000-0000-4000-8000-000000000021'
);
insert into public.role_permission_grants (
  organization_id, role_id, permission_id, granted_by_membership_id
)
select
  '19000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000031',
  p.id,
  '19000000-0000-4000-8000-000000000021'
from public.permissions as p
where p.key = 'content.create';

insert into public.content_items (
  id, organization_id, title, created_by_membership_id
) values
  (
    '19000000-0000-4000-8000-000000000041',
    '19000000-0000-4000-8000-000000000001',
    'Legacy profile compatibility fixture',
    '19000000-0000-4000-8000-000000000021'
  ),
  (
    '19000000-0000-4000-8000-000000000042',
    '19000000-0000-4000-8000-000000000001',
    'Exact profile provenance fixture',
    '19000000-0000-4000-8000-000000000021'
  );

insert into public.content_briefs (
  id, organization_id, content_item_id, payload, payload_hash,
  created_by_membership_id
) values (
  '19000000-0000-4000-8000-000000000051',
  '19000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000041',
  '{"schema_id":"strongr.audio_reflection_brief.v1"}'::jsonb,
  repeat('1', 64),
  '19000000-0000-4000-8000-000000000021'
);
select ok(
  (
    select num_nonnulls(
      content_profile_id, content_profile_version,
      content_profile_checksum, content_profile_content_type,
      content_profile_source_manifest_checksum
    ) = 0
    from public.content_briefs
    where id = '19000000-0000-4000-8000-000000000051'
  ),
  'a legacy v1 brief remains valid with NULL profile provenance'
);

select throws_ok(
  $sql$
    insert into public.content_versions (
      id, organization_id, content_item_id, brief_id, version_number,
      schema_id, payload, payload_hash, source, source_job_id,
      created_by_membership_id
    ) values (
      '19000000-0000-4000-8000-000000000070',
      '19000000-0000-4000-8000-000000000001',
      '19000000-0000-4000-8000-000000000041',
      '19000000-0000-4000-8000-000000000051',
      1,
      'strongr.audio_reflection.v1',
      '{
        "schema_id":"strongr.audio_reflection.v1",
        "content_profile":{
          "profile_id":"strongr_daily.spoofed",
          "profile_version":1,
          "canonical_checksum":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "content_type":"audio_reflection"
        }
      }'::jsonb,
      repeat('0', 64),
      'manual',
      null,
      '19000000-0000-4000-8000-000000000021'
    )
  $sql$,
  '22023',
  'legacy content version cannot assert content profile provenance',
  'a legacy manual version cannot spoof nested profile provenance'
);

create temporary table phase4b1_legacy_job (job_id uuid not null);
create temporary table phase4b1_legacy_claim (
  event_id uuid not null,
  job_id uuid not null,
  lease_token uuid not null
);
create temporary table phase4b1_legacy_begin (
  brief jsonb not null,
  content_profile jsonb,
  content_profile_source_manifest_checksum text
);
grant select, insert on table
  phase4b1_legacy_job, phase4b1_legacy_claim, phase4b1_legacy_begin
to authenticated, service_role;

select set_config(
  'request.jwt.claims',
  '{"sub":"19000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;
insert into phase4b1_legacy_job (job_id)
select public.m1_request_generation(
  '19000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000051',
  'strongr.audio_reflection.fixture',
  1,
  'phase4b1-legacy-profile',
  '19000000-0000-4000-8000-000000000060'
);
reset role;

set local role service_role;
insert into phase4b1_legacy_claim (event_id, job_id, lease_token)
select event_id, aggregate_id, lease_token
from public.m1_claim_generation_events('phase4b1-legacy-worker', 1, 60);
reset role;

select is(
  (select count(*) from phase4b1_legacy_claim),
  1::bigint,
  'a legacy v1 request remains claimable by the accepted worker command'
);

set local role service_role;
insert into phase4b1_legacy_begin (
  brief, content_profile, content_profile_source_manifest_checksum
)
select brief, content_profile, content_profile_source_manifest_checksum
from public.m1_begin_generation_attempt(
  (select event_id from phase4b1_legacy_claim),
  'phase4b1-legacy-worker',
  (select lease_token from phase4b1_legacy_claim),
  'deterministic',
  'fixture'
);
reset role;

select ok(
  (
    select brief ->> 'schema_id' = 'strongr.audio_reflection_brief.v1'
      and content_profile is null
      and content_profile_source_manifest_checksum is null
    from phase4b1_legacy_begin
  ),
  'the worker can read a legacy v1 brief with a NULL profile selection'
);

select throws_ok(
  $sql$
    insert into public.content_briefs (
      id, organization_id, content_item_id, payload, payload_hash,
      created_by_membership_id
    ) values (
      '19000000-0000-4000-8000-000000000052',
      '19000000-0000-4000-8000-000000000001',
      '19000000-0000-4000-8000-000000000042',
      '{"schema_id":"strongr.strongr_daily_audio_reflection_brief.v2"}'::jsonb,
      repeat('2', 64),
      '19000000-0000-4000-8000-000000000021'
    )
  $sql$,
  '22023',
  'content profile selection is required',
  'a new Strongr Daily v2 brief fails closed without an exact profile'
);

insert into app_private.strongr_daily_content_profiles (
  profile_id, profile_version, profile_checksum, content_type,
  source_manifest_checksum, brief_schema_id, response_schema_id,
  prompt_key, prompt_version, lifecycle_state
) values (
  'strongr_daily.audio_reflection_test',
  1,
  repeat('8', 64),
  'audio_reflection',
  repeat('9', 64),
  'strongr.strongr_daily_audio_reflection_brief.v2',
  'strongr.strongr_daily_audio_reflection.v2',
  'strongr.strongr_daily.v2',
  1,
  'owner_approved_inactive'
);

select throws_ok(
  $sql$
    update app_private.strongr_daily_content_profiles
    set profile_checksum = repeat('7', 64)
    where profile_id = 'strongr_daily.audio_reflection_test'
      and profile_version = 1
  $sql$,
  '55000',
  'content profile registry identity and contract are immutable',
  'profile registry identity, contract, provenance, and registration are immutable'
);
select throws_ok(
  $sql$
    update app_private.strongr_daily_content_profiles
    set lifecycle_state = 'owner_review'
    where profile_id = 'strongr_daily.audio_reflection_test'
      and profile_version = 1
  $sql$,
  '55000',
  'content profile lifecycle transition is not allowed',
  'profile lifecycle cannot move backward or skip reviewed transitions'
);
select throws_ok(
  $sql$
    delete from app_private.strongr_daily_content_profiles
    where profile_id = 'strongr_daily.audio_reflection_test'
      and profile_version = 1
  $sql$,
  '55000',
  'content profile registry records cannot be deleted',
  'profile registry records remain durable and cannot be deleted'
);

insert into public.content_briefs (
  id, organization_id, content_item_id, payload, payload_hash,
  created_by_membership_id
) values (
  '19000000-0000-4000-8000-000000000053',
  '19000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000042',
  '{
    "schema_id":"strongr.strongr_daily_audio_reflection_brief.v2",
    "content_type":"audio_reflection",
    "content_profile":{
      "profile_id":"strongr_daily.audio_reflection_test",
      "profile_version":1,
      "canonical_checksum":"8888888888888888888888888888888888888888888888888888888888888888",
      "content_type":"audio_reflection"
    }
  }'::jsonb,
  repeat('3', 64),
  '19000000-0000-4000-8000-000000000021'
);
select ok(
  exists (
    select 1
    from public.content_briefs
    where id = '19000000-0000-4000-8000-000000000053'
  ),
  'an inactive reviewed profile may be bound to a brief without enabling generation'
);
select ok(
  (
    select row(
      content_profile_id, content_profile_version,
      content_profile_checksum, content_profile_content_type,
      content_profile_source_manifest_checksum
    ) = row(
      'strongr_daily.audio_reflection_test'::text, 1,
      repeat('8', 64), 'audio_reflection'::text, repeat('9', 64)
    )
    from public.content_briefs
    where id = '19000000-0000-4000-8000-000000000053'
  ),
  'the brief stores deterministic id, version, checksum, type, and source manifest'
);
select throws_ok(
  $sql$
    insert into public.content_briefs (
      id, organization_id, content_item_id, payload, payload_hash,
      created_by_membership_id
    ) values (
      '19000000-0000-4000-8000-000000000054',
      '19000000-0000-4000-8000-000000000001',
      '19000000-0000-4000-8000-000000000042',
      '{
        "schema_id":"strongr.strongr_daily_audio_reflection_brief.v2",
        "content_type":"audio_reflection",
        "content_profile":{
          "profile_id":"strongr_daily.audio_reflection_test",
          "profile_version":1,
          "canonical_checksum":"7777777777777777777777777777777777777777777777777777777777777777",
          "content_type":"audio_reflection"
        }
      }'::jsonb,
      repeat('4', 64),
      '19000000-0000-4000-8000-000000000021'
    )
  $sql$,
  '22023',
  'content profile selection is invalid',
  'a brief cannot bind a mismatched canonical profile checksum'
);
select throws_ok(
  $sql$
    insert into public.content_briefs (
      id, organization_id, content_item_id, payload, payload_hash,
      created_by_membership_id, content_profile_id
    ) values (
      '19000000-0000-4000-8000-000000000055',
      '19000000-0000-4000-8000-000000000001',
      '19000000-0000-4000-8000-000000000041',
      '{"schema_id":"strongr.audio_reflection_brief.v1"}'::jsonb,
      repeat('5', 64),
      '19000000-0000-4000-8000-000000000021',
      'strongr_daily.audio_reflection_test'
    )
  $sql$,
  '23514',
  null,
  'partial profile provenance is rejected by an all-or-none constraint'
);

create temporary table phase4b1_job (job_id uuid not null);
grant select, insert on table phase4b1_job to authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"19000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select throws_ok(
  $sql$
    select public.m1_request_generation(
      '19000000-0000-4000-8000-000000000001',
      '19000000-0000-4000-8000-000000000053',
      'strongr.strongr_daily.v2',
      1,
      'phase4b1-inactive-profile',
      '19000000-0000-4000-8000-000000000061'
    )
  $sql$,
  '55000',
  'content profile is not active',
  'an inactive profile cannot authorize a billable generation request'
);

reset role;

insert into app_private.strongr_daily_content_profiles (
  profile_id, profile_version, profile_checksum, content_type,
  source_manifest_checksum, brief_schema_id, response_schema_id,
  prompt_key, prompt_version, lifecycle_state
) values (
  'strongr_daily.audio_reflection_wrong_response_test',
  1,
  repeat('6', 64),
  'audio_reflection',
  repeat('7', 64),
  'strongr.strongr_daily_audio_reflection_brief.v2',
  'strongr.unknown.v9',
  'strongr.strongr_daily.wrong_response_test',
  1,
  'active'
);
insert into public.content_briefs (
  id, organization_id, content_item_id, payload, payload_hash,
  created_by_membership_id
) values (
  '19000000-0000-4000-8000-000000000056',
  '19000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000042',
  jsonb_build_object(
    'schema_id', 'strongr.strongr_daily_audio_reflection_brief.v2',
    'content_type', 'audio_reflection',
    'content_profile', jsonb_build_object(
      'profile_id', 'strongr_daily.audio_reflection_wrong_response_test',
      'profile_version', 1,
      'canonical_checksum', repeat('6', 64),
      'content_type', 'audio_reflection'
    )
  ),
  repeat('6', 64),
  '19000000-0000-4000-8000-000000000021'
);

set local role authenticated;
select throws_ok(
  $sql$
    select public.m1_request_generation(
      '19000000-0000-4000-8000-000000000001',
      '19000000-0000-4000-8000-000000000056',
      'strongr.strongr_daily.wrong_response_test',
      1,
      'phase4b1-wrong-response-schema',
      '19000000-0000-4000-8000-000000000063'
    )
  $sql$,
  '22023',
  'content profile does not match generation contract',
  'an active profile with the wrong v2 response schema cannot spend'
);
reset role;

update app_private.strongr_daily_content_profiles
set lifecycle_state = 'active'
where profile_id = 'strongr_daily.audio_reflection_test'
  and profile_version = 1;

select is(
  (
    select lifecycle_state
    from app_private.strongr_daily_content_profiles
    where profile_id = 'strongr_daily.audio_reflection_test'
      and profile_version = 1
  ),
  'active',
  'owner-approved inactive profiles may move forward to active explicitly'
);

set local role authenticated;
insert into phase4b1_job (job_id)
select public.m1_request_generation(
  '19000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000053',
  'strongr.strongr_daily.v2',
  1,
  'phase4b1-active-profile',
  '19000000-0000-4000-8000-000000000062'
);
reset role;

select is(
  (select count(*) from phase4b1_job),
  1::bigint,
  'the exact active profile permits one explicit generation request'
);
select ok(
  (
    select row(
      content_profile_id, content_profile_version,
      content_profile_checksum, content_profile_content_type,
      content_profile_source_manifest_checksum
    ) = row(
      'strongr_daily.audio_reflection_test'::text, 1,
      repeat('8', 64), 'audio_reflection'::text, repeat('9', 64)
    )
    from public.generation_jobs
    where id = (select job_id from phase4b1_job)
  ),
  'the generation job copies the exact immutable profile provenance'
);
select ok(
  (
    select payload -> 'content_profile' = jsonb_build_object(
      'profile_id', 'strongr_daily.audio_reflection_test',
      'profile_version', 1,
      'canonical_checksum', repeat('8', 64),
      'content_type', 'audio_reflection'
    )
    and payload ->> 'content_profile_source_manifest_checksum' = repeat('9', 64)
    from public.outbox_events
    where aggregate_id = (select job_id from phase4b1_job)
  ),
  'the worker event carries only the exact profile selection and source checksum'
);
select throws_ok(
  $sql$
    update public.content_briefs
    set content_profile_checksum = repeat('7', 64)
    where id = '19000000-0000-4000-8000-000000000053'
  $sql$,
  '55000',
  'content_briefs is append-only',
  'brief profile provenance cannot be changed after creation'
);
select throws_ok(
  $sql$
    update public.generation_jobs
    set content_profile_checksum = repeat('7', 64)
    where id = (select job_id from phase4b1_job)
  $sql$,
  '55000',
  'content profile provenance is immutable',
  'generation-job profile provenance cannot be changed after request'
);

select throws_ok(
  $sql$
    insert into public.content_versions (
      id, organization_id, content_item_id, brief_id, version_number,
      schema_id, payload, payload_hash, source, source_job_id,
      created_by_membership_id
    ) values (
      '19000000-0000-4000-8000-000000000071',
      '19000000-0000-4000-8000-000000000001',
      '19000000-0000-4000-8000-000000000042',
      '19000000-0000-4000-8000-000000000053',
      1,
      'strongr.strongr_daily_audio_reflection.v2',
      '{
        "schema_id":"strongr.strongr_daily_audio_reflection.v2",
        "content_profile":{
          "profile_id":"strongr_daily.audio_reflection_test",
          "profile_version":1,
          "canonical_checksum":"7777777777777777777777777777777777777777777777777777777777777777",
          "content_type":"audio_reflection"
        }
      }'::jsonb,
      repeat('6', 64),
      'ai_assisted',
      (select job_id from phase4b1_job),
      '19000000-0000-4000-8000-000000000021'
    )
  $sql$,
  '22023',
  'generation result does not match content profile provenance',
  'a provider result cannot substitute a different profile checksum'
);

insert into public.content_versions (
  id, organization_id, content_item_id, brief_id, version_number,
  schema_id, payload, payload_hash, source, source_job_id,
  created_by_membership_id
) values (
  '19000000-0000-4000-8000-000000000072',
  '19000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000042',
  '19000000-0000-4000-8000-000000000053',
  1,
  'strongr.strongr_daily_audio_reflection.v2',
  '{
    "schema_id":"strongr.strongr_daily_audio_reflection.v2",
    "content_profile":{
      "profile_id":"strongr_daily.audio_reflection_test",
      "profile_version":1,
      "canonical_checksum":"8888888888888888888888888888888888888888888888888888888888888888",
      "content_type":"audio_reflection"
    }
  }'::jsonb,
  repeat('7', 64),
  'ai_assisted',
  (select job_id from phase4b1_job),
  '19000000-0000-4000-8000-000000000021'
);
select ok(
  (
    select row(
      content_profile_id, content_profile_version,
      content_profile_checksum, content_profile_content_type,
      content_profile_source_manifest_checksum
    ) = row(
      'strongr_daily.audio_reflection_test'::text, 1,
      repeat('8', 64), 'audio_reflection'::text, repeat('9', 64)
    )
    from public.content_versions
    where id = '19000000-0000-4000-8000-000000000072'
  ),
  'the immutable content version inherits exact brief and job provenance'
);
select throws_ok(
  $sql$
    update public.content_versions
    set content_profile_content_type = 'devotional'
    where id = '19000000-0000-4000-8000-000000000072'
  $sql$,
  '55000',
  'illegal content version transition',
  'content-version profile provenance cannot be changed'
);

insert into public.review_policies (
  id, organization_id, key, version, policy_hash, is_active
) values (
  '19000000-0000-4000-8000-000000000081',
  '19000000-0000-4000-8000-000000000001',
  'phase4b1.profile.fixture', 1, repeat('a', 64), false
);
insert into public.check_runs (
  id, organization_id, content_version_id, engine_key, engine_version,
  status, artifact_hash, correlation_id
) values (
  '19000000-0000-4000-8000-000000000082',
  '19000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000072',
  'phase4b1.fixture', '1', 'completed', repeat('b', 64),
  '19000000-0000-4000-8000-000000000091'
);
insert into public.scripture_evidence (
  id, organization_id, content_version_id, reference, translation,
  source_citation, verification_status, evidence_hash,
  created_by_membership_id
) values (
  '19000000-0000-4000-8000-000000000083',
  '19000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000072',
  'Synthetic 1:1', 'TEST', 'Synthetic test citation', 'verified',
  repeat('c', 64), '19000000-0000-4000-8000-000000000021'
);
insert into public.rights_snapshots (
  id, organization_id, content_version_id, status, source_summary,
  snapshot_hash, created_by_membership_id
) values (
  '19000000-0000-4000-8000-000000000084',
  '19000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000072',
  'cleared', 'Synthetic test rights fixture', repeat('d', 64),
  '19000000-0000-4000-8000-000000000021'
);
insert into public.approval_snapshots (
  id, organization_id, content_version_id, review_policy_id,
  check_run_id, scripture_evidence_id, rights_snapshot_id,
  approver_membership_id, version_payload_hash, evidence_bundle_hash,
  authentication_assurance, reason_code
) values (
  '19000000-0000-4000-8000-000000000085',
  '19000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000072',
  '19000000-0000-4000-8000-000000000081',
  '19000000-0000-4000-8000-000000000082',
  '19000000-0000-4000-8000-000000000083',
  '19000000-0000-4000-8000-000000000084',
  '19000000-0000-4000-8000-000000000021',
  repeat('7', 64), repeat('e', 64), 'aal2', 'phase4b1_fixture'
);
insert into public.production_packages (
  id, organization_id, approval_snapshot_id, manifest, manifest_hash,
  created_by_membership_id
) values (
  '19000000-0000-4000-8000-000000000086',
  '19000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000085',
  '{"fixture":"phase4b1"}'::jsonb,
  repeat('f', 64),
  '19000000-0000-4000-8000-000000000021'
);

select ok(
  (
    select row(
      content_profile_id, content_profile_version,
      content_profile_checksum, content_profile_content_type,
      content_profile_source_manifest_checksum
    ) = row(
      'strongr_daily.audio_reflection_test'::text, 1,
      repeat('8', 64), 'audio_reflection'::text, repeat('9', 64)
    )
    from public.production_packages
    where id = '19000000-0000-4000-8000-000000000086'
  ),
  'the private immutable package inherits exact version provenance'
);
select is(
  (
    select manifest -> 'content_profile'
    from public.production_packages
    where id = '19000000-0000-4000-8000-000000000086'
  ),
  '{
    "profile_id":"strongr_daily.audio_reflection_test",
    "profile_version":1,
    "canonical_checksum":"8888888888888888888888888888888888888888888888888888888888888888",
    "content_type":"audio_reflection"
  }'::jsonb,
  'the package/export manifest carries the exact four-field profile selection'
);
select is(
  (
    select manifest ->> 'content_profile_source_manifest_checksum'
    from public.production_packages
    where id = '19000000-0000-4000-8000-000000000086'
  ),
  repeat('9', 64),
  'the package/export manifest carries the source-manifest checksum'
);
select ok(
  (
    select manifest_hash = app_private.sha256_jsonb(manifest)
    from public.production_packages
    where id = '19000000-0000-4000-8000-000000000086'
  ),
  'the package hash is recomputed after profile provenance is bound'
);
select throws_ok(
  $sql$
    update public.production_packages
    set content_profile_checksum = repeat('7', 64)
    where id = '19000000-0000-4000-8000-000000000086'
  $sql$,
  '55000',
  'production_packages is append-only',
  'package profile provenance cannot be changed after creation'
);
select ok(
  not exists (
    select 1
    from information_schema.role_table_grants as g
    where g.table_schema = 'app_private'
      and g.table_name = 'strongr_daily_content_profiles'
      and g.grantee in ('anon', 'authenticated', 'service_role')
      and g.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ),
  'the complete lifecycle test leaves registry grants unchanged'
);

select * from finish();
rollback;
