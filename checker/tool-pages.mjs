// Builds one page per Snap-on part number at boxtally.app/t/<PART>/, so people who search a part number
// (for example "Snap-on S80A") can find it: the drawing, what it is, its price today and "Add to my box".
// Also writes /t/ (every tool by kind), /t/tool.css, /t/tool.js and sitemap.xml.
// Run after changing the drawings, app.css's drawing styles or the catalog list:
//   node checker/tool-pages.mjs
// The pages only show shared catalog facts (part number, what it is, Snap-on list and eBay prices),
// never anything about anyone's box.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const write = (p, s) => { const u = new URL(p, root); mkdirSync(new URL(".", u), { recursive: true }); writeFileSync(u, s); };
const SITE = "https://boxtally.app";
const V = 1; // bump when tool.css or tool.js change

// the same drawing code the site uses (app.js), the way part-numbers.test.mjs loads it
const window = {};
new Function("window", read("drawings.js"))(window);
const L = read("app.js").split("\n");
const from = L.findIndex((l) => /^  const ART = window\.BX_ART;/.test(l));
let to = L.findIndex((l, i) => i > from && /^  const artTag = /.test(l));
while (!/^  };$/.test(L[to])) to++;
const helpers = L.slice(0, from).filter((l) => /^  const esc = /.test(l));
const { artOf, artTag } = new Function("state", "storeOf", "window", helpers.join("\n") + "\n" + L.slice(from, to + 1).join("\n") + "\nreturn { artOf, artTag };")({ catalog: {} }, () => null, window);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// the catalog: part number and what Snap-on calls it
const rows = read("checker/catalog-part-numbers.tsv").trim().split("\n").slice(1)
  .map((l) => l.split("\t")).filter(([pn]) => /^[A-Z0-9][A-Z0-9.-]{1,29}$/.test(pn || ""))
  .map(([pn, desc]) => ({ pn, desc: (desc || "").trim() }));
