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
  // an empty box opens on the welcome, not on $0 totals
  if (!(await page.locator("#hero").isVisible().catch(() => false))) fail(`${name}: no welcome on a first visit`);
  await page.locator("#heroDemo:visible, #localDemo:visible, [data-act=demo]:visible").first().click({ timeout: 15000 }).catch(() => fail(`${name}: no "See a sample box" button`));
  await page.waitForFunction(() => /\$[1-9]/.test(document.getElementById("d-worth").textContent), null, { timeout: 15000 })
    .catch(() => fail(`${name}: "Box worth today" stayed at $0 after loading the sample box`));

  // the box opens on its drawers: every tool in a foam pocket
  const TOOLS = "#list .card, #list .ri, #list .pocket";
  const cards = await page.locator(TOOLS).count();
  if (cards < 5) fail(`${name}: only ${cards} tools showing in the sample box`);
  if (!(await page.locator("#list.drawers .pocket").count())) fail(`${name}: the box didn't open on its drawers`);
  if (!(await page.locator("#list .pocket.out .lent-tag").count())) fail(`${name}: a lent tool's pocket has no Lent tag`);

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
  const id = await page.evaluate(() => document.querySelector("#list [data-id]")?.dataset.id);
  for (const [path, want] of [["/add", "dlg"], ["/wishlist/add", "dlg"], ["/truck", "truckDlg"], ["/insurance", "insDlg"], ["/box-check", "checkDlg"], [`/tool/${id}`, "viewer"], [`/tool/${id}/edit`, "dlg"]]) {
    await visit(path);
    const d = await openDialog();
    if (!d || d.id !== want) fail(`${name}: ${path} didn't open ${want}`);
    else if (!d.fits) fail(`${name}: ${path} is wider than the screen`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  // the truck form shows the plan you're on (the same payment as the tile), and its ✕ closes it
  await visit("/truck");
  const pays = await page.evaluate(() => [document.querySelector('[data-truck="pay"]')?.textContent.match(/\$[\d.,]+/)?.[0], document.querySelector("#t-plan .hero strong")?.textContent]);
  if (!pays[0] || pays[0] !== pays[1]) fail(`${name}: truck tile says ${pays[0]} but the form says ${pays[1]}`);
  await page.click("#truckDlg .dlg-x");
  await page.waitForTimeout(300);
  if (await openDialog()) fail(`${name}: the ✕ didn't close the truck form`);

  // the sample box owns FSM10, 12, 13 and 15, so Stats shows 11 and 14 missing
  const gaps = await page.evaluate(() => document.querySelector(".runs")?.textContent || "");
  if (!/4 of 6/.test(gaps)) fail(`${name}: "Gaps in your sets" didn't find FSM11 and FSM14 missing`);
  // box check: tapping a tool ticks it off
  await visit("/box-check");
  const found = async () => parseInt(await page.locator("#ck-count").innerText().catch(() => ""), 10);
  const n0 = await found();
  await page.locator("#ck-list .ck-row:not(:disabled)").first().click();
  await page.waitForTimeout(200);
  if ((await found()) !== n0 + 1) fail(`${name}: box check didn't count a ticked tool`);
  await page.click("#ck-reset");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // adding a tool by part number puts a new card in the box
  await visit("/");
  const before = await page.locator(TOOLS).count();
  await visit("/add");
  await page.fill("#i-pn", "F80");
  await page.click("#saveBtn");
  await page.waitForFunction(() => !document.getElementById("dlg").open, null, { timeout: 8000 }).catch(() => fail(`${name}: the add form didn't close after Save`));
  const after = await page.locator(TOOLS).count();
  if (after !== before + 1) fail(`${name}: adding F80 went from ${before} to ${after} tools`);

  if (width < 500) {
    // the bar along the bottom: Money is its own screen with no list, and Box brings the list back
    await page.click("#bnav [data-go=money]");
    await page.waitForTimeout(300);
    if (!page.url().endsWith("/money")) fail(`${name}: Money didn't go to /money`);
    if (await page.locator("#list").isVisible()) fail(`${name}: the list still shows on the Money screen`);
    if (!(await page.locator("#truckTile").isVisible())) fail(`${name}: no truck account on the Money screen`);
    await page.click("#bnav [data-go=owned]");
    await page.waitForTimeout(300);
    if (!(await page.locator("#list").isVisible())) fail(`${name}: Box didn't bring the list back`);
    // category and sort stay folded under the Filter button until it's tapped
    if (await page.locator("#fCat").isVisible()) fail(`${name}: category shows before tapping Filter`);
    await page.click("#fMore");
    if (!(await page.locator("#fCat").isVisible())) fail(`${name}: Filter didn't show category and sort`);
    await page.click("#fMore");
    // tapping a pocket opens the tool
    await page.locator("#list .pocket .open").first().click();
    await page.waitForTimeout(400);
    if ((await openDialog())?.id !== "viewer") fail(`${name}: tapping a tool in a drawer didn't open it`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    // make a drawer and fill it from the tool list: search, Select all, Save
    await page.click("#list [data-dw-new]");
    await page.fill("#dw-name", "Smoke drawer");
    await page.fill("#dw-q", "pliers");
    await page.click("#dw-all");
    await page.click("#dw-save");
    await page.waitForTimeout(500);
    const filled = await page.locator('#list details.drawer[data-drawer="Smoke drawer"] .pocket').count();
    if (filled !== 2) fail(`${name}: the new drawer got ${filled} tools, not the 2 pliers picked`);
    // tapping a row opens the tool, with its Edit and Delete buttons
    await page.click(".seg [data-view=list]");
    await page.locator("#list .ri h3").first().click();
    await page.waitForTimeout(400);
    const d = await openDialog();
    if (!d || d.id !== "viewer") fail(`${name}: tapping a tool in the list didn't open it`);
    else if (!(await page.locator("#vActs [data-vact=edit]").isVisible())) fail(`${name}: the opened tool has no Edit button`);
    await page.keyboard.press("Escape");
  }

  for (const e of errors) fail(`${name}: page error: ${e}`);
  console.log(`${name}: checked`);
  await page.close();
}
await browser.close();

if (!bad) console.log("All smoke checks passed.");
process.exit(bad ? 1 : 0);
