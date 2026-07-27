import { AuthClient } from "@supabase/auth-js";

import type { StudioEnvironment } from "./environment.ts";

export const studioAuthPolicy = Object.freeze({
  autoRefreshToken: true,
  detectSessionInUrl: true,
  flowType: "pkce" as const,
  persistSession: true,
});

export function createStudioAuthClient(
  environment: StudioEnvironment,
): InstanceType<typeof AuthClient> {
  return new AuthClient({
    autoRefreshToken: studioAuthPolicy.autoRefreshToken,
    detectSessionInUrl: studioAuthPolicy.detectSessionInUrl,
    flowType: studioAuthPolicy.flowType,
    headers: {
      apikey: environment.supabasePublishableKey,
      "X-Client-Info": "strongr-studio/m3.1",
    },
    persistSession: studioAuthPolicy.persistSession,
    storageKey: "strongr-os-studio-auth",
    url: `${environment.supabaseUrl}/auth/v1`,
  });
}
