begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

select plan(41);

insert into public.organizations (id, name, slug)
values
  ('10000000-0000-4000-8000-000000000001', 'M0.2 Tenant One', 'm02-tenant-one'),
  ('10000000-0000-4000-8000-000000000002', 'M0.2 Tenant Two', 'm02-tenant-two');

set session_replication_role = replica;
insert into public.profiles (id, display_name)
values
  ('10000000-0000-4000-8000-000000000011', 'M0.2 Owner One'),
  ('10000000-0000-4000-8000-000000000012', 'M0.2 Owner Two');
set session_replication_role = origin;

insert into public.memberships (id, organization_id, profile_id)
values
  (
    '10000000-0000-4000-8000-000000000021',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000011'
  ),
  (
    '10000000-0000-4000-8000-000000000022',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000012'
  );

insert into public.roles (id, organization_id, key, name)
values
  (
    '10000000-0000-4000-8000-000000000031',
    '10000000-0000-4000-8000-000000000001',
    'owner',
    'Owner'
  ),
  (
    '10000000-0000-4000-8000-000000000032',
    '10000000-0000-4000-8000-000000000002',
    'owner',
    'Owner'
  );

insert into public.membership_role_grants (
  organization_id, membership_id, role_id, granted_by_membership_id
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000021',
    '10000000-0000-4000-8000-000000000031',
    '10000000-0000-4000-8000-000000000021'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000022',
    '10000000-0000-4000-8000-000000000032',
    '10000000-0000-4000-8000-000000000022'
  );

insert into public.role_permission_grants (
  organization_id, role_id, permission_id, granted_by_membership_id
)
select
  seed.organization_id,
  seed.role_id,
  p.id,
  seed.membership_id
from (
  values
    (
      '10000000-0000-4000-8000-000000000001'::uuid,
      '10000000-0000-4000-8000-000000000031'::uuid,
      '10000000-0000-4000-8000-000000000021'::uuid
    ),
    (
      '10000000-0000-4000-8000-000000000002'::uuid,
      '10000000-0000-4000-8000-000000000032'::uuid,
      '10000000-0000-4000-8000-000000000022'::uuid
    )
) seed(organization_id, role_id, membership_id)
cross join public.permissions p;

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.organizations),
  1::bigint,
  'tenant-one user sees exactly one organization'
);
select ok(
  exists (
    select 1 from public.organizations
    where id = '10000000-0000-4000-8000-000000000001'
  ),
  'tenant-one user sees own organization'
);
select ok(
  not exists (
    select 1 from public.organizations
    where id = '10000000-0000-4000-8000-000000000002'
  ),
  'tenant-one user cannot see tenant two'
);
select throws_ok(
  $sql$
    select *
    from public.m1_create_audio_brief(
      '10000000-0000-4000-8000-000000000002',
      'Cross-tenant attempt',
      '{"purpose":"must fail"}'::jsonb,
      '10000000-0000-4000-8000-000000000101'
    )
  $sql$,
  '42501',
  'permission denied',
  'tenant-one user cannot execute a command for tenant two'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000012","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.organizations),
  1::bigint,
  'tenant-two user sees exactly one organization'
);
select ok(
  exists (
    select 1 from public.organizations
    where id = '10000000-0000-4000-8000-000000000002'
  ),
  'tenant-two user sees own organization'
);
select ok(
  not exists (
    select 1 from public.organizations
    where id = '10000000-0000-4000-8000-000000000001'
  ),
  'tenant-two user cannot see tenant one'
);

reset role;
update public.memberships
set status = 'suspended'
where id = '10000000-0000-4000-8000-000000000022';

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000012","role":"authenticated","aal":"aal2"}',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.organizations),
  0::bigint,
  'a suspended membership cannot read its organization'
);
select throws_ok(
  $sql$
    select *
    from public.m1_create_audio_brief(
      '10000000-0000-4000-8000-000000000002',
      'Suspended membership attempt',
      '{"purpose":"must fail"}'::jsonb,
      '10000000-0000-4000-8000-000000000113'
    )
  $sql$,
  '42501',
  'permission denied',
  'a suspended membership cannot execute a governed command'
);

