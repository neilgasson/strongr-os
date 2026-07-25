-- Strongr OS
-- Migration: M0.2 Reliability and Operational Proof primitives
--
-- Adds only operational guarantees required by the approved M0.2 gate:
-- leased outbox delivery, retry/dead-letter handling, idempotent receipts,
-- worker heartbeats, machine-readable health, and operational metrics.
-- No publishing, AI provider, Strongr Daily, billing, or recommendation
-- behavior is introduced.

begin;

alter table public.outbox_events
  add column lease_owner text,
  add column lease_token uuid,
  add column lease_expires_at timestamptz,
  add column last_attempt_at timestamptz,
  add column dead_lettered_at timestamptz;

alter table public.outbox_events
  add constraint outbox_events_lease_state_check check (
    (
      status = 'processing'
      and lease_owner is not null
      and lease_token is not null
      and lease_expires_at is not null
    )
    or (
      status <> 'processing'
      and lease_owner is null
      and lease_token is null
      and lease_expires_at is null
    )
  ),
  add constraint outbox_events_delivery_state_check check (
    (status = 'delivered' and delivered_at is not null)
    or (status <> 'delivered' and delivered_at is null)
  ),
  add constraint outbox_events_dead_letter_state_check check (
    (status = 'dead_letter' and dead_lettered_at is not null)
    or (status <> 'dead_letter' and dead_lettered_at is null)
  );

create index outbox_events_expired_lease_idx
  on public.outbox_events (lease_expires_at, created_at, id)
  where status = 'processing';

create table public.outbox_delivery_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  outbox_event_id uuid not null,
  delivery_key text not null
    check (length(btrim(delivery_key)) between 8 and 255),
  delivered_by text not null
    check (length(btrim(delivered_by)) between 1 and 160),
  delivered_at timestamptz not null default now(),
  foreign key (outbox_event_id, organization_id)
    references public.outbox_events(id, organization_id) on delete restrict,
  unique (outbox_event_id),
  unique (organization_id, delivery_key),
  unique (id, organization_id)
);

create table public.worker_heartbeats (
  worker_id text primary key
    check (length(btrim(worker_id)) between 1 and 160),
  status text not null default 'idle'
    check (status in ('idle', 'working', 'degraded', 'stopped')),
  last_claimed_event_id uuid,
  last_error_code text,
  metadata jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(metadata) = 'object'
      and octet_length(metadata::text) <= 16384
    ),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create trigger outbox_delivery_receipts_immutable
before update or delete on public.outbox_delivery_receipts
for each row execute function app_private.reject_mutation();

create or replace function app_private.audit_check_run_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.audit_events (
    organization_id, action, target_type, target_id, reason_code,
    correlation_id, source_channel
  ) values (
    new.organization_id, 'check.run_recorded', 'check_run', new.id,
    new.status, new.correlation_id, 'worker'
  );
  return new;
end;
$$;

create trigger check_runs_record_worker_audit
after insert on public.check_runs
for each row execute function app_private.audit_check_run_insert();

create or replace function app_private.record_worker_audit(
  p_organization_id uuid,
  p_action text,
  p_target_id uuid,
  p_reason_code text,
  p_correlation_id uuid
)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  insert into public.audit_events (
    organization_id, action, target_type, target_id, reason_code,
    correlation_id, source_channel
  ) values (
    p_organization_id, p_action, 'outbox_event', p_target_id, p_reason_code,
    p_correlation_id, 'worker'
  );
$$;

