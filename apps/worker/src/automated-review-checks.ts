import {
  type AudioReflection,
  parseAudioReflection,
  parseStrongrDailyAudioReflectionV2,
  type StrongrDailyAudioReflectionV2,
} from "../../../packages/content-schemas/src/index.ts";
import type {
  AutomatedCheckResultInput,
  CheckDefinitionSummary,
  RecordCheckRunArguments,
  Uuid,
} from "../../../packages/contracts/src/index.ts";

export interface AutomatedCheckStore {
  recordCheckRun(arguments_: RecordCheckRunArguments): Promise<Uuid>;
}

export interface AutomatedReviewCheckEvidence {
  readonly check: "m1_3_automated_review_checks";
  readonly status: "pass" | "fail";
  readonly organization_id: Uuid;
  readonly content_version_id: Uuid;
  readonly correlation_id: Uuid;
  readonly check_count: number;
  readonly blocking_outcome_count: number;
  readonly check_run_id?: Uuid;
  readonly error_code?: "database.record_failed";
}

export interface AutomatedReviewCheckEvidenceSink {
  record(record: AutomatedReviewCheckEvidence): void;
}

const engineKey = "strongr.m1_3.deterministic";
const v1EngineVersion = "1.0.0";
const v2EngineVersion = "2.0.0";

const supportedChecks = new Set([
  "scripture.reference_present",
  "scripture.translation_identified",
  "pastoral.no_divine_impersonation",
  "pastoral.no_harmful_certainty",
  "editorial.required_structure",
  "rights.sources_declared",
  "accessibility.transcript_ready",
  "narration.brand_pronunciation",
]);

const noopEvidenceSink: AutomatedReviewCheckEvidenceSink = Object.freeze({
  record(): void {},
});

