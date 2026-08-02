begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

select plan(16);

select ok(
  to_regclass('app_private.strongr_daily_phase4b5_one_call_attempts') is not null,
  'the one-call quarantine table exists'
);
select ok(
  (
    select relrowsecurity
    from pg_class as c join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'app_private'
      and c.relname = 'strongr_daily_phase4b5_one_call_attempts'
  ),
  'the one-call quarantine table has RLS enabled'
);
select ok(
  not has_table_privilege('anon', 'app_private.strongr_daily_phase4b5_one_call_attempts', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'app_private.strongr_daily_phase4b5_one_call_attempts', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role', 'app_private.strongr_daily_phase4b5_one_call_attempts', 'SELECT,INSERT,UPDATE,DELETE'),
  'no browser or service role has direct quarantine-table access'
);
select ok(
  exists (
    select 1 from app_private.strongr_daily_content_profiles
    where profile_id = 'guided_audio_reflection'
      and profile_version = 1
      and profile_checksum = '3fa64f05911042bd2e2f7e58d14700581ca5025adc587425fd25afb2880210d9'
      and source_manifest_checksum = 'b3b3b75f8ce50cd9d10190fd56ae318913e12b77ff01c4ddab209e9297b40f9e'
      and prompt_key = 'strongr.phase4b5.guided_audio_reflection.v1'
      and prompt_version = 1
      and lifecycle_state = 'owner_approved_inactive'
  ),
  'the exact approved profile is registered but remains inactive'
);
select ok(
  not exists (
    select 1 from app_private.strongr_daily_content_profiles
    where profile_id = 'guided_audio_reflection'
      and profile_version = 1
      and lifecycle_state = 'active'
  ),
  'the one-call migration does not activate the profile generally'
);
select ok(
  pg_get_functiondef('public.m1_begin_phase4b5_one_call(uuid,uuid,text,integer,integer,text,integer)'::regprocedure)
    like all (array[
      '%m1_phase4b5_require_owner%', '%owner_approved_inactive%',
      '%pre-call request does not match the owner-prepared immutable binding%',
      '%pg_advisory_xact_lock%',
      '%one-call authorization has already been consumed%'
    ]),
  'begin command delegates the owner and AAL2 gate, binds the prepared request, and atomically consumes one authorization'
);
select ok(
  has_function_privilege('authenticated', 'public.m1_begin_phase4b5_one_call(uuid,uuid,text,integer,integer,text,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.m1_begin_phase4b5_one_call(uuid,uuid,text,integer,integer,text,integer)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.m1_begin_phase4b5_one_call(uuid,uuid,text,integer,integer,text,integer)', 'EXECUTE'),
  'only authenticated callers may begin the AAL2 checked request'
);
select ok(
  has_function_privilege('service_role', 'public.m1_complete_phase4b5_one_call(uuid,uuid,text,text,text,text,integer,integer,integer,integer,text,jsonb,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.m1_complete_phase4b5_one_call(uuid,uuid,text,text,text,text,integer,integer,integer,integer,text,jsonb,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.m1_complete_phase4b5_one_call(uuid,uuid,text,text,text,text,integer,integer,integer,integer,text,jsonb,text)', 'EXECUTE'),
  'only the server-side worker may complete a consumed authorization'
);
select ok(
  pg_get_functiondef('public.m1_complete_phase4b5_one_call(uuid,uuid,text,text,text,text,integer,integer,integer,integer,text,jsonb,text)'::regprocedure)
    like all (array[
      '%scripture_text%', '%prayer_request_prompt%', '%quarantined%', '%failed%'
    ]),
  'completion rejects unapproved Scripture and private prayer fields while retaining only quarantine state'
);
select ok(
  pg_get_functiondef('public.m1_complete_phase4b5_one_call(uuid,uuid,text,text,text,text,integer,integer,integer,integer,text,jsonb,text)'::regprocedure)
    not like any (array['%content_versions%', '%generation_jobs%', '%production_packages%', '%media_jobs%']),
  'completion cannot create versions, jobs, packages, or media'
);
select ok(
  (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'app_private.strongr_daily_phase4b5_one_call_attempts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%allowed_calls%'
    limit 1
  ) like '%allowed_calls = 1%',
  'the table hard-caps authorization records at one allowed call'
);
select ok(
  (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'app_private.strongr_daily_phase4b5_one_call_attempts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%automatic_retry_count%'
    limit 1
  ) like '%automatic_retry_count = 0%',
  'the table hard-disables automatic retries'
);
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'app_private'
      and table_name = 'strongr_daily_phase4b5_one_call_attempts'
      and column_name = any (array[
        'brief_payload_hash', 'request_sha256', 'canonical_request_byte_count',
        'estimated_input_tokens', 'price_schedule_version', 'correlation_id'
      ])
  ),
  6::bigint,
  'the private attempt records immutable brief, canonical request, pricing, and correlation evidence before execution'
);
select ok(
  pg_get_functiondef('public.m1_begin_phase4b5_one_call(uuid,uuid,text,integer,integer,text,integer)'::regprocedure)
    like all (array[
      '%p_request_sha256%', '%p_canonical_request_byte_count%', '%p_estimated_input_tokens%',
      '%p_price_schedule_version%', '%payload_hash%', '%correlation_id%'
    ]),
  'begin binds the exact request fingerprint and immutable brief version before an attempt can start'
);
select ok(
  pg_get_functiondef('public.m1_complete_phase4b5_one_call(uuid,uuid,text,text,text,text,integer,integer,integer,integer,text,jsonb,text)'::regprocedure)
    like all (array['%p_request_sha256%', '%p_correlation_id%', '%one-call request binding is invalid%']),
  'completion rejects a result that is not bound to the persisted request and correlation identifiers'
);
select ok(
  (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'app_private.strongr_daily_phase4b5_one_call_attempts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%price_schedule_version%'
    limit 1
  ) like '%openai.responses.gpt-5.6-terra.2026-08-01.v1%',
  'the local pre-call ceiling is tied to an exact recorded price schedule version'
);

select * from finish();
rollback;
