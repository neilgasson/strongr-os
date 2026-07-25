-- Strongr OS
-- Migration: M1 Governed Audio Reflection Package
--
-- Implements only the approved M1 path:
-- brief -> draft -> checks -> human reviews -> exact approval -> package.
-- It does not publish, modify Strongr Daily, automate artwork/voice, or add ML.

begin;

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  content_type text not null default 'audio_reflection'
    check (content_type = 'audio_reflection'),
  title text not null check (length(btrim(title)) between 1 and 200),
  status text not null default 'active' check (status in ('active', 'archived')),
  next_version_number integer not null default 1 check (next_version_number > 0),
  created_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (created_by_membership_id, organization_id)
    references public.memberships(id, organization_id) on delete restrict,
  unique (id, organization_id)
);

create table public.content_briefs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  content_item_id uuid not null,
  schema_id text not null default 'strongr.audio_reflection_brief.v1'
    check (schema_id = 'strongr.audio_reflection_brief.v1'),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and octet_length(payload::text) <= 131072
  ),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  created_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (content_item_id, organization_id)
    references public.content_items(id, organization_id) on delete restrict,
  foreign key (created_by_membership_id, organization_id)
    references public.memberships(id, organization_id) on delete restrict,
  unique (id, organization_id)
);

create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  brief_id uuid not null,
  requested_by_membership_id uuid not null,
  prompt_key text not null check (prompt_key ~ '^[a-z][a-z0-9_.-]*$'),
  prompt_version integer not null check (prompt_version > 0),
  state text not null default 'queued'
    check (state in ('queued', 'running', 'succeeded', 'failed', 'dead_letter', 'cancelled')),
  provider text,
  model text,
  provider_response_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  idempotency_key text not null check (length(btrim(idempotency_key)) between 8 and 255),
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  output_hash text check (output_hash is null or output_hash ~ '^[a-f0-9]{64}$'),
  correlation_id uuid not null,
  available_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  foreign key (brief_id, organization_id)
    references public.content_briefs(id, organization_id) on delete restrict,
  foreign key (requested_by_membership_id, organization_id)
    references public.memberships(id, organization_id) on delete restrict,
  unique (organization_id, idempotency_key),
  unique (id, organization_id)
);

create table public.generation_job_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  generation_job_id uuid not null,
  attempt_number integer not null check (attempt_number > 0),
  provider text not null,
  model text not null,
  prompt_checksum text not null check (prompt_checksum ~ '^[a-f0-9]{64}$'),
  request_schema_id text not null,
  response_schema_id text,
  provider_response_id text,
  status text not null check (status in ('started', 'succeeded', 'failed')),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  cost_microunits bigint check (cost_microunits is null or cost_microunits >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error_code text,
  correlation_id uuid not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (generation_job_id, organization_id)
    references public.generation_jobs(id, organization_id) on delete restrict,
  unique (generation_job_id, attempt_number),
  unique (id, organization_id)
);

create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  content_item_id uuid not null,
  brief_id uuid not null,
  version_number integer not null check (version_number > 0),
  schema_id text not null default 'strongr.audio_reflection.v1'
    check (schema_id = 'strongr.audio_reflection.v1'),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and octet_length(payload::text) <= 524288
  ),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  source text not null check (source in ('manual', 'ai_assisted')),
  source_job_id uuid,
  supersedes_version_id uuid,
  state text not null default 'draft'
    check (state in ('draft', 'submitted', 'superseded')),
  created_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  superseded_at timestamptz,
  foreign key (content_item_id, organization_id)
    references public.content_items(id, organization_id) on delete restrict,
  foreign key (brief_id, organization_id)
    references public.content_briefs(id, organization_id) on delete restrict,
  foreign key (source_job_id, organization_id)
    references public.generation_jobs(id, organization_id) on delete restrict,
  foreign key (supersedes_version_id, organization_id)
    references public.content_versions(id, organization_id) on delete restrict,
  foreign key (created_by_membership_id, organization_id)
    references public.memberships(id, organization_id) on delete restrict,
  unique (content_item_id, version_number),
  unique (id, organization_id),
  check (
    (source = 'manual' and source_job_id is null)
    or (source = 'ai_assisted' and source_job_id is not null)
  ),
  check (
    (state = 'draft' and submitted_at is null and superseded_at is null)
    or (state = 'submitted' and submitted_at is not null and superseded_at is null)
    or (state = 'superseded' and superseded_at is not null)
  )
);

create table public.check_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null check (key ~ '^[a-z][a-z0-9_.-]*$'),
  version integer not null check (version > 0),
  name text not null check (length(btrim(name)) between 1 and 160),
  lane text not null
    check (lane in ('scripture', 'pastoral', 'editorial', 'rights', 'accessibility', 'narration')),
  blocks_approval boolean not null,
  created_at timestamptz not null default now(),
  unique (key, version)
);

create table public.check_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  content_version_id uuid not null,
  engine_key text not null check (engine_key ~ '^[a-z][a-z0-9_.-]*$'),
  engine_version text not null check (length(btrim(engine_version)) between 1 and 100),
  status text not null check (status in ('completed', 'failed')),
  artifact_hash text not null check (artifact_hash ~ '^[a-f0-9]{64}$'),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (content_version_id, organization_id)
    references public.content_versions(id, organization_id) on delete restrict,
  unique (id, organization_id)
);

create table public.check_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  check_run_id uuid not null,
  check_definition_id uuid not null references public.check_definitions(id) on delete restrict,
  outcome text not null check (outcome in ('pass', 'warn', 'fail', 'error')),
  detail_code text not null check (detail_code ~ '^[a-z][a-z0-9_.-]*$'),
  evidence jsonb not null default '{}'::jsonb check (
    jsonb_typeof(evidence) = 'object'
    and octet_length(evidence::text) <= 65536
  ),
  created_at timestamptz not null default now(),
  foreign key (check_run_id, organization_id)
    references public.check_runs(id, organization_id) on delete restrict,
  unique (check_run_id, check_definition_id),
  unique (id, organization_id)
);

