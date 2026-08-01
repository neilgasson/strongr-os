-- Strongr Daily Phase 4B.1: content-profile registry and exact provenance.
--
-- This migration creates an unpopulated private registry. It activates no
-- profile and authorizes no provider call. Existing rows remain valid with
-- NULL profile provenance, while every new Strongr Daily v2 brief and live
-- provider job must bind an exact registered profile. Provider execution is
-- allowed only while that exact profile is active.

begin;

create table app_private.strongr_daily_content_profiles (
  profile_id text not null
    check (
      length(profile_id) between 1 and 160
      and profile_id ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
    ),
  profile_version integer not null check (profile_version > 0),
  profile_checksum text not null
    check (profile_checksum ~ '^[a-f0-9]{64}$'),
  content_type text not null
    check (
      length(content_type) between 1 and 160
      and content_type ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
    ),
  source_manifest_checksum text not null
    check (source_manifest_checksum ~ '^[a-f0-9]{64}$'),
  brief_schema_id text not null
    check (
      length(brief_schema_id) between 1 and 255
      and brief_schema_id ~ '^[a-z][a-z0-9_.-]*$'
    ),
  response_schema_id text not null
    check (
      length(response_schema_id) between 1 and 255
      and response_schema_id ~ '^[a-z][a-z0-9_.-]*$'
    ),
  prompt_key text not null
    check (
      length(prompt_key) between 1 and 255
      and prompt_key ~ '^[a-z][a-z0-9_.-]*$'
    ),
  prompt_version integer not null check (prompt_version > 0),
  lifecycle_state text not null check (
    lifecycle_state in (
      'inventory_only',
      'source_required',
      'draft_unapproved',
      'owner_review',
      'owner_approved_inactive',
      'active',
      'superseded',
      'retired'
    )
  ),
  registered_at timestamptz not null default statement_timestamp(),
  primary key (profile_id, profile_version),
  unique (
    profile_id,
    profile_version,
    profile_checksum,
    content_type,
    source_manifest_checksum
  ),
  unique (prompt_key, prompt_version)
);

comment on table app_private.strongr_daily_content_profiles is
  'Private, versioned Strongr Daily content-profile registry. No profile is activated by the Phase 4B.1 migration.';

alter table app_private.strongr_daily_content_profiles enable row level security;

revoke all on table app_private.strongr_daily_content_profiles
from public, anon, authenticated, service_role;

create function app_private.m1_guard_content_profile_registry_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '55000',
      message = 'content profile registry records cannot be deleted';
  end if;

  if row(
       new.profile_id,
       new.profile_version,
       new.profile_checksum,
       new.content_type,
       new.source_manifest_checksum,
       new.brief_schema_id,
       new.response_schema_id,
       new.prompt_key,
       new.prompt_version,
       new.registered_at
     ) is distinct from row(
       old.profile_id,
       old.profile_version,
       old.profile_checksum,
       old.content_type,
       old.source_manifest_checksum,
       old.brief_schema_id,
       old.response_schema_id,
       old.prompt_key,
       old.prompt_version,
       old.registered_at
     ) then
    raise exception using
      errcode = '55000',
      message = 'content profile registry identity and contract are immutable';
  end if;

  if new.lifecycle_state = old.lifecycle_state then
    return new;
  end if;

  if not (
    (old.lifecycle_state = 'inventory_only'
      and new.lifecycle_state = 'source_required')
    or (old.lifecycle_state = 'source_required'
      and new.lifecycle_state = 'draft_unapproved')
    or (old.lifecycle_state = 'draft_unapproved'
      and new.lifecycle_state = 'owner_review')
    or (old.lifecycle_state = 'owner_review'
      and new.lifecycle_state = 'owner_approved_inactive')
    or (old.lifecycle_state = 'owner_approved_inactive'
      and new.lifecycle_state = 'active')
    or (old.lifecycle_state = 'active'
      and new.lifecycle_state = 'superseded')
    or (
      old.lifecycle_state <> 'retired'
      and new.lifecycle_state = 'retired'
    )
  ) then
    raise exception using
      errcode = '55000',
      message = 'content profile lifecycle transition is not allowed';
  end if;

  return new;
end;
$$;

create trigger strongr_daily_content_profiles_guard
before update or delete on app_private.strongr_daily_content_profiles
for each row execute function
  app_private.m1_guard_content_profile_registry_mutation();

revoke all on function
  app_private.m1_guard_content_profile_registry_mutation()
from public, anon, authenticated, service_role;

