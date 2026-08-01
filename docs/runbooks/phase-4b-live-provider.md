# Phase 4B live-provider runbook

This runbook enables one development provider behind the governed Studio flow.
It does not authorize a real call, deployment, credit purchase, or merge.

## Owner setup

1. In the OpenAI Platform project used for Strongr Studio development, create a
   project-scoped API key. Do not paste it into Studio, GitHub, a repository
   file, chat, screenshot, or terminal history.
2. In the server runtime's encrypted secret manager, add the key as
   `OPENAI_API_KEY`.
3. Keep the existing `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` values in the Edge runtime's encrypted server
   environment. Never create a public-prefixed copy.

Those are server settings only. The browser must receive only its existing
publishable Supabase configuration.

## Deployment configuration

- development project only: `strongr-os-dev`;
- production Strongr Daily: untouched;
- JWT verification: enabled (`verify_jwt = true`);
- allowed origin: exactly
  `https://strongr-studio-preview.meetwagon.chatgpt.site`;
- method: `POST` only (plus a non-mutating CORS preflight when required);
- media type: `application/json` only;
- accepted body: `{ "generation_job_id": "<uuid>" }` only;
- provider credential: server secret only;
- provider retry: disabled after any billable request begins;
- fixed provider/model: OpenAI `gpt-5.6-terra` inside this endpoint only;
- deterministic adapter: default outside this explicit endpoint.

Do not deploy until migration, pgTAP, unit, type, schema, browser, security, and
boundary checks are green and the owner has approved the pre-call estimate.

The function imports reviewed monorepo modules outside its own directory. Use
Supabase's API bundler so those exact source dependencies are included:

```powershell
supabase functions deploy strongr-daily-generate --use-api --project-ref fifrlyddmjkogmdvyjdp
```

After deployment, run only non-billable smoke tests first: reject an untrusted
origin, reject a missing bearer token, and verify the encrypted server
configuration is present without retrieving or displaying any secret. Do not
submit a queued generation job during this gate.

## Before a real call

1. Confirm the private preview is still owner-only and signed-in.
2. Confirm the selected brief uses the v2 Strongr Daily schema and contains no
   unauthorized full NIV quotation.
3. Confirm the job uses `strongr.strongr_daily.v2` version `1`.
4. Display the conservative estimate in dollars before the owner confirms.
5. Confirm it is at or below $0.10 and that no automatic retry is scheduled.
6. Preserve the pre-real-call acceptance record without a prompt, payload,
   credential, authorization header, or personal data.

## Expected result

The owner sees progress, then either a contract-valid unapproved draft or one
plain-language failure. Success stores one content version in `draft` state and
token/cost evidence on its one provider attempt. It records no human review,
approval, package, media, release, upload, narration, or publication.

## Recovery

- Authentication or origin failure: stop; fix the endpoint/session boundary.
- Invalid prompt, tenant, job, lease, or provenance: stop; do not call the
  provider and do not bypass the database command.
- Provider failure before a billable request: one operator retry is allowed only
  when evidence proves no request reached the provider.
- Provider failure after a request may have been billable: mark the job failed.
  The owner must intentionally request a new job to regenerate.
- Malformed or cross-brief output: reject it and keep the original brief. Do not
  persist or approve partial content.
- Cost estimate above $0.10 or recorded cost above $0.10: stop and investigate;
  never raise the limit without explicit owner approval.

## Disable and clean up

Set the server provider selection back to `deterministic`, disable the endpoint,
and remove or rotate the project-scoped provider key. Confirm browser bundles
and acceptance evidence contain no credential. Do not remove the accepted
legacy completion function until a separate migration and acceptance are
authorized.
