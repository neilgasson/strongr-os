# M2.1 — Durable Synthetic-Media Worker

- **Status:** Implemented for protected review
- **Scope authority:** `docs/architecture/M2_SCOPE.md`, approved through PR #19
- **Foundation:** M2.0 accepted through PR #20 at
  `a07a258db216309d7667a9a8f52fdd6c966b492f`
- **Remote authority:** None; M2.1 does not mutate a linked Supabase project

## Outcome

M2.1 turns one exact, unrevoked M1 production package into one validated
synthetic WAV artifact through a durable, retryable worker. The bucket remains
private. The adapter is deterministic and local; no live media, AI, paid, or
external provider is called.

The stage ends after the canonical artifact and delivery receipt are recorded.
It does not perform human review, stage or publish a release, deploy to
production, or change Strongr Daily.

## Request authority

`m2_request_media` is the only browser-callable M2.1 mutation command. It:

1. re-evaluates active membership, `media.request`, and real AAL2;
2. rejects an absent or revoked production package;
3. binds the package manifest hash, output-spec hash, adapter identity, and
   schema to one complete request fingerprint;
4. serializes equivalent requests with a transaction advisory lock;
5. returns the original job only for an exact idempotent replay; and
6. commits the media job and `media.generation_requested.v1` outbox event in
   one database transaction.

The service role cannot invoke this human command.

## Worker authority

The existing M0.2 outbox lease contract is reused. Media-specific claims use
`FOR UPDATE SKIP LOCKED`, a random lease token, an expiry, and a bounded
attempt counter. The worker commands are executable only by `service_role`;
browser roles cannot invoke them or directly write M2 tables.

Private immutable attempt claims bind:

- organization, package, job, event, and attempt number;
- worker ID and exact lease token;
- adapter key/version and complete input hash; and
- one preallocated artifact ID and canonical write-once object path.

A recovered lease closes the abandoned attempt as failed. The next attempt
reuses the artifact ID and path so an upload that succeeded before a database
failure can be verified and adopted without replacement.

## Byte and Storage boundary

The provider-neutral deterministic adapter emits a strict mono, 16 kHz,
16-bit PCM WAV fixture. Before upload, the worker validates the actual RIFF,
WAVE, `fmt `, and `data` structure; PCM format; channel/sample/bit fields;
byte rate and alignment; exact data length; duration; byte limit; and SHA-256.
The successful attempt also persists the adapter's bounded, provider-neutral
correlation ID alongside latency and cost provenance.

Upload uses the supported Supabase Storage API with:

- the server-only privileged key;
- bucket `strongr-os-media`;
- MIME type `audio/wav`; and
- `x-upsert: false`.

No SQL writes managed Storage metadata. No browser insert, update, delete,
list, public URL, or upload policy is added.

## Partial-failure reconciliation

Storage and PostgreSQL are deliberately separate short operations. If an
object already exists at the write-once path, the worker downloads and
revalidates the exact bytes:

- matching bytes append verified reconciliation evidence and allow canonical
  database completion;
- missing bytes append blocked `object_missing` evidence;
- changed or malformed bytes append blocked `checksum_mismatch` evidence; and
- an ambiguous upload response leaves the outbox lease unacknowledged and
  appends `upload_ambiguous` evidence for deterministic recovery.

If database completion succeeded but acknowledgement failed, replay verifies
the canonical object again before acknowledging. A missing or mismatched
canonical object is never treated as success.

## Deferred work

M2.2 must add exact authorized retrieval, human media/accessibility review,
AAL2 release staging and revocation, and immutable staged manifests. M2.3 must
add inventory, independent encrypted byte backup, disposable restore,
local/non-production remote acceptance, observability, and the final accepted
M2 evidence record.
