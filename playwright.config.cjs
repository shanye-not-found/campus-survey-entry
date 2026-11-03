const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "./tests",
  testMatch: process.env.ENTRY_LIVE === "1" ? "live.spec.cjs" : "entry.spec.cjs",
  workers: 1,
  timeout: 30000,
  use: { baseURL: process.env.ENTRY_LIVE === "1" ? "https://shanye-not-found.github.io/campus-survey-entry/" : "http://127.0.0.1:5180", viewport: { width: 1280, height: 850 }, trace: "retain-on-failure" },
  reporter: [["list"], ["html", { open: "never" }]],
  ...(process.env.ENTRY_LIVE === "1" ? {} : { webServer: { command: "npm run dev", url: "http://127.0.0.1:5180", reuseExistingServer: false } }),
});
