begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

select plan(31);

select ok(
  to_regprocedure(
    'public.m1_complete_generation_attempt(uuid,text,uuid,uuid,text,text,text,integer)'
  ) is null,
  'the hash-only completion command no longer exists'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.m1_complete_generation_attempt(uuid,text,uuid,uuid,text,text,jsonb,text,integer)',
    'EXECUTE'
  ),
  'anon cannot persist generated drafts'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.m1_complete_generation_attempt(uuid,text,uuid,uuid,text,text,jsonb,text,integer)',
    'EXECUTE'
  ),
  'authenticated users cannot persist generated drafts'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.m1_complete_generation_attempt(uuid,text,uuid,uuid,text,text,jsonb,text,integer)',
    'EXECUTE'
  ),
  'service_role can persist generated drafts through the command'
);
select ok(
  not has_table_privilege('service_role', 'public.content_versions', 'INSERT'),
  'service_role cannot insert content versions directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.content_versions', 'INSERT'),
  'authenticated users cannot insert content versions directly'
);

insert into public.organizations (id, name, slug)
values
  ('14000000-0000-4000-8000-000000000001', 'M1.2 Tenant One', 'm12-tenant-one'),
  ('14000000-0000-4000-8000-000000000002', 'M1.2 Tenant Two', 'm12-tenant-two');

set session_replication_role = replica;
insert into public.profiles (id, display_name)
values
  ('14000000-0000-4000-8000-000000000011', 'M1.2 Owner One'),
  ('14000000-0000-4000-8000-000000000012', 'M1.2 Owner Two');
set session_replication_role = origin;

insert into public.memberships (id, organization_id, profile_id)
values
  (
    '14000000-0000-4000-8000-000000000021',
    '14000000-0000-4000-8000-000000000001',
    '14000000-0000-4000-8000-000000000011'
  ),
  (
    '14000000-0000-4000-8000-000000000022',
    '14000000-0000-4000-8000-000000000002',
    '14000000-0000-4000-8000-000000000012'
  );

insert into public.roles (id, organization_id, key, name)
values
  (
    '14000000-0000-4000-8000-000000000031',
    '14000000-0000-4000-8000-000000000001',
    'owner',
    'Owner'
  ),
  (
    '14000000-0000-4000-8000-000000000032',
    '14000000-0000-4000-8000-000000000002',
    'owner',
    'Owner'
  );

insert into public.membership_role_grants (
  organization_id, membership_id, role_id, granted_by_membership_id
)
values
  (
    '14000000-0000-4000-8000-000000000001',
    '14000000-0000-4000-8000-000000000021',
    '14000000-0000-4000-8000-000000000031',
    '14000000-0000-4000-8000-000000000021'
  ),
  (
    '14000000-0000-4000-8000-000000000002',
    '14000000-0000-4000-8000-000000000022',
    '14000000-0000-4000-8000-000000000032',
    '14000000-0000-4000-8000-000000000022'
  );

insert into public.role_permission_grants (
  organization_id, role_id, permission_id, granted_by_membership_id
)
select
  seed.organization_id,
  seed.role_id,
  p.id,
  seed.membership_id
from (
  values
    (
      '14000000-0000-4000-8000-000000000001'::uuid,
      '14000000-0000-4000-8000-000000000031'::uuid,
      '14000000-0000-4000-8000-000000000021'::uuid
    ),
    (
      '14000000-0000-4000-8000-000000000002'::uuid,
      '14000000-0000-4000-8000-000000000032'::uuid,
      '14000000-0000-4000-8000-000000000022'::uuid
    )
) seed(organization_id, role_id, membership_id)
join public.permissions as p
  on p.key in ('content.create', 'content.submit');

create temporary table m12_brief (
  content_item_id uuid not null,
  brief_id uuid not null
);
create temporary table m12_job (
  label text primary key,
  job_id uuid not null
);
create temporary table m12_claim (
  event_id uuid not null,
  generation_job_id uuid not null,
  lease_token uuid not null
);
create temporary table m12_attempt (
  attempt_id uuid not null,
  disposition text not null
);
create temporary table m12_completion (
  label text primary key,
  completion_state text not null,
  content_version_id uuid not null
);
create temporary table m12_output (payload jsonb not null);

grant select, insert, update, delete on table
  m12_brief, m12_job, m12_claim, m12_attempt, m12_completion, m12_output
to authenticated, service_role;

insert into m12_output (payload)
values (
  '{
    "closing":"Synthetic closing fixture. Human review is required.",
    "opening":"Synthetic opening fixture.",
    "reflection":"Synthetic reflection fixture.",
    "reflection_questions":["What should a human reviewer consider?"],
    "schema_id":"strongr.audio_reflection.v1",
    "scripture_references":[{
      "reference":"Synthetic Reference 1:1",
      "source_citation":"Synthetic fixture; not a Scripture quotation",
      "translation":"TEST"
    }],
    "title":"M1.2 generated draft"
  }'::jsonb
);

