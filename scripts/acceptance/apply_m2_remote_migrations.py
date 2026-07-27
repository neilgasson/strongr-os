#!/usr/bin/env python3
"""Apply the reviewed M2.0-M2.2 migration delta exactly once to strongr-os-dev."""

from __future__ import annotations

import json
import os
import pathlib
import re
import subprocess

from apply_m1_remote_migrations import (
    MigrationFailure,
    apply_migration,
    database_matches_project,
    history,
    migration_from_filename,
    run_psql,
)


TARGET = "strongr-os-dev"
CONFIRMATION = "strongr-os-dev-m2-migrations"
MIGRATION_FILENAMES = (
    "20260727015650_m2_media_storage_foundation.sql",
    "20260727023903_m2_1_durable_media_worker.sql",
    "20260727032345_m2_2_review_release_staging.sql",
)
M1_BASELINE_VERSIONS = {
    "20260726161909": "m1_1_durable_worker_commands",
    "20260726205703": "m1_2_brief_to_draft",
}


def require_environment(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise MigrationFailure(f"missing_{name.lower()}")
    return value


def verify_m1_baseline(database_url: str, recorded: dict[str, str]) -> None:
    for version, name in M1_BASELINE_VERSIONS.items():
        if recorded.get(version) != name:
            raise MigrationFailure(f"accepted_m1_history_missing:{version}")

    state = run_psql(
        database_url,
        """
select concat_ws(
  ',',
  (to_regclass('public.production_packages') is not null)::text,
  (
    to_regprocedure(
      'public.m1_create_production_package(uuid,uuid,uuid)'
    ) is not null
  )::text,
  (
    to_regprocedure(
      'public.m1_claim_generation_events(text,integer,integer)'
    ) is not null
  )::text
);
""",
    )
    if state != "true,true,true":
        raise MigrationFailure("accepted_m1_schema_missing")


def verify_final_state(database_url: str) -> None:
    state = run_psql(
        database_url,
        """
select concat_ws(
  ',',
  (to_regclass('public.media_artifacts') is not null)::text,
  (
    to_regprocedure(
      'public.m2_request_media(uuid,uuid,uuid,text,text,text,uuid)'
    ) is not null
  )::text,
  (
    to_regprocedure(
      'public.m2_record_media_review(uuid,uuid,text,text,text,text,jsonb,uuid)'
    ) is not null
  )::text,
  (
    to_regprocedure(
      'public.m2_stage_release(uuid,uuid,uuid,uuid,jsonb,uuid)'
    ) is not null
  )::text,
  (
    select count(*) = 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'm2_media_objects_exact_member_select'
      and cmd = 'SELECT'
  )::text
);
""",
    )
    if state != "true,true,true,true,true":
        raise MigrationFailure("m2_remote_schema_verification_failed")


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
        verify_m1_baseline(database_url, recorded)
        records.append(
            {
                "test": "m2_remote_migration_baseline",
                "status": "pass",
                "target": target,
                "accepted_m1_history_versions": len(M1_BASELINE_VERSIONS),
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
                    "test": "m2_remote_migration",
                    "status": "pass",
                    "version": migration.version,
                    "name": migration.name,
                    "action": action,
                    "atomic_history": True,
                }
            )

        final_history = history(database_url)
        for migration in migrations:
            if final_history.get(migration.version) != migration.name:
                raise MigrationFailure(
                    f"migration_history_mismatch:{migration.version}"
                )
        verify_final_state(database_url)
        records.append(
            {
                "test": "m2_remote_migration_delta",
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
                "test": "m2_remote_migration_delta",
                "status": "fail",
                "error_code": code,
            }
        )

    for record in records:
        print(json.dumps(record, separators=(",", ":"), sort_keys=True))
    return (
        0
        if records and all(record["status"] == "pass" for record in records)
        else 1
    )


if __name__ == "__main__":
    raise SystemExit(main())
