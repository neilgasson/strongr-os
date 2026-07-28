# M3.4 — Isolated preview and final M3 acceptance

Status: owner-approved implementation gate; implementation and deployment have
not started.

## Outcome

M3.4 may deliver one owner-accessible, isolated, non-production Strongr Studio
preview and the canonical evidence needed to accept M3. It does not authorize a
production deployment, publication, public media delivery, live providers, a
generic backend, or changes to Strongr Daily.

The preview must exercise the already-accepted M3.0–M3.3 browser artifact and
M0–M2 backend boundaries. Hosting convenience may not move authorization,
credentials, data mutation, or media trust into the host or browser.

## Entry gate

Implementation may begin only from protected `main` at M3.3 checkpoint
`f2a609db170d847a71cd760db3964fb70ce41c61` or a documented successor, with:

- PR #34 merged and all six pull-request checks green;
- protected-main M1 application, M1 acceptance, M2 acceptance, and M3
  application replays green;
- the main-protection ruleset still strict and without bypass actors;
- no current Strongr Daily change;
- the preview target confirmed as isolated `strongr-os-dev`, using synthetic
  fixtures only.

If any entry condition is false, stop before changing hosting or Supabase
configuration.

## Hosting decision gate

Select the smallest static host that can prove all of the following:

- HTTPS only;
- history fallback to `/index.html`;
- the exact headers in `apps/studio/preview-security.json`, including the
  parameterized Content Security Policy;
- repository-controlled immutable deployment input and a traceable commit;
- environment configuration containing only `PUBLIC_SUPABASE_URL` and
  `PUBLIC_SUPABASE_PUBLISHABLE_KEY`;
- an explicit owner-only or otherwise approved access boundary;
- fast rollback to a known prior artifact or complete preview removal;
- no required analytics, remote runtime script, server secret, SSR runtime,
  Edge Function, or generic backend proxy.

The provider, region, preview URL, access model, retention behavior, and rollback
procedure must be documented before the first deployment. A provider that
cannot enforce the reviewed HTTP headers or SPA fallback is ineligible.

## Supabase and credential gate

- Bind only to the isolated `strongr-os-dev` project.
- Add only the exact preview origin to the Supabase Auth redirect allowlist.
- Use the project URL and publishable key only.
- Never copy a secret key, legacy service-role key, database connection string,
  access token, refresh token, password, TOTP secret/code, or private media into
  host configuration, build logs, URLs, screenshots, or retained evidence.
- Do not change RLS, grants, Storage privacy, service-role boundaries, AAL
  enforcement, migrations, or accepted command contracts to accommodate the
  preview.

Credential and redirect configuration must be inspected after deployment and
again during cleanup or rollback.

## Acceptance sequence

1. Build the exact reviewed static artifact and record its source commit and
   file checksums.
2. Validate source and built bundles for forbidden credentials and browser
   boundaries.
3. Deploy that artifact with the reviewed header, HTTPS, fallback, environment,
   origin, and access configuration.
4. Verify the live response headers, redirect behavior, cache behavior, CSP,
   clickjacking defense, and absence of remote runtime scripts.
5. Run the complete primary workflow in a real browser:
   sign in → TOTP/AAL2 → active organization → brief → durable draft → evidence
   → human review → approval → immutable package → media request → exact private
   checksum-verified playback → media review → non-public staging → revocation.
6. Prove AAL1 denial, permission denial, cross-tenant denial, exact identity,
   stable idempotency, refresh/resume, session expiry, failure visibility,
   private-media cleanup, and no publication.
7. Run automated and manual accessibility evidence for keyboard, focus,
   semantics, screen-reader status, labels/errors, contrast, zoom, reduced
   motion, transcript access, and touch targets at approved desktop, tablet, and
   narrow viewports.
8. Run every existing M0–M3 regression gate and the required local and
   `strongr-os-dev` acceptance paths.
9. Clean synthetic fixtures, confirm cleanup, and preserve privacy-safe evidence
   even when a preceding step fails.
10. Produce `evidence/m3/acceptance-record.json`, bind it to the exact commit,
    preview, workflows, artifacts, checksums, dependencies, cleanup result, and
    owner review, then obtain explicit owner acceptance before merge or
    promotion.

## Evidence requirements

Retain:

- source commit, PR, workflow run, artifact, and dependency identifiers;
- static artifact and evidence-file SHA-256 manifests;
- safe live-header, origin, CSP, fallback, and access-control results;
- browser test summaries, accessibility results, safe console output, timing,
  denial, failure/resume, and cleanup evidence;
- the preview provider, region, URL classification, access model, environment
  classification, deployment identifier, and rollback result;
- an explicit statement that no production, public Storage, publication, live
  provider, service-role browser exposure, or Strongr Daily change occurred.

Do not retain passwords, tokens, TOTP material, private content, plaintext media,
secret values, or screenshots containing private media or sensitive operator
data.

## Stop conditions

Stop and require a separate protected decision if M3.4 would require:

- a new database object, migration, RLS/grant change, Storage-policy change, or
  browser mutation boundary;
- a server runtime, SSR, Edge Function, proxy, or privileged host secret;
- a public bucket, signed/public media URL, browser upload, publication, or
  distribution;
- production or Strongr Daily credentials, systems, data, domains, or users;
- live AI, voice, transcription, analytics, or other external provider;
- weakening CSP, security headers, MFA/AAL, tenant isolation, private media, or
  human authority;
- evidence that cannot be made privacy-safe.

## Rollback

Rollback must disable or remove the preview, remove its Auth redirect origin,
delete its two public environment values from the host, and confirm that no
server secret was ever present. Database records and private Storage are not
rolled back by the host. Synthetic acceptance fixtures follow the accepted
cleanup commands and evidence process.

M3 is not complete until the canonical M3 acceptance record and owner usability
review are explicitly accepted.
