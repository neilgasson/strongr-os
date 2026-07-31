begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

select plan(46);

select ok(
  to_regprocedure(
    'public.m1_claim_generation_event_by_job(uuid,text,integer)'
  ) is not null,
  'the Phase 4B exact-job claim command exists'
);
select ok(
  to_regprocedure(
    'public.m1_complete_generation_attempt_with_usage(uuid,text,uuid,uuid,text,text,jsonb,text,integer,integer,integer,bigint)'
  ) is not null,
  'the Phase 4B usage-aware completion command exists'
);
select ok(
  to_regprocedure(
    'public.m1_complete_generation_attempt(uuid,text,uuid,uuid,text,text,jsonb,text,integer)'
  ) is not null,
  'the accepted deterministic completion command remains intact'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.m1_claim_generation_event_by_job(uuid,text,integer)',
    'EXECUTE'
  ),
  'anon cannot claim an exact generation job'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.m1_claim_generation_event_by_job(uuid,text,integer)',
    'EXECUTE'
  ),
  'authenticated users cannot claim an exact generation job'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.m1_claim_generation_event_by_job(uuid,text,integer)',
    'EXECUTE'
  ),
  'service_role alone can claim an exact generation job'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.m1_complete_generation_attempt_with_usage(uuid,text,uuid,uuid,text,text,jsonb,text,integer,integer,integer,bigint)',
    'EXECUTE'
  ),
  'anon cannot persist provider completion or usage'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.m1_complete_generation_attempt_with_usage(uuid,text,uuid,uuid,text,text,jsonb,text,integer,integer,integer,bigint)',
    'EXECUTE'
  ),
  'authenticated users cannot persist provider completion or usage'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.m1_complete_generation_attempt_with_usage(uuid,text,uuid,uuid,text,text,jsonb,text,integer,integer,integer,bigint)',
    'EXECUTE'
  ),
  'service_role can use the usage-aware completion command'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.m1_complete_generation_attempt(uuid,text,uuid,uuid,text,text,jsonb,text,integer)',
    'EXECUTE'
  ),
  'the existing deterministic worker completion grant is preserved'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.m1_approve_version(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid)',
    'EXECUTE'
  ),
  'service_role still cannot approve an exact content version'
);
select ok(
  not has_table_privilege('service_role', 'public.outbox_events', 'INSERT')
    and not has_table_privilege('service_role', 'public.outbox_events', 'UPDATE')
    and not has_table_privilege('service_role', 'public.outbox_events', 'DELETE')
    and not has_table_privilege('service_role', 'public.generation_jobs', 'INSERT')
    and not has_table_privilege('service_role', 'public.generation_jobs', 'UPDATE')
    and not has_table_privilege('service_role', 'public.generation_jobs', 'DELETE')
    and not has_table_privilege(
      'service_role', 'public.generation_job_attempts', 'INSERT'
    )
    and not has_table_privilege(
      'service_role', 'public.generation_job_attempts', 'UPDATE'
    )
    and not has_table_privilege(
      'service_role', 'public.generation_job_attempts', 'DELETE'
    )
    and not has_table_privilege('service_role', 'public.content_versions', 'INSERT')
    and not has_table_privilege('service_role', 'public.content_versions', 'UPDATE')
    and not has_table_privilege('service_role', 'public.content_versions', 'DELETE'),
  'service_role remains command-only for governed generation state'
);
select ok(
  not exists (
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
  ),
  'Phase 4B leaves RLS enabled on every governed table it touches'
);
select ok(
  pg_get_functiondef(
    'public.m1_approve_version(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid)'::regprocedure
  ) ~ $aal$require_permission\s*\(\s*p_organization_id\s*,\s*'approval\.grant'\s*,\s*true\s*\)$aal$,
  'exact-version approval still requires AAL2'
);

insert into public.organizations (id, name, slug)
values
  (
    '18000000-0000-4000-8000-000000000001',
    'Phase 4B Tenant One',
    'phase-4b-tenant-one'
  ),
  (
    '18000000-0000-4000-8000-000000000002',
    'Phase 4B Tenant Two',
    'phase-4b-tenant-two'
  );

set session_replication_role = replica;
insert into public.profiles (id, display_name)
values
  ('18000000-0000-4000-8000-000000000011', 'Phase 4B Owner One'),
  ('18000000-0000-4000-8000-000000000012', 'Phase 4B Owner Two');
