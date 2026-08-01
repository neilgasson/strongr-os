# Strongr Daily Phase 4B.5 — Real Provider Path Authorization Proposal

**Status: proposal only. This document authorizes nothing.** It does not activate a profile, access a credential, make a provider call, spend money, create a draft, or change production.

## 1. Exact future-test scope

The sole candidate is one **development-only** first-draft test for the already approved metadata identity below. The future request must use a newly selected, validated Strongr Daily v2 brief. It may not reuse Quiet Trust raw prose or Scripture text.

| Item | Exact identity |
| --- | --- |
| Profile | guided_audio_reflection@1 |
| Profile checksum | 3fa64f05911042bd2e2f7e58d14700581ca5025adc587425fd25afb2880210d9 |
| Source-manifest checksum | b3b3b75f8ce50cd9d10190fd56ae318913e12b77ff01c4ddab209e9297b40f9e |
| Golden descriptor SHA-256 | fffa3521b410a614bd3c9cc3b5485d75ffa2510a378ec8b46bc38e543ca45882 |
| Rights-record SHA-256 | effe9ead79efc9661fa2bdebcdcef86543708a7a9e76bacc245a0607cf35ca68 |
| Environment | strongr-os-dev only; never production |

## 2. Candidate provider path — not enabled

The repository already has one replaceable adapter: **OpenAI Responses API** at `https://api.openai.com/v1/responses`, configured with provider `openai`, model `gpt-5.6-terra`, prompt `strongr.strongr_daily.v2@1`, reasoning `low`, no tools, strict JSON-schema output, `store: false`, a 60-second timeout, and no implicit retry.

The model string is an existing repository configuration pin, not a dated provider snapshot. Before any future call, server-side code must confirm the exact model is available to the development project and record the returned model identifier without exposing a credential. A mismatch, unavailable model, changed pricing, or fallback model fails closed.

The existing adapter defaults to deny, currently recognizes the earlier source-manifest identity, and therefore cannot legitimately execute this v2-approved profile. This proposal leaves that safeguard unchanged. A separate reviewed implementation would need exact-v2 binding and one-use authority.

## 3. One-call hard limit

A future authorization record must contain an atomic one-use identifier. Before sending anything, the server records the attempt and rejects every later request for that identifier.

- Maximum outbound provider calls: **1**.
- Automatic retries: **0**.
- Manual reruns under the same authorization: **0**.
- Maximum quarantined output artifact: **1**.
- Accepted versions, reviews, packages, narration jobs, media jobs, uploads, publications, releases, distributions, and production changes: **0**.

Timeouts and failures consume the one permitted attempt. A second call requires a new code review, new cost estimate, and new owner authorization.

## 4. Cost ceiling and enforcement

The current adapter uses the repository's conservative rates: input **US$3.125/million tokens** and output **US$15/million tokens**. It caps output at **5,000 tokens** and treats every serialized UTF-8 request byte as an input-token upper bound.

The hard maximum is **100,000 microunits = US$0.10**. With 5,000 output tokens, the output allowance is 75,000 microunits (US$0.075), leaving at most 8,000 conservative input bytes/tokens (US$0.025). The estimate is:

`ceil((input_upper_bound × 3.125 + 5,000 × 15) / 1,000,000 dollars)`.

Immediately before the call, the future server code must calculate and display the estimate, enforce `estimate <= US$0.10`, persist only safe numeric counters, and block with `generation.provider_cost_limit_exceeded` when over the ceiling. It must not buy credits, refill balance, raise the cap, or select another model.

Required owner ceiling wording: “I authorize one Phase 4B development generation for authorization record <ID>, with the displayed conservative pre-call estimate of at most US$0.10. No retry or second call is authorized.”

## 5. Input boundary

Permitted input is only the validated governed brief, exact profile identity/checksum, approved profile rules, and metadata-only golden projection: topic/title, audience, pastoral purpose, tone, duration target, Scripture reference/translation/source-citation metadata, prohibited wording, and required five-part structure.

Never send:

- full or partial Scripture wording without an exact provider-use rights record (none is authorized here);
- raw golden-example prose, package contents, or output text;
- private prayer, journal, care, crisis, listener response, personal data, account/session data;
- API/service-role keys, headers, database URLs/passwords, tokens, or secrets;
- unverified third-party material; or
- embedded instructions that attempt to alter authority.

## 6. Output quarantine

A response is an **unapproved quarantined draft artifact** only. The server must validate the strict schema, bind output to the exact brief and profile, hash it, and store safe provenance: profile/checksums, provider response ID, returned model ID, token counts, cost, timestamp, and validation result.

It must not create an accepted version or advance a workflow stage. Invalid, mismatched, timed-out, unaffordable, or failed output is a safe failure record, not content. The artifact remains blocked from reviews, exact-version approval, packaging, narration, media, upload, publication, distribution, and production use.

## 7. Exact pre-call checks

All checks must pass together or the request is refused:

