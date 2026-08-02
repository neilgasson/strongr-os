-- Strongr Daily Phase 4B.5: one owner-prepared, provider-safe immutable brief.
--
-- This is deliberately narrower than profile activation. It creates exactly one
-- development-only brief for the already approved inactive profile, records the
-- complete authorization binding privately, and does not contact a provider.

begin;

create table app_private.strongr_daily_phase4b5_brief_preparations (
  scope_key text primary key
    check (scope_key = 'strongr-daily-phase4b5-guided-audio-reflection-v1'),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  brief_id uuid not null,
  prepared_by_membership_id uuid not null,
  immutable_brief_record_id text not null
    check (immutable_brief_record_id = 'strongr-daily-quiet-trust-psalm-46-10-provider-safe-v1'),
  immutable_brief_version integer not null check (immutable_brief_version = 1),
  immutable_brief_definition_checksum text not null check (
    immutable_brief_definition_checksum = 'f3003dfb67d249a7ff7792d5fc2828cb0f9f1809287a425e5b77b82445e21cbe'
  ),
  profile_id text not null check (profile_id = 'guided_audio_reflection'),
  profile_version integer not null check (profile_version = 1),
  profile_checksum text not null check (
    profile_checksum = '3fa64f05911042bd2e2f7e58d14700581ca5025adc587425fd25afb2880210d9'
  ),
  source_manifest_checksum text not null check (
    source_manifest_checksum = 'b3b3b75f8ce50cd9d10190fd56ae318913e12b77ff01c4ddab209e9297b40f9e'
  ),
  rights_record_checksum text not null check (
    rights_record_checksum = 'b0b83eb799ac21852f128849affc628bedb0511b253376690d9194acd675b59e'
  ),
  request_sha256 text not null check (
    request_sha256 = '98e2a6eddce6cb668f504758a47e097457841700709cd1db2d1506c2ce854f8a'
  ),
  canonical_request_byte_count integer not null check (canonical_request_byte_count = 5268),
  model text not null check (model = 'gpt-5.6-terra'),
  prompt_key text not null check (prompt_key = 'strongr.phase4b5.guided_audio_reflection.v1'),
  prompt_version integer not null check (prompt_version = 1),
  maximum_cost_microunits integer not null check (maximum_cost_microunits = 100000),
  price_schedule_version text not null check (
    price_schedule_version = 'openai.responses.gpt-5.6-terra.2026-08-01.v1'
  ),
  estimated_input_tokens integer not null check (estimated_input_tokens = 5268),
  estimated_maximum_cost_microunits integer not null check (
    estimated_maximum_cost_microunits = 91463
  ),
  authorization_binding text not null check (
    authorization_binding = 'owner_authorized_one_development_only_call'
  ),
  correlation_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  foreign key (brief_id, organization_id)
    references public.content_briefs(id, organization_id) on delete restrict,
  foreign key (prepared_by_membership_id, organization_id)
    references public.memberships(id, organization_id) on delete restrict,
  unique (brief_id)
);

comment on table app_private.strongr_daily_phase4b5_brief_preparations is
  'Private evidence that exactly one provider-safe Phase 4B.5 brief was owner-prepared. This does not activate a profile or authorize a provider call.';

alter table app_private.strongr_daily_phase4b5_brief_preparations enable row level security;
revoke all on table app_private.strongr_daily_phase4b5_brief_preparations
from public, anon, authenticated, service_role;

