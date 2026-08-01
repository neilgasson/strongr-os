-- Strongr Daily Phase 4B.5: one development-only provider-path attempt.
--
-- This is intentionally not a general profile activation. It records the
-- owner-approved profile as owner_approved_inactive, and permits one exact
-- AAL2-protected attempt whose output stays in a private quarantine record.
-- No generation job, content version, review, package, media, upload, or
-- publication record is created by this migration.

begin;

insert into app_private.strongr_daily_content_profiles (
  profile_id,
  profile_version,
  profile_checksum,
  content_type,
  source_manifest_checksum,
  brief_schema_id,
  response_schema_id,
  prompt_key,
  prompt_version,
  lifecycle_state
) values (
  'guided_audio_reflection',
  1,
  '3fa64f05911042bd2e2f7e58d14700581ca5025adc587425fd25afb2880210d9',
  'audio_reflection',
  'b3b3b75f8ce50cd9d10190fd56ae318913e12b77ff01c4ddab209e9297b40f9e',
  'strongr.strongr_daily_audio_reflection_brief.v2',
  'strongr.strongr_daily_audio_reflection.v2',
  'strongr.strongr_daily.v2',
  1,
  'owner_approved_inactive'
)
on conflict (profile_id, profile_version) do nothing;

create table app_private.strongr_daily_phase4b5_one_call_attempts (
  authorization_id uuid primary key default gen_random_uuid(),
  scope_key text not null unique
    check (scope_key = 'strongr-daily-phase4b5-guided-audio-reflection-v1'),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  brief_id uuid not null,
  requested_by_membership_id uuid not null,
  profile_id text not null,
  profile_version integer not null check (profile_version = 1),
  profile_checksum text not null check (profile_checksum ~ '^[a-f0-9]{64}$'),
  source_manifest_checksum text not null check (source_manifest_checksum ~ '^[a-f0-9]{64}$'),
  golden_descriptor_checksum text not null check (golden_descriptor_checksum ~ '^[a-f0-9]{64}$'),
  rights_record_checksum text not null check (rights_record_checksum ~ '^[a-f0-9]{64}$'),
  provider text not null check (provider = 'openai'),
  model text not null check (model = 'gpt-5.6-terra'),
  prompt_key text not null check (prompt_key = 'strongr.strongr_daily.v2'),
  prompt_version integer not null check (prompt_version = 1),
  timeout_ms integer not null check (timeout_ms = 60000),
  max_output_tokens integer not null check (max_output_tokens = 5000),
  maximum_cost_microunits integer not null check (maximum_cost_microunits = 100000),
  pre_call_estimate_microunits integer not null check (
    pre_call_estimate_microunits between 0 and 100000
  ),
  allowed_calls integer not null default 1 check (allowed_calls = 1),
  automatic_retry_count integer not null default 0 check (automatic_retry_count = 0),
  attempt_state text not null check (
    attempt_state in ('consumed_pre_call', 'quarantined', 'failed')
  ),
  provider_response_id text,
  returned_model text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  total_tokens integer check (total_tokens is null or total_tokens >= 0),
  actual_cost_microunits integer check (
    actual_cost_microunits is null
    or actual_cost_microunits between 0 and 100000
  ),
  output_hash text check (output_hash is null or output_hash ~ '^[a-f0-9]{64}$'),
  quarantined_payload jsonb,
  safe_error_code text check (
    safe_error_code is null or safe_error_code ~ '^[a-z][a-z0-9_.-]{0,79}$'
  ),
  consumed_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  foreign key (brief_id, organization_id)
    references public.content_briefs(id, organization_id) on delete restrict,
  check (
    (attempt_state = 'consumed_pre_call'
      and provider_response_id is null
      and returned_model is null
      and input_tokens is null
      and output_tokens is null
      and total_tokens is null
      and actual_cost_microunits is null
      and output_hash is null
      and quarantined_payload is null
      and safe_error_code is null
      and completed_at is null)
    or (attempt_state = 'quarantined'
      and provider_response_id is not null
      and returned_model = 'gpt-5.6-terra'
      and input_tokens is not null
      and output_tokens is not null
      and total_tokens = input_tokens + output_tokens
      and actual_cost_microunits is not null
      and output_hash is not null
      and quarantined_payload is not null
      and safe_error_code is null
      and completed_at is not null)
    or (attempt_state = 'failed'
      and provider_response_id is null
      and returned_model is null
      and input_tokens is null
      and output_tokens is null
      and total_tokens is null
      and actual_cost_microunits is null
      and output_hash is null
      and quarantined_payload is null
      and safe_error_code is not null
      and completed_at is not null)
  )
);

comment on table app_private.strongr_daily_phase4b5_one_call_attempts is
  'Private, one-use Phase 4B.5 development-only provider attempt. Its payload is quarantined and never creates a governed content version.';

