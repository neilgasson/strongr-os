begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

select plan(29);

select has_table(
  'public', 'strongr_daily_native_content_v1',
  'the standalone Strongr Daily Native delivery contract exists'
);

select is(
  (
    select array_agg(column_name::text order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'strongr_daily_native_content_v1'
  ),
  array[
    'public_content_id', 'title', 'subtitle', 'description', 'duration_seconds',
    'content_type', 'artwork_ref', 'audio_asset_ref', 'delivery_state', 'sort_order'
  ]::text[],
  'the delivery contract exposes only the approved customer-safe columns'
);

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'strongr_daily_native_content_v1'
  ),
  'the delivery contract has forced RLS'
);

select ok(
  not has_table_privilege('anon', 'public.strongr_daily_native_content_v1', 'select'),
  'anon cannot read the delivery contract'
);
select ok(
  has_table_privilege('authenticated', 'public.strongr_daily_native_content_v1', 'select'),
  'authenticated has only the candidate read grant that RLS restricts'
);
select ok(
  not has_table_privilege('authenticated', 'public.strongr_daily_native_content_v1', 'insert')
    and not has_table_privilege('authenticated', 'public.strongr_daily_native_content_v1', 'update')
    and not has_table_privilege('authenticated', 'public.strongr_daily_native_content_v1', 'delete'),
  'the native client has no delivery-table mutation grant'
);
select is(
  (
    select count(*)
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname like 'strongr_daily_native%'
  ),
  0::bigint,
  'the delivery contract adds no client-callable RPC'
);
select policy_roles_are(
  'public', 'strongr_daily_native_content_v1',
  'strongr_daily_native_content_v1_development_reader_select',
  array['authenticated']::name[],
  'only authenticated is named by the delivery SELECT policy'
);
select policy_cmd_is(
  'public', 'strongr_daily_native_content_v1',
  'strongr_daily_native_content_v1_development_reader_select',
  'SELECT',
  'the delivery policy is SELECT-only'
);
select ok(
  (
    select lower(qual) like '%select auth.jwt%'
      and qual like '%app_metadata%'
      and qual like '%strongr_daily_development_reader%'
      and qual not like '%user_metadata%'
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'strongr_daily_native_content_v1'
      and policyname = 'strongr_daily_native_content_v1_development_reader_select'
  ),
  'only the server-controlled app metadata claim can authorize a reader'
);

insert into public.strongr_daily_native_content_v1 (
  public_content_id, title, subtitle, description, duration_seconds, content_type,
  artwork_ref, audio_asset_ref, delivery_state, sort_order
) values
  (
    '40000000-0000-4000-8000-000000000001', 'Quiet Trust', 'Development audio check',
    'Customer-safe development metadata only.', 12, 'guided_audio_reflection', null,
    '40000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000011.wav',
    'development_safe', 10
  ),
  (
    '40000000-0000-4000-8000-000000000002', 'Published fixture', null,
    'Customer-safe published metadata.', 12, 'guided_audio_reflection', null, null,
    'published', 20
  ),
  (
    '40000000-0000-4000-8000-000000000003', 'Revoked fixture', null,
    'Never customer-readable.', 12, 'guided_audio_reflection', null,
    '40000000-0000-4000-8000-000000000003/40000000-0000-4000-8000-000000000013.wav',
    'revoked', 30
  );

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is(
  (select count(*) from public.strongr_daily_native_content_v1),
  0::bigint,
  'anonymous callers receive no delivery rows'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000101","role":"authenticated","app_metadata":{}}',
  true
);
set local role authenticated;
select is(
  (select count(*) from public.strongr_daily_native_content_v1),
  0::bigint,
  'ordinary authenticated users remain denied'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000106","role":"authenticated","app_metadata":{"strongr_daily_development_reader":false}}',
  true
);
set local role authenticated;
select is(
  (select count(*) from public.strongr_daily_native_content_v1),
  0::bigint,
  'a false development-reader claim remains denied'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000102","role":"authenticated","user_metadata":{"strongr_daily_development_reader":true},"app_metadata":{}}',
  true
);
set local role authenticated;
select is(
  (select count(*) from public.strongr_daily_native_content_v1),
  0::bigint,
  'client-editable user metadata cannot grant development-reader access'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000103","role":"authenticated","app_metadata":{"strongr_daily_development_reader":"true"}}',
  true
);
set local role authenticated;
select is(
  (select count(*) from public.strongr_daily_native_content_v1),
  0::bigint,
  'an incorrectly typed development-reader claim remains denied'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000107","role":"authenticated","app_metadata":{"strongr_daily_development_reader":{"unexpected":true}}}',
  true
);
set local role authenticated;
select is(
  (select count(*) from public.strongr_daily_native_content_v1),
  0::bigint,
  'a malformed development-reader claim remains denied'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000104","role":"authenticated","is_anonymous":true,"app_metadata":{"strongr_daily_development_reader":true}}',
  true
);
set local role authenticated;
select is(
  (select count(*) from public.strongr_daily_native_content_v1),
  0::bigint,
  'anonymous authenticated sessions remain denied'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000105","role":"authenticated","is_anonymous":false,"app_metadata":{"strongr_daily_development_reader":true}}',
  true
);
set local role authenticated;
select is(
  (select count(*) from public.strongr_daily_native_content_v1),
  2::bigint,
  'a designated development reader receives only eligible rows'
);
select is(
  (
    select count(*)
    from public.strongr_daily_native_content_v1
    where delivery_state = 'revoked'
  ),
  0::bigint,
  'revoked delivery records fail closed'
);
select is(
  (select count(*) from public.production_packages),
  0::bigint,
  'the native reader claim does not grant access to internal governance packages'
);
reset role;

