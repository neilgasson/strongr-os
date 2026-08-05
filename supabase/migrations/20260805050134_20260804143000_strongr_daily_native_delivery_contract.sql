-- Strongr OS
-- Development-only Strongr Daily Native customer delivery contract.
--
-- The hosted Supabase migration service recorded this exact reviewed SQL under
-- version 20260805050134 while preserving the original source migration name
-- below. PR #61 is unmerged, so this filename intentionally aligns the source
-- version/name pair with that immutable hosted evidence without deleting or
-- manually rewriting the migration ledger.
--
-- This is intentionally standalone. It has no foreign keys to Studio
-- governance, tenant, approval, rights, provider, or workflow records. Only
-- controlled server-side administration or later reviewed migrations may
-- populate it. Native clients receive SELECT only.

begin;

create table public.strongr_daily_native_content_v1 (
  public_content_id uuid primary key,
  title text not null check (length(btrim(title)) between 1 and 160),
  subtitle text check (subtitle is null or length(btrim(subtitle)) between 1 and 240),
  description text not null check (length(btrim(description)) between 1 and 4000),
  duration_seconds integer not null check (duration_seconds between 1 and 14400),
  content_type text not null check (
    content_type in (
      'guided_audio_reflection', 'audio_reflection', 'devotional',
      'guided_prayer', 'study', 'guided_journey', 'series', 'testimony',
      'scripture_reading'
    )
  ),
  artwork_ref text check (artwork_ref is null or length(btrim(artwork_ref)) between 1 and 512),
  audio_asset_ref text unique check (
    audio_asset_ref is null
    or audio_asset_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.wav$'
  ),
  delivery_state text not null check (delivery_state in ('development_safe', 'published', 'revoked')),
  sort_order integer not null check (sort_order between 0 and 2147483647)
);

alter table public.strongr_daily_native_content_v1 enable row level security;
alter table public.strongr_daily_native_content_v1 force row level security;

revoke all on public.strongr_daily_native_content_v1 from anon, authenticated;
grant select on public.strongr_daily_native_content_v1 to authenticated;

create policy strongr_daily_native_content_v1_development_reader_select
on public.strongr_daily_native_content_v1
for select to authenticated
using (
  auth.uid() is not null
  and coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'false'
  and coalesce(
    auth.jwt() -> 'app_metadata' -> 'strongr_daily_development_reader',
    'false'::jsonb
  ) = 'true'::jsonb
  and delivery_state in ('development_safe', 'published')
);

-- This policy deliberately does not touch strongr-os-media. It permits only
-- exact authenticated downloads for a current eligible delivery row. The
-- operation allowlist excludes object.list and every mutation operation.
create policy strongr_daily_native_development_audio_exact_reader_select
on storage.objects
for select to authenticated
using (
  bucket_id = 'strongr-daily-development-audio'
  and storage.allow_any_operation(array[
    'object.get_authenticated_info',
    'object.get_authenticated'
  ])
  and auth.uid() is not null
  and coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'false'
  and coalesce(
    auth.jwt() -> 'app_metadata' -> 'strongr_daily_development_reader',
    'false'::jsonb
  ) = 'true'::jsonb
  and exists (
    select 1
    from public.strongr_daily_native_content_v1 as delivery
    where delivery.audio_asset_ref = storage.objects.name
      and delivery.delivery_state in ('development_safe', 'published')
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'strongr_daily_native_content_v1'
      and relation.relrowsecurity
      and relation.relforcerowsecurity
  ) then
    raise exception 'Strongr Daily Native delivery table must retain forced RLS';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'strongr_daily_native_content_v1'
      and policyname = 'strongr_daily_native_content_v1_development_reader_select'
      and roles = array['authenticated']::name[]
      and cmd = 'SELECT'
      and qual like '%app_metadata%'
      and qual like '%strongr_daily_development_reader%'
      and qual like '%development_safe%'
      and qual not like '%user_metadata%'
  ) then
    raise exception 'Strongr Daily Native delivery RLS policy is invalid';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'strongr_daily_native_development_audio_exact_reader_select'
      and roles = array['authenticated']::name[]
      and cmd = 'SELECT'
      and qual like '%strongr-daily-development-audio%'
      and qual like '%allow_any_operation%'
      and qual like '%object.get_authenticated%'
      and qual like '%audio_asset_ref%'
      and qual not like '%object.list%'
  ) then
    raise exception 'Strongr Daily Native exact audio retrieval policy is invalid';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'strongr_daily_native_content_v1'
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
  ) then
    raise exception 'Strongr Daily Native client mutation grant found';
  end if;
end;
$$;

commit;
