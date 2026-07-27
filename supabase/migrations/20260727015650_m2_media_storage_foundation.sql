-- Strongr OS
-- Migration: M2.0 governed media and private Storage foundation
--
-- Establishes only the approved data, authorization, and private-read
-- boundaries. It does not create media, upload objects, publish releases,
-- introduce a live provider, or change Strongr Daily.

begin;

create table public.media_output_specs (
  id uuid primary key default gen_random_uuid(),
  key text not null check (key ~ '^[a-z][a-z0-9_.-]*$'),
  version integer not null check (version > 0),
  media_kind text not null check (media_kind = 'audio'),
  container text not null check (container = 'wav'),
  codec text not null check (codec = 'pcm_s16le'),
  mime_type text not null check (mime_type = 'audio/wav'),
  channels integer not null check (channels = 1),
  sample_rate_hz integer not null check (sample_rate_hz = 16000),
  bits_per_sample integer not null check (bits_per_sample = 16),
  max_duration_ms integer not null check (max_duration_ms between 1 and 900000),
  max_bytes bigint not null check (max_bytes between 44 and 26214400),
  spec_hash text not null check (spec_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (key, version)
);

create table public.media_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  production_package_id uuid not null,
  output_spec_id uuid not null references public.media_output_specs(id) on delete restrict,
  requested_by_membership_id uuid not null,
  adapter_key text not null check (adapter_key ~ '^[a-z][a-z0-9_.-]*$'),
  adapter_version text not null check (length(btrim(adapter_version)) between 1 and 100),
  request_schema_id text not null default 'strongr.media_request.v1'
    check (request_schema_id = 'strongr.media_request.v1'),
  idempotency_key text not null check (length(btrim(idempotency_key)) between 8 and 255),
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  correlation_id uuid not null,
  state text not null default 'queued'
    check (state in ('queued', 'running', 'succeeded', 'failed', 'dead_letter', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  available_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  last_error_code text
    check (last_error_code is null or last_error_code ~ '^[a-z][a-z0-9_.-]*$'),
  created_at timestamptz not null default now(),
  foreign key (production_package_id, organization_id)
    references public.production_packages(id, organization_id) on delete restrict,
  foreign key (requested_by_membership_id, organization_id)
    references public.memberships(id, organization_id) on delete restrict,
  unique (organization_id, idempotency_key),
  unique (id, organization_id),
  unique (id, production_package_id, output_spec_id, organization_id),
  check (
    (state = 'queued' and started_at is null and finished_at is null)
    or (state in ('running', 'failed') and started_at is not null and finished_at is null)
    or (state in ('succeeded', 'dead_letter') and started_at is not null and finished_at is not null)
    or (state = 'cancelled' and finished_at is not null)
  )
);

create table public.media_job_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  media_job_id uuid not null,
  attempt_number integer not null check (attempt_number > 0),
  adapter_key text not null check (adapter_key ~ '^[a-z][a-z0-9_.-]*$'),
  adapter_version text not null check (length(btrim(adapter_version)) between 1 and 100),
  status text not null check (status in ('succeeded', 'failed')),
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  output_hash text check (output_hash is null or output_hash ~ '^[a-f0-9]{64}$'),
  byte_count bigint check (byte_count is null or byte_count between 44 and 26214400),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  cost_microunits bigint check (cost_microunits is null or cost_microunits >= 0),
  error_code text check (error_code is null or error_code ~ '^[a-z][a-z0-9_.-]*$'),
  correlation_id uuid not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  foreign key (media_job_id, organization_id)
    references public.media_jobs(id, organization_id) on delete restrict,
  unique (media_job_id, attempt_number),
  unique (id, organization_id),
  unique (id, media_job_id, organization_id),
  check (finished_at >= started_at),
  check (
    (status = 'succeeded' and output_hash is not null and byte_count is not null and error_code is null)
    or (status = 'failed' and error_code is not null)
  )
);

create table public.media_artifacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  media_job_id uuid not null,
  production_package_id uuid not null,
  output_spec_id uuid not null references public.media_output_specs(id) on delete restrict,
  successful_attempt_id uuid not null,
  bucket_id text not null default 'strongr-os-media'
    check (bucket_id = 'strongr-os-media'),
  object_path text not null,
  mime_type text not null check (mime_type = 'audio/wav'),
  container text not null check (container = 'wav'),
  codec text not null check (codec = 'pcm_s16le'),
  channels integer not null check (channels = 1),
  sample_rate_hz integer not null check (sample_rate_hz = 16000),
  bits_per_sample integer not null check (bits_per_sample = 16),
  duration_ms integer not null check (duration_ms between 1 and 900000),
  byte_count bigint not null check (byte_count between 44 and 26214400),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  storage_etag text check (
    storage_etag is null or length(btrim(storage_etag)) between 1 and 255
  ),
  validation_schema_id text not null default 'strongr.media_validation.v1'
    check (validation_schema_id = 'strongr.media_validation.v1'),
  validated_at timestamptz not null,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (
    media_job_id, production_package_id, output_spec_id, organization_id
  ) references public.media_jobs (
    id, production_package_id, output_spec_id, organization_id
  ) on delete restrict,
  foreign key (successful_attempt_id, media_job_id, organization_id)
    references public.media_job_attempts(
      id, media_job_id, organization_id
    ) on delete restrict,
  unique (media_job_id),
  unique (bucket_id, object_path),
  unique (id, organization_id),
  unique (id, production_package_id, organization_id),
  check (
    object_path = organization_id::text
      || '/' || production_package_id::text
      || '/' || id::text || '.wav'
  )
);

