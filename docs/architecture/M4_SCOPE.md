# M4 scope — production-readiness foundations

Status: owner-approved on 2026-07-28. Implementation may proceed only through
the protected delivery sequence and stop conditions below.

## Recommendation

M4 should make the accepted Strongr OS workflow operationally ready for a later
production decision before introducing live AI, voice, publication, or another
Strongr Society product.

This ordering keeps infrastructure, secrets, monitoring, recovery, release, and
incident controls ahead of paid providers and real content. M4 ends with an
evidence-backed production-readiness decision. It does not launch production.

## Intended outcome

M4 may establish and prove:

- an explicit environment model for local, disposable, development, staging,
  and future production targets;
- infrastructure and application configuration that is reproducible,
  repository-traceable, least-privileged, and rollback-capable;
- secret ownership, storage, access, rotation, revocation, and incident
  procedures without placing secrets in browsers, builds, logs, screenshots, or
  retained evidence;
- privacy-safe health, audit, metrics, logs, alerts, service-level indicators,
  and operating thresholds;
- scheduled encrypted backups, independent restore targets, reconciliation, and
  measured recovery objectives using synthetic data;
- bounded load, concurrency, soak, failure-injection, dependency-failure, and
  recovery evidence for the accepted governed workflow;
- release, rollback, change-management, incident-response, and operator
  runbooks;
- a final readiness record that states what is proven, what remains unproven,
  expected operating cost, residual risk, and the explicit owner decision still
  required before any production launch.

## Entry gate

Implementation may begin only after:

1. the owner explicitly approves this scope or an amended successor;
2. final M3 acceptance remains recorded on protected `main`;
3. the strict required checks include:
   - `Database contract / test`;
   - `M0.2 reliability proof / acceptance`;
   - `M1 application / foundation`;
   - `M1 acceptance / local`;
   - `M2 acceptance / local`;
   - `M3 application / browser foundation`;
4. the main-protection ruleset remains active with no bypass actors;
5. the owner-only M3 preview remains private and bound only to
   `strongr-os-dev`;
6. the current Strongr Daily application remains unchanged.

If any entry condition is false, stop before changing environments,
infrastructure, secrets, monitoring, or data.

## Protected delivery sequence

### M4.0 — architecture and operational threat model

- Define environment ownership, trust zones, data classifications, credential
  classes, deployment identities, network boundaries, and promotion rules.
- Define measurable availability, recovery, privacy, accessibility, performance,
  and cost targets.
- Inventory every external dependency and document failure, rollback, and
  revocation behavior.
- Produce an architecture decision and threat-model update before provisioning.

### M4.1 — reproducible staging and secret boundaries

- Create only the separately approved non-production staging resources.
- Keep staging isolated from Strongr Daily and any future production tenant,
  credential, domain, data, or Storage.
- Make builds immutable and traceable to protected commits and dependency
  lockfiles.
- Enforce least-privileged deployment identities and a documented secret
  lifecycle.
- Prove deployment, configuration validation, rollback, and environment
  separation with synthetic data.

### M4.2 — observability, alerting, and operating procedures

- Add privacy-safe health, queue, retry, dead-letter, Storage, Auth, database,
  worker, backup, restore, and browser telemetry.
- Define actionable alerts with owners, severity, escalation, suppression, and
  recovery criteria.
- Prove that logs and evidence exclude credentials, private media, sensitive
  content, TOTP material, and unnecessary personal data.
- Add operator, release, rollback, incident, access-review, and credential
  rotation runbooks.

### M4.3 — resilience, capacity, and recovery proof

- Run bounded load, concurrency, soak, retry-storm, dependency-failure, and
  partial-outage tests against isolated synthetic environments.
- Prove scheduled encrypted backup creation, independent restore,
  database/Storage reconciliation, and cleanup.
- Record realistic recovery-time and recovery-point evidence separately from
  tiny deterministic fixtures.
- Establish capacity and cost envelopes with explicit assumptions and stop
  thresholds.

### M4.4 — readiness rehearsal and acceptance

- Rehearse a protected release and rollback without launching production.
- Rehearse incident detection, triage, containment, recovery, and evidence
  preservation.
- Run all M0–M4 regression, security, accessibility, recovery, and environment
  gates.
- Produce `evidence/m4/acceptance-record.json`.
- Require explicit owner acceptance of residual risk and readiness evidence.
- Require a new, separate production-launch decision after M4 acceptance.

## Non-goals

M4 does not authorize:

- a production deployment, public launch, custom production domain, or real
  customer/operator onboarding;
- publication, distribution, feeds, notifications, browser uploads, public
  buckets, public media, or signed/public delivery URLs;
- a live AI, voice, transcription, analytics, payment, email, or other paid
  external provider;
- real Strongr Society content, production data, production credentials, or
  production users;
- changes to the current Strongr Daily application or its infrastructure;
- a new Strongr Society product;
- weakening RLS, grants, tenant isolation, private Storage, MFA/AAL, audit,
  service-role, human approval, revocation, accessibility, privacy, or evidence
  boundaries.

## Required evidence

M4 evidence must be privacy-safe and bind:

- exact commits, pull requests, workflows, artifacts, dependencies, environment
  identifiers, deployment versions, and configuration classifications;
- ruleset state and all required checks;
- secret inventory classifications and lifecycle proof without secret values;
- environment isolation, immutable build, deployment, rollback, and drift
  results;
- observability coverage, alert delivery, incident and access-review rehearsals;
- load, concurrency, soak, failure-injection, capacity, and cost results;
- scheduled backup, independent restore, reconciliation, recovery objectives,
  and cleanup;
- a statement that no production launch, publication, live provider, public
  Storage, service-role browser exposure, or Strongr Daily change occurred.

## Stop conditions

Stop and require a new protected decision if implementation would require:

- production credentials, data, domains, tenants, users, or traffic;
- public access, publication, distribution, or browser-direct privileged
  mutation;
- a live external provider or paid service not explicitly approved in a later
  scope;
- a migration, RLS/grant change, Storage-policy change, or privileged service
  boundary that is not independently reviewed and migration-tested;
- a provider or environment that cannot prove isolation, rollback, secret
  handling, evidence retention, and cleanup;
- retaining credentials, private content, plaintext private media, TOTP
  material, or sensitive operator data in evidence;
- weakening any accepted M0–M3 control to meet a performance, deployment, cost,
  or convenience target.

## Owner approval

The repository owner explicitly approved this production-readiness-first M4
scope in the controlling Codex task on 2026-07-28 after reviewing draft PR #38.
That approval authorizes the protected M4.0–M4.4 implementation sequence inside
this document. It does not authorize production launch, publication, live
providers, Strongr Daily changes, bypassing required checks, or work outside the
defined gates.
