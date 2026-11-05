const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  projects: [
    // Runs the real extension on a fake github.com. Needs no network or account.
    { name: "fixture", testDir: "tests", testIgnore: "live/**" },
    // Checks that the real github.com still matches the fake one.
    { name: "live", testDir: "tests/live", timeout: 120000 },
  ],
});
