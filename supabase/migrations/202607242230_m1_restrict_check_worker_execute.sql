begin;

revoke execute on function public.m1_record_check_run(
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb,
  uuid
) from public, anon, authenticated;

grant execute on function public.m1_record_check_run(
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb,
  uuid
) to service_role;

do $$
begin
  if has_function_privilege(
    'anon',
    'public.m1_record_check_run(uuid,uuid,text,text,text,jsonb,uuid)',
    'EXECUTE'
  ) then
    raise exception
      'M1 repair failed: anon may execute m1_record_check_run';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.m1_record_check_run(uuid,uuid,text,text,text,jsonb,uuid)',
    'EXECUTE'
  ) then
    raise exception
      'M1 repair failed: authenticated may execute m1_record_check_run';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.m1_record_check_run(uuid,uuid,text,text,text,jsonb,uuid)',
    'EXECUTE'
  ) then
    raise exception
      'M1 repair failed: service_role cannot execute m1_record_check_run';
  end if;
end;
$$;

commit;