# M4 operating objectives

Status: proposed M4.0 readiness gates, not a customer SLA or production
commitment.

## Use

These objectives define the evidence M4 must collect before the owner can make a
separate production-launch decision. A target marked "design" must be supported
by architecture and configuration. A target marked "measured" must pass in
isolated staging under a versioned workload and evidence set.

Targets may be tightened through a protected decision. They may not be weakened
silently to make acceptance pass.

## Service and integrity objectives

| Objective | M4 gate | Measurement |
|---|---:|---|
| Monthly availability design target | ≥ 99.5% excluding owner-approved maintenance | Synthetic successful sign-in/read and API/worker health intervals |
| Silent governed-command success | 0 | Every command returns canonical success or visible failure/correlation identity |
| Cross-tenant disclosure or mutation | 0 | Negative two-tenant database, API, browser, and Storage tests |
| Unauthorized privileged command success | 0 | Anonymous, wrong-role, AAL1, revoked, worker, and cross-tenant denial tests |
| Private object checksum mismatch accepted | 0 | Exact byte-count/SHA-256 verification and reconciliation |
| Publication or public-media side effect | 0 | Configuration scan, endpoint scan, workflow evidence |
| Unreviewed environment drift at promotion | 0 | Safe configuration-shape comparison |

## Recovery objectives

| Objective | Initial M4 target | Notes |
|---|---:|---|
| Database recovery point objective | ≤ 24 hours | Must be replaced by a measured plan-specific target before launch; PITR decision remains explicit |
| Private Storage recovery point objective | ≤ 24 hours | Requires scheduled independent byte backup; database backup is insufficient |
| Combined database and Storage recovery time objective | ≤ 4 hours | Measured on production-like synthetic staging volume |
| Backup completion success | 100% scheduled runs over a 30-day rehearsal | Failures alert and create durable incident evidence |
| Restore drill frequency | At least monthly during M4 rehearsal | Always to an isolated target |
| Restored canonical/object reconciliation | 100% exact | Missing, orphan, size, and checksum differences fail |
| Backup credential or plaintext in retained artifact | 0 | Automated scan plus manual evidence review |

## Performance and capacity objectives

The workload manifest must record fixture counts, concurrency, request mix,
database size, object bytes, runner/provider plan, region, warm-up, duration, and
exact commit.

| Operation | Initial measured target |
|---|---:|
| Authenticated canonical queue read | p95 ≤ 1.5 seconds, p99 ≤ 3 seconds |
| Tenant-scoped Studio detail read | p95 ≤ 1.5 seconds, p99 ≤ 3 seconds |
| Governed command acknowledgement, excluding asynchronous work | p95 ≤ 2 seconds, p99 ≤ 4 seconds |
| Worker claim to deterministic draft completion | p95 ≤ 30 seconds |
| Worker claim to deterministic WAV completion | p95 ≤ 30 seconds |
| Exact private media start after user action | p95 ≤ 3 seconds for the approved staging fixture |
| Error rate under approved steady load | < 1%, excluding deliberate denial tests |
| Sustained resource saturation | 0 intervals above the approved critical threshold for 5 continuous minutes |

M4.3 chooses the actual staging concurrency and volume after capacity and cost
limits are approved. Load testing must not target `strongr-os-dev`, the
disposable restore project, a future production project, or Strongr Daily.

## Security and privacy objectives

| Objective | Target |
|---|---:|
| RLS-disabled table in an exposed schema | 0 |
| Browser-visible secret/service-role/database credential | 0 |
| Cross-environment secret reuse | 0 |
| Long-lived shared credential without owner, use, rotation, and revocation record | 0 |
| Credential, session, TOTP material, private content, or private-media bytes in logs/evidence | 0 |
| Unpinned GitHub Action or runtime dependency | 0 |
| Critical/high unaccepted security-advisor finding introduced by M4 | 0 |
| Platform owner/admin account without MFA | 0 |
| Staging deployment not bound to an exact protected commit and artifact hash | 0 |
| Secret available to untrusted pull-request code | 0 |

## Accessibility objectives

| Objective | Target |
|---|---:|
| Automatically detectable WCAG 2.2 A/AA violations in approved flows | 0 |
| Keyboard-inoperable action | 0 |
| Missing programmatic label or error association | 0 |
| Unannounced asynchronous status/error transition | 0 |
| Horizontal overflow at approved narrow viewport and 400% zoom test | 0 |
| Missing transcript for reviewed audio | 0 |
| Reduced-motion preference ignored by non-essential motion | 0 |

Manual screen-reader, focus-order, contrast, touch-target, zoom, and error
recovery evidence remains mandatory; automation alone cannot satisfy
accessibility acceptance.

## Observability objectives

| Objective | Target |
|---|---:|
| Critical workflow lane without a health/status signal | 0 |
| Critical alert without owner, severity, threshold, runbook, and recovery condition | 0 |
| Test critical alert delivery | ≤ 5 minutes |
| Request/command/worker path without safe correlation identity | 0 |
| Durable retry/dead-letter state hidden from operators | 0 |
| Backup, restore, reconciliation, deployment, and rollback without evidence | 0 |
| Telemetry retention without documented duration and deletion behavior | 0 |

Supabase Metrics API is currently beta and its names may evolve. M4.2 must pin
the consumed metric contract behind repository-owned recording rules or select
another approved source; changing upstream metric names must fail visibly.

## Cost objectives

- M4.1 must record one-time and monthly estimates before provisioning.
- Every paid resource needs an owner, purpose, plan, region, cancellation path,
  and maximum approved monthly cost.
- Budget alerts must fire at 80% and 100% of the approved monthly ceiling where
  the selected provider supports them.
- Load and soak tests require a per-run cost estimate and hard stop.
- Unexplained cost variance above 20% blocks readiness acceptance.
- No paid live content provider may be included in the M4 budget.

## Error budget and response

The 99.5% design target corresponds to an initial monthly error budget; it is not
a promise to users. M4.2 must define calculation windows and approved
maintenance treatment. Exhausting the staging error budget stops release
rehearsal and triggers reliability work. Security, tenant isolation, private
media, human authority, and data integrity have zero error budget.

## Acceptance evidence

Every measured objective records:

- exact protected commit and artifact;
- environment classification and safe identifier;
- test/workload version;
- start/end time and sample count;
- raw privacy-safe measurement artifact and digest;
- pass/fail calculation;
- exclusions and approved maintenance;
- cleanup and cost result;
- owner review where required.
