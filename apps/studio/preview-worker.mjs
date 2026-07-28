const STRONGR_OS_DEV_ORIGIN = "https://fifrlyddmjkogmdvyjdp.supabase.co";

const REQUIRED_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Content-Security-Policy": `default-src 'self'; base-uri 'none'; connect-src 'self' ${STRONGR_OS_DEV_ORIGIN}; font-src 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; img-src 'self' data:; manifest-src 'self'; media-src 'self' blob:; object-src 'none'; script-src 'self'; style-src 'self'; upgrade-insecure-requests`,
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
});

function secureResponse(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(REQUIRED_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function runtimeConfiguration(env) {
  const supabaseUrl = new URL(env.PUBLIC_SUPABASE_URL);
  if (supabaseUrl.origin !== STRONGR_OS_DEV_ORIGIN || supabaseUrl.pathname !== "/") {
    throw new Error("invalid_preview_project");
  }
  if (
    typeof env.PUBLIC_SUPABASE_PUBLISHABLE_KEY !== "string" ||
    !env.PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_")
  ) {
    throw new Error("invalid_preview_key");
  }
  return Object.freeze({
    PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    PUBLIC_SUPABASE_URL: STRONGR_OS_DEV_ORIGIN,
  });
}

function isNavigationRequest(request, url) {
  if (request.method !== "GET") {
    return false;
  }
  const finalSegment = url.pathname.split("/").at(-1) ?? "";
  return request.headers.get("accept")?.includes("text/html") || !finalSegment.includes(".");
}

async function fetchAsset(request, env, url) {
  let response = await env.ASSETS.fetch(request);
  if (response.status === 404 && isNavigationRequest(request, url)) {
    response = await env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
  }
  return secureResponse(response);
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.protocol !== "https:") {
      url.protocol = "https:";
      return secureResponse(
        new Response(null, {
          headers: { Location: url.toString() },
          status: 308,
        }),
      );
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return secureResponse(
        new Response("Method not allowed", {
          headers: { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" },
          status: 405,
        }),
      );
    }

    if (url.pathname === "/runtime-config.json") {
      try {
        const body = request.method === "HEAD" ? null : JSON.stringify(runtimeConfiguration(env));
        return secureResponse(
          new Response(body, {
            headers: { "Content-Type": "application/json; charset=utf-8" },
            status: 200,
          }),
        );
      } catch {
        return secureResponse(
          new Response(
            request.method === "HEAD"
              ? null
              : JSON.stringify({ error: "Preview configuration unavailable" }),
            {
              headers: { "Content-Type": "application/json; charset=utf-8" },
              status: 503,
            },
          ),
        );
      }
    }

    return fetchAsset(request, env, url);
  },
};

export { REQUIRED_HEADERS, STRONGR_OS_DEV_ORIGIN, runtimeConfiguration };
export default worker;