alter table app_private.strongr_daily_phase4b5_one_call_attempts enable row level security;
revoke all on table app_private.strongr_daily_phase4b5_one_call_attempts
from public, anon, authenticated, service_role;

create function public.m1_begin_phase4b5_one_call(
  p_organization_id uuid,
  p_brief_id uuid,
  p_pre_call_estimate_microunits integer
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor uuid;
  v_brief public.content_briefs%rowtype;
  v_profile app_private.strongr_daily_content_profiles%rowtype;
  v_authorization_id uuid;
begin
  -- This is a high-assurance, billable owner action. The database rechecks
  -- tenant-scoped content permission, an unrevoked owner role, and AAL2
  -- inside this transaction.
  v_actor := app_private.require_permission(
    p_organization_id,
    'content.create',
    true
  );

  if not exists (
    select 1
    from public.membership_role_grants as grant_record
    join public.roles as role_record
      on role_record.id = grant_record.role_id
      and role_record.organization_id = grant_record.organization_id
    where grant_record.organization_id = p_organization_id
      and grant_record.membership_id = v_actor
      and role_record.key = 'owner'
      and not exists (
        select 1
        from public.membership_role_revocations as revocation
        where revocation.grant_id = grant_record.id
      )
  ) then
    raise exception using
      errcode = '42501',
      message = 'one-call authorization requires the owner role';
  end if;

  if p_pre_call_estimate_microunits is null
     or p_pre_call_estimate_microunits < 0
     or p_pre_call_estimate_microunits > 100000 then
    raise exception using
      errcode = '22023',
      message = 'pre-call estimate exceeds the approved ceiling';
  end if;

  select p.* into v_profile
  from app_private.strongr_daily_content_profiles as p
  where p.profile_id = 'guided_audio_reflection'
    and p.profile_version = 1
    and p.profile_checksum = '3fa64f05911042bd2e2f7e58d14700581ca5025adc587425fd25afb2880210d9'
    and p.content_type = 'audio_reflection'
    and p.source_manifest_checksum = 'b3b3b75f8ce50cd9d10190fd56ae318913e12b77ff01c4ddab209e9297b40f9e'
    and p.brief_schema_id = 'strongr.strongr_daily_audio_reflection_brief.v2'
    and p.response_schema_id = 'strongr.strongr_daily_audio_reflection.v2'
    and p.prompt_key = 'strongr.strongr_daily.v2'
    and p.prompt_version = 1
    and p.lifecycle_state = 'owner_approved_inactive';
  if not found then
    raise exception using
      errcode = '55000',
      message = 'one-call profile authority is unavailable';
  end if;

  select b.* into v_brief
  from public.content_briefs as b
  where b.id = p_brief_id
    and b.organization_id = p_organization_id;
  if not found
     or v_brief.schema_id <> 'strongr.strongr_daily_audio_reflection_brief.v2'
     or row(
       v_brief.content_profile_id,
       v_brief.content_profile_version,
       v_brief.content_profile_checksum,
       v_brief.content_profile_content_type,
       v_brief.content_profile_source_manifest_checksum
     ) is distinct from row(
       'guided_audio_reflection'::text,
       1,
       '3fa64f05911042bd2e2f7e58d14700581ca5025adc587425fd25afb2880210d9'::text,
       'audio_reflection'::text,
       'b3b3b75f8ce50cd9d10190fd56ae318913e12b77ff01c4ddab209e9297b40f9e'::text
     )
     or v_brief.payload ? 'scripture_text'
     or v_brief.payload ? 'private_prayer'
     or v_brief.payload ? 'private_journal'
     or v_brief.payload ? 'private_prayer_request'
     or v_brief.payload ? 'private_journal_entry' then
    raise exception using
      errcode = '22023',
      message = 'brief does not satisfy the one-call privacy and provenance contract';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('strongr-daily-phase4b5-guided-audio-reflection-v1', 0)
  );
  if exists (
    select 1
    from app_private.strongr_daily_phase4b5_one_call_attempts
    where scope_key = 'strongr-daily-phase4b5-guided-audio-reflection-v1'
  ) then
    raise exception using
      errcode = '55000',
      message = 'one-call authorization has already been consumed';
  end if;

  insert into app_private.strongr_daily_phase4b5_one_call_attempts (
    scope_key,
    organization_id,
    brief_id,
    requested_by_membership_id,
    profile_id,
    profile_version,
    profile_checksum,
    source_manifest_checksum,
    golden_descriptor_checksum,
    rights_record_checksum,
    provider,
    model,
    prompt_key,
    prompt_version,
    timeout_ms,
    max_output_tokens,
    maximum_cost_microunits,
    pre_call_estimate_microunits,
    attempt_state
  ) values (
    'strongr-daily-phase4b5-guided-audio-reflection-v1',
    p_organization_id,
    p_brief_id,
    v_actor,
    v_profile.profile_id,
    v_profile.profile_version,
    v_profile.profile_checksum,
    v_profile.source_manifest_checksum,
    'fffa3521b410a614bd3c9cc3b5485d75ffa2510a378ec8b46bc38e543ca45882',
    'effe9ead79efc9661fa2bdebcdcef86543708a7a9e76bacc245a0607cf35ca68',
    'openai',
    'gpt-5.6-terra',
    'strongr.strongr_daily.v2',
    1,
    60000,
    5000,
    100000,
    p_pre_call_estimate_microunits,
    'consumed_pre_call'
  ) returning authorization_id into v_authorization_id;

  return v_authorization_id;
