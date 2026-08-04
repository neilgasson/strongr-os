import {
  prepareQuietTrustDevelopmentDispatch,
  quietTrustDevelopmentPilotBriefChecksum,
  quietTrustDevelopmentPilotJobChecksum,
  quietTrustDevelopmentPilotRequestId,
  QuietTrustDispatchPreparationError,
} from "../../../packages/content-profiles/src/index.ts";

export const strongrDailyPhase4b5Boundary = Object.freeze({
  allowedOrigin: "https://strongr-studio-preview.meetwagon.chatgpt.site",
  projectRef: "fifrlyddmjkogmdvyjdp",
  supabaseUrl: "https://fifrlyddmjkogmdvyjdp.supabase.co",
});

type UnknownRecord = Readonly<Record<string, unknown>>;

function response(status: number, body: UnknownRecord): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Origin": strongrDailyPhase4b5Boundary.allowedOrigin,
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      Vary: "Origin",
    },
    status,
  });
}

async function requestId(request: Request): Promise<string | null> {
  try {
    const body = await request.json();
    if (
      body === null ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      typeof (body as Record<string, unknown>).request_identifier !== "string"
    ) {
      return null;
    }
    return (body as Record<string, string>).request_identifier ?? null;
  } catch {
    return null;
  }
}

/**
 * Development-only call-readiness endpoint. It recognises exactly one request
 * ID and reports its integrity metadata, but it cannot call a provider. A
 * separate owner-approved phase must replace this fail-closed boundary before
 * any credential can be read or network provider call can occur.
 */
export function createStrongrDailyPhase4b5OnceHandler() {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return response(204, {});
    if (request.method !== "POST") return response(405, { error_code: "method_not_allowed" });
    if (request.headers.get("origin") !== strongrDailyPhase4b5Boundary.allowedOrigin) {
      return response(403, { error_code: "origin_not_allowed" });
    }
    if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
      return response(401, { error_code: "authentication_required" });
    }

    const id = await requestId(request);
    if (id !== quietTrustDevelopmentPilotRequestId) {
      return response(400, { error_code: "phase_4b6_invalid_request" });
    }
    try {
      prepareQuietTrustDevelopmentDispatch(id);
    } catch (error) {
      if (error instanceof QuietTrustDispatchPreparationError) {
        return response(409, {
          brief_checksum: quietTrustDevelopmentPilotBriefChecksum,
          error_code: error.code,
          job_checksum: quietTrustDevelopmentPilotJobChecksum,
          request_identifier: quietTrustDevelopmentPilotRequestId,
        });
      }
    }
    return response(503, { error_code: "phase_4b6_integrity_mismatch" });
  };
}
