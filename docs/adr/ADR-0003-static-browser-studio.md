# ADR-0003: Static Browser Strongr Studio

## Status

Accepted for M3.0 implementation by the repository owner's approval of
`docs/architecture/M3_SCOPE.md`. The implementation remains proposed until its
protected pull request is accepted and merged.

## Context

M0 through M2 provide accepted tenant reads, governed commands, durable workers,
private media retrieval, and database-enforced authority. M3 needs a usable
operator interface without moving any of those security decisions into an
application server or the browser.

The first delivery slice needs routing, an accessible shell, semantic design
tokens, Supabase Auth support, browser testing, and a reproducible static
artifact. It must not deploy a preview, introduce server credentials, weaken
RLS or grants, add a generic backend, or change Strongr Daily.

## Decision

Strongr Studio is a browser-only React single-page application built by Vite:

- React owns presentation and local interaction state.
- React Router owns browser routes; route visibility is never authorization.
- The Supabase Auth-only JavaScript package owns supported session and MFA
  protocol operations using PKCE, the isolated project URL, and a publishable
  key.
- The accepted `StudioSupabaseGateway` remains the browser data boundary for
  explicit tenant reads, narrow governed RPCs, and exact private-media
  retrieval. The full Supabase data and Storage clients are excluded from the
  runtime dependency graph.
- PostgreSQL remains canonical for identity linkage, membership, permissions,
  assurance, workflow state, exact immutable identity, review, approval,
  staging, and revocation.
- CSS semantic tokens and repository-owned components form the visual
  foundation. No remote script, font, stylesheet, or imported prototype is a
  runtime dependency.
- Playwright and axe-core provide Chromium, keyboard, responsive, routing, and
  automated WCAG 2.2 A/AA evidence.

The build emits `apps/studio/dist` as a host-agnostic static artifact. A host
must provide HTTPS, `/index.html` SPA fallback, the exact reviewed security
headers, explicit Auth redirect origins, and only the two allowlisted public
environment values. The provider and actual non-production deployment are
deliberately deferred to M3.4.

M3.0 adds a local meta CSP for defense during static preview. The deployment
contract separately requires an HTTP CSP containing `frame-ancestors 'none'`
and an exact `${PUBLIC_SUPABASE_ORIGIN}` substitution because those controls
cannot be completely expressed or safely parameterized by static HTML alone.

## Consequences

- Studio can be built, inspected, and tested without a server runtime or
  privileged credential.
- Auth protocol capability is present, but sign-in, session lifecycle, MFA, and
  organization selection are not represented as complete until M3.1.
- A static host must support history fallback and reviewed header
  configuration. Choosing or configuring that host requires the M3.4 preview
  review.
- Current `@supabase/auth-js` declarations conflict with TypeScript 7's
  `exactOptionalPropertyTypes` inside dependency WebAuthn declarations. The
  TypeScript configurations skip dependency declaration checking while
  retaining strict checking for repository source. Pinning and runtime/browser
  tests remain mandatory.
- Adding SSR, an application server, an Edge Function, the full Supabase client,
  a Storage mutation/listing client, analytics, or remote runtime assets
  requires a new architecture and threat review.

## Rollback

M3.0 has no database migration, deployment, environment mutation, Supabase
configuration change, or Strongr Daily change. Reverting its merge removes the
browser artifact source, dependencies, and CI workflow without a data rollback
or credential rotation.