select set_config(
  'request.jwt.claims',
  '{"sub":"14000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select throws_ok(
  $sql$
    select *
    from public.m1_create_audio_brief(
      '14000000-0000-4000-8000-000000000002',
      'Cross-tenant brief',
      '{"schema_id":"strongr.audio_reflection_brief.v1"}'::jsonb,
      '14000000-0000-4000-8000-000000000101'
    )
  $sql$,
  '42501',
  'permission denied',
  'tenant one cannot create a brief for tenant two'
);

insert into m12_brief (content_item_id, brief_id)
select content_item_id, brief_id
from public.m1_create_audio_brief(
  '14000000-0000-4000-8000-000000000001',
  'M1.2 generated draft',
  '{
    "audience":"Synthetic adult test audience",
    "constraints":["Use synthetic content only"],
    "objectives":["Prove the brief-to-draft flow"],
    "schema_id":"strongr.audio_reflection_brief.v1",
    "scripture_references":[{
      "reference":"Synthetic Reference 1:1",
      "source_citation":"Synthetic fixture; not a Scripture quotation",
      "translation":"TEST"
    }],
    "target_duration_seconds":300,
    "theme":"Protected M1.2 acceptance",
    "title":"M1.2 generated draft",
    "tone":"reflective"
  }'::jsonb,
  '14000000-0000-4000-8000-000000000102'
);

