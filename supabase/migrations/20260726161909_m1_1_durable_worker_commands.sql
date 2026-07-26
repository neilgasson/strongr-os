-- Strongr OS
-- Migration: M1.1 durable generation worker commands
--
-- Adds service-role-only commands for generation-specific outbox claims and
-- generation-attempt state. Browser grants, RLS policies, human governance,
-- publication boundaries, and the current Strongr Daily application are
-- unchanged.

begin;

create table app_private.m1_generation_attempt_claims (
  attempt_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  generation_job_id uuid not null,
  attempt_number integer not null check (attempt_number > 0),
  event_id uuid not null,
  worker_id text not null
    check (length(btrim(worker_id)) between 1 and 160),
  lease_token uuid not null,
  provider text not null
    check (length(btrim(provider)) between 1 and 120),
  model text not null
    check (length(btrim(model)) between 1 and 160),
  prompt_checksum text not null
    check (prompt_checksum ~ '^[a-f0-9]{64}$'),
  request_schema_id text not null,
  started_at timestamptz not null default statement_timestamp(),
  foreign key (generation_job_id, organization_id)
    references public.generation_jobs(id, organization_id) on delete restrict,
  foreign key (event_id, organization_id)
    references public.outbox_events(id, organization_id) on delete restrict,
  unique (generation_job_id, attempt_number)
);

alter table app_private.m1_generation_attempt_claims
enable row level security;

create trigger m1_generation_attempt_claims_immutable
before update or delete on app_private.m1_generation_attempt_claims
for each row execute function app_private.reject_mutation();

revoke all on table app_private.m1_generation_attempt_claims
from public, anon, authenticated, service_role;

create or replace function app_private.m1_require_generation_event_lease(
  p_event_id uuid,
  p_worker_id text,
  p_lease_token uuid
)
returns public.outbox_events
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event public.outbox_events%rowtype;
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

  return v_event;
end;
$$;

