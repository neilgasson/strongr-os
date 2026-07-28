import { loadStudioEnvironment, type StudioEnvironment } from "./environment.ts";

export type BrowserEnvironmentState =
  | Readonly<{ status: "configured"; value: StudioEnvironment }>
  | Readonly<{ status: "unconfigured" }>;

export type BrowserEnvironmentFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

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

export async function loadBrowserEnvironment(
  source: Readonly<Record<string, string | boolean | undefined>>,
  fetchRuntime: BrowserEnvironmentFetch = fetch,
): Promise<BrowserEnvironmentState> {
  const bundled = readBrowserEnvironment(source);
  if (bundled.status === "configured") {
    return bundled;
  }

  try {
    const response = await fetchRuntime("/runtime-config.json", {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return Object.freeze({ status: "unconfigured" as const });
    }
    const runtime = (await response.json()) as Readonly<Record<string, unknown>>;
    return readBrowserEnvironment(
      Object.fromEntries(
        Object.entries(runtime).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      ),
    );
  } catch {
    return Object.freeze({ status: "unconfigured" as const });
  }
}
