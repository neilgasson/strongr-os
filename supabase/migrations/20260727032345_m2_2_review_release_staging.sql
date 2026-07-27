-- Strongr OS
-- Migration: M2.2 governed media review and non-public release staging
--
-- Adds exact authenticated object retrieval, append-only human review, and
-- AAL2 staging/revocation commands. It does not add publication, public
-- Storage access, browser mutation, or service-role human authority.

begin;

drop policy m2_media_objects_exact_member_select on storage.objects;

create policy m2_media_objects_exact_member_select
on storage.objects
for select to authenticated
using (
  bucket_id = 'strongr-os-media'
  and storage.allow_any_operation(array[
    'object.get_authenticated_info',
    'object.get_authenticated'
  ])
  and exists (
    select 1
    from public.media_artifacts as artifact
    where artifact.bucket_id = storage.objects.bucket_id
      and artifact.object_path = storage.objects.name
      and public.is_active_organization_member(artifact.organization_id)
  )
);

create or replace function public.m2_record_media_review(
  p_organization_id uuid,
  p_media_artifact_id uuid,
  p_decision text,
  p_transcript_status text,
  p_accessibility_status text,
  p_reason_code text,
  p_evidence jsonb,
  p_correlation_id uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor uuid;
  v_artifact public.media_artifacts%rowtype;
  v_review_id uuid;
  v_evidence_hash text;
begin
  if p_decision not in ('approved', 'changes_requested', 'rejected')
     or p_transcript_status not in ('ready', 'blocked')
     or p_accessibility_status not in ('approved', 'blocked')
     or p_reason_code !~ '^[a-z][a-z0-9_]*$'
     or jsonb_typeof(p_evidence) <> 'object'
     or octet_length(p_evidence::text) > 65536 then
    raise exception using errcode = '22023',
      message = 'invalid media review evidence';
  end if;
  if p_decision = 'approved'
     and (
       p_transcript_status <> 'ready'
       or p_accessibility_status <> 'approved'
     ) then
    raise exception using errcode = '22023',
      message = 'approved media requires ready transcript and accessibility';
  end if;

  v_actor := app_private.require_permission(
    p_organization_id, 'media.review', false
  );

  select a.* into v_artifact
  from public.media_artifacts as a
  join public.media_jobs as j
    on j.id = a.media_job_id
   and j.organization_id = a.organization_id
  where a.id = p_media_artifact_id
    and a.organization_id = p_organization_id
    and j.state = 'succeeded';
  if not found then
    raise exception using errcode = 'P0002',
      message = 'canonical media artifact not found';
  end if;

  v_evidence_hash := app_private.sha256_jsonb(jsonb_build_object(
    'accessibility_status', p_accessibility_status,
    'artifact_byte_count', v_artifact.byte_count,
    'artifact_id', v_artifact.id,
    'artifact_sha256', v_artifact.sha256,
    'decision', p_decision,
    'evidence', p_evidence,
    'reason_code', p_reason_code,
    'review_schema_id', 'strongr.media_review.v1',
    'reviewer_membership_id', v_actor,
    'transcript_status', p_transcript_status
  ));

  insert into public.media_reviews (
    organization_id, media_artifact_id, reviewer_membership_id,
    decision, transcript_status, accessibility_status, reason_code,
    evidence, evidence_hash, correlation_id
  ) values (
    p_organization_id, v_artifact.id, v_actor,
    p_decision, p_transcript_status, p_accessibility_status, p_reason_code,
    p_evidence, v_evidence_hash, p_correlation_id
  )
  returning id into v_review_id;

  perform app_private.record_audit(
    p_organization_id, v_actor, 'media.review_recorded', 'media_review',
    v_review_id, p_reason_code, p_correlation_id
  );

  return v_review_id;
end;
$$;

create or replace function public.m2_stage_release(
  p_organization_id uuid,
  p_production_package_id uuid,
  p_media_artifact_id uuid,
  p_media_review_id uuid,
  p_configuration jsonb,
  p_correlation_id uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor uuid;
  v_package public.production_packages%rowtype;
  v_artifact public.media_artifacts%rowtype;
  v_review public.media_reviews%rowtype;
  v_spec public.media_output_specs%rowtype;
  v_existing public.staged_release_bundles%rowtype;
  v_bundle_id uuid;
  v_manifest jsonb;
  v_manifest_hash text;
begin
  if jsonb_typeof(p_configuration) <> 'object'
     or octet_length(p_configuration::text) > 32768 then
    raise exception using errcode = '22023',
      message = 'invalid staged release configuration';
  end if;

  v_actor := app_private.require_permission(
    p_organization_id, 'release.stage', true
  );

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || p_media_artifact_id::text,
      0
    )
  );

  select p.* into v_package
  from public.production_packages as p
  left join public.approval_revocations as r
    on r.approval_snapshot_id = p.approval_snapshot_id
   and r.organization_id = p.organization_id
  where p.id = p_production_package_id
    and p.organization_id = p_organization_id
    and r.id is null;
  if not found then
    raise exception using errcode = '55000',
      message = 'production package is absent or revoked';
  end if;

  select a.* into v_artifact
  from public.media_artifacts as a
  join public.media_jobs as j
    on j.id = a.media_job_id
   and j.organization_id = a.organization_id
  where a.id = p_media_artifact_id
    and a.production_package_id = v_package.id
    and a.organization_id = p_organization_id
    and j.state = 'succeeded';
  if not found then
    raise exception using errcode = 'P0002',
      message = 'canonical media artifact not found';
  end if;

  select r.* into v_review
  from public.media_reviews as r
  where r.id = p_media_review_id
    and r.media_artifact_id = v_artifact.id
    and r.organization_id = p_organization_id
    and r.decision = 'approved'
    and r.transcript_status = 'ready'
    and r.accessibility_status = 'approved';
  if not found then
    raise exception using errcode = '55000',
      message = 'approved media and accessibility review is required';
  end if;

  select s.* into v_spec
  from public.media_output_specs as s
  where s.id = v_artifact.output_spec_id;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'media output specification not found';
  end if;

  if exists (
    select 1
    from public.media_reconciliation_events as e
    where e.media_artifact_id = v_artifact.id
      and e.organization_id = p_organization_id
      and e.outcome = 'blocked'
      and not exists (
        select 1
        from public.media_reconciliation_events as verified
        where verified.media_artifact_id = e.media_artifact_id
          and verified.organization_id = e.organization_id
          and verified.event_type = 'reconciled'
          and verified.outcome = 'verified'
          and verified.created_at > e.created_at
      )
  ) then
    raise exception using errcode = '55000',
      message = 'unresolved media reconciliation blocks staging';
  end if;

  v_manifest := jsonb_build_object(
    'configuration', p_configuration,
    'configuration_hash', app_private.sha256_jsonb(p_configuration),
    'manifest_schema_id', 'strongr.staged_release_bundle.v1',
    'media_artifact', jsonb_build_object(
      'bits_per_sample', v_artifact.bits_per_sample,
      'byte_count', v_artifact.byte_count,
      'channels', v_artifact.channels,
      'codec', v_artifact.codec,
      'container', v_artifact.container,
      'duration_ms', v_artifact.duration_ms,
      'id', v_artifact.id,
      'mime_type', v_artifact.mime_type,
      'object_path', v_artifact.object_path,
      'sample_rate_hz', v_artifact.sample_rate_hz,
      'sha256', v_artifact.sha256,
      'validation_schema_id', v_artifact.validation_schema_id
    ),
    'media_output_spec', jsonb_build_object(
      'id', v_spec.id,
      'spec_hash', v_spec.spec_hash
    ),
    'media_review', jsonb_build_object(
      'accessibility_status', v_review.accessibility_status,
      'decision', v_review.decision,
      'evidence_hash', v_review.evidence_hash,
      'id', v_review.id,
      'transcript_status', v_review.transcript_status
    ),
    'production_package', jsonb_build_object(
      'id', v_package.id,
      'manifest_hash', v_package.manifest_hash
    ),
    'staged_by_membership_id', v_actor
  );
  v_manifest_hash := app_private.sha256_jsonb(v_manifest);

  select b.* into v_existing
  from public.staged_release_bundles as b
  where b.media_artifact_id = v_artifact.id
    and b.organization_id = p_organization_id;
  if found then
    if exists (
      select 1
      from public.staged_release_revocations as revocation
      where revocation.staged_release_bundle_id = v_existing.id
        and revocation.organization_id = p_organization_id
    ) then
      raise exception using errcode = '55000',
        message = 'staged release authority is revoked';
    end if;
    if v_existing.production_package_id = v_package.id
       and v_existing.media_review_id = v_review.id
       and v_existing.manifest = v_manifest
       and v_existing.manifest_hash = v_manifest_hash
       and v_existing.staged_by_membership_id = v_actor then
      return v_existing.id;
    end if;
    raise exception using errcode = '22023',
      message = 'media artifact already has a different staged bundle';
  end if;

  insert into public.staged_release_bundles (
    organization_id, production_package_id, media_artifact_id,
    media_review_id, manifest, manifest_hash, staged_by_membership_id,
    authentication_assurance, correlation_id
  ) values (
    p_organization_id, v_package.id, v_artifact.id,
    v_review.id, v_manifest, v_manifest_hash, v_actor,
    'aal2', p_correlation_id
  )
  returning id into v_bundle_id;

  perform app_private.record_audit(
    p_organization_id, v_actor, 'release.staged', 'staged_release_bundle',
    v_bundle_id, 'release_staged', p_correlation_id
  );

  return v_bundle_id;