const seen = new Set();
const tools = rows.filter((r) => !seen.has(r.pn) && seen.add(r.pn)).map((r) => {
  const a = artOf({ part_number: r.pn, name: r.desc, category: "" });
  return { ...r, a, kind: a.key === "other" ? "Other tools" : a.label };
}).sort((x, y) => x.pn.localeCompare(y.pn, "en", { numeric: true }));
const byKind = new Map();
for (const t of tools) { if (!byKind.has(t.kind)) byKind.set(t.kind, []); byKind.get(t.kind).push(t); }
const kinds = [...byKind.keys()].sort((a, b) => (a === "Other tools") - (b === "Other tools") || byKind.get(b).length - byKind.get(a).length);
const slug = (k) => k.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// the drawings' styles and shared gradients, copied from the site so the pages match it
const css = read("app.css"), artCss = css.slice(css.indexOf("/* ---------- tool drawings"), css.indexOf("/* ---------- export"));
const html = read("index.html"), defs = html.slice(html.indexOf('<svg id="artDefs"'), html.indexOf("</defs></svg>") + 13);
const beacon = (html.match(/<script defer src="https:\/\/static\.cloudflareinsights\.com[^\n]*<\/script>/) || [""])[0];
const SB_URL = (read("app.js").match(/const SB_URL = "([^"]+)"/) || [])[1], SB_KEY = (read("app.js").match(/const SB_KEY = "([^"]+)"/) || [])[1];

const FONTS = "https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@600;700;800&family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@500;600&display=swap";
const head = ({ title, desc, path, extra = "" }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${path}">
<meta name="theme-color" content="#10151c">
<meta property="og:type" content="website">
<meta property="og:site_name" content="BoxTally">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${SITE}/og-image.png?v=2">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="/t/tool.css?v=${V}">${extra}
</head>
<body>
<header class="bar"><div class="in"><a class="brand" href="/">BOX<b>TALLY</b></a><a class="btn ghost" href="/?sample&amp;ref=tool-page">See a sample box</a></div></header>
`;
const foot = `<footer class="foot"><div class="in">
  <p>BoxTally is a free, independent tracker and is not affiliated with, sponsored by or endorsed by Snap-on Incorporated. Snap-on® is a registered trademark of Snap-on Incorporated. Prices are Snap-on list prices where known and typical eBay asking prices otherwise; check before you buy. Tool drawings are BoxTally's own.</p>
  <p><a href="/">BoxTally</a> · <a href="/t/">All tools</a> · <a href="/privacy.html">Privacy</a> · <a href="mailto:contact@boxtally.app">Contact</a></p>
</div></footer>
<script defer src="/t/tool.js?v=${V}"></script>
${beacon}
</body>
</html>
`;
const facts = (t) => [t.a.drive && `${t.a.drive} drive`, t.a.size && !/^(power|air|cl1)/.test(t.a.key) && t.a.size].filter(Boolean);

function toolPage(t, i, list) {
  const name = t.desc || t.kind, f = facts(t);
  const title = `Snap-on ${t.pn}: ${name} · BoxTally`;
  const desc = `Snap-on ${t.pn}: ${name}${f.length ? ` (${f.join(", ")})` : ""}. See what it's worth today at Snap-on list and eBay prices, and track it in your toolbox free with BoxTally.`;
  // neighbours of the same kind, so every page links to a dozen others
  const same = byKind.get(t.kind), at = same.indexOf(t), near = same.slice(Math.max(0, at - 6), at).concat(same.slice(at + 1, at + 7));
  const q = encodeURIComponent(t.pn);
  return head({ title, desc, path: `/t/${t.pn}/` }) + `<main class="in">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/t/">All tools</a> › <a href="/t/#${slug(t.kind)}">${esc(t.kind)}</a> › <span>${esc(t.pn)}</span></nav>
<article class="tool">
  <div class="stage art-bg">${artTag(t.a, "", { refl: true })}</div>
  <div class="about">
    <p class="pn">${esc(t.pn)}</p>
    <h1>${esc(name)}</h1>
    <p class="kind">Snap-on ${esc(t.kind)}${f.length ? " · " + esc(f.join(" · ")) : ""}</p>
    <div class="prices" id="prices" data-pn="${esc(t.pn)}" aria-live="polite"><p class="muted">Checking today's price…</p></div>
    <div class="ctas"><a class="btn primary" href="/?add=${q}&amp;ref=tool-page">Add to my box</a><a class="btn" href="/?add=${q}&amp;list=wishlist&amp;ref=tool-page">Add to my wishlist</a></div>
    <p class="muted small">Free. No account needed to try it.</p>
  </div>
</article>
<section class="pitch">
  <h2>Know what your box is worth</h2>
  <ul>
    <li><strong>Add tools by part number.</strong> BoxTally draws each one and fills in what it's worth today.</li>
    <li><strong>Keep a wishlist</strong> with how much is left to save, and see when prices drop.</li>
    <li><strong>Track your truck account</strong> and check your insurance covers the whole box.</li>
  </ul>
</section>
${near.length ? `<section class="more"><h2>More like this: ${esc(t.kind)}</h2><ul class="grid">${near.map((n) => `<li><a href="/t/${n.pn}/"><b>${esc(n.pn)}</b><span>${esc(n.desc || n.kind)}</span></a></li>`).join("")}</ul></section>` : ""}
</main>
` + foot;
}

function indexPage() {
  const title = "Every Snap-on part number · BoxTally", desc = `Look up ${tools.length.toLocaleString("en-US")} Snap-on part numbers: what each tool is, its drive and size, and what it's worth today. Track your own box free with BoxTally.`;
  return head({ title, desc, path: "/t/" }) + `<main class="in">
<h1 class="big">Snap-on part numbers</h1>
<p class="lead">${tools.length.toLocaleString("en-US")} tools, grouped by kind. Tap one to see what it is and what it's worth today.</p>
<nav class="kinds" aria-label="Kinds of tools">${kinds.map((k) => `<a href="#${slug(k)}">${esc(k)} <small>${byKind.get(k).length}</small></a>`).join("")}</nav>
${kinds.map((k) => `<section class="kindsec" id="${slug(k)}"><h2>${esc(k)}</h2><ul class="list">${byKind.get(k).map((t) => `<li><a href="/t/${t.pn}/"><b>${esc(t.pn)}</b> ${esc(t.desc)}</a></li>`).join("")}</ul></section>`).join("\n")}
</main>
` + foot;
}

const toolCss = `/* made by checker/tool-pages.mjs: the part-number pages. The drawing styles below the line come from app.css. */
:root { --bg: #eceff3; --surface: #fff; --sunk: #e2e7ed; --line: #d2d9e2; --fg: #121821; --muted: #586473; --accent: #c8171f; --band: #10151c; --band-fg: #eef2f7; --good: #176b42;
  --f-display: "Saira Condensed", "Arial Narrow", sans-serif; --f-body: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif; --f-mono: "IBM Plex Mono", ui-monospace, Consolas, monospace; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root { --bg: #0d1116; --surface: #161c24; --sunk: #1c242e; --line: #2b3542; --fg: #e7ecf2; --muted: #98a4b4; --accent: #ff5a61; --good: #4fd18a; color-scheme: dark; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.55 var(--f-body); }
a { color: inherit; }
.in { max-width: 1040px; margin: 0 auto; padding: 0 16px; }
.bar { background: var(--band); color: var(--band-fg); }
.bar .in { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 60px; }
.brand { font: 800 1.7rem/1 var(--f-display); letter-spacing: .02em; text-decoration: none; color: #fff; }
.brand b { color: #ff4b53; }
.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 18px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--fg); font: 600 .95rem var(--f-body); text-decoration: none; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn.ghost { background: transparent; color: var(--band-fg); border-color: rgb(255 255 255 / .25); min-height: 40px; padding: 0 14px; }
.crumbs { font-size: .85rem; color: var(--muted); margin: 18px 0 12px; overflow-wrap: anywhere; }
.crumbs a { color: var(--muted); }
.tool { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 28px; align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: 20px; }
@media (max-width: 760px) { .tool { grid-template-columns: 1fr; gap: 16px; padding: 14px; } }
.stage { position: relative; aspect-ratio: 16 / 10; border-radius: 14px; overflow: hidden; }
.stage .art { position: absolute; inset: 8% 7% 12%; width: auto; height: auto; }
.stage .art .tool { filter: url(#bx-3d); }
.stage .art svg { filter: drop-shadow(0 8px 8px rgb(16 21 28 / .18)); }
.pn { font: 600 .95rem var(--f-mono); color: var(--accent); margin: 0; letter-spacing: .04em; }
h1 { font: 800 clamp(1.8rem, 5vw, 2.7rem)/1.02 var(--f-display); text-transform: uppercase; margin: 4px 0 6px; overflow-wrap: anywhere; }
h1.big { margin-top: 28px; }
h2 { font: 700 1.35rem/1.15 var(--f-display); text-transform: uppercase; margin: 0 0 10px; }
.kind { color: var(--muted); margin: 0 0 16px; }
.prices { display: grid; gap: 8px; margin: 0 0 16px; }
.price { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 10px 14px; border-radius: 12px; background: var(--sunk); }
.price b { font: 700 1.5rem/1 var(--f-display); }
.price small { color: var(--muted); }
.ctas { display: flex; flex-wrap: wrap; gap: 10px; }
.ctas .btn { flex: 1 1 180px; }
.muted { color: var(--muted); } .small { font-size: .85rem; margin: 10px 0 0; }
.pitch, .more, .kindsec { margin: 28px 0; }
.pitch ul { margin: 0; padding-left: 20px; display: grid; gap: 6px; }
.grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
.grid a { display: grid; gap: 2px; padding: 12px 14px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line); text-decoration: none; min-height: 44px; }
.grid b { font: 600 .9rem var(--f-mono); color: var(--accent); }
.grid span { font-size: .88rem; color: var(--muted); }
.lead { color: var(--muted); margin: 0 0 16px; }
.kinds { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 8px; }
.kinds a { padding: 8px 12px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line); text-decoration: none; font-size: .9rem; }
.kinds small { color: var(--muted); }
.list { list-style: none; margin: 0; padding: 0; columns: 2 320px; column-gap: 24px; }
.list li { break-inside: avoid; padding: 3px 0; font-size: .92rem; }
.list a { text-decoration: none; display: block; padding: 6px 0; }
.list b { font: 600 .88rem var(--f-mono); color: var(--accent); margin-right: 6px; }
.foot { margin-top: 40px; padding: 20px 0 32px; border-top: 1px solid var(--line); color: var(--muted); font-size: .82rem; }
.foot a { color: var(--muted); }
/* ---------- from app.css ---------- */
${artCss}`;

const toolJs = `// made by checker/tool-pages.mjs: the shared drawing colors, and today's price for the tool on this page
(function () {
  var defs = ${JSON.stringify(defs)};
  document.body.insertAdjacentHTML("afterbegin", defs);
  var box = document.getElementById("prices");
  if (!box) return;
  var pn = box.getAttribute("data-pn"), SB = ${JSON.stringify(SB_URL)}, KEY = ${JSON.stringify(SB_KEY)};
  var money = function (n) { return "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: n % 1 ? 2 : 0, minimumFractionDigits: n % 1 ? 2 : 0 }); };
  var get = function (t, cols) { return fetch(SB + "/rest/v1/" + t + "?select=" + cols + "&part_number=eq." + encodeURIComponent(pn), { headers: { apikey: KEY } }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }); };
  Promise.all([get("list_prices", "price,ai_price"), get("ebay_prices", "median,new_median,listings")]).then(function (res) {
    var lp = res[0][0] || {}, eb = res[1][0] || {}, out = "";
    if (lp.price != null) out += '<div class="price"><span>Snap-on list price</span><b>' + money(lp.price) + "</b></div>";
    else if (lp.ai_price != null) out += '<div class="price"><span>Snap-on list price <small>(estimate)</small></span><b>' + money(lp.ai_price) + "</b></div>";
    var e = eb.new_median != null ? eb.new_median : eb.median;
    if (e != null) out += '<div class="price"><span>Typical eBay price' + (eb.listings ? " <small>· " + eb.listings + " listings</small>" : "") + "</span><b>" + money(e) + "</b></div>";
    box.innerHTML = out || '<p class="muted">No price yet. Add it to your box and BoxTally looks one up.</p>';
  });
})();
`;

// write everything (old tool pages are cleared first, so a removed part number doesn't linger)
const tDir = new URL("t/", root);
if (existsSync(tDir)) rmSync(tDir, { recursive: true });
tools.forEach((t, i) => write(`t/${t.pn}/index.html`, toolPage(t, i, tools)));
write("t/index.html", indexPage());
write("t/tool.css", toolCss);
write("t/tool.js", toolJs);
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc></url>
  <url><loc>${SITE}/privacy.html</loc></url>
  <url><loc>${SITE}/t/</loc></url>
${tools.map((t) => `  <url><loc>${SITE}/t/${t.pn}/</loc></url>`).join("\n")}
</urlset>
`);
console.log(`${tools.length} tool pages in ${kinds.length} kinds`);
