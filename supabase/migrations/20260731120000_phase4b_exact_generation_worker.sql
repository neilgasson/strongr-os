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
  v_completion record;
  v_attempt public.generation_job_attempts%rowtype;
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

  -- The accepted completion command owns every lease, tenant, job, attempt,
  -- schema, immutable-draft, and replay check. Calling it here keeps the new
  -- usage fields inside the same database transaction as draft creation.
  select c.* into v_completion
  from public.m1_complete_generation_attempt(
    p_event_id,
    p_worker_id,
    p_lease_token,
    p_attempt_id,
    p_provider_response_id,
    p_response_schema_id,
    p_output,
    p_output_hash,
    p_latency_ms
  ) as c;

  select a.* into v_attempt
  from public.generation_job_attempts as a
  join public.generation_jobs as j
    on j.id = a.generation_job_id
   and j.organization_id = a.organization_id
  join public.outbox_events as e
    on e.aggregate_id = j.id
   and e.organization_id = j.organization_id
  where a.id = p_attempt_id
    and e.id = p_event_id
    and e.event_type = 'content.generation_requested.v1'
    and e.aggregate_type = 'generation_job'
    and j.prompt_key = 'strongr.strongr_daily.v2'
    and j.prompt_version = 1
    and a.status = 'succeeded'
    and a.provider_response_id = p_provider_response_id
    and a.response_schema_id = p_response_schema_id
    and a.latency_ms = p_latency_ms
  for update of a;

  if not found then
    raise exception using errcode = '55000',
      message = 'completed generation attempt provenance is missing';
  end if;

  if v_attempt.input_tokens is null
     and v_attempt.output_tokens is null
     and v_attempt.cost_microunits is null then
    update public.generation_job_attempts as a
    set input_tokens = p_input_tokens,
        output_tokens = p_output_tokens,
        cost_microunits = p_cost_microunits
    where a.id = v_attempt.id
      and a.organization_id = v_attempt.organization_id
      and a.input_tokens is null
      and a.output_tokens is null
      and a.cost_microunits is null;

    if not found then
      raise exception using errcode = '55000',
        message = 'generation usage is not current';
    end if;
  elsif v_attempt.input_tokens <> p_input_tokens
     or v_attempt.output_tokens <> p_output_tokens
     or v_attempt.cost_microunits <> p_cost_microunits then
    raise exception using errcode = '22023',
      message = 'generation completion usage does not match existing provenance';
  end if;

  return query select
    v_completion.completion_state::text,
    v_completion.content_version_id::uuid;
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