create table public.media_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  media_artifact_id uuid not null,
  reviewer_membership_id uuid not null,
  decision text not null check (decision in ('approved', 'changes_requested', 'rejected')),
  transcript_status text not null check (transcript_status in ('ready', 'blocked')),
  accessibility_status text not null check (accessibility_status in ('approved', 'blocked')),
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]*$'),
  evidence jsonb not null check (
    jsonb_typeof(evidence) = 'object'
    and octet_length(evidence::text) <= 65536
  ),
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (media_artifact_id, organization_id)
    references public.media_artifacts(id, organization_id) on delete restrict,
  foreign key (reviewer_membership_id, organization_id)
    references public.memberships(id, organization_id) on delete restrict,
  unique (id, organization_id),
  unique (id, media_artifact_id, organization_id),
  check (
    decision <> 'approved'
    or (
      transcript_status = 'ready'
      and accessibility_status = 'approved'
    )
  )
);

create table public.staged_release_bundles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  production_package_id uuid not null,
  media_artifact_id uuid not null,
  media_review_id uuid not null,
  manifest_schema_id text not null default 'strongr.staged_release_bundle.v1'
    check (manifest_schema_id = 'strongr.staged_release_bundle.v1'),
  manifest jsonb not null check (
    jsonb_typeof(manifest) = 'object'
    and octet_length(manifest::text) <= 131072
  ),
  manifest_hash text not null check (manifest_hash ~ '^[a-f0-9]{64}$'),
  staged_by_membership_id uuid not null,
  authentication_assurance text not null check (authentication_assurance = 'aal2'),
  correlation_id uuid not null,
  staged_at timestamptz not null default now(),
  foreign key (media_artifact_id, production_package_id, organization_id)
    references public.media_artifacts(
      id, production_package_id, organization_id
    ) on delete restrict,
  foreign key (media_review_id, media_artifact_id, organization_id)
    references public.media_reviews(
      id, media_artifact_id, organization_id
    ) on delete restrict,
  foreign key (staged_by_membership_id, organization_id)
    references public.memberships(id, organization_id) on delete restrict,
  unique (media_artifact_id),
  unique (id, organization_id)
);

create table public.staged_release_revocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  staged_release_bundle_id uuid not null,
  revoked_by_membership_id uuid not null,
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]*$'),
  authentication_assurance text not null check (authentication_assurance = 'aal2'),
  correlation_id uuid not null,
  revoked_at timestamptz not null default now(),
  foreign key (staged_release_bundle_id, organization_id)
    references public.staged_release_bundles(id, organization_id) on delete restrict,
  foreign key (revoked_by_membership_id, organization_id)
    references public.memberships(id, organization_id) on delete restrict,
  unique (staged_release_bundle_id),
  unique (id, organization_id)
);

