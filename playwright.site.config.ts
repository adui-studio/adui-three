import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/site",
  outputDir: "test-results/site",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["./tests/browser/timing-reporter.ts"]],
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:4174",
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
    trace: { mode: "retain-on-failure", screenshots: false, snapshots: true, sources: true },
  },
  webServer: {
    command: "pnpm run docs:build && pnpm run docs:preview",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false,
    timeout: 180000,
  },
});
