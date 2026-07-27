-- Strongr OS
-- Migration: M2.1 durable synthetic-media worker
--
-- Adds the AAL2 media-request boundary and service-role-only worker commands.
-- Storage object mutation remains outside PostgreSQL and must use the supported
-- Storage API. No browser Storage mutation, publication, external provider, or
-- Strongr Daily boundary is introduced.

begin;

alter table public.media_job_attempts
  add column provider_correlation_id text
    check (
      provider_correlation_id is null
      or provider_correlation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$'
    );

create table app_private.m2_media_attempt_claims (
  attempt_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  media_job_id uuid not null,
  production_package_id uuid not null,
  output_spec_id uuid not null,
  attempt_number integer not null check (attempt_number > 0),
  event_id uuid not null,
  worker_id text not null check (length(btrim(worker_id)) between 1 and 160),
  lease_token uuid not null,
  adapter_key text not null check (adapter_key ~ '^[a-z][a-z0-9_.-]*$'),
  adapter_version text not null
    check (length(btrim(adapter_version)) between 1 and 100),
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  artifact_id uuid not null,
  object_path text not null check (
    object_path = organization_id::text
      || '/' || production_package_id::text
      || '/' || artifact_id::text || '.wav'
  ),
  started_at timestamptz not null default statement_timestamp(),
  foreign key (
    media_job_id, production_package_id, output_spec_id, organization_id
  )
    references public.media_jobs(
      id, production_package_id, output_spec_id, organization_id
    ) on delete restrict,
  foreign key (event_id, organization_id)
    references public.outbox_events(id, organization_id) on delete restrict,
  unique (media_job_id, attempt_number)
);

alter table app_private.m2_media_attempt_claims enable row level security;

create trigger m2_media_attempt_claims_immutable
before update or delete on app_private.m2_media_attempt_claims
for each row execute function app_private.reject_mutation();

create index m2_media_attempt_claims_event_idx
  on app_private.m2_media_attempt_claims (event_id, organization_id);

revoke all on table app_private.m2_media_attempt_claims
from public, anon, authenticated, service_role;

create or replace function app_private.m2_require_media_event_lease(
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
      message = 'media outbox event not found';
  end if;
  if v_event.event_type <> 'media.generation_requested.v1'
     or v_event.event_version <> 1
     or v_event.aggregate_type <> 'media_job'
     or v_event.payload ->> 'job_id' <> v_event.aggregate_id::text then
    raise exception using errcode = '22023',
      message = 'invalid media outbox event';
  end if;
  if v_event.status <> 'processing'
     or v_event.lease_owner <> p_worker_id
     or v_event.lease_token <> p_lease_token
     or v_event.lease_expires_at <= statement_timestamp() then
    raise exception using errcode = '55000',
      message = 'media outbox lease is not owned';
  end if;

  return v_event;
end;
$$;

create or replace function public.m2_request_media(
  p_organization_id uuid,
  p_production_package_id uuid,
  p_output_spec_id uuid,
  p_adapter_key text,
  p_adapter_version text,
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
  v_manifest_hash text;
  v_spec_hash text;
  v_request_fingerprint text;
  v_existing_fingerprint text;
begin
  if p_adapter_key !~ '^[a-z][a-z0-9_.-]*$' then
    raise exception using errcode = '22023', message = 'invalid adapter key';
  end if;
  if length(btrim(p_adapter_version)) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid adapter version';
  end if;
  if length(btrim(p_idempotency_key)) not between 8 and 255 then
    raise exception using errcode = '22023', message = 'invalid idempotency key';
  end if;

  v_actor := app_private.require_permission(
    p_organization_id, 'media.request', true
  );

  select p.manifest_hash into v_manifest_hash
  from public.production_packages as p
  left join public.approval_revocations as r
    on r.approval_snapshot_id = p.approval_snapshot_id
   and r.organization_id = p.organization_id
  where p.id = p_production_package_id
    and p.organization_id = p_organization_id
    and r.id is null;
  if v_manifest_hash is null then
    raise exception using errcode = '55000',
      message = 'production package is absent or revoked';
  end if;

  select spec_hash into v_spec_hash
  from public.media_output_specs
  where id = p_output_spec_id;
  if v_spec_hash is null then
    raise exception using errcode = 'P0002', message = 'media output spec not found';
  end if;

  v_request_fingerprint := app_private.sha256_jsonb(jsonb_build_object(
    'adapter_key', p_adapter_key,
    'adapter_version', p_adapter_version,
    'output_spec_id', p_output_spec_id,
    'output_spec_hash', v_spec_hash,
    'production_package_id', p_production_package_id,
    'production_package_manifest_hash', v_manifest_hash,
    'request_schema_id', 'strongr.media_request.v1'
  ));

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || p_idempotency_key,
      0
    )
  );

  select id, input_hash
  into v_job_id, v_existing_fingerprint
  from public.media_jobs
  where organization_id = p_organization_id
    and idempotency_key = p_idempotency_key;

  if v_job_id is not null then
    if v_existing_fingerprint <> v_request_fingerprint then
      raise exception using errcode = '22023',
        message = 'idempotency key reused with different media request';
    end if;
    return v_job_id;
  end if;

  insert into public.media_jobs (
    organization_id, production_package_id, output_spec_id,
    requested_by_membership_id, adapter_key, adapter_version,
    idempotency_key, input_hash, correlation_id
  ) values (
    p_organization_id, p_production_package_id, p_output_spec_id,
    v_actor, p_adapter_key, p_adapter_version,
    p_idempotency_key, v_request_fingerprint, p_correlation_id
  )
  returning id into v_job_id;

  insert into public.outbox_events (
    organization_id, event_type, aggregate_type, aggregate_id,
    payload, correlation_id
  ) values (
    p_organization_id, 'media.generation_requested.v1',
    'media_job', v_job_id,
    jsonb_build_object('job_id', v_job_id), p_correlation_id
  );

  perform app_private.record_audit(
    p_organization_id, v_actor, 'media.requested', 'media_job',
    v_job_id, 'media_requested', p_correlation_id
  );

  return v_job_id;