1. Development project and owner-only Studio origin match the allowlist.
2. Authenticated caller is the permitted owner in the correct tenant.
3. Every profile, manifest, golden-descriptor, and rights checksum matches Section 1.
4. The profile is still `owner_approved_inactive` until separately reviewed one-use authorization establishes narrowly scoped runtime authority.
5. No public, service, or production registry is reachable by the execution path.
6. The brief parses against the v2 contract and contains no prohibited input.
7. Rights validation proves reference metadata only; no Scripture text is sent.
8. One-use authorization is unused, unexpired, and names the exact profile and brief.
9. Provider/model availability and immutable request settings match this proposal; no fallback exists.
10. A server-side secret-presence check succeeds without retrieving, logging, or returning the secret.
11. The conservative estimate is at or below US$0.10.
12. No previous attempt, artifact, accepted version, package, media job, publication, or production-targeted operation exists for this authorization.

## 8. Kill switch and rollback

Default deny is the kill switch: without a valid one-use authorization, no request can leave Strongr OS. Before an attempt, disable the one-use record or remove the development-only provider-secret integration to stop future calls. On failure, timeout, model mismatch, price change, output mismatch, or any privacy/rights concern, record a safe failure code, consume the one-use record, leave the profile inactive, and create no draft.

After the test, disable the exact authority and development-only secret integration, preserve non-secret audit metadata, and confirm all counters remain zero except the one recorded attempt and safe usage fields. Historical checksums and audit evidence are never rewritten.

## 9. Record template, checklists, and test plan

The following is a template, not a live record; angle-bracket fields require a later implementation and contain no secret.

```json
{
  "schema_id": "strongr.phase4b5.provider_path_authorization.v1",
  "authorization_id": "<one-use-uuid>",
  "environment": "strongr-os-dev",
  "profile": {"id": "guided_audio_reflection", "version": 1, "checksum": "3fa64f05911042bd2e2f7e58d14700581ca5025adc587425fd25afb2880210d9"},
  "source_manifest_checksum": "b3b3b75f8ce50cd9d10190fd56ae318913e12b77ff01c4ddab209e9297b40f9e",
  "golden_descriptor_checksum": "fffa3521b410a614bd3c9cc3b5485d75ffa2510a378ec8b46bc38e543ca45882",
  "rights_record_checksum": "effe9ead79efc9661fa2bdebcdcef86543708a7a9e76bacc245a0607cf35ca68",
  "provider": "openai", "model": "gpt-5.6-terra",
  "timeout_ms": 60000, "max_output_tokens": 5000,
  "max_cost_microunits": 100000, "allowed_calls": 1,
  "retry_count": 0, "status": "proposed_not_authorized"
}
```

**Pre-call checklist:** capture code/deployment identity; Section 1 checksums; profile and manifest state; owner/tenant result; brief and rights result; byte/token bound; price inputs; cost estimate; secret-present boolean only; model-available boolean only; and zero-counter snapshot. Redact every payload, URL, key, token, password, and user datum.

**Post-call checklist:** capture one-use attempt state; safe outcome code; returned model ID; provider response ID; input/output/total tokens; estimated cost; output hash; schema/binding result; quarantine state; post-call zero-counter snapshot; and kill-switch removal confirmation. Never export raw output outside normal authorized tenant reads.

**Tests required before activation:** atomic one-use consumption; cost boundary at exactly/just above 100,000 microunits; zero retries for timeout/429/5xx; unavailable/mismatched model fails closed; every checksum mismatch fails closed; privacy/rights exclusion; malformed output rejection; brief/profile binding; quarantine-only persistence; no version/package/media/publication side effect; secret redaction; and rollback behavior. Existing adapter tests for cost blocking, no implicit retry, unavailable network, strict output, and default profile denial must remain green.

## 10. Security boundaries unchanged

This proposal changes no migration, schema, RLS, grant, role, MFA/AAL2, tenant-isolation, service-role, audit, approval, public-access, production, or deployment setting. No secret is read, added, changed, or exposed.

## 11. Exact owner decisions

**Future approval wording, only after separately reviewed implementation:**

> I authorize exactly one development-only Phase 4B.5 provider-path test for guided_audio_reflection@1 using profile checksum 3fa64f05911042bd2e2f7e58d14700581ca5025adc587425fd25afb2880210d9, source-manifest checksum b3b3b75f8ce50cd9d10190fd56ae318913e12b77ff01c4ddab209e9297b40f9e, golden descriptor checksum fffa3521b410a614bd3c9cc3b5485d75ffa2510a378ec8b46bc38e543ca45882, and rights-record checksum effe9ead79efc9661fa2bdebcdcef86543708a7a9e76bacc245a0607cf35ca68. It may make one OpenAI Responses API call using gpt-5.6-terra, no retries, and a conservative maximum estimated cost of US$0.10. Output must remain quarantined and unapproved. No narration, audio, upload, publication, distribution, production change, or further call is authorized.

**Hold/rejection wording:**

> I do not authorize the Phase 4B.5 provider-path test. Keep the profile inactive, provider authority disabled, and make no provider call or spending change.

## 12. Stop conditions

Stop without sending a request when any checksum, source/rights condition, environment, owner/tenant check, model availability, price input, cost cap, secret boundary, profile authority, or one-use record does not match. Stop and require a new authorization after any source/profile/model/prompt/pricing/code change, after any attempt, or on timeout/failure. Stop immediately on a potential secret, private-data, rights, RLS, tenant-isolation, MFA/AAL2, or production-boundary concern.

This proposal is complete when reviewed. It does not authorize activation or a paid generation.