set session_replication_role = origin;

insert into public.memberships (id, organization_id, profile_id)
values
  (
    '18000000-0000-4000-8000-000000000021',
    '18000000-0000-4000-8000-000000000001',
    '18000000-0000-4000-8000-000000000011'
  ),
  (
    '18000000-0000-4000-8000-000000000022',
    '18000000-0000-4000-8000-000000000002',
    '18000000-0000-4000-8000-000000000012'
  );

insert into public.content_items (
  id, organization_id, title, created_by_membership_id
)
values
  (
    '18000000-0000-4000-8000-000000000031',
    '18000000-0000-4000-8000-000000000001',
    'Phase 4B exact provider fixture',
    '18000000-0000-4000-8000-000000000021'
  ),
  (
    '18000000-0000-4000-8000-000000000032',
    '18000000-0000-4000-8000-000000000002',
    'Phase 4B unrelated tenant fixture',
    '18000000-0000-4000-8000-000000000022'
  );

insert into public.content_briefs (
  id, organization_id, content_item_id, payload, payload_hash,
  created_by_membership_id
)
values
  (
    '18000000-0000-4000-8000-000000000041',
    '18000000-0000-4000-8000-000000000001',
    '18000000-0000-4000-8000-000000000031',
    '{
      "audience":"Synthetic adult test audience",
      "content_type":"audio_reflection",
      "desired_duration_seconds":300,
      "pastoral_purpose":"Prove one exact provider attempt.",
      "prohibited_claims_or_wording":["No provider authority"],
      "required_elements":["Human review remains required"],
      "schema_id":"strongr.strongr_daily_audio_reflection_brief.v2",
      "scripture_reference":{
        "reference":"Synthetic Reference 1:1",
        "source_citation":"Synthetic fixture; not a quotation",
        "translation":"TEST"
      },
      "source_brief_identifier":"phase4b-boundary-success",
      "theme":"Phase 4B provider boundary",
      "tone":"reflective",
      "working_title":"Phase 4B exact provider fixture"
    }'::jsonb,
    repeat('a', 64),
    '18000000-0000-4000-8000-000000000021'
  ),
  (
    '18000000-0000-4000-8000-000000000042',
    '18000000-0000-4000-8000-000000000002',
    '18000000-0000-4000-8000-000000000032',
    '{
      "audience":"Synthetic unrelated audience",
      "content_type":"audio_reflection",
      "desired_duration_seconds":300,
      "pastoral_purpose":"Prove tenant and job binding.",
      "prohibited_claims_or_wording":["Remain unclaimed"],
      "required_elements":["Remain tenant scoped"],
      "schema_id":"strongr.strongr_daily_audio_reflection_brief.v2",
      "scripture_reference":{
        "reference":"Synthetic Reference 2:2",
        "source_citation":"Synthetic fixture; not a quotation",
        "translation":"TEST"
      },
      "source_brief_identifier":"phase4b-boundary-unrelated",
      "theme":"Unrelated tenant",
      "tone":"reflective",
      "working_title":"Phase 4B unrelated tenant fixture"
    }'::jsonb,
    repeat('b', 64),
    '18000000-0000-4000-8000-000000000022'
  );

insert into public.generation_jobs (
  id, organization_id, brief_id, requested_by_membership_id, prompt_key,
  prompt_version, idempotency_key, input_hash, correlation_id
)
values
  (
    '18000000-0000-4000-8000-000000000051',
    '18000000-0000-4000-8000-000000000001',
    '18000000-0000-4000-8000-000000000041',
    '18000000-0000-4000-8000-000000000021',
    'strongr.strongr_daily.v2',
    1,
    'phase4b-provider-success',
    repeat('c', 64),
    '18000000-0000-4000-8000-000000000061'
  ),
  (
    '18000000-0000-4000-8000-000000000052',
    '18000000-0000-4000-8000-000000000002',
    '18000000-0000-4000-8000-000000000042',
    '18000000-0000-4000-8000-000000000022',
    'strongr.strongr_daily.v2',
    1,
    'phase4b-unrelated-tenant',
    repeat('d', 64),
    '18000000-0000-4000-8000-000000000062'
  ),
  (
    '18000000-0000-4000-8000-000000000053',
    '18000000-0000-4000-8000-000000000001',
    '18000000-0000-4000-8000-000000000041',
    '18000000-0000-4000-8000-000000000021',
    'strongr.strongr_daily.v2',
    1,
    'phase4b-provider-failure',
    repeat('e', 64),
    '18000000-0000-4000-8000-000000000063'
  ),
  (
    '18000000-0000-4000-8000-000000000054',
    '18000000-0000-4000-8000-000000000001',
    '18000000-0000-4000-8000-000000000041',
    '18000000-0000-4000-8000-000000000021',
    'strongr.unapproved.prompt',
    1,
    'phase4b-unapproved-prompt',
    repeat('f', 64),
    '18000000-0000-4000-8000-000000000064'
  ),
  (
    '18000000-0000-4000-8000-000000000055',
    '18000000-0000-4000-8000-000000000001',
    '18000000-0000-4000-8000-000000000041',
    '18000000-0000-4000-8000-000000000021',
    'strongr.strongr_daily.v2',
    2,
    'phase4b-unapproved-prompt-version',
    repeat('0', 64),
    '18000000-0000-4000-8000-000000000065'
  );

