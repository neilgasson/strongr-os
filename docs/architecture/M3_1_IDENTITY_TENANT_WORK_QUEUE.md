# M3.1 Identity, Tenant, and Work Queue

## Status

Implementation proposed under the owner-approved M3 scope. This stage does not
deploy a preview or implement the governed mutation workspaces planned for
M3.2 and M3.3.

## Delivered boundary

- Provisioned-operator email/password sign-in, local-browser sign-out, supported
  Supabase session restoration, refresh, and safe expiry handling.
- Supported TOTP enrollment, challenge, verification, factor visibility,
  assurance refresh, and explicitly confirmed factor removal.
- Current-profile, active-membership, and active-organization discovery through
  existing authenticated Data API grants and current row-level security.
- An explicit active-organization selector. Multiple organizations never produce
  an inferred default; a sole active organization may be selected automatically.
- Permission-aware usability guidance through the existing
  `public.has_permission(uuid, text)` function. Browser visibility is not
  authorization and governed database commands remain authoritative.
- Canonical, tenant-filtered queue reconstruction for briefs, generation jobs,
  immutable versions, incomplete reviews, packages, media jobs, exact private
  artifacts, staged releases, and approval/release revocations.
- Explicit loading, attention, empty, failed, expired, and revoked states.

## Existing database contracts consumed

M3.1 uses the existing authenticated `SELECT` grants and RLS policies on
`profiles`, `memberships`, and `organizations`. It filters the profile by the
authenticated Auth user ID, filters memberships to the same profile and
`active` status, and only accepts organization rows whose IDs are present in
those returned active memberships.

Capability hints call the existing authenticated `has_permission` function for
an organization already selected from that membership-derived set. Queue reads
continue through `StudioSupabaseGateway`, carry the selected organization ID on
every tenant-owned request, and parse every returned row against the same ID.

No migration, RLS policy, grant, role, permission, Storage policy, service-role
boundary, Auth project setting, or hosted data changed.

## Session and MFA behavior

- The Auth-only client remains PKCE, persistent-session, and auto-refresh
  configured with the publishable browser key.
- `onAuthStateChange` is registered before restoration; its callback only
  changes local state and does not perform asynchronous work.
- Sign-out uses local scope so the current browser session is cleared without
  unexpectedly terminating every device.
- A 401 from a canonical tenant read clears the local tenant, capability, queue,
  MFA, and session state and returns the operator to sign-in.
- TOTP challenge verification and factor removal immediately refresh the
  session before Studio displays the resulting assurance.
- TOTP setup material exists only while enrollment is in progress. Browser
  acceptance uses synthetic intercepted Auth fixtures and does not retain real
  credentials or factor material.

## Work-queue reconstruction

Queue loading uses bounded existing read methods and `Promise.allSettled` so an
ordinary failed lane is visible instead of being misreported as empty. A 401 is
different: it invalidates the entire local session because no stale tenant
result is safe to display.

Incomplete human review means a submitted, non-approved version whose latest
Scripture, theology, or editorial decision is not approved. Active packages
exclude packages bound to revoked approvals. Active staged releases exclude
staged bundle identities with a revocation. Job attention counts preserve
queued, running, failed, and dead-letter states.

## Evidence

The M3 application workflow retains failure-preserving artifacts and now proves:

- signed-out truthfulness and keyboard navigation;
- provisioned sign-in and local sign-out;
- two active tenant contexts with every canonical read carrying the selected
  organization ID;
- safe session expiry and return to sign-in;
- TOTP enrollment, challenge, AAL1-to-AAL2 step-up, assurance refresh, and
  confirmed unenrollment;
- canonical lane failure states;
- desktop and 360-pixel responsive operation; and
- automated WCAG 2.2 A/AA checks across sign-in, home, work queue, security,
  boundaries, and not-found routes.

## Explicitly unchanged

- No public sign-up, invitations, password administration, user administration,
  impersonation, direct browser table write, generic backend proxy, browser
  Storage listing/mutation, public media, publication, or production credential.
- No production, deployment, external provider, analytics, Strongr Daily
  source, Strongr Daily environment, domain, or secret change.
