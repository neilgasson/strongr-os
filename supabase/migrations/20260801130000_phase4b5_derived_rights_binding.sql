-- Binds the development-only Phase 4B.5 one-call record to the later
-- owner-controlled derived-profile rights record. No profile is activated.
begin;

create or replace function public.m1_begin_phase4b5_one_call(
  p_organization_id uuid,
  p_brief_id uuid,
  p_request_sha256 text,
  p_canonical_request_byte_count integer,
  p_estimated_input_tokens integer,
  p_price_schedule_version text,
  p_pre_call_estimate_microunits integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor uuid;
  v_brief public.content_briefs%rowtype;
  v_profile app_private.strongr_daily_content_profiles%rowtype;
  v_authorization_id uuid;
  v_correlation_id uuid;
begin
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

  if p_request_sha256 is null
     or p_request_sha256 !~ '^[a-f0-9]{64}$'
     or p_canonical_request_byte_count is null
     or p_canonical_request_byte_count <= 0
     or p_estimated_input_tokens is distinct from p_canonical_request_byte_count
     or p_price_schedule_version <> 'openai.responses.gpt-5.6-terra.2026-08-01.v1'
     or p_pre_call_estimate_microunits is null
     or p_pre_call_estimate_microunits < 0
     or p_pre_call_estimate_microunits > 100000
     or p_pre_call_estimate_microunits <> ceil(
       p_estimated_input_tokens::numeric * 3.125 + 5000::numeric * 15.000
     )::integer then
    raise exception using
      errcode = '22023',
      message = 'pre-call request binding or estimate is invalid';
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
    and p.prompt_key = 'strongr.phase4b5.guided_audio_reflection.v1'
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

  v_correlation_id := gen_random_uuid();

  insert into app_private.strongr_daily_phase4b5_one_call_attempts (
    scope_key, organization_id, brief_id, brief_payload_hash,
    requested_by_membership_id, profile_id, profile_version, profile_checksum,
    source_manifest_checksum, golden_descriptor_checksum, rights_record_checksum,
    provider, model, prompt_key, prompt_version, timeout_ms, max_output_tokens,
    maximum_cost_microunits, price_schedule_version,
    input_price_microunits_per_token, output_price_microunits_per_token,
    request_sha256, canonical_request_byte_count, estimated_input_tokens,
    pre_call_estimate_microunits, correlation_id, attempt_state
  ) values (
    'strongr-daily-phase4b5-guided-audio-reflection-v1',
    p_organization_id, p_brief_id, v_brief.payload_hash, v_actor,
    v_profile.profile_id, v_profile.profile_version, v_profile.profile_checksum,
    v_profile.source_manifest_checksum,
    'fffa3521b410a614bd3c9cc3b5485d75ffa2510a378ec8b46bc38e543ca45882',
    'b0b83eb799ac21852f128849affc628bedb0511b253376690d9194acd675b59e',
    'openai', 'gpt-5.6-terra', 'strongr.phase4b5.guided_audio_reflection.v1',
    1, 60000, 5000, 100000,
    'openai.responses.gpt-5.6-terra.2026-08-01.v1',
    3.125, 15.000, p_request_sha256, p_canonical_request_byte_count,
    p_estimated_input_tokens, p_pre_call_estimate_microunits, v_correlation_id,
    'consumed_pre_call'
  ) returning authorization_id into v_authorization_id;

  return jsonb_build_object(
    'authorization_id', v_authorization_id,
    'correlation_id', v_correlation_id
  );
end;
$$;

revoke all on function public.m1_begin_phase4b5_one_call(uuid, uuid, text, integer, integer, text, integer)
from public, anon, authenticated, service_role;
grant execute on function public.m1_begin_phase4b5_one_call(uuid, uuid, text, integer, integer, text, integer)
to authenticated;

commit;
