alter table public.strongr_daily_native_content_v1
  drop constraint strongr_daily_native_content_v1_audio_asset_ref_check;

alter table public.strongr_daily_native_content_v1
  add constraint strongr_daily_native_content_v1_audio_asset_ref_check check (
    audio_asset_ref is null
    or audio_asset_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.wav$'
  );
