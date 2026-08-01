# Strongr Daily Content Profile Library v1 design and approval gate

**Status:** Phase 4B.1 foundation implemented; profiles unapproved and inactive

**Source manifest:**
`docs/business/STRONGR_DAILY_CONTENT_PROFILE_SOURCE_MANIFEST.v1.json`

**Narrative source inventory:**
`docs/business/STRONGR_DAILY_CONTENT_FORMAT_SOURCE_INVENTORY.v1.json`

**Provider calls authorized by this document:** None

## Purpose

Strongr Daily does not use one universal reflection or audio-script format. The
Content Profile Library will preserve each approved format as a separately
versioned, source-cited profile. A generation brief must select the exact active
profile and version before a provider request can be made. The provider must
not infer a format from a title, theme, Scripture reference, or another free-text
field.

This document records the governance container and approval process implemented
by Phase 4B.1. The foundation adds exact profile provenance and explicit Studio
selection, but it does not fill missing creative rules, activate a profile,
authorize a paid call, or change review, approval, media, or publication
authority.

## Source authority

Profile content may come only from:

1. a checked-in approved Strongr Daily source with its exact path and version;
2. an owner-supplied source that is preserved, identified, rights-reviewed, and
   explicitly approved for profile use; or
3. an approved example whose exact identity, version, rights, and owner approval
   are recorded.

Synthetic fixtures, test prompts, generated placeholders, generic summaries,
and a model's assumptions have no creative authority. The current deterministic
fixtures may prove schemas and workflow behavior only. The current generic
Phase 4B audio-reflection prompt is an implementation candidate, not an
approved profile.

If sources disagree or do not answer a profile question, that field remains
`unresolved`. The library must not resolve it by averaging examples, copying a
different format, or creating a generalized master sequence.

## Profile identity and immutability

Every profile will have:

- `profile_id`: a stable semantic identifier;
- `profile_version`: a positive immutable version;
- `display_name`: the owner-approved Strongr Daily term;
- `content_type`: the governed content type;
- `format_variant`: the exact distinction within that type, when one exists;
- `lifecycle`: one lifecycle state defined below;
- `activation_status`: `inactive` until a later, separately authorized change;
- `source_manifest_version`: the exact source inventory used;
- `source_ids`: exact entries in the checksum-bound source manifest;
- `approved_source_example_ids`: exact approved examples, never synthetic
  fixtures;
- source-manifest entries with rights status and immutable provenance;
- `rules`: source-cited format rules; and
- `unresolved_decisions`: owner decisions still required; and
- `canonical_checksum`: the deterministic immutable identity of the profile.

An approved profile version is immutable. A rule or source change creates a new
version. Superseding a profile does not rewrite a prior brief, provider request,
draft, review, approval, or package.

## Profile lifecycle

| State | Meaning | Provider use |
|---|---|---|
| `inventory_only` | The format is named, but its source-backed rules have not been drafted. | Forbidden |
| `source_required` | Required approved sources or examples are missing. | Forbidden |
| `draft_unapproved` | A source-cited profile draft exists and unresolved fields are explicit. | Forbidden |
| `owner_review` | The complete profile draft is awaiting exact owner approval. | Forbidden |
| `owner_approved_inactive` | The owner approved the profile, but runtime binding and acceptance are incomplete. | Forbidden |
| `active` | Exact owner approval, runtime binding, tests, and acceptance are complete. | Allowed only for an exact profile/version match |
| `superseded` | A newer approved version replaced this version for new briefs. Existing evidence remains valid. | Forbidden for new briefs |
| `retired` | The profile is intentionally unavailable while its history remains auditable. | Forbidden |

No current profile is `active` under this design record.

## Profile rule sections

Each profile must explicitly record the following sections. A section may be
`not_applicable` only with a cited source or an explicit owner decision. Missing
source material is `unresolved`, not `not_applicable`.

1. Purpose and audience.
2. Expected duration and length.
3. Required and optional sections.
4. Introduction and welcome style.
5. Scripture placement, translation, quotation, citation, and rights handling.
6. Reflection or teaching depth.
7. Study questions and learning structure.
8. Prayer style and expected length.
9. Personal takeaway and journal prompts.
10. Closing language.
11. Narration and ElevenLabs-ready formatting.
12. Series continuity, ordering, and progression.
13. Title, description, artwork, social, keyword, app metadata, and release
    metadata.
14. Theological and editorial boundaries.
15. Prohibited language and framing.
16. Approved source examples.

Every populated rule must cite at least one source reference. Every approved
example must identify whether it is authoritative for structure, voice, length,
metadata, or another exact dimension. Mere inclusion does not make one example
authoritative for every dimension.

## Rights and provenance

Each source or approved example must record:

