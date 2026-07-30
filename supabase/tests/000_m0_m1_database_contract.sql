begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

select plan(17);

select has_table('public', 'organizations', 'M0 organizations table exists');
select has_table('public', 'content_versions', 'M1 content versions table exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.content_versions'::regclass),
  'content versions use RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.content_versions', 'INSERT'),
  'authenticated cannot insert content versions directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.approval_snapshots', 'UPDATE'),
  'authenticated cannot update approvals directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.audit_events', 'DELETE'),
  'authenticated cannot delete audit evidence'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.m1_create_audio_brief(uuid,text,jsonb,uuid)',
    'EXECUTE'
  ),
  'authenticated may execute the governed brief command'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.m1_record_check_run(uuid,uuid,text,text,text,jsonb,uuid)',
    'EXECUTE'
  ),
  'authenticated cannot impersonate the automated check worker'
);

insert into public.organizations (id, name, slug)
values
  ('00000000-0000-4000-8000-000000000001', 'Tenant One', 'tenant-one'),
  ('00000000-0000-4000-8000-000000000002', 'Tenant Two', 'tenant-two');

set session_replication_role = replica;
insert into public.profiles (id, display_name)
values
  ('00000000-0000-4000-8000-000000000011', 'Owner One'),
  ('00000000-0000-4000-8000-000000000012', 'Owner Two');
set session_replication_role = origin;

insert into public.memberships (id, organization_id, profile_id)
values
  (
    '00000000-0000-4000-8000-000000000021',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011'
  ),
  (
    '00000000-0000-4000-8000-000000000022',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000012'
  );

insert into public.roles (id, organization_id, key, name)
values
  (
    '00000000-0000-4000-8000-000000000031',
    '00000000-0000-4000-8000-000000000001',
    'owner',
    'Owner'
  ),
  (
    '00000000-0000-4000-8000-000000000032',
    '00000000-0000-4000-8000-000000000002',
    'owner',
    'Owner'
  );

select throws_ok(
  $sql$
    insert into public.membership_role_grants (
      organization_id, membership_id, role_id
    ) values (
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000021',
      '00000000-0000-4000-8000-000000000032'
    )
  $sql$,
  '23503',
  null,
  'cross-tenant role assignment is rejected'
);

insert into public.content_items (
  id, organization_id, title, created_by_membership_id
) values (
  '00000000-0000-4000-8000-000000000041',
  '00000000-0000-4000-8000-000000000001',
  'Test reflection',
  '00000000-0000-4000-8000-000000000021'
);

select throws_ok(
  $sql$
    insert into public.content_briefs (
      organization_id, content_item_id, payload, payload_hash,
      created_by_membership_id
    ) values (
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000041',
      '{"schema_id":"strongr.audio_reflection_brief.v1"}'::jsonb,
      app_private.sha256_jsonb('{"schema_id":"strongr.audio_reflection_brief.v1"}'::jsonb),
      '00000000-0000-4000-8000-000000000022'
    )
  $sql$,
  '23503',
  null,
  'cross-tenant content relationship is rejected'
);

insert into public.content_briefs (
  id, organization_id, content_item_id, payload, payload_hash,
  created_by_membership_id
) values (
  '00000000-0000-4000-8000-000000000042',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000041',
  '{"schema_id":"strongr.audio_reflection_brief.v1"}'::jsonb,
  app_private.sha256_jsonb('{"schema_id":"strongr.audio_reflection_brief.v1"}'::jsonb),
  '00000000-0000-4000-8000-000000000021'
);

insert into public.content_versions (
  id, organization_id, content_item_id, brief_id, version_number,
  payload, payload_hash, source, created_by_membership_id
) values (
  '00000000-0000-4000-8000-000000000043',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000041',
  '00000000-0000-4000-8000-000000000042',
  1,
  '{"script":"original"}'::jsonb,
  repeat('b', 64),
  'manual',
  '00000000-0000-4000-8000-000000000021'
);

select throws_ok(
  $sql$
    update public.content_versions
    set payload = '{"script":"changed"}'::jsonb
    where id = '00000000-0000-4000-8000-000000000043'
  $sql$,
  '55000',
  'content version payload is immutable',
  'content payload cannot be altered in place'
);

update public.content_versions
set state = 'submitted', submitted_at = now()
where id = '00000000-0000-4000-8000-000000000043';

select throws_ok(
  $sql$
    update public.content_versions
    set state = 'draft', submitted_at = null
    where id = '00000000-0000-4000-8000-000000000043'
  $sql$,
  '55000',
  'illegal content version transition',
  'submitted content cannot return to draft'
);

insert into public.audit_events (
  id, organization_id, actor_profile_id, actor_membership_id, action,
  target_type, target_id, reason_code, correlation_id, source_channel
) values (
  '00000000-0000-4000-8000-000000000051',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000021',
  'test.event_recorded',
  'test',
  '00000000-0000-4000-8000-000000000043',
  'test',
  '00000000-0000-4000-8000-000000000052',
  'system'
);

select throws_ok(
  $sql$
    update public.audit_events
    set reason_code = 'changed'
    where id = '00000000-0000-4000-8000-000000000051'
  $sql$,
  '55000',
  'audit_events is append-only',
  'audit evidence is append-only'
);

select throws_ok(
  $$update public.permissions set name = 'Changed' where key = 'content.create'$$,
  '55000',
  'permissions is append-only',
  'permission definitions are append-only'
);

select ok(
  (
    select count(*) >= 18
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and c.contype = 'f'
      and cardinality(c.conkey) >= 2
  ),
  'tenant children use composite foreign keys'
);

select ok(
  (
    select count(*) = 3
    from public.review_policy_lanes
    where lane in ('scripture', 'theology', 'editorial')
  ) or not exists (select 1 from public.review_policies),
  'review policy lane contract is exact when policies exist'
);

select ok(
  (
    select count(*) = 8
    from public.check_definitions
  ),
  'the approved M1 automated check registry is seeded'
);

select * from finish();
rollback;
