import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const distRoot = resolve(repositoryRoot, "apps/studio/dist");
const evidenceRoot = resolve(
  repositoryRoot,
  process.env.STRONGR_OS_M3_ARTIFACT_DIR ?? "artifacts/m3-browser",
);
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
]);
const security = JSON.parse(
  await readFile(resolve(repositoryRoot, "apps/studio/preview-security.json"), "utf8"),
) as {
  readonly required_headers: Readonly<Record<string, string>>;
};
const securityHeaders = Object.fromEntries(
  Object.entries(security.required_headers).map(([name, value]) => [
    name,
    value.replace(`\${PUBLIC_SUPABASE_ORIGIN}`, "https://example.supabase.co"),
  ]),
);

const userId = "00000000-0000-4000-8000-000000000001";
const membershipA = "00000000-0000-4000-8000-000000000002";
const membershipB = "00000000-0000-4000-8000-000000000003";
const organizationA = "00000000-0000-4000-8000-000000000010";
const organizationB = "00000000-0000-4000-8000-000000000020";
const factorId = "00000000-0000-4000-8000-000000000030";
const nowSeconds = Math.floor(Date.now() / 1000);

interface MockState {
  aal: "aal1" | "aal2";
  expired: boolean;
  factorPresent: boolean;
  readonly tenantReads: string[];
}