reset role;
update public.memberships
set status = 'active'
where id = '10000000-0000-4000-8000-000000000022';

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select throws_ok(
  $sql$
    select public.m1_create_review_policy(
      '10000000-0000-4000-8000-000000000001',
      'm0_2_default',
      1,
      '10000000-0000-4000-8000-000000000102'
    )
  $sql$,
  '42501',
  'aal2 authentication required',
  'AAL1 is denied for the privileged policy command'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000011","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$
    select public.m1_create_review_policy(
      '10000000-0000-4000-8000-000000000001',
      'm0_2_default',
      1,
      '10000000-0000-4000-8000-000000000114'
    )
  $sql$,
  '42501',
  'aal2 authentication required',
  'a session without current assurance evidence is denied'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal2"}',
  true
);

select lives_ok(
  $sql$
    select public.m1_create_review_policy(
      '10000000-0000-4000-8000-000000000001',
      'm0_2_default',
      1,
      '10000000-0000-4000-8000-000000000103'
    )
  $sql$,
  'the same authorized policy command succeeds at AAL2'
);
select is(
  (
    select count(*)
    from public.review_policy_lanes l
    join public.review_policies p on p.id = l.review_policy_id
    where p.organization_id = '10000000-0000-4000-8000-000000000001'
      and p.key = 'm0_2_default'
      and p.is_active
  ),
  3::bigint,
  'the active policy contains exactly three human review lanes'
);

select lives_ok(
  $sql$
    select *
    from public.m1_create_audio_brief(
      '10000000-0000-4000-8000-000000000001',
      'M0.2 governed path',
      '{"purpose":"reliability acceptance","schema_id":"strongr.audio_reflection_brief.v1","scripture":"Psalm 46:10"}'::jsonb,
      '10000000-0000-4000-8000-000000000104'
    )
  $sql$,
  'governed brief command succeeds for the authorized tenant'
);
select ok(
  (
    select count(*) = 1
    from public.content_items i
    join public.content_briefs b
      on b.content_item_id = i.id
     and b.organization_id = i.organization_id
    where i.organization_id = '10000000-0000-4000-8000-000000000001'
      and i.title = 'M0.2 governed path'
  ),
  'brief and content identity were committed together'
);

select lives_ok(
  $sql$
    select public.m1_create_manual_version(
      '10000000-0000-4000-8000-000000000001',
      (
        select id from public.content_items
        where organization_id = '10000000-0000-4000-8000-000000000001'
          and title = 'M0.2 governed path'
      ),
      (
        select b.id
        from public.content_briefs b
        join public.content_items i
          on i.id = b.content_item_id
         and i.organization_id = b.organization_id
        where i.organization_id = '10000000-0000-4000-8000-000000000001'
          and i.title = 'M0.2 governed path'
      ),
      '{"title":"Be Still","script":"Be still, and know that I am God."}'::jsonb,
      null,
      '10000000-0000-4000-8000-000000000105'
    )
  $sql$,
  'manual immutable version command succeeds'
);

select lives_ok(
  $sql$
    select public.m1_submit_version(
      '10000000-0000-4000-8000-000000000001',
      (
        select v.id
        from public.content_versions v
        join public.content_items i
          on i.id = v.content_item_id
         and i.organization_id = v.organization_id
        where i.title = 'M0.2 governed path'
      ),
      '10000000-0000-4000-8000-000000000106'
    )
  $sql$,
  'draft submits through the governed command'
);
select is(
  (
    select v.state
    from public.content_versions v
    join public.content_items i
      on i.id = v.content_item_id
     and i.organization_id = v.organization_id
    where i.title = 'M0.2 governed path'
  ),
  'submitted',
  'submitted version is in the expected state'
);

select lives_ok(
  $sql$
    select public.m1_record_scripture_evidence(
      '10000000-0000-4000-8000-000000000001',
      (
        select v.id
        from public.content_versions v
        join public.content_items i
          on i.id = v.content_item_id
         and i.organization_id = v.organization_id
        where i.title = 'M0.2 governed path'
      ),
      'Psalm 46:10',
      'KJV',
      'Authorized KJV source',
      'verified',
      '10000000-0000-4000-8000-000000000107'
    )
  $sql$,
  'verified Scripture evidence is recorded at AAL2'
);
select lives_ok(
  $sql$
    select public.m1_record_rights_snapshot(
      '10000000-0000-4000-8000-000000000001',
      (
        select v.id
        from public.content_versions v
        join public.content_items i
          on i.id = v.content_item_id
         and i.organization_id = v.organization_id
        where i.title = 'M0.2 governed path'
      ),
      'cleared',
      'KJV rights/source reviewed for this acceptance fixture',
      '10000000-0000-4000-8000-000000000108'
    )
  $sql$,
  'cleared rights snapshot is recorded at AAL2'
);

