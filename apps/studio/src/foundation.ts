import type {
  BrowserCommandArguments,
  BrowserCommandName,
  BrowserCommandResult,
  M2TenantReadGateway,
  TenantReadGateway,
} from "../../../packages/contracts/src/index.ts";

export interface StudioCommandGateway {
  invoke<Name extends BrowserCommandName>(
    command: Name,
    arguments_: BrowserCommandArguments[Name],
  ): Promise<BrowserCommandResult<Name>>;
}

export interface StudioFoundation {
  readonly reads: TenantReadGateway;
  readonly mediaReads?: M2TenantReadGateway;
  readonly commands: StudioCommandGateway;
}

export function createStudioFoundation(
  reads: TenantReadGateway,
  commands: StudioCommandGateway,
  mediaReads?: M2TenantReadGateway,
): StudioFoundation {
  return mediaReads
    ? Object.freeze({ commands, mediaReads, reads })
    : Object.freeze({ commands, reads });
}
