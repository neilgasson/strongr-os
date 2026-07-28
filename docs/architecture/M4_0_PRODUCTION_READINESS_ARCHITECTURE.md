# M4.0 production-readiness architecture

Status: proposed implementation record; no resource provisioning authorized.

## Outcome

M4.0 defines how the accepted Strongr OS workflow may move toward a future
production decision without confusing development, staging, production, or
Strongr Daily. This slice defines ownership, trust zones, data and credential
classes, network paths, promotion rules, operating objectives, and external
failure handling.

The governing decision is
[`ADR-0004`](../adr/ADR-0004-production-readiness-before-live-providers.md).
Measurable readiness gates are in
[`M4_OPERATING_OBJECTIVES.md`](../standards/M4_OPERATING_OBJECTIVES.md), and
operational threats are in
[`M4_OPERATIONS.md`](../threat-models/M4_OPERATIONS.md).

## Environment model

| Environment | Current state | Purpose | Data | Credentials | Promotion |
|---|---|---|---|---|---|
| Local | Exists | Developer and CI contract proof | Generated synthetic fixtures | Ephemeral local keys and local database URL | Never promoted |
| Disposable | Exists | Destructive remote restore and acceptance proof | Random synthetic fixtures, cleaned after run | Dedicated disposable database credential | Never promoted |
| Development (`strongr-os-dev`) | Exists | Protected remote acceptance and owner-only M3 preview | Synthetic Strongr OS data only | Development-only browser, worker, database, and acceptance values | Never renamed or promoted |
| Staging | Not provisioned | Future production-like release, rollback, recovery, load, and incident rehearsal | Synthetic data only until a later scope says otherwise | New staging-only identities and secrets | Exact protected-main artifact and reviewed migrations only |
| Production | Not provisioned or authorized | Future real operation after a separate launch decision | Undefined | Undefined; no production credential may exist in M4.0 | Forbidden |
| Strongr Daily | Existing external system, out of scope | Current Strongr Daily product | Existing Strongr Daily data | Existing Strongr Daily credentials | No connection |

Environment names, project identifiers, secrets, Auth users, redirect URLs,
Storage buckets, backups, telemetry destinations, deployment identities, and
domains may not be shared between staging and a future production environment.

## Trust zones and ownership

### Zone 1 — developer workstation

- May edit source and run local synthetic tests.
- May not deploy to staging or future production from an unreviewed commit.
- May not retain shared environment secrets in repository files, shell history,
  screenshots, logs, browser storage, or evidence.
- Local CLI access is not a future production release path.

### Zone 2 — GitHub source and protected CI

- GitHub is the source of truth for code, migrations, contracts, workflows,
  runbooks, and evidence.
- Protected `main`, strict required checks, pinned Actions, resolved
  conversations, and no bypass actors are the release entry boundary.
- Pull-request jobs receive no staging or production deployment credential.
- A future staging job must use a protected GitHub Environment, exact
  environment-scoped secrets, concurrency control, manual approval, and an exact
  protected commit.

### Zone 3 — static browser delivery

- The browser receives static files, a Supabase URL, and a publishable key only.
- The current OpenAI Sites deployment remains an owner-only development preview.
- A staging or future production host requires its own reviewed origin, access
  policy, security headers, rollback, and Supabase Auth redirect entries.
- Route visibility, browser state, and UI permissions never authorize data or
  commands.

### Zone 4 — Supabase project

- Each long-lived environment has its own Postgres, Auth, Storage, keys,
  project-level configuration, backups, logs, and access control.
- PostgreSQL RLS and narrow governed functions remain canonical authorization.
- Auth AAL2 remains mandatory for accepted sensitive human commands.
- Storage remains private and exact-object retrieval remains tenant-bound.
- Direct production development and local `db push` to production are forbidden.

### Zone 5 — server-side worker

- The worker uses one environment-specific Supabase secret or legacy
  service-role key only on the server side.
- Worker identities may draft, generate deterministic media, and record machine
  evidence through accepted commands; they may not assume human authority.
- A deployed worker runtime, schedule, queue trigger, secret store, or network
  egress policy is not selected in M4.0.

### Zone 6 — independent recovery