end;
$$;

revoke all on function public.m1_begin_phase4b5_one_call(uuid, uuid, integer)
from public, anon, authenticated, service_role;
grant execute on function public.m1_begin_phase4b5_one_call(uuid, uuid, integer)
to authenticated;

create function public.m1_complete_phase4b5_one_call(
  p_authorization_id uuid,
  p_attempt_state text,
  p_provider_response_id text,
  p_returned_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_total_tokens integer,
  p_actual_cost_microunits integer,
  p_output_hash text,
  p_quarantined_payload jsonb,
  p_safe_error_code text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_attempt app_private.strongr_daily_phase4b5_one_call_attempts%rowtype;
begin
  select a.* into v_attempt
  from app_private.strongr_daily_phase4b5_one_call_attempts as a
  where a.authorization_id = p_authorization_id
  for update;
  if not found or v_attempt.attempt_state <> 'consumed_pre_call' then
    raise exception using errcode = '55000', message = 'one-call attempt is not completable';
  end if;

  if p_attempt_state = 'quarantined' then
    if p_provider_response_id is null
       or p_provider_response_id !~ '^[A-Za-z0-9_-]{1,255}$'
       or p_returned_model <> 'gpt-5.6-terra'
       or p_input_tokens is null or p_input_tokens < 0
       or p_output_tokens is null or p_output_tokens < 0
       or p_total_tokens is distinct from p_input_tokens + p_output_tokens
       or p_actual_cost_microunits is null
       or p_actual_cost_microunits < 0
       or p_actual_cost_microunits > v_attempt.maximum_cost_microunits
       or p_output_hash is null
       or p_output_hash !~ '^[a-f0-9]{64}$'
       or p_quarantined_payload is null
       or p_quarantined_payload ->> 'schema_id' <> 'strongr.strongr_daily_audio_reflection.v2'
       or p_quarantined_payload ? 'scripture_text'
       or p_quarantined_payload ? 'prayer_request_prompt'
       or p_quarantined_payload #>> '{content_profile,profile_version}' !~ '^[1-9][0-9]*$'
       or row(
         p_quarantined_payload #>> '{content_profile,profile_id}',
         (p_quarantined_payload #>> '{content_profile,profile_version}')::integer,
         p_quarantined_payload #>> '{content_profile,canonical_checksum}',
         p_quarantined_payload #>> '{content_profile,content_type}'
       ) is distinct from row(
         v_attempt.profile_id,
         v_attempt.profile_version,
         v_attempt.profile_checksum,
         'audio_reflection'::text
       ) then
      raise exception using errcode = '22023', message = 'quarantined result is invalid';
    end if;

    update app_private.strongr_daily_phase4b5_one_call_attempts
    set attempt_state = 'quarantined',
        provider_response_id = p_provider_response_id,
        returned_model = p_returned_model,
        input_tokens = p_input_tokens,
        output_tokens = p_output_tokens,
        total_tokens = p_total_tokens,
        actual_cost_microunits = p_actual_cost_microunits,
        output_hash = p_output_hash,
        quarantined_payload = p_quarantined_payload,
        completed_at = statement_timestamp()
    where authorization_id = p_authorization_id;
  elsif p_attempt_state = 'failed'
    and p_safe_error_code ~ '^[a-z][a-z0-9_.-]{0,79}$'
    and p_provider_response_id is null
    and p_returned_model is null
    and p_input_tokens is null
    and p_output_tokens is null
    and p_total_tokens is null
    and p_actual_cost_microunits is null
    and p_output_hash is null
    and p_quarantined_payload is null then
    update app_private.strongr_daily_phase4b5_one_call_attempts
    set attempt_state = 'failed',
        safe_error_code = p_safe_error_code,
        completed_at = statement_timestamp()
    where authorization_id = p_authorization_id;
  else
    raise exception using errcode = '22023', message = 'one-call completion is invalid';
  end if;
end;
$$;

revoke all on function public.m1_complete_phase4b5_one_call(
  uuid, text, text, text, integer, integer, integer, integer, text, jsonb, text
) from public, anon, authenticated, service_role;
grant execute on function public.m1_complete_phase4b5_one_call(
  uuid, text, text, text, integer, integer, integer, integer, text, jsonb, text
) to service_role;

commit;