select ok(
  (
    select content_item_id is not null and brief_id is not null
    from m12_brief
  ),
  'the operator command creates a content item and immutable brief'
);
select is(
  (
    select count(*)
    from public.content_briefs
    where organization_id = '14000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'the operator sees the new brief in its tenant'
);

insert into m12_job (label, job_id)
values (
  'first',
  public.m1_request_generation(
    '14000000-0000-4000-8000-000000000001',
    (select brief_id from m12_brief),
    'strongr.audio_reflection.fixture',
    1,
    'm12-generated-draft',
    '14000000-0000-4000-8000-000000000103'
  )
);
insert into m12_job (label, job_id)
values (
  'replay',
  public.m1_request_generation(
    '14000000-0000-4000-8000-000000000001',
    (select brief_id from m12_brief),
    'strongr.audio_reflection.fixture',
    1,
    'm12-generated-draft',
    '14000000-0000-4000-8000-000000000104'
  )
);

select ok(
  (select job_id is not null from m12_job where label = 'first'),
  'the operator command creates a durable generation job'
);
select is(
  (select job_id from m12_job where label = 'first'),
  (select job_id from m12_job where label = 'replay'),
  'an exact generation request replay returns the same job'
);

reset role;

select is(
  (
    select count(*)
    from public.outbox_events
    where aggregate_id = (select job_id from m12_job where label = 'first')
      and event_type = 'content.generation_requested.v1'
  ),
  1::bigint,
  'an exact replay creates only one outbox event'
);

set local role service_role;

insert into m12_claim (event_id, generation_job_id, lease_token)
select event_id, aggregate_id, lease_token
from public.m1_claim_generation_events('m12-worker', 10, 60);

select is(
  (select generation_job_id from m12_claim),
  (select job_id from m12_job where label = 'first'),
  'the worker claims the requested generation event'
);

insert into m12_attempt (attempt_id, disposition)
select attempt_id, disposition
from public.m1_begin_generation_attempt(
  (select event_id from m12_claim),
  'm12-worker',
  (select lease_token from m12_claim),
  'deterministic-test',
  'strongr.fixture.audio-reflection.v1'
);

select is(
  (select disposition from m12_attempt),
  'ready',
  'the worker begins the generated-draft attempt'
);

insert into m12_completion (label, completion_state, content_version_id)
select 'first', completion_state, content_version_id
from public.m1_complete_generation_attempt(
  (select event_id from m12_claim),
  'm12-worker',
  (select lease_token from m12_claim),
  (select attempt_id from m12_attempt),
  'fixture-m12-response',
  'strongr.audio_reflection.v1',
  (select payload from m12_output),
  repeat('e', 64),
  37
);

select is(
  (select completion_state from m12_completion where label = 'first'),
  'succeeded',
  'generation completion succeeds only after persisting the draft'
);
select ok(
  (select content_version_id is not null from m12_completion where label = 'first'),
  'generation completion returns the immutable draft identity'
);

reset role;

select ok(
  (
    select
      v.organization_id = '14000000-0000-4000-8000-000000000001'
      and v.content_item_id = (select content_item_id from m12_brief)
      and v.brief_id = (select brief_id from m12_brief)
      and v.version_number = 1
      and v.schema_id = 'strongr.audio_reflection.v1'
      and v.source = 'ai_assisted'
      and v.source_job_id = (select job_id from m12_job where label = 'first')
      and v.state = 'draft'
      and v.created_by_membership_id = '14000000-0000-4000-8000-000000000021'
    from public.content_versions as v
    where v.id = (
      select content_version_id from m12_completion where label = 'first'
    )
  ),
  'completion creates one tenant-scoped AI-assisted draft'
);
select ok(
  (
    select
      v.payload = (select payload from m12_output)
      and v.payload_hash = app_private.sha256_jsonb(v.payload)
    from public.content_versions as v
    where v.id = (
      select content_version_id from m12_completion where label = 'first'
    )
  ),
  'Postgres computes the immutable payload hash from the stored draft'
);
select ok(
  (
    select
      j.state = 'succeeded'
      and j.output_hash = repeat('e', 64)
      and a.status = 'succeeded'
      and a.provider_response_id = 'fixture-m12-response'
      and a.latency_ms = 37
    from public.generation_jobs as j
    join public.generation_job_attempts as a
      on a.generation_job_id = j.id
     and a.organization_id = j.organization_id
    where j.id = (select job_id from m12_job where label = 'first')
  ),
  'the job and terminal attempt retain exact generation provenance'
);
select ok(
  exists (
    select 1
    from public.workflow_transitions as t
    where t.content_version_id = (
      select content_version_id from m12_completion where label = 'first'
    )
      and t.from_state is null
      and t.to_state = 'draft'
      and t.reason_code = 'generated_draft_created'
  ),
  'the generated draft records its initial workflow transition'
);
select ok(
  exists (
    select 1
    from public.audit_events as a
    where a.target_id = (
      select content_version_id from m12_completion where label = 'first'
    )
      and a.target_type = 'content_version'
      and a.action = 'content.version_created'
      and a.reason_code = 'ai_assisted_draft'
      and a.source_channel = 'worker'
  ),
  'the generated draft records redacted worker audit evidence'
);

set local role service_role;

insert into m12_completion (label, completion_state, content_version_id)
select 'replay', completion_state, content_version_id
from public.m1_complete_generation_attempt(
  (select event_id from m12_claim),
  'm12-worker',
  (select lease_token from m12_claim),
  (select attempt_id from m12_attempt),
  'fixture-m12-response',
  'strongr.audio_reflection.v1',
  (select payload from m12_output),
  repeat('e', 64),
  37
);

select is(
  (select completion_state from m12_completion where label = 'replay'),
  'succeeded',
  'an exact draft completion replay is accepted'
);
select is(
  (select content_version_id from m12_completion where label = 'replay'),
  (select content_version_id from m12_completion where label = 'first'),
  'an exact replay returns the original draft identity'
);

reset role;

select is(
  (
    select count(*)
    from public.content_versions
    where source_job_id = (select job_id from m12_job where label = 'first')
  ),
  1::bigint,
  'completion replay cannot create a duplicate AI-assisted draft'
);

set local role service_role;

select throws_ok(
  $sql$
    select *
    from public.m1_complete_generation_attempt(
      (select event_id from m12_claim),
      'm12-worker',
      (select lease_token from m12_claim),
      (select attempt_id from m12_attempt),
      'fixture-m12-response',
      'strongr.audio_reflection.v1',
      (select payload from m12_output),
      repeat('f', 64),
      37
    )
  $sql$,
  '22023',
  'generation completion does not match existing provenance',
  'a changed completion replay is rejected'
);

reset role;

select throws_ok(
  $sql$
    update public.content_versions
    set payload = jsonb_set(payload, '{title}', '"Changed"')
    where id = (
      select content_version_id from m12_completion where label = 'first'
    )
  $sql$,
  '55000',
  'content version payload is immutable',
  'the generated draft payload remains immutable'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"14000000-0000-4000-8000-000000000012","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select is(
  (
    select count(*)
    from public.content_versions
    where id = (
      select content_version_id from m12_completion where label = 'first'
    )
  ),
  0::bigint,
  'tenant two cannot read tenant one generated drafts'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"14000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select lives_ok(
  format(
    'select public.m1_submit_version(%L, %L, %L)',
    '14000000-0000-4000-8000-000000000001',
    (select content_version_id from m12_completion where label = 'first'),
    '14000000-0000-4000-8000-000000000105'
  ),
  'the authorized operator submits the selected generated draft'
);

reset role;

select is(
  (
    select state
    from public.content_versions
    where id = (
      select content_version_id from m12_completion where label = 'first'
    )
  ),
  'submitted',
  'the selected generated draft reaches submitted state'
);
select ok(
  exists (
    select 1
    from public.workflow_transitions
    where content_version_id = (
      select content_version_id from m12_completion where label = 'first'
    )
      and from_state = 'draft'
      and to_state = 'submitted'
      and reason_code = 'submitted_for_review'
  ),
  'submission records the exact draft-to-submitted transition'
);

set local role authenticated;

select throws_ok(
  format(
    'select public.m1_submit_version(%L, %L, %L)',
    '14000000-0000-4000-8000-000000000001',
    (select content_version_id from m12_completion where label = 'first'),
    '14000000-0000-4000-8000-000000000106'
  ),
  '55000',
  'only a draft may be submitted',
  'a submitted generated version cannot be submitted again'
);

reset role;

select * from finish();
rollback;
