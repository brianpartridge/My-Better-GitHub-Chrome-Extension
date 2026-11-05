// Opens a browser so that you can sign in to GitHub yourself, then saves the
// session for `npm run test:live`. The file holds a session cookie, so it is
// readable only by you and git ignores it. Delete it to remove the session.

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");
const { AUTH_FILE } = require("./auth-file");

const FIVE_MINUTES = 5 * 60 * 1000;

(async () => {
  const browser = await chromium.launch({ headless: false, channel: "chromium" });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("https://github.com/login");
  console.log("Sign in to GitHub in the browser window. You have five minutes.");

  const end = Date.now() + FIVE_MINUTES;
  let signedIn = false;
  while (!signedIn && Date.now() < end) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    signedIn = (await context.cookies("https://github.com")).some(
      (cookie) => cookie.name === "logged_in" && cookie.value === "yes"
    );
  }

  if (signedIn) {
    fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true, mode: 0o700 });
    fs.writeFileSync(AUTH_FILE, JSON.stringify(await context.storageState()), { mode: 0o600 });
    console.log(`Saved the session to ${AUTH_FILE}.`);
  } else {
    console.error("No sign-in in five minutes. Nothing is saved.");
    process.exitCode = 1;
  }
  await browser.close();
})();
