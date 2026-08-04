-- Strongr Daily Phase 4B.5: sunset the narrowly scoped development preparation.
--
-- This migration does not activate a profile or authorize a provider. It makes
-- the existing one-brief preparation a bounded wrapper around the normal,
-- governed brief command, then requires its removal or formal replacement once
-- the single test has started.

begin;

create table app_private.strongr_daily_phase4b5_temporary_exception_lifecycle (
  scope_key text primary key
    check (scope_key = 'strongr-daily-phase4b5-guided-audio-reflection-v1'),
  status text not null default 'enabled'
    check (status in ('enabled', 'awaiting_removal_or_replacement', 'removed', 'replaced')),
  expires_at timestamptz not null,
  post_test_disposition_required_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  check (
    (status = 'enabled' and post_test_disposition_required_at is null)
    or status <> 'enabled'
  )
);

insert into app_private.strongr_daily_phase4b5_temporary_exception_lifecycle (
  scope_key, expires_at
) values (
  'strongr-daily-phase4b5-guided-audio-reflection-v1',
  statement_timestamp() + interval '14 days'
)
on conflict (scope_key) do nothing;

comment on table app_private.strongr_daily_phase4b5_temporary_exception_lifecycle is
  'Private, migration-controlled sunset for the sole Phase 4B.5 preparation exception. It expires fourteen days after deployment and, after an attempt starts, requires removal or replacement by a formally reviewed feature. No browser command can extend or reopen it.';

alter table app_private.strongr_daily_phase4b5_temporary_exception_lifecycle enable row level security;
revoke all on table app_private.strongr_daily_phase4b5_temporary_exception_lifecycle
from public, anon, authenticated, service_role;

create or replace function public.m1_prepare_phase4b5_guided_audio_reflection_brief(
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

  if not exists (
    select 1
    from app_private.strongr_daily_phase4b5_temporary_exception_lifecycle as lifecycle
    where lifecycle.scope_key = 'strongr-daily-phase4b5-guided-audio-reflection-v1'
      and lifecycle.status = 'enabled'
      and lifecycle.expires_at > statement_timestamp()
  ) then
    raise exception using
      errcode = '55000',
      message = 'the temporary Phase 4B.5 preparation window is closed; remove this exception or replace it through a reviewed feature';
  end if;

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

  -- Reuse the standard governed command. It rechecks content.create authority,
  -- creates the regular content item and brief, and records content.brief_created.
  select created.content_item_id, created.brief_id
    into v_item, v_brief
  from public.m1_create_audio_brief(
    p_organization_id,
    'Quiet Trust',
    v_payload,
    p_correlation_id
  ) as created;

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

create or replace function app_private.m1_phase4b5_require_post_test_disposition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if new.scope_key = 'strongr-daily-phase4b5-guided-audio-reflection-v1' then
    update app_private.strongr_daily_phase4b5_temporary_exception_lifecycle
    set
      status = 'awaiting_removal_or_replacement',
      post_test_disposition_required_at = statement_timestamp()
    where scope_key = new.scope_key
      and status = 'enabled';

    perform app_private.record_audit(
      new.organization_id,
      new.requested_by_membership_id,
      'content.phase4b5_temporary_exception_post_test_disposition_required',
      'content_brief',
      new.brief_id,
      'remove_or_formally_replace',
      new.correlation_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists phase4b5_require_post_test_disposition
on app_private.strongr_daily_phase4b5_one_call_attempts;
create trigger phase4b5_require_post_test_disposition
after insert on app_private.strongr_daily_phase4b5_one_call_attempts
for each row execute function app_private.m1_phase4b5_require_post_test_disposition();

revoke all on function app_private.m1_phase4b5_require_post_test_disposition()
from public, anon, authenticated, service_role;

commit;