- Combined recovery covers database state, canonical Storage inventory, and
  exact private object bytes.
- Backup encryption keys are separate from backup ciphertext and from the source
  environment.
- Restore targets are separate projects or isolated local systems, never the
  live source during a rehearsal.
- Managed database restoration alone is not accepted as complete media recovery.

### Zone 7 — operations and evidence

- Operators receive the minimum platform, project, database, deployment, and
  evidence access needed for their role.
- Evidence may contain immutable identifiers, hashes, counts, bounded timings,
  states, safe log excerpts, and configuration classifications.
- Evidence may not contain tokens, passwords, private keys, TOTP material,
  session data, database URLs with credentials, private content, or plaintext
  private media.

## Data classification

| Class | Examples | Browser | Logs/metrics | CI artifacts | Backup |
|---|---|---|---|---|---|
| Public configuration | Static asset hashes, public Supabase origin, publishable key | Allowed by exact allowlist | Names only | Allowed | Not required |
| Operational metadata | UUIDs, correlation IDs, status, counts, durations, error codes | Tenant-scoped | Allowed when bounded | Allowed | Included as needed |
| Governed private content | Briefs, drafts, evidence text, review reasons | Authenticated tenant-scoped UI | Forbidden | Forbidden except synthetic fixtures | Encrypted |
| Private media | WAV bytes and transcript content | Exact authenticated in-memory use | Bytes/content forbidden | Plaintext forbidden | Independently encrypted |
| Identity and personal data | User ID, email, membership, session identity | Minimum supported Auth flow | Minimize; no unnecessary email | Forbidden unless synthetic | Encrypted platform backup |
| Credential or authenticator | Secret/service-role key, DB password/URL, management token, refresh token, TOTP seed/code, backup key | Forbidden except user session handled by Auth library | Forbidden | Forbidden | Key material stored separately |
| Recovery evidence | Ciphertext hash, inventory hash, object count, measured RPO/RTO | Not needed | Summary only | Allowed | Ciphertext retained per policy |

## Credential classes

| Class | Holder | Allowed use | Rotation/revocation trigger |
|---|---|---|---|
| Publishable browser key | Static host/browser | Auth and accepted RLS-protected APIs | Project key rotation, origin compromise, environment retirement |
| User access/refresh session | Supabase Auth and user browser | Current-user authenticated requests | Sign-out, compromise, role removal, inactivity/lifetime policy, incident |
| Worker secret/service role | Worker secret store only | Exact accepted worker commands and private object operations | Worker/runtime compromise, personnel/access change, scheduled rotation |
| Direct database credential | Migration/recovery job only | Reviewed migrations, backup, restore, verification | Job/environment compromise, use outside approved workflow, scheduled rotation |
| Supabase management token | Protected deployment/recovery job only | Project management action explicitly named by the workflow | Any disclosure, owner access change, workflow compromise |
| Hosting/deployment identity | Protected deployment job or provider | Save/deploy/rollback exact artifact | Provider or workflow compromise, environment retirement |
| Backup encryption key | Approved backup job and restore custodian | Encrypt/decrypt one approved archive set | Drill completion for ephemeral keys; custody or algorithm incident for retained keys |
| Owner passkey/TOTP | Owner authenticator only | Platform and application MFA | Device loss, suspected compromise, factor replacement |

No class may be reused across staging and future production. A publishable key is
public configuration, but its environment binding and RLS protections remain
mandatory.

## Network and request boundaries

Allowed future paths must be explicitly reviewed:

1. Operator browser → exact static host origin over HTTPS.
2. Operator browser → exact environment Supabase Auth/Data/Storage origin over
   HTTPS, using a publishable key and current user token.
3. Worker → exact environment Supabase API/Storage origin over HTTPS, using the
   worker-only secret.
4. Protected migration/recovery runner → exact environment database endpoint
   over encrypted Postgres, using an environment-scoped credential.
5. Approved telemetry collector → environment metrics/log source, using a
   read-only telemetry credential.
6. Backup runner → source database/Storage read paths and separate encrypted
   archive destination.

No generic proxy, browser-to-database connection, public Storage endpoint,
browser upload, cross-environment connection, or Strongr Daily path is allowed.