reset role;

select set_config(
  'm0_2.check_content_version_id',
  (
    select v.id::text
    from public.content_versions v
    join public.content_items i
      on i.id = v.content_item_id
     and i.organization_id = v.organization_id
    where i.title = 'M0.2 governed path'
  ),
  true
);
select set_config(
  'm0_2.check_results_payload',
  (
    select jsonb_agg(
      jsonb_build_object(
        'check_definition_id', id,
        'outcome', 'pass',
        'detail_code', 'm0_2.pass',
        'evidence', jsonb_build_object('source', 'acceptance')
      )
      order by key, version
    )::text
    from public.check_definitions
  ),
  true
);

set local role service_role;

select lives_ok(
  $sql$
    select public.m1_record_check_run(
      '10000000-0000-4000-8000-000000000001',
      current_setting('m0_2.check_content_version_id')::uuid,
      'm0_2_acceptance',
      '1.0.0',
      'completed',
      current_setting('m0_2.check_results_payload')::jsonb,
      '10000000-0000-4000-8000-000000000109'
    )
  $sql$,
  'service worker records the complete automated-check run'
);

reset role;

select is(
  (
    select count(*)
    from public.check_results r
    join public.check_runs cr on cr.id = r.check_run_id
    where cr.engine_key = 'm0_2_acceptance'
  ),
  8::bigint,
  'the check run records all eight required results'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal2"}',
  true
);
set local role authenticated;

select lives_ok(
  $sql$
    do $review$
    declare
      v_version_id uuid;
      v_lane text;
    begin
      select v.id into v_version_id
      from public.content_versions v
      join public.content_items i
        on i.id = v.content_item_id
       and i.organization_id = v.organization_id
      where i.title = 'M0.2 governed path';

      foreach v_lane in array array['scripture', 'theology', 'editorial']
      loop
        perform public.m1_record_review(
          '10000000-0000-4000-8000-000000000001',
          v_version_id,
          v_lane,
          'approved',
          'm0_2_acceptance',
          jsonb_build_object('lane', v_lane, 'source', 'acceptance'),
          gen_random_uuid()
        );
      end loop;
    end;
    $review$
  $sql$,
  'all three human review decisions are recorded'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal1"}',
  true
);

select throws_ok(
  $sql$
    select public.m1_approve_version(
      '10000000-0000-4000-8000-000000000001',
      (
        select v.id from public.content_versions v
        join public.content_items i
          on i.id = v.content_item_id
         and i.organization_id = v.organization_id
        where i.title = 'M0.2 governed path'
      ),
      (
        select id from public.review_policies
        where organization_id = '10000000-0000-4000-8000-000000000001'
          and key = 'm0_2_default' and is_active
      ),
      (
        select id from public.check_runs
        where organization_id = '10000000-0000-4000-8000-000000000001'
          and engine_key = 'm0_2_acceptance'
      ),
      (
        select id from public.scripture_evidence
        where organization_id = '10000000-0000-4000-8000-000000000001'
      ),
      (
        select id from public.rights_snapshots
        where organization_id = '10000000-0000-4000-8000-000000000001'
      ),
      (
        select id from public.review_decisions
        where organization_id = '10000000-0000-4000-8000-000000000001'
          and lane = 'scripture'
      ),
      (
        select id from public.review_decisions
        where organization_id = '10000000-0000-4000-8000-000000000001'
          and lane = 'theology'
      ),
      (
        select id from public.review_decisions
        where organization_id = '10000000-0000-4000-8000-000000000001'
          and lane = 'editorial'
      ),
      'm0_2_acceptance',
      '10000000-0000-4000-8000-000000000110'
    )
  $sql$,
  '42501',
  'aal2 authentication required',
  'AAL1 cannot approve an otherwise complete evidence bundle'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal2"}',
  true
);

