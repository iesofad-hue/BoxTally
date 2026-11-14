// Quality check (2026-11-14): opens the sample box on a phone and a computer, in light and dark,
// and fails if something is hard to read or use:
//   - accessibility problems axe rates serious or critical (text too faint, buttons with no name, ...)
//     on the box and on every form
//   - anything wider than the screen on a phone
//   - drawer names that wrap past two lines on a phone
//   - the no-signal bar not showing when the signal drops
// Run: serve the repo on port 8080 (python3 -m http.server 8080), then node checker/quality.test.mjs
// Needs Playwright with Chromium and axe-core (the "Checks" workflow installs both).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const axe = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const BASE = process.env.BASE_URL || "http://localhost:8080";

let bad = 0;
const fail = (what) => { bad++; console.log(`FAIL ${what}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
for (const [name, width, height, scheme] of [["phone", 375, 740, "light"], ["phone dark", 375, 740, "dark"], ["desktop", 1280, 800, "light"], ["desktop dark", 1280, 800, "dark"]]) {
  const phone = width < 500;
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, colorScheme: scheme });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  // no database here: the sample box has its own prices, so every run looks the same
  await page.route(/supabase\.co/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto(BASE + "/?sample", { waitUntil: "load" });
  await page.waitForFunction(() => /\$[1-9]/.test(document.getElementById("d-worth").textContent), null, { timeout: 15000 }).catch(() => fail(`${name}: the sample box didn't load`));
  await page.waitForTimeout(800);
  await page.addScriptTag({ content: axe });

  const check = async (where) => {
    const found = await page.evaluate(async () => {
      // the tool drawings are pictures: their tiny size labels aren't text people need to read
      const r = await window.axe.run({ exclude: [["svg"], [".art"]] }, { runOnly: ["wcag2a", "wcag2aa"], resultTypes: ["violations"] });
      return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(", ")}`);
    });
    for (const f of found) fail(`${name}, ${where}: ${f}`);
    if (phone) {
      const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (extra > 1) fail(`${name}, ${where}: ${extra}px wider than the screen`);
    }
  };
  await check("the box");

  if (phone) {
    const tall = await page.evaluate(() => [...document.querySelectorAll("#list .drawer .dname")]
      .filter((d) => d.getBoundingClientRect().height > parseFloat(getComputedStyle(d).lineHeight) * 2.2).map((d) => d.textContent));
    if (tall.length) fail(`${name}: drawer names wrap past two lines: ${tall.join(", ")}`);
  }

  // every form, opened the way Back/Forward would
  const visit = (path) => page.evaluate((p) => { history.pushState(null, "", p); dispatchEvent(new PopStateEvent("popstate")); }, path).then(() => page.waitForTimeout(600));
  const id = await page.evaluate(() => document.querySelector("#list [data-id]")?.dataset.id);
  for (const path of ["/add", "/truck", "/insurance", "/box-check", "/import", `/tool/${id}`, `/tool/${id}/edit`]) {
    await visit(path);
    await check(path);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
  if (phone) { await visit("/money"); await check("/money"); await visit("/"); }

  // losing signal shows the bar at the top; getting it back hides it
  await ctx.setOffline(true);
  await page.waitForTimeout(300);
  if (!(await page.locator("#netBar").isVisible())) fail(`${name}: no "No signal" bar after the signal dropped`);
  await ctx.setOffline(false);
  await page.waitForTimeout(300);
  if (await page.locator("#netBar").isVisible()) fail(`${name}: the "No signal" bar stayed after the signal came back`);

  for (const e of errors) fail(`${name}: page error: ${e}`);
  console.log(`${name}: checked`);
  await ctx.close();
}
await browser.close();
if (bad) { console.log(`${bad} problem(s)`); process.exit(1); }
console.log("quality: all good");
