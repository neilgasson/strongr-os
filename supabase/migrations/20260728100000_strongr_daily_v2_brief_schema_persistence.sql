-- Strongr Daily Audio Reflection v2: persist the governed brief schema exactly.
--
-- m1_create_audio_brief intentionally keeps its accepted command signature.
-- This trigger derives the stored schema from the validated payload so both
-- v1 and v2 commands retain their explicit contract identity.
begin;

create or replace function app_private.m1_set_content_brief_schema_id()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_schema_id text;
begin
  v_schema_id := new.payload ->> 'schema_id';
  if v_schema_id not in (
    'strongr.audio_reflection_brief.v1',
    'strongr.strongr_daily_audio_reflection_brief.v2'
  ) then
    raise exception using
      errcode = '22023',
      message = 'invalid brief schema id';
  end if;

  new.schema_id := v_schema_id;
  return new;
end;
$$;

drop trigger if exists m1_set_content_brief_schema_id
on public.content_briefs;

create trigger m1_set_content_brief_schema_id
before insert on public.content_briefs
for each row
execute function app_private.m1_set_content_brief_schema_id();

revoke all on function app_private.m1_set_content_brief_schema_id()
from public, anon, authenticated, service_role;

commit;
