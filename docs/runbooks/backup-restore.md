# Database Backup and Restore Drill

## Recovery target

For the prelaunch `strongr-os-dev` environment:

- recovery point objective (RPO): 24 hours;
- recovery time objective (RTO): 4 hours.

Before any production launch, move to a paid backup policy or equivalent that
meets the approved production RPO and prove it again. A free development
project requires regular logical exports.

## Backup

Use a trusted operator machine with PostgreSQL client tools:

```bash
export STRONGR_OS_DATABASE_URL='[strongr-os-dev direct connection]'
export STRONGR_OS_BACKUP_DIRECTORY='[encrypted backup directory]'
scripts/ops/create_database_backup.sh
```

The script:

- dumps `public` and `supabase_migrations`;
- excludes ownership and privileges that should be recreated by the platform;
- creates a SHA-256 checksum;
- records the source commit; and
- does not print the connection string.

Store at least one encrypted copy outside Supabase. Restrict access to the
owner and an approved recovery operator.

## Restore drill

Create a separate disposable Supabase project or isolated local Supabase
stack. Never restore over `strongr-os-dev` for a drill.

```bash
export STRONGR_OS_DATABASE_URL='[strongr-os-dev source]'
export STRONGR_OS_RESTORE_DATABASE_URL='[disposable restore target]'
export STRONGR_OS_RESTORE_CONFIRM='strongr-os-disposable-restore'
scripts/acceptance/rehearse_backup_restore.sh \
  | tee m0-2-backup-restore.jsonl
```

The script refuses identical source and target URLs. It verifies:

- archive checksum;
- successful restore;
- row counts for identity, content, approvals, audit, outbox, and receipts;
- the M0.2 health function;
- the governed approval command; and
- elapsed restore time.

Record the archive hash, source commit, start/end UTC timestamps, measured
RPO, measured RTO, target identifier, test result, and reviewer.

## Storage objects

Supabase database backups contain Storage metadata, not the stored object
bytes. M0.2 creates no Strongr OS Storage bucket, so there is no object payload
to restore in this milestone.

Before the first Strongr OS Storage feature is authorized:

1. Define bucket inventory and object-retention policy.
2. Export object bytes to encrypted independent storage.
3. Record object path, size, MIME type, version, and SHA-256.
4. Restore into a disposable bucket.
5. Compare every checksum and access policy.
6. Test missing-object reconciliation against database metadata.
7. Add the measured object restore time to the platform RTO.

Do not use or modify the current Strongr Daily Storage project for this drill.

## Failure handling

If a restore fails:

1. Preserve the logs and archive hash.
2. Do not retry against a non-disposable target.
3. Classify schema, data, role, extension, or version incompatibility.
4. Repair through reviewed scripts.
5. create a new disposable target and rerun from the original archive.

Never edit the backup archive to force a pass.
