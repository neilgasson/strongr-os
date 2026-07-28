# Strongr Daily v2 Supabase acceptance

## Scope

`scripts/acceptance/run_strongr_daily_v2_supabase_acceptance.ts` is a focused,
destructive-fixture acceptance harness for the configured disposable Supabase
project. It proves:

1. the v2 brief, governed generation command, service-role completion, and exact
   persisted v2 version;
2. response-schema allow-listing and brief/response schema equality;
3. deterministic checks, three independent human review lanes, AAL2 approval,
   exact-version binding, immutable package creation, revocation, and tenant
   isolation;
4. exact JSON and Markdown projections of the approved immutable package; and
5. a v1 brief-to-draft smoke path and the absence of an M1 publishing command.

The harness never publishes. Its export status is
`manual_upload_required`.

The harness creates two temporary Auth users and two temporary organizations.
It removes their tenant rows and Auth users in `finally`, including when an
assertion fails. It also writes a redacted JSON evidence artifact even on
failure.

## Required environment

- `STRONGR_OS_M1_ACCEPTANCE_TARGET` — must be
  `strongr-os-disposable`.
- `STRONGR_OS_PROJECT_REF` — disposable Supabase project reference.
- `STRONGR_OS_SUPABASE_URL` — HTTPS API URL for that same project.
- `STRONGR_OS_SUPABASE_PUBLISHABLE_KEY` — publishable key for Auth and
  authenticated Data API calls.
- `STRONGR_OS_SUPABASE_SERVICE_ROLE_KEY` — server-only service-role or secret
  key used only by the worker and Auth-admin portions of the harness.
- `STRONGR_OS_DATABASE_URL` — direct or session-pooler Postgres connection
  string for that same project.

Optional:

- `STRONGR_OS_V2_ACCEPTANCE_ARTIFACT` — output path for the evidence JSON.
  Defaults to `artifacts/acceptance/strongr-daily-v2.json`.

The harness validates that the API URL and database connection belong to
`STRONGR_OS_PROJECT_REF`. It does not print key values or the database URL.

## Windows PowerShell execution

From the repository root:

```powershell
$env:STRONGR_OS_M1_ACCEPTANCE_TARGET = "strongr-os-disposable"
$env:STRONGR_OS_PROJECT_REF = "guovsmbtxuowyyqamaex"
$env:STRONGR_OS_SUPABASE_URL = "https://guovsmbtxuowyyqamaex.supabase.co"
$env:STRONGR_OS_SUPABASE_PUBLISHABLE_KEY = "<disposable publishable key>"
$env:STRONGR_OS_SUPABASE_SERVICE_ROLE_KEY = "<disposable service-role or secret key>"
$env:STRONGR_OS_DATABASE_URL = "<disposable direct or session-pooler Postgres URL>"

npx supabase link --project-ref $env:STRONGR_OS_PROJECT_REF
npx supabase db push --linked
npx supabase migration list --linked
pnpm acceptance:strongr-daily-v2
```

The remote acceptance gate passes only when the final JSONL summary has
`"status":"pass"` and the evidence artifact also has `"status": "pass"`.
Do not open the v2 pull request before that result.
