# M4 operational threat model

Status: proposed M4.0 threat model.

## Protected assets

- tenant-scoped governed records and immutable authority evidence;
- private media bytes and canonical checksums;
- operator identities, memberships, sessions, MFA factors, and AAL;
- worker, database, management, deployment, telemetry, and recovery credentials;
- migration history, protected source, immutable artifacts, and evidence;
- backup ciphertext, inventory, key custody, recovery objectives, and runbooks;
- Strongr Daily isolation;
- owner-only M3 preview isolation;
- future staging and production separation.

## Trust assumptions

- GitHub protected `main` and the active no-bypass ruleset remain the source
  boundary.
- Supabase operates hosted infrastructure while Strongr OS owns application
  architecture, access management, data, schema, security controls, resource
  sizing, and third-party monitoring.
- Provider availability, plan features, retention, metric names, and pricing can
  change and must be verified when a resource is selected.
- Operators and CI are potentially fallible; destructive and privileged actions
  require target verification, least privilege, evidence, and rollback.
- No live provider, production environment, or publication system exists in
  M4.0.

## Threats and controls

| Threat | Preventive control | Detection/evidence | Safe response |
|---|---|---|---|
| Development project is promoted or renamed as production | Separate projects and credentials; production target undefined | Environment identity contract | Stop; create a reviewed separate environment |
| Staging command targets development, disposable, production, or Strongr Daily | Exact project/target allowlist and typed confirmation | Preflight target evidence | Fail before mutation |
| Pull-request code receives deployment or database secrets | Environment secrets unavailable to pull-request jobs | Workflow permission and secret-availability scan | Cancel run; rotate if exposed |
| Secret appears in browser bundle, runtime config, log, URL, screenshot, or artifact | Exact public allowlist and server-only secret stores | Source/bundle/artifact privacy scans | Disable affected deployment; revoke/rotate |
| Same credential is reused across environments | Environment-specific credential inventory | Safe fingerprints/classification comparison | Block promotion and rotate |
| Owner/admin platform account is compromised | Passkey/TOTP MFA and minimum platform roles | Access review and provider audit evidence | Revoke sessions/tokens, rotate environment secrets, incident process |
| GitHub workflow or Action is compromised | Pinned Action commits, minimal permissions, protected review | Dependency/action inventory and workflow diff | Stop promotion; rotate CI-accessible credentials |
| Package or container supply chain changes silently | Lockfile, exact versions/digests, immutable artifact manifest | Install integrity and artifact checksum | Stop build; investigate and update through PR |
| Environment-specific rebuild produces different code | Build once, promote exact checksum | Artifact manifest comparison | Reject deployment |
| Migration applies twice or history diverges | Clean replay, atomic history, exact version verification | Migration history evidence | Stop; forward repair only |
| Dashboard configuration drifts from repository contract | Safe configuration-shape inventory and reviewed exceptions | Drift check | Block promotion until reconciled |
| RLS/grant/Storage policy is weakened for operations | Existing security checks plus advisor review | Schema diff and negative acceptance | Reject change |
| Browser or worker treats timeout as success | Canonical reread and durable state; no optimistic authority | Correlation IDs and state evidence | Show unknown/failure; retry only safely |
| Provider outage causes unsafe bypass | Fail-closed authorization and no alternate public path | Health, status page, logs, metrics | Pause operation; never lower controls |
| Auth outage or stale session grants authority | Database re-evaluates identity, membership, permission, and AAL | Real denial tests | Require re-authentication |
| Storage outage or checksum mismatch is ignored | Exact retrieval and checksum verification | Reconciliation event and alert | Block review/staging |
| Database backup is treated as media recovery | Separate canonical Storage byte archive | Combined restore/reconciliation drill | Do not declare recovery complete |
| Backup job silently stops | Scheduled job evidence and missed-run alert | Backup inventory freshness | Escalate; restore readiness blocked |
| Backup key and ciphertext share one failure domain | Separate custody/destination | Key/ciphertext location classification | Re-key/re-backup; incident if co-located |
| Restore drill overwrites source or another environment | Separate restore target and destructive confirmation | Target preflight plus project identity | Fail before restore |
| Restore is byte-correct but authority state is stale or invalid | Database/object reconciliation and governed contract replay | Full post-restore acceptance | Keep target isolated; repair forward |
| Logs expose personal or governed content | Structured allowlist of IDs/counts/durations/codes | Automated scanning and manual review | Quarantine/delete evidence and treat as privacy incident |
| Telemetry credential grants mutation | Read-only telemetry identity | Credential capability test | Revoke and replace |
| Metrics change upstream and alerts go silent | Repository-owned recording/alert contract | Missing-series and test-alert checks | Mark monitoring degraded; block release |
| Alert fires with no accountable response | Owner, severity, runbook, escalation, recovery condition required | Alert catalog validation and rehearsal | Escalate; readiness fails |
| Alert fatigue hides a real incident | Bounded actionable thresholds and suppression review | Alert-volume/error-budget report | Tune through protected change |
| Load test harms shared development or future production | Dedicated staging, approved manifest, cost/resource hard stops | Target and workload preflight | Abort and clean up |
| Retry storm amplifies dependency failure | Bounded attempts, backoff, leases, dead letters, circuit/stop thresholds | Queue/retry saturation metrics | Pause claims and recover deliberately |
| Resource exhaustion creates partial success | Capacity thresholds and transactional boundaries | Saturation plus canonical-state checks | Fail closed; scale only after review |
| Cost runaway from load, logs, storage, backups, or compute | Approved ceiling, estimates, 80/100% alerts, per-run stop | Billing evidence | Stop nonessential jobs/resources |
| Rollback restores code but not compatible schema/config | Immutable artifact plus compatibility and forward-repair plan | Rollback rehearsal | Use known compatible artifact/config; repair forward |
| Incident response destroys evidence or unrelated data | Append-only privacy-safe evidence and scoped cleanup | Rehearsal and cleanup manifest | Stop destructive action; preserve exact identifiers |
| Solo maintainer becomes unavailable | Durable runbooks, credential/recovery custody plan, least-privilege access inventory | Access and recovery rehearsal | No launch until continuity risk is accepted |
| M4 work leaks into Strongr Daily | Path, credential, project, environment, and repository boundary checks | Changed-file and target inventory | Stop and revert scoped change |
| Passing M4 is interpreted as launch approval | Separate production decision is mandatory | Acceptance record explicit non-authorization | Keep production target absent |

