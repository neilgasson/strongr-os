# M3.0 Browser and Design Foundation

## Status

Implementation proposed under the owner-approved M3 scope. This stage does not
deploy a preview and does not implement the M3.1 identity or tenant workflow.

## Delivered boundary

- A static React and Vite browser artifact with Home, Work queue, Boundaries,
  and safe not-found routes.
- A responsive, keyboard-operable application shell with a skip link, semantic
  landmarks, explicit empty states, reduced-motion behavior, and repository-
  owned semantic design tokens.
- An error boundary that never assumes a governed action succeeded and records
  no sensitive browser error details.
- An Auth-only Supabase client factory configured for PKCE, refresh, supported
  MFA APIs, and the publishable browser key.
- An exact two-name `PUBLIC_` environment allowlist.
- A checked preview contract for HTTPS-hosted SPA fallback, restrictive HTTP
  headers, self-hosted runtime assets, allowlisted Auth redirects, and synthetic
  non-production data.
- Source and built-bundle checks for privileged credentials, worker imports,
  browser table mutation, Storage mutation/listing/public URL capabilities,
  remote scripts, unsafe CSP, and unreviewed dependencies.

The shell labels itself honestly. It is not signed in, has no selected
organization, exposes no governed action, and names M3.1 as the next functional
slice.

## Dependency decision

All packages are exact-version pinned and lockfile recorded. The runtime set is
limited to React, React DOM, React Router, and `@supabase/auth-js`. Studio does
not depend on the full Supabase client, PostgREST client, or Storage client.

The repository retains Node.js 22.18 or later and pnpm 11.9. Vite's current
runtime requirement and Supabase Auth's Node 22 requirement are satisfied.

## Security and hosting contract

`apps/studio/preview-security.json` is a reviewable contract, not evidence of a
deployment. M3.4 must select a non-production host and prove that its actual
responses:

1. serve only the exact static artifact over HTTPS;
2. fall back browser routes to `/index.html`;
3. replace `${PUBLIC_SUPABASE_ORIGIN}` with the one isolated project origin;
4. emit every required HTTP header;
5. allow only reviewed Auth redirects;
6. inject only the isolated project URL and publishable key; and
7. contain synthetic data and no Strongr Daily or production connection.

`frame-ancestors` is intentionally required at the HTTP layer. `Cache-Control:
no-store` is the conservative M3 preview default and can only be refined through
a separately reviewed asset-caching contract that never caches authenticated
API or private-media responses.

## Evidence

The M3 application workflow:

- prepares its artifact directory before dependency or browser installation;
- validates shell syntax;
- runs formatting, lint, strict repository type checks, unit tests, build,
  source/bundle boundaries, the preview contract, Chromium navigation,
  keyboard behavior, narrow viewport overflow, and automated axe checks;
- writes JSON, JSONL, console, accessibility, trace, screenshot, video, and
  per-check logs where applicable; and
- finalizes checksums and uploads the evidence with `if: always()`.

The workflow is additive and is not proposed as a protected required check
until stable green proof exists on `main`, as required by the M3 scope.

## Explicitly unchanged

- No Supabase migration, RLS policy, database grant, Storage policy, Auth
  project setting, or hosted project data changes.
- No production, publication, public Storage, browser upload, live provider,
  analytics, or external runtime asset.
- No Strongr Daily source, environment, data, deployment, domain, or secret.
