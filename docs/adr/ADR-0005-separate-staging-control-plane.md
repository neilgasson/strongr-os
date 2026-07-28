# ADR-0005: Separate staging control plane

## Status

Proposed for owner acceptance. No resource in this decision has been
provisioned.

## Context

M4.0 requires staging to be isolated from `strongr-os-dev`, the destructive
disposable project, Strongr Daily, and any future production environment. The
existing Supabase organization `Strongr OS` is on the Free plan and already
contains its two allowed active projects:

- `strongr-os-dev`;
- `strongr-os-disposable`.

Upgrading that organization and adding staging would place development,
disposable recovery, and staging billing and organization-level access in one
failure domain. It would also charge compute for three active projects.

The accepted M3 host is intentionally tied to `strongr-os-dev`. Reusing its
project, URL, access policy, or runtime configuration would make rollback and
environment identity ambiguous.

Supabase's Metrics API currently requires a secret API key. Giving that key to a
telemetry SaaS would grant more capability than telemetry needs and conflict
with the M4 least-privilege objective.

## Decision

M4.1 proposes the following staging control plane:

1. A new Supabase organization named `Strongr OS Staging` on the Pro plan,
   containing one Micro project named `strongr-os-staging` in AWS
   `ca-central-1`.
2. A protected GitHub Environment named `strongr-os-staging` is the only holder
   of staging deployment, worker, telemetry-collector, and recovery
   credentials. Only protected `main` may deploy, and every secret-bearing job
   requires the repository owner to approve the environment.
3. A new OpenAI Sites project named `Strongr Studio Staging` serves the exact
   immutable protected-main static artifact. It is owner-only, has no groups or
   public access, and receives only the staging Supabase URL and publishable
   key.
4. The accepted worker runs only as an explicitly approved, bounded
   GitHub-hosted Actions job during M4 staging. No always-on worker runtime is
   selected or implied for a future production launch.
5. Encrypted database and private Storage archives are written to a private,
   Object-Lock-enabled Backblaze B2 bucket in the Canada East data region.
   Encryption-key custody remains outside Backblaze.
6. Privacy-safe metrics are sent to a Grafana Cloud Free stack in AWS
   `ca-central-1`. A protected repository-owned collector reads only approved
   safe aggregates and remote-writes them with a write-only Grafana token.
   Grafana never receives a Supabase secret, database credential, governed
   content, private media, session, or personal data.

The exact proposed resource and credential contract is
[`staging-resource-contract.json`](../../ops/staging/staging-resource-contract.json).

## Cost decision

Pricing was checked against current provider documentation on 2026-07-28.

- Supabase Pro with one Micro project: expected USD $25/month.
- Backblaze B2: expected USD $0/month while retained encrypted staging archives
  remain within the first 10 GB; any paid use counts toward the ceiling.
- Grafana Cloud Free: USD $0/month; upgrading is forbidden.
- GitHub-hosted Actions for this public repository and the existing OpenAI Sites
  entitlement: no incremental M4.1 charge is assumed. Any provider-presented
  charge requires a new decision before acceptance.

The proposed total expected cost is USD $25/month before tax. The hard M4
staging ceiling is USD $35/month before tax. Supabase Spend Cap must remain
enabled, no Supabase add-on may be enabled, and no paid Grafana plan may be
selected. A forecast above the ceiling stops provisioning and testing.

## Security consequences

- Staging has its own organization, project, users, data, Auth configuration,
  Storage, keys, host, telemetry stack, recovery bucket, and evidence.
- Browser configuration stays public and contains no secret.
- The worker secret cannot perform human review, approval, release staging, or
  revocation; existing database authorization remains canonical.
- A dedicated telemetry database login may receive only `CONNECT` plus exact
  execution on privacy-safe aggregate functions added through an independently
  reviewed migration. It must not receive `pg_monitor`, table access,
  `BYPASSRLS`, Data API access, or a Supabase secret/service-role key.
- Backup ciphertext and encryption-key custody use different providers.
- The owner is the only current reviewer. GitHub's prevent-self-review setting
  therefore cannot be enabled without deadlocking deployments. This
  solo-maintainer risk remains explicit and must be revisited before production.

## Rejected alternatives

### Upgrade the existing Free organization

Rejected because it couples development, disposable restore, and staging
organization access, billing, and restrictions and increases the expected
compute footprint.

### Use a third project in the existing Free organization

Rejected because the organization already contains the two active projects
allowed by the Free plan.

### Reuse the M3 preview Sites project

Rejected because its code and configuration intentionally pin
`strongr-os-dev`.

### Let Grafana Cloud scrape Supabase directly

Rejected because the supported integration requires a Supabase secret API key,
which is not a read-only telemetry credential.

### Store recovery archives only as GitHub artifacts

Rejected because source, deployment evidence, operational key custody, and
recovery ciphertext would share one provider failure domain.

## Approval and stop condition

Accepting this ADR authorizes creation only of the named non-production
resources within the USD $35/month ceiling. It does not authorize production,
public access, live providers, real content, Strongr Daily changes, or any
weakened database, Storage, MFA, tenant, service-role, or human-governance
boundary.

Provisioning must not begin until the owner explicitly accepts this ADR and the
machine-readable contract. Supabase project creation additionally requires the
owner to confirm the exact provider-reported recurring cost immediately before
the create operation.

## References

- [Supabase pricing](https://supabase.com/pricing)
- [Supabase organization billing](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Supabase regions](https://supabase.com/docs/guides/platform/regions)
- [Supabase cost control](https://supabase.com/docs/guides/platform/cost-control)
- [Supabase database backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase Metrics API](https://supabase.com/docs/guides/telemetry/metrics)
- [GitHub deployment environments](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments)
- [Backblaze B2 regions](https://www.backblaze.com/docs/cloud-storage-data-regions)
- [Backblaze B2 pricing](https://www.backblaze.com/cloud-storage/pricing)
- [Grafana Cloud regional availability](https://grafana.com/docs/grafana-cloud/security-and-account-management/regional-availability/)
- [Grafana Cloud pricing](https://grafana.com/pricing/)
