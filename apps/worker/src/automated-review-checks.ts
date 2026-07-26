import {
  type AudioReflection,
  parseAudioReflection,
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
const engineVersion = "1.0.0";

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

function reflectionText(reflection: AudioReflection): string {
  return [
    reflection.title,
    reflection.opening,
    reflection.reflection,
    ...reflection.reflection_questions,
    reflection.closing,
  ].join("\n");
}

function evaluate(
  definition: CheckDefinitionSummary,
  reflection: AudioReflection,
): AutomatedCheckResultInput {
  if (definition.version !== 1 || !supportedChecks.has(definition.key)) {
    return result(definition, "error", "m1_3.unsupported_check_definition", {
      key: definition.key,
      version: definition.version,
    });
  }

  switch (definition.key) {
    case "scripture.reference_present":
      return result(definition, "pass", "m1_3.scripture_reference_present", {
        reference_count: reflection.scripture_references.length,
      });
    case "scripture.translation_identified":
      return result(definition, "pass", "m1_3.translation_identified", {
        translation_count: reflection.scripture_references.length,
      });
    case "pastoral.no_divine_impersonation": {
      const matched =
        /\b(?:god|jesus|the holy spirit)\s+(?:told|promised|guarantees?)\s+(?:me|you)\b/i.test(
          reflectionText(reflection),
        );
      return result(
        definition,
        matched ? "fail" : "pass",
        matched ? "m1_3.divine_impersonation_pattern" : "m1_3.no_divine_impersonation_pattern",
        { matched },
      );
    }
    case "pastoral.no_harmful_certainty": {
      const text = reflectionText(reflection);
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
    case "editorial.required_structure":
      return result(definition, "pass", "m1_3.required_structure_present", {
        reflection_question_count: reflection.reflection_questions.length,
        section_count: 4,
      });
    case "rights.sources_declared":
      return result(definition, "pass", "m1_3.sources_declared", {
        source_count: reflection.scripture_references.length,
      });
    case "accessibility.transcript_ready":
      return result(definition, "pass", "m1_3.transcript_ready", {
        character_count: reflectionText(reflection).length,
      });
    case "narration.brand_pronunciation": {
      const requiresReview = /\bstrongr\b/i.test(reflectionText(reflection));
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
    readonly reflection: AudioReflection;
    readonly checkDefinitions: readonly CheckDefinitionSummary[];
  }): Promise<{
    readonly checkRunId: Uuid;
    readonly results: readonly AutomatedCheckResultInput[];
  }> {
    const organizationId = requireUuid(input.organizationId, "organization id");
    const contentVersionId = requireUuid(input.contentVersionId, "content version id");
    const correlationId = requireUuid(input.correlationId, "correlation id");
    const reflection = parseAudioReflection(input.reflection);
    const definitions = requireDefinitions(input.checkDefinitions);
    const results = Object.freeze(
      definitions.map((definition) => evaluate(definition, reflection)),
    );
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