## Abuse and misuse cases

- An operator copies a database URL into a troubleshooting ticket.
- A workflow maintainer adds a diagnostic command that prints environment
  variables.
- A staging load test accidentally uses `strongr-os-dev`.
- A restore rehearsal points at the source because the target variable is empty.
- A provider dashboard change adds a wildcard Auth redirect.
- A new monitoring integration receives service-role credentials for
  convenience.
- A worker runtime is granted human approval or publication authority.
- A deployment succeeds despite a failed evidence upload.
- An owner treats provider backup retention as verified combined recovery.

Each misuse case must be represented by a preventive contract or a failing
acceptance test before M4 completion.

## Residual risks after M4.0

- No staging provider, plan, region, host, worker runtime, secret store,
  telemetry destination, backup destination, or key custodian is selected.
- Operating targets are unmeasured design objectives until M4.1–M4.3.
- Solo-maintainer continuity and emergency access are not yet rehearsed.
- Supabase Metrics API is beta and an alert contract has not been implemented.
- Managed backup retention, PITR, SMTP, network restrictions, compute, and
  support plan choices remain open.
- A future production launch, live provider, publication path, and real-user
  privacy/compliance analysis each require a new protected decision.

## M4.0 acceptance

Accepting this threat model records the risks and required controls. It does not
claim the controls are deployed. M4.1–M4.4 must convert them into configuration,
tests, rehearsals, and privacy-safe evidence.
