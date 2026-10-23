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

  // open a page address the way Back/Forward would, without reloading (the sample box lives in memory)
  const visit = (path) => page.evaluate((p) => { history.pushState(null, "", p); dispatchEvent(new PopStateEvent("popstate")); }, path).then(() => page.waitForTimeout(600));
  const openDialog = () => page.evaluate(() => {
    const d = document.querySelector("dialog[open]");
    if (!d) return null;
    const b = d.getBoundingClientRect();
    return { id: d.id, fits: b.left >= 0 && b.right <= document.documentElement.clientWidth + 1 };
  });

  // every form opens from its address and fits the screen
  const id = await page.evaluate(() => document.querySelector(".card[data-id]")?.dataset.id);
  for (const [path, want] of [["/add", "dlg"], ["/wishlist/add", "dlg"], ["/truck", "truckDlg"], ["/insurance", "insDlg"], [`/tool/${id}`, "viewer"], [`/tool/${id}/edit`, "dlg"]]) {
    await visit(path);
    const d = await openDialog();
    if (!d || d.id !== want) fail(`${name}: ${path} didn't open ${want}`);
    else if (!d.fits) fail(`${name}: ${path} is wider than the screen`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  // adding a tool by part number puts a new card in the box
  await visit("/");
  const before = await page.locator(".card").count();
  await visit("/add");
  await page.fill("#i-pn", "F80");
  await page.click("#saveBtn");
  await page.waitForFunction(() => !document.getElementById("dlg").open, null, { timeout: 8000 }).catch(() => fail(`${name}: the add form didn't close after Save`));
  const after = await page.locator(".card").count();
  if (after !== before + 1) fail(`${name}: adding F80 went from ${before} to ${after} cards`);

  for (const e of errors) fail(`${name}: page error: ${e}`);
  console.log(`${name}: checked`);
  await page.close();
}
await browser.close();

if (!bad) console.log("All smoke checks passed.");
process.exit(bad ? 1 : 0);
