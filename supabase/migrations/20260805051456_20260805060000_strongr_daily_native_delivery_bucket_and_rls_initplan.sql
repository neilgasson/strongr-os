-- Strongr OS
-- Development-only Strongr Daily Native hosted bucket and RLS performance fix.
--
-- The hosted Supabase migration service recorded this exact reviewed SQL under
-- version 20260805051456 while preserving the original source migration name
-- below. PR #61 is unmerged, so this filename aligns the source version/name
-- pair with that immutable hosted evidence without deleting or manually
-- rewriting the migration ledger.
--
-- This migration adds no content, object, client mutation, RPC, or access to
-- Strongr Studio governance. It leaves strongr-os-media untouched.

begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'strongr-daily-development-audio',
  'strongr-daily-development-audio',
  false,
  26214400,
  array['audio/wav']::text[]
)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from storage.buckets
    where id = 'strongr-daily-development-audio'
      and name = 'strongr-daily-development-audio'
      and public = false
      and file_size_limit = 26214400
      and allowed_mime_types = array['audio/wav']::text[]
  ) then
    raise exception 'Strongr Daily Native development audio bucket has unexpected properties';
  end if;
end;
$$;

drop policy strongr_daily_native_content_v1_development_reader_select
on public.strongr_daily_native_content_v1;

create policy strongr_daily_native_content_v1_development_reader_select
on public.strongr_daily_native_content_v1
for select to authenticated
using (
  (select auth.uid()) is not null
  and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false'
  and coalesce(
    (select auth.jwt()) -> 'app_metadata' -> 'strongr_daily_development_reader',
    'false'::jsonb
  ) = 'true'::jsonb
  and delivery_state in ('development_safe', 'published')
);

drop policy strongr_daily_native_development_audio_exact_reader_select
on storage.objects;

create policy strongr_daily_native_development_audio_exact_reader_select
on storage.objects
for select to authenticated
using (
  bucket_id = 'strongr-daily-development-audio'
  and storage.allow_any_operation(array[
    'object.get_authenticated_info',
    'object.get_authenticated'
  ])
  and (select auth.uid()) is not null
  and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false'
  and coalesce(
    (select auth.jwt()) -> 'app_metadata' -> 'strongr_daily_development_reader',
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
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'strongr_daily_native_content_v1'
      and policyname = 'strongr_daily_native_content_v1_development_reader_select'
      and roles = array['authenticated']::name[]
      and cmd = 'SELECT'
      and lower(qual) like '%select auth.jwt%'
      and qual like '%app_metadata%'
      and qual like '%strongr_daily_development_reader%'
      and qual not like '%user_metadata%'
  ) then
    raise exception 'Strongr Daily Native optimized delivery RLS policy is invalid';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'strongr_daily_native_development_audio_exact_reader_select'
      and roles = array['authenticated']::name[]
      and cmd = 'SELECT'
      and lower(qual) like '%select auth.jwt%'
      and qual like '%audio_asset_ref%'
      and qual not like '%object.list%'
  ) then
    raise exception 'Strongr Daily Native optimized storage RLS policy is invalid';
  end if;
end;
$$;

commit;