function requireUuid(value: string, name: string): Uuid {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

function result(
  definition: CheckDefinitionSummary,
  outcome: AutomatedCheckResultInput["outcome"],
  detailCode: string,
  evidence: AutomatedCheckResultInput["evidence"],
): AutomatedCheckResultInput {
  return Object.freeze({
    checkDefinitionId: requireUuid(definition.id, "check definition id"),
    detailCode,
    evidence: Object.freeze(evidence),
    outcome,
  });
}

type ReviewContent = AudioReflection | StrongrDailyAudioReflectionV2;
type UnknownRecord = Readonly<Record<string, unknown>>;

interface NormalizedContent {
  readonly schemaId: string | null;
  readonly value: UnknownRecord;
  readonly parsed: ReviewContent | null;
  readonly missingRequiredFields: readonly string[];
}

const v2RequiredStringFields = [
  "app_description",
  "artwork_generation_prompt",
  "audience",
  "closing",
  "content_hash",
  "content_type",
  "final_title",
  "narration_text",
  "pastoral_purpose",
  "personal_takeaway_prompt",
  "prayer",
  "reflective_transition",
  "schema_id",
  "scripture_introduction",
  "short_summary",
  "social_caption",
  "source_brief_identifier",
  "tone",
  "warm_welcome",
] as const;

function asRecord(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function v2MissingRequiredFields(value: UnknownRecord): readonly string[] {
  const missing: string[] = v2RequiredStringFields.filter((field) => !nonEmptyString(value[field]));
  const scripture = asRecord(value.scripture_reference);
  if (!nonEmptyString(scripture.reference)) missing.push("scripture_reference.reference");
  if (!nonEmptyString(scripture.translation)) missing.push("scripture_reference.translation");
  if (!nonEmptyString(scripture.source_citation)) {
    missing.push("scripture_reference.source_citation");
  }
  if (
    !Array.isArray(value.keywords) ||
    value.keywords.length === 0 ||
    value.keywords.some((keyword) => !nonEmptyString(keyword))
  ) {
    missing.push("keywords");
  }
  if (
    typeof value.estimated_duration_seconds !== "number" ||
    !Number.isFinite(value.estimated_duration_seconds) ||
    value.estimated_duration_seconds <= 0
  ) {
    missing.push("estimated_duration_seconds");
  }
  if (
    !Array.isArray(value.prohibited_claims_or_wording) ||
    value.prohibited_claims_or_wording.some((claim) => !nonEmptyString(claim))
  ) {
    missing.push("prohibited_claims_or_wording");
  }
  return Object.freeze(missing);
}

function normalizeContent(value: unknown): NormalizedContent {
  const record = asRecord(value);
  const schemaId = nonEmptyString(record.schema_id) ? record.schema_id : null;
  if (schemaId === "strongr.audio_reflection.v1") {
    try {
      return Object.freeze({
        missingRequiredFields: [],
        parsed: parseAudioReflection(value),
        schemaId,
        value: record,
      });
    } catch {
      return Object.freeze({
        missingRequiredFields: ["v1_contract"],
        parsed: null,
        schemaId,
        value: record,
      });
    }
  }
  if (schemaId === "strongr.strongr_daily_audio_reflection.v2") {
    const missingRequiredFields = v2MissingRequiredFields(record);
    try {
      return Object.freeze({
        missingRequiredFields,
        parsed: parseStrongrDailyAudioReflectionV2(value),
        schemaId,
        value: record,
      });
    } catch {
      return Object.freeze({
        missingRequiredFields:
          missingRequiredFields.length > 0 ? missingRequiredFields : ["v2_contract"],
        parsed: null,
        schemaId,
        value: record,
      });
    }
  }
  return Object.freeze({
    missingRequiredFields: ["schema_id"],
    parsed: null,
    schemaId,
    value: record,
  });
}

function contentStrings(content: NormalizedContent): readonly string[] {
  if (content.parsed?.schema_id === "strongr.audio_reflection.v1") {
    return [
      content.parsed.title,
      content.parsed.opening,
      content.parsed.reflection,
      ...content.parsed.reflection_questions,
      content.parsed.closing,
    ];
  }
  const fields = [
    "app_description",
    "artwork_generation_prompt",
    "closing",
    "final_title",
    "narration_text",
    "pastoral_purpose",
    "personal_takeaway_prompt",
    "prayer",
    "reflective_transition",
    "scripture_introduction",
    "scripture_text",
    "short_summary",
    "social_caption",
    "warm_welcome",
  ];
  return fields
    .map((field) => content.value[field])
    .filter((item): item is string => typeof item === "string");
}

function reflectionText(content: NormalizedContent): string {
  return contentStrings(content).join("\n");
}

function scriptureRecord(content: NormalizedContent): UnknownRecord {
  if (content.parsed?.schema_id === "strongr.audio_reflection.v1") {
    return asRecord(content.parsed.scripture_references[0]);
  }
  return asRecord(content.value.scripture_reference);
}

function evaluate(
  definition: CheckDefinitionSummary,
  content: NormalizedContent,
): AutomatedCheckResultInput {
  if (definition.version !== 1 || !supportedChecks.has(definition.key)) {
    return result(definition, "error", "m1_3.unsupported_check_definition", {
      key: definition.key,
      version: definition.version,
    });
  }
  if (
    content.schemaId !== "strongr.audio_reflection.v1" &&
    content.schemaId !== "strongr.strongr_daily_audio_reflection.v2"
  ) {
    return result(definition, "error", "m1_3.unsupported_content_schema", {
      schema_id_present: content.schemaId !== null,
    });
  }

  switch (definition.key) {
    case "scripture.reference_present": {
      const referencePresent = nonEmptyString(scriptureRecord(content).reference);
      return result(
        definition,
        referencePresent ? "pass" : "fail",
        referencePresent ? "m1_3.scripture_reference_present" : "m1_3.scripture_reference_missing",
        { reference_count: referencePresent ? 1 : 0 },
      );
    }
    case "scripture.translation_identified": {
      const translationPresent = nonEmptyString(scriptureRecord(content).translation);
      return result(
        definition,
        translationPresent ? "pass" : "fail",
        translationPresent ? "m1_3.translation_identified" : "m1_3.translation_missing",
        { translation_count: translationPresent ? 1 : 0 },
      );
    }
    case "pastoral.no_divine_impersonation": {
      const matched =
        /\b(?:god|jesus|the holy spirit)\s+(?:told|promised|guarantees?)\s+(?:me|you)\b/i.test(
          reflectionText(content),
        );
      return result(
        definition,
        matched ? "fail" : "pass",
        matched ? "m1_3.divine_impersonation_pattern" : "m1_3.no_divine_impersonation_pattern",
        { matched },
      );
    }
    case "pastoral.no_harmful_certainty": {
      const text = reflectionText(content);
      const matched =
        /\b(?:guaranteed?|certain(?:ly)?|will)(?:\s+to)?\s+(?:heal|cure|save|fix)\b/i.test(text) ||
        /\bstop taking (?:your )?(?:medication|medicine)\b/i.test(text);
      return result(
        definition,
        matched ? "fail" : "pass",
        matched ? "m1_3.harmful_certainty_pattern" : "m1_3.no_harmful_certainty_pattern",
        { matched },
      );
    }
    case "editorial.required_structure": {
      const valid = content.parsed !== null && content.missingRequiredFields.length === 0;
      const reflectionQuestionCount =
        content.parsed?.schema_id === "strongr.audio_reflection.v1"
          ? content.parsed.reflection_questions.length
          : nonEmptyString(content.value.personal_takeaway_prompt)
            ? 1
            : 0;
      return result(
        definition,
        valid ? "pass" : "fail",
        valid ? "m1_3.required_structure_present" : "m1_3.required_structure_missing",
        {
          missing_required_field_count: content.missingRequiredFields.length,
          reflection_question_count: reflectionQuestionCount,
        },
      );
    }
    case "rights.sources_declared": {
      const sourcePresent = nonEmptyString(scriptureRecord(content).source_citation);
      return result(
        definition,
        sourcePresent ? "pass" : "fail",
        sourcePresent ? "m1_3.sources_declared" : "m1_3.sources_missing",
        { source_count: sourcePresent ? 1 : 0 },
      );
    }
    case "accessibility.transcript_ready": {
      const transcript =
        content.schemaId === "strongr.strongr_daily_audio_reflection.v2"
          ? content.value.narration_text
          : reflectionText(content);
      const ready = nonEmptyString(transcript);
      return result(
        definition,
        ready ? "pass" : "fail",
        ready ? "m1_3.transcript_ready" : "m1_3.transcript_missing",
        { character_count: ready ? transcript.length : 0 },
      );
    }
    case "narration.brand_pronunciation": {
      const requiresReview = /\bstrongr\b/i.test(reflectionText(content));
      return result(
        definition,
        requiresReview ? "warn" : "pass",
        requiresReview
          ? "m1_3.manual_pronunciation_review_required"
          : "m1_3.brand_pronunciation_not_applicable",
        { requires_manual_review: requiresReview },
      );
    }
  }

  return result(definition, "error", "m1_3.unsupported_check_definition", {
    key: definition.key,
    version: definition.version,
  });
}

function requireDefinitions(
  definitions: readonly CheckDefinitionSummary[],
): readonly CheckDefinitionSummary[] {
  if (definitions.length === 0) {
    throw new Error("check definitions are required");
  }
  const identities = new Set<string>();
  for (const definition of definitions) {
    const identity = `${definition.key}@${definition.version}`;
    if (identities.has(identity)) {
      throw new Error("duplicate check definition");
    }
    identities.add(identity);
  }
  return definitions;
}

export class AutomatedReviewCheckRunner {
  readonly #evidence: AutomatedReviewCheckEvidenceSink;
  readonly #store: AutomatedCheckStore;

  constructor(input: {
    readonly store: AutomatedCheckStore;
    readonly evidence?: AutomatedReviewCheckEvidenceSink;
  }) {
    this.#store = input.store;
    this.#evidence = input.evidence ?? noopEvidenceSink;
  }

  async run(input: {
    readonly organizationId: Uuid;
    readonly contentVersionId: Uuid;
    readonly correlationId: Uuid;
    readonly reflection: unknown;
    readonly checkDefinitions: readonly CheckDefinitionSummary[];
  }): Promise<{
    readonly checkRunId: Uuid;
    readonly results: readonly AutomatedCheckResultInput[];
  }> {
    const organizationId = requireUuid(input.organizationId, "organization id");
    const contentVersionId = requireUuid(input.contentVersionId, "content version id");
    const correlationId = requireUuid(input.correlationId, "correlation id");
    const content = normalizeContent(input.reflection);
    const definitions = requireDefinitions(input.checkDefinitions);
    const results = Object.freeze(definitions.map((definition) => evaluate(definition, content)));
    const engineVersion =
      content.schemaId === "strongr.strongr_daily_audio_reflection.v2"
        ? v2EngineVersion
        : v1EngineVersion;
    const blockingOutcomeCount = results.filter(
      (check) => check.outcome === "fail" || check.outcome === "error",
    ).length;

    let checkRunId: Uuid;
    try {
      checkRunId = await this.#store.recordCheckRun({
        contentVersionId,
        correlationId,
        engineKey,
        engineVersion,
        organizationId,
        results,
        status: "completed",
      });
    } catch {
      this.#evidence.record({
        blocking_outcome_count: blockingOutcomeCount,
        check: "m1_3_automated_review_checks",
        check_count: results.length,
        content_version_id: contentVersionId,
        correlation_id: correlationId,
        error_code: "database.record_failed",
        organization_id: organizationId,
        status: "fail",
      });
      throw new Error("Automated review check recording failed");
    }

    this.#evidence.record({
      blocking_outcome_count: blockingOutcomeCount,
      check: "m1_3_automated_review_checks",
      check_count: results.length,
      check_run_id: checkRunId,
      content_version_id: contentVersionId,
      correlation_id: correlationId,
      organization_id: organizationId,
      status: "pass",
    });
    return Object.freeze({ checkRunId, results });
  }
}

export function createAutomatedReviewCheckRunner(input: {
  readonly store: AutomatedCheckStore;
  readonly evidence?: AutomatedReviewCheckEvidenceSink;
}): AutomatedReviewCheckRunner {
  return new AutomatedReviewCheckRunner(input);
}
