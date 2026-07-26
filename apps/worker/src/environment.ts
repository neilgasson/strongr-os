export type PrivilegedKeyKind = "secret" | "legacy_service_role";

export interface WorkerEnvironment {
  readonly supabaseUrl: string;
  readonly supabasePrivilegedKey: string;
  readonly privilegedKeyKind: PrivilegedKeyKind;
  readonly workerId: string;
}

export interface WorkerEnvironmentSource {
  readonly STRONGR_OS_SUPABASE_URL?: string;
  readonly STRONGR_OS_SUPABASE_SECRET_KEY?: string;
  readonly STRONGR_OS_SUPABASE_SERVICE_ROLE_KEY?: string;
  readonly STRONGR_OS_WORKER_ID?: string;
  readonly [name: string]: string | undefined;
}

function requireValue(
  source: WorkerEnvironmentSource,
  name: keyof WorkerEnvironmentSource,
): string {
  const value = source[name]?.trim();
  if (!value) {
    throw new Error(`Missing worker environment value: ${String(name)}`);
  }
  return value;
}

function requireSupabaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("Worker Supabase URL must use HTTPS");
  }
  return url.toString().replace(/\/$/, "");
}

function requireWorkerId(value: string): string {
  if (!/^[a-z][a-z0-9_.-]{0,159}$/.test(value)) {
    throw new Error("Worker ID is invalid");
  }
  return value;
}

function resolvePrivilegedKey(
  source: WorkerEnvironmentSource,
): Pick<WorkerEnvironment, "privilegedKeyKind" | "supabasePrivilegedKey"> {
  const secret = source.STRONGR_OS_SUPABASE_SECRET_KEY?.trim();
  const legacy = source.STRONGR_OS_SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (secret && legacy) {
    throw new Error("Configure exactly one privileged Supabase worker key");
  }
  if (secret) {
    if (!/^sb_secret_[A-Za-z0-9_-]{8,}$/.test(secret)) {
      throw new Error("Worker Supabase secret key is invalid");
    }
    return { privilegedKeyKind: "secret", supabasePrivilegedKey: secret };
  }
  if (legacy && legacy.length >= 32) {
    return { privilegedKeyKind: "legacy_service_role", supabasePrivilegedKey: legacy };
  }
  throw new Error("Missing privileged Supabase worker key");
}

function rejectPublicPrivilegedNames(source: WorkerEnvironmentSource): void {
  const exposed = Object.keys(source).filter(
    (name) => name.startsWith("PUBLIC_") && /(?:SECRET|SERVICE_ROLE|DATABASE_URL)/.test(name),
  );
  if (exposed.length > 0) {
    throw new Error("Privileged worker values cannot use public environment names");
  }
}

export function loadWorkerEnvironment(source: WorkerEnvironmentSource): WorkerEnvironment {
  rejectPublicPrivilegedNames(source);
  return Object.freeze({
    supabaseUrl: requireSupabaseUrl(requireValue(source, "STRONGR_OS_SUPABASE_URL")),
    ...resolvePrivilegedKey(source),
    workerId: requireWorkerId(requireValue(source, "STRONGR_OS_WORKER_ID")),
  });
}
