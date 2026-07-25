-- Strongr OS
-- Forward repair: restrict automated check ingestion to the worker role.
--
-- A remote verification found that inherited/default EXECUTE privileges
-- allowed anon and authenticated to resolve m1_record_check_run. This repair
-- is intentionally narrow and forward-only.

begin;

revoke execute on function public.m1_record_check_run(
  uuid, uuid, text, text, text, jsonb, uuid
) from public, anon, authenticated;

grant execute on function public.m1_record_check_run(
  uuid, uuid, text, text, text, jsonb, uuid
) to service_role;

do $$
begin
  if has_function_privilege(
    'anon',
    'public.m1_record_check_run(uuid,uuid,text,text,text,jsonb,uuid)',
    'EXECUTE'
  ) then
    raise exception
      'M1 worker repair failed: anon retains m1_record_check_run EXECUTE';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.m1_record_check_run(uuid,uuid,text,text,text,jsonb,uuid)',
    'EXECUTE'
  ) then
    raise exception
      'M1 worker repair failed: authenticated retains m1_record_check_run EXECUTE';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.m1_record_check_run(uuid,uuid,text,text,text,jsonb,uuid)',
    'EXECUTE'
  ) then
    raise exception
      'M1 worker repair failed: service_role lacks m1_record_check_run EXECUTE';
  end if;
end;
$$;

commit;
