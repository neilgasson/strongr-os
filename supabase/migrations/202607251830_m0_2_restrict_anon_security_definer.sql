-- Strongr OS
-- Forward-only security correction for M0.2.
-- Removes anonymous/public EXECUTE access from earlier SECURITY DEFINER
-- helper and governed M1 workflow functions while preserving authenticated
-- and service_role access. No tables, policies, or function bodies change.

begin;

revoke execute on function public.current_membership_id(uuid)
from public, anon;
revoke execute on function public.has_permission(uuid, text)
from public, anon;
revoke execute on function public.is_active_organization_member(uuid)
from public, anon;

revoke execute on function public.m1_approve_version(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, uuid
) from public, anon;
revoke execute on function public.m1_create_audio_brief(
  uuid, text, jsonb, uuid
) from public, anon;
revoke execute on function public.m1_create_manual_version(
  uuid, uuid, uuid, jsonb, uuid, uuid
) from public, anon;
revoke execute on function public.m1_create_production_package(
  uuid, uuid, uuid
) from public, anon;
revoke execute on function public.m1_create_review_policy(
  uuid, text, integer, uuid
) from public, anon;
revoke execute on function public.m1_record_review(
  uuid, uuid, text, text, text, jsonb, uuid
) from public, anon;
revoke execute on function public.m1_record_rights_snapshot(
  uuid, uuid, text, text, uuid
) from public, anon;
revoke execute on function public.m1_record_scripture_evidence(
  uuid, uuid, text, text, text, text, uuid
) from public, anon;
revoke execute on function public.m1_revoke_approval(
  uuid, uuid, text, uuid
) from public, anon;
revoke execute on function public.m1_submit_version(
  uuid, uuid, uuid
) from public, anon;

grant execute on function public.current_membership_id(uuid)
to authenticated, service_role;
grant execute on function public.has_permission(uuid, text)
to authenticated, service_role;
grant execute on function public.is_active_organization_member(uuid)
to authenticated, service_role;

grant execute on function public.m1_approve_version(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, uuid
) to authenticated, service_role;
grant execute on function public.m1_create_audio_brief(
  uuid, text, jsonb, uuid
) to authenticated, service_role;
grant execute on function public.m1_create_manual_version(
  uuid, uuid, uuid, jsonb, uuid, uuid
) to authenticated, service_role;
grant execute on function public.m1_create_production_package(
  uuid, uuid, uuid
) to authenticated, service_role;
grant execute on function public.m1_create_review_policy(
  uuid, text, integer, uuid
) to authenticated, service_role;
grant execute on function public.m1_record_review(
  uuid, uuid, text, text, text, jsonb, uuid
) to authenticated, service_role;
grant execute on function public.m1_record_rights_snapshot(
  uuid, uuid, text, text, uuid
) to authenticated, service_role;
grant execute on function public.m1_record_scripture_evidence(
  uuid, uuid, text, text, text, text, uuid
) to authenticated, service_role;
grant execute on function public.m1_revoke_approval(
  uuid, uuid, text, uuid
) to authenticated, service_role;
grant execute on function public.m1_submit_version(
  uuid, uuid, uuid
) to authenticated, service_role;

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.current_membership_id(uuid)',
    'public.has_permission(uuid,text)',
    'public.is_active_organization_member(uuid)',
    'public.m1_approve_version(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid)',
    'public.m1_create_audio_brief(uuid,text,jsonb,uuid)',
    'public.m1_create_manual_version(uuid,uuid,uuid,jsonb,uuid,uuid)',
    'public.m1_create_production_package(uuid,uuid,uuid)',
    'public.m1_create_review_policy(uuid,text,integer,uuid)',
    'public.m1_record_review(uuid,uuid,text,text,text,jsonb,uuid)',
    'public.m1_record_rights_snapshot(uuid,uuid,text,text,uuid)',
    'public.m1_record_scripture_evidence(uuid,uuid,text,text,text,text,uuid)',
    'public.m1_revoke_approval(uuid,uuid,text,uuid)',
    'public.m1_submit_version(uuid,uuid,uuid)'
  ]
  loop
    if has_function_privilege('anon', v_signature, 'EXECUTE') then
      raise exception 'M0.2 verification failed: anon can execute %',
        v_signature;
    end if;
    if not has_function_privilege('authenticated', v_signature, 'EXECUTE') then
      raise exception 'M0.2 verification failed: authenticated cannot execute %',
        v_signature;
    end if;
    if not has_function_privilege('service_role', v_signature, 'EXECUTE') then
      raise exception 'M0.2 verification failed: service_role cannot execute %',
        v_signature;
    end if;
  end loop;
end;
$$;

commit;