alter table public.content_briefs
  add column content_profile_id text,
  add column content_profile_version integer,
  add column content_profile_checksum text,
  add column content_profile_content_type text,
  add column content_profile_source_manifest_checksum text,
  add constraint content_briefs_profile_all_or_none check (
    num_nonnulls(
      content_profile_id,
      content_profile_version,
      content_profile_checksum,
      content_profile_content_type,
      content_profile_source_manifest_checksum
    ) in (0, 5)
  ),
  add constraint content_briefs_profile_version_check check (
    content_profile_version is null or content_profile_version > 0
  ),
  add constraint content_briefs_profile_checksum_check check (
    content_profile_checksum is null or content_profile_checksum ~ '^[a-f0-9]{64}$'
  ),
  add constraint content_briefs_profile_manifest_checksum_check check (
    content_profile_source_manifest_checksum is null
    or content_profile_source_manifest_checksum ~ '^[a-f0-9]{64}$'
  ),
  add constraint content_briefs_profile_registry_fk foreign key (
    content_profile_id,
    content_profile_version,
    content_profile_checksum,
    content_profile_content_type,
    content_profile_source_manifest_checksum
  ) references app_private.strongr_daily_content_profiles (
    profile_id,
    profile_version,
    profile_checksum,
    content_type,
    source_manifest_checksum
  ) on delete restrict;

alter table public.generation_jobs
  add column content_profile_id text,
  add column content_profile_version integer,
  add column content_profile_checksum text,
  add column content_profile_content_type text,
  add column content_profile_source_manifest_checksum text,
  add constraint generation_jobs_profile_all_or_none check (
    num_nonnulls(
      content_profile_id,
      content_profile_version,
      content_profile_checksum,
      content_profile_content_type,
      content_profile_source_manifest_checksum
    ) in (0, 5)
  ),
  add constraint generation_jobs_profile_version_check check (
    content_profile_version is null or content_profile_version > 0
  ),
  add constraint generation_jobs_profile_checksum_check check (
    content_profile_checksum is null or content_profile_checksum ~ '^[a-f0-9]{64}$'
  ),
  add constraint generation_jobs_profile_manifest_checksum_check check (
    content_profile_source_manifest_checksum is null
    or content_profile_source_manifest_checksum ~ '^[a-f0-9]{64}$'
  ),
  add constraint generation_jobs_profile_registry_fk foreign key (
    content_profile_id,
    content_profile_version,
    content_profile_checksum,
    content_profile_content_type,
    content_profile_source_manifest_checksum
  ) references app_private.strongr_daily_content_profiles (
    profile_id,
    profile_version,
    profile_checksum,
    content_type,
    source_manifest_checksum
  ) on delete restrict;

alter table public.content_versions
  add column content_profile_id text,
  add column content_profile_version integer,
  add column content_profile_checksum text,
  add column content_profile_content_type text,
  add column content_profile_source_manifest_checksum text,
  add constraint content_versions_profile_all_or_none check (
    num_nonnulls(
      content_profile_id,
      content_profile_version,
      content_profile_checksum,
      content_profile_content_type,
      content_profile_source_manifest_checksum
    ) in (0, 5)
  ),
  add constraint content_versions_profile_version_check check (
    content_profile_version is null or content_profile_version > 0
  ),
  add constraint content_versions_profile_checksum_check check (
    content_profile_checksum is null or content_profile_checksum ~ '^[a-f0-9]{64}$'
  ),
  add constraint content_versions_profile_manifest_checksum_check check (
    content_profile_source_manifest_checksum is null
    or content_profile_source_manifest_checksum ~ '^[a-f0-9]{64}$'
  ),
  add constraint content_versions_profile_registry_fk foreign key (
    content_profile_id,
    content_profile_version,
    content_profile_checksum,
    content_profile_content_type,
    content_profile_source_manifest_checksum
  ) references app_private.strongr_daily_content_profiles (
    profile_id,
    profile_version,
    profile_checksum,
    content_type,
    source_manifest_checksum
  ) on delete restrict;

alter table public.production_packages
  add column content_profile_id text,
  add column content_profile_version integer,
  add column content_profile_checksum text,
  add column content_profile_content_type text,
  add column content_profile_source_manifest_checksum text,
  add constraint production_packages_profile_all_or_none check (
    num_nonnulls(
      content_profile_id,
      content_profile_version,
      content_profile_checksum,
      content_profile_content_type,
      content_profile_source_manifest_checksum
    ) in (0, 5)
  ),
  add constraint production_packages_profile_version_check check (
    content_profile_version is null or content_profile_version > 0
  ),
  add constraint production_packages_profile_checksum_check check (
    content_profile_checksum is null or content_profile_checksum ~ '^[a-f0-9]{64}$'
  ),
  add constraint production_packages_profile_manifest_checksum_check check (
    content_profile_source_manifest_checksum is null
    or content_profile_source_manifest_checksum ~ '^[a-f0-9]{64}$'
  ),
  add constraint production_packages_profile_registry_fk foreign key (
    content_profile_id,
    content_profile_version,
    content_profile_checksum,
    content_profile_content_type,
    content_profile_source_manifest_checksum
  ) references app_private.strongr_daily_content_profiles (
    profile_id,
    profile_version,
    profile_checksum,
    content_type,
    source_manifest_checksum
  ) on delete restrict;

