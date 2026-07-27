# M2.3 — Recovery and Acceptance

- **Status:** Implemented for protected review
- **Scope authority:** `docs/architecture/M2_SCOPE.md`, approved through PR #19
- **Review/staging foundation:** M2.2 accepted through PR #22 at
  `d55dc9cc383d44c3a6fed81b2ec41827dcd431e2`
- **Production authority:** None

## Outcome

M2.3 proves the governed M2 slice from an exact M1 production package through
private media generation, human review, immutable non-public staging,
revocation, inventory, encrypted byte backup, restore, reconciliation, and
self-cleaning acceptance fixtures.

It does not publish a release, expose a public object, deploy to production,
call a live provider, or change Strongr Daily.

## Acceptance workflow

`.github/workflows/m2-acceptance.yml` has two deliberately separate jobs:

- `M2 acceptance / local` runs for pull requests and protected `main`. It
  starts an isolated Supabase stack, applies every repository migration from
  zero exactly once, verifies unique migration history, runs every pgTAP
  contract, and exercises the real application/worker/Storage boundary.
- `M2 acceptance / strongr-os-dev` runs only by explicit workflow dispatch in
  the protected non-production environment. It verifies or atomically applies
  only the reviewed M2.0–M2.2 migration delta, then repeats the governed path
  with real Supabase Auth, AAL1/AAL2, PostgreSQL, RLS, and private Storage.

Every job finalizes checksums and uploads its evidence directory under
`if: always()`. Failure therefore preserves the available migration,
application, recovery, health, and workflow evidence.

## Governed end-to-end proof

The acceptance harness reuses the accepted M1 fixture path to create one real,
immutable production package, then proves:

1. AAL1 cannot request media; AAL2 can.
2. The server-only worker creates, validates, and uploads one deterministic
   write-once WAV artifact.
3. Canonical artifact metadata and bytes match by path, byte count, and
   SHA-256.
4. A different tenant and an anonymous caller cannot retrieve the object.
5. An authenticated member can retrieve only the exact canonical path and
   cannot enumerate the bucket.
6. Human media/transcript/accessibility evidence is append-only and
   server-hashed.
7. AAL1 cannot stage or revoke; AAL2 can.
8. The immutable staged manifest binds the exact package, artifact, review,
   configuration, actor, and hashes.
9. Revoked staged authority cannot be recreated.

## Object inventory and recovery

The harness compares canonical `media_artifacts` rows with the read-only
`storage.objects` inventory. It downloads the exact bytes through the
server-only Storage boundary and writes two evidence artifacts outside
Supabase:

- a metadata-only inventory document; and
- an AES-256-GCM encrypted byte archive.

The encryption key exists only in process memory for the drill and is zeroed
after immediate authenticated decryption. The retained evidence contains
ciphertext, inventory, algorithms, byte counts, and checksums, never the key
or plaintext object.

The drill verifies the decrypted byte count and SHA-256, detects one synthetic
orphan object, removes that exact fixture through the supported Storage API,
detects the canonical object as missing after an exact fixture deletion,
restores the verified bytes without overwrite, and proves authenticated
retrieval again. The measured backup/restore duration is recorded.

This is the M2 object-byte recovery layer. It complements, rather than
misrepresents, the accepted M0.2 logical database restore; Supabase database
backups still do not contain Storage object bytes.

## Cleanup and privacy

Fixture organization UUIDs form the cleanup boundary. The harness discovers
every object beneath the exact fixture prefix, removes those objects through
the Storage API, deletes only the fixture database rows under the existing
acceptance cleanup contract, and removes only the Auth users it created.

Logs and retained evidence contain identifiers, hashes, counts, status,
latency, and stable reason codes. Passwords, JWTs, keys, connection strings,
private text, encryption keys, and plaintext media are excluded.

## Completion sequence

After this workflow is stable and green on protected `main`, the local M2
check may be added to branch protection. The non-production remote job is then
dispatched, its artifacts and identifiers are reviewed, and
`evidence/m2/acceptance-record.json` is committed in a final protected closure
pull request.
