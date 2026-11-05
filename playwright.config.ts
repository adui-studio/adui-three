import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["./tests/browser/timing-reporter.ts"]],
  // Software WebGL integration includes real rendering, layout and repeated lifecycle operations.
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 3,
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
    // Keep action/DOM/network evidence without continuous screenshots of software WebGL frames.
    trace: { mode: "retain-on-failure", screenshots: false, snapshots: true, sources: true },
  },
  webServer: {
    command:
      "pnpm exec vp run -r build && pnpm --filter website preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
