-- Strongr Daily Audio Reflection v2: explicit, forward-only schema support.
-- Existing v1 rows and governed behavior remain unchanged.
begin;

alter table public.content_briefs drop constraint content_briefs_schema_id_check;
alter table public.content_briefs add constraint content_briefs_schema_id_check check (
  schema_id in (
    'strongr.audio_reflection_brief.v1',
    'strongr.strongr_daily_audio_reflection_brief.v2'
  )
);

alter table public.content_versions drop constraint content_versions_schema_id_check;
alter table public.content_versions add constraint content_versions_schema_id_check check (
  schema_id in (
    'strongr.audio_reflection.v1',
    'strongr.strongr_daily_audio_reflection.v2'
  )
);

-- Preserve the accepted implementation exactly, except for the response-schema
-- guard. The guarded replacement fails closed if the accepted source changes.
do $$
declare
  v_definition text;
  v_old text := $old$if p_response_schema_id <> 'strongr.audio_reflection.v1' then
    raise exception using errcode = '22023',
      message = 'invalid response schema id';
  end if;$old$;
  v_new text := $new$if p_response_schema_id not in ('strongr.audio_reflection.v1', 'strongr.strongr_daily_audio_reflection.v2')
     or not exists (
       select 1
       from public.outbox_events e
       join public.generation_jobs j on j.id = e.aggregate_id and j.organization_id = e.organization_id
       join public.content_briefs b on b.id = j.brief_id and b.organization_id = j.organization_id
       where e.id = p_event_id and b.schema_id = case
         when p_response_schema_id = 'strongr.audio_reflection.v1' then 'strongr.audio_reflection_brief.v1'
         else 'strongr.strongr_daily_audio_reflection_brief.v2'
       end
     ) then
    raise exception using errcode = '22023',
      message = 'invalid response schema id';
  end if;$new$;
begin
  v_definition := pg_get_functiondef(
    'public.m1_complete_generation_attempt(uuid,text,uuid,uuid,text,text,jsonb,text,integer)'::regprocedure
  );
  if position(v_old in v_definition) = 0 then
    raise exception 'v2 migration refused: expected v1 completion guard was not found';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  execute v_definition;
end;
$$;

commit;
