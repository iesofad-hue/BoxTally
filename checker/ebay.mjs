// eBay price checker.
//
// Uses eBay's official Browse API (no scraping) to look up current Buy It Now listings for every
// tracked Snap-on part number, and saves the typical asking price to Supabase (table ebay_prices).
// Runs once a day from .github/workflows/ebay-prices.yml.
//
// Environment:
//   SUPABASE_URL          https://<project>.supabase.co
//   SUPABASE_SECRET_KEY   the project's secret key (sb_secret_...)
//   EBAY_CLIENT_ID        eBay developer App ID (production keyset)
//   EBAY_CLIENT_SECRET    eBay developer Cert ID (production keyset)

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://ctteljhhjsfvyyiwzxiy.supabase.co").replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SECRET_KEY || "";
const ID = process.env.EBAY_CLIENT_ID || "";
const SECRET = process.env.EBAY_CLIENT_SECRET || "";
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith("--")); // optional: check just these part numbers
const DRY = process.argv.includes("--dry-run");

if (!ID || !SECRET) {
  console.log("eBay keys aren't set up yet (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET). Skipping.");
  process.exit(0);
}
if (!KEY && !DRY) {
  console.error("Missing SUPABASE_SECRET_KEY.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rest(path, { method = "GET", body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: KEY, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} failed: ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function ebayToken() {
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${ID}:${SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=" + encodeURIComponent("https://api.ebay.com/oauth/api_scope"),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`eBay sign-in failed (${res.status}): ${JSON.stringify(j).slice(0, 300)}. Check the eBay keys.`);
  return j.access_token;
}

// Listings whose title doesn't mention Snap-on and this exact part number are someone else's tool.
const BAD = /\b(lot of|lot\b|for parts|not working|broken|repair kit|replacement (part|blade|head)|empty (case|box|tray)|case only|box only|decal|sticker|manual)\b/i;
const norm = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
function matches(title, pn) {
  if (!/snap[\s-]?on/i.test(title) || BAD.test(title)) return false;
  // Exact part number as its own word (so "FXM8" doesn't match "FXM810")
  const words = String(title).toUpperCase().split(/[^A-Z0-9./-]+/).map(norm);
  return words.includes(norm(pn));
}

const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 100) / 100;
};
// Drop silly outliers (way under or over the middle) before summarizing
const trim = (a) => {
  const m = median(a);
  return m == null ? a : a.filter((p) => p >= m / 3 && p <= m * 3);
};

async function lookup(token, pn) {
  const params = new URLSearchParams({
    q: `snap-on ${pn}`,
    limit: "100",
    filter: "buyingOptions:{FIXED_PRICE},priceCurrency:USD",
  });
  const res = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`, {
    headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
  });
  if (res.status === 429) throw new Error("eBay daily limit reached");
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`eBay search failed (${res.status}): ${JSON.stringify(j).slice(0, 200)}`);
  const hits = (j.itemSummaries || [])
    .filter((it) => it.price && it.price.currency === "USD" && matches(it.title || "", pn))
    .map((it) => ({ p: Number(it.price.value), used: !/^new/i.test(it.condition || "") }))
    .filter((h) => h.p > 0);
  const all = trim(hits.map((h) => h.p));
  const keep = hits.filter((h) => all.includes(h.p));
  return {
    part_number: pn,
    listings: keep.length,
    low: all.length ? Math.min(...all) : null,
    median: median(all),
    new_median: median(keep.filter((h) => !h.used).map((h) => h.p)),
    used_median: median(keep.filter((h) => h.used).map((h) => h.p)),
    checked_at: new Date().toISOString(),
  };
}

const parts = ONLY.length ? ONLY.map((p) => ({ part_number: p.toUpperCase() })) : await rest("rpc/parts_for_ebay", { method: "POST", body: {} });
console.log(`${parts.length} part number(s) to look up on eBay`);
const token = await ebayToken();
let ok = 0, found = 0, failed = 0;
for (const { part_number: pn } of parts) {
  try {
    const row = await lookup(token, pn);
    console.log(`${pn}: ${row.listings} listing(s)${row.median != null ? `, typical $${row.median}` : ""}`);
    if (!DRY) await rest("ebay_prices?on_conflict=part_number", { method: "POST", body: row, prefer: "resolution=merge-duplicates,return=minimal" });
    ok++;
    if (row.listings) found++;
  } catch (e) {
    console.error(`${pn}: ${e.message}`);
    failed++;
    if (/daily limit/.test(e.message)) break;
  }
  await sleep(300);
}
console.log(`Done: ${ok} checked, ${found} with eBay listings, ${failed} failed.`);
if (failed && !ok) process.exit(1);