function createJwt(aal: "aal1" | "aal2"): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    aal,
    exp: nowSeconds + 3600,
    role: "authenticated",
    sub: userId,
  })}.${Buffer.from("synthetic-signature").toString("base64url")}`;
}

function authUser(state: MockState) {
  return {
    app_metadata: { provider: "email", providers: ["email"] },
    aud: "authenticated",
    created_at: "2026-07-27T00:00:00.000Z",
    email: "operator@example.test",
    factors: state.factorPresent
      ? [
          {
            created_at: "2026-07-27T00:00:00.000Z",
            factor_type: "totp",
            friendly_name: "Acceptance authenticator",
            id: factorId,
            status: "verified",
            updated_at: "2026-07-27T00:00:00.000Z",
          },
        ]
      : [],
    id: userId,
    role: "authenticated",
    updated_at: "2026-07-27T00:00:00.000Z",
    user_metadata: {},
  };
}

function authSession(aal: "aal1" | "aal2", state: MockState) {
  return {
    access_token: createJwt(aal),
    expires_at: nowSeconds + 3600,
    expires_in: 3600,
    refresh_token: "synthetic-browser-refresh",
    token_type: "bearer",
    user: authUser(state),
  };
}

function organizationFilter(url: URL): string | null {
  return url.searchParams.get("organization_id")?.replace(/^eq\./, "") ?? null;
}

function briefRows(organizationId: string | null) {
  const count = organizationId === organizationA ? 1 : organizationId === organizationB ? 2 : 0;
  return Array.from({ length: count }, (_, index) => ({
    content_item_id: `00000000-0000-4000-8000-${String(100 + index).padStart(12, "0")}`,
    created_at: `2026-07-27T00:0${index}:00.000Z`,
    id: `00000000-0000-4000-8000-${String(200 + index).padStart(12, "0")}`,
    organization_id: organizationId,
    payload_hash: "a".repeat(64),
    schema_id: "strongr.audio_reflection_brief.v1",
  }));
}

async function installMockSupabase(page: Page): Promise<MockState> {
  const state: MockState = {
    aal: "aal1",
    expired: false,
    factorPresent: true,
    tenantReads: [],
  };
  await page.route("https://example.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/auth/v1/token") {
      await route.fulfill({ json: authSession(state.aal, state), status: 200 });
      return;
    }
    if (url.pathname === "/auth/v1/user") {
      await route.fulfill({ json: authUser(state), status: 200 });
      return;
    }
    if (url.pathname === "/auth/v1/logout") {
      await route.fulfill({ status: 204 });
      return;
    }
    if (url.pathname === "/auth/v1/factors" && request.method() === "POST") {
      await route.fulfill({
        json: {
          friendly_name: "Acceptance authenticator",
          id: factorId,
          totp: {
            qr_code:
              '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="white"/><rect x="20" y="20" width="80" height="80" fill="black"/></svg>',
            secret: "SYNTHETICM3ACCEPTANCE",
            uri: "otpauth://totp/Synthetic",
          },
          type: "totp",
        },
        status: 200,
      });
      return;
    }
    if (url.pathname === `/auth/v1/factors/${factorId}` && request.method() === "DELETE") {
      state.factorPresent = false;
      await route.fulfill({ json: { id: factorId }, status: 200 });
      return;
    }
    if (url.pathname === `/auth/v1/factors/${factorId}/challenge`) {
      await route.fulfill({
        json: {
          expires_at: nowSeconds + 300,
          id: "00000000-0000-4000-8000-000000000031",
          type: "totp",
        },
        status: 200,
      });
      return;
    }
    if (url.pathname === `/auth/v1/factors/${factorId}/verify`) {
      state.aal = "aal2";
      state.factorPresent = true;
      await route.fulfill({ json: authSession("aal2", state), status: 200 });
      return;
    }

    if (state.expired && url.pathname.startsWith("/rest/v1/")) {
      await route.fulfill({ json: { code: "PGRST301" }, status: 401 });
      return;
    }
    if (url.pathname === "/rest/v1/profiles") {
      await route.fulfill({
        json: [
          {
            display_name: "Synthetic Operator",
            id: userId,
            preferred_name: "Operator",
            status: "active",
          },
        ],
        status: 200,
      });
      return;
    }
    if (url.pathname === "/rest/v1/memberships") {
      await route.fulfill({
        json: [
          {
            id: membershipA,
            organization_id: organizationA,
            profile_id: userId,
            status: "active",
          },
          {
            id: membershipB,
            organization_id: organizationB,
            profile_id: userId,
            status: "active",
          },
        ],
        status: 200,
      });
      return;
    }
    if (url.pathname === "/rest/v1/organizations") {
      await route.fulfill({
        json: [
          {
            id: organizationA,
            name: "Synthetic North",
            slug: "synthetic-north",
            status: "active",
          },
          {
            id: organizationB,
            name: "Synthetic South",
            slug: "synthetic-south",
            status: "active",
          },
        ],
        status: 200,
      });
      return;
    }
    if (url.pathname === "/rest/v1/rpc/has_permission") {
      const body = request.postDataJSON() as { readonly p_permission_key?: string };
      await route.fulfill({ json: body.p_permission_key === "content.create", status: 200 });
      return;
    }
    if (url.pathname.startsWith("/rest/v1/")) {
      const organizationId = organizationFilter(url);
      if (organizationId) {
        state.tenantReads.push(organizationId);
      }
      await route.fulfill({
        json: url.pathname.endsWith("/content_briefs") ? briefRows(organizationId) : [],
        status: 200,
      });
      return;
    }
    await route.fulfill({ json: { code: "not_found" }, status: 404 });
  });
  return state;
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("operator@example.test");
  await page.getByLabel("Password").fill("synthetic-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Signed in", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Active organization" })).toBeVisible();
}

test.beforeAll(async () => {
  await mkdir(evidenceRoot, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await page.route("https://strongr.test/**", async (route) => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    const requestedPath = resolve(distRoot, pathname.slice(1));
    if (requestedPath !== distRoot && !requestedPath.startsWith(`${distRoot}${sep}`)) {
      await route.fulfill({ status: 400 });
      return;
    }

    let path = requestedPath;
    let body = await readFile(path).catch(() => undefined);
    if (!body) {
      path = resolve(distRoot, "index.html");
      body = await readFile(path);
    }
    await route.fulfill({
      body,
      contentType: contentTypes.get(extname(path)) ?? "application/octet-stream",
      headers: securityHeaders,
      status: 200,
    });
  });
});

test("signed-out shell is honest and keyboard operable", async ({ page }, testInfo) => {
  const browserErrors: string[] = [];
  let assertionFailure: unknown;
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.name));
  await installMockSupabase(page);

  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Governed work, clearly in view.",
    );
    await expect(page.getByText("Not signed in", { exact: true })).toBeVisible();
    await expect(page.getByText("Not selected", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Work queue" })).toHaveCount(0);

    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  } catch (error) {
    assertionFailure = error;
  }

  await writeFile(
    resolve(evidenceRoot, `browser-console-${testInfo.project.name}.json`),
    `${JSON.stringify(
      {
        errors: browserErrors,
        status: browserErrors.length === 0 && !assertionFailure ? "pass" : "fail",
      },
      null,
      2,
    )}\n`,
  );
  if (assertionFailure) {
    throw assertionFailure;
  }
  expect(browserErrors).toEqual([]);
});

test("sign-in discovers only active memberships and keeps canonical tenant reads explicit", async ({
  page,
}, testInfo) => {
  const state = await installMockSupabase(page);
  await signIn(page);

  const selector = page.getByRole("combobox", { name: "Active organization" });
  await expect(selector.locator("option")).toHaveText([
    "Choose an organization",
    "Synthetic North",
    "Synthetic South",
  ]);
  await selector.selectOption(organizationA);
  await page.getByRole("link", { exact: true, name: "Work queue" }).click();
  await expect(page.getByText("Work queue · Synthetic North")).toBeVisible();
  await expect(page.getByRole("article").filter({ hasText: "Briefs" })).toContainText("1");

  await selector.selectOption(organizationB);
  await expect(page.getByText("Work queue · Synthetic South")).toBeVisible();
  await expect(page.getByRole("article").filter({ hasText: "Briefs" })).toContainText("2");
  expect(new Set(state.tenantReads)).toEqual(new Set([organizationA, organizationB]));

  await writeFile(
    resolve(evidenceRoot, `tenant-continuity-${testInfo.project.name}.json`),
    `${JSON.stringify(
      {
        active_organizations: [organizationA, organizationB],
        arbitrary_tenant_observed: false,
        status: "pass",
        tenant_read_count: state.tenantReads.length,
      },
      null,
      2,
    )}\n`,
  );
});

test("expired tenant reads clear the local session and return safely to sign-in", async ({
  page,
}) => {
  const state = await installMockSupabase(page);
  await signIn(page);
  await page.getByRole("combobox", { name: "Active organization" }).selectOption(organizationA);
  await page.getByRole("link", { exact: true, name: "Work queue" }).click();
  await expect(page.getByText("Work queue · Synthetic North")).toBeVisible();

  state.expired = true;
  await page.getByRole("button", { name: "Refresh canonical status" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Sign in to Strongr Studio" })).toBeVisible();
  await expect(page.getByText(/session expired/i)).toBeVisible();
});

test("verified TOTP can step the current session from AAL1 to AAL2", async ({ page }) => {
  await installMockSupabase(page);
  await signIn(page);
  await page.getByRole("link", { name: "Security" }).click();
  await expect(page.getByText("AAL1", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Acceptance authenticator" })).toBeVisible();
  await page.getByLabel("Six-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Step up session" }).click();
  await expect(page.getByText("AAL2", { exact: true })).toBeVisible();
  await expect(page.getByText(/session assurance was refreshed/i)).toBeVisible();
});

test("TOTP enrollment and confirmed unenrollment use supported Auth operations", async ({
  page,
}) => {
  const state = await installMockSupabase(page);
  state.factorPresent = false;
  await signIn(page);
  await page.getByRole("link", { name: "Security" }).click();
  await expect(page.getByText("No TOTP authenticators are enrolled.")).toBeVisible();

  await page.getByRole("button", { name: "Begin TOTP enrollment" }).click();
  await expect(page.getByRole("heading", { name: "Scan and verify" })).toBeVisible();
  await expect(page.getByAltText("One-time TOTP enrollment QR code")).toBeVisible();
  await page.getByLabel("Six-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Finish enrollment" }).click();

  await expect(page.getByRole("heading", { name: "Acceptance authenticator" })).toBeVisible();
  await page.getByLabel("Confirm removal of Acceptance authenticator").check();
  await page.getByRole("button", { name: "Remove authenticator" }).click();
  await expect(page.getByText("No TOTP authenticators are enrolled.")).toBeVisible();
  await expect(
    page.getByText(/Authenticator removed and session assurance refreshed/i),
  ).toBeVisible();
});

test("sign-out clears the browser session without exposing a governed route", async ({ page }) => {
  await installMockSupabase(page);
  await signIn(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("Not signed in", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Work queue" })).toHaveCount(0);
  await page.goto("/security");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("M3.1 routes have no automatically detectable WCAG 2.2 A or AA violations", async ({
  page,
}, testInfo) => {
  const routeResults: Record<string, unknown> = {};
  const violations: unknown[] = [];
  await installMockSupabase(page);

  await page.goto("/sign-in");
  const signInResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  routeResults["/sign-in"] = {
    violations: signInResults.violations.map(({ id, nodes }) => ({ id, nodes: nodes.length })),
  };
  violations.push(...signInResults.violations.map(({ id }) => ({ id, route: "/sign-in" })));

  await signIn(page);
  await page.getByRole("combobox", { name: "Active organization" }).selectOption(organizationA);
  for (const route of ["/", "/work", "/security", "/boundaries", "/missing-screen"]) {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    routeResults[route] = {
      incomplete: results.incomplete.map(({ id, nodes }) => ({ id, nodes: nodes.length })),
      violations: results.violations.map(({ help, id, impact, nodes }) => ({
        help,
        id,
        impact,
        nodes: nodes.length,
      })),
    };
    violations.push(...results.violations.map(({ id }) => ({ id, route })));
  }

  await writeFile(
    resolve(evidenceRoot, `axe-${testInfo.project.name}.json`),
    `${JSON.stringify(routeResults, null, 2)}\n`,
  );
  expect(violations).toEqual([]);
});

test("authenticated M3.1 remains usable without horizontal overflow", async ({ page }) => {
  await installMockSupabase(page);
  await signIn(page);
  await page.getByRole("combobox", { name: "Active organization" }).selectOption(organizationA);
  await page.goto("/work");
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