create function app_private.m1_require_content_profile(
  p_profile_id text,
  p_profile_version integer,
  p_profile_checksum text,
  p_content_type text,
  p_source_manifest_checksum text,
  p_require_active boolean default false
)
returns app_private.strongr_daily_content_profiles
language plpgsql
security definer
set search_path = pg_catalog, app_private
as $$
declare
  v_profile app_private.strongr_daily_content_profiles%rowtype;
begin
  select p.* into v_profile
  from app_private.strongr_daily_content_profiles as p
  where p.profile_id = p_profile_id
    and p.profile_version = p_profile_version
    and p.profile_checksum = p_profile_checksum
    and p.content_type = p_content_type
    and p.source_manifest_checksum = p_source_manifest_checksum;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'content profile selection is invalid';
  end if;
  if p_require_active and v_profile.lifecycle_state <> 'active' then
    raise exception using
      errcode = '55000',
      message = 'content profile is not active';
  end if;

  return v_profile;
end;
$$;

revoke all on function app_private.m1_require_content_profile(
  text, integer, text, text, text, boolean
) from public, anon, authenticated, service_role;

create function app_private.m1_bind_content_brief_profile()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_selection jsonb;
  v_profile app_private.strongr_daily_content_profiles%rowtype;
  v_profile_version integer;
begin
  v_selection := new.payload -> 'content_profile';

  if v_selection is null then
    if new.payload ->> 'schema_id'
       = 'strongr.strongr_daily_audio_reflection_brief.v2' then
      raise exception using
        errcode = '22023',
        message = 'content profile selection is required';
    end if;
    return new;
  end if;

  if jsonb_typeof(v_selection) <> 'object'
     or (select count(*) from jsonb_object_keys(v_selection)) <> 4
     or not v_selection ?& array[
       'profile_id',
       'profile_version',
       'canonical_checksum',
       'content_type'
     ]
     or jsonb_typeof(v_selection -> 'profile_id') <> 'string'
     or jsonb_typeof(v_selection -> 'profile_version') <> 'number'
     or jsonb_typeof(v_selection -> 'canonical_checksum') <> 'string'
     or jsonb_typeof(v_selection -> 'content_type') <> 'string'
     or (v_selection ->> 'profile_version') !~ '^[1-9][0-9]*$' then
    raise exception using
      errcode = '22023',
      message = 'content profile selection is invalid';
  end if;

  v_profile_version := (v_selection ->> 'profile_version')::integer;
  select p.* into v_profile
  from app_private.strongr_daily_content_profiles as p
  where p.profile_id = v_selection ->> 'profile_id'
    and p.profile_version = v_profile_version
    and p.profile_checksum = v_selection ->> 'canonical_checksum'
    and p.content_type = v_selection ->> 'content_type';

  if not found then
    raise exception using
      errcode = '22023',
      message = 'content profile selection is invalid';
  end if;
  if v_profile.content_type is distinct from new.payload ->> 'content_type'
     or v_profile.brief_schema_id is distinct from new.payload ->> 'schema_id' then
    raise exception using
      errcode = '22023',
      message = 'content profile does not match brief contract';
  end if;
  if num_nonnulls(
       new.content_profile_id,
       new.content_profile_version,
       new.content_profile_checksum,
       new.content_profile_content_type,
       new.content_profile_source_manifest_checksum
     ) <> 0
     and row(
       new.content_profile_id,
       new.content_profile_version,
       new.content_profile_checksum,
       new.content_profile_content_type,
       new.content_profile_source_manifest_checksum
     ) is distinct from row(
       v_profile.profile_id,
       v_profile.profile_version,
       v_profile.profile_checksum,
       v_profile.content_type,
       v_profile.source_manifest_checksum
     ) then
    raise exception using
      errcode = '22023',
      message = 'content profile provenance mismatch';
  end if;

  new.content_profile_id := v_profile.profile_id;
  new.content_profile_version := v_profile.profile_version;
  new.content_profile_checksum := v_profile.profile_checksum;
  new.content_profile_content_type := v_profile.content_type;
  new.content_profile_source_manifest_checksum := v_profile.source_manifest_checksum;
  return new;
end;
$$;

create trigger m1_bind_content_brief_profile
before insert on public.content_briefs
for each row execute function app_private.m1_bind_content_brief_profile();

revoke all on function app_private.m1_bind_content_brief_profile()
from public, anon, authenticated, service_role;

create function app_private.m1_bind_content_version_profile()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_brief public.content_briefs%rowtype;
  v_job public.generation_jobs%rowtype;
  v_profile app_private.strongr_daily_content_profiles%rowtype;
