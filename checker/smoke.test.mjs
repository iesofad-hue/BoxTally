// Opens the site in a hidden browser at phone and desktop size, loads the sample box and checks it shows up.
// Run: serve the repo on port 8080 (python3 -m http.server 8080), then node checker/smoke.test.mjs
// Needs Playwright with Chromium (the "Checks" workflow installs it).
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const BASE = process.env.BASE_URL || "http://localhost:8080";

let bad = 0;
const fail = (what) => { bad++; console.log(`FAIL ${what}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
for (const [name, width, height] of [["phone", 375, 740], ["desktop", 1280, 800]]) {
  const page = await browser.newPage({ viewport: { width, height }, isMobile: width < 500, hasTouch: width < 500 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.locator("#localDemo, [data-act=demo]").first().click({ timeout: 15000 }).catch(() => fail(`${name}: no "See a sample box" button`));
  await page.waitForFunction(() => /\$[1-9]/.test(document.getElementById("d-worth").textContent), null, { timeout: 15000 })
    .catch(() => fail(`${name}: "Box worth today" stayed at $0 after loading the sample box`));

  const cards = await page.locator(".card").count();
  if (cards < 5) fail(`${name}: only ${cards} tool cards in the sample box`);

  // no sideways scrolling on a phone
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (extra > 1) fail(`${name}: the page is ${extra}px wider than the screen`);

  for (const e of errors) fail(`${name}: page error: ${e}`);
  console.log(`${name}: checked`);
  await page.close();
}
await browser.close();

if (!bad) console.log("All smoke checks passed.");
process.exit(bad ? 1 : 0);