end;
$$;

create or replace function public.m2_revoke_staged_release(
  p_organization_id uuid,
  p_staged_release_bundle_id uuid,
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
  v_bundle public.staged_release_bundles%rowtype;
  v_existing public.staged_release_revocations%rowtype;
  v_revocation_id uuid;
begin
  if p_reason_code !~ '^[a-z][a-z0-9_]*$' then
    raise exception using errcode = '22023',
      message = 'invalid staged release revocation reason';
  end if;

  v_actor := app_private.require_permission(
    p_organization_id, 'release.revoke', true
  );

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || p_staged_release_bundle_id::text,
      0
    )
  );

  select b.* into v_bundle
  from public.staged_release_bundles as b
  where b.id = p_staged_release_bundle_id
    and b.organization_id = p_organization_id;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'staged release bundle not found';
  end if;

  select r.* into v_existing
  from public.staged_release_revocations as r
  where r.staged_release_bundle_id = v_bundle.id
    and r.organization_id = p_organization_id;
  if found then
    if v_existing.revoked_by_membership_id = v_actor
       and v_existing.reason_code = p_reason_code then
      return v_existing.id;
    end if;
    raise exception using errcode = '55000',
      message = 'staged release bundle is already revoked';
  end if;

  insert into public.staged_release_revocations (
    organization_id, staged_release_bundle_id,
    revoked_by_membership_id, reason_code,
    authentication_assurance, correlation_id
  ) values (
    p_organization_id, v_bundle.id,
    v_actor, p_reason_code,
    'aal2', p_correlation_id
  )
  returning id into v_revocation_id;

  perform app_private.record_audit(
    p_organization_id, v_actor, 'release.revoked',
    'staged_release_bundle', v_bundle.id,
    p_reason_code, p_correlation_id
  );

  return v_revocation_id;
