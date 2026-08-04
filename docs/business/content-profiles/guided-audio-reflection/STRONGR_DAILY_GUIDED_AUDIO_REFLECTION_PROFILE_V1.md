# Strongr Daily guided audio reflection profile v1

**Profile ID:** `guided_audio_reflection`

**Profile version:** `1`

**Technical content contract:** `audio_reflection` using the existing Strongr
Daily v2 brief and output schemas

**Format variant:** `guided_v1`

**Lifecycle:** Owner review

**Activation:** Inactive

**Provider calls authorized by this document:** None

## Purpose and audience

Create an approximately five-minute, Christ-centred and Scripture-rooted guided
audio reflection for adults seeking a warm, peaceful, reverent daily faith
experience. The output is a first draft only. It never carries review,
approval, narration, upload, or publication authority.

## Required spoken structure

The canonical order is:

1. warm welcome;
2. Scripture introduction;
3. reflection;
4. prayer; and
5. closing invitation.

Every section is required. The transition between sections should feel calm and
natural, but the provider must not merge away a section or invent a different
format from the title alone.

## Required supporting outputs

The same governed draft contains all of the following; none becomes a separate
profile, job, or approval path:

- final title;
- Scripture reference, translation, and source citation;
- app description;
- short summary;
- personal takeaway prompt;
- artwork prompt;
- social caption;
- keywords and metadata;
- narration-ready plain text; and
- duration estimate targeting 300 seconds.

## Tone and reflection

- Warm, peaceful, welcoming, reverent, pastoral, modern, and accessible.
- Christ-centred and Scripture-rooted without pretending the model is the voice
  of God.
- Substantive enough to support an approximately five-minute experience without
  padding, repetition, or guaranteed outcomes.
- The reflection may invite stillness, trust, repentance, gratitude, hope, or
  another brief-approved pastoral response. It must remain faithful to the
  selected Scripture reference and approved brief.

## Immersive biblical narrative standard

For story-based reflections, the biblical account is the primary storytelling
vehicle, not a brief illustration added to a modern therapeutic reflection.

- Open within a specific biblical scene and keep the listener close to the
  biblical character's recorded experience.
- Use sensory, historical, and cultural detail carefully to locate the scene:
  landscape, weather, light, work, travel, clothing, social customs, political
  pressures, and religious expectations only where relevant and responsibly
  grounded.
- Distinguish explicit Scripture, historical context, and imaginative
  reflection. Never present speculation as biblical fact, invent divine speech,
  doctrine, miracles, motives, or events.
- Use restrained qualifiers such as “may have,” “perhaps,” “we are not told,
  but,” “the scene invites us to imagine,” and “historical context suggests”
  when imagination is appropriate.
- Show how God meets, guides, corrects, sustains, forgives, restores, or
  strengthens the person, and connect the account faithfully to Christ, His
  teaching, or hope fulfilled in Him.
- Invite reflection through the story without diagnosing or assuming the
  listener's private struggles.
- Keep the writing cinematic but peaceful, historically grounded, reverent,
  Christ-centred, pastoral rather than theatrical, and never sensationalize
  suffering.

## Scripture and rights

- A brief supplies an exact reference, translation label, and source citation.
- Reference and translation metadata are the default provider input.
- Full or partial Scripture wording is excluded unless an exact rights record
  expressly permits storage, provider use, narration, export, and distribution.
- The provider must not infer quotation rights from a translation label.
- KJV and NIV are not blanket-cleared by this profile.
- When rights are unresolved, generation proceeds with reference metadata only
  and the narration paraphrases the pastoral theme without quoting the passage.
- Scripture evidence and human Scripture review remain separate from generation.

## Prayer and private-data boundary

The prayer is public editorial content written for the reflection. It is not a
user's prayer request and must not include private prayer, care, crisis, journal,
or personal-response text. A personal takeaway is a public editorial prompt;
any private response remains outside the provider request, logs, evidence,
analytics, and unrelated generation.

## Narration-ready standard

- Provider-neutral plain text only, held in one complete narration-script
  field. This single locked field is the only spoken source sent to a
  narration provider.
- The complete spoken script includes the welcome, biblical narrative,
  reflection and Christ-centred takeaway, full prayer, spoken closing
  invitation, and any Daily Practice wording intended for the listener.
- Reflection, prayer, journal prompt, Daily Practice, historical-context, and
  other editorial fields remain separately managed for app display, but are
  never separate provider inputs.
- Spoken sections appear in the required order and include the closing
  invitation.
- No SSML, ElevenLabs markup, bracketed stage directions, inline music
  instructions, or vendor-specific control syntax.
- Pronunciation notes and production guidance are separate reviewed metadata,
  never embedded in the narration.
- No Scripture wording is spoken unless its exact rights record permits spoken
  use.
- Spoken welcomes, spoken closings, and all other text intended for audio must
  write “Stronger Daily” in full for pronunciation. Official non-spoken product
  naming remains “Strongr Daily,” including app titles, metadata, filenames,
  content IDs, screen labels, artwork, transcripts, documentation, and
  publishing records.

## Supporting-output standard

- The title is clear, distinctive, and faithful to the brief.
- The app description and short summary explain the experience without
  promising a result.
- The personal takeaway prompt is optional for the listener and never asks the
  provider to consume a private response.
- Artwork and social prompts do not depict God, Jesus, or divine speech as if
  generated media were authoritative.
- Keywords are concise, relevant, and free of unsupported claims.

## Prohibited framing

- prosperity-gospel claims;
- guaranteed healing, wealth, certainty, or specific outcomes;
- language presenting AI output as God's direct speech;
- invented Scripture quotations or unlicensed Scripture wording;
- close copying of a golden example's prose;
- private prayer, journal, care, crisis, or personal-response data;
- claims that automated checks or AI completed a human review;
- automatic approval, packaging, narration, upload, publication, or release.

## Golden-example authority

The private Quiet Trust package is an exact hash-bound reference for:

- overall five-part content structure;
- warm pastoral tone;
- public editorial prayer style;
- gentle closing style;
- concise app-description and summary format; and
- supporting metadata categories.

It does **not** govern exact wording, Scripture quotation, narration assembly,
delivery pacing, pronunciation, music, or theological correctness. Its raw prose
must not be sent to a provider. Only the owner-approved abstract rules in this
profile may later be used in a provider instruction after separate activation.

## Governance and rollback

The profile remains inactive until its exact checksum, source-manifest checksum,
rights scope, and provider boundary receive owner approval and a separate
activation change passes acceptance. If activated later, rollback is a
forward-only transition to `superseded` or `retired`, plus removal of the exact
runtime authorization. Historical profile, brief, job, version, review, package,
and audit provenance remains immutable.

## Sources

- Locked Strongr Daily economic-target plan.
- Strongr Daily Phase 4B.2 content-policy decisions.
- Strongr OS Engineering Standards v1.0.
- Existing Strongr Daily v2 audio-reflection brief and output contracts.
- Existing Scripture-rights pre-call boundary.
- Private, immutable Quiet Trust Phase 4A package descriptor and scoped rights
  record.
