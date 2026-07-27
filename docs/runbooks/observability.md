# M0.2/M1/M2 Observability Runbook

## Signals

M0.2 exposes:

- structured JSON from acceptance and health scripts;
- append-only database audit events for outbox claims, failures, recovery,
  dead letters, and delivery;
- worker heartbeats;
- `m0_operational_health()` for a single readiness result; and
- `m0_operational_metrics()` for provider-neutral metrics;
- M2 media-job state, attempts, latency, byte count, provider-neutral cost and
  correlation identifiers;
- append-only media reconciliation events for ambiguous upload, missing
  object, orphan object, checksum mismatch, and verified repair; and
- acceptance inventory, encrypted-backup checksum, restore duration, and
  fixture-cleanup status.

No personal journal, prayer, Scripture text, draft content, API key, JWT,
database URL, email address, or password may enter logs, labels, or alerts.
Use IDs, counts, stable error codes, and correlation IDs.

## Health command

```bash
STRONGR_OS_DATABASE_URL='[secret connection string]' \
  scripts/ops/check_m0_2_health.sh
```

Exit codes:

- `0`: healthy
- `1`: degraded or unhealthy
- `2`: configuration/tooling error

`STRONGR_OS_HEALTH_ALLOW_DEGRADED=true` may be used only for a non-blocking
diagnostic probe. It must not be used for the production-readiness gate.

## Metrics command

```bash
STRONGR_OS_DATABASE_URL='[secret connection string]' \
  scripts/ops/export_m0_2_metrics.sh
```

The output uses OpenMetrics-compatible `name value` lines. The reference alert
rules are in `ops/monitoring/prometheus-rules.yml`.

## Alert response

### Dead letter

Severity: critical.

Follow `docs/runbooks/outbox-recovery.md#dead-letter`. Do not replay until the
external side effect is reconciled.

### Expired lease

Severity: warning after five minutes.

Confirm a worker is polling, inspect the heartbeat, and let the lease recovery
path reclaim the event. Do not clear the token manually.

### Outbox backlog

Severity: warning when the oldest ready event exceeds ten minutes for five
minutes.

Check worker availability, error rate, downstream provider state, and database
connections. Pause new nonessential generation requests if backlog continues
to grow.

### Stale worker

Severity: critical after five minutes.

Confirm process health and credentials. Restart through the deployment
platform, then confirm a fresh heartbeat before closing the incident.

## Minimum alert routing before launch

- critical: immediate notification to the owner and incident log;
- warning: owner notification during the same operating day;
- every alert: correlation ID, first observed time, latest value, environment,
  runbook link, acknowledgement, and resolution;
- alert delivery itself: tested quarterly.

Provider-specific alert integration is deferred until a deployment platform is
selected. The metrics names, thresholds, and response procedures are already
fixed by this gate.

## M2 media response

- `dead_letter`: treat as critical and reconcile Storage before any replay.
- `checksum_mismatch`: block staging, preserve both expected and observed
  hashes, and investigate write authority; never overwrite the object.
- `object_missing`: block staging and restore only from a checksum-verified
  independent backup.
- `object_orphaned`: do not adopt automatically; prove its intended job,
  canonical path, and checksum first.
- failed cleanup: retain the exact organization/object identifiers in the
  private evidence artifact and remove only those fixtures through the
  supported APIs.
