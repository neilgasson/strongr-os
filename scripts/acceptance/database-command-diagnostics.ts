export interface DatabaseCommandDiagnostic {
  readonly command: string;
  readonly detail: string | null;
  readonly hint: string | null;
  readonly lifecycleStep: string;
  readonly message: string | null;
  readonly postgresCode: string | null;
}

interface DatabaseCommandDiagnosticInput {
  readonly command: string;
  readonly lifecycleStep: string;
  readonly stderr: string;
}

const MAXIMUM_FIELD_LENGTH = 600;

function firstField(stderr: string, field: "DETAIL" | "ERROR" | "HINT"): string | null {
  const expression = new RegExp(`^\\s*${field}:\\s*(.*)$`, "im");
  return expression.exec(stderr)?.[1]?.trim() || null;
}

function postgresCode(stderr: string): string | null {
  return (
    /\bSQLSTATE\s*[:=]\s*([0-9A-Z]{5})\b/i.exec(stderr)?.[1]?.toUpperCase() ??
    /^\s*ERROR:\s+([0-9A-Z]{5}):/im.exec(stderr)?.[1]?.toUpperCase() ??
    null
  );
}

function fallbackMessage(stderr: string): string | null {
  return /^\s*psql:\s*(?:error:\s*)?(.*)$/im.exec(stderr)?.[1]?.trim() || null;
}

export function sanitizeDatabaseDiagnostic(value: string | null): string | null {
  if (!value) return null;

  const sanitized = value
    .replace(/\b(?:postgres(?:ql)?|https?):\/\/[^\s'"`]+/gi, "[redacted-url]")
    .replace(
      /\b(password|passfile|api[_-]?key|authorization|access[_-]?token|service[_-]?role[_-]?key|secret|token)\s*(=|:)\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1$2[redacted]",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/gi, "[redacted-key]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted-token]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\bKey\s+\(([^)]*)\)=\([^)]*\)/gi, "Key ($1)=([redacted])")
    .replace(/\bFailing row contains\s*\([^)]*\)/gi, "Failing row contains ([redacted])")
    .trim();

  if (/[{[]\s*["']/.test(sanitized)) return "[redacted-structured-value]";
  return sanitized.slice(0, MAXIMUM_FIELD_LENGTH) || null;
}

export function databaseCommandDiagnostic(
  input: DatabaseCommandDiagnosticInput,
): DatabaseCommandDiagnostic {
  const error = firstField(input.stderr, "ERROR");
  const message = error?.replace(/^[0-9A-Z]{5}:\s*/i, "") ?? fallbackMessage(input.stderr);
  return Object.freeze({
    command: input.command,
    detail: sanitizeDatabaseDiagnostic(firstField(input.stderr, "DETAIL")),
    hint: sanitizeDatabaseDiagnostic(firstField(input.stderr, "HINT")),
    lifecycleStep: input.lifecycleStep,
    message: sanitizeDatabaseDiagnostic(message),
    postgresCode: postgresCode(input.stderr),
  });
}