create or replace function app_private.touch_worker(
  p_worker_id text,
  p_status text,
  p_event_id uuid default null,
  p_error_code text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  insert into public.worker_heartbeats (
    worker_id, status, last_claimed_event_id, last_error_code, metadata
  ) values (
    p_worker_id, p_status, p_event_id, p_error_code, p_metadata
  )
  on conflict (worker_id) do update
  set status = excluded.status,
      last_claimed_event_id = coalesce(
        excluded.last_claimed_event_id,
        public.worker_heartbeats.last_claimed_event_id
      ),
      last_error_code = excluded.last_error_code,
      metadata = excluded.metadata,
      last_seen_at = statement_timestamp();
$$;

create or replace function public.m0_heartbeat_worker(
  p_worker_id text,
  p_status text default 'idle',
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if length(btrim(p_worker_id)) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'invalid worker id';
  end if;
  if p_status not in ('idle', 'working', 'degraded', 'stopped') then
    raise exception using errcode = '22023', message = 'invalid worker status';
  end if;
  if jsonb_typeof(p_metadata) <> 'object'
     or octet_length(p_metadata::text) > 16384 then
    raise exception using errcode = '22023', message = 'invalid worker metadata';
  end if;

  perform app_private.touch_worker(
    p_worker_id, p_status, null, null, p_metadata
  );
end;
$$;

create or replace function public.m0_claim_outbox_events(
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
    where (
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
      c.organization_id, 'outbox.claimed', 'outbox_event', c.id,
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

create or replace function public.m0_fail_outbox_event(
  p_event_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_error_code text,
  p_retry_after_seconds integer default 30,
  p_max_attempts integer default 5
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_event public.outbox_events%rowtype;
  v_new_status text;
begin
  if p_error_code !~ '^[a-z][a-z0-9_.-]*$' then
    raise exception using errcode = '22023', message = 'invalid error code';
  end if;
  if p_retry_after_seconds not between 0 and 86400 then
    raise exception using errcode = '22023', message = 'invalid retry delay';
  end if;
  if p_max_attempts not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid max attempts';
  end if;

  select * into v_event
  from public.outbox_events
  where id = p_event_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'outbox event not found';
  end if;
  if v_event.status = 'delivered' then
    return 'delivered';
  end if;
  if v_event.status <> 'processing'
     or v_event.lease_owner <> p_worker_id
     or v_event.lease_token <> p_lease_token
     or v_event.lease_expires_at <= statement_timestamp() then
    raise exception using errcode = '55000', message = 'outbox lease is not owned';
  end if;

  v_new_status := case
    when v_event.attempts >= p_max_attempts then 'dead_letter'
    else 'failed'
  end;

  update public.outbox_events
  set status = v_new_status,
      available_at = case
        when v_new_status = 'failed'
          then statement_timestamp()
            + make_interval(secs => p_retry_after_seconds)
        else available_at
      end,
      dead_lettered_at = case
        when v_new_status = 'dead_letter' then statement_timestamp()
        else null
      end,
      last_error_code = p_error_code,
      lease_owner = null,
      lease_token = null,
      lease_expires_at = null
  where id = p_event_id;

  perform app_private.record_worker_audit(
    v_event.organization_id,
    case
      when v_new_status = 'dead_letter' then 'outbox.dead_lettered'
      else 'outbox.failed'
    end,
    v_event.id,
    case
      when v_new_status = 'dead_letter' then 'max_attempts_exceeded'
      else 'delivery_failed'
    end,
    v_event.correlation_id
  );
  perform app_private.touch_worker(
    p_worker_id,
    case when v_new_status = 'dead_letter' then 'degraded' else 'idle' end,
    p_event_id,
    p_error_code
  );

  return v_new_status;
end;
$$;

create or replace function public.m0_ack_outbox_event(
  p_event_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_delivery_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_event public.outbox_events%rowtype;
  v_receipt_id uuid;
  v_existing_key text;
begin
  if length(btrim(p_delivery_key)) not between 8 and 255 then
    raise exception using errcode = '22023', message = 'invalid delivery key';
  end if;

  select * into v_event
  from public.outbox_events
  where id = p_event_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'outbox event not found';
  end if;

  if v_event.status = 'delivered' then
    select id, delivery_key into v_receipt_id, v_existing_key
    from public.outbox_delivery_receipts
    where outbox_event_id = p_event_id;

    if v_receipt_id is null or v_existing_key <> p_delivery_key then
      raise exception using errcode = '22023',
        message = 'delivery key does not match existing receipt';
    end if;
    return v_receipt_id;
  end if;

  if v_event.status <> 'processing'
     or v_event.lease_owner <> p_worker_id
     or v_event.lease_token <> p_lease_token
     or v_event.lease_expires_at <= statement_timestamp() then
    raise exception using errcode = '55000', message = 'outbox lease is not owned';
  end if;

  insert into public.outbox_delivery_receipts (
    organization_id, outbox_event_id, delivery_key, delivered_by
  ) values (
    v_event.organization_id, v_event.id, p_delivery_key, p_worker_id
  )
  on conflict (outbox_event_id) do nothing
  returning id into v_receipt_id;

  if v_receipt_id is null then
    select id, delivery_key into v_receipt_id, v_existing_key
    from public.outbox_delivery_receipts
    where outbox_event_id = p_event_id;
    if v_existing_key <> p_delivery_key then
      raise exception using errcode = '22023',
        message = 'delivery key does not match existing receipt';
    end if;
  end if;

  update public.outbox_events
  set status = 'delivered',
      delivered_at = statement_timestamp(),
      last_error_code = null,
      lease_owner = null,
      lease_token = null,
      lease_expires_at = null
  where id = p_event_id;

  perform app_private.record_worker_audit(
    v_event.organization_id, 'outbox.delivered', v_event.id,
    'delivery_acknowledged', v_event.correlation_id
  );
  perform app_private.touch_worker(
    p_worker_id, 'idle', p_event_id, null
  );

  return v_receipt_id;
end;
$$;

create or replace function public.m0_operational_health()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with measurements as (
    select
      count(*) filter (
        where status in ('pending', 'failed')
          and available_at <= statement_timestamp()
      )::bigint as outbox_ready,
      count(*) filter (where status = 'processing')::bigint
        as outbox_processing,
      count(*) filter (
        where status = 'processing'
          and lease_expires_at <= statement_timestamp()
      )::bigint as outbox_expired_leases,
      count(*) filter (where status = 'dead_letter')::bigint
        as outbox_dead_letters,
      coalesce(
        extract(epoch from (
          statement_timestamp() - min(created_at) filter (
            where status in ('pending', 'failed')
              and available_at <= statement_timestamp()
          )
        )),
        0
      )::numeric as oldest_ready_age_seconds
    from public.outbox_events
  ),
  workers as (
    select count(*) filter (
      where status <> 'stopped'
        and last_seen_at < statement_timestamp() - interval '5 minutes'
    )::bigint as stale_workers
    from public.worker_heartbeats
  )
  select jsonb_build_object(
    'status', case
      when m.outbox_dead_letters > 0 then 'unhealthy'
      when m.outbox_expired_leases > 0 or w.stale_workers > 0 then 'degraded'
      else 'ok'
    end,
    'checked_at', statement_timestamp(),
    'migration', '202607251200_m0_2_reliability_primitives',
    'outbox_ready', m.outbox_ready,
    'outbox_processing', m.outbox_processing,
    'outbox_expired_leases', m.outbox_expired_leases,
    'outbox_dead_letters', m.outbox_dead_letters,
    'oldest_ready_age_seconds', m.oldest_ready_age_seconds,
    'stale_workers', w.stale_workers
  )
  from measurements m cross join workers w;
$$;

create or replace function public.m0_operational_metrics()
returns table (
  metric_name text,
  metric_value numeric,
  labels jsonb
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select 'strongr_os_outbox_ready', count(*)::numeric, '{}'::jsonb
  from public.outbox_events
  where status in ('pending', 'failed')
    and available_at <= statement_timestamp()
  union all
  select 'strongr_os_outbox_processing', count(*)::numeric, '{}'::jsonb
  from public.outbox_events where status = 'processing'
  union all
  select 'strongr_os_outbox_expired_leases', count(*)::numeric, '{}'::jsonb
  from public.outbox_events
  where status = 'processing'
    and lease_expires_at <= statement_timestamp()
  union all
  select 'strongr_os_outbox_dead_letters', count(*)::numeric, '{}'::jsonb
  from public.outbox_events where status = 'dead_letter'
  union all
  select
    'strongr_os_outbox_oldest_ready_seconds',
    coalesce(
      extract(epoch from statement_timestamp() - min(created_at)),
      0
    )::numeric,
    '{}'::jsonb
  from public.outbox_events
  where status in ('pending', 'failed')
    and available_at <= statement_timestamp()
  union all
  select 'strongr_os_worker_stale', count(*)::numeric, '{}'::jsonb
  from public.worker_heartbeats
  where status <> 'stopped'
    and last_seen_at < statement_timestamp() - interval '5 minutes';
$$;

alter table public.outbox_delivery_receipts enable row level security;
alter table public.worker_heartbeats enable row level security;

revoke all on public.outbox_delivery_receipts, public.worker_heartbeats
from anon, authenticated;

revoke all on function public.m0_heartbeat_worker(text, text, jsonb)
from public, anon, authenticated;
revoke all on function public.m0_claim_outbox_events(text, integer, integer)
from public, anon, authenticated;
revoke all on function public.m0_fail_outbox_event(
  uuid, text, uuid, text, integer, integer
) from public, anon, authenticated;
revoke all on function public.m0_ack_outbox_event(uuid, text, uuid, text)
from public, anon, authenticated;
revoke all on function public.m0_operational_health()
from public, anon, authenticated;
revoke all on function public.m0_operational_metrics()
from public, anon, authenticated;

grant execute on function public.m0_heartbeat_worker(text, text, jsonb)
to service_role;
grant execute on function public.m0_claim_outbox_events(text, integer, integer)
to service_role;
grant execute on function public.m0_fail_outbox_event(
  uuid, text, uuid, text, integer, integer
) to service_role;
grant execute on function public.m0_ack_outbox_event(uuid, text, uuid, text)
to service_role;
grant execute on function public.m0_operational_health()
to service_role;
grant execute on function public.m0_operational_metrics()
to service_role;

revoke all on all functions in schema app_private
from public, anon, authenticated;

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.m0_heartbeat_worker(text,text,jsonb)',
    'public.m0_claim_outbox_events(text,integer,integer)',
    'public.m0_fail_outbox_event(uuid,text,uuid,text,integer,integer)',
    'public.m0_ack_outbox_event(uuid,text,uuid,text)',
    'public.m0_operational_health()',
    'public.m0_operational_metrics()'
  ]
  loop
    if has_function_privilege('anon', v_signature, 'EXECUTE')
       or has_function_privilege('authenticated', v_signature, 'EXECUTE') then
      raise exception 'M0.2 verification failed: browser can execute %',
        v_signature;
    end if;
    if not has_function_privilege('service_role', v_signature, 'EXECUTE') then
      raise exception 'M0.2 verification failed: service_role cannot execute %',
        v_signature;
    end if;
  end loop;
end;
$$;

commit;