create function app_private.m1_phase4b5_require_owner(
  p_organization_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor uuid;
begin
  v_actor := app_private.require_permission(p_organization_id, 'content.create', true);
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
    raise exception using errcode = '42501', message = 'phase4b5 preparation requires the owner role';
  end if;
  return v_actor;
end;
$$;

revoke all on function app_private.m1_phase4b5_require_owner(uuid)
from public, anon, authenticated, service_role;

create function public.m1_prepare_phase4b5_guided_audio_reflection_brief(
  p_organization_id uuid,
  p_correlation_id uuid default gen_random_uuid()
)
returns table (content_item_id uuid, brief_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor uuid;
  v_profile app_private.strongr_daily_content_profiles%rowtype;
  v_item uuid;
  v_brief uuid;
  v_payload jsonb := '{
    "audience":"Adults seeking a quiet, Scripture-rooted daily reflection",
    "content_profile":{"canonical_checksum":"3fa64f05911042bd2e2f7e58d14700581ca5025adc587425fd25afb2880210d9","content_type":"audio_reflection","profile_id":"guided_audio_reflection","profile_version":1},
    "content_type":"audio_reflection",
    "desired_duration_seconds":300,
    "pastoral_purpose":"Offer a gentle, Scripture-rooted invitation to stillness and trust in God without promising outcomes.",
    "prohibited_claims_or_wording":["Do not promise healing, wealth, certainty, or guaranteed outcomes.","Do not present AI as the voice of God.","Do not quote, paraphrase closely, or reproduce Scripture text.","Do not claim that Scripture, theological, pastoral, safety, or editorial review has occurred.","Do not approve, package, narrate, upload, publish, distribute, or release the draft."],
    "required_elements":["warm welcome","Scripture introduction using reference metadata only","pastoral reflection","public editorial prayer","gentle closing invitation","app description, short summary, personal takeaway prompt, artwork prompt, social caption, keywords, and duration estimate"],
    "schema_id":"strongr.strongr_daily_audio_reflection_brief.v2",
    "scripture_reference":{"reference":"Psalm 46:10","source_citation":"NIV reference only; no Scripture text is supplied in this provider request.","translation":"NIV"},
    "source_brief_identifier":"strongr-daily-quiet-trust-psalm-46-10-provider-safe-v1",
    "theme":"stillness and trust in God",
    "tone":"pastoral",
    "working_title":"Quiet Trust"
  }'::jsonb;
begin
  v_actor := app_private.m1_phase4b5_require_owner(p_organization_id);

  select profile.* into v_profile
  from app_private.strongr_daily_content_profiles as profile
  where profile.profile_id = 'guided_audio_reflection'
    and profile.profile_version = 1
    and profile.profile_checksum = '3fa64f05911042bd2e2f7e58d14700581ca5025adc587425fd25afb2880210d9'
    and profile.source_manifest_checksum = 'b3b3b75f8ce50cd9d10190fd56ae318913e12b77ff01c4ddab209e9297b40f9e'
    and profile.lifecycle_state = 'owner_approved_inactive';
  if not found then
    raise exception using errcode = '55000', message = 'the approved inactive profile is unavailable';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('strongr-daily-phase4b5-guided-audio-reflection-v1', 0)
  );
  if exists (
    select 1 from app_private.strongr_daily_phase4b5_brief_preparations
    where scope_key = 'strongr-daily-phase4b5-guided-audio-reflection-v1'
  ) or exists (
    select 1 from app_private.strongr_daily_phase4b5_one_call_attempts
    where scope_key = 'strongr-daily-phase4b5-guided-audio-reflection-v1'
  ) then
    raise exception using errcode = '55000', message = 'the one approved development brief has already been prepared or consumed';
  end if;

  insert into public.content_items (organization_id, title, created_by_membership_id)
  values (p_organization_id, 'Quiet Trust', v_actor)
  returning id into v_item;

  insert into public.content_briefs (
    organization_id, content_item_id, payload, payload_hash, created_by_membership_id
  ) values (
    p_organization_id, v_item, v_payload, app_private.sha256_jsonb(v_payload), v_actor
  ) returning id into v_brief;

  insert into app_private.strongr_daily_phase4b5_brief_preparations (
    scope_key, organization_id, brief_id, prepared_by_membership_id,
    immutable_brief_record_id, immutable_brief_version, immutable_brief_definition_checksum,
    profile_id, profile_version, profile_checksum, source_manifest_checksum,
    rights_record_checksum, request_sha256, canonical_request_byte_count,
    model, prompt_key, prompt_version, maximum_cost_microunits, price_schedule_version,
    estimated_input_tokens, estimated_maximum_cost_microunits, authorization_binding,
    correlation_id
  ) values (
    'strongr-daily-phase4b5-guided-audio-reflection-v1', p_organization_id, v_brief, v_actor,
    'strongr-daily-quiet-trust-psalm-46-10-provider-safe-v1', 1,
    'f3003dfb67d249a7ff7792d5fc2828cb0f9f1809287a425e5b77b82445e21cbe',
    v_profile.profile_id, v_profile.profile_version, v_profile.profile_checksum,
    v_profile.source_manifest_checksum,
    'b0b83eb799ac21852f128849affc628bedb0511b253376690d9194acd675b59e',
    '98e2a6eddce6cb668f504758a47e097457841700709cd1db2d1506c2ce854f8a', 5268,
    'gpt-5.6-terra', 'strongr.phase4b5.guided_audio_reflection.v1', 1, 100000,
    'openai.responses.gpt-5.6-terra.2026-08-01.v1', 5268, 91463,
    'owner_authorized_one_development_only_call', p_correlation_id
  );

  perform app_private.record_audit(
    p_organization_id, v_actor, 'content.phase4b5_provider_safe_brief_prepared',
    'content_brief', v_brief, 'owner_prepared_one_call', p_correlation_id
  );

  return query select v_item, v_brief;
end;
$$;

