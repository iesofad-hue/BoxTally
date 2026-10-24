// Snap-on list price checker.
//
// Snap-on's store (shop.snapon.com) builds its pages in the browser and blocks automated visitors, and
// Snap-on has no public price API, so the site can't read list prices directly. Google can, though, so
// this asks Gemini with Google Search for each part number's price on Snap-on's own store. An answer is
// kept only when the part number matches and at least one source Google returned is a snapon.com page;
// otherwise price is saved as null ("not found") so the card falls back to eBay.
// Runs every 15 minutes from .github/workflows/list-prices.yml. Most runs find nothing due and stop in a
// second; new tools are looked up first. Prices the owner saved by hand are never overwritten.
//
// Environment:
//   SUPABASE_URL          https://<project>.supabase.co
//   SUPABASE_SECRET_KEY   the project's secret key (sb_secret_...)
//   GEMINI_API_KEY        Google AI Studio key, on a project with billing turned on (search grounding
//                         isn't in Gemini's free tier; the paid tier includes 5,000 searches a month)
//   GEMINI_MODEL          optional, default gemini-3.8-flash
//   RECHECK_DAYS          optional, how old a price can get before it's looked up again (default 182;
//                         Snap-on changes list prices about once or twice a year)
//   MAX_LOOKUPS           optional, most part numbers looked up in one run (default 600; the workflow
//                         runs every 15 minutes with 40, so a new tool gets its price within about 15 minutes)
//
// Cost: only part numbers someone tracks are looked up, each once for everyone, then twice a year.
//
// Run by hand: node checker/list-prices.mjs [PART ...] [--dry-run]

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://ctteljhhjsfvyyiwzxiy.supabase.co").replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SECRET_KEY || "";
const GEMINI = process.env.GEMINI_API_KEY || "";
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const RECHECK_DAYS = Number(process.env.RECHECK_DAYS || 182);
const MAX_LOOKUPS = Number(process.env.MAX_LOOKUPS || 600);
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const DRY = process.argv.includes("--dry-run");
const EXPLAIN = process.argv.includes("--explain"); // print what Gemini answered and which pages it used

if (!GEMINI) {
  console.log("::notice::List prices aren't set up yet (GEMINI_API_KEY secret). Skipping.");
  process.exit(0);
}
if (!KEY && !DRY) {
  console.error("Missing SUPABASE_SECRET_KEY.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

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

const ask = (pn) => `What is the current US list price of Snap-on part number ${pn} on Snap-on's own online store (shop.snapon.com)?
Search for it. Only use a price shown on a snapon.com page for exactly this part number, not a similar number, a kit, a dealer, eBay or another reseller.
Reply with only this JSON and nothing else:
{"part_number": "${pn}", "price": <number in US dollars, or null if you did not find it on snapon.com>, "name": "<the product name Snap-on uses, or empty>"}`;

async function lookup(pn) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": GEMINI, "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: ask(pn) }] }], tools: [{ google_search: {} }] }),
  });
  const j = await res.json().catch(() => ({}));
  if (res.status === 429) throw new Error("Gemini rate limit reached");
  if (!res.ok) throw new Error(`Gemini failed (${res.status}): ${JSON.stringify(j).slice(0, 300)}`);
  const cand = (j.candidates || [])[0] || {};
  const text = (cand.content?.parts || []).map((p) => p.text || "").join("");
  const sources = (cand.groundingMetadata?.groundingChunks || []).map((c) => c.web?.title || "").filter(Boolean);
  if (EXPLAIN) console.log(pn, JSON.stringify({ finish: cand.finishReason, text: text.slice(0, 600), grounding: cand.groundingMetadata, usage: j.usageMetadata }).slice(0, 4000));
  const m = text.match(/\{[\s\S]*\}/);
  let a = null;
  try { a = m && JSON.parse(m[0]); } catch {}
  const snap = sources.find((t) => /(^|\.)snapon\.com$/i.test(t.trim()));
  const price = a && Number(a.price);
  // Trust it only if it's this exact part number, a sane price, and Google showed a snapon.com page
  const ok = a && norm(a.part_number) === norm(pn) && price > 0 && price < 100000 && snap;
  return {
    row: { part_number: pn, price: ok ? Math.round(price * 100) / 100 : null, name: ok ? String(a.name || "").slice(0, 160) : "", source: ok ? snap : "", checked_at: new Date().toISOString() },
    why: ok ? "" : !a ? "no answer" : !snap ? `no snapon.com source (${sources.slice(0, 3).join(", ") || "none"})` : `answer ${JSON.stringify(a).slice(0, 120)}`,
  };
}

let parts, old = {};
if (ONLY.length) parts = ONLY.map((p) => p.toUpperCase());
else {
  const [tracked, rows] = await Promise.all([
    rest("rpc/parts_for_ebay", { method: "POST", body: {} }),
    rest("list_prices?select=part_number,price,checked_at,source"),
  ]);
  old = Object.fromEntries(rows.map((r) => [r.part_number, r]));
  const cutoff = Date.now() - RECHECK_DAYS * 864e5;
  // Not-found answers are retried after 30 days; found prices after RECHECK_DAYS
  const due = tracked.map((t) => t.part_number).filter((pn) => {
    const o = old[pn];
    if (o && o.source === "owner" && o.price != null) return false; // the owner's own prices are never overwritten
    return !o || Date.parse(o.checked_at) < (o.price == null ? Date.now() - 30 * 864e5 : cutoff);
  });
  due.sort((a, b) => (old[a] ? Date.parse(old[a].checked_at) : 0) - (old[b] ? Date.parse(old[b].checked_at) : 0));
  parts = due.slice(0, MAX_LOOKUPS);
  console.log(`${tracked.length} tracked part numbers, ${due.length} due`);
}
if (!parts.length) { console.log("Nothing to look up right now."); process.exit(0); }

let found = 0, missing = 0, failed = 0;
for (const pn of parts) {
  try {
    const { row, why } = await lookup(pn);
    console.log(`${pn}: ${row.price != null ? `$${row.price} (${row.source})${row.name ? ` ${row.name}` : ""}` : `not found: ${why}`}`);
    // the owner already marked it "no price found": keep their row, just note when it was tried again
    const keepOwner = row.price == null && old[pn] && old[pn].source === "owner";
    if (!DRY && keepOwner) await rest(`list_prices?part_number=eq.${encodeURIComponent(pn)}`, { method: "PATCH", body: { checked_at: row.checked_at }, prefer: "return=minimal" });
    else if (!DRY) await rest("list_prices?on_conflict=part_number", { method: "POST", body: row, prefer: "resolution=merge-duplicates,return=minimal" });
    row.price != null ? found++ : missing++;
  } catch (e) {
    console.error(`${pn}: ${e.message}`);
    failed++;
    if (/rate limit/.test(e.message)) break;
  }
  await sleep(1500);
}
console.log(`Done: ${found} found, ${missing} not found, ${failed} failed.`);
if (failed && !found && !missing) process.exit(1);
