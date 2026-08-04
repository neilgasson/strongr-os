# Phase 4B.5 temporary preparation sunset

## Purpose

`m1_prepare_phase4b5_guided_audio_reflection_brief` is a temporary, development-only wrapper for one approved **Quiet Trust** test. It is not a new content workflow or a way to select inactive profiles generally.

It reuses the existing governed `m1_create_audio_brief` command to create the regular content item and brief. That command retains its normal permission check and `content.brief_created` audit event. The wrapper adds only the checksum-bound Phase 4B.5 preparation record; the existing one-call authorization and quarantine infrastructure remain authoritative for any later provider attempt.

## Hard boundary

- Only the owner with AAL2 can request preparation.
- The server accepts no caller-controlled title, payload, profile, rights record, request hash, or cost estimate.
- The profile remains `owner_approved_inactive`.
- One scope can prepare one brief and consume one existing one-call authorization at most.
- The wrapper cannot approve, generate, narrate, upload, package, publish, distribute, or change production.

## Expiry and removal

The private lifecycle record expires **14 days after its migration is deployed**. Once an attempted one-call authorization is inserted, its status changes to `awaiting_removal_or_replacement` and an audit event records that a post-test disposition is required.

After the test, a reviewed change must do exactly one of these:

1. remove this temporary wrapper, its lifecycle record, and its trigger; or
2. replace it with a formally designed and reviewed feature that preserves the same governance guarantees.

There is no browser command or runtime flag that can extend, reopen, or silently convert this exception into a permanent pathway.

## Regression expectation

The normal Studio brief workflow continues to call `m1_create_audio_brief` unchanged. The temporary wrapper delegates to that same command instead of writing `content_items` or `content_briefs` itself. Tests assert this delegation, the expiry gate, post-test disposition trigger, and the continued standard brief audit path.