end;
$$;

create or replace function public.m2_claim_media_events(
  p_worker_id text,
  p_batch_size integer default 10,
  p_lease_seconds integer default 120
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
    from public.outbox_events as e
    where e.event_type = 'media.generation_requested.v1'
      and e.event_version = 1
      and e.aggregate_type = 'media_job'
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
    update public.outbox_events as e
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
    from candidates as c
    where e.id = c.id
    returning e.*
  ),
  logged as (
    insert into public.audit_events (
      organization_id, action, target_type, target_id, reason_code,
      correlation_id, source_channel
    )
    select
      c.organization_id, 'media.event_claimed', 'outbox_event', c.id,
      case
        when c.last_error_code = 'lease_expired' then 'lease_recovered'
        else 'delivery_attempt'
      end,
      c.correlation_id, 'worker'
    from claimed as c
    returning id
  )
  select
    c.id, c.organization_id, c.event_type, c.event_version,
    c.aggregate_type, c.aggregate_id, c.payload, c.correlation_id,
    c.causation_id, c.attempts, c.lease_token, c.lease_expires_at
  from claimed as c;
end;
$$;

create or replace function public.m2_begin_media_attempt(
  p_event_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_adapter_key text,
  p_adapter_version text
)
returns table (
  disposition text,
  organization_id uuid,
  media_job_id uuid,
  production_package_id uuid,
  output_spec_id uuid,
  input_hash text,
  correlation_id uuid,
  attempt_id uuid,
  artifact_id uuid,
  object_path text,
  attempt_number integer,
  max_attempts integer,
  bits_per_sample integer,
  channels integer,
  codec text,
  container text,
  max_bytes bigint,
  max_duration_ms integer,
  mime_type text,
  sample_rate_hz integer,
  existing_sha256 text,
  existing_byte_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_event public.outbox_events%rowtype;
  v_job public.media_jobs%rowtype;
  v_spec public.media_output_specs%rowtype;
  v_claim app_private.m2_media_attempt_claims%rowtype;
  v_attempt public.media_job_attempts%rowtype;
  v_artifact public.media_artifacts%rowtype;
  v_package_revoked boolean;
  v_claim_found boolean;
  v_next_attempt integer;
  v_artifact_id uuid;
  v_object_path text;
begin
  if p_adapter_key !~ '^[a-z][a-z0-9_.-]*$' then
    raise exception using errcode = '22023', message = 'invalid adapter key';
  end if;
  if length(btrim(p_adapter_version)) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid adapter version';
  end if;

  v_event := app_private.m2_require_media_event_lease(
    p_event_id, p_worker_id, p_lease_token
  );

  select j.* into v_job
  from public.media_jobs as j
  where j.id = v_event.aggregate_id
    and j.organization_id = v_event.organization_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'media job not found';
  end if;
  if v_job.correlation_id <> v_event.correlation_id
     or v_job.adapter_key <> p_adapter_key
     or v_job.adapter_version <> p_adapter_version then
    raise exception using errcode = '22023',
      message = 'media claim does not match job provenance';
  end if;

  select s.* into v_spec
  from public.media_output_specs as s
  where s.id = v_job.output_spec_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'media output spec not found';
  end if;

  select exists (
    select 1
    from public.production_packages as p
    join public.approval_revocations as r
      on r.approval_snapshot_id = p.approval_snapshot_id
     and r.organization_id = p.organization_id
    where p.id = v_job.production_package_id
      and p.organization_id = v_job.organization_id
  ) into v_package_revoked;

  select c.* into v_claim
  from app_private.m2_media_attempt_claims as c
  where c.media_job_id = v_job.id
    and c.organization_id = v_job.organization_id
  order by c.attempt_number desc
  limit 1;
  v_claim_found := found;

  v_artifact_id := coalesce(v_claim.artifact_id, gen_random_uuid());
  v_object_path := v_job.organization_id::text
    || '/' || v_job.production_package_id::text
    || '/' || v_artifact_id::text || '.wav';

  if v_package_revoked and v_job.state in ('queued', 'failed') then
    update public.media_jobs
    set state = 'cancelled',
        last_error_code = 'package.revoked',
        finished_at = statement_timestamp()
    where id = v_job.id;

    return query select
      'cancelled'::text, v_job.organization_id, v_job.id,
      v_job.production_package_id, v_job.output_spec_id, v_job.input_hash,
      v_job.correlation_id, null::uuid, v_artifact_id, v_object_path,
      v_job.attempt_count, v_job.max_attempts,
      v_spec.bits_per_sample, v_spec.channels, v_spec.codec, v_spec.container,
      v_spec.max_bytes, v_spec.max_duration_ms, v_spec.mime_type,
      v_spec.sample_rate_hz, null::text, null::bigint;
    return;
  elsif v_package_revoked then
    raise exception using errcode = '55000',
      message = 'running media package was revoked';
  end if;

  if v_job.state = 'succeeded' then
    select a.* into v_artifact
    from public.media_artifacts as a
    where a.media_job_id = v_job.id
      and a.organization_id = v_job.organization_id;
    if not found then
      raise exception using errcode = '55000',
        message = 'completed media artifact is missing';
    end if;

    return query select
      'already_succeeded'::text, v_job.organization_id, v_job.id,
      v_job.production_package_id, v_job.output_spec_id, v_job.input_hash,
      v_job.correlation_id, null::uuid, v_artifact.id, v_artifact.object_path,
      v_job.attempt_count, v_job.max_attempts,
      v_spec.bits_per_sample, v_spec.channels, v_spec.codec, v_spec.container,
      v_spec.max_bytes, v_spec.max_duration_ms, v_spec.mime_type,
      v_spec.sample_rate_hz, v_artifact.sha256, v_artifact.byte_count;
    return;
  end if;

  if v_job.state = 'cancelled' then
    return query select
      'cancelled'::text, v_job.organization_id, v_job.id,
      v_job.production_package_id, v_job.output_spec_id, v_job.input_hash,
      v_job.correlation_id, null::uuid, v_artifact_id, v_object_path,
      v_job.attempt_count, v_job.max_attempts,
      v_spec.bits_per_sample, v_spec.channels, v_spec.codec, v_spec.container,
      v_spec.max_bytes, v_spec.max_duration_ms, v_spec.mime_type,
      v_spec.sample_rate_hz, null::text, null::bigint;
    return;
  end if;

  if v_job.state = 'dead_letter' then
    return query select
      'dead_letter'::text, v_job.organization_id, v_job.id,
      v_job.production_package_id, v_job.output_spec_id, v_job.input_hash,
      v_job.correlation_id, null::uuid, v_artifact_id, v_object_path,
      v_job.attempt_count, v_job.max_attempts,
      v_spec.bits_per_sample, v_spec.channels, v_spec.codec, v_spec.container,
      v_spec.max_bytes, v_spec.max_duration_ms, v_spec.mime_type,
      v_spec.sample_rate_hz, null::text, null::bigint;
    return;
  end if;

  if v_job.state = 'running' then
    if not v_claim_found or v_claim.attempt_number <> v_job.attempt_count
       or v_claim.event_id <> v_event.id then
      raise exception using errcode = '55000',
        message = 'current media attempt claim is missing';
    end if;

    if v_claim.worker_id = p_worker_id
       and v_claim.lease_token = p_lease_token then
      if v_claim.adapter_key <> p_adapter_key
         or v_claim.adapter_version <> p_adapter_version
         or v_claim.input_hash <> v_job.input_hash then
        raise exception using errcode = '22023',
          message = 'media begin does not match existing provenance';
      end if;

      return query select
        'ready'::text, v_job.organization_id, v_job.id,
        v_job.production_package_id, v_job.output_spec_id, v_job.input_hash,
        v_job.correlation_id, v_claim.attempt_id, v_claim.artifact_id,
        v_claim.object_path, v_claim.attempt_number, v_job.max_attempts,
        v_spec.bits_per_sample, v_spec.channels, v_spec.codec, v_spec.container,
        v_spec.max_bytes, v_spec.max_duration_ms, v_spec.mime_type,
        v_spec.sample_rate_hz, null::text, null::bigint;
      return;
    end if;

    insert into public.media_job_attempts (
      id, organization_id, media_job_id, attempt_number, adapter_key,
      adapter_version, status, input_hash, error_code, correlation_id,
      started_at, finished_at
    ) values (
      v_claim.attempt_id, v_claim.organization_id, v_claim.media_job_id,
      v_claim.attempt_number, v_claim.adapter_key, v_claim.adapter_version,
      'failed', v_claim.input_hash, 'worker_lease_expired',
      v_job.correlation_id, v_claim.started_at, statement_timestamp()
    )
    returning * into v_attempt;

    if v_job.attempt_count >= v_job.max_attempts then
      update public.media_jobs
      set state = 'dead_letter',
          last_error_code = 'worker_lease_expired',
          finished_at = statement_timestamp()
      where id = v_job.id;

      return query select
        'dead_letter'::text, v_job.organization_id, v_job.id,
        v_job.production_package_id, v_job.output_spec_id, v_job.input_hash,
        v_job.correlation_id, null::uuid, v_claim.artifact_id,
        v_claim.object_path, v_job.attempt_count, v_job.max_attempts,
        v_spec.bits_per_sample, v_spec.channels, v_spec.codec, v_spec.container,
        v_spec.max_bytes, v_spec.max_duration_ms, v_spec.mime_type,
        v_spec.sample_rate_hz, null::text, null::bigint;
      return;
    end if;

    update public.media_jobs
    set state = 'failed',
        last_error_code = 'worker_lease_expired',
        finished_at = null
    where id = v_job.id;
  end if;

  v_next_attempt := v_job.attempt_count + 1;

  insert into app_private.m2_media_attempt_claims (
    organization_id, media_job_id, production_package_id, output_spec_id,
    attempt_number, event_id, worker_id,
    lease_token, adapter_key, adapter_version, input_hash,
    artifact_id, object_path
  ) values (
    v_job.organization_id, v_job.id, v_job.production_package_id,
    v_job.output_spec_id, v_next_attempt, v_event.id, p_worker_id,
    p_lease_token, p_adapter_key, p_adapter_version, v_job.input_hash,
    v_artifact_id, v_object_path
  )
  returning * into v_claim;

  update public.media_jobs
  set state = 'running',
      attempt_count = v_next_attempt,
      started_at = coalesce(started_at, statement_timestamp()),
      finished_at = null,
      last_error_code = null
  where id = v_job.id;

  perform app_private.record_worker_audit(
    v_job.organization_id, 'media.attempt_started', v_event.id,
    'attempt_started', v_job.correlation_id
  );

  return query select
    'ready'::text, v_job.organization_id, v_job.id,
    v_job.production_package_id, v_job.output_spec_id, v_job.input_hash,
    v_job.correlation_id, v_claim.attempt_id, v_claim.artifact_id,
    v_claim.object_path, v_claim.attempt_number, v_job.max_attempts,
    v_spec.bits_per_sample, v_spec.channels, v_spec.codec, v_spec.container,
    v_spec.max_bytes, v_spec.max_duration_ms, v_spec.mime_type,
    v_spec.sample_rate_hz, null::text, null::bigint;
end;
$$;

create or replace function public.m2_complete_media_attempt(
  p_event_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_attempt_id uuid,
  p_mime_type text,
  p_container text,
  p_codec text,
  p_channels integer,
  p_sample_rate_hz integer,
  p_bits_per_sample integer,
  p_duration_ms integer,
  p_byte_count bigint,
  p_sha256 text,
  p_storage_etag text,
  p_validation_schema_id text,
  p_provider_correlation_id text,
  p_latency_ms integer,
  p_cost_microunits bigint
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_event public.outbox_events%rowtype;
  v_job public.media_jobs%rowtype;
  v_spec public.media_output_specs%rowtype;
  v_claim app_private.m2_media_attempt_claims%rowtype;
  v_attempt public.media_job_attempts%rowtype;
  v_artifact public.media_artifacts%rowtype;
begin
  if p_mime_type <> 'audio/wav'
     or p_container <> 'wav'
     or p_codec <> 'pcm_s16le'
     or p_channels <> 1
     or p_sample_rate_hz <> 16000
     or p_bits_per_sample <> 16
     or p_validation_schema_id <> 'strongr.media_validation.v1' then
    raise exception using errcode = '22023',
      message = 'media validation does not match the approved specification';
  end if;
  if p_duration_ms < 1 or p_byte_count < 44
     or p_sha256 !~ '^[a-f0-9]{64}$'
     or p_latency_ms < 0 or p_cost_microunits < 0 then
    raise exception using errcode = '22023',
      message = 'invalid media validation provenance';
  end if;
  if p_storage_etag is not null
     and length(btrim(p_storage_etag)) not between 1 and 255 then
    raise exception using errcode = '22023', message = 'invalid Storage etag';
  end if;
  if p_provider_correlation_id is null
     or p_provider_correlation_id
       !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$' then
    raise exception using errcode = '22023',
      message = 'invalid provider-neutral correlation id';
  end if;

  v_event := app_private.m2_require_media_event_lease(
    p_event_id, p_worker_id, p_lease_token
  );

  select j.* into v_job
  from public.media_jobs as j
  where j.id = v_event.aggregate_id
    and j.organization_id = v_event.organization_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'media job not found';
  end if;

  select s.* into v_spec
  from public.media_output_specs as s
  where s.id = v_job.output_spec_id;
  if not found or p_duration_ms > v_spec.max_duration_ms
     or p_byte_count > v_spec.max_bytes
     or p_mime_type <> v_spec.mime_type
     or p_container <> v_spec.container
     or p_codec <> v_spec.codec
     or p_channels <> v_spec.channels
     or p_sample_rate_hz <> v_spec.sample_rate_hz
     or p_bits_per_sample <> v_spec.bits_per_sample then
    raise exception using errcode = '22023',
      message = 'media bytes exceed or differ from the output specification';
  end if;

  select c.* into v_claim
  from app_private.m2_media_attempt_claims as c
  where c.attempt_id = p_attempt_id
    and c.media_job_id = v_job.id
    and c.organization_id = v_job.organization_id;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'media attempt claim not found';
  end if;
  if v_claim.event_id <> v_event.id
     or v_claim.worker_id <> p_worker_id
     or v_claim.lease_token <> p_lease_token then
    raise exception using errcode = '55000',
      message = 'media attempt is not current';
  end if;

  select a.* into v_attempt
  from public.media_job_attempts as a
  where a.id = p_attempt_id
    and a.media_job_id = v_job.id
    and a.organization_id = v_job.organization_id;

  select a.* into v_artifact
  from public.media_artifacts as a
  where a.media_job_id = v_job.id
    and a.organization_id = v_job.organization_id;
  if found then
    if v_job.state = 'succeeded'
       and v_artifact.id = v_claim.artifact_id
       and v_artifact.successful_attempt_id = p_attempt_id
       and v_artifact.object_path = v_claim.object_path
       and v_artifact.sha256 = p_sha256
       and v_artifact.byte_count = p_byte_count
       and v_artifact.duration_ms = p_duration_ms
       and v_artifact.storage_etag is not distinct from p_storage_etag
       and v_attempt.status = 'succeeded'
       and v_attempt.output_hash = p_sha256
       and v_attempt.byte_count = p_byte_count
       and v_attempt.provider_correlation_id = p_provider_correlation_id
       and v_attempt.latency_ms = p_latency_ms
       and v_attempt.cost_microunits = p_cost_microunits then
      return v_artifact.id;
    end if;
    raise exception using errcode = '55000',
      message = 'media completion conflicts with canonical artifact';
  end if;

  if v_attempt.id is not null or v_job.state <> 'running'
     or v_claim.attempt_number <> v_job.attempt_count then
    raise exception using errcode = '55000',
      message = 'media attempt is not current';
  end if;

  insert into public.media_job_attempts (
    id, organization_id, media_job_id, attempt_number, adapter_key,
    adapter_version, status, input_hash, output_hash, byte_count,
    latency_ms, cost_microunits, provider_correlation_id, correlation_id,
    started_at, finished_at
  ) values (
    v_claim.attempt_id, v_claim.organization_id, v_claim.media_job_id,
    v_claim.attempt_number, v_claim.adapter_key, v_claim.adapter_version,
    'succeeded', v_claim.input_hash, p_sha256, p_byte_count,
    p_latency_ms, p_cost_microunits, p_provider_correlation_id,
    v_job.correlation_id,
    v_claim.started_at, statement_timestamp()
  )
  returning * into v_attempt;

  insert into public.media_artifacts (
    id, organization_id, media_job_id, production_package_id, output_spec_id,
    successful_attempt_id, object_path, mime_type, container, codec, channels,
    sample_rate_hz, bits_per_sample, duration_ms, byte_count, sha256,
    storage_etag, validation_schema_id, validated_at, correlation_id
  ) values (
    v_claim.artifact_id, v_job.organization_id, v_job.id,
    v_job.production_package_id, v_job.output_spec_id, v_claim.attempt_id,
    v_claim.object_path, p_mime_type, p_container, p_codec, p_channels,
    p_sample_rate_hz, p_bits_per_sample, p_duration_ms, p_byte_count, p_sha256,
    p_storage_etag, p_validation_schema_id, statement_timestamp(),
    v_job.correlation_id
  )
  returning * into v_artifact;

  update public.media_jobs
  set state = 'succeeded',
      last_error_code = null,
      finished_at = statement_timestamp()
  where id = v_job.id;

  perform app_private.record_worker_audit(
    v_job.organization_id, 'media.attempt_succeeded', v_event.id,
    'attempt_succeeded', v_job.correlation_id
  );

  return v_artifact.id;
end;
$$;

create or replace function public.m2_fail_media_attempt(
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
  v_job public.media_jobs%rowtype;
  v_claim app_private.m2_media_attempt_claims%rowtype;
  v_attempt public.media_job_attempts%rowtype;
  v_new_state text;
begin
  if p_error_code !~ '^[a-z][a-z0-9_.-]*$' then
    raise exception using errcode = '22023', message = 'invalid error code';
  end if;
  if p_retry_after_seconds not between 0 and 86400 then
    raise exception using errcode = '22023', message = 'invalid retry delay';
  end if;

  v_event := app_private.m2_require_media_event_lease(
    p_event_id, p_worker_id, p_lease_token
  );

  select j.* into v_job
  from public.media_jobs as j
  where j.id = v_event.aggregate_id
    and j.organization_id = v_event.organization_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'media job not found';
  end if;

  select c.* into v_claim
  from app_private.m2_media_attempt_claims as c
  where c.attempt_id = p_attempt_id
    and c.media_job_id = v_job.id
    and c.organization_id = v_job.organization_id;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'media attempt claim not found';
  end if;
  if v_claim.event_id <> v_event.id
     or v_claim.worker_id <> p_worker_id
     or v_claim.lease_token <> p_lease_token then
    raise exception using errcode = '55000',
      message = 'media attempt is not current';
  end if;

  select a.* into v_attempt
  from public.media_job_attempts as a
  where a.id = p_attempt_id
    and a.media_job_id = v_job.id
    and a.organization_id = v_job.organization_id;
  if found then
    if v_attempt.status = 'failed'
       and v_attempt.error_code = p_error_code
       and v_job.state in ('failed', 'dead_letter') then
      return v_job.state;
    end if;
    raise exception using errcode = '55000',
      message = 'media attempt is not current';
  end if;

  if v_job.state <> 'running'
     or v_claim.attempt_number <> v_job.attempt_count then
    raise exception using errcode = '55000',
      message = 'media attempt is not current';
  end if;

  v_new_state := case
    when v_job.attempt_count >= v_job.max_attempts then 'dead_letter'
    else 'failed'
  end;

  insert into public.media_job_attempts (
    id, organization_id, media_job_id, attempt_number, adapter_key,
    adapter_version, status, input_hash, error_code, correlation_id,
    started_at, finished_at
  ) values (
    v_claim.attempt_id, v_claim.organization_id, v_claim.media_job_id,
    v_claim.attempt_number, v_claim.adapter_key, v_claim.adapter_version,
    'failed', v_claim.input_hash, p_error_code, v_job.correlation_id,
    v_claim.started_at, statement_timestamp()
  )
  returning * into v_attempt;

  update public.media_jobs
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
  where id = v_job.id;

  perform app_private.record_worker_audit(
    v_job.organization_id,
    case
      when v_new_state = 'dead_letter' then 'media.dead_lettered'
      else 'media.attempt_failed'
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

create or replace function public.m2_record_media_reconciliation(
  p_event_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_media_artifact_id uuid,
  p_event_type text,
  p_outcome text,
  p_object_path text,
  p_observed_sha256 text,
  p_detail_code text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_event public.outbox_events%rowtype;
  v_job public.media_jobs%rowtype;
  v_reconciliation_id uuid;
  v_expected_path text;
begin
  if p_event_type not in (
    'upload_ambiguous', 'object_missing', 'object_orphaned',
    'checksum_mismatch', 'reconciled'
  ) or p_outcome not in ('detected', 'verified', 'blocked') then
    raise exception using errcode = '22023',
      message = 'invalid media reconciliation classification';
  end if;
  if p_detail_code !~ '^[a-z][a-z0-9_]*$'
     or (
       p_observed_sha256 is not null
       and p_observed_sha256 !~ '^[a-f0-9]{64}$'
     ) then
    raise exception using errcode = '22023',
      message = 'invalid media reconciliation evidence';
  end if;

  v_event := app_private.m2_require_media_event_lease(
    p_event_id, p_worker_id, p_lease_token
  );

  select j.* into v_job
  from public.media_jobs as j
  where j.id = v_event.aggregate_id
    and j.organization_id = v_event.organization_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'media job not found';
  end if;

  select c.object_path into v_expected_path
  from app_private.m2_media_attempt_claims as c
  where c.media_job_id = v_job.id
    and c.organization_id = v_job.organization_id
  order by c.attempt_number desc
  limit 1;
  if v_expected_path is null or p_object_path <> v_expected_path then
    raise exception using errcode = '22023',
      message = 'reconciliation object path is not canonical for media job';
  end if;

  if p_media_artifact_id is not null and not exists (
    select 1
    from public.media_artifacts as a
    where a.id = p_media_artifact_id
      and a.media_job_id = v_job.id
      and a.organization_id = v_job.organization_id
  ) then
    raise exception using errcode = '22023',
      message = 'reconciliation artifact does not match media job';
  end if;

  insert into public.media_reconciliation_events (
    organization_id, media_job_id, media_artifact_id, event_type, outcome,
    object_path, observed_sha256, detail_code, correlation_id
  ) values (
    v_job.organization_id, v_job.id, p_media_artifact_id, p_event_type,
    p_outcome, p_object_path, p_observed_sha256, p_detail_code,
    v_job.correlation_id
  )
  returning id into v_reconciliation_id;

  perform app_private.record_worker_audit(
    v_job.organization_id, 'media.reconciliation_recorded', v_event.id,
    p_detail_code, v_job.correlation_id
  );

  return v_reconciliation_id;
end;
$$;

revoke all on function app_private.m2_require_media_event_lease(
  uuid, text, uuid
) from public, anon, authenticated, service_role;

revoke all on function public.m2_request_media(
  uuid, uuid, uuid, text, text, text, uuid
) from public, anon, service_role;
grant execute on function public.m2_request_media(
  uuid, uuid, uuid, text, text, text, uuid
) to authenticated;

revoke all on function public.m2_claim_media_events(
  text, integer, integer
) from public, anon, authenticated;
revoke all on function public.m2_begin_media_attempt(
  uuid, text, uuid, text, text
) from public, anon, authenticated;
revoke all on function public.m2_complete_media_attempt(
  uuid, text, uuid, uuid, text, text, text, integer, integer, integer,
  integer, bigint, text, text, text, text, integer, bigint
) from public, anon, authenticated;
revoke all on function public.m2_fail_media_attempt(
  uuid, text, uuid, uuid, text, integer
) from public, anon, authenticated;
revoke all on function public.m2_record_media_reconciliation(
  uuid, text, uuid, uuid, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.m2_claim_media_events(
  text, integer, integer
) to service_role;
grant execute on function public.m2_begin_media_attempt(
  uuid, text, uuid, text, text
) to service_role;
grant execute on function public.m2_complete_media_attempt(
  uuid, text, uuid, uuid, text, text, text, integer, integer, integer,
  integer, bigint, text, text, text, text, integer, bigint
) to service_role;
grant execute on function public.m2_fail_media_attempt(
  uuid, text, uuid, uuid, text, integer
) to service_role;
grant execute on function public.m2_record_media_reconciliation(
  uuid, text, uuid, uuid, text, text, text, text, text
) to service_role;

do $$
declare
  v_signature text;
  v_role text;
begin
  if has_function_privilege(
    'anon',
    'public.m2_request_media(uuid,uuid,uuid,text,text,text,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'public.m2_request_media(uuid,uuid,uuid,text,text,text,uuid)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.m2_request_media(uuid,uuid,uuid,text,text,text,uuid)',
    'EXECUTE'
  ) then
    raise exception
      'M2.1 verification failed: media request command grants are invalid';
  end if;

  foreach v_signature in array array[
    'public.m2_claim_media_events(text,integer,integer)',
    'public.m2_begin_media_attempt(uuid,text,uuid,text,text)',
    'public.m2_complete_media_attempt(uuid,text,uuid,uuid,text,text,text,integer,integer,integer,integer,bigint,text,text,text,text,integer,bigint)',
    'public.m2_fail_media_attempt(uuid,text,uuid,uuid,text,integer)',
    'public.m2_record_media_reconciliation(uuid,text,uuid,uuid,text,text,text,text,text)'
  ]
  loop
    if has_function_privilege('anon', v_signature, 'EXECUTE')
       or has_function_privilege('authenticated', v_signature, 'EXECUTE') then
      raise exception
        'M2.1 verification failed: browser role can execute %',
        v_signature;
    end if;
    if not has_function_privilege('service_role', v_signature, 'EXECUTE') then
      raise exception
        'M2.1 verification failed: service_role cannot execute %',
        v_signature;
    end if;
  end loop;

  foreach v_role in array array['anon', 'authenticated', 'service_role']
  loop
    if has_table_privilege(
      v_role, 'app_private.m2_media_attempt_claims', 'SELECT'
    ) or has_table_privilege(
      v_role, 'app_private.m2_media_attempt_claims', 'INSERT'
    ) or has_table_privilege(
      v_role, 'app_private.m2_media_attempt_claims', 'UPDATE'
    ) or has_table_privilege(
      v_role, 'app_private.m2_media_attempt_claims', 'DELETE'
    ) then
      raise exception
        'M2.1 verification failed: % can access private media attempt claims',
        v_role;
    end if;
  end loop;

  if has_table_privilege('service_role', 'public.media_jobs', 'INSERT')
     or has_table_privilege('service_role', 'public.media_jobs', 'UPDATE')
     or has_table_privilege('service_role', 'public.media_artifacts', 'INSERT')
     or has_table_privilege(
       'service_role', 'public.media_reconciliation_events', 'INSERT'
     ) then
    raise exception
      'M2.1 verification failed: service_role can bypass governed commands';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'm2_media_%'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) then
    raise exception
      'M2.1 verification failed: application Storage mutation policy found';
  end if;
end;
$$;

commit;
