import assert from "node:assert/strict";
import test from "node:test";
import {
  databaseCommandDiagnostic,
  sanitizeDatabaseDiagnostic,
} from "../database-command-diagnostics.ts";

test("database command diagnostics retain only redacted PostgreSQL fields", () => {
  const diagnostic = databaseCommandDiagnostic({
    command: "migration_history_count",
    lifecycleStep: "v2_forward_fix_migration_recorded_once",
    stderr: [
      "ERROR:  55000: migration state is invalid for [redacted-email]",
      "DETAIL:  password=super-secret postgresql://postgres:db-password@db.example.test:5432/postgres",
      "HINT:  Retry with Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.claim.signature",
    ].join("\n"),
  });

  assert.deepEqual(diagnostic, {
    command: "migration_history_count",
    detail: "password=[redacted] [redacted-url]",
    hint: "Retry with Authorization:[redacted] [redacted-token]",
    lifecycleStep: "v2_forward_fix_migration_recorded_once",
    message: "migration state is invalid for [redacted-email]",
    postgresCode: "55000",
  });
  assert.doesNotMatch(JSON.stringify(diagnostic), /super-secret|db-password|db\.example\.test|eyJhbGci/i);
});

test("database command diagnostics redact structured payloads and API keys", () => {
  const value = sanitizeDatabaseDiagnostic(
    'DETAIL: payload={"email":"person@example.com","apiKey":"sb_secret_private-value"}',
  );

  assert.equal(value, "[redacted-structured-value]");
  assert.doesNotMatch(value ?? "", /person@example\.com|sb_secret_private-value/i);
});

test("database command diagnostics redact database values that could identify a person", () => {
  const value = sanitizeDatabaseDiagnostic(
    "Key (display_name)=(Neil Gasson) already exists. Failing row contains (42, Neil Gasson).",
  );

  assert.equal(
    value,
    "Key (display_name)=([redacted]) already exists. Failing row contains ([redacted]).",
  );
  assert.doesNotMatch(value ?? "", /Neil Gasson/);
});
