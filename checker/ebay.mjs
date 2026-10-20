// eBay price checker.
//
// Uses eBay's official Browse API (no scraping) to look up current listings for tracked Snap-on part
// numbers, and saves the typical asking price to Supabase (table ebay_prices). If the exact part number
// has no Buy It Now listings it tries, in order: the same tool under another color/kit ending, auction
// bids, then an estimate from close sibling part numbers (see ebay-match.mjs). A tool that drops off eBay
// keeps its last price. Each run also writes the day's price to ebay_price_history when it moved 3%+.
//
// Runs every 15 minutes from .github/workflows/ebay-prices.yml. Each run looks up tools that have never
// been checked first (so a newly added tool gets a price at the next run), then anything older than
// STALE_HOURS, oldest first, up to MAX_LOOKUPS. That keeps well under eBay's 5,000 calls a day.
//
// Environment:
//   SUPABASE_URL          https://<project>.supabase.co
//   SUPABASE_SECRET_KEY   the project's secret key (sb_secret_...)
//   EBAY_CLIENT_ID        eBay developer App ID (production keyset)
//   EBAY_CLIENT_SECRET    eBay developer Cert ID (production keyset)
//   STALE_HOURS           optional, how old a price can get before it's looked up again (default 3)
//   MAX_LOOKUPS           optional, most part numbers looked up in one run (default 120)
//
// Run by hand: node checker/ebay.mjs [PART ...] [--dry-run] [--explain]

import { pick, altQueries, exact, variant } from "./ebay-match.mjs";

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://ctteljhhjsfvyyiwzxiy.supabase.co").replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SECRET_KEY || "";
const ID = process.env.EBAY_CLIENT_ID || "";
const SECRET = process.env.EBAY_CLIENT_SECRET || "";
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith("--")); // optional: check just these part numbers
const DRY = process.argv.includes("--dry-run");
const EXPLAIN = process.argv.includes("--explain"); // print every listing title and whether it counted
const STALE_HOURS = Number(process.env.STALE_HOURS || 3);
const MAX_LOOKUPS = Number(process.env.MAX_LOOKUPS || 120);

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

async function search(token, q) {
  const params = new URLSearchParams({ q: `snap-on ${q}`, limit: "100", filter: "priceCurrency:USD" });
  const res = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`, {
    headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
  });
  calls++;
  if (res.status === 429) throw new Error("eBay daily limit reached");
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`eBay search failed (${res.status}): ${JSON.stringify(j).slice(0, 200)}`);
  return j.itemSummaries || [];
}

async function lookup(token, pn) {
  let items = await search(token, pn);
  let found = pick(items, pn);
  // Nothing as Buy It Now under this exact number: try the base number or a 0/O fix before settling
  if (!found || found.source !== "exact") {
    for (const q of altQueries(pn)) {
      items = items.concat(await search(token, q));
      const again = pick(items, pn);
      if (again && (!found || rank(again) < rank(found))) found = again;
      if (found && found.source !== "similar") break;
    }
  }
  if (EXPLAIN) for (const it of items.slice(0, 40)) console.log(`   ${exact(it.title || "", pn) ? "=" : variant(it.title || "", pn) ? "~" : "-"} $${(it.currentBidPrice || it.price || {}).value} [${it.condition}${(it.buyingOptions || []).includes("AUCTION") ? ", auction" : ""}] ${it.title}`);
  return found;
}
const rank = (f) => ["exact", "variant", "auction", "similar"].indexOf(f.source);
const value = (r) => (r && r.median != null ? Number(r.new_median ?? r.median) : null);

const today = new Date().toISOString().slice(0, 10);
async function saveHistory(pn, v) {
  // one point per day, and only when the price moved 3% or more since the last day on record
  const [last] = await rest(`ebay_price_history?part_number=eq.${encodeURIComponent(pn)}&d=lt.${today}&select=d,price&order=d.desc&limit=1`);
  const moved = !last || Math.abs(v - Number(last.price)) / Number(last.price) >= 0.03;
  if (moved) await rest("ebay_price_history?on_conflict=part_number,d", { method: "POST", body: { part_number: pn, d: today, price: v }, prefer: "resolution=merge-duplicates,return=minimal" });
  else await rest(`ebay_price_history?part_number=eq.${encodeURIComponent(pn)}&d=eq.${today}`, { method: "DELETE", prefer: "return=minimal" });
}

let calls = 0;
let parts;
const old = {};
if (ONLY.length) parts = ONLY.map((p) => p.toUpperCase());
else {
  const [tracked, rows] = await Promise.all([
    rest("rpc/parts_for_ebay", { method: "POST", body: {} }),
    rest("ebay_prices?select=part_number,listings,low,median,new_median,used_median,checked_at,seen_at,source,note"),
  ]);
  rows.forEach((r) => (old[r.part_number] = r));
  const cutoff = Date.now() - STALE_HOURS * 3600e3;
  const due = tracked.map((t) => t.part_number).filter((pn) => !old[pn] || Date.parse(old[pn].checked_at) < cutoff);
  // never-checked first, then oldest
  due.sort((a, b) => (old[a] ? Date.parse(old[a].checked_at) : 0) - (old[b] ? Date.parse(old[b].checked_at) : 0));
  parts = due.slice(0, MAX_LOOKUPS);
  console.log(`${tracked.length} tracked part numbers, ${due.length} due (new or older than ${STALE_HOURS}h)`);
}
if (ONLY.length && !DRY) {
  const rows = await rest(`ebay_prices?part_number=in.(${parts.map((p) => `"${p.replace(/"/g, "")}"`).join(",")})&select=part_number,listings,low,median,new_median,used_median,checked_at,seen_at,source,note`);
  rows.forEach((r) => (old[r.part_number] = r));
}
if (!parts.length) { console.log("Nothing to look up right now."); process.exit(0); }
console.log(`${parts.length} part number(s) to look up on eBay`);
const token = await ebayToken();
let ok = 0, priced = 0, failed = 0;
const tally = {};
for (const pn of parts) {
  try {
    const f = await lookup(token, pn);
    const now = new Date().toISOString();
    let row;
    if (f) row = { part_number: pn, ...f, checked_at: now, seen_at: now };
    // Nothing on eBay today: keep the last price we had, marked with when it was last seen
    else if (old[pn] && old[pn].median != null) row = { ...old[pn], listings: 0, checked_at: now };
    else row = { part_number: pn, listings: 0, low: null, median: null, new_median: null, used_median: null, source: "exact", note: "", checked_at: now, seen_at: null };
    const v = value(row);
    const kind = f ? f.source : row.median != null ? "last seen" : "none";
    tally[kind] = (tally[kind] || 0) + 1;
    console.log(`${pn}: ${f ? `${f.source}${f.note ? ` (${f.note})` : ""}, ${f.listings} listing(s), typical $${f.median}` : v != null ? `nothing now, keeping last seen $${v}` : "nothing found"}`);
    if (!DRY) {
      await rest("ebay_prices?on_conflict=part_number", { method: "POST", body: row, prefer: "resolution=merge-duplicates,return=minimal" });
      if (f && v != null) await saveHistory(pn, v);
    }
    ok++;
    if (v != null) priced++;
  } catch (e) {
    console.error(`${pn}: ${e.message}`);
    failed++;
    if (/daily limit/.test(e.message)) break;
  }
  await sleep(250);
}
console.log(`Done: ${ok} checked, ${priced} with a price (${Object.entries(tally).map(([k, n]) => `${n} ${k}`).join(", ")}), ${failed} failed, ${calls} eBay calls.`);
if (failed && !ok) process.exit(1);
