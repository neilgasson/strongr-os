# ADR-0004: Production readiness before live providers

## Status

Proposed for M4.0 acceptance under the owner-approved
[`M4_SCOPE.md`](../architecture/M4_SCOPE.md).

## Context

M0–M3 provide an accepted governed audio workflow and an owner-only
non-production Studio preview. The workflow uses deterministic text and media
adapters. It has no production environment, production users, public
publication path, or live AI or voice provider.

Adding a live provider first would introduce credentials, paid side effects,
provider data handling, rate limits, outage modes, and cost risk before Strongr
OS has a separately proven staging boundary, operational monitoring, scheduled
combined database/Storage recovery, or release and incident procedures.

The current hosted dependencies also have different recovery properties.
Supabase database backups do not contain Storage object bytes, and the owner-only
preview is not a production hosting decision. GitHub, Supabase, OpenAI Sites,
package registries, container registries, and operator authentication are all
external failure domains.

The Supabase changelog and current deployment, security, backup, Auth, and
telemetry guidance were reviewed on 2026-07-28. The current Data API
auto-exposure and OAuth response-code changes do not require an M4.0 code or
schema change. Future migrations must continue to declare and test intended API
grants explicitly, and integrations must accept the successful 2xx OAuth
response range rather than one hard-coded success status.

## Decision

M4 establishes production-readiness foundations before any live provider or
production-launch decision.

1. Strongr OS uses separate local, disposable, development, staging, and future
   production trust zones. Staging and production must be distinct Supabase
   projects with distinct credentials, Auth configuration, Storage, users, and
   data.
2. Protected `main` is the only promotion source. A release promotes an exact
   already-built artifact and reviewed migration set; it does not rebuild from
   an untrusted or mutable source.
3. Pull requests prove clean local replay. A later manually approved staging
   workflow may deploy only to the staging environment. Production deployment
   remains undefined and forbidden until a separate post-M4 owner decision.
4. Browser configuration remains public and allowlisted. User sessions remain
   user-bound. Worker, database, management, deployment, and backup credentials
   remain non-browser, environment-specific, least-privileged, revocable, and
   unavailable to pull requests from untrusted code.
5. Database and private Storage recovery remain a combined Strongr OS
   responsibility. Managed database backups are not treated as object-byte
   backups.
6. Telemetry is privacy-safe by construction: identifiers, correlation IDs,
   counts, durations, states, and bounded error codes are allowed; credentials,
   tokens, TOTP material, private content, and private media are forbidden.
7. Readiness is evaluated against versioned service, recovery, security,
   privacy, accessibility, performance, and cost objectives. Passing M4 can
   support a later launch decision but cannot make that decision.

## Consequences

- M4.0 creates documents and contracts only; it provisions nothing.
- M4.1 must choose and separately approve any staging providers, plans, regions,
  secret stores, deployment identities, and cost ceilings before creation.
- Live AI, voice, transcription, analytics, email, payment, publication, and
  distribution remain outside M4.
- Strongr Daily remains outside the Strongr OS trust boundary.
- A slower delivery sequence is accepted in exchange for isolated credentials,
  reproducible releases, measurable recovery, and explicit operating ownership.
- Any future production launch requires a new architecture review, exact
  production configuration, residual-risk record, and explicit owner approval.

## Rejected alternatives

### Connect live providers before operations

Rejected because paid and private side effects would precede staging, monitoring,
recovery, cost, and incident controls.

### Promote `strongr-os-dev` into production

Rejected because development identities, synthetic fixtures, redirect origins,
operator history, and credentials must not become production state.

### Rebuild separately in every environment

Rejected because environment-specific rebuilds weaken artifact provenance and
make rollback less reliable.

### Treat managed database backup as complete recovery

Rejected because Supabase database backups contain Storage metadata, not the
private object bytes themselves.

### Let a successful deployment authorize launch

Rejected because deployment success does not prove security, accessibility,
recovery, support readiness, cost, human governance, or owner acceptance.

## Verification

M4.0 acceptance requires:

- the environment and promotion architecture;
- versioned operating objectives;
- a complete current dependency/failure inventory;
- the operational threat model;
- confirmation that no resource, credential, schema, policy, application, host,
  provider, production, publication, or Strongr Daily change occurred.

## References

- [Supabase: Managing Environments](https://supabase.com/docs/guides/deployment/managing-environments)
- [Supabase: Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Supabase: Shared Responsibility Model](https://supabase.com/docs/guides/deployment/shared-responsibility-model)
- [Supabase: Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase: Metrics API](https://supabase.com/docs/guides/telemetry/metrics)
- [Supabase Changelog](https://supabase.com/changelog)