insert into public.outbox_events (
  id, organization_id, event_type, aggregate_type, aggregate_id,
  payload, correlation_id
)
values
  (
    '18000000-0000-4000-8000-000000000071',
    '18000000-0000-4000-8000-000000000001',
    'content.generation_requested.v1',
    'generation_job',
    '18000000-0000-4000-8000-000000000051',
    '{"job_id":"18000000-0000-4000-8000-000000000051"}'::jsonb,
    '18000000-0000-4000-8000-000000000061'
  ),
  (
    '18000000-0000-4000-8000-000000000072',
    '18000000-0000-4000-8000-000000000002',
    'content.generation_requested.v1',
    'generation_job',
    '18000000-0000-4000-8000-000000000052',
    '{"job_id":"18000000-0000-4000-8000-000000000052"}'::jsonb,
    '18000000-0000-4000-8000-000000000062'
  ),
  (
    '18000000-0000-4000-8000-000000000073',
    '18000000-0000-4000-8000-000000000001',
    'content.generation_requested.v1',
    'generation_job',
    '18000000-0000-4000-8000-000000000053',
    '{"job_id":"18000000-0000-4000-8000-000000000053"}'::jsonb,
    '18000000-0000-4000-8000-000000000063'
  ),
  (
    '18000000-0000-4000-8000-000000000074',
    '18000000-0000-4000-8000-000000000001',
    'content.generation_requested.v1',
    'generation_job',
    '18000000-0000-4000-8000-000000000054',
    '{"job_id":"18000000-0000-4000-8000-000000000054"}'::jsonb,
    '18000000-0000-4000-8000-000000000064'
  ),
  (
    '18000000-0000-4000-8000-000000000075',
    '18000000-0000-4000-8000-000000000001',
    'content.generation_requested.v1',
    'generation_job',
    '18000000-0000-4000-8000-000000000055',
    '{"job_id":"18000000-0000-4000-8000-000000000055"}'::jsonb,
    '18000000-0000-4000-8000-000000000065'
  );

create temporary table phase4b_claims (
  label text primary key,
  event_id uuid not null,
  organization_id uuid not null,
  generation_job_id uuid not null,
  attempt_number integer not null,
  lease_token uuid not null
);
create temporary table phase4b_attempts (
  label text primary key,
  attempt_id uuid not null,
  disposition text not null,
  max_attempts integer not null
);
create temporary table phase4b_completions (
  label text primary key,
  completion_state text not null,
  content_version_id uuid not null
);
create temporary table phase4b_output (
  payload jsonb not null,
  output_hash text not null
);

grant select, insert, update, delete on table
  phase4b_claims, phase4b_attempts, phase4b_completions, phase4b_output
to authenticated, service_role;

set local role service_role;

insert into phase4b_claims (
  label, event_id, organization_id, generation_job_id,
  attempt_number, lease_token
)
select
  'unapproved-prompt', event_id, organization_id, aggregate_id,
  attempt_number, lease_token
from public.m1_claim_generation_event_by_job(
  '18000000-0000-4000-8000-000000000054',
  'phase4b-live-provider',
  120
);

reset role;

