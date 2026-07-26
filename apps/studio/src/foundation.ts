import type {
  BrowserCommandArguments,
  BrowserCommandName,
  BrowserCommandResult,
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
  readonly commands: StudioCommandGateway;
}

export function createStudioFoundation(
  reads: TenantReadGateway,
  commands: StudioCommandGateway,
): StudioFoundation {
  return Object.freeze({ reads, commands });
}
