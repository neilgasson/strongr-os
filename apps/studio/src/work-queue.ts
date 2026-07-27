import type {
  M2TenantReadGateway,
  TenantReadGateway,
  Uuid,
} from "../../../packages/contracts/src/index.ts";

import { StudioApiError } from "./supabase-http.ts";

export type WorkQueueLaneKey =
  | "briefs"
  | "generation"
  | "versions"
  | "reviews"
  | "packages"
  | "mediaJobs"
  | "artifacts"
  | "staged"
  | "revocations";

export interface WorkQueueLane {
  readonly count: number;
  readonly detail: string;
  readonly key: WorkQueueLaneKey;
  readonly label: string;
  readonly status: "ready" | "attention" | "failed";
}

export interface WorkQueueSnapshot {
  readonly lanes: readonly WorkQueueLane[];
  readonly loadedAt: string;
}

export type StudioWorkQueueGateway = TenantReadGateway & M2TenantReadGateway;

function lane(
  key: WorkQueueLaneKey,
  label: string,
  count: number,
  detail: string,
  attention = false,
): WorkQueueLane {
  return Object.freeze({
    count,
    detail,
    key,
    label,
    status: attention && count > 0 ? "attention" : "ready",
  });
}

function failedLane(key: WorkQueueLaneKey, label: string): WorkQueueLane {
  return Object.freeze({
    count: 0,
    detail: "Canonical status could not be loaded. No success is assumed.",
    key,
    label,
    status: "failed",
  });
}