select lives_ok(
  $sql$
    select public.m1_approve_version(
      '10000000-0000-4000-8000-000000000001',
      (
        select v.id from public.content_versions v
        join public.content_items i
          on i.id = v.content_item_id
         and i.organization_id = v.organization_id
        where i.title = 'M0.2 governed path'
      ),
      (
        select id from public.review_policies
        where organization_id = '10000000-0000-4000-8000-000000000001'
          and key = 'm0_2_default' and is_active
      ),
      (
        select id from public.check_runs
        where organization_id = '10000000-0000-4000-8000-000000000001'
          and engine_key = 'm0_2_acceptance'
      ),
      (
        select id from public.scripture_evidence
        where organization_id = '10000000-0000-4000-8000-000000000001'
      ),
      (
        select id from public.rights_snapshots
        where organization_id = '10000000-0000-4000-8000-000000000001'
      ),
      (
        select id from public.review_decisions
        where organization_id = '10000000-0000-4000-8000-000000000001'
          and lane = 'scripture'
      ),
      (
        select id from public.review_decisions
        where organization_id = '10000000-0000-4000-8000-000000000001'
          and lane = 'theology'
      ),
      (
        select id from public.review_decisions
        where organization_id = '10000000-0000-4000-8000-000000000001'
          and lane = 'editorial'
      ),
      'm0_2_acceptance',
      '10000000-0000-4000-8000-000000000111'
    )
  $sql$,
  'the same complete evidence bundle is approved at AAL2'
);

select ok(
  (
    select
      a.authentication_assurance = 'aal2'
      and (select count(*) from public.approval_review_decisions ard
           where ard.approval_snapshot_id = a.id) = 3
      and (select count(*) from public.approval_check_results acr
           where acr.approval_snapshot_id = a.id) = 8
    from public.approval_snapshots a
    where a.organization_id = '10000000-0000-4000-8000-000000000001'
  ),
  'approval snapshot binds AAL2, three reviews, and eight check results'
);

select lives_ok(
  $sql$
    select public.m1_create_production_package(
      '10000000-0000-4000-8000-000000000001',
      (
        select id from public.approval_snapshots
        where organization_id = '10000000-0000-4000-8000-000000000001'
      ),
      '10000000-0000-4000-8000-000000000112'
    )
  $sql$,
  'approved evidence produces an immutable production package'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal1"}',
  true
);

select throws_ok(
  $sql$
    select public.m1_revoke_approval(
      '10000000-0000-4000-8000-000000000001',
      (
        select id from public.approval_snapshots
        where organization_id = '10000000-0000-4000-8000-000000000001'
      ),
      'evidence_changed',
      '10000000-0000-4000-8000-000000000116'
    )
  $sql$,
  '42501',
  'aal2 authentication required',
  'AAL1 cannot revoke an approval'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal2"}',
  true
);

select lives_ok(
  $sql$
    select public.m1_revoke_approval(
      '10000000-0000-4000-8000-000000000001',
      (
        select id from public.approval_snapshots
        where organization_id = '10000000-0000-4000-8000-000000000001'
      ),
      'evidence_changed',
      '10000000-0000-4000-8000-000000000117'
    )
  $sql$,
  'the same authorized revocation succeeds at AAL2'
);

select throws_ok(
  $sql$
    select public.m1_create_production_package(
      '10000000-0000-4000-8000-000000000001',
      (
        select id from public.approval_snapshots
        where organization_id = '10000000-0000-4000-8000-000000000001'
      ),
      '10000000-0000-4000-8000-000000000118'
    )
  $sql$,
  '55000',
  'approval is absent or revoked',
  'a revoked approval cannot authorize another package request'
);

reset role;

