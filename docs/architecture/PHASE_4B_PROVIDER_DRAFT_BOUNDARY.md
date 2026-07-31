# Phase 4B provider draft boundary

Status: implementation candidate; no real provider call or deployment is
authorized by this document.

## Decision

Phase 4B uses one replaceable generation adapter backed by the OpenAI Responses
API and the fixed `gpt-5.6-terra` model. The approved prompt contract is
`strongr.strongr_daily.v2` version `1`. The deterministic adapter remains the
default everywhere except an explicitly configured server runtime.

The provider can produce an unapproved, immutable draft candidate only. It has
no database command capable of recording Scripture, theological, safety, or
editorial decisions; approving an exact version; creating a production
package; publishing; staging a release; or creating media.

## Request path

1. An authenticated owner creates or opens a tenant-scoped Strongr Daily v2
   brief in Studio.
2. Studio creates a governed generation job using the fixed prompt key and
   version.
3. Studio calls the development-only generation endpoint with a JSON body
   containing only `generation_job_id`.
4. The endpoint validates the owner session and exact owner-preview origin.
5. Its server runtime uses the service role only to claim that exact job.
6. PostgreSQL rejects a different prompt contract, an already attempted job,
   another job, or a job that is not pending. Claiming sets `max_attempts` to
   one.
7. The adapter validates the brief, sends one provider request, validates the
   structured response, and recomputes its content hash.
8. PostgreSQL atomically creates the AI-assisted draft and stores provider
   response identity, latency, token usage, and cost.
9. Studio reloads canonical tenant state. Every later check, human review,
   AAL2 approval, package, and download step remains unchanged.

The endpoint must use `verify_jwt = true`, accept only `POST` with
`Content-Type: application/json`, and allow the exact preview origin
`https://strongr-studio-preview.meetwagon.chatgpt.site`. Wildcard origins are
not permitted. Its request body must contain only the generation job UUID; no
brief, prompt, content, credential, or tenant claim is trusted from the
browser.

## Authority boundary

- Browser: may request generation through its existing authenticated owner
  session; never receives a provider or service-role credential.
- Endpoint: may validate the request and run one exact job; it cannot approve,
  review, package, publish, release, or create media.
- Provider adapter: may return contract-valid draft content and usage metadata
  only.
- Database: remains authoritative for tenant binding, leases, one-attempt
  enforcement, draft persistence, audit evidence, review gates, AAL2, approval,
  and package creation.
- Human: remains the sole authority for all three review lanes and exact-version
  approval.

The new service-only commands are:

- `m1_claim_generation_event_by_job(uuid,text,integer)`
- `m1_complete_generation_attempt_with_usage(uuid,text,uuid,uuid,text,text,jsonb,text,integer,integer,integer,bigint)`

Both revoke `PUBLIC`, `anon`, and `authenticated` execution and grant only
`service_role`. Direct service-role DML on the governed generation tables stays
revoked. The previously accepted deterministic batch claim and completion
commands remain in place until a separately authorized replacement acceptance
proves they can be retired.

## Cost boundary

The adapter computes a deliberately conservative pre-call cost estimate and
refuses a request whose worst case exceeds 100,000 US-dollar microunits
($0.10). Every input token is conservatively priced at Terra's highest input
rate, including the 1.25x cache-write rate, even when the provider reports less
expensive uncached or cached-read input. PostgreSQL independently rejects
completion evidence above the same limit. No code purchases credits, enables
billing, or configures automatic refill. OpenAI API usage is a new paid
dependency billed separately from a ChatGPT subscription; Supabase and the
existing private preview remain the only other runtime dependencies.

## Preserved controls

This change does not alter schemas for content or approval, RLS policies,
tenant isolation, membership permissions, grants for human commands, AAL2
requirements, immutable versions, audit trails, media controls, production
Strongr Daily, or public access.
