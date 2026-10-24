// price-now: looks up prices for a tool the moment someone adds it, so the card fills in within seconds
// instead of waiting for the next GitHub run (which GitHub starts every 25 to 45 minutes in practice).
//
// The page calls it right after a signed-in person adds tools (and on load for any of their tools that
// still have no price). For each part number the caller tracks, it:
//   - asks eBay's Browse API when there's no eBay price from the last 3 hours (needs EBAY_CLIENT_ID and
//     EBAY_CLIENT_SECRET), using the same matching as checker/ebay.mjs (ebay-match.mjs is a copy of
//     checker/ebay-match.mjs; checker/ebay-match.test.mjs checks the two stay the same)
//   - asks Gemini with Google Search for Snap-on's list price when there's none yet (needs GEMINI_API_KEY),
//     like checker/list-prices.mjs. Google's search results rarely say which page a price came from, so
//     the answer is kept as Gemini's guess (ai_price), shown as an estimate until the owner confirms it.
//     The owner's own prices are never overwritten.
// Without a key, that half is skipped. Keys are set in Supabase under Edge Functions > Secrets.
//
// Limits, so nobody can run up the bill: 10 part numbers a call, only ones the caller has in their box
// or wishlist, 60 eBay and 30 list-price lookups per person per hour, and 400 list-price lookups in any
// 30 days overall, shared with checker/list-prices.mjs. Each lookup runs a few Google searches, and
// 400 keeps them under Google's 5,000 free searches a month.
import { createClient } from "npm:@supabase/supabase-js@2";
import { pick, altQueries } from "./ebay-match.mjs";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SECRET = (() => { try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default; } catch { return ""; } })() || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EBAY_ID = Deno.env.get("EBAY_CLIENT_ID") || "", EBAY_SECRET = Deno.env.get("EBAY_CLIENT_SECRET") || "";
const GEMINI = Deno.env.get("GEMINI_API_KEY") || "", MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-3.8-flash";
const PN_RE = /^[A-Z0-9][A-Z0-9./-]{0,39}$/;
const EBAY_STALE_MS = 3 * 3600e3, LIST_RETRY_MS = 30 * 864e5, LIST_RECHECK_MS = 182 * 864e5;
const PER_USER_HOUR = { ebay: 60, list: 30 }, LIST_PER_MONTH = 400;