select ok(
  (
    select
      p.manifest ->> 'schema_id' = 'strongr.production_package.v1'
      and p.manifest_hash = app_private.sha256_jsonb(p.manifest)
    from public.production_packages p
    where p.organization_id = '10000000-0000-4000-8000-000000000001'
  ),
  'production manifest is complete and its hash verifies'
);
select ok(
  (
    select
      v.payload_hash = app_private.sha256_jsonb(v.payload)
      and se.evidence_hash = app_private.sha256_jsonb(jsonb_build_object(
        'version_id', se.content_version_id,
        'reference', se.reference,
        'translation', se.translation,
        'source_citation', se.source_citation,
        'verification_status', se.verification_status
      ))
      and rs.snapshot_hash = app_private.sha256_jsonb(jsonb_build_object(
        'version_id', rs.content_version_id,
        'status', rs.status,
        'source_summary', rs.source_summary
      ))
    from public.content_versions v
    join public.scripture_evidence se
      on se.content_version_id = v.id
     and se.organization_id = v.organization_id
    join public.rights_snapshots rs
      on rs.content_version_id = v.id
     and rs.organization_id = v.organization_id
    where v.organization_id = '10000000-0000-4000-8000-000000000001'
  ),
  'version, Scripture, and rights evidence hashes recompute exactly'
);
select ok(
  (
    select
      a.version_payload_hash = v.payload_hash
      and p.manifest ->> 'content_version_id' = v.id::text
      and p.manifest ->> 'content_payload_hash' = v.payload_hash
      and p.manifest ->> 'evidence_bundle_hash' = a.evidence_bundle_hash
    from public.approval_snapshots a
    join public.content_versions v
      on v.id = a.content_version_id
     and v.organization_id = a.organization_id
    join public.production_packages p
      on p.approval_snapshot_id = a.id
     and p.organization_id = a.organization_id
    where a.organization_id = '10000000-0000-4000-8000-000000000001'
  ),
  'approval and package bind the exact immutable content version'
);

select throws_ok(
  $sql$
    update public.scripture_evidence
    set reference = 'Psalm 46:11'
    where organization_id = '10000000-0000-4000-8000-000000000001'
  $sql$,
  '55000',
  'scripture_evidence is append-only',
  'Scripture evidence cannot be altered after recording'
);
select throws_ok(
  $sql$
    update public.rights_snapshots
    set source_summary = 'mutated'
    where organization_id = '10000000-0000-4000-8000-000000000001'
  $sql$,
  '55000',
  'rights_snapshots is append-only',
  'rights evidence cannot be altered after recording'
);
select throws_ok(
  $sql$
    update public.review_decisions
    set decision = 'rejected'
    where organization_id = '10000000-0000-4000-8000-000000000001'
  $sql$,
  '55000',
  'review_decisions is append-only',
  'human review decisions cannot be altered after recording'
);
select throws_ok(
  $sql$
    update public.approval_snapshots
    set reason_code = 'mutated'
    where organization_id = '10000000-0000-4000-8000-000000000001'
  $sql$,
  '55000',
  'approval_snapshots is append-only',
  'approval evidence cannot be altered after approval'
);
select throws_ok(
  $sql$
    update public.production_packages
    set manifest_hash = repeat('0', 64)
    where organization_id = '10000000-0000-4000-8000-000000000001'
  $sql$,
  '55000',
  'production_packages is append-only',
  'production package evidence cannot be altered after creation'
);

select ok(
  (
    select
      count(*) >= 12
      and count(*) filter (where source_channel = 'api') >= 11
      and count(*) filter (
        where source_channel = 'worker'
          and action = 'check.run_recorded'
      ) = 1
    from public.audit_events
    where organization_id = '10000000-0000-4000-8000-000000000001'
  ),
  'the governed path leaves complete API and worker audit evidence'
);

insert into public.membership_role_revocations (
  organization_id, grant_id, revoked_by_membership_id, reason_code
)
select
  organization_id,
  id,
  '10000000-0000-4000-8000-000000000021',
  'acceptance_revoked'
from public.membership_role_grants
where organization_id = '10000000-0000-4000-8000-000000000001'
  and membership_id = '10000000-0000-4000-8000-000000000021';

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal2"}',
  true
);
set local role authenticated;

select ok(
  exists (
    select 1 from public.organizations
    where id = '10000000-0000-4000-8000-000000000001'
  ),
  'an active member with a revoked role retains same-tenant membership access'
);
select throws_ok(
  $sql$
    select *
    from public.m1_create_audio_brief(
      '10000000-0000-4000-8000-000000000001',
      'Revoked role attempt',
      '{"purpose":"must fail"}'::jsonb,
      '10000000-0000-4000-8000-000000000115'
    )
  $sql$,
  '42501',
  'permission denied',
  'a revoked role cannot execute its formerly authorized command'
);

reset role;
select * from finish();
rollback;
