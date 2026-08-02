begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

select plan(8);

select ok(
  to_regclass('app_private.strongr_daily_phase4b5_brief_preparations') is not null,
  'the one approved brief preparation record exists'
);
select ok(
  (
    select relrowsecurity from pg_class as c join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'app_private' and c.relname = 'strongr_daily_phase4b5_brief_preparations'
  ),
  'the preparation record is private with RLS enabled'
);
select ok(
  not has_table_privilege('anon', 'app_private.strongr_daily_phase4b5_brief_preparations', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'app_private.strongr_daily_phase4b5_brief_preparations', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role', 'app_private.strongr_daily_phase4b5_brief_preparations', 'SELECT,INSERT,UPDATE,DELETE'),
  'no browser or service role has direct preparation-record access'
);
select ok(
  pg_get_functiondef('public.m1_prepare_phase4b5_guided_audio_reflection_brief(uuid,uuid)'::regprocedure)
    like all (array[
      '%require_permission%', '%true%', '%role_record.key = ''owner''%',
      '%owner_approved_inactive%', '%pg_advisory_xact_lock%',
      '%the one approved development brief has already been prepared or consumed%',
      '%98e2a6eddce6cb668f504758a47e097457841700709cd1db2d1506c2ce854f8a%'
    ]),
  'the preparation command rechecks owner AAL2, inactive-profile provenance, one-time state, and the exact request hash'
);
select ok(
  has_function_privilege('authenticated', 'public.m1_prepare_phase4b5_guided_audio_reflection_brief(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.m1_prepare_phase4b5_guided_audio_reflection_brief(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.m1_prepare_phase4b5_guided_audio_reflection_brief(uuid,uuid)', 'EXECUTE'),
  'only the signed-in owner path may request preparation; the server worker cannot create it'
);
select ok(
  pg_get_functiondef('public.m1_begin_phase4b5_one_call(uuid,uuid,text,integer,integer,text,integer)'::regprocedure)
    like all (array[
      '%strongr_daily_phase4b5_brief_preparations%',
      '%pre-call request does not match the owner-prepared immutable binding%',
      '%rights_record_checksum%'
    ]),
  'provider execution requires the exact private preparation binding'
);
select ok(
  pg_get_functiondef('public.m1_prepare_phase4b5_guided_audio_reflection_brief(uuid,uuid)'::regprocedure)
    not like any (array[
      '%generation_jobs%', '%content_versions%', '%production_packages%', '%media_jobs%',
      '%lifecycle_state = ''active''%'
    ]),
  'preparation creates no generation, version, package, media, or profile activation authority'
);
select ok(
  pg_get_functiondef('app_private.m1_guard_phase4b5_prepared_brief_immutable()'::regprocedure)
    like '%the prepared one-call brief is immutable%',
  'the prepared brief cannot be edited after its binding is recorded'
);

select * from finish();
rollback;