revoke all on function public.m1_prepare_phase4b5_guided_audio_reflection_brief(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.m1_prepare_phase4b5_guided_audio_reflection_brief(uuid, uuid)
to authenticated;

create function app_private.m1_guard_phase4b5_prepared_brief_immutable()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app_private
as $$
begin
  if exists (
    select 1 from app_private.strongr_daily_phase4b5_brief_preparations
    where brief_id = old.id
  ) then
    raise exception using errcode = '55000', message = 'the prepared one-call brief is immutable';
  end if;
  return new;
end;
$$;

create trigger phase4b5_prepared_brief_immutable
before update on public.content_briefs
for each row execute function app_private.m1_guard_phase4b5_prepared_brief_immutable();

revoke all on function app_private.m1_guard_phase4b5_prepared_brief_immutable()
from public, anon, authenticated, service_role;

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
  v_preparation app_private.strongr_daily_phase4b5_brief_preparations%rowtype;
  v_authorization_id uuid;
  v_correlation_id uuid;
begin
  v_actor := app_private.m1_phase4b5_require_owner(p_organization_id);

  select preparation.* into v_preparation
  from app_private.strongr_daily_phase4b5_brief_preparations as preparation
  where preparation.scope_key = 'strongr-daily-phase4b5-guided-audio-reflection-v1'
    and preparation.organization_id = p_organization_id
    and preparation.brief_id = p_brief_id;
  if not found
     or p_request_sha256 is distinct from v_preparation.request_sha256
     or p_canonical_request_byte_count is distinct from v_preparation.canonical_request_byte_count
     or p_estimated_input_tokens is distinct from v_preparation.estimated_input_tokens
     or p_price_schedule_version is distinct from v_preparation.price_schedule_version
     or p_pre_call_estimate_microunits is distinct from v_preparation.estimated_maximum_cost_microunits then
    raise exception using errcode = '22023', message = 'pre-call request does not match the owner-prepared immutable binding';
  end if;

  select brief.* into v_brief
  from public.content_briefs as brief
  where brief.id = p_brief_id
    and brief.organization_id = p_organization_id;
  if not found
     or v_brief.schema_id <> 'strongr.strongr_daily_audio_reflection_brief.v2'
     or row(
       v_brief.content_profile_id, v_brief.content_profile_version,
       v_brief.content_profile_checksum, v_brief.content_profile_content_type,
       v_brief.content_profile_source_manifest_checksum
     ) is distinct from row(
       v_preparation.profile_id, v_preparation.profile_version,
       v_preparation.profile_checksum, 'audio_reflection'::text,
       v_preparation.source_manifest_checksum
     )
     or v_brief.payload ?| array['scripture_text', 'private_prayer', 'private_journal', 'private_prayer_request', 'private_journal_entry'] then
    raise exception using errcode = '22023', message = 'prepared brief does not satisfy the one-call privacy and provenance contract';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('strongr-daily-phase4b5-guided-audio-reflection-v1', 0)
  );
  if exists (
    select 1 from app_private.strongr_daily_phase4b5_one_call_attempts
    where scope_key = 'strongr-daily-phase4b5-guided-audio-reflection-v1'
  ) then
    raise exception using errcode = '55000', message = 'one-call authorization has already been consumed';
  end if;

  v_correlation_id := gen_random_uuid();
  insert into app_private.strongr_daily_phase4b5_one_call_attempts (
    scope_key, organization_id, brief_id, brief_payload_hash, requested_by_membership_id,
    profile_id, profile_version, profile_checksum, source_manifest_checksum,
    golden_descriptor_checksum, rights_record_checksum, provider, model, prompt_key,
    prompt_version, timeout_ms, max_output_tokens, maximum_cost_microunits,
    price_schedule_version, input_price_microunits_per_token, output_price_microunits_per_token,
    request_sha256, canonical_request_byte_count, estimated_input_tokens,
    pre_call_estimate_microunits, correlation_id, attempt_state
  ) values (
    v_preparation.scope_key, p_organization_id, p_brief_id, v_brief.payload_hash, v_actor,
    v_preparation.profile_id, v_preparation.profile_version, v_preparation.profile_checksum,
    v_preparation.source_manifest_checksum,
    'fffa3521b410a614bd3c9cc3b5485d75ffa2510a378ec8b46bc38e543ca45882',
    v_preparation.rights_record_checksum, 'openai', v_preparation.model,
    v_preparation.prompt_key, v_preparation.prompt_version, 60000, 5000,
    v_preparation.maximum_cost_microunits, v_preparation.price_schedule_version,
    3.125, 15.000, v_preparation.request_sha256,
    v_preparation.canonical_request_byte_count, v_preparation.estimated_input_tokens,
    v_preparation.estimated_maximum_cost_microunits, v_correlation_id, 'consumed_pre_call'
  ) returning authorization_id into v_authorization_id;

  return jsonb_build_object('authorization_id', v_authorization_id, 'correlation_id', v_correlation_id);
end;
$$;

revoke all on function public.m1_begin_phase4b5_one_call(uuid, uuid, text, integer, integer, text, integer)
from public, anon, authenticated, service_role;
grant execute on function public.m1_begin_phase4b5_one_call(uuid, uuid, text, integer, integer, text, integer)
to authenticated;

commit;
