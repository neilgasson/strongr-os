# Strongr Daily Native — Development Delivery Contract

## Status

The initial contract was applied only to `strongr-os-dev` for hosted acceptance.
This record authorizes neither an asset upload, content insertion, publication,
provider action, nor native-client configuration. Each requires separate owner
approval.

## Migration-history alignment

The hosted Supabase migration service stored the exact original SQL with its
own applied-at version, `20260805050134`, while retaining the original source
name `20260804143000_strongr_daily_native_delivery_contract`. Because PR #61
is unmerged, the source file is named
`20260805050134_20260804143000_strongr_daily_native_delivery_contract.sql`.
That gives the repository parser the same version/name pair already preserved
in hosted history. No migration-history row is deleted, rewritten, or hidden.

The follow-up bucket/policy migration was recorded under version
`20260805051456` while preserving its original source name
`20260805060000_strongr_daily_native_delivery_bucket_and_rls_initplan`.
Its filename uses the same non-destructive alignment pattern before this PR is
merged.

## Customer delivery boundary

`public.strongr_daily_native_content_v1` is a standalone versioned delivery
table. It deliberately contains no foreign key, view, or client access path to
Strongr Studio governance, organization, workflow, approval, provider, rights,
or private-user tables. The only columns are the customer-safe delivery fields
listed in the migration.

The table is populated only through a reviewed migration, a controlled
server-side administrator operation, or another separately reviewed privileged
backend process. Native clients have `SELECT` only.

## Authentication and RLS

The table has forced RLS. A row is visible only to a non-anonymous authenticated
session where the server-controlled JWT `app_metadata` contains the JSON boolean
`strongr_daily_development_reader: true`, and only while the row is
`development_safe` or `published`. A client-editable `user_metadata` value is
not consulted. `anon` has no grant and no policy. The repository keeps public
signup disabled; the development account is created by the owner.

The pgTAP suite exercises claims inside a database transaction. Supabase Auth
validates the JWT signature and expiry before PostgREST evaluates RLS. The
hosted development acceptance pass must therefore also send an expired
server-issued access token and confirm that it is rejected before either the
delivery table or storage policy is evaluated.

## Audio delivery boundary

`strongr-daily-development-audio` is provisioned by the follow-up migration as
private, WAV-only, and limited to 25 MiB. It has an exact authenticated
object-read policy, not a listing or mutation policy. The object name must
exactly equal the `audio_asset_ref` of a currently eligible delivery row. Paths
use only opaque UUID values:

```text
<opaque-public-content-id>/<opaque-audio-asset-id>.wav
```

The policy does not modify `strongr-os-media` or its existing policies.

## Quiet Trust development record

The schema intentionally ships without a Quiet Trust audio reference. After
the owner supplies the approved temporary WAV and approves its exact opaque
path, a separate reviewed seed or controlled server-side operation may create
the one metadata-only record. It must be marked development-only, non-public,
Scripture-free, owner-created, rights-cleared for internal testing, non-final,
and mandatory to replace before production. No full reflection, prayer,
Scripture narration, or publication authority is implied.

## Forward rollback

Before migration application, discard this branch. After application, use a
new forward-only migration to revoke `authenticated` SELECT from the delivery
table and remove this bucket's exact-read policy; set any delivery row to
`revoked`. Do not edit applied migration history or delete audit evidence or
the private object automatically.

## Hosted deployment prerequisites

1. Owner approval of the reviewed backend PR.
2. Apply the committed migration only to `strongr-os-dev`.
3. Apply the reviewed follow-up bucket/policy migration through the repository
   migration workflow after its version/name pair is confirmed against hosted
   history.
4. Owner uploads the approved temporary WAV through a controlled server-side
   process.
5. Owner creates a development test account with public signup disabled and
   server-controlled development-reader app metadata.
6. Run the authenticated/ordinary/anonymous RLS and exact-download acceptance
   checks against the development project.
7. Approve the exact asset reference before inserting the metadata-only Quiet
   Trust row. Only then can the separate native client Phase 1 resume.