select ok(
  not exists (
    select 1 from phase4b_claims where label = 'unapproved-prompt'
  )
  and (
    select j.state = 'queued'
      and j.attempt_count = 0
      and j.max_attempts = 3
      and e.status = 'pending'
      and e.attempts = 0
    from public.generation_jobs as j
    join public.outbox_events as e
      on e.aggregate_id = j.id
     and e.organization_id = j.organization_id
    where j.id = '18000000-0000-4000-8000-000000000054'
  ),
  'the live-provider boundary rejects an unapproved prompt contract before claim'
);

set local role service_role;

insert into phase4b_claims (
  label, event_id, organization_id, generation_job_id,
  attempt_number, lease_token
)
select
  'unapproved-prompt-version', event_id, organization_id, aggregate_id,
  attempt_number, lease_token
from public.m1_claim_generation_event_by_job(
  '18000000-0000-4000-8000-000000000055',
  'phase4b-live-provider',
  120
);

reset role;

select ok(
  not exists (
    select 1 from phase4b_claims where label = 'unapproved-prompt-version'
  )
  and (
    select j.state = 'queued'
      and j.attempt_count = 0
      and j.max_attempts = 3
      and e.status = 'pending'
      and e.attempts = 0
    from public.generation_jobs as j
    join public.outbox_events as e
      on e.aggregate_id = j.id
     and e.organization_id = j.organization_id
    where j.id = '18000000-0000-4000-8000-000000000055'
  ),
  'the live-provider boundary rejects an unapproved prompt version before claim'
);

insert into phase4b_output (payload, output_hash)
select
  payload || jsonb_build_object('content_hash', app_private.sha256_jsonb(payload)),
  app_private.sha256_jsonb(payload)
from (
  values (
    '{
      "app_description":"Synthetic app description.",
      "artwork_generation_prompt":"Synthetic artwork prompt.",
      "audience":"Synthetic adult test audience",
      "closing":"Synthetic closing. Human review remains required.",
      "content_type":"audio_reflection",
      "estimated_duration_seconds":300,
      "final_title":"Phase 4B generated draft fixture",
      "keywords":["synthetic","boundary"],
      "narration_text":"Synthetic provider draft for boundary testing only.",
      "pastoral_purpose":"Prove that provider output remains a draft.",
      "personal_takeaway_prompt":"What requires human review?",
      "prayer":"Synthetic prayer for boundary testing only.",
      "prohibited_claims_or_wording":["No provider authority"],
      "reflective_transition":"Synthetic transition.",
      "schema_id":"strongr.strongr_daily_audio_reflection.v2",
      "scripture_introduction":"Synthetic Scripture introduction.",
      "scripture_reference":{
        "reference":"Synthetic Reference 1:1",
        "source_citation":"Synthetic fixture; not a quotation",
        "translation":"TEST"
      },
      "short_summary":"Synthetic draft-only boundary fixture.",
      "social_caption":"Synthetic social caption.",
      "source_brief_identifier":"phase4b-boundary-success",
      "tone":"reflective",
      "warm_welcome":"Synthetic welcome."
    }'::jsonb
  )
) as fixture(payload);

set local role service_role;

insert into phase4b_claims (
  label, event_id, organization_id, generation_job_id,
  attempt_number, lease_token
)
select
  'success', event_id, organization_id, aggregate_id,
  attempt_number, lease_token
from public.m1_claim_generation_event_by_job(
  '18000000-0000-4000-8000-000000000051',
  'phase4b-live-provider',
  120
);

reset role;

select is(
  (select count(*) from phase4b_claims where label = 'success'),
  1::bigint,
  'the live-provider worker claims exactly one requested job'
);
select ok(
  (
    select organization_id = '18000000-0000-4000-8000-000000000001'
      and generation_job_id = '18000000-0000-4000-8000-000000000051'
      and event_id = '18000000-0000-4000-8000-000000000071'
      and attempt_number = 1
    from phase4b_claims
    where label = 'success'
  ),
  'the exact claim is bound to the requested tenant, job, and event'
);
select ok(
  (
    select max_attempts = 1 and attempt_count = 0 and state = 'queued'
    from public.generation_jobs
    where id = '18000000-0000-4000-8000-000000000051'
  ),
  'claiming a live-provider job permanently limits it to one attempt'
);
select ok(
  (
    select j.max_attempts = 3
      and j.attempt_count = 0
      and j.state = 'queued'
      and e.status = 'pending'
      and e.attempts = 0
    from public.generation_jobs as j
    join public.outbox_events as e
      on e.aggregate_id = j.id
     and e.organization_id = j.organization_id
    where j.id = '18000000-0000-4000-8000-000000000052'
  ),
  'an exact claim does not touch another tenant or job'
);

