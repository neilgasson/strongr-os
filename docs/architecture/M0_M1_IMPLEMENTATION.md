# M0/M1 Database Implementation

## Scope

This repository implements the database and repository controls required for:

- **M0 — Governed Platform Kernel**
- **M1 — Governed Strongr Daily Audio Reflection Package**

It does not publish content, modify the current Strongr Daily app, automate
ElevenLabs or artwork, add recommendations, or introduce machine learning.

## Migration order

1. `202607241230_m0_governed_platform_kernel.sql`
2. `202607241330_m1_governed_audio_reflection.sql`

M0 establishes identity, organizations, memberships, append-only role and
permission grants/revocations, browser-read RLS, audit evidence, idempotency,
and the transactional outbox.

M1 establishes content identity, immutable briefs and versions, durable
generation intent, versioned automated checks, separate human review decisions,
Scripture and rights evidence, exact approval snapshots, revocation, workflow
history, and immutable production-package manifests.

## Trust boundaries

- Browser roles receive tenant-filtered reads and narrow command execution.
- Browser roles receive no direct writes to governed tables.
- Automated check ingestion is restricted to `service_role`.
- Owner bootstrap is available only through the non-exposed `app_private`
  schema and must be executed by a database administrator.
- Human review, approval, revocation, export, and policy activation require
  database permissions; privileged actions also require AAL2.
- AI output can become a draft artifact but can never approve, revoke, export,
  or publish.

## Content integrity

`jsonb::text` is used as PostgreSQL's canonical key ordering for stored payload
hashes. A submitted version cannot return to draft. Payload, schema, source,
identity, and author fields cannot change in place.

Approval records capture the exact:

- content version and payload hash;
- policy;
- automated check run and result records;
- Scripture evidence;
- rights snapshot;
- Scripture, theology, and editorial decisions;
- approver membership and AAL2 assurance.

Production packages are created only from an unrevoked approval.

## Deliberate deferrals

- No publication table or publishing command exists in M1.
- No storage bucket is created because M1 exports an immutable manifest; media
  automation is outside the approved milestone.
- No recommendation, engagement-personalization, journal, prayer, billing, or
  external-organization schema is included.
- AI provider execution belongs in the worker application; the database stores
  durable intent and attempt provenance only.
