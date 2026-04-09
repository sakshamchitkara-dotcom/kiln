import { defineConfig, devices } from "@playwright/test";

const port = 8790;

// E2E runs the production build in offline scripted mode: no API key needed.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `rm -rf .e2e-data && npm run build && NODE_ENV=production KILN_SCRIPTED=true KILN_DATA_DIR=.e2e-data PORT=${port} npx tsx server/index.ts`,
    url: `http://localhost:${port}/api/config`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