select throws_ok(
  $$
    insert into public.strongr_daily_native_content_v1 (
      public_content_id, title, description, duration_seconds, content_type,
      delivery_state, sort_order
    ) values (
      '40000000-0000-4000-8000-000000000009', 'Invalid', 'Invalid state test.',
      12, 'guided_audio_reflection', 'draft', 90
    )
  $$,
  '23514',
  'new row for relation "strongr_daily_native_content_v1" violates check constraint "strongr_daily_native_content_v1_delivery_state_check"',
  'unpublished or invalid delivery states cannot be inserted'
);

select policy_roles_are(
  'storage', 'objects',
  'strongr_daily_native_development_audio_exact_reader_select',
  array['authenticated']::name[],
  'only authenticated is named by the private audio policy'
);
select policy_cmd_is(
  'storage', 'objects',
  'strongr_daily_native_development_audio_exact_reader_select',
  'SELECT',
  'the private audio policy is SELECT-only'
);
select ok(
  (
    select lower(qual) like '%select auth.jwt%'
      and qual like '%strongr-daily-development-audio%'
      and qual like '%allow_any_operation%'
      and qual like '%object.get_authenticated%'
      and qual like '%audio_asset_ref%'
      and qual not like '%object.list%'
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'strongr_daily_native_development_audio_exact_reader_select'
  ),
  'audio access is exact-object download only; listing is absent'
);
select ok(
  exists (
    select 1
    from storage.buckets
    where id = 'strongr-daily-development-audio'
      and name = 'strongr-daily-development-audio'
      and public = false
      and file_size_limit = 26214400
      and allowed_mime_types = array['audio/wav']::text[]
  ),
  'the development audio bucket is private, WAV-only, and size-bounded'
);
select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'strongr_daily_native_development_audio%'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ),
  0::bigint,
  'the development audio boundary adds no upload, overwrite, delete, move, or copy policy'
);
select ok(
  not has_table_privilege('anon', 'public.production_packages', 'select'),
  'governance package records remain inaccessible to anon'
);
select ok(
  not has_table_privilege('authenticated', 'public.production_packages', 'insert')
    and not has_table_privilege('authenticated', 'public.production_packages', 'update')
    and not has_table_privilege('authenticated', 'public.production_packages', 'delete'),
  'the contract does not broaden governance package mutation access'
);
select ok(
  (select count(*) = 0 from public.strongr_daily_native_content_v1 where audio_asset_ref is null and delivery_state = 'revoked'),
  'the local fixture retains a non-null revoked audio reference for exact-retrieval denial tests'
);

select * from finish();
rollback;