export async function loadCanonicalWorkQueue(
  gateway: StudioWorkQueueGateway,
  organizationId: Uuid,
  now: () => Date = () => new Date(),
): Promise<WorkQueueSnapshot> {
  const [
    briefs,
    generationJobs,
    versions,
    reviewDecisions,
    approvals,
    approvalRevocations,
    packages,
    mediaJobs,
    mediaArtifacts,
    mediaReviews,
    stagedReleases,
    stagedRevocations,
  ] = await Promise.allSettled([
    gateway.listBriefs(organizationId),
    gateway.listGenerationJobs(organizationId),
    gateway.listContentVersions(organizationId),
    gateway.listReviewDecisions(organizationId),
    gateway.listApprovalSnapshots(organizationId),
    gateway.listApprovalRevocations(organizationId),
    gateway.listProductionPackages(organizationId),
    gateway.listMediaJobs(organizationId),
    gateway.listMediaArtifacts(organizationId),
    gateway.listMediaReviews(organizationId),
    gateway.listStagedReleaseBundles(organizationId),
    gateway.listStagedReleaseRevocations(organizationId),
  ]);
  const results = [
    briefs,
    generationJobs,
    versions,
    reviewDecisions,
    approvals,
    approvalRevocations,
    packages,
    mediaJobs,
    mediaArtifacts,
    mediaReviews,
    stagedReleases,
    stagedRevocations,
  ];
  const expired = results.find(
    (result) =>
      result.status === "rejected" &&
      result.reason instanceof StudioApiError &&
      result.reason.status === 401,
  );
  if (expired?.status === "rejected") {
    throw expired.reason;
  }

  const generationAttention =
    generationJobs.status === "fulfilled"
      ? generationJobs.value.filter(({ state }) =>
          ["queued", "running", "failed", "dead_letter"].includes(state),
        ).length
      : 0;

  let incompleteReviews = 0;
  if (
    versions.status === "fulfilled" &&
    reviewDecisions.status === "fulfilled" &&
    approvals.status === "fulfilled"
  ) {
    const approvedVersionIds = new Set(
      approvals.value.map(({ contentVersionId }) => contentVersionId),
    );
    const latestLaneDecision = new Map<string, string>();
    for (const decision of reviewDecisions.value) {
      const key = `${decision.contentVersionId}:${decision.lane}`;
      if (!latestLaneDecision.has(key)) {
        latestLaneDecision.set(key, decision.decision);
      }
    }
    incompleteReviews = versions.value.filter(({ id, state }) => {
      if (state !== "submitted" || approvedVersionIds.has(id)) {
        return false;
      }
      return ["scripture", "theology", "editorial"].some(
        (reviewLane) => latestLaneDecision.get(`${id}:${reviewLane}`) !== "approved",
      );
    }).length;
  }

  const mediaAttention =
    mediaJobs.status === "fulfilled"
      ? mediaJobs.value.filter(({ state }) =>
          ["queued", "running", "failed", "dead_letter"].includes(state),
        ).length
      : 0;

  const unreviewedArtifacts =
    mediaArtifacts.status === "fulfilled" && mediaReviews.status === "fulfilled"
      ? mediaArtifacts.value.filter(
          ({ id }) => !mediaReviews.value.some(({ mediaArtifactId }) => mediaArtifactId === id),
        ).length
      : 0;

  const revokedApprovalIds =
    approvalRevocations.status === "fulfilled"
      ? new Set(approvalRevocations.value.map(({ approvalSnapshotId }) => approvalSnapshotId))
      : new Set<Uuid>();
  const revokedReleaseIds =
    stagedRevocations.status === "fulfilled"
      ? new Set(stagedRevocations.value.map(({ stagedReleaseBundleId }) => stagedReleaseBundleId))
      : new Set<Uuid>();

  return Object.freeze({
    lanes: Object.freeze([
      briefs.status === "fulfilled"
        ? lane("briefs", "Briefs", briefs.value.length, "Tenant-scoped canonical briefs.")
        : failedLane("briefs", "Briefs"),
      generationJobs.status === "fulfilled"
        ? lane(
            "generation",
            "Generation",
            generationAttention,
            `${generationJobs.value.length} total job${generationJobs.value.length === 1 ? "" : "s"}; queued, running, and failed work needs attention.`,
            true,
          )
        : failedLane("generation", "Generation"),
      versions.status === "fulfilled"
        ? lane(
            "versions",
            "Versions",
            versions.value.length,
            `${versions.value.filter(({ state }) => state === "submitted").length} submitted immutable version${versions.value.filter(({ state }) => state === "submitted").length === 1 ? "" : "s"}.`,
          )
        : failedLane("versions", "Versions"),
      versions.status === "fulfilled" &&
      reviewDecisions.status === "fulfilled" &&
      approvals.status === "fulfilled"
        ? lane(
            "reviews",
            "Incomplete reviews",
            incompleteReviews,
            "Submitted versions missing an approved Scripture, theology, or editorial lane.",
            true,
          )
        : failedLane("reviews", "Incomplete reviews"),
      packages.status === "fulfilled" && approvalRevocations.status === "fulfilled"
        ? lane(
            "packages",
            "Packages",
            packages.value.filter(
              ({ approvalSnapshotId }) => !revokedApprovalIds.has(approvalSnapshotId),
            ).length,
            "Packages whose exact approval has not been revoked.",
          )
        : failedLane("packages", "Packages"),
      mediaJobs.status === "fulfilled"
        ? lane(
            "mediaJobs",
            "Media jobs",
            mediaAttention,
            `${mediaJobs.value.length} total job${mediaJobs.value.length === 1 ? "" : "s"}; durable non-terminal and failed states are surfaced.`,
            true,
          )
        : failedLane("mediaJobs", "Media jobs"),
      mediaArtifacts.status === "fulfilled" && mediaReviews.status === "fulfilled"
        ? lane(
            "artifacts",
            "Private artifacts",
            unreviewedArtifacts,
            `${mediaArtifacts.value.length} exact private artifact${mediaArtifacts.value.length === 1 ? "" : "s"}; count shows those without review.`,
            true,
          )
        : failedLane("artifacts", "Private artifacts"),
      stagedReleases.status === "fulfilled" && stagedRevocations.status === "fulfilled"
        ? lane(
            "staged",
            "Active staged releases",
            stagedReleases.value.filter(({ id }) => !revokedReleaseIds.has(id)).length,
            "Immutable private release manifests without a revocation.",
          )
        : failedLane("staged", "Active staged releases"),
      approvalRevocations.status === "fulfilled" && stagedRevocations.status === "fulfilled"
        ? lane(
            "revocations",
            "Revocations",
            approvalRevocations.value.length + stagedRevocations.value.length,
            `${approvalRevocations.value.length} approval and ${stagedRevocations.value.length} staged-release revocation${approvalRevocations.value.length + stagedRevocations.value.length === 1 ? "" : "s"}.`,
          )
        : failedLane("revocations", "Revocations"),
    ]),
    loadedAt: now().toISOString(),
  });
}
