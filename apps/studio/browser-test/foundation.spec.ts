import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
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

test("shell exposes honest foundation state and keyboard navigation", async ({
  page,
}, testInfo) => {
  const browserErrors: string[] = [];
  let assertionFailure: unknown;
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.name));

  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Governed work, clearly in view.",
    );
    await expect(page.getByText("Not signed in", { exact: true })).toBeVisible();
    await expect(page.getByText("Not selected", { exact: true })).toBeVisible();

    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();

    await page.getByRole("link", { name: "Work queue" }).click();
    await expect(page).toHaveURL(/\/work$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("One place");
    await expect(page.getByText("No queued jobs")).toBeVisible();
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

test("core routes have no automatically detectable WCAG 2.2 A or AA violations", async ({
  page,
}, testInfo) => {
  const routeResults: Record<string, unknown> = {};
  const violations: unknown[] = [];

  for (const route of ["/", "/work", "/boundaries", "/missing-screen"]) {
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

test("foundation remains usable without horizontal overflow", async ({ page }) => {
  await page.goto("/");
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