const db = createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const norm = (s: string) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/* ---------- eBay ---------- */
let ebayTok: { v: string; until: number } | null = null;
async function ebayToken() {
  if (ebayTok && ebayTok.until > Date.now()) return ebayTok.v;
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${EBAY_ID}:${EBAY_SECRET}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials&scope=" + encodeURIComponent("https://api.ebay.com/oauth/api_scope"),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`eBay sign-in failed (${res.status})`);
  ebayTok = { v: j.access_token, until: Date.now() + (Number(j.expires_in || 7200) - 300) * 1000 };
  return ebayTok.v;
}
async function ebaySearch(token: string, q: string) {
  const params = new URLSearchParams({ q: `snap-on ${q}`, limit: "100", filter: "priceCurrency:USD" });
  const res = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`, {
    headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`eBay search failed (${res.status})`);
  return j.itemSummaries || [];
}
const rank = (f: { source: string }) => ["exact", "variant", "auction", "similar"].indexOf(f.source);
async function ebayLookup(pn: string, old: Record<string, unknown> | undefined) {
  const token = await ebayToken();
  let items = await ebaySearch(token, pn);
  let found = pick(items, pn);
  if (!found || found.source !== "exact") {
    for (const q of altQueries(pn)) {
      items = items.concat(await ebaySearch(token, q));
      const again = pick(items, pn);
      if (again && (!found || rank(again) < rank(found))) found = again;
      if (found && found.source !== "similar") break;
    }
  }
  const now = new Date().toISOString();
  let row;
  if (found) row = { part_number: pn, ...found, checked_at: now, seen_at: now };
  else if (old && old.median != null) row = { ...old, listings: 0, checked_at: now };
  else row = { part_number: pn, listings: 0, low: null, median: null, new_median: null, used_median: null, source: "exact", note: "", checked_at: now, seen_at: null };
  const { error } = await db.from("ebay_prices").upsert(row, { onConflict: "part_number" });
  if (error) throw error;
  const v = row.median != null ? Number(row.new_median ?? row.median) : null;
  if (found && v != null) {
    // one point per day, only when the price moved 3% or more (same rule as checker/ebay.mjs)
    const today = now.slice(0, 10);
    const { data: last } = await db.from("ebay_price_history").select("price").eq("part_number", pn).lt("d", today).order("d", { ascending: false }).limit(1);
    const prev = last && last[0] ? Number(last[0].price) : null;
    if (prev == null || Math.abs(v - prev) / prev >= 0.03) await db.from("ebay_price_history").upsert({ part_number: pn, d: today, price: v }, { onConflict: "part_number,d" });
  }
  return row;
}

/* ---------- Snap-on list price (Gemini with Google Search) ---------- */
// Gemini 3 only searches through the Interactions API (generateContent quietly skips the search tool).
const ask = (pn: string, again: boolean) => `${again ? "You did not search last time. You must search before answering. " : ""}Use Google Search (no more than 3 searches) to find the current US list price of Snap-on part number ${pn}, as Snap-on sells it new on shop.snapon.com. Do not answer from memory.
Only give a price for exactly this part number, not a similar number, a kit, a used one, eBay or another reseller's own price.
Reply with only this JSON and nothing else:
{"part_number": "${pn}", "price": <number in US dollars, or null if you did not find it>, "name": "<the product name Snap-on uses, or empty>"}`;
type Step = { type?: string; content?: { text?: string; annotations?: { url?: string; title?: string }[] }[] };
async function askGemini(pn: string, again = false): Promise<{ text: string; sources: string[] }> {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "x-goog-api-key": GEMINI, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: ask(pn, again), tools: [{ type: "google_search" }] }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini failed (${res.status})`);
  const steps: Step[] = j.steps || [];
  if (!again && !steps.some((st) => st.type === "google_search_call")) return askGemini(pn, true);
  const blocks = steps.filter((st) => st.type === "model_output").flatMap((st) => st.content || []);
  const sources = blocks.flatMap((c) => c.annotations || []).flatMap((x) => {
    let h = ""; try { h = new URL(x.url || "").hostname; } catch { /* no url */ }
    return [x.title || "", h];
  });
  return { text: blocks.map((c) => c.text || "").join(""), sources };
}
async function listLookup(pn: string, old: Record<string, unknown> | undefined) {
  const { text, sources } = await askGemini(pn);
  const m = text.match(/\{[\s\S]*\}/);
  let a: { part_number?: string; price?: unknown; name?: string } | null = null;
  try { a = m && JSON.parse(m[0]); } catch { /* not JSON */ }
  const snap = sources.find((t) => /(^|\.)snapon\.com$/i.test(t.trim()));
  const price = a ? Number(a.price) : NaN;
  const sane = !!a && norm(a.part_number || "") === norm(pn) && price > 0 && price < 100000;
  const ok = sane && !!snap;
  const now = new Date().toISOString(), cents = Math.round(price * 100) / 100, name = String(a?.name || "").slice(0, 160);
  // a price that can't be traced to snapon.com is kept as Gemini's guess, never as the list price
  const guess = ok ? { ai_price: null, ai_name: null, ai_at: null } : sane ? { ai_price: cents, ai_name: name, ai_at: now } : {};
  if (!ok && old && old.source === "owner") {
    // the owner already marked it "no price found": keep their row, just note the new try (and any guess)
    await db.from("list_prices").update({ checked_at: now, ...guess }).eq("part_number", pn);
    return { ...old, checked_at: now, ...guess };
  }
  const row = { part_number: pn, price: ok ? cents : null, name: ok ? name : "", source: ok ? snap : "", checked_at: now, ...guess };
  const { error } = await db.from("list_prices").upsert(row, { onConflict: "part_number" });
  if (error) throw error;
  return { ...old, ...row };
}