begin
  select b.* into v_brief
  from public.content_briefs as b
  where b.id = new.brief_id
    and b.organization_id = new.organization_id;

  if not found then
    raise exception using errcode = '23503', message = 'generation brief not found';
  end if;

  if v_brief.content_profile_id is not null then
    v_profile := app_private.m1_require_content_profile(
      v_brief.content_profile_id,
      v_brief.content_profile_version,
      v_brief.content_profile_checksum,
      v_brief.content_profile_content_type,
      v_brief.content_profile_source_manifest_checksum,
      false
    );
    if new.schema_id is distinct from v_profile.response_schema_id then
      raise exception using
        errcode = '22023',
        message = 'content version does not match profile response contract';
    end if;
    if new.payload -> 'content_profile' is distinct from jsonb_build_object(
         'profile_id', v_brief.content_profile_id,
         'profile_version', v_brief.content_profile_version,
         'canonical_checksum', v_brief.content_profile_checksum,
         'content_type', v_brief.content_profile_content_type
       ) then
      raise exception using
        errcode = '22023',
        message = 'generation result does not match content profile provenance';
    end if;
  elsif new.payload ? 'content_profile' then
    raise exception using
      errcode = '22023',
      message = 'legacy content version cannot assert content profile provenance';
  end if;

  if new.source = 'ai_assisted' then
    select j.* into v_job
    from public.generation_jobs as j
    where j.id = new.source_job_id
      and j.organization_id = new.organization_id
      and j.brief_id = new.brief_id;

    if not found
       or row(
         v_job.content_profile_id,
         v_job.content_profile_version,
         v_job.content_profile_checksum,
         v_job.content_profile_content_type,
         v_job.content_profile_source_manifest_checksum
       ) is distinct from row(
         v_brief.content_profile_id,
         v_brief.content_profile_version,
         v_brief.content_profile_checksum,
         v_brief.content_profile_content_type,
         v_brief.content_profile_source_manifest_checksum
       ) then
      raise exception using
        errcode = '22023',
        message = 'generation profile provenance mismatch';
    end if;
  end if;

  if num_nonnulls(
       new.content_profile_id,
       new.content_profile_version,
       new.content_profile_checksum,
       new.content_profile_content_type,
       new.content_profile_source_manifest_checksum
     ) <> 0
     and row(
       new.content_profile_id,
       new.content_profile_version,
       new.content_profile_checksum,
       new.content_profile_content_type,
       new.content_profile_source_manifest_checksum
     ) is distinct from row(
       v_brief.content_profile_id,
       v_brief.content_profile_version,
       v_brief.content_profile_checksum,
       v_brief.content_profile_content_type,
       v_brief.content_profile_source_manifest_checksum
     ) then
    raise exception using
      errcode = '22023',
      message = 'content version profile provenance mismatch';
  end if;

  new.content_profile_id := v_brief.content_profile_id;
  new.content_profile_version := v_brief.content_profile_version;
  new.content_profile_checksum := v_brief.content_profile_checksum;
  new.content_profile_content_type := v_brief.content_profile_content_type;
  new.content_profile_source_manifest_checksum :=
    v_brief.content_profile_source_manifest_checksum;
  return new;
end;
$$;

create trigger m1_bind_content_version_profile
before insert on public.content_versions
for each row execute function app_private.m1_bind_content_version_profile();

revoke all on function app_private.m1_bind_content_version_profile()
from public, anon, authenticated, service_role;

create function app_private.m1_bind_production_package_profile()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_version public.content_versions%rowtype;
begin
  select v.* into v_version
  from public.approval_snapshots as a
  join public.content_versions as v
    on v.id = a.content_version_id
   and v.organization_id = a.organization_id
  where a.id = new.approval_snapshot_id
    and a.organization_id = new.organization_id;

  if not found then
    raise exception using errcode = '23503', message = 'approved content version not found';
  end if;

  if num_nonnulls(
       new.content_profile_id,
       new.content_profile_version,
       new.content_profile_checksum,
       new.content_profile_content_type,
       new.content_profile_source_manifest_checksum
     ) <> 0
     and row(
       new.content_profile_id,
       new.content_profile_version,
       new.content_profile_checksum,
       new.content_profile_content_type,
       new.content_profile_source_manifest_checksum
     ) is distinct from row(
       v_version.content_profile_id,
       v_version.content_profile_version,
       v_version.content_profile_checksum,
       v_version.content_profile_content_type,
       v_version.content_profile_source_manifest_checksum
     ) then
    raise exception using
      errcode = '22023',
      message = 'production package profile provenance mismatch';
  end if;

  new.content_profile_id := v_version.content_profile_id;
  new.content_profile_version := v_version.content_profile_version;
  new.content_profile_checksum := v_version.content_profile_checksum;
  new.content_profile_content_type := v_version.content_profile_content_type;
  new.content_profile_source_manifest_checksum :=
    v_version.content_profile_source_manifest_checksum;

  if v_version.content_profile_id is null then
    new.manifest := new.manifest
      - 'content_profile'
      - 'content_profile_source_manifest_checksum';
  else
    new.manifest := new.manifest || jsonb_build_object(
      'content_profile', jsonb_build_object(
        'profile_id', v_version.content_profile_id,
        'profile_version', v_version.content_profile_version,
        'canonical_checksum', v_version.content_profile_checksum,
        'content_type', v_version.content_profile_content_type
      ),
      'content_profile_source_manifest_checksum',
      v_version.content_profile_source_manifest_checksum
    );
  end if;
  new.manifest_hash := app_private.sha256_jsonb(new.manifest);
  return new;
