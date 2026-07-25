-- Strongr OS
-- Forward repair: bind generation idempotency to the complete request.
--
-- The original command stored only the brief payload hash. A caller could
-- therefore reuse an idempotency key with a different brief identity, prompt
-- key, or prompt version and receive the earlier job. This repair preserves
-- exact replay while rejecting any changed request.

begin;

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
  v_brief_payload_hash text;
  v_request_fingerprint text;
  v_existing_fingerprint text;
begin
  v_actor := app_private.require_permission(
    p_organization_id, 'content.create'
  );

  select payload_hash into v_brief_payload_hash
  from public.content_briefs
  where id = p_brief_id
    and organization_id = p_organization_id;
  if v_brief_payload_hash is null then
    raise exception using errcode = 'P0002', message = 'brief not found';
  end if;

  v_request_fingerprint := app_private.sha256_jsonb(jsonb_build_object(
    'brief_id', p_brief_id,
    'brief_payload_hash', v_brief_payload_hash,
    'prompt_key', p_prompt_key,
    'prompt_version', p_prompt_version
  ));

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || p_idempotency_key,
      0
    )
  );

  select id, input_hash
  into v_job_id, v_existing_fingerprint
  from public.generation_jobs
  where organization_id = p_organization_id
    and idempotency_key = p_idempotency_key;

  if v_job_id is not null then
    if v_existing_fingerprint <> v_request_fingerprint then
      raise exception using
        errcode = '22023',
        message = 'idempotency key reused with different request';
    end if;
    return v_job_id;
  end if;

  insert into public.generation_jobs (
    organization_id, brief_id, requested_by_membership_id, prompt_key,
    prompt_version, idempotency_key, input_hash, correlation_id
  ) values (
    p_organization_id, p_brief_id, v_actor, p_prompt_key,
    p_prompt_version, p_idempotency_key, v_request_fingerprint,
    p_correlation_id
  )
  returning id into v_job_id;

  insert into public.outbox_events (
    organization_id, event_type, aggregate_type, aggregate_id,
    payload, correlation_id
  ) values (
    p_organization_id, 'content.generation_requested.v1',
    'generation_job', v_job_id,
    jsonb_build_object('job_id', v_job_id), p_correlation_id
  );

  return v_job_id;
end;
$$;

revoke execute on function public.m1_request_generation(
  uuid, uuid, text, integer, text, uuid
) from public, anon;

grant execute on function public.m1_request_generation(
  uuid, uuid, text, integer, text, uuid
) to authenticated;

do $$
begin
  if has_function_privilege(
    'anon',
    'public.m1_request_generation(uuid,uuid,text,integer,text,uuid)',
    'EXECUTE'
  ) then
    raise exception
      'M0.2 idempotency repair failed: anon can request generation';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.m1_request_generation(uuid,uuid,text,integer,text,uuid)',
    'EXECUTE'
  ) then
    raise exception
      'M0.2 idempotency repair failed: authenticated cannot request generation';
  end if;
end;
$$;

commit;