set local role service_role;

insert into phase4b_claims (
  label, event_id, organization_id, generation_job_id,
  attempt_number, lease_token
)
select
  'unexpected-reclaim', event_id, organization_id, aggregate_id,
  attempt_number, lease_token
from public.m1_claim_generation_event_by_job(
  '18000000-0000-4000-8000-000000000051',
  'phase4b-live-provider',
  120
);

reset role;

select is(
  (select count(*) from phase4b_claims where label = 'unexpected-reclaim'),
  0::bigint,
  'an already claimed live-provider job cannot be implicitly reclaimed'
);

set local role service_role;

insert into phase4b_attempts (label, attempt_id, disposition, max_attempts)
select 'success', attempt_id, disposition, max_attempts
from public.m1_begin_generation_attempt(
  (select event_id from phase4b_claims where label = 'success'),
  'phase4b-live-provider',
  (select lease_token from phase4b_claims where label = 'success'),
  'openai',
  'phase4b-test-model'
);

reset role;

select ok(
  (
    select disposition = 'ready' and max_attempts = 1
    from phase4b_attempts
    where label = 'success'
  ),
  'the exact claim begins one provider attempt with no retry allowance'
);

set local role service_role;

select throws_ok(
  $sql$
    select *
    from public.m1_complete_generation_attempt_with_usage(
      (select event_id from phase4b_claims where label = 'success'),
      'phase4b-live-provider',
      (select lease_token from phase4b_claims where label = 'success'),
      (select attempt_id from phase4b_attempts where label = 'success'),
      'phase4b-provider-response',
      'strongr.strongr_daily_audio_reflection.v2',
      (select payload from phase4b_output),
      (select output_hash from phase4b_output),
      125,
      -1,
      250,
      3000
    )
  $sql$,
  '22023',
  'invalid input token count',
  'negative input token evidence fails before completion'
);
select throws_ok(
  $sql$
    select *
    from public.m1_complete_generation_attempt_with_usage(
      (select event_id from phase4b_claims where label = 'success'),
      'phase4b-live-provider',
      (select lease_token from phase4b_claims where label = 'success'),
      (select attempt_id from phase4b_attempts where label = 'success'),
      'phase4b-provider-response',
      'strongr.strongr_daily_audio_reflection.v2',
      (select payload from phase4b_output),
      (select output_hash from phase4b_output),
      125,
      500,
      -1,
      3000
    )
  $sql$,
  '22023',
  'invalid output token count',
  'negative output token evidence fails before completion'
);
select throws_ok(
  $sql$
    select *
    from public.m1_complete_generation_attempt_with_usage(
      (select event_id from phase4b_claims where label = 'success'),
      'phase4b-live-provider',
      (select lease_token from phase4b_claims where label = 'success'),
      (select attempt_id from phase4b_attempts where label = 'success'),
      'phase4b-provider-response',
      'strongr.strongr_daily_audio_reflection.v2',
      (select payload from phase4b_output),
      (select output_hash from phase4b_output),
      125,
      500,
      250,
      -1
    )
  $sql$,
  '22023',
  'invalid provider cost',
  'negative provider cost evidence fails before completion'
);
select throws_ok(
  $sql$
    select *
    from public.m1_complete_generation_attempt_with_usage(
      (select event_id from phase4b_claims where label = 'success'),
      'phase4b-live-provider',
      (select lease_token from phase4b_claims where label = 'success'),
      (select attempt_id from phase4b_attempts where label = 'success'),
      'phase4b-provider-response',
      'strongr.strongr_daily_audio_reflection.v2',
      (select payload from phase4b_output),
      (select output_hash from phase4b_output),
      125,
      500,
      250,
      100001
    )
  $sql$,
  '22023',
  'provider cost exceeds per-job limit',
  'provider cost above the ten-cent per-job ceiling fails before completion'
);

reset role;

select ok(
  (
    select state = 'running' and attempt_count = 1
    from public.generation_jobs
    where id = '18000000-0000-4000-8000-000000000051'
  )
  and not exists (
    select 1
    from public.generation_job_attempts
    where generation_job_id = '18000000-0000-4000-8000-000000000051'
  ),
  'invalid usage evidence cannot create a terminal attempt or draft'
);

set local role service_role;