create table public.scripture_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  content_version_id uuid not null,
  reference text not null check (length(btrim(reference)) between 1 and 160),
  translation text not null check (length(btrim(translation)) between 1 and 80),
  source_citation text not null check (length(btrim(source_citation)) between 1 and 500),
  verification_status text not null check (verification_status in ('verified', 'blocked')),
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  created_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (content_version_id, organization_id)
    references public.content_versions(id, organization_id) on delete restrict,
  foreign key (created_by_membership_id, organization_id)
    references public.memberships(id, organization_id) on delete restrict,
  unique (id, organization_id)
);

create table public.rights_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  content_version_id uuid not null,
  status text not null check (status in ('cleared', 'blocked')),
  source_summary text not null check (length(btrim(source_summary)) between 1 and 2000),
  snapshot_hash text not null check (snapshot_hash ~ '^[a-f0-9]{64}$'),
  created_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (content_version_id, organization_id)
    references public.content_versions(id, organization_id) on delete restrict,
  foreign key (created_by_membership_id, organization_id)
    references public.memberships(id, organization_id) on delete restrict,
  unique (id, organization_id)
);

create table public.review_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  key text not null check (key ~ '^[a-z][a-z0-9_.-]*$'),
  version integer not null check (version > 0),
  policy_hash text not null check (policy_hash ~ '^[a-f0-9]{64}$'),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, key, version),
  unique (id, organization_id)
);

create table public.review_policy_lanes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  review_policy_id uuid not null,
  lane text not null check (lane in ('scripture', 'theology', 'editorial')),
  foreign key (review_policy_id, organization_id)
    references public.review_policies(id, organization_id) on delete restrict,
  unique (review_policy_id, lane),
  unique (id, organization_id)
);

create table public.review_policy_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  review_policy_id uuid not null,
  check_definition_id uuid not null references public.check_definitions(id) on delete restrict,
  required_outcome text not null default 'pass'
    check (required_outcome in ('pass', 'pass_or_warn')),
  foreign key (review_policy_id, organization_id)
    references public.review_policies(id, organization_id) on delete restrict,
  unique (review_policy_id, check_definition_id),
  unique (id, organization_id)
);

create table public.review_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  content_version_id uuid not null,
  lane text not null check (lane in ('scripture', 'theology', 'editorial')),
  decision text not null check (decision in ('approved', 'changes_requested', 'rejected')),
  reviewer_membership_id uuid not null,
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]*$'),
  evidence jsonb not null default '{}'::jsonb check (
    jsonb_typeof(evidence) = 'object'
    and octet_length(evidence::text) <= 65536
  ),
  created_at timestamptz not null default now(),
  foreign key (content_version_id, organization_id)
    references public.content_versions(id, organization_id) on delete restrict,
  foreign key (reviewer_membership_id, organization_id)
    references public.memberships(id, organization_id) on delete restrict,
  unique (id, organization_id)
);

create table public.approval_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  content_version_id uuid not null,
  review_policy_id uuid not null,
  check_run_id uuid not null,
  scripture_evidence_id uuid not null,
  rights_snapshot_id uuid not null,
  approver_membership_id uuid not null,
  version_payload_hash text not null check (version_payload_hash ~ '^[a-f0-9]{64}$'),
  evidence_bundle_hash text not null check (evidence_bundle_hash ~ '^[a-f0-9]{64}$'),
  authentication_assurance text not null check (authentication_assurance = 'aal2'),
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]*$'),
  approved_at timestamptz not null default now(),
  foreign key (content_version_id, organization_id)
    references public.content_versions(id, organization_id) on delete restrict,
  foreign key (review_policy_id, organization_id)
    references public.review_policies(id, organization_id) on delete restrict,
  foreign key (check_run_id, organization_id)
    references public.check_runs(id, organization_id) on delete restrict,
  foreign key (scripture_evidence_id, organization_id)
    references public.scripture_evidence(id, organization_id) on delete restrict,
  foreign key (rights_snapshot_id, organization_id)
    references public.rights_snapshots(id, organization_id) on delete restrict,
  foreign key (approver_membership_id, organization_id)
    references public.memberships(id, organization_id) on delete restrict,
  unique (id, organization_id)
);

create table public.approval_review_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  approval_snapshot_id uuid not null,
  review_decision_id uuid not null,
  foreign key (approval_snapshot_id, organization_id)
    references public.approval_snapshots(id, organization_id) on delete restrict,
  foreign key (review_decision_id, organization_id)
    references public.review_decisions(id, organization_id) on delete restrict,
  unique (approval_snapshot_id, review_decision_id),
  unique (id, organization_id)
);

create table public.approval_check_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  approval_snapshot_id uuid not null,
  check_result_id uuid not null,
  foreign key (approval_snapshot_id, organization_id)
    references public.approval_snapshots(id, organization_id) on delete restrict,
  foreign key (check_result_id, organization_id)
    references public.check_results(id, organization_id) on delete restrict,
  unique (approval_snapshot_id, check_result_id),
  unique (id, organization_id)
);

create table public.approval_revocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  approval_snapshot_id uuid not null,
  revoked_by_membership_id uuid not null,
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]*$'),
  revoked_at timestamptz not null default now(),
  foreign key (approval_snapshot_id, organization_id)
    references public.approval_snapshots(id, organization_id) on delete restrict,
  foreign key (revoked_by_membership_id, organization_id)
    references public.memberships(id, organization_id) on delete restrict,
  unique (approval_snapshot_id),
  unique (id, organization_id)
);

