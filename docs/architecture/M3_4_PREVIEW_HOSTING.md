# M3.4 owner-only preview hosting decision

Status: deployed owner-only and accepted.

## Decision

Strongr Studio uses OpenAI Sites as the isolated static preview host. Sites was
selected because it accepts a repository-traceable worker artifact, provides
HTTPS, supports an owner-only access policy, retains saved versions for
rollback, and can serve the reviewed static application without a Strongr OS
application server, proxy, Edge Function, analytics script, or privileged
secret.

The Sites project is `Strongr Studio Preview`. Its checked-in opaque project
identifier is limited to `.openai/hosting.json`. The provider assigns the exact
HTTPS URL only when a saved version is deployed. The exact owner-only preview
URL is:

`https://strongr-studio-preview.meetwagon.chatgpt.site/`

It is recorded in `evidence/m3/preview-deployment.json` before hosted
application acceptance begins. This provider-assigned URL is classified as a
non-production preview even though Sites calls every deployed version a
production deployment.

## Region and data boundary

Sites uses its provider-managed global edge and does not expose a selectable
regional placement for this static deployment. The hosted artifact contains
only public static files and a worker that returns two public browser
configuration values. Canonical application data remains in the isolated
`strongr-os-dev` Supabase project in `ca-central-1`. No private media, operator
credential, token, TOTP material, or server secret is stored by the host.

## Access and retention

- Access mode: custom owner-only allowlist.
- Allowed viewers: the repository owner only.
- Allowed groups: none.
- Public access: disabled.
- Runtime configuration: exactly `PUBLIC_SUPABASE_URL` and
  `PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Static and runtime responses: `Cache-Control: no-store`.
- Saved versions: retained by Sites to support explicit rollback. M3 evidence
  retains identifiers and checksums, not credentials or private content.

The access policy must be re-read immediately before every deployment. If the
owner is not the sole allowed user, or any group is allowed, the deployment
must stop.

## Artifact and request handling

`pnpm studio:preview:build` creates the Sites artifact from the accepted Vite
bundle:

- `dist/client/**` contains the static Strongr Studio application;
- `dist/server/index.js` is a dependency-free Cloudflare Worker-compatible
  fetch handler;
- `dist/.openai/hosting.json` binds the artifact to the persisted Sites
  project;
- a SHA-256 manifest is written to failure-preserving M3 evidence.

The worker:

- redirects HTTP requests to HTTPS;
- accepts only `GET` and `HEAD`;
- serves the exact reviewed security headers on every response;
- falls back to `/index.html` only for browser navigation;
- exposes the two public values at same-origin `/runtime-config.json`;
- rejects any Supabase origin other than the pinned `strongr-os-dev` origin;
- rejects non-publishable API keys;
- provides no application API, write path, proxy, SSR, or server secret.

## Supabase Auth origin

After the first private deployment reveals the exact URL, only that exact
origin may be added to the `strongr-os-dev` Auth redirect allowlist. Wildcards
are forbidden. The allowlist must be inspected again before final acceptance
and after rollback.

## Rollback

Rollback is one of:

1. deploy the immediately preceding known-good saved Sites version; or
2. disable/remove the preview, remove the exact Auth redirect origin, and
   remove both public runtime values.

Rollback does not change database records or private Storage. Synthetic
acceptance fixtures use the existing accepted cleanup commands. No service-role
or secret value is introduced, so there is no host secret to rotate.

## Accepted deployment

The repository owner explicitly approved the authenticated live preview after
deployment. The canonical result, deployment provenance, verification sources,
security statement, workflow runs, and artifact identifiers are recorded in
[`evidence/m3/acceptance-record.json`](../../evidence/m3/acceptance-record.json).

The preview remains an owner-only non-production environment. Acceptance does
not promote it to production, authorize publication, or widen any browser,
database, Storage, service-role, MFA, tenant, or human-governance boundary.