end;
$$;

create trigger m1_bind_production_package_profile
before insert on public.production_packages
for each row execute function app_private.m1_bind_production_package_profile();

revoke all on function app_private.m1_bind_production_package_profile()
from public, anon, authenticated, service_role;

create function app_private.m1_guard_content_profile_provenance_update()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if row(
       new.content_profile_id,
       new.content_profile_version,
       new.content_profile_checksum,
       new.content_profile_content_type,
       new.content_profile_source_manifest_checksum
     ) is distinct from row(
       old.content_profile_id,
       old.content_profile_version,
       old.content_profile_checksum,
       old.content_profile_content_type,
       old.content_profile_source_manifest_checksum
     ) then
    raise exception using
      errcode = '55000',
      message = 'content profile provenance is immutable';
  end if;
  return new;
end;
$$;

create trigger content_briefs_profile_immutable
before update on public.content_briefs
for each row execute function app_private.m1_guard_content_profile_provenance_update();

create trigger generation_jobs_profile_immutable
before update on public.generation_jobs
for each row execute function app_private.m1_guard_content_profile_provenance_update();

create trigger content_versions_profile_immutable
before update on public.content_versions
for each row execute function app_private.m1_guard_content_profile_provenance_update();

create trigger production_packages_profile_immutable
before update on public.production_packages
for each row execute function app_private.m1_guard_content_profile_provenance_update();

revoke all on function app_private.m1_guard_content_profile_provenance_update()
from public, anon, authenticated, service_role;

create or replace function public.m1_request_generation(
  p_organization_id uuid,
  p_brief_id uuid,
  p_prompt_key text,
  p_prompt_version integer,
  p_idempotency_key text,
  p_correlation_id uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor uuid;
  v_job_id uuid;
  v_brief public.content_briefs%rowtype;
  v_profile app_private.strongr_daily_content_profiles%rowtype;
  v_existing public.generation_jobs%rowtype;
  v_request_fingerprint text;
begin
  v_actor := app_private.require_permission(p_organization_id, 'content.create');

  select b.* into v_brief
  from public.content_briefs as b
  where b.id = p_brief_id
    and b.organization_id = p_organization_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'brief not found';
  end if;

  if v_brief.content_profile_id is not null then
    v_profile := app_private.m1_require_content_profile(
      v_brief.content_profile_id,
      v_brief.content_profile_version,
      v_brief.content_profile_checksum,
      v_brief.content_profile_content_type,
      v_brief.content_profile_source_manifest_checksum,
      true
    );
    if v_profile.prompt_key <> p_prompt_key
       or v_profile.prompt_version <> p_prompt_version
       or v_profile.brief_schema_id <> v_brief.schema_id
       or (
         v_brief.schema_id =
           'strongr.strongr_daily_audio_reflection_brief.v2'
         and v_profile.response_schema_id <>
           'strongr.strongr_daily_audio_reflection.v2'
       ) then
      raise exception using
        errcode = '22023',
        message = 'content profile does not match generation contract';
    end if;
  elsif p_prompt_key = 'strongr.strongr_daily.v2' then
    raise exception using
      errcode = '55000',
      message = 'active content profile is required for provider generation';
  end if;

  v_request_fingerprint := app_private.sha256_jsonb(jsonb_build_object(
    'brief_id', p_brief_id,
    'brief_payload_hash', v_brief.payload_hash,
    'prompt_key', p_prompt_key,
    'prompt_version', p_prompt_version
  ));

  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':' || p_idempotency_key, 0)
  );
  select j.* into v_existing
  from public.generation_jobs as j
  where j.organization_id = p_organization_id
    and j.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.input_hash <> v_request_fingerprint
       or row(
         v_existing.content_profile_id,
         v_existing.content_profile_version,
         v_existing.content_profile_checksum,
         v_existing.content_profile_content_type,
         v_existing.content_profile_source_manifest_checksum
       ) is distinct from row(
         v_brief.content_profile_id,
         v_brief.content_profile_version,
         v_brief.content_profile_checksum,
         v_brief.content_profile_content_type,
         v_brief.content_profile_source_manifest_checksum
       ) then
      raise exception using
        errcode = '22023',
        message = 'idempotency key reused with different request';
    end if;
    return v_existing.id;
  end if;

  insert into public.generation_jobs (
    organization_id,
    brief_id,
    requested_by_membership_id,
    prompt_key,
    prompt_version,
    idempotency_key,
    input_hash,
    correlation_id,
    content_profile_id,
    content_profile_version,
    content_profile_checksum,
    content_profile_content_type,
    content_profile_source_manifest_checksum
  ) values (
    p_organization_id,
    p_brief_id,
    v_actor,
    p_prompt_key,
    p_prompt_version,
    p_idempotency_key,
    v_request_fingerprint,
    p_correlation_id,
    v_brief.content_profile_id,
    v_brief.content_profile_version,
    v_brief.content_profile_checksum,
    v_brief.content_profile_content_type,
    v_brief.content_profile_source_manifest_checksum
  ) returning id into v_job_id;

  insert into public.outbox_events (
    organization_id,
    event_type,
    aggregate_type,
    aggregate_id,
    payload,
    correlation_id
  ) values (
    p_organization_id,
    'content.generation_requested.v1',
    'generation_job',
    v_job_id,
    jsonb_strip_nulls(jsonb_build_object(
      'job_id', v_job_id,
      'content_profile', case
        when v_brief.content_profile_id is null then null
        else jsonb_build_object(
          'profile_id', v_brief.content_profile_id,
          'profile_version', v_brief.content_profile_version,
          'canonical_checksum', v_brief.content_profile_checksum,
          'content_type', v_brief.content_profile_content_type
        )
      end,
      'content_profile_source_manifest_checksum',
      v_brief.content_profile_source_manifest_checksum
    )),
    p_correlation_id
  );
  return v_job_id;
