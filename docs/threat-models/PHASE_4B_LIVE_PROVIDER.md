# Phase 4B live-provider threat model

Scope: one development-only OpenAI draft-generation path behind the existing
Strongr Daily adapter and content contract.

## Assets

- owner authentication and AAL2 assurance;
- tenant-scoped briefs, generation jobs, drafts, and audit evidence;
- server-side OpenAI and Supabase privileged credentials;
- provider request/response content and usage/cost provenance;
- human review and exact-version approval authority.

## Trust boundaries and controls

| Threat | Required control | Evidence |
| --- | --- | --- |
| Provider key reaches a browser, bundle, log, or artifact | Key exists only in the server secret store; browser source, built bundles, and evidence are statically scanned for provider credential names and key-like values | environment and browser-boundary checks |
| A user submits another tenant's job | JWT verification, exact owner-preview origin, ID-only request, database membership/RLS checks, and exact job/tenant joins | endpoint tests plus pgTAP tenant test |
| Worker consumes unrelated queued work | Exact-job claim takes one UUID and never performs a batch claim | pgTAP exact-job test |
| Unreviewed prompt invokes the paid provider | Database claim and adapter both require `strongr.strongr_daily.v2` version `1` before any provider request | pgTAP prompt-rejection test and adapter tests |
| Automatic retries cause duplicate charges | Exact claim accepts only pending jobs with zero attempts and atomically sets `max_attempts = 1`; failure becomes terminal; regeneration creates a new owner-requested job | pgTAP one-attempt and failure tests |
| Cost exceeds the approved boundary | Adapter prices every input token at Terra's highest cache-write rate, rejects a conservative pre-call estimate above $0.10, and the completion RPC rejects recorded cost above $0.10 | adapter and pgTAP cost tests |
| Edge runtime lacks Node globals after a billable response | Shared hashing imports its Node-compatible buffer implementation explicitly and is tested with no global `Buffer` | adapter runtime regression test |
| Malformed or cross-brief output is persisted | Structured output schema, content-contract validation, brief binding, and server-recomputed hash run before atomic completion | adapter tests and accepted completion command |
| Service role approves or publishes | New RPCs are service-only but narrow; direct table DML and approval execution stay revoked | migration verification and pgTAP ACL tests |
| Provider result silently changes immutable content | Completion creates one AI-assisted draft, exact replay returns the same version, and changed provenance is rejected | pgTAP replay tests |
| Failure leaks a prompt, content, authorization header, or secret | Public errors use stable codes; durable evidence stores identifiers, status, usage, and cost only | runtime tests and evidence review |
| CORS or endpoint configuration broadens access | `verify_jwt = true`, exact preview origin, POST-only, JSON-only, ID-only body; no wildcard CORS | deployment acceptance checklist |

## Residual risks and stop conditions

- A provider outage or timeout may leave a job terminally failed. The owner may
  intentionally request regeneration as a new job; the runtime must not retry
  the paid request automatically.
- A real provider response may be low quality despite schema validity. It stays
  a draft and cannot advance without automated checks and three human reviews.
- Billing must already be enabled by the owner. The implementation must stop
  before any purchase, billing change, or automatic refill.
- Any failed JWT, origin, tenant, prompt, cost, output, hash, lease, or
  provenance check must stop the request without weakening another boundary.

## Explicit exclusions

No audio generation, upload, public account, public preview, production Strongr
Daily mutation, automatic publication, provider switcher, analytics dashboard,
new review authority, or migration/RLS/grant broadening is included.