end;
$$;

revoke all on function public.m2_record_media_review(
  uuid, uuid, text, text, text, text, jsonb, uuid
) from public, anon, service_role;
grant execute on function public.m2_record_media_review(
  uuid, uuid, text, text, text, text, jsonb, uuid
) to authenticated;

revoke all on function public.m2_stage_release(
  uuid, uuid, uuid, uuid, jsonb, uuid
) from public, anon, service_role;
grant execute on function public.m2_stage_release(
  uuid, uuid, uuid, uuid, jsonb, uuid
) to authenticated;

revoke all on function public.m2_revoke_staged_release(
  uuid, uuid, text, uuid
) from public, anon, service_role;
grant execute on function public.m2_revoke_staged_release(
  uuid, uuid, text, uuid
) to authenticated;

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.m2_record_media_review(uuid,uuid,text,text,text,text,jsonb,uuid)',
    'public.m2_stage_release(uuid,uuid,uuid,uuid,jsonb,uuid)',
    'public.m2_revoke_staged_release(uuid,uuid,text,uuid)'
  ]
  loop
    if has_function_privilege('anon', v_signature, 'EXECUTE')
       or has_function_privilege('service_role', v_signature, 'EXECUTE')
       or not has_function_privilege(
         'authenticated', v_signature, 'EXECUTE'
       ) then
      raise exception
        'M2.2 verification failed: invalid function grants for %',
        v_signature;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'm2_media_objects_exact_member_select'
      and roles = array['authenticated']::name[]
      and cmd = 'SELECT'
      and qual like '%allow_any_operation%'
      and qual like '%object.get_authenticated%'
      and qual not like '%object.list%'
  ) then
    raise exception
      'M2.2 verification failed: exact retrieval policy is invalid';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and roles && array['anon', 'authenticated']::name[]
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) then
    raise exception
      'M2.2 verification failed: browser Storage mutation policy exists';
  end if;
end;
$$;

commit;