create table public.media_reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  media_job_id uuid not null,
  media_artifact_id uuid,
  event_type text not null check (
    event_type in (
      'upload_ambiguous',
      'object_missing',
      'object_orphaned',
      'checksum_mismatch',
      'reconciled'
    )
  ),
  outcome text not null check (outcome in ('detected', 'verified', 'blocked')),
  object_path text not null check (
    length(btrim(object_path)) between 1 and 1024
    and split_part(object_path, '/', 1) = organization_id::text
    and object_path ~
      '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}[.]wav$'
  ),
  observed_sha256 text check (
    observed_sha256 is null or observed_sha256 ~ '^[a-f0-9]{64}$'
  ),
  detail_code text not null check (detail_code ~ '^[a-z][a-z0-9_.-]*$'),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (media_job_id, organization_id)
    references public.media_jobs(id, organization_id) on delete restrict,
  foreign key (media_artifact_id, organization_id)
    references public.media_artifacts(id, organization_id) on delete restrict,
  unique (id, organization_id)
);

create index media_jobs_ready_idx
  on public.media_jobs (available_at, created_at, id)
  where state in ('queued', 'failed');
create index media_jobs_package_idx
  on public.media_jobs (organization_id, production_package_id, created_at desc);
create index media_job_attempts_job_idx
  on public.media_job_attempts (organization_id, media_job_id, attempt_number desc);
create index media_artifacts_package_idx
  on public.media_artifacts (organization_id, production_package_id, created_at desc);
create index media_artifacts_attempt_idx
  on public.media_artifacts (organization_id, successful_attempt_id);
create index media_reviews_artifact_idx
  on public.media_reviews (organization_id, media_artifact_id, created_at desc);
create index staged_release_bundles_package_idx
  on public.staged_release_bundles (organization_id, production_package_id, staged_at desc);
create index staged_release_revocations_bundle_idx
  on public.staged_release_revocations (organization_id, staged_release_bundle_id);
create index media_reconciliation_events_job_idx
  on public.media_reconciliation_events (organization_id, media_job_id, created_at desc);
create index media_reconciliation_events_artifact_idx
  on public.media_reconciliation_events (organization_id, media_artifact_id)
  where media_artifact_id is not null;

create or replace function app_private.guard_media_job_update()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if row(
    old.id, old.organization_id, old.production_package_id,
    old.output_spec_id, old.requested_by_membership_id,
    old.adapter_key, old.adapter_version, old.request_schema_id,
    old.idempotency_key, old.input_hash, old.correlation_id,
    old.max_attempts, old.created_at
  ) is distinct from row(
    new.id, new.organization_id, new.production_package_id,
    new.output_spec_id, new.requested_by_membership_id,
    new.adapter_key, new.adapter_version, new.request_schema_id,
    new.idempotency_key, new.input_hash, new.correlation_id,
    new.max_attempts, new.created_at
  ) then
    raise exception using errcode = '55000', message = 'media job identity is immutable';
  end if;

  if not (
    (old.state in ('queued', 'failed') and new.state = 'running')
    or (old.state = 'running' and new.state in ('succeeded', 'failed', 'dead_letter'))
    or (old.state in ('queued', 'failed') and new.state = 'cancelled')
  ) then
    raise exception using errcode = '55000', message = 'illegal media job transition';
  end if;

  if new.attempt_count < old.attempt_count
     or new.attempt_count > old.attempt_count + 1
     or (
       new.state = 'running'
       and new.attempt_count <> old.attempt_count + 1
     ) then
    raise exception using errcode = '55000', message = 'invalid media attempt count';
  end if;

  return new;
end;
$$;

create trigger media_jobs_guard
before update on public.media_jobs
for each row execute function app_private.guard_media_job_update();
create trigger media_jobs_no_delete
before delete on public.media_jobs
for each row execute function app_private.reject_mutation();

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'media_output_specs', 'media_job_attempts', 'media_artifacts',
    'media_reviews', 'staged_release_bundles', 'staged_release_revocations',
    'media_reconciliation_events'
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

