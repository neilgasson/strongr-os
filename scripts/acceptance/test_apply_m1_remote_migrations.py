from __future__ import annotations

import pathlib
import tempfile
import unittest

from apply_m1_remote_migrations import (
    database_matches_project,
    strip_transaction_wrapper,
)


class ApplyM1RemoteMigrationsTest(unittest.TestCase):
    def test_strips_only_the_outer_transaction(self) -> None:
        sql = """-- reviewed migration
begin;
do $body$
begin
  perform 1;
end;
$body$;
commit;
"""
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "20260726161909_test.sql"
            body = strip_transaction_wrapper(sql, path)

        self.assertIn("do $body$", body)
        self.assertIn("begin\n  perform 1;", body)
        self.assertNotIn("-- reviewed migration", body)
        self.assertFalse(body.rstrip().endswith("commit;"))

    def test_rejects_a_migration_without_an_outer_commit(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "20260726161909_test.sql"
            with self.assertRaisesRegex(RuntimeError, "migration_missing_commit"):
                strip_transaction_wrapper("begin;\nselect 1;\n", path)

    def test_matches_direct_and_transaction_pooler_project_urls(self) -> None:
        project = "fifrlyddmjkogmdvyjdp"
        self.assertTrue(
            database_matches_project(
                f"postgresql://postgres:password@db.{project}.supabase.co:5432/postgres",
                project,
            )
        )
        self.assertTrue(
            database_matches_project(
                f"postgresql://postgres.{project}:password@aws.pooler.supabase.com:6543/postgres",
                project,
            )
        )
        self.assertFalse(
            database_matches_project(
                "postgresql://postgres.other:password@aws.pooler.supabase.com:6543/postgres",
                project,
            )
        )


if __name__ == "__main__":
    unittest.main()