end;
$$;

revoke all on function public.m1_request_generation(
  uuid, uuid, text, integer, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.m1_request_generation(
  uuid, uuid, text, integer, text, uuid
) to authenticated;

create function app_private.m1_content_profile_selection_json(
  p_job public.generation_jobs
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select case
    when p_job.content_profile_id is null then null
    else jsonb_build_object(
      'profile_id', p_job.content_profile_id,
      'profile_version', p_job.content_profile_version,
      'canonical_checksum', p_job.content_profile_checksum,
      'content_type', p_job.content_profile_content_type
    )
  end;
$$;

revoke all on function app_private.m1_content_profile_selection_json(
  public.generation_jobs
) from public, anon, authenticated, service_role;

-- Extend the accepted worker lease with the exact profile selection while
-- preserving the accepted begin-attempt behavior byte-for-byte otherwise.
-- The guarded transformation refuses to run if the installed function no
-- longer matches the reviewed return shape.
do $$
declare
  v_definition text;
  v_return_count integer;
begin
  v_definition := pg_get_functiondef(
    'public.m1_begin_generation_attempt(uuid,text,uuid,text,text)'::regprocedure
  );
  v_return_count := (
    length(v_definition)
    - length(replace(v_definition, 'v_job.max_attempts;', ''))
  ) / length('v_job.max_attempts;');

  if v_return_count <> 6
     or v_definition !~* 'max_attempts\s+integer\s*\)\s*LANGUAGE' then
    raise exception
      'Phase 4B.1 refused: begin-attempt return shape changed';
  end if;

  v_definition := regexp_replace(
    v_definition,
    '(max_attempts\s+integer)(\s*\)\s*LANGUAGE)',
    '\1, content_profile jsonb, content_profile_source_manifest_checksum text\2',
    'i'
  );
  v_definition := replace(
    v_definition,
    'v_job.max_attempts;',
    'v_job.max_attempts, app_private.m1_content_profile_selection_json(v_job), v_job.content_profile_source_manifest_checksum;'
  );

  execute 'drop function public.m1_begin_generation_attempt(uuid,text,uuid,text,text)';
  execute v_definition;
end;
$$;

revoke all on function public.m1_begin_generation_attempt(
  uuid, text, uuid, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.m1_begin_generation_attempt(
  uuid, text, uuid, text, text
) to service_role;

create or replace function app_private.m1_require_generation_event_lease(
  p_event_id uuid,
  p_worker_id text,
  p_lease_token uuid
)
returns public.outbox_events
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_event public.outbox_events%rowtype;
  v_job public.generation_jobs%rowtype;
  v_brief public.content_briefs%rowtype;
  v_profile app_private.strongr_daily_content_profiles%rowtype;
begin
  if length(btrim(p_worker_id)) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'invalid worker id';
  end if;

  select * into v_event
  from public.outbox_events
  where id = p_event_id
  for update;

  if not found then
    raise exception using errcode = 'P0002',
      message = 'generation outbox event not found';
  end if;
  if v_event.event_type <> 'content.generation_requested.v1'
     or v_event.event_version <> 1
     or v_event.aggregate_type <> 'generation_job'
     or v_event.payload ->> 'job_id' <> v_event.aggregate_id::text then
    raise exception using errcode = '22023',
      message = 'invalid generation outbox event';
  end if;
  if v_event.status <> 'processing'
     or v_event.lease_owner <> p_worker_id
     or v_event.lease_token <> p_lease_token
     or v_event.lease_expires_at <= statement_timestamp() then
    raise exception using errcode = '55000',
      message = 'generation outbox lease is not owned';
  end if;

  select j.* into v_job
  from public.generation_jobs as j
  where j.id = v_event.aggregate_id
    and j.organization_id = v_event.organization_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'generation job not found';
  end if;

  select b.* into v_brief
  from public.content_briefs as b
  where b.id = v_job.brief_id
    and b.organization_id = v_job.organization_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'generation brief not found';
  end if;

  if v_job.content_profile_id is not null then
    if row(
         v_job.content_profile_id,
         v_job.content_profile_version,
         v_job.content_profile_checksum,
         v_job.content_profile_content_type,
         v_job.content_profile_source_manifest_checksum
       ) is distinct from row(
         v_brief.content_profile_id,
         v_brief.content_profile_version,
         v_brief.content_profile_checksum,
         v_brief.content_profile_content_type,
         v_brief.content_profile_source_manifest_checksum
       )
       or v_event.payload -> 'content_profile' is distinct from jsonb_build_object(
         'profile_id', v_job.content_profile_id,
         'profile_version', v_job.content_profile_version,
         'canonical_checksum', v_job.content_profile_checksum,
         'content_type', v_job.content_profile_content_type
       )
       or v_event.payload ->> 'content_profile_source_manifest_checksum'
          is distinct from v_job.content_profile_source_manifest_checksum then
      raise exception using
        errcode = '22023',
        message = 'generation profile provenance mismatch';
    end if;

    v_profile := app_private.m1_require_content_profile(
      v_job.content_profile_id,
      v_job.content_profile_version,
      v_job.content_profile_checksum,
      v_job.content_profile_content_type,
      v_job.content_profile_source_manifest_checksum,
      true
    );
    if v_profile.prompt_key <> v_job.prompt_key
       or v_profile.prompt_version <> v_job.prompt_version
       or v_profile.brief_schema_id <> v_brief.schema_id
       or (
         v_brief.schema_id =
           'strongr.strongr_daily_audio_reflection_brief.v2'
         and v_profile.response_schema_id <>
           'strongr.strongr_daily_audio_reflection.v2'
       ) then
      raise exception using
        errcode = '22023',
        message = 'content profile does not match generation contract';
    end if;
  elsif v_job.prompt_key = 'strongr.strongr_daily.v2' then
    raise exception using
      errcode = '55000',
      message = 'active content profile is required for provider generation';
  end if;

  return v_event;
end;
$$;

revoke all on function app_private.m1_require_generation_event_lease(
  uuid, text, uuid
) from public, anon, authenticated, service_role;

create or replace function public.m1_claim_generation_event_by_job(
  p_generation_job_id uuid,
  p_worker_id text,
  p_lease_seconds integer default 60
)
returns table (
  event_id uuid,
  organization_id uuid,
  event_type text,
  event_version integer,
  aggregate_type text,
  aggregate_id uuid,
  payload jsonb,
  correlation_id uuid,
  causation_id uuid,
  attempt_number integer,
  lease_token uuid,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_event public.outbox_events%rowtype;
begin
  if p_generation_job_id is null then
    raise exception using errcode = '22023', message = 'invalid generation job id';
  end if;
  if length(btrim(p_worker_id)) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'invalid worker id';
  end if;
  if p_lease_seconds not between 1 and 3600 then
    raise exception using errcode = '22023', message = 'invalid lease duration';
  end if;

  perform app_private.touch_worker(p_worker_id, 'working');

  select e.* into v_event
  from public.outbox_events as e
  join public.generation_jobs as j
    on j.id = e.aggregate_id
   and j.organization_id = e.organization_id
  join public.content_briefs as b
    on b.id = j.brief_id
   and b.organization_id = j.organization_id
  join app_private.strongr_daily_content_profiles as p
    on p.profile_id = j.content_profile_id
   and p.profile_version = j.content_profile_version
   and p.profile_checksum = j.content_profile_checksum
   and p.content_type = j.content_profile_content_type
   and p.source_manifest_checksum = j.content_profile_source_manifest_checksum
  where j.id = p_generation_job_id
    and j.state = 'queued'
    and j.attempt_count = 0
    and j.prompt_key = 'strongr.strongr_daily.v2'
    and j.prompt_version = 1
    and p.lifecycle_state = 'active'
    and p.prompt_key = j.prompt_key
    and p.prompt_version = j.prompt_version
    and p.brief_schema_id = b.schema_id
    and p.response_schema_id =
      'strongr.strongr_daily_audio_reflection.v2'
    and row(
      j.content_profile_id,
      j.content_profile_version,
      j.content_profile_checksum,
      j.content_profile_content_type,
      j.content_profile_source_manifest_checksum
    ) = row(
      b.content_profile_id,
      b.content_profile_version,
      b.content_profile_checksum,
      b.content_profile_content_type,
      b.content_profile_source_manifest_checksum
    )
    and e.event_type = 'content.generation_requested.v1'
    and e.event_version = 1
    and e.aggregate_type = 'generation_job'
    and e.payload ->> 'job_id' = j.id::text
    and e.payload -> 'content_profile' = jsonb_build_object(
      'profile_id', j.content_profile_id,
      'profile_version', j.content_profile_version,
      'canonical_checksum', j.content_profile_checksum,
      'content_type', j.content_profile_content_type
    )
    and e.payload ->> 'content_profile_source_manifest_checksum'
      = j.content_profile_source_manifest_checksum
    and e.status = 'pending'
    and e.attempts = 0
    and e.available_at <= statement_timestamp()
  order by e.available_at, e.created_at, e.id
  for update of e, j skip locked
  limit 1;

  if not found then
    return;
  end if;

  update public.generation_jobs as j
  set max_attempts = 1
  where j.id = v_event.aggregate_id
    and j.organization_id = v_event.organization_id
    and j.state = 'queued'
    and j.attempt_count = 0;

  if not found then
    raise exception using errcode = '55000',
      message = 'generation job is not claimable';
  end if;

  update public.outbox_events as e
  set status = 'processing',
      attempts = 1,
      lease_owner = p_worker_id,
      lease_token = gen_random_uuid(),
      lease_expires_at = statement_timestamp()
        + make_interval(secs => p_lease_seconds),
      last_attempt_at = statement_timestamp(),
      last_error_code = null
  where e.id = v_event.id
    and e.organization_id = v_event.organization_id
    and e.status = 'pending'
    and e.attempts = 0
  returning e.* into v_event;

  if not found then
    raise exception using errcode = '55000',
      message = 'generation event is not claimable';
  end if;

  insert into public.audit_events (
    organization_id,
    action,
    target_type,
    target_id,
    reason_code,
    correlation_id,
    source_channel
  ) values (
    v_event.organization_id,
    'generation.event_claimed',
    'outbox_event',
    v_event.id,
    'phase4b_exact_job_attempt',
    v_event.correlation_id,
    'worker'
  );

  return query select
    v_event.id,
    v_event.organization_id,
    v_event.event_type,
    v_event.event_version,
    v_event.aggregate_type,
    v_event.aggregate_id,
    v_event.payload,
    v_event.correlation_id,
    v_event.causation_id,
    v_event.attempts,
    v_event.lease_token,
    v_event.lease_expires_at;
end;
$$;

revoke all on function public.m1_claim_generation_event_by_job(
  uuid, text, integer
) from public, anon, authenticated, service_role;
grant execute on function public.m1_claim_generation_event_by_job(
  uuid, text, integer
) to service_role;

-- No profile rows are inserted here. Activation remains a separate, explicit
-- owner-governed change after source review and acceptance.
do $$
begin
  if exists (
    select 1
    from app_private.strongr_daily_content_profiles
    where lifecycle_state = 'active'
  ) then
    raise exception 'Phase 4B.1 must not activate a content profile';
  end if;
  if not (
    select c.relrowsecurity
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'app_private'
      and c.relname = 'strongr_daily_content_profiles'
  ) then
    raise exception 'Phase 4B.1 profile registry must have RLS enabled';
  end if;
  if has_table_privilege(
       'anon',
       'app_private.strongr_daily_content_profiles',
       'SELECT,INSERT,UPDATE,DELETE'
     )
     or has_table_privilege(
       'authenticated',
       'app_private.strongr_daily_content_profiles',
       'SELECT,INSERT,UPDATE,DELETE'
     )
     or has_table_privilege(
       'service_role',
       'app_private.strongr_daily_content_profiles',
       'SELECT,INSERT,UPDATE,DELETE'
     ) then
    raise exception 'Phase 4B.1 profile registry has an unsafe grant';
  end if;
  if has_function_privilege(
    'service_role',
    'public.m1_approve_version(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Phase 4B.1 must not grant provider approval authority';
  end if;
end;
$$;

commit;
