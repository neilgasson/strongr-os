begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

select plan(12);

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
  pg_get_functiondef('public.m1_begin_phase4b5_one_call(uuid,uuid,integer)'::regprocedure)
    like all (array[
      '%require_permission%', '%content.create%', '%role_record.key = ''owner''%', '%true%',
      '%owner_approved_inactive%', '%pg_advisory_xact_lock%',
      '%one-call authorization has already been consumed%'
    ]),
  'begin command rechecks owner role, AAL2, inactive provenance, and atomically consumes one authorization'
);
select ok(
  has_function_privilege('authenticated', 'public.m1_begin_phase4b5_one_call(uuid,uuid,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.m1_begin_phase4b5_one_call(uuid,uuid,integer)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.m1_begin_phase4b5_one_call(uuid,uuid,integer)', 'EXECUTE'),
  'only authenticated callers may begin the AAL2 checked request'
);
select ok(
  has_function_privilege('service_role', 'public.m1_complete_phase4b5_one_call(uuid,text,text,text,integer,integer,integer,integer,text,jsonb,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.m1_complete_phase4b5_one_call(uuid,text,text,text,integer,integer,integer,integer,text,jsonb,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.m1_complete_phase4b5_one_call(uuid,text,text,text,integer,integer,integer,integer,text,jsonb,text)', 'EXECUTE'),
  'only the server-side worker may complete a consumed authorization'
);
select ok(
  pg_get_functiondef('public.m1_complete_phase4b5_one_call(uuid,text,text,text,integer,integer,integer,integer,text,jsonb,text)'::regprocedure)
    like all (array[
      '%scripture_text%', '%prayer_request_prompt%', '%quarantined%', '%failed%'
    ]),
  'completion rejects unapproved Scripture and private prayer fields while retaining only quarantine state'
);
select ok(
  pg_get_functiondef('public.m1_complete_phase4b5_one_call(uuid,text,text,text,integer,integer,integer,integer,text,jsonb,text)'::regprocedure)
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

select * from finish();
rollback;