## Promotion rules

1. Every change starts on a protected pull request and passes all strict checks.
2. Migrations apply once from committed files to a clean isolated database and
   record exact history before any remote promotion.
3. The staging candidate is identified by a full protected-main commit and
   immutable artifact checksum.
4. A future staging workflow must verify environment identity before mutation
   and fail closed on an unknown or production target.
5. Staging receives the exact reviewed migrations and artifact; configuration
   supplies environment-specific public origins and non-browser secrets.
6. Staging acceptance proves security, tenant isolation, MFA/AAL, private media,
   accessibility, recovery, observability, performance, cost, cleanup, and
   rollback.
7. Rollback selects a known prior immutable artifact and uses forward database
   repair when schema state changed. Destructive schema rollback is not assumed.
8. No workflow in M4 may target production. A future production workflow must be
   approved after M4 acceptance and must require a separate explicit launch
   decision.

## Configuration and drift

- Repository files define schemas, migrations, package versions, browser
  security, expected environment keys, and workflow logic.
- Secret stores contain values; repository evidence contains names and
  classifications only.
- Dashboard changes that affect Auth, Storage, database, access, backups,
  networking, or security must be exported or recorded as reviewed
  configuration evidence.
- Drift detection compares safe configuration shape and identifiers, never
  secret values.
- Unreviewed drift blocks promotion until reconciled by a protected change.

## Current external dependency inventory

| Dependency | Current role | Failure effect | Detection | Safe response |
|---|---|---|---|---|
| GitHub repository/rulesets | Source, review, protection | No trusted promotion | API/check status | Stop changes; never bypass |
| GitHub Actions/runners/artifacts | CI and evidence | Checks/evidence unavailable | Workflow status and artifact upload | Preserve local evidence; retry transient infrastructure only |
| Supabase Postgres/Data API | Canonical state and commands | Reads/writes/workers fail | Health, API/database errors, metrics | Fail closed; no fabricated success |
| Supabase Auth | Sessions and AAL | Sign-in/refresh/MFA fail | Auth errors/logs | Preserve no local authority; require re-authentication |
| Supabase Storage | Private media bytes | Playback/worker/recovery fail | Exact get/upload result, checksum, inventory | Block review/staging; reconcile |
| Supabase platform backups | Managed database recovery | RPO/RTO exposure | Backup inventory/restore drill | Use independent combined backup; escalate |
| OpenAI Sites | Owner-only M3 preview | Preview unavailable | Access and HTTP checks | No data mutation; rollback/disable preview |
| npm/pnpm registry | Pinned JS dependencies | Install/build unavailable or compromised | Lockfile/integrity/install failure | Stop build; never float versions |
| Container registries | Local Supabase images | CI acceptance unavailable | Pull/start/health errors | Preserve evidence; bounded retry |
| Ubuntu package mirrors | PostgreSQL client install | CI acceptance unavailable | Package install failure | Preserve evidence; bounded retry |
| Operator browser/device/passkey/TOTP | Human access and AAL2 | Operator cannot act | Auth/access failure | Recovery procedure; never lower AAL |
| DNS/TLS certificate authorities | HTTPS resolution/trust | Host/API unavailable or unsafe | Synthetic HTTPS checks | Stop; never bypass certificate validation |
| Deterministic AI/media adapters | Synthetic draft and WAV | Jobs fail | Durable attempt/error state | Retry/recover under existing job policy |

No live AI, voice, transcription, analytics, email, payment, or publication
dependency exists.

## M4.1 entry contract

M4.1 may begin only after M4.0 is accepted and must stop before provisioning
until the owner has approved:

- the exact staging provider/project/region and cost ceiling;
- the secret store and deployment identity model;
- the staging host, origin, access policy, and rollback behavior;
- the backup destination and key-custody design;
- the telemetry destination and privacy/retention configuration;
- a complete list of environment variables and GitHub Environment protections.

## M4.0 non-changes

M4.0 adds no application code, migration, RLS policy, grant, Storage policy,
bucket, Supabase project, hosting deployment, secret, domain, external provider,
production system, publication path, user, or Strongr Daily change.