create table public.workflow_transitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  content_version_id uuid not null,
  from_state text,
  to_state text not null check (to_state in ('draft', 'submitted', 'superseded', 'approved', 'revoked', 'packaged')),
  actor_membership_id uuid not null,
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]*$'),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (content_version_id, organization_id)
    references public.content_versions(id, organization_id) on delete restrict,
  foreign key (actor_membership_id, organization_id)
    references public.memberships(id, organization_id) on delete restrict,
  unique (id, organization_id)
);

create table public.production_packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  approval_snapshot_id uuid not null,
  manifest_schema_id text not null default 'strongr.production_package.v1'
    check (manifest_schema_id = 'strongr.production_package.v1'),
  manifest jsonb not null check (
    jsonb_typeof(manifest) = 'object'
    and octet_length(manifest::text) <= 131072
  ),
  manifest_hash text not null check (manifest_hash ~ '^[a-f0-9]{64}$'),
  created_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (approval_snapshot_id, organization_id)
    references public.approval_snapshots(id, organization_id) on delete restrict,
  foreign key (created_by_membership_id, organization_id)
    references public.memberships(id, organization_id) on delete restrict,
  unique (approval_snapshot_id),
  unique (id, organization_id)
);

create index content_items_org_status_idx
  on public.content_items (organization_id, status, updated_at desc);
create index content_versions_item_idx
  on public.content_versions (organization_id, content_item_id, version_number desc);
create index generation_jobs_ready_idx
  on public.generation_jobs (available_at, created_at, id)
  where state in ('queued', 'failed');
create index review_decisions_version_lane_idx
  on public.review_decisions (organization_id, content_version_id, lane, created_at desc);
create index workflow_transitions_version_idx
  on public.workflow_transitions (organization_id, content_version_id, created_at, id);

create trigger content_items_set_updated_at before update on public.content_items
for each row execute function app_private.set_updated_at();

create or replace function app_private.guard_content_version_update()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if row(
    old.organization_id, old.content_item_id, old.brief_id, old.version_number,
    old.schema_id, old.payload, old.payload_hash, old.source, old.source_job_id,
    old.supersedes_version_id, old.created_by_membership_id, old.created_at
  ) is distinct from row(
    new.organization_id, new.content_item_id, new.brief_id, new.version_number,
    new.schema_id, new.payload, new.payload_hash, new.source, new.source_job_id,
    new.supersedes_version_id, new.created_by_membership_id, new.created_at
  ) then
    raise exception using errcode = '55000', message = 'content version payload is immutable';
  end if;

  if not (
    (old.state = 'draft' and new.state in ('submitted', 'superseded'))
    or (old.state = 'submitted' and new.state = 'superseded')
  ) then
    raise exception using errcode = '55000', message = 'illegal content version transition';
  end if;
  return new;
end;
$$;

create trigger content_versions_guard before update on public.content_versions
for each row execute function app_private.guard_content_version_update();
create trigger content_versions_no_delete before delete on public.content_versions
for each row execute function app_private.reject_mutation();

create or replace function app_private.guard_review_policy_update()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if row(
    old.id, old.organization_id, old.key, old.version,
    old.policy_hash, old.created_at
  ) is distinct from row(
    new.id, new.organization_id, new.key, new.version,
    new.policy_hash, new.created_at
  ) or not (old.is_active and not new.is_active) then
    raise exception using errcode = '55000', message = 'review policy is immutable';
  end if;
  return new;
end;
$$;

create trigger review_policies_guard before update on public.review_policies
for each row execute function app_private.guard_review_policy_update();
create trigger review_policies_no_delete before delete on public.review_policies
for each row execute function app_private.reject_mutation();

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'content_briefs', 'generation_job_attempts', 'check_definitions', 'check_runs',
    'check_results', 'scripture_evidence', 'rights_snapshots',
    'review_policy_lanes', 'review_policy_checks', 'review_decisions',
    'approval_snapshots', 'approval_review_decisions', 'approval_check_results',
    'approval_revocations', 'workflow_transitions', 'production_packages'
  ]
  loop
    execute format(
      'create trigger %I before update or delete on public.%I
       for each row execute function app_private.reject_mutation()',
      v_table || '_immutable', v_table
    );
  end loop;
end;
$$;

create or replace function app_private.sha256_jsonb(p_value jsonb)
returns text
language sql
immutable
strict
set search_path = pg_catalog, extensions
as $$
  select encode(digest(convert_to(p_value::text, 'utf8'), 'sha256'), 'hex');
$$;

create or replace function app_private.record_audit(
  p_organization_id uuid,
  p_actor_membership_id uuid,
  p_action text,
  p_target_type text,
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
    organization_id, actor_profile_id, actor_membership_id, action,
    target_type, target_id, reason_code, correlation_id, source_channel
  )
  select p_organization_id, m.profile_id, m.id, p_action,
    p_target_type, p_target_id, p_reason_code, p_correlation_id, 'api'
  from public.memberships m
  where m.id = p_actor_membership_id
    and m.organization_id = p_organization_id;
$$;

