# ADR-0001 — Modular Monolith and Governed Platform Kernel

**Status:** Accepted  
**Date:** July 24, 2026  
**Owner:** Neil Gasson / Strongr Society

## Context

Strongr Society is developing Strongr OS as the shared platform for Strongr Studio, Strongr Daily 2.0, and future products.

The architecture must support secure content governance, AI-assisted workflows, durable background work, organization isolation, auditability, recovery, and future expansion without introducing unnecessary operational complexity.

A pre-implementation engineering audit concluded that the strategic direction is sound but that the current M1 migration and prototype implementation should not become the production foundation unchanged.

## Decision

Strongr OS will begin as a well-modularized monolith with durable asynchronous workers.

A new milestone, **M0 — Governed Platform Kernel**, is inserted before further M1 implementation.

M0 must establish:

- GitHub source authority
- protected implementation workflow
- tenant-safe relational foundations
- server-controlled governed writes
- immutable content versions
- immutable approval evidence
- transactional workflow operations
- real database and tenant-isolation tests
- privileged-account MFA
- observability
- backup and restore evidence

The current Strongr Daily app remains isolated and unchanged.

The existing Strongr Studio and M1 checkpoints remain prototypes and references only.

## Alternatives considered

### Continue extending the prototype

Rejected because prototype persistence, authorization, workflow integrity, dependency state, and testing are not sufficient for production.

### Begin with microservices

Rejected because Strongr Society does not yet have independently scaled teams or workloads that justify distributed transactions, service-level identity, and increased operational overhead.

### Rely mainly on Row Level Security

Rejected because RLS restricts row access but cannot alone enforce workflow sequence, evidence integrity, version hashing, export correctness, or relational tenant consistency.

## Consequences

Positive:

- Strong transactional integrity
- Lower operational burden
- Easier recovery and debugging
- Clear future extraction points
- Safer tenant and approval boundaries

Trade-offs:

- More foundational work before visible M1 features
- Strong discipline required around module boundaries and governed writes
- M0 must be completed before feature expansion

## Future service extraction rule

A module may be extracted only when evidence demonstrates a distinct security boundary, runtime requirement, scaling profile, failure domain, release cadence, or independently owned engineering team.
