// Snap-on price checker.
//
// Visits each tracked part number on shop.snapon.com the way a normal visitor would,
// reads the product data the page itself loads, and saves name, price, sale price,
// photo and a daily price history to Supabase.
//
//   node checker/check.mjs --count   prints how many part numbers are due (no browser needed)
//   node checker/check.mjs           runs the check
//
// Environment:
//   SUPABASE_URL          https://<project>.supabase.co
//   SUPABASE_SECRET_KEY   the project's secret key (sb_secret_...), kept in GitHub Actions secrets
//   MODE                  "due" (new or refresh-requested part numbers) or "all" (every tracked part number)

import { appendFileSync } from "node:fs";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SECRET_KEY || "";
const MODE = process.env.MODE === "all" ? "all" : "due";
const STORE = "https://shop.snapon.com";
const PAUSE_MS = 2500; // be polite: one product every few seconds

if (!SUPABASE_URL || !KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY.");
  process.exit(1);
}

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
const browser = await chromium.launch();
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

let changes = 0, found = 0, notFound = 0, errors = 0;

async function readProduct(pn) {
  const productResponse = page
    .waitForResponse((r) => /\/api\/Product\/\d+\?sku=/i.test(r.url()) && r.request().method() === "GET", { timeout: 25000 })
    .catch(() => null);
  await page.goto(`${STORE}/search?q=${encodeURIComponent(pn)}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  const res = await productResponse;

  if (!res) {
    // The bot-protection script is on every page, so judge by what the visitor actually sees.
    const seen = await page.evaluate(() => ({
      title: document.title,
      path: location.pathname,
      text: (document.body ? document.body.innerText : "").replace(/\s+/g, " ").trim().slice(0, 300),
    })).catch(() => ({ title: "", path: "", text: "" }));
    note(`${pn}: no product data. Page "${seen.title}" at ${seen.path}. API calls: ${apiSeen.slice(0, 12).join(", ") || "none"}. Text: ${seen.text.slice(0, 160)}`);
    if (/request unsuccessful|incapsula incident|access denied|pardon our interruption|verify you are human|are you a robot/i.test(seen.title + " " + seen.text)) {
      throw new BlockedError(`blocked (${seen.title || "no title"}: ${seen.text.slice(0, 120)})`);
    }
    if (seen.path.includes("/search")) return null; // a search page with no single product: not found
    throw new Error(`the page didn't finish loading (${seen.title || seen.path || "blank page"})`);
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!data || String(data.SKU || "").toUpperCase() !== pn) return null;

  // The page shows a struck-through regular price next to the sale price when something is on sale.
  let shown = [];
  try {
    await page.waitForSelector("h1", { timeout: 10000 });
    shown = await page.evaluate(() => {
      const name = (document.querySelector("h1") || {}).textContent?.trim() || "";
      const text = document.body.innerText;
      const i = name ? text.indexOf(name) : -1;
      if (i < 0) return [];
      const end = text.indexOf("ADD TO CART", i);
      const seg = text.slice(i, end > 0 ? end : i + 800);
      return [...seg.matchAll(/\$([\d,]+\.\d{2})/g)].map((m) => Number(m[1].replace(/,/g, "")));
    });
  } catch { shown = []; }

  const listed = typeof data.Price === "number" ? data.Price : null;
  const price = shown.length ? shown[shown.length - 1] : listed;
  const wasPrice = shown.length >= 2 && shown[0] > shown[shown.length - 1] ? shown[0] : null;
  return {
    name: String(data.Description || "").slice(0, 200) || null,
    price,
    wasPrice,
    image: typeof data.PrimaryImage === "string" ? data.PrimaryImage : null,
  };
}

async function saveImage(pn, imageUrl) {
  let host;
  try { host = new URL(imageUrl).hostname; } catch { return null; }
  if (!host.endsWith(".imgix.net")) return null;
  const img = await fetch(`${imageUrl.split("?")[0]}?w=480&h=480&fit=max&fm=webp&q=70`);
  if (!img.ok) return null;
  const bytes = Buffer.from(await img.arrayBuffer());
  if (!bytes.length || bytes.length > 1_000_000) return null;
  const path = `${pn.replace(/[^A-Z0-9-]/g, "_")}.webp`;
  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/catalog/${path}`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "image/webp", "x-upsert": "true" },
    body: bytes,
  });
  if (!up.ok) {
    console.warn(`  photo upload failed for ${pn}: ${up.status} ${(await up.text()).slice(0, 200)}`);
    return null;
  }
  return path;
}

try {
  for (let k = 0; k < parts.length; k++) {
    const { part_number: pn, has_image, last_price } = parts[k];
    await updateRun({ done: k, current: pn });
    apiSeen = [];
    try {
      const p = await readProduct(pn);
      const checked_at = now();
      if (p && typeof p.price === "number") {
        const fields = { name: p.name, price: p.price, was_price: p.wasPrice, status: "ok", checked_at };
        if (!has_image && p.image) {
          const path = await saveImage(pn, p.image).catch((e) => { console.warn(`  photo failed for ${pn}: ${e.message}`); return null; });
          if (path) fields.image_path = path;
        }
        await rest(`catalog?part_number=eq.${encodeURIComponent(pn)}`, { method: "PATCH", body: fields });
        await rest("catalog_prices", { method: "POST", body: { part_number: pn, d: today(), price: p.price }, prefer: "resolution=merge-duplicates" });
        if (last_price != null && Number(last_price) !== p.price) changes++;
        found++;
        console.log(`  ${pn}: $${p.price}${p.wasPrice ? ` (was $${p.wasPrice})` : ""}${fields.image_path ? " + photo" : ""}`);
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