insert into phase4b_completions (
  label, completion_state, content_version_id
)
select 'success', completion_state, content_version_id
from public.m1_complete_generation_attempt_with_usage(
  (select event_id from phase4b_claims where label = 'success'),
  'phase4b-live-provider',
  (select lease_token from phase4b_claims where label = 'success'),
  (select attempt_id from phase4b_attempts where label = 'success'),
  'phase4b-provider-response',
  'strongr.strongr_daily_audio_reflection.v2',
  (select payload from phase4b_output),
  (select output_hash from phase4b_output),
  125,
  500,
  250,
  3000
);

reset role;

select is(
  (select completion_state from phase4b_completions where label = 'success'),
  'succeeded',
  'usage-aware completion succeeds atomically'
);
select ok(
  (
    select input_tokens = 500
      and output_tokens = 250
      and cost_microunits = 3000
      and latency_ms = 125
      and status = 'succeeded'
    from public.generation_job_attempts
    where id = (select attempt_id from phase4b_attempts where label = 'success')
  ),
  'the terminal attempt stores exact nonnegative usage and cost evidence'
);
select throws_ok(
  $sql$
    update public.generation_job_attempts
    set input_tokens = input_tokens
    where id = (select attempt_id from phase4b_attempts where label = 'success')
  $sql$,
  '55000',
  'generation_job_attempts is append-only',
  'provider usage remains immutable after the original terminal insert'
);
select ok(
  (
    select state = 'draft'
      and source = 'ai_assisted'
      and source_job_id = '18000000-0000-4000-8000-000000000051'
    from public.content_versions
    where id = (
      select content_version_id
      from phase4b_completions
      where label = 'success'
    )
  ),
  'provider completion creates an unapproved AI-assisted draft only'
);
select ok(
  not exists (
    select 1
    from public.review_decisions
    where organization_id = '18000000-0000-4000-8000-000000000001'
  )
  and not exists (
    select 1
    from public.approval_snapshots
    where organization_id = '18000000-0000-4000-8000-000000000001'
  )
  and not exists (
    select 1
    from public.production_packages
    where organization_id = '18000000-0000-4000-8000-000000000001'
  ),
  'provider completion cannot manufacture reviews, approval, or a package'
);
select ok(
  (
    select count(*) = 1
      and count(*) filter (
        where from_state is null
          and to_state = 'draft'
          and reason_code = 'generated_draft_created'
      ) = 1
    from public.workflow_transitions
    where content_version_id = (
      select content_version_id
      from phase4b_completions
      where label = 'success'
    )
  ),
  'the only automatic workflow transition is initial draft creation'
);

set local role service_role;

insert into phase4b_completions (
  label, completion_state, content_version_id
)
select 'replay', completion_state, content_version_id
from public.m1_complete_generation_attempt_with_usage(
  (select event_id from phase4b_claims where label = 'success'),
  'phase4b-live-provider',
  (select lease_token from phase4b_claims where label = 'success'),
  (select attempt_id from phase4b_attempts where label = 'success'),
  'phase4b-provider-response',
  'strongr.strongr_daily_audio_reflection.v2',
  (select payload from phase4b_output),
  (select output_hash from phase4b_output),
  125,
  500,
  250,
  3000
);

reset role;

select is(
  (select content_version_id from phase4b_completions where label = 'replay'),
  (select content_version_id from phase4b_completions where label = 'success'),
  'an exact usage-aware completion replay returns the original draft'
);
select is(
  (
    select count(*)
    from public.content_versions
    where source_job_id = '18000000-0000-4000-8000-000000000051'
  ),
  1::bigint,
  'completion replay cannot create a duplicate draft'
);

set local role service_role;

select throws_ok(
  $sql$
    select *
    from public.m1_complete_generation_attempt_with_usage(
      (select event_id from phase4b_claims where label = 'success'),
      'phase4b-live-provider',
      (select lease_token from phase4b_claims where label = 'success'),
      (select attempt_id from phase4b_attempts where label = 'success'),
      'phase4b-provider-response',
      'strongr.strongr_daily_audio_reflection.v2',
      (select payload from phase4b_output),
      (select output_hash from phase4b_output),
      125,
      500,
      250,
      3001
    )
  $sql$,
  '22023',
  'generation completion usage does not match existing provenance',
  'a replay cannot change persisted provider usage or cost'
);

reset role;

