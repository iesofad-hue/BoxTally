// How eBay listings are matched to a Snap-on part number, and how a price is picked from them.
// Kept apart from ebay.mjs so it can be tested without eBay keys: node checker/ebay-match.test.mjs

// Listings that are clearly not the tool itself: lots, junk, accessories sold "for" a tool.
export const BAD = /\b(lot of|lot\b|for parts|not working|broken|repair kit|rebuild|rebuilt|replacement (part|blade|head)|empty (case|box|tray)|(case|box|tray|bag|pouch|holster|sheath) only|decal|sticker|manual|for set|fits|for snap[\s-]?on|compatible)\b/i;
const SNAP = /snap[\s-]?on|blue[\s-]?point/i;

export const norm = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
// Looser form for variants: 0 and O read the same (0FCA1KT = OFCA1KT)
const loose = (s) => norm(s).replace(/O/g, "0");
// The part number without a color or kit ending: CTR881DB -> CTR881, ADWS8O -> ADWS8, 0FCA1KT -> 0FCA1.
// Only letters after the last digit are dropped, and only when at least a digit is left.
export function base(pn) {
  const n = norm(pn);
  const m = n.match(/^(.*\d)([A-Z]{1,4})$/);
  return m && m[1].length >= 3 ? m[1] : n;
}

// Every token in a title that could be a part number (also joins "CTR 881" style splits).
export function tokens(title) {
  const words = String(title).toUpperCase().split(/[^A-Z0-9./-]+/).map(norm).filter(Boolean);
  const out = new Set(words);
  for (let i = 0; i + 1 < words.length; i++) {
    const a = words[i], b = words[i + 1];
    if (/^[A-Z]+$/.test(a) && /^\d/.test(b)) out.add(a + b);
  }
  return [...out];
}

const okTitle = (title, pn) => !BAD.test(title) && (SNAP.test(title) || norm(pn).length >= 6);

// "exact": the title names this exact part number.
export function exact(title, pn) {
  return okTitle(title, pn) && tokens(title).includes(norm(pn));
}
// "variant": the same tool with a different color/kit ending, or a 0/O mix-up (CTR881 vs CTR881DB).
// Returns the part number the listing used, or null.
export function variant(title, pn) {
  if (!okTitle(title, pn)) return null;
  const b = loose(base(pn));
  if (b.length < 4) return null; // too short to guess safely
  return tokens(title).find((t) => loose(base(t)) === b) || null;
}
// "similar": a close sibling in the same family: same letters, same number of digits, only the last digit
// different (CTR868 ~ CTR861/CTR867/CTR869). Returns the sibling's part number, or null.
export function family(pn) {
  const m = norm(base(pn)).match(/^([A-Z]+)(\d{2,})$/);
  return m ? { letters: m[1], stem: m[2].slice(0, -1), digits: m[2].length } : null;
}
export function sibling(title, pn) {
  const f = family(pn);
  if (!f || !SNAP.test(title) || BAD.test(title)) return null;
  for (const t of tokens(title)) {
    const g = family(t);
    if (g && g.letters === f.letters && g.digits === f.digits && g.stem === f.stem && base(t) !== base(pn)) return t;
  }
  return null;
}

export const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 100) / 100;
};
// Drop silly outliers (way under or over the middle) before summarizing
export const trim = (a) => {
  const m = median(a);
  return m == null ? a : a.filter((p) => p >= m / 3 && p <= m * 3);
};

// One eBay item summary -> { p, used, auction, title }
export function hitOf(it) {
  const auction = !(it.buyingOptions || ["FIXED_PRICE"]).includes("FIXED_PRICE");
  const price = auction ? it.currentBidPrice || it.price : it.price;
  if (!price || price.currency !== "USD") return null;
  const p = Number(price.value);
  if (!(p > 0)) return null;
  return { p, used: !/^new/i.test(it.condition || ""), auction, title: it.title || "" };
}

export function summarize(hits) {
  const all = trim(hits.map((h) => h.p));
  const keep = hits.filter((h) => all.includes(h.p));
  return {
    listings: keep.length,
    low: all.length ? Math.min(...all) : null,
    median: median(all),
    new_median: median(keep.filter((h) => !h.used).map((h) => h.p)),
    used_median: median(keep.filter((h) => h.used).map((h) => h.p)),
  };
}

// Pick the best price from every listing found for this part number, in order of trust:
// exact Buy It Now > variant Buy It Now > auctions (exact or variant) > similar tools (3+ listings).
export function pick(items, pn) {
  const hits = items.map((it) => ({ it, h: hitOf(it) })).filter((x) => x.h);
  const seen = new Set();
  const uniq = (xs) => xs.filter(({ it }) => { const k = it.itemId || it.title; if (seen.has(k)) return false; seen.add(k); return true; });
  const ex = uniq(hits.filter(({ it }) => exact(it.title || "", pn)));
  const va = uniq(hits.filter(({ it }) => variant(it.title || "", pn)));
  const bin = (xs) => xs.filter(({ h }) => !h.auction).map(({ h }) => h);
  const auc = (xs) => xs.filter(({ h }) => h.auction).map(({ h }) => h);
  const names = (xs, f) => [...new Set(xs.map(({ it }) => f(it.title || "", pn)).filter((t) => t && t !== true))].slice(0, 5).join(", ");

  if (bin(ex).length) return { source: "exact", note: "", ...summarize(bin(ex)) };
  if (bin(va).length) return { source: "variant", note: names(va.filter(({ h }) => !h.auction), variant), ...summarize(bin(va)) };
  const a = [...auc(ex), ...auc(va)];
  if (a.length) return { source: "auction", note: "", ...summarize(a) };
  const si = uniq(hits.filter(({ it, h }) => !h.auction && sibling(it.title || "", pn)));
  if (si.length >= 3) return { source: "similar", note: names(si, sibling), ...summarize(si.map(({ h }) => h)) };
  return null;
}

// Other searches worth trying when the plain part number finds nothing.
export function altQueries(pn) {
  const n = norm(pn), out = [];
  const b = base(n);
  if (/^0/.test(n)) out.push("O" + n.slice(1)); // 0FCA1KT -> OFCA1KT
  if (b !== n) out.push(b);                     // CTR868GM -> CTR868
  return [...new Set(out)].filter((q) => q !== n).slice(0, 2);
}