- title or stable identifier;
- source owner and origin;
- exact version, date, or hash when available;
- repository path or controlled external reference;
- permitted profile uses;
- Scripture translation and quotation status;
- copyright or license status;
- whether full text may be stored or sent to a provider;
- owner approval record; and
- any expiry, replacement, or revocation condition.

Psalm references and intended translations may be stored in a brief. Full
copyrighted Scripture text, including NIV text, must not be embedded or sent to
a provider unless the rights record expressly permits it. Scripture evidence
and rights review remain separate human-governed steps.

Private user journal entries, prayer requests, care information, and similar
sensitive text are not profile examples and remain excluded from general AI by
default. A future generated journal-prompt or guided-prayer format must clearly
distinguish public editorial content from private user data before approval.

## Exact brief and provider binding

Before a future provider call, the governed brief must bind:

- exact `profile_id`;
- exact `profile_version`;
- exact source-manifest version;
- exact prompt key and version derived for that profile;
- content type and format variant matching the profile;
- profile checksum or equivalent immutable identity; and
- the existing tenant, brief, job, cost, and idempotency identities.

The runtime must fail closed if the profile is absent, inactive, superseded for
new work, mismatched, or unresolved. Page load, refresh, title changes, and
implicit retry must never select or trigger a profile. Regeneration remains an
intentional, separately billable owner action.

Profile selection grants draft authority only. It cannot record a human review,
approve a version, create a package, create media, upload, publish, or change the
current Strongr Daily application.

## Current inventory disposition

### Source-backed contract references

- **Legacy audio reflection v1:** field contract exists. It remains a legacy
  reference and is not an approved Strongr Daily creative profile.
- **Strongr Daily audio reflection v2:** brief and output field contracts exist,
  along with the Quiet Trust checkpoint identity. Creative format rules and the
  approved Quiet Trust prose are not preserved in the repository, so this
  profile remains inactive.

### Taxonomy-only repository formats

The locked economic plan names `guided audio reflections`, `devotional
experiences`, and a `Scripture-reading series`. It also requires prayers,
personal-takeaway prompts, app descriptions, artwork prompts, social captions,
metadata, and a release schedule. These names are preserved exactly, but the
plan does not define their creative rules.

### Owner-asserted formats with prior sources not yet ingested

- short-form reflection;
- long-form reflection;
- Bible study;
- guided prayer;
- journal and personal-takeaway prompts; and
- series descriptions.

These entries remain `source_required`. They must not inherit the audio
reflection v2 section order or defaults.

## Unresolved owner decisions

Before drafting profiles for approval, obtain or identify:

1. the prior approved documents, handoffs, examples, scripts, series plans, and
   style guidance for each owner-asserted format;
2. the approved Quiet Trust content/export if it is intended as a source
   example, plus the dimensions for which it is authoritative;
3. the exact relationship between `audio reflection`, `guided audio
   reflection`, `short-form reflection`, and `long-form reflection`;
4. whether prayer and personal-takeaway prompts are embedded fields, standalone
   formats, supporting assets, or more than one of these;
5. the public-editorial versus private-user-data boundary for prayer and journal
   experiences;
6. the exact supported Bible-study and Scripture-reading-series variants;
7. approved narration, ElevenLabs, pronunciation, pause, and music-direction
   conventions;
8. series continuity, description, ordering, and release-schedule rules; and
9. the rights and provider-use status of every approved example and Scripture
   source.

## Approval and activation gate

A profile may move to `owner_approved_inactive` only when:

- every applicable rule section is source-cited and complete;
- every unresolved decision is resolved or explicitly deferred as
  not-applicable by the owner;
- source provenance and rights are recorded;
- approved examples are clearly distinguished from test fixtures;
- the owner approves the exact profile version; and
- the approval record states which profile dimensions were approved.

It may move to `active` only after a separate implementation change binds exact
profile selection through the brief, job, prompt, provider, tests, and acceptance
evidence without weakening existing governance.

Until both gates pass, the existing Phase 4B function must not make a paid
provider request. The previous authorization request is superseded by this
profile-library gate; a new exact cost authorization is required only after the
selected profile is active and the pre-call estimate is displayed.

## Explicit effects and non-effects

This foundation:

- adds an inactive, versioned profile library and private database registry;
- adds nullable, immutable profile provenance to briefs, jobs, versions, and
  packages while preserving legacy reads and exports;
- adds explicit review-only format selection and blocked-action guidance in
  Studio; and
- makes the provider, Edge Function, job claim, completion, and export paths
  fail closed on missing, inactive, or mismatched provenance.

It:

- activates no content profile;
- authorizes no real provider call or spend;
- weakens no RLS policy, grant, tenant boundary, MFA/AAL2 requirement, approval
  rule, media boundary, or publication control;
- creates no content, audio, upload, or release;
- does not retire the Phase 4A function; and
- does not begin Phase 4C.