select ok(
  (
    select input_tokens = 500
      and output_tokens = 250
      and cost_microunits = 3000
    from public.generation_job_attempts
    where id = (select attempt_id from phase4b_attempts where label = 'success')
  ),
  'rejected replay leaves original usage and cost evidence unchanged'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select throws_ok(
  $sql$
    select public.m1_submit_version(
      '18000000-0000-4000-8000-000000000001',
      (
        select content_version_id
        from phase4b_completions
        where label = 'success'
      ),
      '18000000-0000-4000-8000-000000000081'
    )
  $sql$,
  '42501',
  'permission denied',
  'the provider service role cannot impersonate the human submitter'
);

reset role;

select is(
  (
    select state
    from public.content_versions
    where id = (
      select content_version_id
      from phase4b_completions
      where label = 'success'
    )
  ),
  'draft',
  'a failed service-role submit attempt leaves the draft unadvanced'
);

set local role service_role;

insert into phase4b_claims (
  label, event_id, organization_id, generation_job_id,
  attempt_number, lease_token
)
select
  'failure', event_id, organization_id, aggregate_id,
  attempt_number, lease_token
from public.m1_claim_generation_event_by_job(
  '18000000-0000-4000-8000-000000000053',
  'phase4b-live-provider-failure',
  120
);

insert into phase4b_attempts (label, attempt_id, disposition, max_attempts)
select 'failure', attempt_id, disposition, max_attempts
from public.m1_begin_generation_attempt(
  (select event_id from phase4b_claims where label = 'failure'),
  'phase4b-live-provider-failure',
  (select lease_token from phase4b_claims where label = 'failure'),
  'openai',
  'phase4b-test-model'
);

reset role;

select is(
  (select count(*) from phase4b_claims where label = 'failure'),
  1::bigint,
  'a second explicitly requested job receives its own single claim'
);

set local role service_role;

select is(
  public.m1_fail_generation_attempt(
    (select event_id from phase4b_claims where label = 'failure'),
    'phase4b-live-provider-failure',
    (select lease_token from phase4b_claims where label = 'failure'),
    (select attempt_id from phase4b_attempts where label = 'failure'),
    'generation.provider_unavailable',
    0
  ),
  'dead_letter',
  'the first live-provider failure is terminal rather than retried'
);
select is(
  public.m0_fail_outbox_event(
    (select event_id from phase4b_claims where label = 'failure'),
    'phase4b-live-provider-failure',
    (select lease_token from phase4b_claims where label = 'failure'),
    'generation.provider_unavailable',
    0,
    1
  ),
  'dead_letter',
  'the corresponding outbox delivery also becomes terminal'
);

insert into phase4b_claims (
  label, event_id, organization_id, generation_job_id,
  attempt_number, lease_token
)
select
  'unexpected-failure-reclaim', event_id, organization_id, aggregate_id,
  attempt_number, lease_token
from public.m1_claim_generation_event_by_job(
  '18000000-0000-4000-8000-000000000053',
  'phase4b-live-provider-failure',
  120
);

reset role;

select is(
  (
    select count(*)
    from phase4b_claims
    where label = 'unexpected-failure-reclaim'
  ),
  0::bigint,
  'a failed live-provider job cannot be automatically reclaimed'
);
select ok(
  (
    select j.state = 'dead_letter'
      and j.max_attempts = 1
      and j.attempt_count = 1
      and e.status = 'dead_letter'
      and e.attempts = 1
    from public.generation_jobs as j
    join public.outbox_events as e
      on e.aggregate_id = j.id
     and e.organization_id = j.organization_id
    where j.id = '18000000-0000-4000-8000-000000000053'
  ),
  'terminal provider failure remains durable with one recorded attempt'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"18000000-0000-4000-8000-000000000012","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select is(
  (
    select count(*)
    from public.generation_jobs
    where organization_id = '18000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'RLS prevents another tenant from reading provider jobs'
);

reset role;

select ok(
  (
    select j.state = 'queued'
      and j.max_attempts = 3
      and j.attempt_count = 0
      and e.status = 'pending'
      and e.attempts = 0
    from public.generation_jobs as j
    join public.outbox_events as e
      on e.aggregate_id = j.id
     and e.organization_id = j.organization_id
    where j.id = '18000000-0000-4000-8000-000000000052'
  ),
  'the unrelated tenant job remains exactly untouched at test completion'
);

select * from finish();
rollback;
