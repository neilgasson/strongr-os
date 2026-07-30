-- Strongr Daily v2 generation completion compatibility.
--
-- This accepts the existing v2 contract only when the persisted governed brief
-- is v2. The worker remains the sole service-role caller and every completion
-- still creates an unapproved draft.

begin;
Output:
create or replace function public.m1_complete_generation_attempt(
  p_event_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_attempt_id uuid,
  p_provider_response_id text,
  p_response_schema_id text,
  p_output jsonb,
  p_output_hash text,
  p_latency_ms integer
)
returns table (
  completion_state text,
  content_version_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_event public.outbox_events%rowtype;
  v_job public.generation_jobs%rowtype;
  v_attempt public.generation_job_attempts%rowtype;
  v_claim app_private.m1_generation_attempt_claims%rowtype;
  v_brief public.content_briefs%rowtype;
  v_version public.content_versions%rowtype;
  v_version_number integer;
  v_payload_hash text;
begin
  if length(btrim(p_provider_response_id)) not between 1 and 255 then
    raise exception using errcode = '22023',
      message = 'invalid provider response id';
  end if;
  if p_response_schema_id not in (
    'strongr.audio_reflection.v1',
    'strongr.strongr_daily_audio_reflection.v2'
  ) then
    raise exception using errcode = '22023',
      message = 'invalid response schema id';
  end if;
  if jsonb_typeof(p_output) <> 'object'
     or p_output ->> 'schema_id' <> p_response_schema_id
     or octet_length(p_output::text) > 524288 then
    raise exception using errcode = '22023',
      message = 'invalid generation output';
  end if;
  if p_output_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'invalid output hash';
  end if;
  if p_latency_ms < 0 then
    raise exception using errcode = '22023', message = 'invalid latency';
  end if;

  v_payload_hash := app_private.sha256_jsonb(p_output);
  v_event := app_private.m1_require_generation_event_lease(
    p_event_id, p_worker_id, p_lease_token
  );

  select j.* into v_job
  from public.generation_jobs as j
  where j.id = v_event.aggregate_id
    and j.organization_id = v_event.organization_id
  for update;

  if not found then
    raise exception using errcode = 'P0002',
      message = 'generation job not found';
  end if;

  select c.* into v_claim
  from app_private.m1_generation_attempt_claims as c
  where c.attempt_id = p_attempt_id
    and c.generation_job_id = v_job.id
    and c.organization_id = v_job.organization_id;

  if not found then
    raise exception using errcode = 'P0002',
      message = 'generation attempt claim not found';
  end if;
  if v_claim.event_id <> v_event.id
     or v_claim.worker_id <> p_worker_id
     or v_claim.lease_token <> p_lease_token then
    raise exception using errcode = '55000',
      message = 'generation attempt is not current';
  end if;

  select a.* into v_attempt
  from public.generation_job_attempts as a
  where a.id = p_attempt_id
    and a.generation_job_id = v_job.id
    and a.organization_id = v_job.organization_id;

  if found then
    if v_job.state = 'succeeded' and v_attempt.status = 'succeeded' then
      select cv.* into v_version
      from public.content_versions as cv
      where cv.organization_id = v_job.organization_id
        and cv.source_job_id = v_job.id;

      if not found
         or v_job.output_hash <> p_output_hash
         or v_attempt.provider_response_id <> p_provider_response_id
         or v_attempt.response_schema_id <> p_response_schema_id
         or v_attempt.latency_ms <> p_latency_ms
         or v_attempt.provider <> v_claim.provider
         or v_attempt.model <> v_claim.model
         or v_attempt.prompt_checksum <> v_claim.prompt_checksum
         or v_version.brief_id <> v_job.brief_id
         or v_version.payload <> p_output
         or v_version.payload_hash <> v_payload_hash
         or v_version.source <> 'ai_assisted' then
        raise exception using errcode = '22023',
          message = 'generation completion does not match existing provenance';
      end if;

      return query select 'succeeded'::text, v_version.id;
      return;
    end if;

    raise exception using errcode = '55000',
      message = 'generation attempt is not current';
  end if;

  if v_job.state <> 'running'
     or v_claim.attempt_number <> v_job.attempt_count then
    raise exception using errcode = '55000',
      message = 'generation attempt is not current';
  end if;

  select b.* into v_brief
  from public.content_briefs as b
  where b.id = v_job.brief_id
    and b.organization_id = v_job.organization_id;

  if not found then
    raise exception using errcode = 'P0002',
      message = 'generation brief not found';
  end if;

  if (
    v_brief.schema_id = 'strongr.audio_reflection_brief.v1'
    and p_response_schema_id <> 'strongr.audio_reflection.v1'
  ) or (
    v_brief.schema_id = 'strongr.strongr_daily_audio_reflection_brief.v2'
    and p_response_schema_id <> 'strongr.strongr_daily_audio_reflection.v2'
  ) then
    raise exception using errcode = '22023',
      message = 'response schema does not match brief schema';
  end if;

  update public.content_items as i
  set next_version_number = i.next_version_number + 1
  where i.id = v_brief.content_item_id
    and i.organization_id = v_job.organization_id
  returning i.next_version_number - 1 into v_version_number;

  if v_version_number is null then
    raise exception using errcode = 'P0002',
      message = 'content item not found';
  end if;

  insert into public.generation_job_attempts (
    id, organization_id, generation_job_id, attempt_number, provider, model,
    prompt_checksum, request_schema_id, response_schema_id,
    provider_response_id, status, latency_ms, correlation_id,
    started_at, finished_at
  ) values (
    v_claim.attempt_id, v_claim.organization_id,
    v_claim.generation_job_id, v_claim.attempt_number,
    v_claim.provider, v_claim.model, v_claim.prompt_checksum,
    v_claim.request_schema_id, p_response_schema_id,
    p_provider_response_id, 'succeeded', p_latency_ms, v_job.correlation_id,
    v_claim.started_at, statement_timestamp()
  )
  returning * into v_attempt;

  insert into public.content_versions (
    organization_id, content_item_id, brief_id, version_number,
    schema_id, payload, payload_hash, source, source_job_id,
    created_by_membership_id
  ) values (
    v_job.organization_id, v_brief.content_item_id, v_brief.id,
    v_version_number, p_response_schema_id, p_output, v_payload_hash,
    'ai_assisted', v_job.id, v_job.requested_by_membership_id
  )
  returning * into v_version;

  insert into public.workflow_transitions (
    organization_id, content_version_id, from_state, to_state,
    actor_membership_id, reason_code, correlation_id
  ) values (
    v_job.organization_id, v_version.id, null, 'draft',
    v_job.requested_by_membership_id, 'generated_draft_created',
    v_job.correlation_id
  );

  update public.generation_jobs as j
  set state = 'succeeded',
      provider = v_claim.provider,
      model = v_claim.model,
      provider_response_id = p_provider_response_id,
      output_hash = p_output_hash,
      last_error_code = null,
      finished_at = statement_timestamp()
  where j.id = v_job.id;

  perform app_private.record_worker_audit(
    v_job.organization_id,
    'generation.attempt_succeeded',
    v_event.id,
    'attempt_succeeded',
    v_job.correlation_id
  );

  insert into public.audit_events (
    organization_id, action, target_type, target_id, reason_code,
    correlation_id, source_channel
  ) values (
    v_job.organization_id, 'content.version_created', 'content_version',
    v_version.id, 'ai_assisted_draft', v_job.correlation_id, 'worker'
  );

  return query select 'succeeded'::text, v_version.id;
end;
$$;


do $$
begin
  if has_function_privilege(
    'anon',
    'public.m1_complete_generation_attempt(uuid,text,uuid,uuid,text,text,jsonb,text,integer)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.m1_complete_generation_attempt(uuid,text,uuid,uuid,text,text,jsonb,text,integer)',
    'EXECUTE'
  ) then
    raise exception 'v2 generation completion must remain worker-only';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.m1_complete_generation_attempt(uuid,text,uuid,uuid,text,text,jsonb,text,integer)',
    'EXECUTE'
  ) then
    raise exception 'v2 generation completion service role grant is missing';
  end if;
end;
$$;

commit;