create or replace function public.m1_claim_generation_events(
  p_worker_id text,
  p_batch_size integer default 10,
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
begin
  if length(btrim(p_worker_id)) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'invalid worker id';
  end if;
  if p_batch_size not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid batch size';
  end if;
  if p_lease_seconds not between 1 and 3600 then
    raise exception using errcode = '22023', message = 'invalid lease duration';
  end if;

  perform app_private.touch_worker(p_worker_id, 'working');

  return query
  with candidates as (
    select e.id
    from public.outbox_events e
    where e.event_type = 'content.generation_requested.v1'
      and e.event_version = 1
      and e.aggregate_type = 'generation_job'
      and (
        (
          e.status in ('pending', 'failed')
          and e.available_at <= statement_timestamp()
        )
        or (
          e.status = 'processing'
          and e.lease_expires_at <= statement_timestamp()
        )
      )
    order by e.available_at, e.created_at, e.id
    for update skip locked
    limit p_batch_size
  ),
  claimed as (
    update public.outbox_events e
    set status = 'processing',
        attempts = e.attempts + 1,
        lease_owner = p_worker_id,
        lease_token = gen_random_uuid(),
        lease_expires_at = statement_timestamp()
          + make_interval(secs => p_lease_seconds),
        last_attempt_at = statement_timestamp(),
        last_error_code = case
          when e.status = 'processing' then 'lease_expired'
          else e.last_error_code
        end
    from candidates c
    where e.id = c.id
    returning e.*
  ),
  logged as (
    insert into public.audit_events (
      organization_id, action, target_type, target_id, reason_code,
      correlation_id, source_channel
    )
    select
      c.organization_id, 'generation.event_claimed', 'outbox_event', c.id,
      case
        when c.last_error_code = 'lease_expired' then 'lease_recovered'
        else 'delivery_attempt'
      end,
      c.correlation_id, 'worker'
    from claimed c
    returning id
  )
  select
    c.id,
    c.organization_id,
    c.event_type,
    c.event_version,
    c.aggregate_type,
    c.aggregate_id,
    c.payload,
    c.correlation_id,
    c.causation_id,
    c.attempts,
    c.lease_token,
    c.lease_expires_at
  from claimed c;
end;
$$;

create or replace function public.m1_begin_generation_attempt(
  p_event_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_provider text,
  p_model text
)
returns table (
  disposition text,
  organization_id uuid,
  generation_job_id uuid,
  correlation_id uuid,
  prompt_key text,
  prompt_version integer,
  prompt_checksum text,
  brief jsonb,
  attempt_id uuid,
  attempt_number integer,
  max_attempts integer
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
  v_next_attempt integer;
  v_prompt_checksum text;
begin
  if length(btrim(p_provider)) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'invalid provider';
  end if;
  if length(btrim(p_model)) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'invalid model';
  end if;
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
  if v_job.correlation_id <> v_event.correlation_id then
    raise exception using errcode = '22023',
      message = 'generation correlation mismatch';
  end if;

  select b.* into v_brief
  from public.content_briefs as b
  where b.id = v_job.brief_id
    and b.organization_id = v_job.organization_id;

  if not found then
    raise exception using errcode = 'P0002',
      message = 'generation brief not found';
  end if;

  v_prompt_checksum := encode(
    extensions.digest(
      convert_to(
        v_job.prompt_key || ':' || v_job.prompt_version::text,
        'utf8'
      ),
      'sha256'
    ),
    'hex'
  );

  if v_job.state = 'succeeded' then
    select a.* into v_attempt
    from public.generation_job_attempts as a
    where a.generation_job_id = v_job.id
      and a.organization_id = v_job.organization_id
      and a.status = 'succeeded'
    order by a.attempt_number desc
    limit 1;

    if not found or v_job.output_hash is null then
      raise exception using errcode = '55000',
        message = 'completed generation provenance is incomplete';
    end if;

    return query select
      'already_succeeded'::text,
      v_job.organization_id,
      v_job.id,
      v_job.correlation_id,
      v_job.prompt_key,
      v_job.prompt_version,
      v_attempt.prompt_checksum,
      v_brief.payload,
      v_attempt.id,
      v_attempt.attempt_number,
      v_job.max_attempts;
    return;
  end if;

  if v_job.state = 'cancelled' then
    return query select
      'cancelled'::text,
      v_job.organization_id,
      v_job.id,
      v_job.correlation_id,
      v_job.prompt_key,
      v_job.prompt_version,
      v_prompt_checksum,
      v_brief.payload,
      null::uuid,
      v_job.attempt_count,
      v_job.max_attempts;
    return;
  end if;

  if v_job.state = 'dead_letter' then
    return query select
      'dead_letter'::text,
      v_job.organization_id,
      v_job.id,
      v_job.correlation_id,
      v_job.prompt_key,
      v_job.prompt_version,
      v_prompt_checksum,
      v_brief.payload,
      null::uuid,
      v_job.attempt_count,
      v_job.max_attempts;
    return;
  end if;

  if v_job.state = 'running' then
    select c.* into v_claim
    from app_private.m1_generation_attempt_claims as c
    where c.generation_job_id = v_job.id
      and c.organization_id = v_job.organization_id
      and c.attempt_number = v_job.attempt_count;

    if not found or v_claim.event_id <> v_event.id then
      raise exception using errcode = '55000',
        message = 'current generation attempt claim is missing';
    end if;

    if v_claim.worker_id = p_worker_id
       and v_claim.lease_token = p_lease_token then
      if v_claim.provider <> p_provider
         or v_claim.model <> p_model
         or v_claim.prompt_checksum <> v_prompt_checksum
         or v_claim.request_schema_id <> v_brief.schema_id then
        raise exception using errcode = '22023',
          message = 'generation begin does not match existing provenance';
      end if;

      return query select
        'ready'::text,
        v_job.organization_id,
        v_job.id,
        v_job.correlation_id,
        v_job.prompt_key,
        v_job.prompt_version,
        v_claim.prompt_checksum,
        v_brief.payload,
        v_claim.attempt_id,
        v_claim.attempt_number,
        v_job.max_attempts;
      return;
    end if;

    insert into public.generation_job_attempts (
      id, organization_id, generation_job_id, attempt_number, provider, model,
      prompt_checksum, request_schema_id, status, error_code, correlation_id,
      started_at, finished_at
    ) values (
      v_claim.attempt_id, v_claim.organization_id,
      v_claim.generation_job_id, v_claim.attempt_number,
      v_claim.provider, v_claim.model, v_claim.prompt_checksum,
      v_claim.request_schema_id, 'failed', 'worker_lease_expired',
      v_job.correlation_id, v_claim.started_at, statement_timestamp()
    )
    returning * into v_attempt;

    perform app_private.record_worker_audit(
      v_job.organization_id,
      'generation.attempt_failed',
      v_event.id,
      'worker_lease_expired',
      v_job.correlation_id
    );
  end if;

  v_next_attempt := v_job.attempt_count + 1;
  if v_next_attempt > v_job.max_attempts then
    update public.generation_jobs
    set state = 'dead_letter',
        last_error_code = 'generation_max_attempts',
        finished_at = statement_timestamp()
    where id = v_job.id;

    return query select
      'dead_letter'::text,
      v_job.organization_id,
      v_job.id,
      v_job.correlation_id,
      v_job.prompt_key,
      v_job.prompt_version,
      v_prompt_checksum,
      v_brief.payload,
      null::uuid,
      v_job.attempt_count,
      v_job.max_attempts;
    return;
  end if;

  insert into app_private.m1_generation_attempt_claims (
    organization_id, generation_job_id, attempt_number, event_id, worker_id,
    lease_token, provider, model, prompt_checksum, request_schema_id
  ) values (
    v_job.organization_id, v_job.id, v_next_attempt, v_event.id, p_worker_id,
    p_lease_token, p_provider, p_model, v_prompt_checksum, v_brief.schema_id
  )
  returning * into v_claim;

  update public.generation_jobs
  set state = 'running',
      provider = p_provider,
      model = p_model,
      attempt_count = v_next_attempt,
      started_at = coalesce(started_at, statement_timestamp()),
      finished_at = null,
      last_error_code = null
  where id = v_job.id;

  perform app_private.record_worker_audit(
    v_job.organization_id,
    'generation.attempt_started',
    v_event.id,
    'attempt_started',
    v_job.correlation_id
  );

  return query select
    'ready'::text,
    v_job.organization_id,
    v_job.id,
    v_job.correlation_id,
    v_job.prompt_key,
    v_job.prompt_version,
    v_prompt_checksum,
    v_brief.payload,
    v_claim.attempt_id,
    v_claim.attempt_number,
    v_job.max_attempts;
end;
$$;

create or replace function public.m1_complete_generation_attempt(
  p_event_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_attempt_id uuid,
  p_provider_response_id text,
  p_response_schema_id text,
  p_output_hash text,
  p_latency_ms integer
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_event public.outbox_events%rowtype;
  v_job public.generation_jobs%rowtype;
  v_attempt public.generation_job_attempts%rowtype;
  v_claim app_private.m1_generation_attempt_claims%rowtype;
begin
  if length(btrim(p_provider_response_id)) not between 1 and 255 then
    raise exception using errcode = '22023',
      message = 'invalid provider response id';
  end if;
  if p_response_schema_id <> 'strongr.audio_reflection.v1' then
    raise exception using errcode = '22023',
      message = 'invalid response schema id';
  end if;
  if p_output_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'invalid output hash';
  end if;
  if p_latency_ms < 0 then
    raise exception using errcode = '22023', message = 'invalid latency';
  end if;

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
      if v_job.output_hash <> p_output_hash
         or v_attempt.provider_response_id <> p_provider_response_id
         or v_attempt.response_schema_id <> p_response_schema_id
         or v_attempt.latency_ms <> p_latency_ms
         or v_attempt.provider <> v_claim.provider
         or v_attempt.model <> v_claim.model
         or v_attempt.prompt_checksum <> v_claim.prompt_checksum then
        raise exception using errcode = '22023',
          message = 'generation completion does not match existing provenance';
      end if;
      return 'succeeded';
    end if;

    raise exception using errcode = '55000',
      message = 'generation attempt is not current';
  end if;

  if v_job.state <> 'running'
     or v_claim.attempt_number <> v_job.attempt_count then
    raise exception using errcode = '55000',
      message = 'generation attempt is not current';
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

  return 'succeeded';
end;
$$;

create or replace function public.m1_fail_generation_attempt(
  p_event_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_attempt_id uuid,
  p_error_code text,
  p_retry_after_seconds integer default 30
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_event public.outbox_events%rowtype;
  v_job public.generation_jobs%rowtype;
  v_attempt public.generation_job_attempts%rowtype;
  v_claim app_private.m1_generation_attempt_claims%rowtype;
  v_new_state text;
begin
  if p_error_code !~ '^[a-z][a-z0-9_.-]*$' then
    raise exception using errcode = '22023', message = 'invalid error code';
  end if;
  if p_retry_after_seconds not between 0 and 86400 then
    raise exception using errcode = '22023', message = 'invalid retry delay';
  end if;

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
    if v_attempt.status = 'failed'
       and v_attempt.error_code = p_error_code
       and v_job.state in ('failed', 'dead_letter') then
      return v_job.state;
    end if;

    raise exception using errcode = '55000',
      message = 'generation attempt is not current';
  end if;

  if v_job.state <> 'running'
     or v_claim.attempt_number <> v_job.attempt_count then
    raise exception using errcode = '55000',
      message = 'generation attempt is not current';
  end if;

  v_new_state := case
    when v_job.attempt_count >= v_job.max_attempts then 'dead_letter'
    else 'failed'
  end;

  insert into public.generation_job_attempts (
    id, organization_id, generation_job_id, attempt_number, provider, model,
    prompt_checksum, request_schema_id, status, error_code, correlation_id,
    started_at, finished_at
  ) values (
    v_claim.attempt_id, v_claim.organization_id,
    v_claim.generation_job_id, v_claim.attempt_number,
    v_claim.provider, v_claim.model, v_claim.prompt_checksum,
    v_claim.request_schema_id, 'failed', p_error_code,
    v_job.correlation_id, v_claim.started_at, statement_timestamp()
  )
  returning * into v_attempt;

  update public.generation_jobs as j
  set state = v_new_state,
      available_at = case
        when v_new_state = 'failed'
          then statement_timestamp()
            + make_interval(secs => p_retry_after_seconds)
        else available_at
      end,
      last_error_code = p_error_code,
      finished_at = case
        when v_new_state = 'dead_letter' then statement_timestamp()
        else null
      end
  where j.id = v_job.id;

  perform app_private.record_worker_audit(
    v_job.organization_id,
    case
      when v_new_state = 'dead_letter' then 'generation.dead_lettered'
      else 'generation.attempt_failed'
    end,
    v_event.id,
    case
      when v_new_state = 'dead_letter' then 'max_attempts_exceeded'
      else 'attempt_failed'
    end,
    v_job.correlation_id
  );

  return v_new_state;
end;
$$;

revoke all on function app_private.m1_require_generation_event_lease(
  uuid, text, uuid
) from public, anon, authenticated, service_role;

revoke all on function public.m1_claim_generation_events(
  text, integer, integer
) from public, anon, authenticated;
revoke all on function public.m1_begin_generation_attempt(
  uuid, text, uuid, text, text
) from public, anon, authenticated;
revoke all on function public.m1_complete_generation_attempt(
  uuid, text, uuid, uuid, text, text, text, integer
) from public, anon, authenticated;
revoke all on function public.m1_fail_generation_attempt(
  uuid, text, uuid, uuid, text, integer
) from public, anon, authenticated;

grant execute on function public.m1_claim_generation_events(
  text, integer, integer
) to service_role;
grant execute on function public.m1_begin_generation_attempt(
  uuid, text, uuid, text, text
) to service_role;
grant execute on function public.m1_complete_generation_attempt(
  uuid, text, uuid, uuid, text, text, text, integer
) to service_role;
grant execute on function public.m1_fail_generation_attempt(
  uuid, text, uuid, uuid, text, integer
) to service_role;

do $$
declare
  v_role text;
  v_signature text;
begin
  foreach v_signature in array array[
    'public.m1_claim_generation_events(text,integer,integer)',
    'public.m1_begin_generation_attempt(uuid,text,uuid,text,text)',
    'public.m1_complete_generation_attempt(uuid,text,uuid,uuid,text,text,text,integer)',
    'public.m1_fail_generation_attempt(uuid,text,uuid,uuid,text,integer)'
  ]
  loop
    if has_function_privilege('anon', v_signature, 'EXECUTE')
       or has_function_privilege('authenticated', v_signature, 'EXECUTE') then
      raise exception
        'M1.1 verification failed: browser role can execute %',
        v_signature;
    end if;
    if not has_function_privilege('service_role', v_signature, 'EXECUTE') then
      raise exception
        'M1.1 verification failed: service_role cannot execute %',
        v_signature;
    end if;
  end loop;

  foreach v_role in array array['anon', 'authenticated', 'service_role']
  loop
    if has_table_privilege(
      v_role,
      'app_private.m1_generation_attempt_claims',
      'SELECT'
    )
       or has_table_privilege(
         v_role,
         'app_private.m1_generation_attempt_claims',
         'INSERT'
       )
       or has_table_privilege(
         v_role,
         'app_private.m1_generation_attempt_claims',
         'UPDATE'
       )
       or has_table_privilege(
         v_role,
         'app_private.m1_generation_attempt_claims',
         'DELETE'
       ) then
      raise exception
        'M1.1 verification failed: % can access private attempt claims',
        v_role;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'app_private'
      and c.relname = 'm1_generation_attempt_claims'
      and c.relrowsecurity
  ) then
    raise exception
      'M1.1 verification failed: private attempt claims RLS is disabled';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger as t
    join pg_catalog.pg_class as c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'app_private'
      and c.relname = 'm1_generation_attempt_claims'
      and t.tgname = 'm1_generation_attempt_claims_immutable'
      and not t.tgisinternal
  ) then
    raise exception
      'M1.1 verification failed: private attempt claims are mutable';
  end if;
end;
$$;

commit;
