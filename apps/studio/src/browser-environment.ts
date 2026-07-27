import { loadStudioEnvironment, type StudioEnvironment } from "./environment.ts";

export type BrowserEnvironmentState =
  | Readonly<{ status: "configured"; value: StudioEnvironment }>
  | Readonly<{ status: "unconfigured" }>;

export function readBrowserEnvironment(
  source: Readonly<Record<string, string | boolean | undefined>>,
): BrowserEnvironmentState {
  try {
    const publicValues = Object.fromEntries(
      Object.entries(source).filter(
        (entry): entry is [string, string] =>
          entry[0].startsWith("PUBLIC_") && typeof entry[1] === "string",
      ),
    );
    return Object.freeze({
      status: "configured" as const,
      value: loadStudioEnvironment(publicValues),
    });
  } catch {
    return Object.freeze({ status: "unconfigured" as const });
  }
}
