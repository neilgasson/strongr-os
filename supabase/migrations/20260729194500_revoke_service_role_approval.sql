-- Strongr Daily v2: approval remains a human authenticated action.
--
-- The worker/service role may run automated checks, but it must never execute
-- the SECURITY DEFINER approval command. This is a forward-only privilege fix;
-- it does not modify the approval function, tables, policies, or content data.
begin;

revoke execute on function public.m1_approve_version(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, uuid
) from service_role;

do $$
begin
  if has_function_privilege(
    'service_role',
    'public.m1_approve_version(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid)',
    'EXECUTE'
  ) then
    raise exception 'approval security verification failed: service_role can execute m1_approve_version';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.m1_approve_version(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid)',
    'EXECUTE'
  ) then
    raise exception 'approval security verification failed: authenticated cannot execute m1_approve_version';
  end if;
end;
$$;

commit;
