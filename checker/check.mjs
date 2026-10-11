// Snap-on price checker.
//
// Visits each tracked part number on shop.snapon.com the way a normal visitor would,
// reads the product data the page itself loads, and saves name, price, sale price
// and a daily price history to Supabase. It never copies Snap-on's product photos.
//
//   node checker/check.mjs --count   prints how many part numbers are due (no browser needed)
//   node checker/check.mjs           runs the check
//
// Environment:
//   SUPABASE_URL          https://<project>.supabase.co
//   SUPABASE_SECRET_KEY   the project's secret key (sb_secret_...), kept in GitHub Actions secrets
//   MODE                  "due" (new or refresh-requested part numbers) or "all" (every tracked part number)

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// On a home computer the secret key lives in checker/.env (never committed). In GitHub Actions it comes from secrets.
const envFile = join(dirname(fileURLToPath(import.meta.url)), ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://ctteljhhjsfvyyiwzxiy.supabase.co").replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SECRET_KEY || "";
const modeArg = process.argv.find((a) => a.startsWith("--mode="));
const MODE = (modeArg ? modeArg.slice(7) : process.env.MODE) === "all" ? "all" : "due";
const STORE = "https://shop.snapon.com";
const PAUSE_MS = 2500; // be polite: one product every few seconds

if (!KEY) {
  console.error("Missing SUPABASE_SECRET_KEY. On Windows, run setup-windows.bat again to save it.");
  process.exit(1);
}
const VERSION = "2026-10-11.2";
console.log(`[${new Date().toLocaleString()}] checker version ${VERSION}, mode: ${MODE}`);

class BlockedError extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();

async function rest(path, { method = "GET", body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: KEY,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} failed: ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function partsToCheck() {
  return rest("rpc/parts_to_check", { method: "POST", body: { full_run: MODE === "all" } });
}

// ---------- --count: tell the workflow whether to bother installing a browser ----------
if (process.argv.includes("--count")) {
  const parts = await partsToCheck();
  console.log(`${parts.length} part number(s) due (mode: ${MODE})`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `count=${parts.length}\n`);
  process.exit(0);
}

// ---------- the check ----------
const parts = await partsToCheck();
if (!parts.length) {
  console.log("Nothing to check.");
  process.exit(0);
}
console.log(`Checking ${parts.length} part number(s), mode: ${MODE}`);

const [run] = await rest("check_runs", { method: "POST", body: { total: parts.length }, prefer: "return=representation" });
const updateRun = (fields) =>
  rest(`check_runs?id=eq.${run.id}`, { method: "PATCH", body: fields }).catch((e) => console.warn("Progress update failed:", e.message));

const { chromium } = await import("playwright");
// Snap-on's store leaves product pages blank in a hidden (headless) browser, so on Windows the checker opens
// a normal, visible Microsoft Edge window. It doesn't disguise itself; it is just an ordinary browser window.
//   CHECKER_BROWSER = msedge | chrome | bundled   (Windows default: msedge)
//   CHECKER_HEADLESS = 1 to hide the window (product pages may come back blank)
const isWindows = process.platform === "win32";
const wanted = process.env.CHECKER_BROWSER || (isWindows ? "msedge" : "bundled");
const headless = process.env.CHECKER_HEADLESS ? process.env.CHECKER_HEADLESS === "1" : !isWindows;
const launchOpts = { headless, args: ["--window-size=1280,900"] };
let browser;
try {
  browser = await chromium.launch(wanted === "bundled" ? launchOpts : { ...launchOpts, channel: wanted });
} catch (e) {
  console.warn(`Couldn't open ${wanted} (${String(e.message).split("\n")[0]}); using the checker's own browser instead.`);
  browser = await chromium.launch(launchOpts);
}
const page = await browser.newPage({ locale: "en-US" });

// A short log saved with the run, so problems can be diagnosed from the database.
const logLines = [];
const note = (line) => { console.log(line); logLines.push(line); };
let apiSeen = [];
page.on("response", (r) => {
  try {
    const u = new URL(r.url());
    if (u.hostname === "shop.snapon.com" && u.pathname.startsWith("/api/")) apiSeen.push(`${r.status()} ${u.pathname}`);
  } catch {}
});

note(`Browser: ${wanted}${headless ? " (hidden)" : " (visible window)"}`);
let changes = 0, found = 0, notFound = 0, errors = 0;

async function readProduct(pn) {
  // The product data feed is used when it has the details; the visible page is the fallback.
  let feed = null;
  const onResponse = async (r) => {
    if (!/\/api\/Product\/\d+\?sku=/i.test(r.url())) return;
    try { const d = await r.json(); if (d && String(d.SKU || "").toUpperCase() === pn) feed = d; } catch {}
  };
  page.on("response", onResponse);
  try {
    await page.goto(`${STORE}/search?q=${encodeURIComponent(pn)}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    // A search for an exact part number opens that product's page.
    const onProduct = await page.waitForURL((u) => u.pathname.includes("/product/"), { timeout: 25000 }).then(() => true).catch(() => false);

    if (!onProduct) {
      // The bot-protection script is on every page, so judge by what the visitor actually sees.
      const seen = await page.evaluate(() => ({
        title: document.title,
        path: location.pathname,
        text: (document.body ? document.body.innerText : "").replace(/\s+/g, " ").trim().slice(0, 300),
      })).catch(() => ({ title: "", path: "", text: "" }));
      note(`${pn}: no product page. Page "${seen.title}" at ${seen.path}. API calls: ${apiSeen.slice(0, 12).join(", ") || "none"}. Text: ${seen.text.slice(0, 160)}`);
      if (/request unsuccessful|incapsula incident|access denied|pardon our interruption|verify you are human|are you a robot/i.test(seen.title + " " + seen.text)) {
        throw new BlockedError(`blocked (${seen.title || "no title"}: ${seen.text.slice(0, 120)})`);
      }
      if (seen.path.includes("/search")) return null; // a search with no single product: not found
      throw new Error(`the page didn't finish loading (${seen.title || seen.path || "blank page"})`);
    }

    const sku = decodeURIComponent(new URL(page.url()).pathname.split("/").pop() || "").toUpperCase();
    if (sku !== pn) { note(`${pn}: the store opened a different product (${sku})`); return null; }

    // Wait for the store's own product data (name, price, photo); the visible page is the backup.
    for (let t = 0; t < 20 && !feed; t++) await page.waitForTimeout(500);

    const anchor = (feed && feed.Description) || "";
    let dom = { name: "", prices: [], image: null };
    for (let t = 0; t < 12; t++) {
      dom = await page.evaluate((anchorText) => {
        const heads = [...document.querySelectorAll("h1")].map((h) => h.textContent.trim()).filter(Boolean);
        const name = anchorText || heads[0] || "";
        const text = document.body.innerText;
        const i = name ? text.indexOf(name) : -1;
        const end = i >= 0 ? text.search(/ADD TO CART/i) : -1;
        const seg = i >= 0 ? text.slice(i, end > i ? end : i + 800) : "";
        const prices = [...seg.matchAll(/\$([\d,]+\.\d{2})/g)].map((m) => Number(m[1].replace(/,/g, "")));
        const im = [...document.querySelectorAll("img")].find((x) => /snap-on-products-hr\.imgix\.net/.test(x.currentSrc || x.src) && x.naturalWidth > 150 && x.naturalWidth <= 800);
        return { name, prices, image: im ? (im.currentSrc || im.src) : null };
      }, anchor);
      if (dom.prices.length || (feed && t > 3)) break;
      await page.waitForTimeout(1000);
    }

    const listed = feed && typeof feed.Price === "number" && feed.Price > 0 ? feed.Price : null;
    const shown = dom.prices.length ? dom.prices[dom.prices.length - 1] : null;
    const price = shown ?? listed;
    if (price == null) {
      const seen = await page.evaluate(() => (document.body ? document.body.innerText : "").replace(/\s+/g, " ").trim().slice(0, 200)).catch(() => "");
      note(`${pn}: no price found. Product data: ${feed ? "yes" : "no"}. API calls: ${apiSeen.slice(-8).join(", ") || "none"}. Text: ${seen.slice(0, 160)}`);
      return null;
    }
    const wasPrice = dom.prices.length >= 2 && dom.prices[0] > price ? dom.prices[0] : null;
    return {
      name: ((feed && feed.Description) || dom.name || "").slice(0, 200) || null,
      price,
      wasPrice,
    };
  } finally {
    page.off("response", onResponse);
  }
}

// First visit: answer the cookie banner with the most private choice, the same as a careful visitor would.
// The store waits for this choice before it runs searches.
async function answerCookieBanner() {
  const reject = page.locator("#onetrust-reject-all-handler, button:has-text('Necessary Cookies Only')").first();
  try {
    await reject.waitFor({ state: "visible", timeout: 12000 });
    await reject.click();
    await page.waitForTimeout(1000);
    note("Cookie banner: chose Necessary Cookies Only");
  } catch {
    note("Cookie banner: none shown");
  }
}

try {
  await page.goto(STORE, { waitUntil: "domcontentloaded", timeout: 45000 });
  await answerCookieBanner();
  for (let k = 0; k < parts.length; k++) {
    const { part_number: pn, last_price } = parts[k];
    await updateRun({ done: k, current: pn });
    apiSeen = [];
    try {
      const p = await readProduct(pn);
      const checked_at = now();
      if (p && typeof p.price === "number") {
        const fields = { name: p.name, price: p.price, was_price: p.wasPrice, status: "ok", checked_at };
        await rest(`catalog?part_number=eq.${encodeURIComponent(pn)}`, { method: "PATCH", body: fields });
        await rest("catalog_prices", { method: "POST", body: { part_number: pn, d: today(), price: p.price }, prefer: "resolution=merge-duplicates" });
        if (last_price != null && Number(last_price) !== p.price) changes++;
        found++;
        console.log(`  ${pn}: $${p.price}${p.wasPrice ? ` (was $${p.wasPrice})` : ""}`);
      } else if (last_price != null) {
        // It had a price before: one failed lookup isn't enough to call it gone. Keep the last good price.
        errors++;
        note(`${pn}: no price this time; keeping the last price ($${last_price})`);
      } else {
        await rest(`catalog?part_number=eq.${encodeURIComponent(pn)}`, { method: "PATCH", body: { status: "not_found", checked_at } });
        notFound++;
        note(`${pn}: not found`);
      }
    } catch (e) {
      if (e instanceof BlockedError) throw e;
      errors++;
      note(`${pn}: error, will retry next time (${String(e.message).slice(0, 200)})`);
    }
    if (k < parts.length - 1) await sleep(PAUSE_MS);
  }

  if (errors && !found && !notFound) throw new Error("No product page gave a price this time. Snap-on's site may be down or not showing prices to the checker.");
  await updateRun({ status: "ok", done: parts.length, current: null, finished_at: now(), changes, log: logLines.join("\n").slice(0, 8000) || null });
  console.log(`Done: ${found} priced, ${notFound} not found, ${errors} errors, ${changes} price changes.`);
} catch (e) {
  const message = e instanceof BlockedError
    ? `Snap-on's site blocked the automatic check. The checker doesn't try to get around that. Details: ${String(e.message).slice(0, 180)}`
    : `The price check stopped: ${String(e.message || e).slice(0, 200)}`;
  await updateRun({ status: "failed", current: null, finished_at: now(), error: message, log: logLines.join("\n").slice(0, 8000) || null });
  console.error(message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