async function used(uid: string | null, kind: string, sinceMs: number) {
  let q = db.from("price_lookups").select("id", { count: "exact", head: true }).eq("kind", kind).gte("at", new Date(Date.now() - sinceMs).toISOString());
  if (uid) q = q.eq("user_id", uid);
  const { count } = await q;
  return count || 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  // who is asking: a signed-in BoxTally user
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: who } = jwt ? await db.auth.getUser(jwt) : { data: null };
  const uid = who?.user?.id;
  if (!uid) return json({ error: "Sign in first." }, 401);

  const body = await req.json().catch(() => ({}));
  const asked = [...new Set((Array.isArray(body.pns) ? body.pns : []).map((p: unknown) => String(p || "").toUpperCase().replace(/\s/g, "")))]
    .filter((p) => PN_RE.test(p as string)).slice(0, 10) as string[];
  if (!asked.length) return json({ ebay: {}, list: {} });

  // only part numbers this person actually tracks
  const { data: mine } = await db.from("items").select("part_number").eq("user_id", uid).in("part_number", asked);
  const pns = [...new Set((mine || []).map((r) => r.part_number as string))];
  if (!pns.length) return json({ ebay: {}, list: {} });

  const [{ data: eRows }, { data: lRows }] = await Promise.all([
    db.from("ebay_prices").select("part_number,listings,low,median,new_median,used_median,checked_at,seen_at,source,note").in("part_number", pns),
    db.from("list_prices").select("part_number,price,name,source,checked_at,ai_price,ai_name").in("part_number", pns),
  ]);
  const eOld = Object.fromEntries((eRows || []).map((r) => [r.part_number, r]));
  const lOld = Object.fromEntries((lRows || []).map((r) => [r.part_number, r]));
  const now = Date.now();
  let ebayDue = EBAY_ID && EBAY_SECRET ? pns.filter((pn) => !eOld[pn] || now - Date.parse(eOld[pn].checked_at) > EBAY_STALE_MS) : [];
  let listDue = GEMINI ? pns.filter((pn) => {
    const o = lOld[pn];
    if (!o) return true;
    if (o.source === "owner" && o.price != null) return false;
    return now - Date.parse(o.checked_at) > (o.price == null ? LIST_RETRY_MS : LIST_RECHECK_MS);
  }) : [];

  // spending limits
  const [eUser, lUser, lMonth] = await Promise.all([
    ebayDue.length ? used(uid, "ebay", 3600e3) : 0,
    listDue.length ? used(uid, "list", 3600e3) : 0,
    listDue.length ? used(null, "list", 30 * 864e5) : 0,
  ]);
  ebayDue = ebayDue.slice(0, Math.max(0, PER_USER_HOUR.ebay - eUser));
  listDue = listDue.slice(0, Math.max(0, Math.min(PER_USER_HOUR.list - lUser, LIST_PER_MONTH - lMonth)));
  const log = [...ebayDue.map((pn) => ({ user_id: uid, part_number: pn, kind: "ebay" })), ...listDue.map((pn) => ({ user_id: uid, part_number: pn, kind: "list" }))];
  if (log.length) await db.from("price_lookups").insert(log);
  // the log only matters for the last 30 days; clear older rows now and then
  if (Math.random() < 0.05) await db.from("price_lookups").delete().lt("at", new Date(now - 31 * 864e5).toISOString());

  const out: { ebay: Record<string, unknown>; list: Record<string, unknown>; errors: string[] } = { ebay: {}, list: {}, errors: [] };
  await Promise.all([
    ...ebayDue.map((pn) => ebayLookup(pn, eOld[pn]).then((r) => { out.ebay[pn] = r; }, (e) => { out.errors.push(`${pn} eBay: ${e.message}`); })),
    ...listDue.map((pn) => listLookup(pn, lOld[pn]).then((r) => { out.list[pn] = r; }, (e) => { out.errors.push(`${pn} list: ${e.message}`); })),
  ]);
  if (out.errors.length) console.error(out.errors.join("; "));
  return json(out);
});
