#!/usr/bin/env python3
"""Apply the reviewed M1.1/M1.2 migration delta exactly once to strongr-os-dev.

The M0.2 remote database predates the repository migration filenames. This
helper therefore verifies the accepted M0.2 baseline by object and historical
migration name, then applies only the two later M1 migrations. Each migration
body and its repository history row are committed in one transaction.
"""

from __future__ import annotations

import json
import os
import pathlib
import re
import subprocess
import sys
import urllib.parse
from dataclasses import dataclass


class MigrationFailure(RuntimeError):
    pass


@dataclass(frozen=True)
class RepositoryMigration:
    version: str
    name: str
    path: pathlib.Path


TARGET = "strongr-os-dev"
CONFIRMATION = "strongr-os-dev-m1-migrations"
MIGRATION_FILENAMES = (
    "20260726161909_m1_1_durable_worker_commands.sql",
    "20260726205703_m1_2_brief_to_draft.sql",
)
M0_2_BASELINE_NAMES = {
    "m0_2_reliability_primitives",
    "m0_2_request_idempotency_fingerprint",
    "m0_2_restrict_anon_security_definer",
}


def require_environment(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise MigrationFailure(f"missing_{name.lower()}")
    return value


def database_matches_project(database_url: str, project_ref: str) -> bool:
    parsed = urllib.parse.urlsplit(database_url)
    hostname = (parsed.hostname or "").lower()
    username = urllib.parse.unquote(parsed.username or "")
    return (
        hostname == f"db.{project_ref}.supabase.co"
        or username.endswith(f".{project_ref}")
    )


def run_psql(database_url: str, sql: str) -> str:
    completed = subprocess.run(
        [
            "psql",
            database_url,
            "-X",
            "-qAt",
            "-v",
            "ON_ERROR_STOP=1",
        ],
        input=sql,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        detail = completed.stderr.strip().splitlines()
        safe_detail = detail[-1][:300] if detail else "psql_failed"
        raise MigrationFailure(f"database_command_failed:{safe_detail}")
    return completed.stdout.strip()


def migration_from_filename(root: pathlib.Path, filename: str) -> RepositoryMigration:
    match = re.fullmatch(r"([0-9]{14})_([a-z0-9_]+)\.sql", filename)
    if not match:
        raise MigrationFailure("invalid_repository_migration_filename")
    path = root / "supabase" / "migrations" / filename
    if not path.is_file():
        raise MigrationFailure(f"missing_repository_migration:{filename}")
    return RepositoryMigration(match.group(1), match.group(2), path)


def strip_transaction_wrapper(sql: str, path: pathlib.Path) -> str:
    leading = re.compile(r"\A((?:\s|--[^\n]*(?:\n|\Z))*)begin;\s*", re.IGNORECASE)
    match = leading.match(sql)
    if not match:
        raise MigrationFailure(f"migration_missing_begin:{path.name}")
    body = sql[match.end() :]
    trailing = re.compile(r"\s*commit;\s*\Z", re.IGNORECASE)
    match = trailing.search(body)
    if not match:
        raise MigrationFailure(f"migration_missing_commit:{path.name}")
    return body[: match.start()].rstrip()


def history(database_url: str) -> dict[str, str]:
    raw = run_psql(
        database_url,
        """
select version || E'\\t' || coalesce(name, '')
from supabase_migrations.schema_migrations
order by version;
""",
    )
    rows: dict[str, str] = {}
    for line in raw.splitlines():
        if not line:
            continue
        version, separator, name = line.partition("\t")
        if not separator:
            raise MigrationFailure("invalid_migration_history")
        rows[version] = name
    return rows


def verify_baseline(database_url: str, recorded: dict[str, str]) -> None:
    observed_names = set(recorded.values())
    if not M0_2_BASELINE_NAMES.issubset(observed_names):
        raise MigrationFailure("accepted_m0_2_history_missing")

    object_state = run_psql(
        database_url,
        """
select concat_ws(
  ',',
  (to_regclass('public.organizations') is not null)::text,
  (to_regclass('public.outbox_events') is not null)::text,
  (
    to_regprocedure(
      'public.m1_create_audio_brief(uuid,text,jsonb,uuid)'
    ) is not null
  )::text,
  (
    to_regprocedure(
      'public.m0_operational_health()'
    ) is not null
  )::text
);
""",
    )
    if object_state != "true,true,true,true":
        raise MigrationFailure("accepted_m0_2_schema_missing")


def apply_migration(
    database_url: str,
    migration: RepositoryMigration,
) -> None:
    body = strip_transaction_wrapper(migration.path.read_text(encoding="utf-8"), migration.path)
    version = migration.version.replace("'", "''")
    name = migration.name.replace("'", "''")
    wrapped = f"""
begin;
{body}

insert into supabase_migrations.schema_migrations (
  version,
  statements,
  name
)
values (
  '{version}',
  array[]::text[],
  '{name}'
);
commit;
"""
    run_psql(database_url, wrapped)


def verify_final_state(
    database_url: str,
    migrations: tuple[RepositoryMigration, ...],
) -> None:
    recorded = history(database_url)
    for migration in migrations:
        if recorded.get(migration.version) != migration.name:
            raise MigrationFailure(f"migration_history_mismatch:{migration.version}")

    state = run_psql(
        database_url,
        """
select concat_ws(
  ',',
  (
    to_regclass(
      'app_private.m1_generation_attempt_claims'
    ) is not null
  )::text,
  (
    to_regprocedure(
      'public.m1_claim_generation_events(text,integer,integer)'
    ) is not null
  )::text,
  (
    to_regprocedure(
      'public.m1_complete_generation_attempt(uuid,text,uuid,uuid,text,text,jsonb,text,integer)'
    ) is not null
  )::text,
  (
    select count(*) = 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'content_versions'
      and indexname = 'content_versions_one_ai_version_per_job_idx'
  )::text
);
""",
    )
    if state != "true,true,true,true":
        raise MigrationFailure("m1_remote_schema_verification_failed")


def main() -> int:
    records: list[dict[str, object]] = []
    try:
        database_url = require_environment("STRONGR_OS_DATABASE_URL")
        project_ref = require_environment("STRONGR_OS_PROJECT_REF")
        target = require_environment("STRONGR_OS_MIGRATION_TARGET")
        confirmation = require_environment("STRONGR_OS_MIGRATION_CONFIRM")

        if target != TARGET or confirmation != CONFIRMATION:
            raise MigrationFailure("migration_target_confirmation_failed")
        if not re.fullmatch(r"[a-z0-9]{20}", project_ref):
            raise MigrationFailure("invalid_project_ref")
        if not database_matches_project(database_url, project_ref):
            raise MigrationFailure("migration_database_project_mismatch")

        root = pathlib.Path(
            subprocess.run(
                ["git", "rev-parse", "--show-toplevel"],
                text=True,
                capture_output=True,
                check=True,
            ).stdout.strip()
        )
        migrations = tuple(
            migration_from_filename(root, filename)
            for filename in MIGRATION_FILENAMES
        )

        recorded = history(database_url)
        verify_baseline(database_url, recorded)
        records.append(
            {
                "test": "m1_remote_migration_baseline",
                "status": "pass",
                "target": target,
                "accepted_m0_2_history_names": len(M0_2_BASELINE_NAMES),
            }
        )

        for migration in migrations:
            existing_name = recorded.get(migration.version)
            if existing_name is not None:
                if existing_name != migration.name:
                    raise MigrationFailure(
                        f"migration_history_name_conflict:{migration.version}"
                    )
                action = "verified"
            else:
                apply_migration(database_url, migration)
                recorded[migration.version] = migration.name
                action = "applied"
            records.append(
                {
                    "test": "m1_remote_migration",
                    "status": "pass",
                    "version": migration.version,
                    "name": migration.name,
                    "action": action,
                    "atomic_history": True,
                }
            )

        verify_final_state(database_url, migrations)
        records.append(
            {
                "test": "m1_remote_migration_delta",
                "status": "pass",
                "target": target,
                "repository_migration_count": len(migrations),
                "applied_exactly_once": True,
            }
        )
    except (MigrationFailure, subprocess.CalledProcessError) as error:
        code = (
            str(error).split(":", 1)[0]
            if isinstance(error, MigrationFailure)
            else "repository_root_unavailable"
        )
        records.append(
            {
                "test": "m1_remote_migration_delta",
                "status": "fail",
                "error_code": code,
            }
        )

    for record in records:
        print(json.dumps(record, separators=(",", ":"), sort_keys=True))
    return 0 if records and all(record["status"] == "pass" for record in records) else 1


if __name__ == "__main__":
    raise SystemExit(main())
