import type { Uuid } from "../../contracts/src/index.ts";

export interface MediaAdapterIdentity {
  readonly adapterKey: string;
  readonly adapterVersion: string;
}

export interface MediaGenerationRequest {
  readonly organizationId: Uuid;
  readonly mediaJobId: Uuid;
  readonly productionPackageId: Uuid;
  readonly outputSpecId: Uuid;
  readonly inputHash: string;
  readonly correlationId: Uuid;
}

export interface MediaGenerationResult {
  readonly bytes: Uint8Array;
  readonly costMicrounits: number;
  readonly providerNeutralCorrelationId: string;
}

export interface MediaAdapter {
  readonly identity: MediaAdapterIdentity;
  generate(request: MediaGenerationRequest): Promise<MediaGenerationResult>;
}
