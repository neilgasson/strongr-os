export interface StudioEnvironment {
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
}

export interface StudioEnvironmentSource {
  readonly PUBLIC_SUPABASE_URL?: string;
  readonly PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly [name: string]: string | undefined;
}

function requireValue(
  source: StudioEnvironmentSource,
  name: keyof StudioEnvironmentSource,
): string {
  const value = source[name]?.trim();
  if (!value) {
    throw new Error(`Missing public Studio environment value: ${String(name)}`);
  }
  return value;
}

function requireSupabaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("Studio Supabase URL must use HTTPS");
  }
  return url.toString().replace(/\/$/, "");
}

function requirePublishableKey(value: string): string {
  if (!/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(value)) {
    throw new Error("Studio must use a Supabase publishable key");
  }
  return value;
}

export function loadStudioEnvironment(source: StudioEnvironmentSource): StudioEnvironment {
  return Object.freeze({
    supabaseUrl: requireSupabaseUrl(requireValue(source, "PUBLIC_SUPABASE_URL")),
    supabasePublishableKey: requirePublishableKey(
      requireValue(source, "PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    ),
  });
}
