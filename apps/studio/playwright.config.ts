import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const artifactRoot = resolve(
  repositoryRoot,
  process.env.STRONGR_OS_M3_ARTIFACT_DIR ?? "artifacts/m3-browser",
);

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  outputDir: `${artifactRoot}/playwright-output`,
  reporter: [
    ["list"],
    ["json", { outputFile: `${artifactRoot}/playwright-results.json` }],
    ["html", { open: "never", outputFolder: `${artifactRoot}/playwright-report` }],
  ],
  retries: process.env.CI ? 1 : 0,
  testDir: "./browser-test",
  use: {
    baseURL: "https://strongr.test",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        colorScheme: "light",
      },
    },
    {
      name: "narrow-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { height: 800, width: 360 },
      },
    },
  ],
});