insert into public.permissions (key, name, description)
values
  ('media.request', 'Request media', 'Request media for an exact production package.'),
  ('media.review', 'Review media', 'Record human media and accessibility evidence.'),
  ('release.stage', 'Stage release', 'Create an immutable non-public staged release bundle.'),
  ('release.revoke', 'Revoke staged release', 'Revoke staged release authority.');

insert into public.role_permission_grants (
  organization_id, role_id, permission_id, granted_by_membership_id
)
select r.organization_id, r.id, p.id, null
from public.roles as r
cross join public.permissions as p
where r.key = 'owner'
  and r.is_system
  and p.key in ('media.request', 'media.review', 'release.stage', 'release.revoke');

insert into public.media_output_specs (
  id, key, version, media_kind, container, codec, mime_type, channels,
  sample_rate_hz, bits_per_sample, max_duration_ms, max_bytes, spec_hash
)
select
  '20000000-0000-4000-8000-000000000001',
  'strongr.synthetic_audio',
  1,
  'audio',
  'wav',
  'pcm_s16le',
  'audio/wav',
  1,
  16000,
  16,
  900000,
  26214400,
  app_private.sha256_jsonb(
    jsonb_build_object(
      'bits_per_sample', 16,
      'channels', 1,
      'codec', 'pcm_s16le',
      'container', 'wav',
      'key', 'strongr.synthetic_audio',
      'max_bytes', 26214400,
      'max_duration_ms', 900000,
      'media_kind', 'audio',
      'mime_type', 'audio/wav',
      'sample_rate_hz', 16000,
      'version', 1
    )
  );

alter table public.media_output_specs enable row level security;
alter table public.media_jobs enable row level security;
alter table public.media_job_attempts enable row level security;
alter table public.media_artifacts enable row level security;
alter table public.media_reviews enable row level security;
alter table public.staged_release_bundles enable row level security;
alter table public.staged_release_revocations enable row level security;
alter table public.media_reconciliation_events enable row level security;

create policy media_output_specs_authenticated_select
on public.media_output_specs
for select to authenticated
using (true);

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'media_jobs', 'media_job_attempts', 'media_artifacts', 'media_reviews',
    'staged_release_bundles', 'staged_release_revocations',
    'media_reconciliation_events'
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

create policy m2_media_objects_exact_member_select
on storage.objects
for select to authenticated
using (
  bucket_id = 'strongr-os-media'
  and exists (
    select 1
    from public.media_artifacts as artifact
    where artifact.bucket_id = storage.objects.bucket_id
      and artifact.object_path = storage.objects.name
      and public.is_active_organization_member(artifact.organization_id)
  )
);

revoke all on table
  public.media_output_specs,
  public.media_jobs,
  public.media_job_attempts,
  public.media_artifacts,
  public.media_reviews,
  public.staged_release_bundles,
  public.staged_release_revocations,
  public.media_reconciliation_events
from public, anon, authenticated, service_role;

grant select on table
  public.media_output_specs,
  public.media_jobs,
  public.media_artifacts,
  public.media_reviews,
  public.staged_release_bundles,
  public.staged_release_revocations
to authenticated;

revoke all on function app_private.guard_media_job_update()
from public, anon, authenticated, service_role;

do $$
declare
  v_role text;
  v_table text;
begin
  foreach v_table in array array[
    'media_output_specs', 'media_jobs', 'media_job_attempts', 'media_artifacts',
    'media_reviews', 'staged_release_bundles', 'staged_release_revocations',
    'media_reconciliation_events'
  ]
  loop
    foreach v_role in array array['anon', 'authenticated', 'service_role']
    loop
      if has_table_privilege(v_role, 'public.' || v_table, 'INSERT')
         or has_table_privilege(v_role, 'public.' || v_table, 'UPDATE')
         or has_table_privilege(v_role, 'public.' || v_table, 'DELETE') then
        raise exception
          'M2.0 verification failed: % can mutate public.%',
          v_role,
          v_table;
      end if;
    end loop;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'm2_media_%'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) then
    raise exception
      'M2.0 verification failed: application Storage mutation policy found';
  end if;
end;
$$;

commit;
