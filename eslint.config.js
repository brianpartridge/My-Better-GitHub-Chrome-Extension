const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  { ignores: ["node_modules/", "test-results/", "playwright-report/"] },
  js.configs.recommended,
  {
    files: ["*.js", "tests/**/*.js"],
    languageOptions: { sourceType: "script", globals: globals.browser },
  },
  {
    files: ["eslint.config.js", "playwright.config.js", "tests/**/*.js"],
    ignores: ["tests/support/fake-github-page.js"],
    languageOptions: { sourceType: "commonjs", globals: globals.node },
  },
];