create or replace function public.m1_create_review_policy(
  p_organization_id uuid,
  p_key text,
  p_version integer,
  p_correlation_id uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor uuid;
  v_policy_id uuid;
  v_policy_hash text;
begin
  v_actor := app_private.require_permission(p_organization_id, 'role.manage', true);
  if p_key !~ '^[a-z][a-z0-9_.-]*$' or p_version <= 0 then
    raise exception using errcode = '22023', message = 'invalid review policy identity';
  end if;

  update public.review_policies
  set is_active = false
  where organization_id = p_organization_id
    and key = p_key
    and is_active;

  v_policy_hash := app_private.sha256_jsonb(jsonb_build_object(
    'key', p_key,
    'version', p_version,
    'lanes', jsonb_build_array('editorial', 'scripture', 'theology'),
    'checks', (
      select jsonb_agg(
        jsonb_build_object(
          'definition_id', d.id,
          'key', d.key,
          'version', d.version,
          'required_outcome', case when d.blocks_approval then 'pass' else 'pass_or_warn' end
        ) order by d.key, d.version
      )
      from public.check_definitions d
    )
  ));

  insert into public.review_policies (
    organization_id, key, version, policy_hash, is_active
  ) values (
    p_organization_id, p_key, p_version, v_policy_hash, true
  ) returning id into v_policy_id;

  insert into public.review_policy_lanes (organization_id, review_policy_id, lane)
  values
    (p_organization_id, v_policy_id, 'scripture'),
    (p_organization_id, v_policy_id, 'theology'),
    (p_organization_id, v_policy_id, 'editorial');

  insert into public.review_policy_checks (
    organization_id, review_policy_id, check_definition_id, required_outcome
  )
  select p_organization_id, v_policy_id, d.id,
    case when d.blocks_approval then 'pass' else 'pass_or_warn' end
  from public.check_definitions d;

  perform app_private.record_audit(
    p_organization_id, v_actor, 'review.policy_created', 'review_policy',
    v_policy_id, 'policy_activated', p_correlation_id
  );
  return v_policy_id;
end;
$$;

create or replace function public.m1_create_audio_brief(
  p_organization_id uuid,
  p_title text,
  p_payload jsonb,
  p_correlation_id uuid default gen_random_uuid()
)
returns table (content_item_id uuid, brief_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor uuid;
  v_item uuid;
  v_brief uuid;
begin
  v_actor := app_private.require_permission(p_organization_id, 'content.create');
  if jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 131072 then
    raise exception using errcode = '22023', message = 'invalid brief payload';
  end if;

  insert into public.content_items (
    organization_id, title, created_by_membership_id
  ) values (
    p_organization_id, p_title, v_actor
  ) returning id into v_item;

  insert into public.content_briefs (
    organization_id, content_item_id, payload, payload_hash, created_by_membership_id
  ) values (
    p_organization_id, v_item, p_payload,
    app_private.sha256_jsonb(p_payload), v_actor
  ) returning id into v_brief;

  perform app_private.record_audit(
    p_organization_id, v_actor, 'content.brief_created', 'content_brief',
    v_brief, 'created', p_correlation_id
  );

  return query select v_item, v_brief;
end;
$$;

create or replace function public.m1_create_manual_version(
  p_organization_id uuid,
  p_content_item_id uuid,
  p_brief_id uuid,
  p_payload jsonb,
  p_supersedes_version_id uuid default null,
  p_correlation_id uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor uuid;
  v_version_number integer;
  v_version_id uuid;
begin
  v_actor := app_private.require_permission(p_organization_id, 'content.create');
  if jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 524288 then
    raise exception using errcode = '22023', message = 'invalid content payload';
  end if;

  update public.content_items
  set next_version_number = next_version_number + 1
  where id = p_content_item_id and organization_id = p_organization_id
  returning next_version_number - 1 into v_version_number;
  if v_version_number is null then
    raise exception using errcode = 'P0002', message = 'content item not found';
  end if;

  if not exists (
    select 1 from public.content_briefs b
    where b.id = p_brief_id
      and b.content_item_id = p_content_item_id
      and b.organization_id = p_organization_id
  ) then
    raise exception using errcode = '23503', message = 'brief does not belong to content item';
  end if;

  if p_supersedes_version_id is not null then
    if not exists (
      select 1 from public.content_versions v
      where v.id = p_supersedes_version_id
        and v.content_item_id = p_content_item_id
        and v.organization_id = p_organization_id
        and v.state in ('draft', 'submitted')
    ) then
      raise exception using errcode = '23503', message = 'superseded version is invalid';
    end if;
    update public.content_versions
    set state = 'superseded', superseded_at = now()
    where id = p_supersedes_version_id
      and organization_id = p_organization_id;
  end if;

  insert into public.content_versions (
    organization_id, content_item_id, brief_id, version_number, payload,
    payload_hash, source, supersedes_version_id, created_by_membership_id
  ) values (
    p_organization_id, p_content_item_id, p_brief_id, v_version_number, p_payload,
    app_private.sha256_jsonb(p_payload), 'manual', p_supersedes_version_id, v_actor
  ) returning id into v_version_id;

  insert into public.workflow_transitions (
    organization_id, content_version_id, from_state, to_state,
    actor_membership_id, reason_code, correlation_id
  ) values (
    p_organization_id, v_version_id, null, 'draft',
    v_actor, 'version_created', p_correlation_id
  );

  perform app_private.record_audit(
    p_organization_id, v_actor, 'content.version_created', 'content_version',
    v_version_id, 'manual_draft', p_correlation_id
  );
  return v_version_id;
end;
$$;

create or replace function public.m1_submit_version(
  p_organization_id uuid,
  p_content_version_id uuid,
  p_correlation_id uuid default gen_random_uuid()
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor uuid;
begin
  v_actor := app_private.require_permission(p_organization_id, 'content.submit');
  update public.content_versions
  set state = 'submitted', submitted_at = now()
  where id = p_content_version_id
    and organization_id = p_organization_id
    and state = 'draft';
  if not found then
    raise exception using errcode = '55000', message = 'only a draft may be submitted';
  end if;

  insert into public.workflow_transitions (
    organization_id, content_version_id, from_state, to_state,
    actor_membership_id, reason_code, correlation_id
  ) values (
    p_organization_id, p_content_version_id, 'draft', 'submitted',
    v_actor, 'submitted_for_review', p_correlation_id
  );
  perform app_private.record_audit(
    p_organization_id, v_actor, 'content.version_submitted', 'content_version',
    p_content_version_id, 'submitted_for_review', p_correlation_id
  );
end;
$$;

create or replace function public.m1_record_scripture_evidence(
  p_organization_id uuid,
  p_content_version_id uuid,
  p_reference text,
  p_translation text,
  p_source_citation text,
  p_verification_status text,
  p_correlation_id uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor uuid;
  v_id uuid;
  v_hash text;
begin
  v_actor := app_private.require_permission(p_organization_id, 'review.scripture', true);
  if not exists (
    select 1 from public.content_versions
    where id = p_content_version_id
      and organization_id = p_organization_id
      and state = 'submitted'
  ) then
    raise exception using errcode = '55000', message = 'version is not submitted';
  end if;

  v_hash := app_private.sha256_jsonb(jsonb_build_object(
    'version_id', p_content_version_id,
    'reference', p_reference,
    'translation', p_translation,
    'source_citation', p_source_citation,
    'verification_status', p_verification_status
  ));
  insert into public.scripture_evidence (
    organization_id, content_version_id, reference, translation,
    source_citation, verification_status, evidence_hash, created_by_membership_id
  ) values (
    p_organization_id, p_content_version_id, p_reference, p_translation,
    p_source_citation, p_verification_status, v_hash, v_actor
  ) returning id into v_id;
  perform app_private.record_audit(
    p_organization_id, v_actor, 'evidence.scripture_recorded', 'scripture_evidence',
    v_id, p_verification_status, p_correlation_id
  );
  return v_id;
end;
$$;

create or replace function public.m1_record_rights_snapshot(
  p_organization_id uuid,
  p_content_version_id uuid,
  p_status text,
  p_source_summary text,
  p_correlation_id uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor uuid;
  v_id uuid;
  v_hash text;
begin
  v_actor := app_private.require_permission(p_organization_id, 'review.editorial', true);
  if not exists (
    select 1 from public.content_versions
    where id = p_content_version_id
      and organization_id = p_organization_id
      and state = 'submitted'
  ) then
    raise exception using errcode = '55000', message = 'version is not submitted';
  end if;
  v_hash := app_private.sha256_jsonb(jsonb_build_object(
    'version_id', p_content_version_id,
    'status', p_status,
    'source_summary', p_source_summary
  ));
  insert into public.rights_snapshots (
    organization_id, content_version_id, status, source_summary,
    snapshot_hash, created_by_membership_id
  ) values (
    p_organization_id, p_content_version_id, p_status, p_source_summary,
    v_hash, v_actor
  ) returning id into v_id;
  perform app_private.record_audit(
    p_organization_id, v_actor, 'evidence.rights_recorded', 'rights_snapshot',
    v_id, p_status, p_correlation_id
  );
  return v_id;
end;
$$;

create or replace function public.m1_record_check_run(
  p_organization_id uuid,
  p_content_version_id uuid,
  p_engine_key text,
  p_engine_version text,
  p_status text,
  p_results jsonb,
  p_correlation_id uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_run_id uuid;
  v_result jsonb;
  v_artifact_hash text;
begin
  if jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) = 0 then
    raise exception using errcode = '22023', message = 'check results must be a non-empty array';
  end if;
  if not exists (
    select 1 from public.content_versions
    where id = p_content_version_id
      and organization_id = p_organization_id
      and state = 'submitted'
  ) then
    raise exception using errcode = '55000', message = 'version is not submitted';
  end if;

  v_artifact_hash := app_private.sha256_jsonb(jsonb_build_object(
    'engine_key', p_engine_key,
    'engine_version', p_engine_version,
    'status', p_status,
    'results', p_results
  ));
  insert into public.check_runs (
    organization_id, content_version_id, engine_key, engine_version,
    status, artifact_hash, correlation_id
  ) values (
    p_organization_id, p_content_version_id, p_engine_key, p_engine_version,
    p_status, v_artifact_hash, p_correlation_id
  ) returning id into v_run_id;

  for v_result in select value from jsonb_array_elements(p_results)
  loop
    insert into public.check_results (
      organization_id, check_run_id, check_definition_id,
      outcome, detail_code, evidence
    ) values (
      p_organization_id, v_run_id, (v_result ->> 'check_definition_id')::uuid,
      v_result ->> 'outcome', v_result ->> 'detail_code',
      coalesce(v_result -> 'evidence', '{}'::jsonb)
    );
  end loop;
  return v_run_id;
end;
$$;

create or replace function public.m1_record_review(
  p_organization_id uuid,
  p_content_version_id uuid,
  p_lane text,
  p_decision text,
  p_reason_code text,
  p_evidence jsonb default '{}'::jsonb,
  p_correlation_id uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor uuid;
  v_permission text;
  v_review_id uuid;
begin
  v_permission := case p_lane
    when 'scripture' then 'review.scripture'
    when 'theology' then 'review.theology'
    when 'editorial' then 'review.editorial'
    else null
  end;
  if v_permission is null then
    raise exception using errcode = '22023', message = 'invalid review lane';
  end if;
  v_actor := app_private.require_permission(p_organization_id, v_permission, true);

  if not exists (
    select 1 from public.content_versions
    where id = p_content_version_id
      and organization_id = p_organization_id
      and state = 'submitted'
  ) then
    raise exception using errcode = '55000', message = 'version is not submitted';
  end if;

  insert into public.review_decisions (
    organization_id, content_version_id, lane, decision,
    reviewer_membership_id, reason_code, evidence
  ) values (
    p_organization_id, p_content_version_id, p_lane, p_decision,
    v_actor, p_reason_code, p_evidence
  ) returning id into v_review_id;

  perform app_private.record_audit(
    p_organization_id, v_actor, 'review.decision_recorded', 'review_decision',
    v_review_id, p_reason_code, p_correlation_id
  );
  return v_review_id;
end;
$$;

create or replace function public.m1_approve_version(
  p_organization_id uuid,
  p_content_version_id uuid,
  p_review_policy_id uuid,
  p_check_run_id uuid,
  p_scripture_evidence_id uuid,
  p_rights_snapshot_id uuid,
  p_scripture_review_id uuid,
  p_theology_review_id uuid,
  p_editorial_review_id uuid,
  p_reason_code text,
  p_correlation_id uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor uuid;
  v_version_hash text;
  v_approval_id uuid;
  v_bundle_hash text;
begin
  v_actor := app_private.require_permission(p_organization_id, 'approval.grant', true);
  perform pg_advisory_xact_lock(hashtextextended(p_content_version_id::text, 0));

  select payload_hash into v_version_hash
  from public.content_versions
  where id = p_content_version_id
    and organization_id = p_organization_id
    and state = 'submitted'
  for update;
  if v_version_hash is null then
    raise exception using errcode = '55000', message = 'version is not approvable';
  end if;

  if exists (
    select 1
    from public.approval_snapshots a
    left join public.approval_revocations ar on ar.approval_snapshot_id = a.id
    where a.content_version_id = p_content_version_id
      and a.organization_id = p_organization_id
      and ar.id is null
  ) then
    raise exception using errcode = '23505', message = 'active approval already exists';
  end if;

  if not exists (
    select 1 from public.review_policies p
    where p.id = p_review_policy_id
      and p.organization_id = p_organization_id
      and p.is_active
  ) then
    raise exception using errcode = '55000', message = 'review policy is not active';
  end if;

  if not exists (
    select 1 from public.check_runs cr
    where cr.id = p_check_run_id
      and cr.organization_id = p_organization_id
      and cr.content_version_id = p_content_version_id
      and cr.status = 'completed'
  ) then
    raise exception using errcode = '55000', message = 'check run is not valid';
  end if;

  if exists (
    select 1
    from public.review_policy_checks rpc
    left join public.check_results r
      on r.check_run_id = p_check_run_id
     and r.check_definition_id = rpc.check_definition_id
     and r.organization_id = p_organization_id
    where rpc.review_policy_id = p_review_policy_id
      and rpc.organization_id = p_organization_id
      and (
        r.id is null
        or (rpc.required_outcome = 'pass' and r.outcome <> 'pass')
        or (rpc.required_outcome = 'pass_or_warn' and r.outcome not in ('pass', 'warn'))
      )
  ) then
    raise exception using errcode = '55000', message = 'required automated checks did not pass';
  end if;

  if not exists (
    select 1 from public.scripture_evidence se
    where se.id = p_scripture_evidence_id
      and se.organization_id = p_organization_id
      and se.content_version_id = p_content_version_id
      and se.verification_status = 'verified'
  ) or not exists (
    select 1 from public.rights_snapshots rs
    where rs.id = p_rights_snapshot_id
      and rs.organization_id = p_organization_id
      and rs.content_version_id = p_content_version_id
      and rs.status = 'cleared'
  ) then
    raise exception using errcode = '55000', message = 'Scripture or rights evidence is not cleared';
  end if;

  if exists (
    select 1
    from (
      values
        (p_scripture_review_id, 'scripture'::text),
        (p_theology_review_id, 'theology'::text),
        (p_editorial_review_id, 'editorial'::text)
    ) required(review_id, lane)
    left join public.review_decisions rd
      on rd.id = required.review_id
     and rd.organization_id = p_organization_id
     and rd.content_version_id = p_content_version_id
     and rd.lane = required.lane
     and rd.decision = 'approved'
    where rd.id is null
  ) then
    raise exception using errcode = '55000', message = 'required human reviews are missing';
  end if;

  v_bundle_hash := app_private.sha256_jsonb(jsonb_build_object(
    'version_id', p_content_version_id,
    'version_hash', v_version_hash,
    'policy_id', p_review_policy_id,
    'check_run_id', p_check_run_id,
    'scripture_evidence_id', p_scripture_evidence_id,
    'rights_snapshot_id', p_rights_snapshot_id,
    'review_ids', jsonb_build_array(
      p_scripture_review_id, p_theology_review_id, p_editorial_review_id
    )
  ));

  insert into public.approval_snapshots (
    organization_id, content_version_id, review_policy_id, check_run_id,
    scripture_evidence_id, rights_snapshot_id, approver_membership_id,
    version_payload_hash, evidence_bundle_hash, authentication_assurance, reason_code
  ) values (
    p_organization_id, p_content_version_id, p_review_policy_id, p_check_run_id,
    p_scripture_evidence_id, p_rights_snapshot_id, v_actor,
    v_version_hash, v_bundle_hash, 'aal2', p_reason_code
  ) returning id into v_approval_id;

  insert into public.approval_review_decisions (
    organization_id, approval_snapshot_id, review_decision_id
  )
  select p_organization_id, v_approval_id, review_id
  from (values
    (p_scripture_review_id), (p_theology_review_id), (p_editorial_review_id)
  ) reviews(review_id);

  insert into public.approval_check_results (
    organization_id, approval_snapshot_id, check_result_id
  )
  select p_organization_id, v_approval_id, r.id
  from public.check_results r
  join public.review_policy_checks rpc
    on rpc.check_definition_id = r.check_definition_id
   and rpc.review_policy_id = p_review_policy_id
   and rpc.organization_id = p_organization_id
  where r.check_run_id = p_check_run_id
    and r.organization_id = p_organization_id;

  insert into public.workflow_transitions (
    organization_id, content_version_id, from_state, to_state,
    actor_membership_id, reason_code, correlation_id
  ) values (
    p_organization_id, p_content_version_id, 'submitted', 'approved',
    v_actor, p_reason_code, p_correlation_id
  );

  perform app_private.record_audit(
    p_organization_id, v_actor, 'approval.granted', 'approval_snapshot',
    v_approval_id, p_reason_code, p_correlation_id
  );
  return v_approval_id;
end;
$$;

create or replace function public.m1_revoke_approval(
  p_organization_id uuid,
  p_approval_snapshot_id uuid,
  p_reason_code text,
  p_correlation_id uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor uuid;
  v_revocation_id uuid;
  v_version_id uuid;
begin
  v_actor := app_private.require_permission(p_organization_id, 'approval.revoke', true);
  select content_version_id into v_version_id
  from public.approval_snapshots
  where id = p_approval_snapshot_id and organization_id = p_organization_id
  for update;
  if v_version_id is null then
    raise exception using errcode = 'P0002', message = 'approval not found';
  end if;

  insert into public.approval_revocations (
    organization_id, approval_snapshot_id, revoked_by_membership_id, reason_code
  ) values (
    p_organization_id, p_approval_snapshot_id, v_actor, p_reason_code
  ) returning id into v_revocation_id;

  insert into public.workflow_transitions (
    organization_id, content_version_id, from_state, to_state,
    actor_membership_id, reason_code, correlation_id
  ) values (
    p_organization_id, v_version_id, 'approved', 'revoked',
    v_actor, p_reason_code, p_correlation_id
  );
  perform app_private.record_audit(
    p_organization_id, v_actor, 'approval.revoked', 'approval_snapshot',
    p_approval_snapshot_id, p_reason_code, p_correlation_id
  );
  return v_revocation_id;
end;
$$;

create or replace function public.m1_create_production_package(
  p_organization_id uuid,
  p_approval_snapshot_id uuid,
  p_correlation_id uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor uuid;
  v_package_id uuid;
  v_version_id uuid;
  v_manifest jsonb;
begin
  v_actor := app_private.require_permission(p_organization_id, 'export.request', true);
  select a.content_version_id into v_version_id
  from public.approval_snapshots a
  left join public.approval_revocations ar on ar.approval_snapshot_id = a.id
  where a.id = p_approval_snapshot_id
    and a.organization_id = p_organization_id
    and ar.id is null
  for update of a;
  if v_version_id is null then
    raise exception using errcode = '55000', message = 'approval is absent or revoked';
  end if;

  select jsonb_build_object(
    'schema_id', 'strongr.production_package.v1',
    'approval_snapshot_id', a.id,
    'evidence_bundle_hash', a.evidence_bundle_hash,
    'review_policy_id', a.review_policy_id,
    'check_run_id', a.check_run_id,
    'scripture_evidence_id', a.scripture_evidence_id,
    'rights_snapshot_id', a.rights_snapshot_id,
    'review_decision_ids', (
      select jsonb_agg(ard.review_decision_id order by ard.review_decision_id)
      from public.approval_review_decisions ard
      where ard.approval_snapshot_id = a.id
        and ard.organization_id = a.organization_id
    ),
    'check_result_ids', (
      select jsonb_agg(acr.check_result_id order by acr.check_result_id)
      from public.approval_check_results acr
      where acr.approval_snapshot_id = a.id
        and acr.organization_id = a.organization_id
    ),
    'content_version_id', v.id,
    'content_payload_hash', v.payload_hash,
    'content_schema_id', v.schema_id,
    'content', v.payload
  ) into v_manifest
  from public.approval_snapshots a
  join public.content_versions v
    on v.id = a.content_version_id
   and v.organization_id = a.organization_id
  where a.id = p_approval_snapshot_id
    and a.organization_id = p_organization_id;

  insert into public.production_packages (
    organization_id, approval_snapshot_id, manifest, manifest_hash,
    created_by_membership_id
  ) values (
    p_organization_id, p_approval_snapshot_id, v_manifest,
    app_private.sha256_jsonb(v_manifest), v_actor
  ) returning id into v_package_id;

  insert into public.workflow_transitions (
    organization_id, content_version_id, from_state, to_state,
    actor_membership_id, reason_code, correlation_id
  ) values (
    p_organization_id, v_version_id, 'approved', 'packaged',
    v_actor, 'production_package_created', p_correlation_id
  );
  perform app_private.record_audit(
    p_organization_id, v_actor, 'export.package_created', 'production_package',
    v_package_id, 'production_package_created', p_correlation_id
  );
  return v_package_id;
end;
$$;

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
  v_input_hash text;
  v_existing_hash text;
begin
  v_actor := app_private.require_permission(p_organization_id, 'content.create');
  select payload_hash into v_input_hash
  from public.content_briefs
  where id = p_brief_id and organization_id = p_organization_id;
  if v_input_hash is null then
    raise exception using errcode = 'P0002', message = 'brief not found';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':' || p_idempotency_key, 0)
  );
  select id, input_hash into v_job_id, v_existing_hash
  from public.generation_jobs
  where organization_id = p_organization_id
    and idempotency_key = p_idempotency_key;
  if v_job_id is not null then
    if v_existing_hash <> v_input_hash then
      raise exception using errcode = '22023',
        message = 'idempotency key reused with different input';
    end if;
    return v_job_id;
  end if;

  insert into public.generation_jobs (
    organization_id, brief_id, requested_by_membership_id, prompt_key,
    prompt_version, idempotency_key, input_hash, correlation_id
  ) values (
    p_organization_id, p_brief_id, v_actor, p_prompt_key,
    p_prompt_version, p_idempotency_key, v_input_hash, p_correlation_id
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

insert into public.check_definitions (key, version, name, lane, blocks_approval)
values
  ('scripture.reference_present', 1, 'Scripture reference present', 'scripture', true),
  ('scripture.translation_identified', 1, 'Translation identified', 'scripture', true),
  ('pastoral.no_divine_impersonation', 1, 'No divine impersonation', 'pastoral', true),
  ('pastoral.no_harmful_certainty', 1, 'No harmful certainty', 'pastoral', true),
  ('editorial.required_structure', 1, 'Required reflection structure', 'editorial', true),
  ('rights.sources_declared', 1, 'Sources declared', 'rights', true),
  ('accessibility.transcript_ready', 1, 'Transcript ready', 'accessibility', true),
  ('narration.brand_pronunciation', 1, 'Spoken brand pronunciation', 'narration', false);

alter table public.content_items enable row level security;
alter table public.content_briefs enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.generation_job_attempts enable row level security;
alter table public.content_versions enable row level security;
alter table public.check_definitions enable row level security;
alter table public.check_runs enable row level security;
alter table public.check_results enable row level security;
alter table public.scripture_evidence enable row level security;
alter table public.rights_snapshots enable row level security;
alter table public.review_policies enable row level security;
alter table public.review_policy_lanes enable row level security;
alter table public.review_policy_checks enable row level security;
alter table public.review_decisions enable row level security;
alter table public.approval_snapshots enable row level security;
alter table public.approval_review_decisions enable row level security;
alter table public.approval_check_results enable row level security;
alter table public.approval_revocations enable row level security;
alter table public.workflow_transitions enable row level security;
alter table public.production_packages enable row level security;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'content_items', 'content_briefs', 'generation_jobs',
    'generation_job_attempts', 'content_versions', 'check_runs', 'check_results',
    'scripture_evidence', 'rights_snapshots', 'review_policies',
    'review_policy_lanes', 'review_policy_checks', 'review_decisions',
    'approval_snapshots', 'approval_review_decisions', 'approval_check_results',
    'approval_revocations', 'workflow_transitions', 'production_packages'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated
       using (public.is_active_organization_member(organization_id))',
      v_table || '_member_select', v_table
    );
  end loop;
end;
$$;

create policy check_definitions_authenticated_select on public.check_definitions
for select to authenticated using (true);

revoke all on public.content_items, public.content_briefs, public.generation_jobs,
  public.generation_job_attempts, public.content_versions, public.check_definitions,
  public.check_runs, public.check_results, public.scripture_evidence,
  public.rights_snapshots, public.review_policies, public.review_policy_lanes,
  public.review_policy_checks, public.review_decisions, public.approval_snapshots,
  public.approval_review_decisions, public.approval_check_results,
  public.approval_revocations, public.workflow_transitions,
  public.production_packages
from anon, authenticated;

grant select on public.content_items, public.content_briefs, public.generation_jobs,
  public.content_versions, public.check_definitions, public.check_runs,
  public.check_results, public.scripture_evidence, public.rights_snapshots,
  public.review_policies, public.review_policy_lanes, public.review_policy_checks,
  public.review_decisions, public.approval_snapshots,
  public.approval_review_decisions, public.approval_check_results,
  public.approval_revocations, public.workflow_transitions,
  public.production_packages
to authenticated;

revoke all on function public.m1_create_review_policy(uuid, text, integer, uuid) from public;
revoke all on function public.m1_create_audio_brief(uuid, text, jsonb, uuid) from public;
revoke all on function public.m1_create_manual_version(uuid, uuid, uuid, jsonb, uuid, uuid) from public;
revoke all on function public.m1_submit_version(uuid, uuid, uuid) from public;
revoke all on function public.m1_record_scripture_evidence(
  uuid, uuid, text, text, text, text, uuid
) from public;
revoke all on function public.m1_record_rights_snapshot(uuid, uuid, text, text, uuid) from public;
revoke all on function public.m1_record_check_run(uuid, uuid, text, text, text, jsonb, uuid) from public;
revoke all on function public.m1_record_review(uuid, uuid, text, text, text, jsonb, uuid) from public;
revoke all on function public.m1_approve_version(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, uuid
) from public;
revoke all on function public.m1_revoke_approval(uuid, uuid, text, uuid) from public;
revoke all on function public.m1_create_production_package(uuid, uuid, uuid) from public;
revoke all on function public.m1_request_generation(uuid, uuid, text, integer, text, uuid) from public;

grant execute on function public.m1_create_review_policy(uuid, text, integer, uuid) to authenticated;
grant execute on function public.m1_create_audio_brief(uuid, text, jsonb, uuid) to authenticated;
grant execute on function public.m1_create_manual_version(uuid, uuid, uuid, jsonb, uuid, uuid) to authenticated;
grant execute on function public.m1_submit_version(uuid, uuid, uuid) to authenticated;
grant execute on function public.m1_record_scripture_evidence(
  uuid, uuid, text, text, text, text, uuid
) to authenticated;
grant execute on function public.m1_record_rights_snapshot(uuid, uuid, text, text, uuid) to authenticated;
grant execute on function public.m1_record_check_run(uuid, uuid, text, text, text, jsonb, uuid) to service_role;
grant execute on function public.m1_record_review(uuid, uuid, text, text, text, jsonb, uuid) to authenticated;
grant execute on function public.m1_approve_version(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, uuid
) to authenticated;
grant execute on function public.m1_revoke_approval(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.m1_create_production_package(uuid, uuid, uuid) to authenticated;
grant execute on function public.m1_request_generation(uuid, uuid, text, integer, text, uuid) to authenticated;

do $$
begin
  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'content_versions', 'review_decisions', 'approval_snapshots',
        'production_packages', 'workflow_transitions', 'generation_jobs'
      )
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER')
  ) then
    raise exception 'M1 verification failed: governed browser write grant found';
  end if;
end;
$$;

commit;
