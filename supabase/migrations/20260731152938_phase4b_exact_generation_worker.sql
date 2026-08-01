-- Strongr Daily Phase 4B: exact-job live-provider worker boundary.
--
-- The live-provider Edge runtime may claim one explicitly requested generation
-- job and may atomically complete only that leased attempt with usage and cost
-- evidence. It receives no browser or human-review authority. The existing
-- batch worker and deterministic completion command remain available for their
-- already accepted paths.

begin;

create function public.m1_claim_generation_event_by_job(
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

  -- A live-provider invocation is intentionally one-shot. Failed, previously
  -- attempted, already leased, cancelled, and completed jobs are never
  -- reclaimed by this exact-job command. Intentional regeneration creates a
  -- new governed job instead of retrying this one.
  select e.* into v_event
  from public.outbox_events as e
  join public.generation_jobs as j
    on j.id = e.aggregate_id
   and j.organization_id = e.organization_id
  where j.id = p_generation_job_id
    and j.state = 'queued'
    and j.attempt_count = 0
    and j.prompt_key = 'strongr.strongr_daily.v2'
    and j.prompt_version = 1
    and e.event_type = 'content.generation_requested.v1'
    and e.event_version = 1
    and e.aggregate_type = 'generation_job'
    and e.payload ->> 'job_id' = j.id::text
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
    raise exception using errcode = '55000', message = 'generation job is not claimable';
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
    raise exception using errcode = '55000', message = 'generation event is not claimable';
  end if;

  insert into public.audit_events (
    organization_id, action, target_type, target_id, reason_code,
    correlation_id, source_channel
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

create function public.m1_complete_generation_attempt_with_usage(
  p_event_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_attempt_id uuid,
  p_provider_response_id text,
  p_response_schema_id text,
  p_output jsonb,
  p_output_hash text,
  p_latency_ms integer,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cost_microunits bigint
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
  if p_input_tokens is null or p_input_tokens < 0 then
    raise exception using errcode = '22023', message = 'invalid input token count';
  end if;
  if p_output_tokens is null or p_output_tokens < 0 then
    raise exception using errcode = '22023', message = 'invalid output token count';
  end if;
  if p_cost_microunits is null or p_cost_microunits < 0 then
    raise exception using errcode = '22023', message = 'invalid provider cost';
  end if;
  if p_cost_microunits > 100000 then
    raise exception using errcode = '22023',
      message = 'provider cost exceeds per-job limit';
  end if;
  if length(btrim(p_provider_response_id)) not between 1 and 255 then
    raise exception using errcode = '22023',
      message = 'invalid provider response id';
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

  -- Recompute the same PostgreSQL-canonical hash used by the adapter. A v2
  -- payload carries its own portable content hash, so that field is excluded
  -- from the hash input and must equal the supplied output hash.
  if p_response_schema_id = 'strongr.audio_reflection.v1' then
    if app_private.sha256_jsonb(p_output) <> p_output_hash then
      raise exception using errcode = '22023', message = 'generation output hash mismatch';
    end if;
  elsif p_response_schema_id = 'strongr.strongr_daily_audio_reflection.v2' then
    if p_output ->> 'content_hash' is null
       or p_output ->> 'content_hash' <> p_output_hash
       or app_private.sha256_jsonb(p_output - 'content_hash') <> p_output_hash then
      raise exception using errcode = '22023', message = 'generation output hash mismatch';
    end if;
  else
    raise exception using errcode = '22023', message = 'invalid response schema id';
  end if;

  -- Keep the accepted lease, tenant, claim, replay, draft, and audit rules,
  -- while writing provider usage in the original append-only attempt insert.
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
  if v_job.prompt_key is distinct from 'strongr.strongr_daily.v2'
     or v_job.prompt_version is distinct from 1 then
    raise exception using errcode = '22023',
      message = 'generation job is not eligible for the Phase 4B provider';
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
      if v_attempt.input_tokens is distinct from p_input_tokens
         or v_attempt.output_tokens is distinct from p_output_tokens
         or v_attempt.cost_microunits is distinct from p_cost_microunits then
        raise exception using errcode = '22023',
          message = 'generation completion usage does not match existing provenance';
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
  if p_response_schema_id not in (
       'strongr.audio_reflection.v1',
       'strongr.strongr_daily_audio_reflection.v2'
     )
     or v_brief.schema_id <> (case
       when p_response_schema_id = 'strongr.audio_reflection.v1'
         then 'strongr.audio_reflection_brief.v1'
       else 'strongr.strongr_daily_audio_reflection_brief.v2'
     end) then
    raise exception using errcode = '22023',
      message = 'invalid response schema id';
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
    provider_response_id, status, input_tokens, output_tokens,
    cost_microunits, latency_ms, correlation_id, started_at, finished_at
  ) values (
    v_claim.attempt_id, v_claim.organization_id,
    v_claim.generation_job_id, v_claim.attempt_number,
    v_claim.provider, v_claim.model, v_claim.prompt_checksum,
    v_claim.request_schema_id, p_response_schema_id,
    p_provider_response_id, 'succeeded', p_input_tokens, p_output_tokens,
    p_cost_microunits, p_latency_ms, v_job.correlation_id,
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

revoke all on function public.m1_claim_generation_event_by_job(
  uuid, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.m1_complete_generation_attempt_with_usage(
  uuid, text, uuid, uuid, text, text, jsonb, text,
  integer, integer, integer, bigint
) from public, anon, authenticated, service_role;

grant execute on function public.m1_claim_generation_event_by_job(
  uuid, text, integer
) to service_role;
grant execute on function public.m1_complete_generation_attempt_with_usage(
  uuid, text, uuid, uuid, text, text, jsonb, text,
  integer, integer, integer, bigint
) to service_role;

-- Service-role access remains command-only. SECURITY DEFINER ownership lets
-- the exact commands persist their narrow facts without exposing table DML.
revoke insert, update, delete on table public.outbox_events
from service_role;
revoke insert, update, delete on table public.generation_jobs
from service_role;
revoke insert, update, delete on table public.generation_job_attempts
from service_role;
revoke insert, update, delete on table public.content_versions
from service_role;

do $$
declare
  v_approval_definition text;
  v_role text;
  v_signature text;
begin
  foreach v_signature in array array[
    'public.m1_claim_generation_event_by_job(uuid,text,integer)',
    'public.m1_complete_generation_attempt_with_usage(uuid,text,uuid,uuid,text,text,jsonb,text,integer,integer,integer,bigint)'
  ]
  loop
    if not has_function_privilege('service_role', v_signature, 'EXECUTE') then
      raise exception
        'Phase 4B verification failed: service_role cannot execute %',
        v_signature;
    end if;

    -- anon and authenticated both inherit any accidental PUBLIC EXECUTE grant,
    -- so these checks also prove that the pseudo-role PUBLIC was revoked.
    foreach v_role in array array['anon', 'authenticated']
    loop
      if has_function_privilege(v_role, v_signature, 'EXECUTE') then
        raise exception
          'Phase 4B verification failed: % can execute %',
          v_role,
          v_signature;
      end if;
    end loop;
  end loop;

  if has_function_privilege(
    'service_role',
    'public.m1_approve_version(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid)',
    'EXECUTE'
  ) then
    raise exception
      'Phase 4B verification failed: service_role can approve content';
  end if;

  v_approval_definition := pg_get_functiondef(
    'public.m1_approve_version(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid)'::regprocedure
  );
  if v_approval_definition !~ $aal$require_permission\s*\(\s*p_organization_id\s*,\s*'approval\.grant'\s*,\s*true\s*\)$aal$ then
    raise exception
      'Phase 4B verification failed: exact-version approval no longer requires AAL2';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants as g
    where g.grantee = 'service_role'
      and g.table_schema = 'public'
      and g.table_name in (
        'outbox_events',
        'generation_jobs',
        'generation_job_attempts',
        'content_versions'
      )
      and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception
      'Phase 4B verification failed: service_role has direct generation DML';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'outbox_events',
        'generation_jobs',
        'generation_job_attempts',
        'content_versions',
        'review_decisions',
        'approval_snapshots'
      )
      and not c.relrowsecurity
  ) then
    raise exception
      'Phase 4B verification failed: governed table RLS is disabled';
  end if;
end;
$$;

commit;
