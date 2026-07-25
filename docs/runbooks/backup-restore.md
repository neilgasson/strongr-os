# Database Backup and Restore Drill

## Recovery target

For the prelaunch `strongr-os-dev` environment:

- recovery point objective (RPO): 24 hours;
- recovery time objective (RTO): 4 hours.

Before any production launch, move to a paid backup policy or equivalent that
meets the approved production RPO and prove it again. A free development
project requires regular logical exports.

There are two distinct recovery layers:

1. A Supabase project backup or approved project-duplication path restores the
   complete PostgreSQL state, including Auth-managed data.
2. The repository scripts create and rehearse a supplemental logical export of
   Strongr OS `public` application data.

The logical export is not a complete Supabase-project backup. It intentionally
does not claim to contain Auth users, managed schemas, role passwords, or
Storage object bytes.

## Backup

Use a trusted operator machine with PostgreSQL client tools:

```bash
export STRONGR_OS_DATABASE_URL='[strongr-os-dev direct connection]'
export STRONGR_OS_BACKUP_DIRECTORY='[encrypted backup directory]'
export STRONGR_OS_SOURCE_TARGET='strongr-os-dev'
export STRONGR_OS_SOURCE_PROJECT_REF='[strongr-os-dev project ref]'
scripts/ops/create_database_backup.sh
```

The script:

- dumps data from `public`;
- uses repository migrations as the schema and migration-history authority;
- excludes Auth users, managed schemas, ownership, and privileges;
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
export STRONGR_OS_SOURCE_TARGET='strongr-os-dev'
export STRONGR_OS_RESTORE_TARGET='strongr-os-disposable'
export STRONGR_OS_SOURCE_PROJECT_REF='[strongr-os-dev project ref]'
export STRONGR_OS_RESTORE_PROJECT_REF='[disposable project ref]'
export STRONGR_OS_RESTORE_CONFIRM='strongr-os-disposable-restore'
scripts/acceptance/rehearse_backup_restore.sh \
  | tee m0-2-backup-restore.jsonl
```

Before running the script, create a separate disposable Supabase project,
apply the five repository migrations, and restore or provision the same Auth
user IDs through an approved Supabase project-backup path. The script never
inserts synthetic rows into `auth.users`.

The script refuses identical source and target URLs and refuses any target
that is not an empty, migrated disposable Strongr OS database. It verifies:

- exact public-table inventory;
- all five required migrations;
- an empty target before restore;
- every Strongr OS profile has a matching target Auth user;
- archive checksum;
- successful application-data restore;
- row counts for every public table;
- no orphaned profiles;
- the M0.2 health function;
- the governed approval command; and
- elapsed restore time.

Record the archive hash, source commit, start/end UTC timestamps, measured
RPO, measured RTO, target identifier, test result, and reviewer.

For a paid project, the preferred complete-database drill is Supabase
**Restore to another project** or an equivalent platform-supported restore.
For a free project, retain the checked logical export off-site and keep the
project migrations reproducible. Never describe the supplemental `public`
archive as a complete Auth recovery.

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
