// BoxTally app: everything the page does. Loaded by index.html after the database library and drawings.js.
// Starts once the page and the database library are ready (the library loads in the background).
document.addEventListener("DOMContentLoaded", () => {
  /* ---------- settings: the project URL and publishable key are meant to be public ---------- */
  const SB_URL = "https://ctteljhhjsfvyyiwzxiy.supabase.co";
  const SB_KEY = "sb_publishable_y4-sxz8INJZu3fU6xIwWLw_9krKIQJb";
  const sb = window.supabase && window.supabase.createClient ? window.supabase.createClient(SB_URL, SB_KEY) : null;

  const DEPTS = {
    "Hand Tools": ['1/4" Drive Tools', '3/8" Drive Tools', '1/2" Drive Tools', '3/4" & Larger Drive Tools', "Wrenches", "Torque", "Screwdrivers", "Pliers", "Awls, Hooks and Picks", "Prybars", "Punches/Chisels", "Hammers", "Non-Conductive Composite", "General Hand Tools", "Service Tools - Sets"],
    "Power Tools": ["Power Tools"], "Tool Storage": ["Tool Storage"], "Shop & Tech": ["Shop & Tech"], "Diagnostics": ["Diagnostics"], "Other": ["Other"],
  };
  const CATS = Object.values(DEPTS).flat();
  const CONDS = ["New", "Good", "Worn", "Needs warranty"];
  const PRIS = ["Need", "Want", "Someday"];
  const PN_RE = /^[A-Z0-9][A-Z0-9./-]{0,39}$/;
  const FIELDS = ["list", "name", "part_number", "category", "price", "list_price", "date_bought", "condition", "location", "priority", "saved", "notes", "photo_path", "photo_at", "art", "from_wishlist", "lent_to", "lent_at", "qty"];

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n, cents) => (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents || Number(n) % 1 ? 2 : 0 });
  const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + money(Math.abs(n));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const toDate = (d) => { if (!d) return null; if (d.length <= 10) { const [y, m, day] = d.split("-").map(Number); return new Date(y, m - 1, day); } const t = new Date(d); return isNaN(t) ? null : t; };
  const fmtDate = (d, withYear = true) => { const t = toDate(d); return t ? t.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) }) : ""; };
  const rel = (d) => {
    const t = toDate(d); if (!t) return "";
    const a = new Date(t.getFullYear(), t.getMonth(), t.getDate()), n = new Date(), b = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    const days = Math.round((b - a) / 86400000);
    if (days <= 0) { if (d.length > 10) { const mins = Math.round((Date.now() - t) / 60000); if (mins < 1) return "just now"; if (mins < 60) return mins + "m ago"; return Math.round(mins / 60) + "h ago"; } return "today"; }
    if (days === 1) return "yesterday";
    if (days < 7) return days + "d ago";
    return fmtDate(d, t.getFullYear() !== n.getFullYear());
  };
  const ts = (x) => (x ? Date.parse(x) || 0 : 0);
  // put the cursor in a form's first field, except on touch screens where that pops the keyboard over the form
  const deskFocus = (el) => { if (el && !matchMedia("(pointer: coarse)").matches) el.focus(); };
  const deptOf = (cat) => Object.keys(DEPTS).find((d) => DEPTS[d].includes(cat)) || "Other";
  const storeLink = (pn) => "https://shop.snapon.com/search?q=" + encodeURIComponent(pn);
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  const cleanPn = (s) => String(s || "").trim().toUpperCase().replace(/\s+/g, "");

  const state = { admin: false, adminParts: [], tab: "owned", view: "cards", user: null, items: [], catalog: {}, hist: {}, ebay: {}, list: {}, loaded: false, editing: null, confirm: null, lendEdit: null, uploading: {}, introDone: false, closedDrawers: new Set(), demo: false, readonly: false, shareToken: null, shareInfo: null, offline: false };
  const signedIn = () => !!state.user;
  const tabLabel = () => (state.tab === "owned" ? "box" : "wishlist");

  /* ---------- prices from the shared list ---------- */
  const storeOf = (r) => state.catalog[r.part_number] || null;
  // eBay price history: one point per day, only on days the price moved 3% or more
  const hist = (r) => (r.part_number && state.hist[r.part_number]) || [];
  const lastChange = (r) => { const h = hist(r); if (h.length < 2) return null; const a = h[h.length - 2].p, b = h[h.length - 1].p; return b === a ? null : { from: a, to: b, d: h[h.length - 1].d }; };
  const displayName = (r) => r.name || (storeOf(r) && storeOf(r).name) || r.part_number || "Unnamed tool";
  // A tool's price today: the typical eBay asking price for a new one (or across all listings
  // when none are new). Kept fresh every few hours by checker/ebay.mjs. When eBay has nothing right
  // now, the last price it had is kept (shown as "last seen").
  const ebayPrice = (r) => {
    const e = r.part_number && state.ebay && state.ebay[r.part_number];
    if (!e) return null;
    const v = e.new_median ?? e.median;
    return v == null ? null : Number(v);
  };
  // Snap-on's list price: the one you entered on the tool (private to you), else the shared one the
  // owner saved (list_prices; null when none was found)
  const listPrice = (r) => {
    if (Number(r.list_price) > 0) return Number(r.list_price);
    const own = r.part_number && state.list && state.list[r.part_number];
    const l = own && own.price != null ? own : state.list && state.list[colorBase(r.part_number)];
    return l && l.price != null ? Number(l.price) : null;
  };
  // The same tool in another color: Snap-on adds a color letter to the red one's number
  // (PTM18AM is the red pickup; PTM18AMO orange, PTM18AMG green...). Those share the red one's list price.
  const COLOR_BASE = [/^(PTM\d{1,2}AM)[A-Z]{1,2}$/];
  const colorBase = (pn) => { for (const re of COLOR_BASE) { const m = re.exec(pn || ""); if (m) return m[1]; } return null; };
  // A tool's value today: Snap-on's list price (what it costs to replace new), else eBay
  const nowPrice = (r) => listPrice(r) ?? ebayPrice(r);
  // what an owned tool counts for in "Box worth": list price or eBay today, else what you paid
  const worthOf = (r) => nowPrice(r) ?? (Number(r.price) || 0);
  // How many of the same tool are in the box (2 of the same ratchet, say). Prices are for one;
  // the box totals count every one of them. Wishlist tools are always 1.
  const qtyOf = (r) => (r.list === "owned" ? Math.max(1, Math.min(999, Math.floor(Number(r.qty)) || 1)) : 1);
  const worthAll = (r) => worthOf(r) * qtyOf(r);
  const paidAll = (r) => (Number(r.price) || 0) * qtyOf(r);
  const pieces = (rows) => rows.reduce((s, r) => s + qtyOf(r), 0);
  const qtyChip = (r) => (qtyOf(r) > 1 ? `<span class="chip qty" title="${qtyOf(r)} of this tool">${qtyOf(r)}x</span>` : "");
  // a wishlist tool: the price you typed in, else list price, else eBay
  const wishCost = (r) => Number(r.price) || nowPrice(r) || 0;

  /* ---------- photos: your own photo of your own tool, otherwise a drawing ----------
     (Snap-on's product photos aren't shown on this site.) */
  const okData = (u) => typeof u === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(u);
  // Uploaded photos live in a private bucket, so each one is opened with a signed link that expires.
  // Links are kept for a day (in this browser) so the same photo isn't downloaded again on every visit.
  const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  const SIGN_FOR = 24 * 3600;
  const photoLinks = (() => { try { return JSON.parse(localStorage.getItem("bx-signed") || "{}"); } catch { return {}; } })();
  const toSign = new Set();
  let signTimer = null;
  function signedUrl(path) {
    const hit = photoLinks[path];
    if (!hit || hit.exp < Date.now() + 3600e3) queueSign(path);
    return hit && hit.exp > Date.now() ? hit.url : null;
  }
  function queueSign(path) {
    if (!sb || !signedIn()) return;
    toSign.add(path);
    if (!signTimer) signTimer = setTimeout(signNow, 0);
  }
  async function signNow() {
    const paths = [...toSign]; toSign.clear();
    const { data, error } = await sb.storage.from("tool-photos").createSignedUrls(paths, SIGN_FOR).catch((e) => ({ error: e }));
    signTimer = null;
    if (error || !data) return;
    const exp = Date.now() + SIGN_FOR * 1000;
    let got = false;
    for (const d of data) if (d.signedUrl && !d.error) { photoLinks[d.path] = { url: d.signedUrl, exp }; got = true; }
      else if (d.path) photoLinks[d.path] = { url: null, exp }; // no such file (e.g. an old photo with no small copy)
    for (const k of Object.keys(photoLinks)) if (photoLinks[k].exp < Date.now()) delete photoLinks[k];
    try { localStorage.setItem("bx-signed", JSON.stringify(photoLinks)); } catch {}
    if (got) render();
  }
  // Signing out forgets the photo links, so the next person on this browser can't reuse them.
  function forgetSigned() { for (const k of Object.keys(photoLinks)) delete photoLinks[k]; try { localStorage.removeItem("bx-signed"); } catch {} }
  function minePhoto(r) {
    if (r.photo_path && signedIn()) {
      const src = signedUrl(r.photo_path), thumb = state.dbArt ? signedUrl(thumbOf(r.photo_path)) : null;
      // Until its link arrives the photo shows blank for a moment, then the page redraws.
      return src ? { src, thumb, path: r.photo_path, mine: true } : { src: BLANK, path: r.photo_path, mine: true };
    }
    if (okData(r.photo_data)) return { src: r.photo_data, mine: true };
    return null;
  }
  // Photos are private: yours show only on your own cards. Everyone else sees BoxTally's drawing.
  const photoOf = (r) => minePhoto(r);
  const hasMine = (r) => !!minePhoto(r);
  const photoLabel = () => "Your photo";
  const thumbOf = (path) => String(path).replace(/\.jpg$/i, "") + ".t.jpg";
  // Cards load the small copy. A photo from before thumbnails existed shows full size once and gets its small copy made.
  const imgTag = (p, alt, full = false) => !full && p.thumb
    ? `<img class="${p.mine ? "mine" : ""}" src="${esc(p.thumb)}" data-full="${esc(p.src)}" data-path="${esc(p.path)}" onerror="bxThumbMiss(this)" alt="${esc(alt)}" loading="lazy" decoding="async">`
    : `<img class="${p.mine ? "mine" : ""}" src="${esc(p.src)}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
  const thumbsMade = new Set();
  window.bxThumbMiss = (img) => {
    img.onerror = null; img.src = img.dataset.full;
    const path = img.dataset.path;
    if (!path || thumbsMade.has(path) || !signedIn()) return;
    thumbsMade.add(path);
    fetch(img.dataset.full).then((r) => (r.ok ? r.blob() : null)).then((b) => b && makeThumb(b, path)).catch(() => {});
  };
  const ICON = {
    share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5.5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="18.5" r="2.6"/><path d="M8.3 10.8 15.7 6.7M8.3 13.2l7.4 4.1"/></svg>`,
    tool: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M30.5 6.5a9 9 0 0 0-8.3 12.4L7.6 33.5a3.6 3.6 0 0 0 5.1 5.1l14.6-14.6a9 9 0 0 0 12.4-8.3l-5.4 5.4-5.4-1.8-1.8-5.4z"/></svg>`,
    cam: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></svg>`,
    down: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>`,
    up: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>`,
    add: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`,
    star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg>`,
    google: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12S6.8 21.5 12 21.5c5.5 0 9.1-3.9 9.1-9.3 0-.6-.07-1.1-.16-1.6H12z"/></svg>`,
  };
  /* ---------- tool drawings: BoxTally's own illustrations, one per kind of tool (160 × 100) ---------- */
  // the drawings themselves live in drawings.js (loaded first)
  const ART = window.BX_ART;
  // What the tool is called decides the drawing first, then its category, then its part number.
  const ART_WORDS = [
    // Shop tools with a name nothing else should claim. They go first so "drill bits" isn't a drill,
    // "hacksaw" isn't a power saw, "tin snips" aren't pliers and a "brake caliper tool" isn't a caliper.
    [/jack ?stands?/i, "jack-stand"], [/floor jack|service jack|trolley jack|bottle jack/i, "floor-jack"], [/grease gun/i, "grease-gun"],
    [/drain (pan|container)|oil drain(?! plug)/i, "drain-pan"], [/funnel/i, "funnel"], [/blow ?gun|air nozzle|blow nozzle/i, "blowgun"], [/air hose|hose reel|recoil hose/i, "air-hose"],
    [/inflat/i, "tire-inflator"], [/tire (pressure|gauge)|tyre gauge|psi gauge/i, "tire-gauge"], [/tire (plug|repair|reamer)|plugger|valve (core|stem)/i, "tire-plug"],
    [/bench vi[sc]e|\bvi[sc]e\b(?![- ]?grip)/i, "vise"], [/^(?!.*(meter|jump|starter|booster|battery)).*(\bc-? ?clamps?\b|bar clamp|\bclamps?\b(?!.{0,12}plier))/i, "clamp"],
    [/brake caliper|caliper (tool|hanger|press)|(brake|caliper|disc).{0,16}(piston|spread|compress|wind)|piston (tool|compress)|brake (pad )?spreader/i, "brake-tool"],
    [/caliper|vernier/i, "caliper"], [/micrometer/i, "micrometer"], [/feeler|gap (gauge|tool)|gapper/i, "feeler"], [/dial (indicator|test)/i, "dial-indicator"],
    [/compression|fuel pressure|vacuum (gauge|pump|tester)|pressure (tester|test|gauge)|cooling system|coolant (test|pressure)|leak ?down|brake bleed/i, "pressure-gauge"],
    [/thermometer|infrared|temp(erature)? gun|pyrometer/i, "thermometer"], [/stethoscope|chassis ear/i, "stethoscope"],
    [/seal (puller|remov|pick)|cotter (pin )?(puller|remov)/i, "seal-puller"], [/puller|harmonic balancer|gear pull|bearing (separ|split)/i, "puller"],
    [/ball ?joint|pickle ?fork|tie ?rod|pitman|separator/i, "ball-joint"], [/spring compressor|valve spring|strut (spring|compress)|coil spring/i, "spring-compressor"],
    [/\btrim\b|panel (pop|pry|remov|tool)|clip (pliers|remov|tool)|upholstery|fastener remov|push pin/i, "trim-tool"],
    [/(?<!(fluid|oil|vacuum) )extractor|easy ?outs?|bolt[- ]?(out|grip|biter|remov)|screw remov|stud remov|nut (splitter|breaker)/i, "extractor"],
    [/magnetic mat|mag ?mat/i, "magmat"], [/(air|pneumatic) hammer bits?|chisel bits?|hammer bit set/i, "air-bit"], [/disconnect (tool|set|kit)|line disconnect/i, "disconnect-set"],
    [/bit (case|holder case)|storage case|blow ?mold/i, "bit-case"], [/kit bag|tool ?bag|pouch/i, "tool-bag"], [/extension set|extensions? (set|kit)/i, "set-extension"],
    [/hand impact|manual impact|strike (impact|driver)|hammer driver/i, "hand-impact"], [/flash ?light|pen ?light|pocket light/i, "flashlight"],
    [/hack ?saw|jab saw/i, "hacksaw"], [/\bsnips?\b|aviation|tin cutter/i, "snips"], [/bolt cutters?|cable cutters?/i, "bolt-cutter"], [/tub(e|ing) cutter|pipe cutter/i, "tubing-cutter"],
    [/flar(e|ing) tool|flaring|double flare|bubble flare|tub(e|ing) bender|line bender/i, "flaring"], [/\bbrush(es)?\b/i, "wire-brush"],
    [/drill bits?|cobalt bits?|step bits?|twist drills?/i, "drill-bits"],
    [/body (hammer|dolly)|(?<!(wheel|creeper|tire|engine) )\bdolly\b|bumping|planishing/i, "hammer-body"], [/sledge|drilling hammer|club hammer|engineer'?s hammer/i, "hammer-sledge"],
    [/lug wrench|(4-?way|four ?way) (lug|wrench|cross)|cross wrench|tire iron|wheel brace/i, "lug-wrench"], [/(strap|chain) wrench/i, "strap-wrench"], [/pipe wrench|stillson|monkey wrench/i, "pipe-wrench"],
    [/terminal (tool|release|remov|pick)|depin|connector (tool|release)|pin (removal|extract)/i, "terminal-tool"], [/solder/i, "solder"],
    [/socket (rail|tray|organi[sz]er|holder|clip)|rail kit/i, "socket-rail"], [/\bstool\b|shop seat|roller seat|creeper seat|rolling seat/i, "stool"],
    [/(cordless|\d+(\.\d)?\s?v\b).{0,30}screw ?driver|screw ?driver.{0,12}cordless/i, "power"],
    [/\btaps?\b.{0,12}\b(and|&)\b.{0,6}\bdies?\b|tap ?(and|&) ?die|die stock|thread(ing)? (set|kit)/i, "tapdie"],
    [/battery.{0,14}(test|analy)|charging system|starting.{0,10}charging/i, "battery-tester"], [/jump ?(pack|starter|box)|booster pack|jump ?start/i, "jump"],
    [/bore ?scope|inspection camera|video scope|scope camera/i, "borescope"],
    [/insulated|non-?conductive|1000 ?v\b/i, "insulated"], [/^(?!.*impact).*torque/i, "torque"],
    ...[[/wrench|spanner/, "set-wrench"], [/screw ?driver/, "set-screwdriver"], [/plier|cutter/, "set-pliers"], [/\bpick|\bhook/, "set-pick"],
      [/punch|chisel/, "set-punch"], [/\bbits?\b/, "set-bit"], [/ratchet/, "set-kit"], [/socket/, "set"]]
      .map(([tool, key]) => [new RegExp(`(?=.*${tool.source})(?=.*\\b(sets?|kit|\\d+\\s*-?\\s*(pc|pcs|piece)s?)\\b)`, "i"), key]), [/nut ?driver/i, "nutdriver"], [/screw ?driver|bit ?driver|ratchet(ing)? bit|bit ?drive/i, "screwdriver"],
    [/test ?light|circuit tester/i, "testlight"], [/multi ?meter|\bdmm\b|volt ?meter|clamp ?meter/i, "multimeter"], [/pick-?up tool|magnetic pick|telescop/i, "pickup"],
    [/hex keys?|allen|l-?keys?|torx keys?|hex wrench/i, "hexkeys"], [/crow ?foot/i, "crowfoot"],
    [/impact.*socket|socket.*impact/i, "socket"], [/ratchet(ing)?.*wrench|wrench.*ratchet/i, "wrench"],
    [/impact|cordless|drill|grinder|polisher|buffer|sander|cut-?off|rivet|heat gun|pneumatic|air (ratchet|hammer|chisel)|battery|charger|\bsaw\b|reciprocat|sawzall|\d+(\.\d)?\s?v\b/i, "power"],
    [/scan|diagnos|multi ?meter|scope|tablet|verus|zeus|solus|apollo|triton/i, "diag"],
    [/roll ?cab|tool ?(chest|box|cart|storage|bag)|cabinet|drawer|\bcart\b|locker|hutch/i, "storage"],
    [/socket.*\b(sets?|kit)\b|\b(sets?|kit)\b.*socket/i, "set"], [/breaker bar|flex (handle|bar)/i, "breaker"], [/ratchet/i, "ratchet"], [/socket/i, "socket"],
    [/extension|\bext\b|wobble/i, "extension"], [/universal joint|u-?joint/i, "ujoint"], [/adapter|adaptor|reducer/i, "adapter"], [/speed(er)? handle|speeder|spinner handle/i, "speeder"],
    [/wrench|spanner/i, "wrench"],
    [/plier|cutter|crimp|strip|snip|locking|channel ?lock|nipper|\bdikes?\b/i, "pliers"], [/\bpry|crowbar/i, "pry"], [/punch|chisel|drift/i, "punch"],
    [/hammer|mallet/i, "hammer"], [/\bpick|\bhook|\bawl|scribe/i, "pick"], [/light|lamp|creeper|magnet|mirror|inspection|parts tray|\btray\b|\bdish\b/i, "shop"],
    [/tape|knife|scraper|\bfiles?\b|measure|blade/i, "general"], [/\bsets?\b|\bkit\b|\bpc\b|piece/i, "set"],
  ];
  const DRIVE_CATS = ['1/4" Drive Tools', '3/8" Drive Tools', '1/2" Drive Tools', '3/4" & Larger Drive Tools'];
  const ART_CAT = { "Wrenches": "wrench", "Torque": "torque", "Screwdrivers": "screwdriver", "Pliers": "pliers", "Awls, Hooks and Picks": "pick", "Prybars": "pry", "Punches/Chisels": "punch", "Hammers": "hammer", "Non-Conductive Composite": "insulated", "General Hand Tools": "general", "Service Tools - Sets": "set", "Power Tools": "power", "Tool Storage": "storage", "Shop & Tech": "shop", "Diagnostics": "diag" };
  /* ---------- Snap-on part numbers: what tool, which drive, what size ----------
     Read from Snap-on's own catalogs. Letters say the family (OEX combination wrench, SGD soft grip
     screwdriver, PPC punch...). On drive tools T/F/S/L say the drive (1/4", 3/8", 1/2", 3/4") and the
     digits the size: inches in 32nds (F12 = 12/32 = 3/8") or mm (FSM12), sometimes with a trailing
     style digit (FS121 is still 3/8"). Ratchets end in their tooth count instead (F80, TL72, F936).
     The tool's name always wins when there is one; a number we can't read gets a plain drawing
     rather than a wrong tool. */
  const PN_DRIVE = { T: '1/4"', F: '3/8"', S: '1/2"', L: '3/4"' };
  const SAE_MAX = { '1/4"': 20, '3/8"': 32, '1/2"': 48, '3/4"': 80 }; // biggest socket, in 32nds
  const MM_MAX = { '1/4"': 15, '3/8"': 24, '1/2"': 36, '3/4"': 60 };
  // 12 -> 3/8", 34 -> 1-1/16", 2.5 -> 5/64"
  function inch32(n) {
    const w = Math.floor(n / 32); let num = Math.round((n - w * 32) * 2), den = 64;
    if (!num) return w + '"';
    while (num % 2 === 0) { num /= 2; den /= 2; }
    return (w ? w + "-" : "") + num + "/" + den + '"';
  }
  // "12" -> 12, "121"/"120"/"122" -> 12 (style digit), "81" on a 1/4" socket -> 8
  function sizeDigits(d, max) {
    const n = parseFloat(d);
    if (/^\d{3}$/.test(d) && /[012]$/.test(d)) return Math.floor(n / 10);
    if (/^\d{2}$/.test(d) && n > max && /[012]$/.test(d)) return Math.floor(n / 10);
    return n;
  }
  const sockSize = (m, drive) => {
    const d = m.groups.n; if (!d) return "";
    if (m.groups.m) return sizeDigits(d, MM_MAX[drive] || 36) + "mm";
    const n = sizeDigits(d, SAE_MAX[drive] || 48);
    return n >= 3 && n <= (SAE_MAX[drive] || 48) ? inch32(n) : "";
  };
  // wrenches: OEX12B 3/8", OEX080B short 1/4", OEXM150B 15 mm, SOEXM10 10 mm, OXIM55SB 5.5 mm
  const wrenchSize = (m) => {
    const d = m.groups.n, n = d.length === 3 ? Number(d) / 10 : Number(d);
    if (m.groups.m) return (n > 40 ? n / 10 : n) + " mm";
    return n >= 2 && n <= 80 ? inch32(n) : "";
  };
  // pairs on box, open-end and ratcheting box wrenches: XB1214A 3/8 × 7/16, XBM1214A 12 × 14 mm
  function pairOf(d) {
    const s = d.length === 4 ? [d.slice(0, 2), d.slice(2)] : d.length === 3 ? [d.slice(0, 1), d.slice(1)] : d.length === 2 ? [d[0], d[1]] : null;
    return s && +s[0] < +s[1] ? s.map(Number) : null;
  }
  const pairSize = (m) => {
    const p = pairOf(m.groups.n); if (!p) return "";
    return m.groups.m ? `${p[0]} × ${p[1]} mm` : `${inch32(p[0]).replace('"', "")} × ${inch32(p[1]).replace('"', "")}`;
  };
  // Blue-Point writes the fraction out: BLPS14316 is 1/4" drive 3/16", BLPCW58 is 5/8", BLPSB12118 1-1/8"
  function fracDigits(s) {
    if (s === "1") return '1"';
    for (const den of ["64", "32", "16", "8", "4", "2"]) if (s.endsWith(den) && s.length > den.length && +s.slice(0, -den.length) < +den) return s.slice(0, -den.length) + "/" + den + '"';
    if (/^1\d\d/.test(s)) { const f = fracDigits(s.slice(1)); if (f && f !== '1"') return "1-" + f; } // BLPSB12114 = 1-1/4"
    return "";
  }
  const tooth = "72|80|100|720|737|747|830|832|860|870|872|880|936|940|949";
  const RATCHET_PN = new RegExp(`^C?(?<d>[TFSL])(?<mods>[ABCFHKLMNORSXYZ]{0,4})(?<teeth>${tooth})(?!\\d)[A-Z]{0,4}$`);
  // Ratchets: letters between the drive and the tooth count say the shape. L long, F or X flex,
  // K or C stubby, H soft grip (softGrip below); 8xx/7x7 teeth and the TS72/TMR fingertips are round heads.
  function ratchetKind(m) {
    const t = m.groups.mods, round = /^(8[67]\d|7[34]7)$/.test(m.groups.teeth) || /MR|N/.test(t) || (m.groups.d === "T" && t === "S");
    const flex = /[FX]/.test(t), long = /L/.test(t);
    return round ? "ratchet-round" : flex && long ? "ratchet-long-flex" : flex ? "ratchet-flex" : long ? "ratchet-long" : /[KC]/.test(t) ? "ratchet-stubby" : "ratchet";
  }
  // which socket drawing: deep or semi-deep, 12-point, else 6-point
  const sockKind = (deep, twelve) => (deep ? "socket-deep" : twelve ? "socket-12" : "socket");
  const D = (m) => PN_DRIVE[m.groups.d];
  // bit sockets ending E2 sit on the next drive up: TTX25E2 is 3/8" drive, FAM8E2 1/2" (S... stays 1/2")
  const BLP_DR = { 14: '1/4"', 38: '3/8"', 12: '1/2"', 34: '3/4"' };
  const DE = (m) => (/E2A?$/.test(m.input) && m.groups.d !== "S" ? { T: '3/8"', F: '1/2"' }[m.groups.d] : D(m));
  const at = (drive) => () => drive;
  // [pattern, kind (or kind from the match), drive, size, unless]
  const PN_RULES = [
    // sets and kits
    [/^[TFSL][A-Z]*(72|80|720|830|936|880)[A-Z]*(SET|KIT)/, "set-kit", (m) => PN_DRIVE[m.input[0]]],
    [/^[O0]FCA\d/, "filter-wrench"], [/^BLPBTW/, "set-kit", at('1/4"')], [/^BLPBSS\d/, "set", at('1/4"')], [/^LDT\d/, "disconnect-set"], // OFCA1KT spider filter wrench, BLPBSS40 40 pc 1/4" stubby bit socket set, LDT40 master disconnect set
    [/(SET|KIT)\d*[A-Z]?$/, "set", (m) => PN_DRIVE[m.input[0]]],
    // pliers are numbers with letters after: 47ACF slip joint, 96CF needle nose, 87CF diagonal, PL400B a set
    [/^PL\d{3}/, "set-pliers"],
    [/^91ACP$/, "pliers-pump"],
    [/^[A-Z]{0,2}(1?9[2-9]|9\d\d|4[019]\d|597|609)[A-Z]{0,2}(CF|CP|EP)[A-Z]?$/, "pliers-needle"], // 96CF, 911BCP, 411BCP bent, 609ACP duck bill
    [/^[A-Z]{0,2}(8\d{1,2}|3\d\d)[A-Z]{0,2}(CF|CP)[A-Z]?$/, "pliers-diag"],
    [/^[A-Z]{0,2}\d{2,3}[A-Z]{0,3}(CF|CP|LP)[A-Z]?$/, "pliers"],
    [/^LP\d{2}A$/, "set-punch"], [/^LP\d/, "pliers-locking"], [/^AWP/, "pliers-pump"], [/^IEDP\d/, "pliers-pump"], [/^P92\d{3}/, "pliers-needle"], [/^YA824/, "pliers"], [/^SRP/, "pliers-snap"],
    // hammers: HBFE dead blow, HBBD dead blow ball peen, BP ball peen, BC/BD sledge, HBPT/HBR soft face
    [/^(HBFE|HBSE|HBBD|HSSD|HSPD|HSPI|HLE)\d/, "hammer-deadblow"], [/^(HBPT|HBBT|HBR|BF6)\d/, "hammer-mallet"],
    [/^BPN?\d{1,2}[A-Z]?$/, "hammer-ballpeen"], [/^(B[CD]|HD)\d/, "hammer-sledge"], [/^(BH|HBB)\d/, "hammer"],
    // files: 8MA mill, 10R round, 6HR half round; HBF and 5N needle files, SGHF handles
    [/^(\d{1,2}(MA|R|HR|T|CR|FMK)|HBF(?!E)[A-Z0-9]*|SGHBF[A-Z0-9]*|5N[A-Z]{2,3}|SGHF\d{3}[A-Z]*)$/, "file"],
    // socket sets start with the drive and piece count: 211SFSY is 3/8" 11 pieces, 310IMMYA 1/2"
    [/^([1-4])\d{2}(?!CN|ND|SSD)([A-Z]+)$/, (m) => (/^A?(TM|F|S|L)?X[A-Z]?$/.test(m[2]) ? "set-extension" : /TX|AM|LE|FA|TMA|TMP/.test(m[2]) ? "set-bit" : "set"), (m) => ({ 1: '1/4"', 2: '3/8"', 3: '1/2"', 4: '3/4"' })[m[1]]],
    [/^\d{3}C?NDL?M?\d*$/, "nutdriver"], [/^\d{2,3}SSDP$/, "screwdriver-phillips"], [/^\d{2,3}SSD$/, "screwdriver"], // 102NDL10 nut drivers, 30SSD/120SSDP offset screwdrivers
    // wrenches
    [/^(S?OEX[LSR]?S?M?|GOEXM?|OXIR?M?|OSHM?|SOEXRM?|BOER[MFS]*|FHOM|G?VSM?)[5-8]\d\d[A-Z]{0,3}$/, "set-wrench"],
    [/^BLPCWSM?\d{3}$/, "set-wrench"], [/^SRXRM?\d{3}[A-Z]?$/, "set-wrench"], [/^RTBM?\d{3}$/, "set-wrench"], [/^RTB(?<m>M)?(?<n>\d{1,2})$/, "wrench-ratchet", null, wrenchSize], // T-handle ratcheting box
    [/^SRXR(?<m>M)?(?<n>\d{1,2})[A-Z]?$/, "wrench-speed", null, wrenchSize], // SRXRM13: speed open end
    [/^VSM52(?<n>\d{2})B$/, "wrench-open", null, (m) => m.groups.n + " mm"], // four way angle head
    [/^(SOEXR|OEXR|OXIR|BOER)(?<m>M)?[FS]?(?<n>\d{1,3})[A-Z]*$/, "wrench-ratchet", null, wrenchSize],
    [/^(S?OEX[LS]?|GOEX|WOEX|OSH|OXI|FHO)(?<m>M)?(?<n>\d{1,3})[A-Z]*$/, "wrench", null, wrenchSize],
    [/^BLPCW(?<m>M)?(?<n>\d{1,4})$/, "wrench", null, (m) => (m.groups.m ? m.groups.n + " mm" : fracDigits(m.groups.n))],
    [/^(X[A-Z]{0,2}|CXM?|SBXM?|LTAM?|DSM?|VOM?|RB[MYAZ]*|R|RYAM?|BXORM?|CRB)(?<n>\d{3})(?<k>K?[A-Z]?)$/, (m) => (/K/.test(m.groups.k) || !pairOf(m.groups.n) ? "set-wrench" : null)],
    [/^(?:R|RB|RYA|RBZ|BXOR)(?<m>M)?(?<n>\d{2,4})[A-Z]{0,2}$/, "wrench-rbox", null, pairSize], // R810C, RBM78SC, R3640SA: ratcheting box on both ends
    [/^(XID|XB|XS|XSO|XO|XDH|XLE|SBX|LTA|CRB)(?<m>M)?(?<n>\d{2,4})[A-Z]{0,2}$/, "wrench-box", null, pairSize],
    [/^CX(?<m>M)?(?<n>\d{2,4})[A-Z]?$/, "crowfoot", null, pairSize],
    [/^(DS|VO)(?<m>M)?(?<n>\d{2,4})[A-Z]?$/, "wrench-open", null, pairSize],
    [/^G?VS(?<m>M)?(?<n>\d{1,2})[A-Z]?$/, "wrench-open", null, wrenchSize], [/^(COE|ANWR)\d/, "wrench-open"],
    [/^(R?XF|RXH|RXS|SRXF)/, "wrench-flare"], [/^F?AD[HWS]{0,3}\d/, "wrench-adjust"],
    // torque wrenches (ahead of the drive letters: TQFR is a torque wrench, not a 1/4" tool)
    [/^(A?TECH|CTECH)/, "torque"], [/^(QD|QJR|QJFR|QJ|QC|QE|TQ[A-Z]*\d)/, "torque-click"],
    // screwdrivers, nut drivers, hex keys
    [/^(CN)?G?S[GH]D(X|TX|TRX|ET?)L?\d0[A-Z]{0,2}$/, "set-screwdriver"], [/^(CN)?S[GH]DXL?\d/, "set-screwdriver"], // SGDX60BR, SGDTX50BR (SGDTX320BR is one driver)
    [/^(SGDMRC10\d|SGRMINI|SGT(X|RX)L?\d|SDDD\d)/, "set-screwdriver"],
    [/^(IHT|CNSGD|CSSC)/, "insulated"], [/^(C?NDD|NDL)/, "nutdriver"],
    [/^(G?S[GSDH]D|BSGD|SGR|SSDM|SSM?\d[A-Z]?$)/, "screwdriver"], [/^AW(?!P)/, "hexkeys"], // SS5A, SSM3 starters
    // picks, punches, pry bars
    [/^(PSLR\d|YA14[59])-\d$/, "pick"], [/^(SGL?ASA|PSLR|YA14[59])/, "set-pick"], [/^SGSR/, "seal-puller"], [/^(SGL?\d|YA33[89])/, "pick"],
    // punches: PPC8xx/PPC12B cape chisels are chisels; PPC7xxA and ...K are sets
    [/^(PP[A-Z]*\d{2,3}[A-Z]*K|PPC7\d\dA$|PPCSG\d|PPVP|PPSD|PGH\d|DPFT)/, "set-punch"], [/^(PCSG|BPPC\d|PPC(8\d\d|1[2-9]B|40[6-8]B))/, "punch"],
    [/^(PPC|PPR|PPB|PPSG)\d/, "punch-pin"], [/^(YA879|YA900|1210B|1512B|1816B)$/, "punch-pin"],
    [/^(SPBS|PBMP|PBS7|NPB|BLPPB|SAPB)/, "pry"], [/^PSN\d/, "trim-tool"], [/^703\d[A-Z]?$/, "pry"], [/^(6|12|16|20)50$/, "pry"],
    // magnetic pickups and mirrors (PT5C is a pickup; PT850 is an air impact)
    [/^(PTM\d{3}|UIM\d|TKSS\d|CF143|GA29[45]|GA5[123][AB]|US225|YA516)/, "mirror"], [/^(PT|PTM|PHT|PTS|PTIM|UPTM?|DPTM|ECFM)\d{1,2}[A-Z]{0,4}$/, "pickup"],
    [/^(DPTC\d|GA265|GA353|YA837)/, "pickup"], // claw pick-ups
    // knives, scrapers, saws
    [/^(KER\d|CRKBP|LBUK|PK(1\d\d|8\d)|YA40[35]A)/, "knife"], [/^(PK(5\d|500|70)|PKB|PKNC|PKRS|CSA\d|CSB\d|CS\d$|US7\d|MS\d{3,4}$)/, "scraper"],
    [/^HS(G|M|BM)?\d/, "hacksaw"],
    // shop equipment
    [/^JCW/, "creeper"], [/^FJ\d/, "floor-jack"], [/^CGG\d/, "grease-gun"], [/^CGR[RS]\d/, "grinder-die"], [/^(CG|CJ)\d/, "puller"],
    [/^ECHD/, "headlamp"], [/^ECPN/, "flashlight"], [/^EC(?!FM)[A-Z]/, "shop"],
    [/^MAGM/, "magmat"], [/^C0100$/, "tool-bag"], [/^PB\d{3}[A-Z]?$/, "bit-case"], [/^TPGDL/, "tire-inflator"], [/^YA1005/, "extractor"],
    // diagnostics
    [/^EEDM/, "multimeter"], [/^EE(TH|SC)/, "diag-handheld"], [/^(ZEE|EE)/, "diag-tablet"],
    // storage (KER above is a knife)
    [/^KR(SC|BC)/, "storage-cart"], [/^K[A-Z]{1,4}\d/, "storage"],
    // cordless: CT impact, CTR ratchet, CDR drill, CTS screwdriver, CTGR grinder, CTB battery, CTC charger
    [/^CTB\d/, "battery"], [/^CTC\d/, "charger"], [/^CTRS\d/, "cl18-saw"], [/^CTRG\d/, "rivet"], [/^CTR\d/, "power-ratchet", (m) => (/^CTR[78][12]\d(?!\d)/.test(m.input) ? '1/4"' : /^CTR[78]\d\d(?!\d)/.test(m.input) ? '3/8"' : null)],
    [/^C?TGRS\d/, "grinder-die"], [/^CTGR\d/, "grinder-angle"], [/^CTS[RS]?\d/, "power-driver"], [/^CDR[RS]?\d/, "power-drill"],
    [/^CT(BF|PP)\d/, "polisher"], [/^CT(L|FL|LED|LAR|LZ|LUV|LUH|LU)\d/, "shop"], [/^CTG\d/, "thermometer"], [/^CTINF/, "tire-inflator"],
    [/^CT(Q|J)?\d/, "power", (m) => (/^CT825/.test(m.input) ? '1/4"' : /^CT[78]\d\d(?!\d)/.test(m.input) ? '3/8"' : /^CT91\d\d/.test(m.input) ? '3/4"' : /^CT(88|90)\d\d/.test(m.input) ? '1/2"' : null)],
    // air tools (FAR72 is an air ratchet, not a 72-tooth 3/8" ratchet)
    [/^(FAR|PTR)\d/, "air-ratchet"], [/^(IM(3\d|\d{4})[A-Z]?|MG\d{3,4}[A-Z]*|PT\d{3}[A-Z]?)$/, "air-impact"], [/^PH\d{3,4}/, "air-hammer"], [/^PHG?\d{2,4}[A-Z]*$/, "air-bit"], [/^PTGR\d/, "grinder-die"],
    [/^PIT\d/, "hand-impact"],
    // ---- drive tools ----
    // 1" drive: L873 ratchet head, L113H breaker bar, L63 / L853HA1 extensions; IM62B 1" impact extension
    [/^G?L873$/, "ratchet", at('1"')], [/^L113H$/, "breaker", at('1"')], [/^L(63|853HA\d?)$/, "extension", at('1"')],
    [/^IM(62|92|122)B$|^IM132A$/, "extension", at('1"')], [/^(IM72|IP82|IM124B)$/, "ujoint", at('3/4"')], [/^IP80[0D]$/, "ujoint", at('1/2"')],
    [/^L672B$/, "adapter", at('3/4"')], [/^GU8$/, "ujoint", at('1/2"')], [/^TZ\d$/, "extension", at('1/4"')],
    [/^IMXA\d/, "adapter"], [/^IMXL?(?<n>\d{2,3})[A-Z]?$/, "extension", at('1/2"'), (m) => m.groups.n.slice(0, -1) + '"'], // IMX52 = 5", IMXL182 = 18"
    [/^IMSFXL(?<n>\d{2})$/, "extension", at('3/8"'), (m) => m.groups.n + '"'],
    [/^BTW[A-Z]*K$|^BTWSMPK$/, "set-kit"], [/^BTW(R?O)?S$/, "ratchet-stubby", at('1/4"')], [/^PALMRAT$/, "ratchet", at('3/8"')], [/^G?SP936/, "ratchet", at('1/2"')],
    [/^TM6[23][AB]$/, "speeder", at('1/4"')], [/^TMR4$/, "nutdriver"], [/^TMXM\d/, "adapter", at('1/4"')], [/^GAF\d/, "adapter"],
    // special sockets: A17 drag link, BW/DW 3/4" lug, WH weatherhead, PP pipe plug, TTWY twist, B2191 pentagon
    [/^A80A?$/, "extractor"], [/^A(15|17|26|172)A?$/, "socket", at('1/2"')], [/^IM\d{3}[PR]$/, "other"], [/^GLD\d{3}$/, "socket", at('3/4"')],
    [/^(BWDM?|BW|DW)\d{3,4}[A-Z]?$/, "socket", at('3/4"')], [/^(WH\d{3}|TTWY\d{3}A?|B\d{4})$/, "socket", at('1/2"')], [/^PPM?\d{3}A$/, "socket"],
    [/^BPR(?<d>[TFSL])R?\d{3}/, "ratchet", D],
    [RATCHET_PN, ratchetKind, D, null, /^C?[TFSL]M?I?X[A-Z]/],
    [/^(?<d>[TFSL])M?[67]7A?$/, "adapter", D], // TM77, F77, S77A ratchet adaptors
    [/^(?<d>[TFL])R?S70A?$|^TMS70A?$/, "speeder", (m) => ({ T: '1/4"', F: '3/8"', L: '1/2"' })[m.input[0]]], // ratchet spinners (LRS70A is 1/2")
    [/^(?<d>[TFSL])(MS|N)?4[A-Z]{0,2}$/, "speeder", D], // TMS4E, F4LB, S4, SN4B
    [/^(?<d>[TFL])(M5|5L|52B|9TURBO|11TURBO|MRT8)$/, "speeder", D],
    [/^C?(?<d>[TFS])H?BB\d/, "breaker", D], [/^C?(?<d>[TFS])H?N\d{2}[A-Z]?$/, "breaker", D], [/^(?<d>[TFSL])([6-9]|1\d|2\d)L[A-Z]$/, "breaker", D],
    [/^TM10G$/, "breaker", at('1/4"')], [/^L8112A?$/, "breaker", at('3/4"')],
    [/^P?(?<d>[TFS])M?U8[A-Z]?$/, "ujoint", D], [/^S8$/, "ujoint", at('1/2"')], [/^L82A?$/, "ujoint", at('3/4"')], [/^IPM80{1,2}A?$/, "ujoint", at('1/4"')],
    [/^(?<d>[TF])M?X?61A$/, "extension", D],
    [/^C?(?<d>[TFSL])M?I?X(K|W|WK|WP|KL|KV|L|LBP)?(?<n>\d{1,3})[A-Z]?$/, "extension", D, (m) => { const n = +m.groups.n; return n >= 20 && n % 10 === 0 ? n / 10 + '"' : n < 40 ? n + '"' : ""; }],
    [/^GAL?X(?<n>\d{1,2})$/, "extension"], [/^L(?<n>\d{1,2})2$/, "extension", at('3/4"')],
    [/^TA3$/, "adapter", at('1/4"')], [/^(?<d>F)AT\d|^(?<d2>S)AF\d|^(?<d3>L)AS?\d/, "adapter", (m) => PN_DRIVE[m.input[0]]], [/^(?<d>F)SD\d/, "adapter", D],
    [/^(PA\d[A-Z]$|CA\d|A2A$|A3011A$|RWA\d)/, "adapter"],
    // bit sockets: TTX25E/FTX40E Torx, TMA8E/FAM6E hex, TMP22E Phillips, FBS8 bit holder
    [/^P?(?<d>[TFS])TX[BRL]?(?<n>\d{1,2})(TP)?E?\d?$/, "socket-bit", DE, (m) => "T" + +m.groups.n],
    [/^(?<d>[TFS])M?A(?<x>[BDLMXS]*)(?<n>\d{1,2}(\.\d)?)L?[AE]\d?$/, "socket-bit", DE, (m) => (/M/.test(m.groups.x) ? m.groups.n + "mm" : inch32(+m.groups.n))],
    [/^(?<d>[TF])M?[PC]\d{2,3}E\d?$/, "socket-bit", DE], [/^(?<d>[TF])M?U?BSM?\d/, "socket-bit", D],
    [/^(?<d>[FS])TSM(?<n>\d{1,2})L?E2?$/, "socket-bit", D, (m) => m.groups.n + "mm"], // triple square
    [/^SP(DL)?\d{2}E2?$|^SW\d{2}E2?A?$/, "socket-bit", at('1/2"')], [/^LAW\d{3}E2?$/, "socket-bit", at('3/4"')],
    [/^SW4(?<n>[1-3][02468])$/, "socket-12", at('1/2"'), (m) => inch32(+m.groups.n)], // SW412 = 3/8" 12-pt socket driver
    // E-Torx sockets: TLE40A is E4, FLE180A E18, SLE160 E16; STLE deep, TSE/FSE swivel, IMTLE impact
    [/^(?<im>IM)?(?<deep>S)?(?<d>[TFS])(?<u>L|S)E(P|PL)?(?<n>\d{2,3})[A-Z]?$/, (m) => (m.groups.im ? "socket-impact" : m.groups.u === "S" ? "socket-swivel" : m.groups.deep ? "socket-deep" : "socket"), D, (m) => { const n = +m.groups.n; return "E" + (n >= 40 ? n / 10 : n); }],
    [/^S97\d\d/, "socket-spark", at('3/8"')], [/^TM4\d\d$/, "socket", at('1/4"')],
    // impact sockets: IMTM 1/4", IMF 3/8", IM/IMM 1/2" (a trailing 2 is 3/4": IM182A), S... deep, IP swivel
    [/^S?IMT(?<m>M)?M(?<n>\d{1,3}(\.\d)?)[A-Z]?$/, "socket-impact", at('1/4"'), sockSize],
    [/^IPT(M)?(?<m>M)?(?<n>\d{1,2})[A-Z]?$/, "socket-swivel", at('1/4"'), sockSize],
    [/^IMFS(?<n>\d{3})[A-Z]?$/, "socket-impact", at('1/2"'), sockSize], // 1/2" thin wall
    [/^S?IMD?F(?<m>M)?S?(?<n>\d{1,3})[A-Z]?$/, "socket-impact", at('3/8"'), sockSize],
    [/^IP[SL]?F(?<m>M)?(?<n>\d{1,2})[A-Z]?$/, "socket-swivel", at('3/8"'), sockSize],
    [/^S?IP[SD]?L?(?<m>M)?(?<n>\d{1,2})[A-Z]?$/, "socket-swivel", at('1/2"'), sockSize],
    [/^S?IM(?<fd>D|FD)?(?<m>M)?[DLF]?(?<n>\d{2,3})[A-Z]?$/, "socket-impact", (m) => ((/^\d\d2$/.test(m.groups.n) && !/^SIMM/.test(m.input)) || m.groups.fd === "FD" ? '3/4"' : '1/2"'), sockSize],
    // 1/4": TM 6-pt, TMD 12-pt, TMM metric, TMS semi-deep, STM deep, TMU swivel, MGM magnetic
    [/^S?TMU(S)?(?<m>M)?(?<n>\d{1,3}(\.\d)?)[A-Z]?$/, "socket-swivel", at('1/4"'), sockSize],
    [/^T(?<n>\d{1,2})$/, "socket", at('1/4"'), sockSize], // older 1/4" sockets: T8 = 1/4"
    [/^(?<deep>S)?TM(?<m>M)?(?<dd>D)?(?<semi>S)?(?<n>\d{1,3}(\.\d)?)[A-Z]?$/, (m) => sockKind(m.groups.deep || m.groups.semi, m.groups.dd), at('1/4"'), sockSize],
    [/^MGM(?<m>M)?(?<deep>S)?(?<n>\d{1,2}(\.\d)?)[A-Z]?$/, (m) => sockKind(m.groups.deep), at('1/4"'), sockSize],
    // 3/8": F 12-pt, FS 6-pt, FM/FSM metric, SF deep, FMS/FSMS/FDS semi-deep, FU/FSU swivel
    [/^F(S)?U(?<m>M)?(?<n>\d{1,3})[A-Z]?$/, "socket-swivel", at('3/8"'), sockSize],
    [/^(?<deep>S)?F(?<dd>D)?(?<six>S)?(?<m>M)?(?<semi>S)?(?<n>\d{1,3})[A-Z]?$/, (m) => sockKind(m.groups.deep || m.groups.semi || (m.groups.dd && m.groups.six), m.groups.dd || !m.groups.six), at('3/8"'), sockSize],
    // 1/2": TW 6-pt, SW 12-pt, TS 6-pt deep, S 12-pt deep, ...M metric, SU swivel
    [/^SU(?<m>M)?(?<n>\d{1,3})[A-Z]?$/, "socket-swivel", at('1/2"'), sockSize],
    [/^(?:(?<six>T)(?<w>W|S)|S(?<w2>W)?)(?<m>M)?(?<n>\d{1,3})[A-Z]?$/, (m) => sockKind(!(m.groups.w === "W" || m.groups.w2), !m.groups.six), at('1/2"'), sockSize],
    // 3/4": LDH 12-pt, LS deep
    [/^L(?<k>DH|S)(?<m>M)?(?<n>\d{2,3})[A-Z]?$/, (m) => (m.groups.k === "S" ? "socket-deep" : "socket-12"), at('3/4"'), sockSize],
    // Blue-Point sockets: BLPS14316 1/4" drive 3/16", BLPSM1412 12 mm, BLPLS deep
    [/^BLP(?<deep>L)?SB?(?<m>M)?8?(?<dr>14|38|12|34)(?<n>\d{1,4}(\.\d)?)$/, (m) => sockKind(m.groups.deep), (m) => ({ 14: '1/4"', 38: '3/8"', 12: '1/2"', 34: '3/4"' })[m.groups.dr], (m) => (m.groups.m ? m.groups.n + "mm" : fracDigits(m.groups.n))],
    // Blue-Point: the drive is written 14/38/12 and the size spelled out (BLPEXTK126 = 1/2" drive 6", BLPH14316 3/16")
    [/^BLP(GSS|LLEXT|TORX)/, "set"],
    [/^BLPEXT[KLF]?(?<dr>14|38|12)(?<n>\d{1,2})$/, "extension", (m) => BLP_DR[m.groups.dr], (m) => m.groups.n + '"'],
    [/^BLPTXK(?<n>[\d.]+)$/, "extension", at('1/4"')],
    [/^BLPHS?M[O0]?(?<dr>14|38|12)(?<n>\d{1,3})$/, "socket-bit", (m) => BLP_DR[m.groups.dr], (m) => (m.groups.n.length > 1 ? +m.groups.n / 10 : m.groups.n) + "mm"], // BLPHSM1440 = 1/4" drive 4 mm hex
    [/^BLPH(?<dr>14|38|12)(?<n>\d{1,4})$/, "socket-bit", (m) => BLP_DR[m.groups.dr], (m) => fracDigits(m.groups.n)],
    [/^BLPTS?(?<dr>14|38|12)(?<n>\d{1,2})(TP)?$/, "socket-bit", (m) => BLP_DR[m.groups.dr], (m) => "T" + m.groups.n],
    [/^BLPP(?<dr>14|38|12)\d$/, "socket-bit", (m) => BLP_DR[m.groups.dr]],
    [/^BLPUJ(?<dr>14|38|12)$/, "ujoint", (m) => BLP_DR[m.groups.dr]], [/^BLPBB(?<dr>14|38|12)\d+$/, "breaker", (m) => BLP_DR[m.groups.dr]],
    [/^BLP(CGHD|SD)(?<dr>14|38|12)/, "speeder", (m) => BLP_DR[m.groups.dr]],
  ];
  // The best guess for a part number: { key, drive, size } or null. "GF80", "GTW261"... are the
  // industrial-finish versions of F80 and TW261, so a leading G is tried without it too.
  const pnCache = new Map();
  function pnGuess(pn) {
    pn = String(pn || "").toUpperCase().replace(/\s+/g, "");
    if (!pn) return null;
    if (pnCache.has(pn)) return pnCache.get(pn);
    let out = null;
    for (const s of /^G[A-Z]/.test(pn) ? [pn, pn.slice(1)] : [pn]) {
      for (const [re, kind, drive, size, unless] of PN_RULES) {
        const m = s.match(re);
        if (!m || (unless && unless.test(s))) continue;
        const key = typeof kind === "function" ? kind(m) : kind;
        if (!key) continue;
        const dr = (drive && drive(m)) || null;
        out = { key, drive: dr, size: (size && size(m, dr)) || "" };
        break;
      }
      if (out) break;
    }
    pnCache.set(pn, out);
    return out;
  }
  // Then the kind of ratchet, socket, wrench, pliers, pick or screwdriver.
  const VARIANT_WORDS = {
    ratchet: [[/(long|extra).{0,24}flex|flex.{0,24}long/i, "ratchet-long-flex"], [/thumb ?wheel/i, "ratchet-thumbwheel"], [/round[- ]?head|sealed head/i, "ratchet-round"], [/flex/i, "ratchet-flex"], [/stubby|stubbie|short|compact/i, "ratchet-stubby"], [/long|\bxl\b/i, "ratchet-long"]],
    socket: [[/spark ?plug/i, "socket-spark"], [/o2|oxygen sensor|sensor socket/i, "socket-o2"], [/oil filter|filter (cap|socket)/i, "filter-wrench"], [/swivel|universal|u-?joint|wobble/i, "socket-swivel"], [/impact/i, "socket-impact"], [/torx|\bhex\b|allen|\bbit\b|driver socket|triple square|spline/i, "socket-bit"], [/deep/i, "socket-deep"], [/12[- ]?(pt|point)/i, "socket-12"]],
    wrench: [[/oil filter|filter wrench/i, "filter-wrench"], [/adjustable|crescent/i, "wrench-adjust"], [/flare|line wrench|tube nut/i, "wrench-flare"], [/speed open|ratcheting open/i, "wrench-speed"],
      [/ratchet(ing)? box(?!.{0,12}open)|double box.{0,16}ratchet/i, "wrench-rbox"], [/ratchet/i, "wrench-ratchet"], [/combination/i, "wrench"], [/box/i, "wrench-box"], [/open[- ]?end/i, "wrench-open"]],
    pliers: [[/strip/i, "pliers-strip"], [/crimp/i, "pliers-crimp"], [/hose ?clamp/i, "pliers-hose"], [/needle|long ?nose/i, "pliers-needle"], [/diagonal|\bdikes?\b|nipper|side ?cut|flush ?cut|cutter/i, "pliers-diag"], [/locking|vise/i, "pliers-locking"], [/water ?pump|adjustable joint|channel|groove ?joint|tongue/i, "pliers-pump"], [/snap ?ring|retaining ring|circlip/i, "pliers-snap"]],
    power: [[/rivet/i, "rivet"], [/heat gun/i, "heatgun"], [/polisher|buffer|sander/i, "polisher"], [/cut-?off/i, "cutoff"], [/air.{0,16}(hammer|chisel)/i, "air-hammer"], [/air.{0,16}ratchet|pneumatic ratchet/i, "air-ratchet"], [/(cordless|electric|battery|\d+(\.\d)?\s?v\b).{0,24}ratchet|ratchet.{0,12}cordless/i, "power-ratchet"],
      [/\bsaw\b|reciprocat|sawzall/i, "cl18-saw"], [/die grinder|straight grinder/i, "grinder-die"], [/grinder|cut-?off/i, "grinder-angle"], [/impact driver|hex driver|1\/4.{0,6}hex|screw ?driver/i, "power-driver"], [/drill/i, "power-drill"],
      [/air.{0,16}impact|impact.{0,16}air|pneumatic/i, "air-impact"], [/stubby|compact|mini|short/i, "power-stubby"], [/1\/2|3\/4|high.?torque/i, "power-12"], [/charger/i, "charger"], [/battery|\bbatt\b/i, "battery"]],
    storage: [[/cart/i, "storage-cart"], [/roll ?cab/i, "storage"], [/top chest|tool chest|chest/i, "storage-chest"]],
    diag: [[/scope|oscillo|lab/i, "diag"], [/solus|triton|code reader|handheld|obd/i, "diag-handheld"]],
    hammer: [[/dead ?blow/i, "hammer-deadblow"], [/mallet|rubber|soft ?face/i, "hammer-mallet"], [/ball ?pe(e|i)n/i, "hammer-ballpeen"]],
    punch: [[/chisel/i, "punch"], [/punch|drift/i, "punch-pin"]],
    torque: [[/digital|electronic|techangle|tech ?wrench/i, "torque"], [/angle (gauge|meter)/i, "torque-angle"]],
    general: [[/tape|measure/i, "tape"], [/knife|blade|box cutter/i, "knife"], [/scraper/i, "scraper"], [/\bfiles?\b/i, "file"]],
    shop: [[/creeper/i, "creeper"], [/tray|dish|bowl/i, "magtray"], [/mirror/i, "mirror"], [/head ?lamp|head ?light/i, "headlamp"]],
    pick: [[/complex|double|o-?ring/i, "pick-complex"], [/45/, "pick-45"], [/straight/i, "pick-straight"]],
  };
  // A truer label for numbers whose drawing is borrowed from a close cousin (used when the tool has no name).
  const PN_LABEL = [[/^YA824/, "Spark plug boot pliers"], [/^IEDP/, "Electrical disconnect pliers"], [/^YA1005/, "Lug nut removal kit"], [/^SAPB/, "Alignment bar set"],
    [/^PSN\d/, "Non-marring pry set"], [/^SPBSDC/, "Prybar & chisel set"], [/^SPBS\d{3}/, "Pry bar set"], [/^ECPRB/, "Project light"], [/^[O0]FCA/, "Spider filter wrench"], [/^TPGDL/, "Digital inflator gauge"], [/^PTM\d{1,2}[A-Z]/, "Magnetic pickup tool"]];
  const VARIANT_DEFAULT = { diag: "diag-tablet", torque: "torque-click" };
  // Cordless tools get a drawing for their battery platform. The name says it (14.4 V, 18V) or, failing
  // that, the part number: 14.4V tools carry 3-digit 7xx/8xx numbers (CT761, CTR814, CT861, CTR881), 18V tools
  // 88xx/90xx/91xx (CT8850, CT9075, CDR9015), and packs CTB817x (14.4V) or CTB185/CTB818x (18V).
  const CORDLESS = {
    14: { "power-ratchet": "cl14-ratchet", power: "cl14-impact", "power-stubby": "cl14-impact", "power-12": "cl14-impact", "power-driver": "cl14-driver", "power-drill": "cl14-drill", "grinder-die": "cl14-die", battery: "cl14-battery", "cl18-saw": "cl14-saw" },
    18: { "power-ratchet": "cl18-ratchet", power: "cl18-impact", "power-stubby": "cl18-impact", "power-12": "cl18-impact", "power-driver": "cl18-driver", "power-drill": "cl18-drill", battery: "cl18-battery", "grinder-angle": "cl18-grinder", cutoff: "cl18-cutoff" },
  };
  function voltOf(text, pn) {
    if (/\b14\.4\s*-?\s*v(olt)?\b/i.test(text)) return 14;
    if (/\b18\s*-?\s*v(olt)?\b/i.test(text)) return 18;
    if (/^CTB817\d/.test(pn)) return 14;
    if (/^CTB(818\d|18\d)/.test(pn)) return 18;
    if (/^CTB[678]17\d/.test(pn)) return 14;
    if (/^C[A-Z]{0,4}(7\d\d|8\d\d)(?!\d)/.test(pn)) return 14;
    if (/^C[A-Z]{0,4}(88\d\d|9[01]\d\d)(?!\d)/.test(pn)) return 18;
    return null;
  }
  const ART_LABEL = {
    ratchet: "Ratchet", "ratchet-long": "Long-handle ratchet", "ratchet-stubby": "Stubby ratchet", "ratchet-flex": "Flex-head ratchet",
    socket: "6-point socket", "socket-12": "12-point socket", "socket-deep": "Deep socket", "socket-impact": "Impact socket", "socket-swivel": "Swivel socket", "socket-bit": "Bit socket",
    wrench: "Combination wrench", "wrench-ratchet": "Ratcheting wrench", "wrench-flare": "Flare-nut wrench", "wrench-box": "Box-end wrench", "wrench-open": "Open-end wrench", "wrench-adjust": "Adjustable wrench", "wrench-speed": "Speed open-end wrench", "wrench-rbox": "Ratcheting box wrench",
    pliers: "Slip-joint pliers", "pliers-needle": "Needle-nose pliers", "pliers-diag": "Diagonal cutters", "pliers-locking": "Locking pliers", "pliers-pump": "Water-pump pliers", "pliers-snap": "Snap-ring pliers",
    pick: "Hook pick", "pick-straight": "Straight pick", "pick-45": "45° pick", "pick-complex": "Complex pick",
    screwdriver: "Flat screwdriver", "screwdriver-phillips": "Phillips screwdriver", "screwdriver-torx": "Torx screwdriver", "screwdriver-stubby": "Stubby screwdriver", "screwdriver-stubby-phillips": "Stubby Phillips", "screwdriver-ratchet": "Ratcheting screwdriver",
    "ratchet-round": "Round-head ratchet", "ratchet-thumbwheel": "Thumbwheel ratchet", "ratchet-long-flex": "Long flex-head ratchet",
    "ratchet-soft": "Soft-grip ratchet", "ratchet-long-soft": "Long soft-grip ratchet", "ratchet-stubby-soft": "Stubby soft-grip ratchet", "ratchet-flex-soft": "Soft-grip flex ratchet",
    "ratchet-long-flex-soft": "Long soft-grip flex ratchet", "ratchet-round-soft": "Soft-grip round-head ratchet", "ratchet-thumbwheel-soft": "Soft-grip thumbwheel ratchet",
    power: "Cordless impact", "power-stubby": "Stubby impact", "power-12": "High-torque impact", "power-driver": "Impact driver", "power-drill": "Drill/driver", "power-ratchet": "Cordless ratchet",
    "air-impact": "Air impact", "air-ratchet": "Air ratchet", "air-hammer": "Air hammer", "grinder-die": "Die grinder", "grinder-angle": "Angle grinder", battery: "Battery", charger: "Charger",
    extension: "Extension", breaker: "Breaker bar", ujoint: "Universal joint", adapter: "Adapter", speeder: "Speed handle",
    hexkeys: "Hex keys", nutdriver: "Nut driver", crowfoot: "Crowfoot wrench", testlight: "Test light", multimeter: "Multimeter", pickup: "Pickup tool",
    "storage-cart": "Service cart", "storage-chest": "Top chest",
    "set-wrench": "Wrench set", "set-screwdriver": "Screwdriver set", "set-pliers": "Pliers set", "set-pick": "Pick set", "set-punch": "Punch & chisel set", "set-bit": "Bit set", "set-kit": "Ratchet & socket kit",
    "diag-tablet": "Scan tool", "diag-handheld": "Handheld scanner", "battery-tester": "Battery tester", borescope: "Inspection camera", jump: "Jump starter",
    "hammer-ballpeen": "Ball peen hammer", "hammer-deadblow": "Dead blow hammer", "hammer-mallet": "Rubber mallet", "punch-pin": "Punch",
    "socket-spark": "Spark plug socket", "socket-o2": "O2 sensor socket", "filter-wrench": "Oil filter wrench", "torque-click": "Click torque wrench", "torque-angle": "Torque angle gauge",
    "pliers-strip": "Wire strippers", "pliers-crimp": "Crimpers", "pliers-hose": "Hose clamp pliers", tapdie: "Tap & die", file: "File", scraper: "Gasket scraper", tape: "Tape measure", knife: "Utility knife",
    "cl14-ratchet": "14.4V cordless ratchet", "cl14-impact": "14.4V cordless impact", "cl14-driver": "14.4V impact driver", "cl14-drill": "14.4V drill/driver", "cl14-die": "14.4V die grinder", "cl14-battery": "14.4V battery",
    "cl18-impact": "18V cordless impact", "cl18-driver": "18V impact driver", "cl18-drill": "18V drill/driver", "cl18-ratchet": "18V cordless ratchet",
    "cl18-grinder": "18V angle grinder", "cl18-cutoff": "18V cut-off tool", "cl18-saw": "18V reciprocating saw", "cl14-saw": "14.4V reciprocating saw", "cl18-battery": "18V battery",
    "floor-jack": "Floor jack", "jack-stand": "Jack stands", "grease-gun": "Grease gun", "drain-pan": "Oil drain pan", funnel: "Funnel", blowgun: "Blow gun", "air-hose": "Air hose",
    "tire-gauge": "Tire pressure gauge", "tire-inflator": "Tire inflator", "tire-plug": "Tire plug kit", vise: "Bench vise", clamp: "C-clamp",
    caliper: "Digital caliper", micrometer: "Micrometer", feeler: "Feeler gauge", "dial-indicator": "Dial indicator", "pressure-gauge": "Pressure tester", thermometer: "Infrared thermometer", stethoscope: "Mechanic's stethoscope",
    puller: "Gear puller", "seal-puller": "Seal puller", "ball-joint": "Ball joint separator", "brake-tool": "Brake piston tool", "spring-compressor": "Spring compressor", "trim-tool": "Trim tool set",
    extractor: "Bolt extractors", "hand-impact": "Hand impact driver", flashlight: "Flashlight", hacksaw: "Hacksaw", snips: "Aviation snips", "bolt-cutter": "Bolt cutters", "tubing-cutter": "Tubing cutter",
    flaring: "Flaring tool", "wire-brush": "Wire brush", "drill-bits": "Drill bit set", "hammer-body": "Body hammer & dolly", "hammer-sledge": "Sledge hammer",
    "lug-wrench": "Lug wrench", "strap-wrench": "Strap wrench", "pipe-wrench": "Pipe wrench", "terminal-tool": "Terminal tool kit", solder: "Soldering iron", "socket-rail": "Socket rail", stool: "Shop stool",
    creeper: "Creeper", magtray: "Magnetic tray", magmat: "Magnetic mat", "tool-bag": "Kit bag", "bit-case": "Bit case", "air-bit": "Air hammer bits", "set-extension": "Extension set", "disconnect-set": "Disconnect tool set", mirror: "Inspection mirror", headlamp: "Headlamp", polisher: "Polisher", cutoff: "Cut-off tool", rivet: "Rivet gun", heatgun: "Heat gun",
    torque: "Digital torque wrench", insulated: "Insulated screwdriver", pry: "Pry bar", punch: "Chisel", hammer: "Hammer", general: "Hand tool", set: "Socket set", storage: "Roll cab & top chest", shop: "Shop light", diag: "Lab scope", other: "Drawing",
  };
  const DRIVE_KINDS = ["ratchet", "socket", "extension", "breaker", "ujoint", "adapter", "speeder"];
  const firstHit = (list, s) => (list.find(([re]) => re.test(s)) || [])[1];
  function screwdriverKind(text, pn) {
    if (/ratchet|multi.?bit|interchangeable/i.test(text) || /^(S[GSD]DM?R|SGRM|SSDMR)/.test(pn)) return "screwdriver-ratchet";
    const tip = /phillips|\bph\s?\d|#\s?[0-4]\b/i.test(text) || /^(G?S[GSDH]DE?P|BSGDP|IHTP|CNSGDP)/.test(pn) ? "phillips" : /torx|\bt\d{1,2}\b|star/i.test(text) || /^G?S[GH]DE?T|TX/.test(pn) ? "torx" : "flat";
    if (/stubby|stubbie|short/i.test(text)) return tip === "phillips" ? "screwdriver-stubby-phillips" : "screwdriver-stubby";
    return tip === "flat" ? "screwdriver" : "screwdriver-" + tip;
  }
  // Snap-on ratchets have a hard chrome handle unless they're a soft grip model: the name says so, or the
  // part number has an H right after the drive letter (FH80, FHK80, THLF72, SH80A; F80 and FK80 are hard).
  function softGrip(text, pn) {
    if (/soft ?grip|comfort ?grip|cushion|rubber grip|dipped/i.test(text)) return true;
    if (/hard handle|chrome handle|steel handle|knurled/i.test(text)) return false;
    return /^[TFSL]H/.test(pn);
  }
  const CAT_DRIVE = { '1/4" Drive Tools': '1/4"', '3/8" Drive Tools': '3/8"', '1/2" Drive Tools': '1/2"', '3/4" & Larger Drive Tools': '3/4"' };
  const saidDrive = (text) => { const m = String(text || "").match(/\b(1\/4|3\/8|1\/2|3\/4)\s*(?:"|in\b|inch|″)?\s*(?:-\s*)?(?:drive|dr\b)/i); return m ? m[1] + '"' : null; };
  const pnDrive = (pn) => (pnGuess(pn) || {}).drive || null;
  // The family a kind of tool belongs to: socket-deep is a socket, air-impact a power tool.
  const POWER_KINDS = ["air-impact", "air-ratchet", "air-hammer", "air-bit", "grinder-die", "grinder-angle", "battery", "charger", "rivet", "polisher", "cutoff", "heatgun"];
  const familyOf = (k) => (POWER_KINDS.includes(k) || /^(power|cl1)/.test(k) ? "power" : ["knife", "scraper", "file", "tape"].includes(k) ? "general" : ["creeper", "magtray", "magmat", "mirror", "headlamp"].includes(k) ? "shop" : k.split("-")[0]);
  // The drive category a tool belongs in. A hand-picked drive category that the name or part number
  // contradicts (S80A filed under 3/8" Drive Tools) shows, filters and sorts as the right one.
  function catOf(r) {
    const c = r && r.category;
    if (!CAT_DRIVE[c]) return c;
    const d = saidDrive([r.name, storeOf(r) && storeOf(r).name].filter(Boolean).join(" ")) || pnDrive(r.part_number);
    return d && d !== CAT_DRIVE[c] ? Object.keys(CAT_DRIVE).find((k) => CAT_DRIVE[k] === d) : c;
  }
  /* ---------- what's inside a set ----------
     Snap-on set numbers carry the piece count: OEXM710 is 10 metric wrenches, BOERM712 12 ratcheting ones,
     206AFX six 3/8" extensions, 207IPLFM seven 3/8" metric swivel impact sockets. The sizes are the usual run
     for that count, unless the name spells the range out ("10-19 mm"). The result is "member;size,size,...". */
  const RUN = {
    wrenchMM: ["6mm", "7mm", "8mm", "9mm", "10mm", "11mm", "12mm", "13mm", "14mm", "15mm", "16mm", "17mm", "18mm", "19mm", "21mm", "22mm", "24mm"],
    wrenchSAE: ['1/4"', '5/16"', '3/8"', '7/16"', '1/2"', '9/16"', '5/8"', '11/16"', '3/4"', '13/16"', '7/8"', '15/16"', '1"'],
    ext: { '1/4"': [1.5, 2, 3, 4, 6, 10, 14], '3/8"': [1.5, 3, 4, 6, 8, 11, 18, 24], '1/2"': [2, 3, 5, 8, 11, 18, 24], '3/4"': [3, 8, 16] },
    sockMM: { '1/4"': [4, 4.5, 5, 5.5, 6, 7, 8, 9, 10, 11, 12, 13, 14], '3/8"': [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], '1/2"': [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24], '3/4"': [19, 21, 22, 24, 27, 30, 32] },
    sockSAE: { '1/4"': ["3/16", "7/32", "1/4", "9/32", "5/16", "11/32", "3/8", "7/16", "1/2", "9/16"], '3/8"': ["1/4", "5/16", "3/8", "7/16", "1/2", "9/16", "5/8", "11/16", "3/4", "13/16", "7/8"], '1/2"': ["3/8", "7/16", "1/2", "9/16", "5/8", "11/16", "3/4", "13/16", "7/8", "15/16", "1"], '3/4"': ["3/4", "7/8", "15/16", "1", "1-1/16", "1-1/8"] },
  };
  // n pieces of a run, starting at `from` (or ending at the run's end if that's too late); a name's range wins
  function run(list, n, from, range) {
    const v = (x) => (typeof x === "number" ? x : /\//.test(x) ? fracVal(x.replace(/[^\d\/-]/g, "")) : parseFloat(x));
    if (range && range.lo != null) { const inR = list.filter((x) => v(x) >= range.lo - 1e-6 && v(x) <= range.hi + 1e-6); if (inR.length >= 2) return inR; }
    const i = Math.max(0, Math.min(list.indexOf(from) < 0 ? 0 : list.indexOf(from), list.length - n));
    return list.slice(i, i + n);
  }
  function setSpec(kind, pn, text, drive) {
    const range = setRange(text), metric = range ? range.unit === "MM" : null;
    if (kind === "set-wrench") {
      const m = pn.match(/^(?<p>[A-Z]+?)(?<m>M?)(?<f>[5-8])(?<n>\d\d)[A-Z]{0,3}$/);
      const n = m ? +m.groups.n : 7, p = m ? m.groups.p : pn;
      if (!(n >= 2 && n <= 20)) return null;
      // what each wrench in it looks like: "ratchet+rev" for BOERM712, "combo+long" for SOEXLM710B, "speed" for SRXRM710
      const member = wrenchLook(pn.replace(/^G(?=[A-Z])/, ""), false) || "combo";
      const mm = metric ?? !!(m && (m.groups.m || /M[A-Z]?$/.test(p)));
      const sizes = mm ? run(RUN.wrenchMM, n, n >= 10 ? RUN.wrenchMM[Math.max(0, 14 - n)] : "10mm", range) : run(RUN.wrenchSAE, n, n >= 10 ? '1/4"' : '5/16"', range);
      return member + ";" + sizes.join(",");
    }
    if (kind === "set-extension") {
      const m = pn.match(/^[1-4](\d\d)/), n = m ? +m[1] : 3, list = RUN.ext[drive] || RUN.ext['3/8"'];
      return (/W\w*$/.test(pn.slice(3)) ? "wobble" : "extension") + ";" + list.slice(0, Math.min(n, list.length)).map((x) => x + '"').join(",");
    }
    if (kind === "set") {
      const m = pn.match(/^([1-4])(\d\d)(?!CN|ND|SSD)([A-Z]+)$/);
      if (!m || !drive) return null;
      let g = null;
      for (let L = m[3]; L.length && !g; L = L.slice(0, -1)) { const t = pnGuess(L + "12"); if (t && /^socket/.test(t.key) && t.drive === drive) g = t; }
      const member = g ? g.key : "socket", mm = metric ?? (g ? /mm$/.test(g.size) : /M/.test(m[3]));
      const n = Math.min(+m[2], 13);
      const sizes = mm ? run(RUN.sockMM[drive], n, { '1/4"': 5, '3/8"': 10, '1/2"': 10, '3/4"': 19 }[drive], range).map((x) => x + "mm") : run(RUN.sockSAE[drive], n, { '1/4"': "3/16", '3/8"': "5/16", '1/2"': "3/8", '3/4"': "3/4" }[drive], range).map((x) => x + '"');
      return member + ";" + sizes.join(",");
    }
    return null;
  }
  /* ---------- how one tool looks within its kind ----------
     Snap-on families look different inside one kind of tool: SOEXL wrenches are long and slim, OXI midget,
     BOER reversible ratcheting ones carry a switch on the box end, XO box wrenches have a deep 60° offset,
     SRXR a speed open end; FCF72 is a compact flex ratchet, FLLF80 an extra-long one, TNF72 a round swivel
     head; a leading G is the black industrial finish; cordless tools come in colors (CTR868GMDB is gunmetal)
     and with long necks. lookOf() turns the number (and the name) into a few words such as "long", "rev",
     "ind" or "c-gm" that the drawings and the 3D models read. */
  // wrench families, by part number without the industrial G: the base build, then its details
  const WRENCH_LOOK = [
    [/^(R?XF|RXH|RXS|SRXF)/, "flare"], [/^BOERM?F/, "ratchet+rev+flex"], [/^BOERM?S/, "ratchet+rev+short"], [/^(BOER|SOEXR)/, "ratchet+rev"], [/^OXIR/, "ratchet+short"],
    [/^(OEXR|S?OXR|RTB)/, "ratchet"], [/^SRXR/, "speed"], [/^(RYA|BXOR|RBYA)/, "rbox+off25"], [/^(R|RB|RBZ)M?\d+SC?$/, "rbox+short"], [/^(R|RB|RBZ)M?\d/, "rbox"],
    [/^(S?OEX|WOEX)L/, "combo+long"], [/^S?OEXS/, "combo+short"], [/^OXIM?\d+(\.\d)?SB/, "combo+midget+6pt"], [/^OXI/, "combo+midget"], [/^OSH/, "combo+6pt"], [/^FHO/, "combo+flex"],
    [/^XOM?\d/, "box+deep"], [/^XSO?M?\d/, "box+short"], [/^SBX/, "box+s"], [/^LTA/, "box+slim"], [/^(X|CRB)/, "box"],
    [/^VS/, "open+angle"], [/^(DS|VO|COE|ANWR)/, "open"], [/^(S?OEX|WOEX|BLPCW)/, "combo"],
  ];
  // one wrench (not a set): a 3-digit SAE size is the short handle (OEX080B), and so is SOEXM100 next to SOEXM10
  const wrenchLook = (pn, one = true) => (one && /^(S?OEX\d{3}|SOEXM\d{3})(?!\d)/.test(pn) ? "combo+short" : firstHit(WRENCH_LOOK, pn) || "");
  const WRENCH_BASE = { wrench: "combo", "wrench-ratchet": "ratchet", "wrench-speed": "speed", "wrench-rbox": "rbox", "wrench-box": "box", "wrench-open": "open", "wrench-flare": "flare" };
  const WRENCH_WORDS = [[/\blong\b/i, "long"], [/short|stubby/i, "short"], [/midget/i, "midget"], [/6[- ]?(pt|point)/i, "6pt"], [/flex/i, "flex"], [/reversible/i, "rev"], [/deep/i, "deep"], [/s-?shaped/i, "s"], [/slim/i, "slim"], [/angle head|four ?way/i, "angle"]];
  // Snap-on paint codes after the model number: CTR868GMDB gunmetal (DB = tool only), CT861G green, CTR861HV hi-viz
  const PAINT = { GM: "c-gm", G: "c-g", O: "c-o", HV: "c-hv", MB: "c-mb" };
  const PAINT_WORDS = [[/gun ?metal/i, "c-gm"], [/green/i, "c-g"], [/orange/i, "c-o"], [/hi[- ]?vi[sz]|yellow/i, "c-hv"], [/blue/i, "c-mb"]];
  function paintOf(pn, text) {
    const w = firstHit(PAINT_WORDS, text); if (w) return w;
    const m = pn.match(/^C[A-Z]{1,6}\d{3,4}([A-Z]*)$/); if (!m) return null;
    const code = m[1].replace(/(DB|K\d|J\d?|W\d)$/, "").replace(/^A(?=[A-Z])/, "");
    return PAINT[code] || null;
  }
  const GRIP_KINDS = /^(wrench-adjust|pliers|pry|screwdriver|pick|trim-tool|set-pliers|set-screwdriver|set-pick)/;
  function lookOf(kind, pn, text, chosen) {
    const t = [], fam = familyOf(kind), p = pn.replace(/^G(?=[A-Z])/, "");
    // black industrial finish: GOEXM13B, GSL832, GTM830 (the number reads the same without its G)
    if (["ratchet", "socket", "wrench", "breaker", "extension", "ujoint", "adapter", "speeder", "set"].includes(fam)
      && ((/^G[A-Z]/.test(pn) && ((g) => g && familyOf(g.key) === fam)(pnGuess(p))) || /industrial|black (finish|chrome|oxide)/i.test(text))) t.push("ind");
    if (fam === "wrench" && kind !== "wrench-adjust") {
      const [base, ...more] = (chosen ? "" : wrenchLook(p)).split("+");
      if (!base || base === WRENCH_BASE[kind]) t.push(...more);
      for (const [re, w] of WRENCH_WORDS) if (re.test(text) && !t.includes(w)) t.push(w);
    }
    if (fam === "ratchet") {
      const m = chosen ? null : p.match(RATCHET_PN), mods = m ? m.groups.mods : "", round = /round/.test(kind);
      if ((m && m.groups.d === "F" && /C/.test(mods) && m.groups.teeth === "72") || /compact/i.test(text)) t.push("compact");
      if (/LL/.test(mods) || /extra[- ]?long/i.test(text)) t.push("xlong");
      if (/X/.test(mods) || /locking flex/i.test(text)) t.push("lock");
      if (round && (/F/.test(mods) || (m && /^7[34]7$/.test(m.groups.teeth)) || /swivel|flex/i.test(text))) t.push("flex");
      if ((/R/.test(mods) && !/MR/.test(mods)) || /quick[- ]?release/i.test(text)) t.push("qr");
      if ((/[BO]/.test(mods) && /F/.test(mods)) || /bent|offset/i.test(text)) t.push("bent");
    }
    if (fam === "power") {
      const c = paintOf(pn, text); if (c) t.push(c);
      if (/ratchet/.test(kind)) {
        if (/^CTR869/.test(pn) || /extra[- ]?long/i.test(text)) t.push("xneck");
        else if (/^CTR(\d\d7|868)/.test(pn) || /long[- ]?neck|extended/i.test(text)) t.push("neck");
        if (/^CTR881/.test(pn) || /high[- ]?speed/i.test(text)) t.push("fast");
      }
      if (/drill/.test(kind) && (/^CDR(88|90)50/.test(pn) || /hammer/i.test(text))) t.push("hammer");
    }
    // colored grips: ADHW8AO, SRPCR107O and SAPB200O are orange, ...G green
    if (GRIP_KINDS.test(kind)) { const m = pn.match(/\d[A-Z]{0,3}?(O|G)$/), w = firstHit(PAINT_WORDS, text); if (w || m) t.push(w || (m[1] === "O" ? "c-o" : "c-g")); }
    return t;
  }
  // a truer name for the card: "Long combination wrench", "Reversible ratcheting wrench set", "Gunmetal 14.4V long-neck ratchet"
  const LOOK_LABEL = [
    [/^wrench$/, "long", "Long combination wrench"], [/^wrench$/, "midget", "Midget combination wrench"], [/^wrench$/, "short", "Short combination wrench"],
    [/^wrench$/, "flex", "Flex-head combination wrench"], [/^wrench$/, "6pt", "6-point combination wrench"],
    [/^wrench-ratchet$/, "flex", "Flex-head ratcheting wrench"], [/^wrench-ratchet$/, "rev", "Reversible ratcheting wrench"], [/^wrench-rbox$/, "off25", "Offset ratcheting box wrench"],
    [/^wrench-box$/, "deep", "Deep offset box wrench"], [/^wrench-box$/, "s", "S-shaped box wrench"], [/^wrench-box$/, "slim", "Slimline box wrench"], [/^wrench-box$/, "short", "Short box wrench"],
    [/^wrench-open$/, "angle", "Angle-head open-end wrench"],
    [/^ratchet/, "compact", "Compact flex-head ratchet", "Compact ratchet"], [/^ratchet/, "xlong", "Extra-long flex-head ratchet", "Extra-long ratchet"], [/^ratchet/, "lock", "Locking flex-head ratchet"],
    [/^ratchet-round/, "flex", "Round swivel-head ratchet"], [/^ratchet/, "bent", "Bent-handle flex ratchet"], [/^ratchet/, "qr", null, "Quick-release ratchet"],
    [/^cl1\d-ratchet$/, "xneck", (v) => v + "V extra-long ratchet"], [/^cl1\d-ratchet$/, "neck", (v) => v + "V long-neck ratchet"], [/^cl1\d-ratchet$/, "fast", (v) => v + "V high-speed ratchet"],
    [/drill$/, "hammer", (v) => (v ? v + "V hammer drill" : "Hammer drill")],
  ];
  const SET_LABEL = { rev: "Reversible ratcheting wrench set", ratchet: "Ratcheting wrench set", long: "Long wrench set", short: "Short wrench set", midget: "Midget wrench set", speed: "Speed wrench set", rbox: "Ratcheting box wrench set", deep: "Deep offset wrench set", box: "Box-end wrench set", open: "Open-end wrench set", flare: "Flare-nut wrench set", flex: "Flex-head wrench set" };
  const PAINT_NAME = { "c-gm": "Gunmetal", "c-g": "Green", "c-o": "Orange", "c-hv": "Hi-viz", "c-mb": "Blue" };
  function lookLabel(kind, look, label, spec) {
    let out = label;
    if (kind === "set-wrench" && spec) { const ws = spec.split(";")[0].split("+"); out = SET_LABEL[["rev", "long", "short", "midget", "deep", "flex"].find((w) => ws.includes(w))] || SET_LABEL[ws[0]] || label; }
    for (const [re, w, flex, plain] of LOOK_LABEL) {
      if (!re.test(kind) || !look.includes(w)) continue;
      const v = (kind.match(/^cl(1\d)/) || [])[1] === "14" ? "14.4" : (kind.match(/^cl(1\d)/) || [])[1] || "";
      const pick = /flex/.test(kind) || w === "flex" || w === "lock" || w === "bent" ? flex : plain || flex;
      if (pick) { out = typeof pick === "function" ? pick(v) : pick; break; }
    }
    if (look.includes("ind")) out = "Industrial " + out.charAt(0).toLowerCase() + out.slice(1);
    const c = look.find((w) => PAINT_NAME[w]);
    if (c && familyOf(kind) === "power") out = PAINT_NAME[c] + " " + out;
    return out;
  }
  // cordless ratchets and impacts carry their drive in the number (CTR827 is 1/4", CT861 3/8")
  const CORDLESS_DRIVE = /^(cl1[48]-(ratchet|impact)|power(-ratchet|-12|-stubby)?)$/;
  function artOf(r) {
    const chosen = r.art === "ratchet-hard" ? "ratchet" : r.art && ART[r.art] ? r.art : null;
    const text = [r.name, storeOf(r) && storeOf(r).name].filter(Boolean).join(" ");
    const pn = String(r.part_number || "").toUpperCase();
    const g = pnGuess(pn);
    // The name decides first, then a category the owner picked. The drive categories don't count here: the
    // add form starts on 3/8" Drive Tools, so the part number knows better (OEX18 is a wrench either way).
    const key = firstHit(ART_WORDS, text) || ART_CAT[r.category];
    let kind;
    if (key === "screwdriver" || (!key && g && g.key === "screwdriver")) kind = screwdriverKind(text, pn);
    else if (key) kind = (VARIANT_WORDS[key] && firstHit(VARIANT_WORDS[key], text)) || (g && familyOf(g.key) === key && g.key) || VARIANT_DEFAULT[key] || key;
    else kind = g ? g.key : DRIVE_CATS.includes(r.category) ? "ratchet" : "other";
    { const v = voltOf(text, pn); if (v && CORDLESS[v][kind]) kind = CORDLESS[v][kind]; }
    if (/^ratchet/.test(kind) && softGrip(text, pn) && ART[kind + "-soft"]) kind += "-soft";
    if (chosen) kind = chosen;
    // Drive size: what the name says, then the part number's drive letter, then the category. The part number
    // beats the category because the add form starts on 3/8" Drive Tools, so an S80A saved without changing
    // it would otherwise read as 3/8".
    const drive = saidDrive(text) || ((DRIVE_KINDS.includes(familyOf(kind)) || /^set/.test(kind) || CORDLESS_DRIVE.test(kind)) && g && g.drive) || CAT_DRIVE[r.category] || null;
    const spec = ["set", "set-wrench", "set-extension"].includes(kind) ? setSpec(kind, pn, text, drive) : null;
    // a set with no range in its name shows what its part number says: "12 pc · 8mm–19mm"
    const z = spec && spec.split(";")[1].split(","), size = sizeOf(kind, text, pn, drive) || (z && z.length > 1 ? `${z.length} pc · ${z[0]}–${z[z.length - 1]}` : null);
    const look = lookOf(kind, pn, text, chosen), named = !chosen && !key && g && kind === g.key && firstHit(PN_LABEL, pn);
    return { key: kind, drive, size, spec, look, nums: kind === "set" ? setNums(setRange(text)) || specNums(spec) : null, unit: kind === "set" ? (setRange(text) || {}).unit || (spec ? (/mm/.test(spec) ? "MM" : "SAE") : null) : null, label: named || lookLabel(kind, look, ART_LABEL[kind] || "Drawing", spec), pn };
  }
  /* ---------- the size printed on a drawing: 11mm, 9/16", T40, 1/2 × 9/16 ...
     Read from the tool's name first, then from Snap-on's part number when the
     number clearly says it. A socket or wrench whose size we can't tell shows
     no number rather than a wrong one. */
  const SIZE_SLOT = {
    socket: "13", "socket-12": "13", "socket-deep": "13", "socket-impact": "13", "socket-swivel": "13", "socket-spark": "5/8", "socket-o2": "7/8", "socket-bit": "T40",
    wrench: "13 mm", "wrench-ratchet": "13 mm", "wrench-flare": "13 × 15 mm", "wrench-box": "13 × 15 mm", "wrench-open": "13 × 15 mm", "wrench-speed": "13 mm", "wrench-rbox": "13 × 15 mm",
    "set-wrench": "SET", "set-bit": "BITS", "set-kit": "KIT",
    power: "3/8", "power-stubby": "3/8", "power-12": "1/2", "air-impact": "1/2 AIR", extension: '6"',
    "cl14-ratchet": "3/8", "cl14-impact": "3/8", "cl18-impact": "1/2", "cl18-ratchet": "3/8",
  };
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const FR = String.raw`(?:\d-)?\d{1,2}\/\d{1,2}`;
  const SET_KINDS = ["set", "set-wrench", "set-kit", "set-bit"];
  const fracVal = (f) => { const m = f.match(/^(?:(\d)-)?(\d{1,2})\/(\d{1,2})$/); return m ? (Number(m[1] || 0) + m[2] / m[3]) : NaN; };
  const sixteenths = (v) => { const n = Math.round(v * 16), w = Math.floor(n / 16), r = n % 16; if (!r) return String(w); const g = gcd(r, 16); return (w ? w + "-" : "") + r / g + "/" + 16 / g; };
  function setRange(text) {
    const t = text.replace(/\b(1\/4|3\/8|1\/2|3\/4)\s*(?:"|in\b|inch|″)?\s*(?:-\s*)?(?:dr\b|drive)/gi, " ");
    let m = t.match(/\b(\d{1,2})\s*(?:mm)?\s*(?:-|–|to|thru|through)\s*(\d{1,2})\s*mm\b/i);
    if (m && +m[1] < +m[2]) return { unit: "MM", lo: +m[1], hi: +m[2], text: `${m[1]}–${m[2]} MM` };
    m = t.match(new RegExp(`(${FR})\\s*(?:"|in\\b)?\\s*(?:-|–|to|thru|through)\\s*(${FR}|1)\\s*(?:"|in\\b|inch)?`, "i"));
    if (m && fracVal(m[1]) < (m[2] === "1" ? 1 : fracVal(m[2]))) return { unit: "SAE", lo: fracVal(m[1]), hi: m[2] === "1" ? 1 : fracVal(m[2]), text: `${m[1]}–${m[2]} SAE` };
    if (/metric|\bmm\b/i.test(t)) return { unit: "MM", text: "METRIC" };
    if (/\bsae\b|standard|inch|fractional/i.test(t)) return { unit: "SAE", text: "SAE" };
    return null;
  }
  // the socket set drawing's five sockets, picked across the sizes the part number says are in it
  const specNums = (spec) => { const z = spec && spec.split(";")[1].split(","); return z && z.length >= 2 ? [0, 1, 2, 3, 4].map((i) => z[Math.round((i * (z.length - 1)) / 4)].replace(/mm|"/g, "")) : null; };
  // five sockets spread across the set's range
  function setNums(r) {
    if (!r || r.lo == null) return null;
    return [0, 1, 2, 3, 4].map((i) => { const v = r.lo + (r.hi - r.lo) * i / 4; return r.unit === "MM" ? String(Math.round(v)) : sixteenths(v); });
  }
  function sizeOf(kind, text, pn, drive) {
    if (SET_KINDS.includes(kind)) { const r = setRange(text); return r ? r.text : kind === "set-wrench" ? "" : null; }
    if (!(kind in SIZE_SLOT)) return null;
    const isSocket = kind.startsWith("socket"), isWrench = kind.startsWith("wrench");
    if (kind.startsWith("power") || kind === "air-impact" || kind.startsWith("cl1")) return drive ? drive.replace('"', "") + (kind === "air-impact" ? " AIR" : "") : kind === "air-impact" ? "AIR" : "";
    // drop the drive size so "3/8 drive 9/16 socket" reads as 9/16
    const t = text.replace(/\b(1\/4|3\/8|1\/2|3\/4)\s*(?:"|in\b|inch|″)?\s*(?:-\s*)?(?:dr\b|drive)/gi, " ");
    const fromPn = ((g) => (g && familyOf(g.key) === familyOf(kind) && g.size) || "")(pnGuess(pn));
    if (kind === "extension") { const m = t.match(/(\d{1,2}(?:\.\d)?)\s*(?:"|″|in\b|inch)/i); return m ? m[1] + '"' : fromPn || null; }
    if (kind === "socket-bit") {
      const m = t.match(/\b(E?T\d{1,2})\b/i) || t.match(/\b(\d{1,2}(?:\.\d)?)\s*mm\b/i) || t.match(new RegExp(`(${FR})`));
      return m ? (/^\d/.test(m[1]) && !m[1].includes("/") ? m[1] + "mm" : m[1].toUpperCase()) : fromPn || null;
    }
    // two sizes: 13 x 15 mm, 1/2 x 9/16
    let m = t.match(/\b(\d{1,2})\s*(?:mm)?\s*[x×]\s*(\d{1,2})\s*mm\b/i);
    if (m && isWrench && kind !== "wrench" && kind !== "wrench-ratchet") return `${m[1]} × ${m[2]} mm`;
    m = t.match(new RegExp(`(${FR})\\s*(?:"|″|in\\b|inch)?\\s*[x×]\\s*(${FR})`, "i"));
    if (m && isWrench && kind !== "wrench" && kind !== "wrench-ratchet") return `${m[1]} × ${m[2]}`;
    // one size
    m = t.match(/\b(\d{1,2}(?:\.\d)?)\s*mm\b/i);
    if (m) return isSocket ? m[1] + "mm" : m[1] + " mm";
    m = t.match(new RegExp(`(?:^|[^\\d/])(${FR})(?![\\d/])`));
    if (m) return m[1] + '"';
    // then the part number: FSM11 is 11mm, TW181 9/16", OEXM150B 15 mm, XB1214A 3/8 × 7/16
    if (fromPn) return fromPn;
    return isSocket || isWrench ? "" : null; // unknown: no number beats a wrong one
  }
  // Where each drawing's bottom edge is and how wide it is, so its shadow (and reflection) sit right under it
  // instead of on one fixed line. Measured once per kind of tool in a hidden SVG.
  const artBox = {};
  function artBounds(key, svg) {
    if (artBox[key]) return artBox[key];
    let box = { y: 92, x: 14, w: 132 };
    try {
      let m = document.getElementById("artMeasure");
      if (!m) {
        m = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        m.id = "artMeasure"; m.setAttribute("viewBox", "0 0 160 100"); m.setAttribute("aria-hidden", "true");
        m.style.cssText = "position:absolute;left:-9999px;top:0;width:160px;height:100px;visibility:hidden";
        document.body.appendChild(m);
      }
      m.innerHTML = `<g>${svg || ART[key] || ART.other}</g>`;
      const b = m.firstChild.getBBox();
      if (b.height) box = { y: Math.min(96, b.y + b.height), x: b.x, w: b.width };
    } catch (e) { /* not measurable yet: use the old fixed floor */ }
    return (artBox[key] = box);
  }
  /* ---------- set drawings built from what's in the set ----------
     Wrenches lie side by side in their rack, biggest at the back, box ends lined up like a Snap-on set photo;
     extensions lie in their clip rail shortest in front. */
  const sizeMM = (z) => { const m = String(z).match(/^([\d.]+)mm$/); return m ? +m[1] : fracVal(String(z).replace(/[^\d\/-]/g, "")) * 25.4; };
  const f1 = (x) => +x.toFixed(1);
  /* ---------- wrench drawings put together from how the wrench is made ----------
     The pieces of the hand-drawn combination wrench (a 15° open end, a 12-point box with its chamfer ring),
     assembled per family: long and slim, short, midget, a ratcheting box (with a switch when it's
     reversible), a speed open end with its short lower jaw, a 6-point box, a hinged flex head, ratcheting
     boxes on both ends, an S-shaped shank. base: combo, ratchet, speed, rbox, box, open, flare. */
  const star = (n, rOut, rIn) => "M" + Array.from({ length: n * 2 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / n, r = i % 2 ? rIn : rOut; return `${f1(r * Math.cos(a))} ${f1(r * Math.sin(a))}`; }).join(" L") + " Z";
  const WA = { // where the two heads sit and how big they are: [left x, right x, open radius, box radius, shank half-height left, right]
    std: [28, 134, 18, 17, 6, 5], long: [19, 142, 14, 13.4, 4.4, 3.8], short: [42, 120, 17, 16, 6, 5.2], midget: [52, 110, 16.5, 15.5, 6.2, 5.6],
  };
  function wrenchArt(base, mods = [], size = "") {
    const has = (w) => mods.includes(w);
    const [xl, xr, rO, rB, hl, hr] = WA[["long", "midget", "short"].find(has) || "std"];
    const slim = has("slim") ? 0.75 : 1, two = ["box", "rbox", "flare"].includes(base), y = 50;
    const at = (x, rot, body, sx = 1) => `<g transform="translate(${f1(x)} ${y})${rot ? ` rotate(${rot})` : ""}${sx !== 1 ? ` scale(${sx} 1)` : ""}">${body}</g>`;
    // open end facing -x around (0,0); a speed open end has a short lower jaw so it slips round the nut
    const open = (R, speed) => {
      const g = R * 0.345, tx = Math.sqrt(R * R - g * g), k = R / 18, tr = g + 0.8;
      const jaw = speed ? `A${R} ${R} 0 1 1 ${f1(-R * 0.5)} ${f1(R * 0.866)} L${f1(-R * 0.42)} ${f1(tr)}` : `A${R} ${R} 0 1 1 ${f1(-tx)} ${f1(g)} L-1 ${f1(tr)}`;
      return `<path class="s" d="M${f1(-tx)} ${f1(-g)} ${jaw} L-1 ${f1(tr)} A${f1(tr)} ${f1(tr)} 0 0 0 -1 ${f1(-tr)} Z"/><path class="sh" d="M${f1(-12 * k)} ${f1(-8.4 * k)} A${f1(15 * k)} ${f1(15 * k)} 0 0 1 ${f1(10 * k)} ${f1(-11.6 * k)} L${f1(9 * k)} ${f1(-10 * k)} A${f1(13 * k)} ${f1(13 * k)} 0 0 0 ${f1(-11 * k)} ${f1(-7.2 * k)} Z"/>`;
    };
    // box ends around (0,0), the shank coming in from -x
    const shine = (R) => { const k = R / 17; return `<path class="sh" d="M${f1(-12.5 * k)} ${f1(-6 * k)} A${f1(14 * k)} ${f1(14 * k)} 0 0 1 ${f1(-2 * k)} ${f1(-13.7 * k)} L${f1(-1.6 * k)} ${f1(-11.8 * k)} A${f1(12 * k)} ${f1(12 * k)} 0 0 0 ${f1(-10.6 * k)} ${f1(-5.2 * k)} Z"/>`; };
    const neck = (R) => { const k = R / 17; return `<path class="s" d="M${f1(-20 * k)} ${f1(-6.8 * k * slim)} L${f1(-10 * k)} ${f1(-10.5 * k * slim)} V${f1(10.5 * k * slim)} L${f1(-20 * k)} ${f1(6.8 * k * slim)} Z"/>`; };
    const box = (R) => neck(R) + `<circle class="s" r="${f1(R)}"/><circle class="nl" r="${f1(R * 0.74)}" opacity=".45"/><path class="pit" d="${has("6pt") ? star(3, R * 0.5, R * 0.5) : star(12, R * 0.553, R * 0.46)}"/>` + shine(R);
    const ratchet = (R, lever) => neck(R) + `<circle class="s" r="${f1(R)}"/><circle class="d" r="${f1(R * 0.7)}"/><circle class="nl" r="${f1(R * 0.59)}" stroke="#fff" stroke-opacity=".5" stroke-dasharray="1.4 1.6"/><path class="pit" d="${star(12, R * 0.46, R * 0.39)}"/>`
      + (lever ? `<rect class="d" x="${f1(-R * 0.86)}" y="${f1(-R * 0.62)}" width="4.6" height="${f1(R * 1.24)}" rx="2.3"/><rect class="sh" x="${f1(-R * 0.82)}" y="${f1(-R * 0.5)}" width="1.2" height="${f1(R)}" rx=".6"/><circle class="s" cx="${f1(-R * 0.63)}" cy="0" r="1.9"/>` : `<rect class="d" x="-7" y="${f1(-R - 3.4)}" width="14" height="4.6" rx="2.3"/>`) + shine(R);
    const flare = (R) => `<circle class="s" r="${f1(R)}"/><path class="pit" d="${star(3, R * 0.5, R * 0.5)}"/><rect class="gp" x="${f1(-R * 0.2)}" y="${f1(-R - 1.5)}" width="${f1(R * 0.4)}" height="${f1(R * 0.9)}"/><path class="nl" d="M${f1(-R * 0.2)} ${f1(-R + 0.5)} V${f1(-R * 0.45)} M${f1(R * 0.2)} ${f1(-R + 0.5)} V${f1(-R * 0.45)}"/>` + shine(R);
    const end = (kind, R, lever) => (kind === "ratchet" ? ratchet(R, lever) : kind === "flare" ? flare(R) : box(R));
    let out = "";
    if (has("s")) { // S-shaped box wrench: the heads sit off the line, joined by a curved shank
      const a = [24, 41], b = [136, 59];
      out += `<path class="to" stroke-width="12.6" d="M${a[0]} ${a[1]} C70 ${a[1]} 90 ${b[1]} ${b[0]} ${b[1]}"/><path class="tsg" stroke-width="9.4" d="M${a[0]} ${a[1]} C70 ${a[1]} 90 ${b[1]} ${b[0]} ${b[1]}"/>`;
      out += `<g transform="translate(${a[0]} ${a[1]}) scale(-1 1)">${box(15)}</g><g transform="translate(${b[0]} ${b[1]})">${box(16.5)}</g>`;
      return out;
    }
    // heads: two boxes (smaller size on the left) or an open end on the left
    const lR = two ? rB * 0.88 : rO, sL = two ? xl - 6 : xl, sR = has("flex") ? xr - 7 : xr;
    const x0 = sL + (two ? lR * 0.62 : 10), x1 = sR - rB * 0.94;
    out += `<path class="s" d="M${f1(x0)} ${f1(y - hl * slim)} L${f1(x1)} ${f1(y - hr * slim)} V${f1(y + hr * slim)} L${f1(x0)} ${f1(y + hl * slim)} Z"/>`;
    const r0 = x0 + 8, r1 = x1 - 6;
    if (r1 - r0 > 14 && !has("slim")) out += `<rect class="rc" x="${f1(r0)}" y="${f1(y - 2.9)}" width="${f1(r1 - r0)}" height="5.8" rx="2.9"/><rect class="sh" x="${f1(r0)}" y="${f1(y - hl + 1.4)}" width="${f1(r1 - r0)}" height="1.4" rx=".7"/>`;
    else out += `<rect class="sh" x="${f1(x0 + 4)}" y="${f1(y - hl * slim + 1)}" width="${f1(x1 - x0 - 8)}" height="1.2" rx=".6"/>`;
    if (size && r1 - r0 > 22 && !has("slim")) out += `<text class="tx" x="${f1((r0 + r1) / 2)}" y="${y + 1.9}" font-size="${f1(Math.min(4.8, (r1 - r0) / 8))}" text-anchor="middle">${esc(size)}</text>`;
    if (base === "open" || base === "combo" || base === "speed" || base === "ratchet") out += at(xl, -15, open(rO, base === "speed"));
    else out += at(sL, 0, end(base === "rbox" ? "ratchet" : base, lR), -1);
    if (base === "open") out += at(xr - 1, has("angle") ? 60 : 15, open(rO * 0.88), -1);
    else {
      if (has("flex")) out += `<rect class="s" x="${f1(x1 - 2)}" y="${y - 5.5}" width="9" height="11" rx="2"/><path class="nl" d="M${f1(x1 + 2.5)} ${y - 6.5} V${y + 6.5}"/><circle class="pit" cx="${f1(x1 + 2.5)}" cy="${y}" r="1.4"/>`;
      out += at(xr, 0, end(base === "rbox" || base === "ratchet" ? "ratchet" : base === "flare" ? "flare" : "box", rB + (base === "ratchet" || base === "rbox" ? 1 : 0), has("rev")));
    }
    return out;
  }
  ART["wrench-speed"] = wrenchArt("speed", [], "13 mm");
  ART["wrench-rbox"] = wrenchArt("rbox", [], "13 × 15 mm");
  // 14.4V drill: the 18V drill drawing with the smaller pack's print. 14.4V die grinder (CGRS861): the 14.4V ratchet's
  // body with a collet nut and a carbide burr where the head was.
  ART["cl14-drill"] = ART["cl18-drill"].replace('font-size="7" text-anchor="middle">18V', 'font-size="5.4" text-anchor="middle">14.4V').replace('font-size="6.4" text-anchor="middle">18V', 'font-size="5.6" text-anchor="middle">14.4V');
  ART["cl14-die"] = ART["cl14-ratchet"].slice(0, ART["cl14-ratchet"].indexOf('<text class="txw" x="64"'))
    + '<path class="s" d="M38 44 L56 41 V59 L38 56 Z"/><rect class="sh" x="40" y="44.6" width="13" height="1.5" rx=".75"/><path class="s" d="M39.4 50 L35.7 56.4 L28.3 56.4 L24.6 50 L28.3 43.6 L35.7 43.6 Z"/>'
    + '<rect class="s" x="12" y="48.6" width="14" height="2.8" rx="1"/><ellipse class="s" cx="13" cy="50" rx="5.4" ry="4.4"/><path class="nl" d="M9.4 47.6 L16.4 52.4 M9.4 52.4 L16.4 47.6"/>';
  const SET_ART = {
    "set-wrench": (spec) => {
      const [member, list] = spec.split(";"), z = list.split(",").reverse(), n = z.length; if (n < 2) return null;
      const [b0, ...mods] = member.split("+"), base = b0 === "long" ? "combo" : b0, has = (w) => mods.includes(w) || (w === "long" && b0 === "long");
      const lo = sizeMM(z[n - 1]), hi = sizeMM(z[0]), dy = Math.min(9, 58 / (n - 1)), y0 = 76 - dy * (n - 1);
      let out = `<rect class="k" x="104" y="${f1(y0 - 7)}" width="12" height="${f1(dy * (n - 1) + 16)}" rx="2.4"/><rect class="d" x="106" y="${f1(y0 - 5)}" width="8" height="${f1(dy * (n - 1) + 12)}" rx="1.6" opacity=".6"/>`;
      z.forEach((sz, i) => {
        const t = hi > lo ? (sizeMM(sz) - lo) / (hi - lo) : 0.5, y = y0 + i * dy, r = 4.6 + t * 3.2, w = 1.5 + t * 0.9;
        const xr = 146 - r, len = (has("long") ? 112 : has("midget") ? 62 : has("short") ? 76 : 94) + t * (has("midget") ? 12 : 26), xl = Math.max(8 + r, xr - len);
        // a speed wrench's open end has a short lower jaw; a reversible ratcheting box has its switch across the head
        const end = (x, kind) => kind === "open" || kind === "speed"
          ? `<path class="s" d="M${f1(x + r * 0.5)} ${f1(y - w)} L${f1(x)} ${f1(y - r * 0.95)} Q${f1(x - r * 1.1)} ${f1(y - r * 0.8)} ${f1(x - r * 1.2)} ${f1(y - r * 0.3)} L${f1(x - r * 0.35)} ${f1(y - r * 0.32)} L${f1(x - r * 0.35)} ${f1(y + r * 0.32)} ${kind === "speed" ? `L${f1(x - r * 0.62)} ${f1(y + r * 0.42)} Q${f1(x - r * 0.4)} ${f1(y + r * 0.85)} ${f1(x)} ${f1(y + r * 0.95)}` : `L${f1(x - r * 1.2)} ${f1(y + r * 0.3)} Q${f1(x - r * 1.1)} ${f1(y + r * 0.8)} ${f1(x)} ${f1(y + r * 0.95)}`} L${f1(x + r * 0.5)} ${f1(y + w)} Z"/>`
          : `<ellipse class="s" cx="${f1(x)}" cy="${f1(y)}" rx="${f1(r)}" ry="${f1(r * 0.86)}"/>` + (kind === "ratchet"
            ? `<ellipse class="d" cx="${f1(x)}" cy="${f1(y)}" rx="${f1(r * 0.66)}" ry="${f1(r * 0.56)}"/><ellipse class="pit" cx="${f1(x)}" cy="${f1(y)}" rx="${f1(r * 0.38)}" ry="${f1(r * 0.32)}"/>` + (has("rev") && x > 100 ? `<rect class="d" x="${f1(x - r * 0.95)}" y="${f1(y - r * 0.5)}" width="${f1(r * 0.34)}" height="${f1(r)}" rx="${f1(r * 0.17)}"/>` : "")
            : `<ellipse class="pit" cx="${f1(x)}" cy="${f1(y)}" rx="${f1(r * 0.5)}" ry="${f1(r * 0.42)}"/><ellipse class="nl" cx="${f1(x)}" cy="${f1(y)}" rx="${f1(r * 0.64)}" ry="${f1(r * 0.55)}" opacity=".35"/>`);
        const left = base === "rbox" ? "ratchet" : ["box", "flare"].includes(base) ? "box" : base === "speed" ? "speed" : "open";
        const right = base === "open" ? "open" : ["ratchet", "rbox"].includes(base) ? "ratchet" : "box";
        out += `<path class="s" d="M${f1(xl)} ${f1(y - w)} L${f1(xr)} ${f1(y - w * 1.25)} V${f1(y + w * 1.25)} L${f1(xl)} ${f1(y + w)} Z"/><rect class="sh" x="${f1(xl + 6)}" y="${f1(y - w + 0.4)}" width="${f1(xr - xl - 12)}" height=".9" rx=".45"/>`;
        out += end(xl, left) + end(xr, right);
        if (dy >= 5.6) out += `<text class="txe" x="${f1((xl + xr) / 2 - 8)}" y="${f1(y + 1.3)}" font-size="${f1(Math.min(3.6, dy * 0.5))}" text-anchor="middle">${esc(sz.replace("mm", ""))}</text>`;
      });
      return out;
    },
    "set-extension": (spec) => {
      const z = spec.split(";")[1].split(",").map(parseFloat).reverse(), n = z.length; if (n < 2) return null;
      const max = z[0], dy = Math.min(13, 60 / (n - 1)), y0 = 78 - dy * (n - 1), fs = Math.min(1, dy / 12 + 0.25);
      let out = `<rect class="k" x="10" y="${f1(y0 - 9 * fs - 2)}" width="30" height="${f1(dy * (n - 1) + 18 * fs + 4)}" rx="3"/>`;
      z.forEach((inch, i) => {
        const y = y0 + i * dy, h = 7.6 * fs, fw = 24 * fs, fh = 16 * fs, x0 = 13, x1 = x0 + fw, len = 14 + 112 * Math.sqrt(inch / max), x2 = x1 + len;
        out += `<rect class="s" x="${f1(x1 - 2)}" y="${f1(y - h / 2)}" width="${f1(len + 4)}" height="${f1(h)}" rx="1.4"/><rect class="sh" x="${f1(x1 + 2)}" y="${f1(y - h / 2 + 0.9)}" width="${f1(Math.max(2, len - 6))}" height="1.3" rx=".65"/>`
          + `<rect class="s" x="${f1(x2)}" y="${f1(y - 5.4 * fs)}" width="${f1(9 * fs)}" height="${f1(10.8 * fs)}" rx="1.1"/><circle class="h" cx="${f1(x2 + 5.4 * fs)}" cy="${f1(y - 5.4 * fs)}" r="1.3"/>`
          + `<rect class="s" x="${x0}" y="${f1(y - fh / 2)}" width="${f1(fw)}" height="${f1(fh)}" rx="3"/><path class="nl" opacity=".5" d="${[9, 11, 13, 15, 17, 19].map((d) => `M${f1(x0 + d * fs)} ${f1(y - fh / 2 + 1.3)} V${f1(y + fh / 2 - 1.3)}`).join(" ")}"/><rect class="pit" x="${x0 + 0.6}" y="${f1(y - 4 * fs)}" width="${f1(4.2 * fs)}" height="${f1(8 * fs)}" rx=".9"/>`
          + (dy >= 7 ? `<text class="tx" x="${f1(x1 + len / 2 + 4)}" y="${f1(y - h / 2 - 1.2)}" font-size="${f1(3.4 + fs)}" text-anchor="middle">${esc(String(inch))}"</text>` : "");
      });
      return out;
    },
  };
  // what a 3D model needs: kind|size|drive|part number. A set sends what's in it ("set:combo;10mm,11mm...") as its size.
  const m3dOf = (a) => [a.key, a.spec ? "set:" + a.spec : a.size || "", a.drive || "", a.pn || "", (a.look || []).join("+")].join("|");
  const artTag = (a, cls = "", { refl = false } = {}) => {
    const key = typeof a === "string" ? a : a.key, look = (typeof a === "object" && a.look) || [];
    // a wrench whose family looks different from the plain drawing is put together from its pieces
    const built = WRENCH_BASE[key] && (look.some((w) => w !== "ind") || !ART[key]) ? wrenchArt(WRENCH_BASE[key], look, a.size ?? SIZE_SLOT[key] ?? "") : null;
    let svg = built || (typeof a === "object" && a.spec && SET_ART[key] && SET_ART[key](a.spec)) || ART[key] || ART.other;
    const slot = SIZE_SLOT[key];
    if (!built && typeof a === "object" && a.size != null && slot) svg = svg.replace(`>${slot}</text>`, `>${esc(a.size)}</text>`);
    if (typeof a === "object" && key === "set") {
      // the socket set's label and its five sockets: real sizes when the name gives a range, blank when it doesn't
      svg = svg.replace(/>3\/8 DR \u00b7 MM<\/text>/, `>${esc([(a.drive || "").replace('"', "") ? a.drive.replace('"', "") + " DR" : "", a.unit || ""].filter(Boolean).join(" \u00b7 ") || "SOCKETS")}</text>`);
      const nums = a.nums || ["", "", "", "", ""];
      let i = 0; svg = svg.replace(/>(8|10|12|14|17)<\/text>/g, () => `>${esc(nums[i++])}</text>`);
    }
    const bb = built ? artBounds(key + "|" + look.join("+"), built) : artBounds(ART[key] ? key : "other");
    // the finish and paint: black industrial chrome, gunmetal or green housings, orange grips
    const tint = look.filter((w) => w === "ind" || /^c-/.test(w)).join(" ");
    const floor = `<ellipse class="floor" cx="${(bb.x + bb.w / 2).toFixed(1)}" cy="${Math.min(bb.y + 2.5, 95).toFixed(1)}" rx="${Math.max(18, Math.min(68, bb.w * 0.47)).toFixed(1)}" ry="5.5"/>`;
    // the big views stand the tool on a polished floor: a faded mirror image under it
    const mirror = refl ? `<g class="refl" mask="url(#bx-refl)"><g transform="matrix(1 0 0 -1 0 ${(2 * bb.y + 1).toFixed(1)})"${tint ? ` class="${tint}"` : ""}>${svg}</g></g>` : "";
    return `<span class="art${cls ? " " + cls : ""}" data-art="${ART[key] ? key : "other"}" aria-hidden="true"><svg viewBox="0 0 160 100" focusable="false">${mirror}${floor}<g class="tool${tint ? " " + tint : ""}">${svg}</g></svg></span>`;
  };
  const thumb = (r) => { const p = photoOf(r); return p ? `<span class="thumb">${imgTag(p, "")}</span>` : `<span class="thumb art-bg">${artTag(artOf(r))}</span>`; };

  function spark(r, w = 84, h = 26) {
    const pts = hist(r);
    if (!pts.length) return "";
    const ps = pts.map((x) => x.p), min = Math.min(...ps), max = Math.max(...ps), span = max - min || 1;
    const xy = pts.map((x, i) => [pts.length === 1 ? w - 3 : 3 + (i * (w - 6)) / (pts.length - 1), h - 4 - ((x.p - min) / span) * (h - 8)]);
    const line = xy.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ");
    const last = xy[xy.length - 1];
    const ch = lastChange(r);
    const col = ch ? (ch.to < ch.from ? "var(--good)" : "var(--bad)") : "var(--accent)";
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><line x1="3" x2="${w - 3}" y1="${h - 4}" y2="${h - 4}" stroke="var(--line)" stroke-width="1"/>${pts.length > 1 ? `<polygon class="ar" points="3,${h - 4} ${line} ${last[0].toFixed(1)},${h - 4}" fill="${col}" opacity=".12"/><polyline class="ln" pathLength="1" points="${line}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>` : ""}<circle class="dot" cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.8" fill="${col}"/></svg>`;
  }

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function countTo(el, value) {
    const from = el._v ?? 0; el._v = value;
    // after the first count-up, a changed total gives the number a little kick
    if (el._seen && from !== value && !reduce) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
    el._seen = true;
    if (reduce || from === value) { el.textContent = money(value); return; }
    const t0 = performance.now(), dur = 700;
    cancelAnimationFrame(el._raf);
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = money(Math.round(from + (value - from) * e)); if (k < 1) el._raf = requestAnimationFrame(step); };
    el._raf = requestAnimationFrame(step);
  }

  /* ---------- storage: your account when signed in, this browser otherwise ---------- */
  const LS = "snapon-toolbox-v1";
  const local = {
    read() { try { const v = JSON.parse(localStorage.getItem(LS)); return Array.isArray(v) ? v : []; } catch { return []; } },
    write(rows) { localStorage.setItem(LS, JSON.stringify(rows)); },
  };
  const pick = (r) => { const o = {}; FIELDS.forEach((k) => { if (r[k] !== undefined) o[k] = r[k]; }); if (signedIn() && !state.dbArt) delete o.art; if (signedIn() && !state.dbQty) delete o.qty; if (o.date_bought === "") o.date_bought = null; return o; };

  async function saveItem(item) {
    // prices only need fetching for a part number the page hasn't seen; lending, swapping or editing a
    // tool you already have shows up right away
    const pn = item.part_number, known = !pn || state.items.some((x) => x.part_number === pn);
    if (state.demo) {
      // the sample box lives in memory only; nothing is saved
      const row = { ...item, id: item.id || "demo-" + newId(), created_at: item.created_at || new Date().toISOString() };
      if (!item.id) state.flash = new Set([row.id]);
      state.items = state.items.filter((x) => x.id !== row.id).concat([row]);
    } else if (signedIn()) {
      const body = pick(item);
      const q = item.id ? sb.from("items").update(body).eq("id", item.id) : sb.from("items").insert(body);
      const { data, error } = await q.select().single();
      if (error) throw error;
      if (!item.id) state.flash = new Set([data.id]);
      state.items = state.items.filter((x) => x.id !== data.id).concat([data]);
    } else {
      const rows = local.read();
      const row = { ...item, id: item.id || newId(), created_at: item.created_at || new Date().toISOString() };
      if (row.photo_data && !okData(row.photo_data)) delete row.photo_data;
      const next = rows.filter((x) => x.id !== row.id).concat([row]);
      try { local.write(next); } catch { throw { code: "quota" }; }
      if (!item.id) state.flash = new Set([row.id]);
      state.items = next;
    }
    if (!known) await pricesSoon();
    render();
  }
  // Several new tools at once (pasted part numbers), saved in one go.
  async function saveMany(items) {
    let saved;
    if (state.demo) saved = items.map((it, i) => ({ ...it, id: "demo-" + newId(), created_at: new Date(Date.now() + i).toISOString() }));
    else if (signedIn()) {
      const { data, error } = await sb.from("items").insert(items.map(pick)).select();
      if (error) throw error;
      saved = data || [];
    } else {
      saved = items.map((it, i) => ({ ...it, id: newId(), created_at: new Date(Date.now() + i).toISOString() }));
      const next = local.read().concat(saved);
      try { local.write(next); } catch { throw { code: "quota" }; }
    }
    state.items = state.items.concat(saved);
    state.flash = new Set(saved.map((r) => r.id));
    await pricesSoon();
    render();
    return saved.length;
  }
  // Deleting is instant with an Undo; your photo file is only removed once the Undo has passed.
  const photoTrash = {};
  async function removeItem(item) {
    if (state.demo) { /* memory only */ }
    else if (signedIn()) {
      const { error } = await sb.from("items").delete().eq("id", item.id);
      if (error) throw error;
      if (item.photo_path) photoTrash[item.id] = setTimeout(() => { delete photoTrash[item.id]; sb.storage.from("tool-photos").remove([item.photo_path, thumbOf(item.photo_path)]).catch(() => {}); }, 10000);
    } else {
      local.write(local.read().filter((x) => x.id !== item.id));
    }
    state.items = state.items.filter((x) => x.id !== item.id);
    render();
  }
  async function restoreItem(item) {
    clearTimeout(photoTrash[item.id]); delete photoTrash[item.id];
    if (state.demo) state.items = state.items.concat([item]);
    else if (signedIn()) {
      const { data, error } = await sb.from("items").insert({ ...pick(item), id: item.id, created_at: item.created_at }).select().single();
      if (error) throw error;
      state.items = state.items.filter((x) => x.id !== data.id).concat([data]);
    } else {
      const next = local.read().filter((x) => x.id !== item.id).concat([item]);
      try { local.write(next); } catch { throw { code: "quota" }; }
      state.items = next;
    }
    state.flash = new Set([item.id]);
    await pricesSoon();
    render();
  }

  // The database hands back at most 1,000 rows per request, so big toolboxes load in pages.
  async function fetchAllItems() {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("items").select("*").order("created_at").order("id").range(from, from + 999);
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < 1000) return out;
    }
  }
  // Signed-in boxes are also kept in this browser, so the site still shows your box with no signal.
  const CACHE = LS + "-cache";
  const saveCache = () => { try { if (state.user && !state.demo && !state.readonly) localStorage.setItem(CACHE, JSON.stringify({ uid: state.user.id, at: new Date().toISOString(), items: state.items, catalog: state.catalog, hist: state.hist })); } catch {} };
  const readCache = () => { try { const c = JSON.parse(localStorage.getItem(CACHE)); return c && state.user && c.uid === state.user.id ? c : null; } catch { return null; } };
  async function loadItems() {
    state.demo = false;
    if (state.readonly) return loadShared();
    state.offline = false;
    if (signedIn()) {
      try {
        state.items = await fetchAllItems();
        state.dbArt = state.items.length ? "art" in state.items[0] : !(await sb.from("items").select("art").limit(1)).error;
        // the "How many" box only shows once the database has the qty column
        state.dbQty = state.items.length ? "qty" in state.items[0] : !(await sb.from("items").select("qty").limit(1)).error;
      }
      catch {
        const c = readCache();
        if (c) {
          Object.assign(state, { items: c.items || [], catalog: c.catalog || {}, hist: c.hist || {}, offline: true, loaded: true });
          render();
          toast(`No connection. Showing your box from ${rel(c.at)}. Changes need a connection.`);
          return;
        }
        toast("Couldn't load your tools. Check your connection and reload."); state.items = [];
      }
    } else state.items = local.read();
    await Promise.all([loadCatalog(), loadAdmin()]);
    state.loaded = true;
    saveCache();
    render();
  }
  // Someone's shared box (a ?box= link): read-only, no photos, notes or locations.
  async function loadShared() {
    let data = null;
    if (sb) { const res = await sb.rpc("shared_box", { t: state.shareToken }); data = res.error ? null : res.data; }
    state.shareInfo = data;
    state.items = data && Array.isArray(data.items) ? data.items : [];
    await loadCatalog();
    state.loaded = true;
    render();
  }
  // After a save, wait up to 2.5 s for prices so the card shows them straight away, but never hold the
  // form open longer than that on a weak signal: the prices fill in by themselves when they arrive.
  function pricesSoon() {
    let late = false;
    const load = loadCatalog().then(() => { if (late) render(); }, () => {});
    return Promise.race([load, new Promise((r) => setTimeout(() => { late = true; r(); }, 2500))]);
  }
  async function loadCatalog() {
    if (!sb) return;
    const pns = [...new Set(state.items.map((r) => r.part_number).filter((p) => p && PN_RE.test(p)))];
    if (!pns.length) { state.catalog = {}; state.hist = {}; return; }
    // Ask in batches so the request stays short even for a box with hundreds of part numbers.
    const batches = [];
    for (let i = 0; i < pns.length; i += 150) batches.push(pns.slice(i, i + 150));
    const res = await Promise.all(batches.map((b) => Promise.all([
      sb.from("catalog").select("part_number,name,status,checked_at").in("part_number", b),
      // eBay price history, newest first, so if there's ever more than one request holds, the oldest days are what's left out
      sb.from("ebay_price_history").select("part_number,d,price").in("part_number", b).order("d", { ascending: false }).limit(1000),
      sb.from("ebay_prices").select("part_number,listings,low,median,new_median,used_median,checked_at,seen_at,source,note").in("part_number", b),
      // how many people own or want each tool: only answered for signed-in people
      signedIn() ? sb.rpc("owner_counts", { pns: b }) : { data: [], error: null },
      sb.from("list_prices").select("part_number,price,name,source,checked_at").in("part_number", [...new Set([...b, ...b.map(colorBase).filter(Boolean)])]),
    ])));
    if (res.every(([, , , , l]) => !l.error)) state.list = Object.fromEntries(res.flatMap(([, , , , l]) => l.data || []).map((r) => [r.part_number, r]));
    if (res.every(([, , , o]) => !o.error)) state.owners = Object.fromEntries(res.flatMap(([, , , o]) => o.data || []).map((r) => [r.part_number, r]));
    if (res.every(([, , e]) => !e.error)) state.ebay = Object.fromEntries(res.flatMap(([, , e]) => e.data || []).map((r) => [r.part_number, r]));
    if (res.every(([c]) => !c.error)) state.catalog = Object.fromEntries(res.flatMap(([c]) => c.data || []).map((r) => [r.part_number, r]));
    if (res.every(([, h]) => !h.error)) {
      const m = {};
      res.flatMap(([, h]) => h.data || []).forEach((r) => { (m[r.part_number] ||= []).push({ d: r.d, p: Number(r.price) }); });
      Object.values(m).forEach((a) => a.sort((x, y) => String(x.d).localeCompare(String(y.d))));
      state.hist = m;
    }
  }
  /* other people's price updates show up without a reload */
  let pollTimer = null;
  function schedulePoll() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(async () => {
      if (document.visibilityState === "visible" && sb && state.loaded) { await loadCatalog(); render(); }
      else schedulePoll();
    }, 180000);
  }

  /* ---------- account ---------- */
  function greeting() {
    const name = state.user && String(state.user.user_metadata?.full_name || "").trim().split(/\s+/)[0];
    if (!name) return "Tool truck ledger";
    const h = new Date().getHours();
    return `${h < 4 ? "Late shift" : h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening"}, ${name}`;
  }
  function renderAccount() {
    $("eyebrow").textContent = state.readonly ? "Shared toolbox" : greeting();
    const box = $("account");
    $("delWrap").hidden = !(sb && state.user && !state.readonly);
    if (!sb) { box.innerHTML = ""; return; }
    if (state.readonly) { box.innerHTML = `<a class="btn-account" href="/">Make your own box</a>`; return; }
    if (state.user) {
      const name = state.user.user_metadata?.full_name || state.user.email || "Signed in";
      box.innerHTML = `<button class="btn-account" id="shareBtn" type="button">${ICON.share}Share my box</button> <span class="who"><span class="av" aria-hidden="true">${esc(name.trim()[0] || "?").toUpperCase()}</span><span class="sr">Signed in as </span>${esc(name)}</span> <button class="btn-account" id="signOut" type="button">Sign out</button>`;
    } else {
      box.innerHTML = `<button class="btn-account" id="signIn" type="button">${ICON.google}Sign in with Google</button>`;
    }
  }
  async function signIn() {
    if (!sb) return;
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + "/" } });
    if (error) toast("Google sign-in isn't available right now. Try again later.");
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.id === "signIn" || b.id === "localSignIn") signIn();
    if (b.id === "signOut") sb.auth.signOut().then(() => { forgetSigned(); toast("Signed out"); });
    if (b.id === "shareBtn") openShare();
    if (b.id === "installBtn") installApp();
  });

  let booted = false;
  async function setUser(user) {
    const changed = (state.user && state.user.id) !== (user && user.id);
    state.user = user;
    renderAccount();
    if (state.readonly) { if (!booted) { booted = true; await loadShared(); } return; }
    loadAlerts();
    state.insP = loadIns();
    if (changed || !booted) { booted = true; await loadItems(); }
    const localRows = local.read();
    $("importBanner").hidden = !(user && localRows.length);
    if (user && localRows.length) $("importText").textContent = `You have ${localRows.length} tool${localRows.length === 1 ? "" : "s"} saved in this browser from before you signed in.`;
  }
  $("importNo").onclick = () => { $("importBanner").hidden = true; };
  $("importYes").onclick = async () => {
    const rows = local.read(); if (!rows.length || !signedIn()) return;
    $("importYes").disabled = true;
    let moved = 0;
    for (const r of rows) {
      try {
        const item = pick(r); delete item.photo_path;
        if (okData(r.photo_data)) { const blob = await (await fetch(r.photo_data)).blob(); item.photo_path = await uploadBlob(blob); item.photo_at = r.photo_at || new Date().toISOString(); }
        const { error } = await sb.from("items").insert(item);
        if (!error) moved++;
      } catch {}
    }
    if (moved === rows.length) { try { localStorage.removeItem(LS); } catch {} }
    $("importYes").disabled = false; $("importBanner").hidden = true;
    toast(moved === rows.length
      ? `Moved ${moved} tool${moved === 1 ? "" : "s"} to your account`
      : `Moved ${moved} of ${rows.length} tools. The rest are still saved in this browser.`);
    await loadItems();
  };

  /* ---------- selects ---------- */
  function catOptions(first) {
    const groups = Object.entries(DEPTS).map(([d, cats]) => cats.length === 1 && cats[0] === d
      ? `<option value="${esc(d)}">${esc(d)}</option>`
      : `<optgroup label="${esc(d)}">${cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}</optgroup>`).join("");
    return (first ? `<option value="">${first}</option>` : "") + groups;
  }
  const opts = (list) => list.map((o) => `<option value="${esc(o.v ?? o)}">${esc(o.t ?? o)}</option>`).join("");
  $("fCat").innerHTML = catOptions("All categories");
  $("i-cat").innerHTML = catOptions();
  // every drawing, by name, so people can fix a wrong guess themselves
  $("i-art").innerHTML = `<option value="">Automatic</option>` + Object.keys(ART_LABEL).filter((k) => ART[k] && k !== "other")
    .sort((a, b) => ART_LABEL[a].localeCompare(ART_LABEL[b])).map((k) => `<option value="${k}">${esc(ART_LABEL[k])}</option>`).join("");
  $("i-cond").innerHTML = opts(CONDS);
  $("i-pri").innerHTML = opts(PRIS);
  const SORTS = {
    owned: [{ v: "date", t: "Newest first" }, { v: "worth", t: "Worth, high to low" }, { v: "change", t: "Biggest price change" }, { v: "name", t: "Name A–Z" }, { v: "cat", t: "Category" }, { v: "nophoto", t: "Missing photos first" }, { v: "lent", t: "Lent out first" }],
    wishlist: [{ v: "pri", t: "Priority" }, { v: "drop", t: "Price drops first" }, { v: "worth", t: "Price, high to low" }, { v: "close", t: "Closest to paid off" }, { v: "name", t: "Name A–Z" }],
  };
  function setSortOptions() { const cur = $("fSort").value; $("fSort").innerHTML = opts(SORTS[state.tab]); if (SORTS[state.tab].some((s) => s.v === cur)) $("fSort").value = cur; }
  setSortOptions();

  const rowsOf = (list) => state.items.filter((r) => r.list === list);
  const addedAt = (r) => r.created_at || r.date_bought || "";
  function filtered() {
    const q = $("q").value.trim().toLowerCase(), cat = $("fCat").value;
    const rows = rowsOf(state.tab).filter((r) => (!cat || catOf(r) === cat) && (!q || [displayName(r), r.part_number, r.notes, r.location].some((f) => String(f || "").toLowerCase().includes(q))));
    const worth = (r) => (state.tab === "owned" ? worthAll(r) : wishCost(r));
    const chg = (r) => { const c = lastChange(r); return c ? c.to - c.from : 0; };
    const by = {
      date: (a, b) => String(b.date_bought || "").localeCompare(String(a.date_bought || "")) || String(addedAt(b)).localeCompare(String(addedAt(a))),
      worth: (a, b) => worth(b) - worth(a),
      change: (a, b) => Math.abs(chg(b)) - Math.abs(chg(a)),
      drop: (a, b) => chg(a) - chg(b),
      name: (a, b) => displayName(a).localeCompare(displayName(b)),
      cat: (a, b) => String(catOf(a)).localeCompare(String(catOf(b))) || displayName(a).localeCompare(displayName(b)),
      pri: (a, b) => PRIS.indexOf(a.priority || "Want") - PRIS.indexOf(b.priority || "Want") || wishCost(b) - wishCost(a),
      close: (a, b) => (wishCost(a) - (Number(a.saved) || 0)) - (wishCost(b) - (Number(b.saved) || 0)),
      lent: (a, b) => (b.lent_to ? 1 : 0) - (a.lent_to ? 1 : 0) || String(a.lent_at || "").localeCompare(String(b.lent_at || "")) || displayName(a).localeCompare(displayName(b)),
      nophoto: (a, b) => (photoOf(a) ? 1 : 0) - (photoOf(b) ? 1 : 0) || displayName(a).localeCompare(displayName(b)),
    }[$("fSort").value];
    return by ? rows.slice().sort(by) : rows;
  }

  /* ---------- cards ---------- */
  const condClass = { "New": "good", "Good": "", "Worn": "warn", "Needs warranty": "bad" };
  const fresh = (r) => (state.flash && state.flash.has(r.id) ? " fresh" : "");
  const idRow = (r) => `<div class="idrow">${r.part_number ? `<a class="pn" href="${esc(storeLink(r.part_number))}" target="_blank" rel="noopener" title="View on Snap-on's store">${esc(r.part_number)} <span aria-hidden="true">↗</span></a>` : ""}<span>${esc(catOf(r) || "Other")}</span></div>`;
  // Lending: who has it, since when, and the buttons to lend it or mark it back
  const lentDays = (r) => { const t = toDate(r.lent_at); return t ? Math.max(0, Math.round((toDate(today()) - t) / 86400000)) : 0; };
  const lentChip = (r) => (r.lent_to ? `<span class="chip lent">Lent out</span>` : "");
  const lentLine = (r) => {
    if (!r.lent_to || state.readonly) return "";
    const d = lentDays(r);
    return `<div class="lentline"><span>Lent to <strong>${esc(r.lent_to)}</strong>${r.lent_at ? ` · ${d === 0 ? "today" : d === 1 ? "yesterday" : d + " days"}` : ""}</span><button class="btn small" data-act="returned" type="button">Got it back</button></div>`;
  };
  const lendForm = (r) => (state.lendEdit === r.id ? `<form class="pricebox" data-lend-form="${esc(r.id)}" novalidate><label>Who's borrowing it?<input name="who" list="whoList" maxlength="60" autocomplete="off" placeholder="Name"></label><div class="row"><button class="btn small primary" type="submit">Lend it</button><button class="btn small ghost" data-act="lend-cancel" type="button">Cancel</button></div></form>` : "");
  const lendBtn = (r) => (r.list === "owned" && !r.lent_to && state.lendEdit !== r.id ? `<button class="btn small ghost" data-act="lend" type="button">Lend</button>` : "");
  function confirmHtml(r) {
    if (!state.confirm || state.confirm.id !== r.id) return "";
    const onTruck = truckOn() ? `<button class="btn small" data-act="bought-truck" type="button">Move it + add to truck account</button>` : "";
    return `<div class="confirm">Move to Owned at ${money(wishCost(r), true)}, bought today? <button class="btn small primary" data-act="bought-yes" type="button">Move it</button>${onTruck}<button class="btn small ghost" data-act="cancel" type="button">Not yet</button></div>`;
  }
  function photoBlock(r, chipsHtml, badgeHtml) {
    const p = photoOf(r);
    const busy = state.uploading[r.id] ? `<div class="busy"><span class="spin" aria-hidden="true"></span><span class="sr">Uploading photo</span></div>` : "";
    const snap = !busy ? `<button class="snap" type="button" data-act="photo">${ICON.cam}${p ? "Replace" : "Add your photo"}</button>` : "";
    const over = `<div class="over"><div class="chips">${chipsHtml}</div>${badgeHtml}</div>`;
    if (!p) {
      // no photo of your own yet: BoxTally's drawing of this kind of tool
      const a = artOf(r);
      return `<div class="photo art-bg" data-m3d="${esc(m3dOf(a))}"><button class="open" type="button" data-act="view" aria-label="See ${esc(displayName(r))} up close">${artTag(a, "", { refl: true })}</button>${over}<span class="src" title="BoxTally drawing">${esc(a.label)}${a.size && !/^(power|air|cl1)/.test(a.key) ? " · " + esc(a.size) : ""}${a.drive ? " · " + esc(a.drive) + " drive" : ""}</span>${snap}${busy}</div>`;
    }
    return `<div class="photo"><button class="open" type="button" data-act="view" aria-label="View photo of ${esc(displayName(r))}">${imgTag(p, displayName(r))}</button>${over}<span class="src">${photoLabel(p)}</span>${snap}${busy}</div>`;
  }
  // A shared box whose owner keeps what they paid private
  // eBay asking prices (official eBay API, kept fresh by .github/workflows/ebay-prices.yml).
  // source says how the price was found: exact part number, a color/kit variant, auction bids, or an
  // estimate from sibling part numbers. A tool with nothing listed now keeps its last price.
  const EBAY_HOW = { variant: (n) => `as ${n}`, auction: () => "auction bids", similar: (n) => `estimate from ${n}` };
  const listLine = (r) => {
    const v = listPrice(r);
    if (v == null) return "";
    return `<span class="meta-line ebay-line">Snap-on list: ${money(v, v % 1)} · <a href="https://shop.snapon.com/product/${encodeURIComponent(r.part_number)}" target="_blank" rel="noopener">see on snapon.com</a></span>`;
  };
  const ebayLine = (r) => {
    const e = r.part_number && state.ebay && state.ebay[r.part_number];
    if (!e) return "";
    const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent("snap-on " + r.part_number)}`;
    const link = (t) => `<a href="${url}" target="_blank" rel="noopener">${t}</a>`;
    if (e.median == null) return `<span class="meta-line ebay-line">eBay: none listed yet · ${link("search eBay")}</span>`;
    const parts = [];
    if (e.new_median != null) parts.push(`new ~${money(Number(e.new_median), true)}`);
    if (e.used_median != null) parts.push(`used ~${money(Number(e.used_median), true)}`);
    const price = parts.join(", ") || `~${money(Number(e.median), true)}`;
    const how = EBAY_HOW[e.source] ? ` (${esc(EBAY_HOW[e.source](e.note || "similar tools"))})` : "";
    if (!e.listings) {
      const seen = e.seen_at ? new Date(e.seen_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
      return `<span class="meta-line ebay-line">eBay: ${price}${how} · last seen${seen ? " " + seen : ""} · ${link("search eBay")}</span>`;
    }
    return `<span class="meta-line ebay-line">eBay: ${price}${how} · from ${money(Number(e.low), true)} · ${e.listings} listing${e.listings === 1 ? "" : "s"} · ${link("see on eBay")}</span>`;
  };
  // how many other BoxTally users have this part number (counts only, never who)
  const ownersLine = (r) => {
    const o = r.part_number && !state.demo && state.owners && state.owners[r.part_number];
    if (!o) return "";
    const me = signedIn() && !state.readonly ? 1 : 0;
    const own = Math.max(0, o.owners - (r.list === "owned" ? me : 0)), wish = Math.max(0, o.wishers - (r.list === "wishlist" ? me : 0));
    const bits = [];
    if (own) bits.push(`in ${own} other box${own === 1 ? "" : "es"}`);
    if (wish) bits.push(`on ${wish} other wishlist${wish === 1 ? "" : "s"}`);
    return bits.length ? `<span class="meta-line owners-line">Also ${bits.join(" · ")}</span>` : "";
  };
  const hidePaid = () => !!state.readonly && !(state.shareInfo && state.shareInfo.show_prices);
  function cardOwned(r, i) {
    const now = nowPrice(r), paid = Number(r.price) || 0, diff = now != null && paid ? now - paid : null;
    const mine = !state.readonly && !state.demo;
    const chips = (r.condition ? `<span class="chip ${condClass[r.condition] || ""}">${esc(r.condition)}</span>` : "") + lentChip(r);
    const badge = qtyChip(r);
    return `<article class="card${fresh(r)}${r.lent_to ? " lent" : ""}" data-id="${esc(r.id)}" style="--i:${i}">${photoBlock(r, chips, badge)}<div class="card-body">
      <div><h3 class="${r.name || (storeOf(r) && storeOf(r).name) ? "" : "pending"}">${esc(displayName(r))}</h3>${idRow(r)}</div>
      <div class="prices">
        <div><span class="label">${state.readonly ? "Paid" : "You paid"}</span>${hidePaid() ? `<span class="no-price">Kept private</span>` : paid || !mine ? `<span class="price-big">${paid ? money(paid, paid % 1) : "—"}</span><span class="meta-line">${r.date_bought ? fmtDate(r.date_bought) : "&nbsp;"}</span>` : `<span class="no-price">Not entered.<br><button class="btn small" data-act="edit" type="button">Add what you paid</button></span>`}</div>
        <div><span class="label">${listPrice(r) != null ? "Snap-on list" : "eBay price now"}</span>${now != null
          ? `<span class="price-big">${money(now, now % 1)}</span><span class="meta-line">${diff ? `<span class="chg ${diff > 0 ? "down" : "up"}">${signed(diff)}</span> vs what you paid` : listPrice(r) != null ? `<span class="src-tag">Snap-on</span> list price` : `<span class="src-tag">eBay</span> typical new price`}</span>`
          : `<span class="no-price">${r.part_number ? "No price found yet." : "Add a part number to get its price."}</span>`}</div>
      </div>
      ${qtyOf(r) > 1 ? `<span class="meta-line qty-line">${qtyOf(r)} in ${mine || state.demo ? "your" : "this"} box · ${money(worthAll(r), worthAll(r) % 1)} together</span>` : ""}
      ${listLine(r)}${ebayLine(r)}${ownersLine(r)}
      ${r.location ? `<span class="meta-line">Kept in ${esc(r.location)}</span>` : ""}
      ${r.notes ? `<span class="meta-line">${esc(r.notes)}</span>` : ""}
      ${lentLine(r)}${lendForm(r)}
      <div class="actions">${lendBtn(r)}<span class="spacer"></span><button class="btn small ghost" data-act="edit" type="button">Edit</button><button class="btn small ghost danger" data-act="del" type="button" aria-label="Delete ${esc(displayName(r))}">Delete</button></div>
      ${confirmHtml(r)}</div></article>`;
  }
  function cardWish(r, i) {
    const cost = wishCost(r), saved = Number(r.saved) || 0;
    const left = Math.max(cost - saved, 0), pct = cost ? Math.min(100, Math.round((saved / cost) * 100)) : 0;
    const ch = lastChange(r), dropped = ch && ch.to < ch.from;
    const chips = `<span class="chip ${r.priority === "Need" ? "need" : ""}">${esc(r.priority || "Want")}</span>`;
    const badge = dropped ? `<span class="chip tag">Price dropped</span>` : "";
    return `<article class="card ${dropped ? "drop" : ""}${fresh(r)}" data-id="${esc(r.id)}" style="--i:${i}">${photoBlock(r, chips, badge)}<div class="card-body">
      <div><h3 class="${r.name || (storeOf(r) && storeOf(r).name) ? "" : "pending"}">${esc(displayName(r))}</h3>${idRow(r)}</div>
      <div class="prices">
        <div><span class="label">${Number(r.price) ? "Your price" : listPrice(r) != null ? "Snap-on list" : ebayPrice(r) != null ? "eBay price" : "Your price"}</span><span class="price-big">${cost ? money(cost, cost % 1) : "—"}</span><span class="meta-line">&nbsp;</span></div>
        <div><span class="label">Left to save</span><span class="price-big">${cost ? money(left, left % 1) : "—"}</span><span class="meta-line">${cost ? (left ? `${money(saved)} saved` : "Ready to buy") : "&nbsp;"}</span></div>
      </div>
      ${cost ? `<div class="bar ${left ? "" : "done"}" role="progressbar" aria-label="Saved toward this tool" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>` : ""}
      ${listLine(r)}${ebayLine(r)}${ownersLine(r)}
      ${r.notes ? `<span class="meta-line">${esc(r.notes)}</span>` : ""}
      <div class="actions"><button class="btn small" data-act="bought" type="button">Bought it</button><span class="spacer"></span><button class="btn small ghost" data-act="edit" type="button">Edit</button><button class="btn small ghost danger" data-act="del" type="button" aria-label="Delete ${esc(displayName(r))}">Delete</button></div>
      ${confirmHtml(r)}</div></article>`;
  }

  // List view: one dense row per tool, for big boxes.
  function rowItem(r, i = 0) {
    const owned = r.list === "owned", p = photoOf(r), ch = lastChange(r), dropped = !owned && ch && ch.to < ch.from;
    const pic = `<button class="open" type="button" data-act="view" aria-label="${p ? "View photo of" : "See"} ${esc(displayName(r))}${p ? "" : " up close"}">${thumb(r)}</button>`;
    let price, sub;
    if (owned) {
      const now = nowPrice(r), paid = Number(r.price) || 0, v = now ?? paid, diff = now != null && paid ? now - paid : null;
      price = v ? money(v, v % 1) : "—";
      sub = now != null ? (diff ? `<span class="chg ${diff > 0 ? "down" : "up"}">${signed(diff)}</span> eBay` : "eBay price") : paid ? "you paid" : "";
    } else {
      const cost = wishCost(r), left = Math.max(cost - (Number(r.saved) || 0), 0);
      price = cost ? money(cost, cost % 1) : "—";
      sub = !cost ? "" : left ? `${money(left, left % 1)} left` : "Ready to buy";
    }
    const chips = (owned ? qtyChip(r) + (r.condition && r.condition !== "Good" ? `<span class="chip ${condClass[r.condition] || ""}">${esc(r.condition)}</span>` : "") + lentChip(r) : `<span class="chip ${r.priority === "Need" ? "need" : ""}">${esc(r.priority || "Want")}</span>`)
      + (dropped ? `<span class="chip tag">Price dropped</span>` : "");
    return `<article class="ri ${dropped ? "drop" : ""}${fresh(r)}" data-id="${esc(r.id)}" style="--i:${i}"><div class="ri-main">${pic}
      <div><h3>${esc(displayName(r))}</h3><div class="idrow">${r.part_number ? `<a class="pn" href="${esc(storeLink(r.part_number))}" target="_blank" rel="noopener" title="View on Snap-on's store">${esc(r.part_number)}</a>` : ""}<span>${esc(catOf(r) || "Other")}</span>${chips}</div></div>
      <div class="ri-price"><span class="num">${price}</span><span class="meta-line">${sub || "&nbsp;"}</span></div>
      <div class="actions">${owned ? (r.lent_to && !state.readonly ? `<button class="btn small" data-act="returned" type="button">Got it back</button>` : lendBtn(r)) : `<button class="btn small" data-act="bought" type="button">Bought it</button>`}<button class="btn small ghost" data-act="edit" type="button">Edit</button><button class="btn small ghost danger" data-act="del" type="button" aria-label="Delete ${esc(displayName(r))}">Delete</button></div>
      </div>${r.lent_to && !state.readonly ? `<span class="meta-line">Lent to ${esc(r.lent_to)} · ${lentDays(r)} days</span>` : ""}${lendForm(r)}${confirmHtml(r)}</article>`;
  }

  /* ---------- by drawer: tools grouped by "Where it's kept" ---------- */
  function drawersHtml(rows) {
    const groups = new Map();
    rows.forEach((r) => { const k = String(r.location || "").trim(); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
    const keys = [...groups.keys()].sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    return keys.map((k, gi) => {
      const g = groups.get(k), worth = g.reduce((sum, r) => sum + worthAll(r), 0), n = pieces(g);
      const open = !state.closedDrawers.has(k);
      return `<details class="drawer" data-drawer="${esc(k)}" style="--i:${Math.min(gi, 12)}"${open ? " open" : ""}><summary><span class="dname">${k ? esc(k) : "No drawer set"}</span><span class="dmeta">${n} tool${n === 1 ? "" : "s"} · ${money(Math.round(worth))}</span></summary>`
        + `<div class="rows">${g.map((r, i) => rowItem(r, i)).join("")}</div>`
        + (k ? "" : `<p class="dhint">Tap Edit and fill in "Where it's kept" to file these into drawers.</p>`) + `</details>`;
    }).join("");
  }
  $("list").addEventListener("toggle", (e) => {
    const d = e.target.closest && e.target.closest("details.drawer"); if (!d) return;
    if (d.open) state.closedDrawers.delete(d.dataset.drawer); else state.closedDrawers.add(d.dataset.drawer);
  }, true);
  // people you've lent to before, for the "Who's borrowing it?" suggestions
  const recentWho = () => { try { const v = JSON.parse(localStorage.getItem(LS + "-who")); return Array.isArray(v) ? v : []; } catch { return []; } };
  const rememberWho = (name) => { try { localStorage.setItem(LS + "-who", JSON.stringify([name, ...recentWho().filter((n) => n.toLowerCase() !== name.toLowerCase())].slice(0, 20))); } catch {} };

  /* ---------- render ---------- */
  function render() {
    const t = rowsOf("owned"), w = rowsOf("wishlist");
    const paid = t.reduce((s, r) => s + paidAll(r), 0);
    const worth = t.reduce((s, r) => s + worthAll(r), 0);
    const nTools = pieces(t);
    const onList = pieces(t.filter((r) => listPrice(r) != null));
    const onEbay = pieces(t.filter((r) => listPrice(r) == null && ebayPrice(r) != null));
    const pricedFrom = [onList ? `${onList} at Snap-on list` : "", onEbay ? `${onEbay} from eBay` : ""].filter(Boolean).join(", ");
    if (!state.loaded) {
      ["d-worth", "d-left"].forEach((k) => { $(k).textContent = "$…"; $(k).classList.add("loading-num"); });
      $("d-worth-sub").textContent = "Loading your box…"; $("d-left-sub").textContent = "Loading…";
    } else { ["d-worth", "d-left"].forEach((k) => $(k).classList.remove("loading-num")); }
    if (state.loaded) countTo($("d-worth"), Math.round(worth));
    if (state.loaded) $("d-worth-sub").innerHTML = t.length
      ? `${nTools} tool${nTools === 1 ? "" : "s"}${hidePaid() || !paid ? "" : ` · ${state.readonly ? "paid" : "you paid"} ${money(Math.round(paid))}${worth - paid ? ` · <span class="delta ${worth > paid ? "up" : "down"}">${signed(Math.round(worth - paid))}</span>` : ""}`}<span class="sub2"><br>${onList + onEbay ? `${pricedFrom}${onList + onEbay < nTools ? ", the rest at what you paid" : ""}` : "Valued at what you paid for now"}</span>`
      : "Add tools to see their value.";
    const cost = w.reduce((s, r) => s + wishCost(r), 0), saved = w.reduce((s, r) => s + Math.min(Number(r.saved) || 0, wishCost(r)), 0);
    if (state.loaded) countTo($("d-left"), Math.round(Math.max(cost - (state.readonly ? 0 : saved), 0)));
    $("d-left-label").textContent = state.readonly ? "Wishlist total" : "Wishlist";
    if (state.loaded) $("d-left-sub").textContent = !w.length ? (state.readonly ? "Nothing on the wishlist." : "Add tools you want to start saving.")
      : state.readonly ? `${w.length} tool${w.length === 1 ? "" : "s"} on the wishlist`
      : `left to save · ${money(Math.round(saved))} of ${money(Math.round(cost))} saved`;
    $("d-left-bar").firstElementChild.style.width = (cost && !state.readonly ? Math.round((saved / cost) * 100) : 0) + "%";
    setCount($("c-tools"), t.length);
    setCount($("c-wish"), w.length);
    $("bn-tools").textContent = t.length; $("bn-wish").textContent = w.length;
    syncBnav();
    document.body.classList.toggle("has-items", state.loaded && state.items.length > 0);
    document.body.classList.toggle("tab-owned", state.tab === "owned");
    // an empty box (first visit, or signed in with nothing added yet) gets the welcome instead of $0 totals
    const fresh = state.loaded && !state.items.length && !state.readonly && !state.demo;
    document.body.classList.toggle("fresh-start", fresh);
    $("hero").hidden = !fresh;
    $("heroNote").hidden = !sb || signedIn();
    renderTruck();
    renderIns(worth);
    document.body.classList.toggle("readonly", !!state.readonly);
    document.body.classList.toggle("demo", !!state.demo);
    // on a phone the wishlist's button is just "Add", so the part number box keeps room for its hint
    $("q-add").textContent = state.tab === "owned" ? "Add to box" : matchMedia("(max-width: 620px)").matches ? "Add" : "Add to wishlist";
    $("shopWish").hidden = state.tab === "wishlist";
    $("shopNote").textContent = state.tab === "wishlist"
      ? "Search opens Snap-on's store in a new tab. Found one you want? Type its part number in the box above."
      : "Search opens Snap-on's store in a new tab. Found one you want? Put its part number on your wishlist.";
    // Search, filters and export only show up once there's something to search, filter or export.
    const tabHas = state.loaded && rowsOf(state.tab).length > 0, anyItems = state.loaded && state.items.length > 0;
    $("filters").hidden = !tabHas;
    $("exportBox").hidden = !anyItems || state.readonly;
    $("toolbar").hidden = !tabHas && (!anyItems || state.readonly);
    document.querySelector(".shop").classList.toggle("compact", anyItems);
    syncShop(anyItems);
    $("fMore").classList.toggle("on", !!$("fCat").value);
    $("fabText").textContent = state.tab === "owned" ? "Add tool" : "Add to wishlist";
    // drawers only make sense for tools you own, and a shared box doesn't show where things are kept
    const drawersOk = state.tab === "owned" && !state.readonly;
    document.querySelector('.seg [data-view="drawers"]').hidden = !drawersOk;
    const view = state.view === "drawers" && !drawersOk ? "cards" : state.view;
    document.querySelectorAll(".seg [data-view]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.view === view));
    $("list").className = state.loaded && rowsOf(state.tab).length ? (view === "list" ? "rows" : view === "drawers" ? "drawers" : "grid") : "grid";
    $("localBanner").hidden = !sb || signedIn() || !state.loaded || state.demo || state.readonly;
    $("localDemo").hidden = state.items.length > 0;
    $("demoBanner").hidden = !state.demo;
    $("shareBanner").hidden = !state.readonly;
    const unchecked = state.admin ? lpTodo().length : 0;
    $("ownerBanner").hidden = !unchecked;
    if (unchecked) $("ownerText").innerHTML = `<strong>Owner:</strong> ${unchecked} tool${unchecked === 1 ? "" : "s"} in BoxTally ${unchecked === 1 ? "hasn't" : "haven't"} been checked for a Snap-on list price yet.`;
    if (state.readonly) {
      const title = state.shareInfo && state.shareInfo.title;
      $("shareText").textContent = !state.loaded ? "Loading a shared box…" : !state.shareInfo ? "This shared box link was turned off, or it's not quite right." : `You're looking at ${title ? title : "someone's toolbox"} on BoxTally. It's read-only.`;
    }
    $("q-hint").textContent = state.demo ? "This is the sample box. Try adding, lending or deleting tools; nothing is saved."
      : !sb ? "Prices can't load right now. You can still add tools and fill in prices yourself."
      : "Just the part number is enough. Its eBay price fills in automatically, and what you paid stays private to you." + " Paste several part numbers to add them all at once.";
    // suggestions for "Where it's kept" and "Who's borrowing it?"
    const opts = (vals) => [...new Set(vals.map((v) => String(v || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).slice(0, 80).map((v) => `<option value="${esc(v)}">`).join("");
    $("locList").innerHTML = opts(t.map((r) => r.location));
    $("whoList").innerHTML = opts(t.map((r) => r.lent_to).concat(recentWho()));

    const list = $("list");
    if (!state.loaded) {
      list.innerHTML = Array.from({ length: 3 }, () => `<div class="skel" aria-hidden="true"><div class="a"></div><div class="b"></div></div>`).join("") + `<span class="sr">Loading your tools</span>`;
    } else if (!rowsOf(state.tab).length) {
      const demoBtn = !state.items.length && !state.demo && !state.readonly ? `<button class="btn primary" data-act="demo" type="button">See a sample box</button><small>Fills in a pretend box so you can look around. Nothing is saved.</small>` : "";
      list.innerHTML = state.readonly
        ? `<div class="empty"><strong>${state.shareInfo ? "Nothing here yet" : "Link not found"}</strong><span>${state.shareInfo ? "This box doesn't have any tools on this list yet." : "Ask whoever sent it for a new link."}</span></div>`
        : state.tab === "owned"
        ? `<div class="empty">${ICON.tool.replace("<svg", '<svg width="44" height="44"')}<strong>No tools yet</strong><span>Type a part number above to add your first tool, or paste a whole list of them. Its eBay price usually fills in on its own within half an hour.</span>${demoBtn}</div>`
        : `<div class="empty"><strong>Wishlist is empty</strong><span>Find a tool in the Shop box above and add it by part number.</span>${demoBtn}</div>`;
    } else {
      const rows = filtered();
      list.innerHTML = !rows.length ? `<div class="empty"><strong>No matches</strong><span>Nothing matches that search or category.</span></div>`
        : view === "drawers" ? drawersHtml(rows)
        : rows.map((r, i) => (view === "list" ? rowItem : state.tab === "owned" ? cardOwned : cardWish)(r, Math.min(i, 12))).join("");
    }
    clearTimeout(saveCache._t); saveCache._t = setTimeout(saveCache, 1200);
    state.flash = null;
    announceCount();
    renderRail(); renderInsights(); renderWatch(); schedulePoll();
    // first load, tab switches and view switches deal the cards in again
    if (state.loaded && rowsOf(state.tab).length && !state.introDone) {
      state.introDone = true;
      [list, $("insights")].forEach((el) => el.classList.add("intro"));
      clearTimeout(render._intro);
      render._intro = setTimeout(() => [list, $("insights")].forEach((el) => el.classList.remove("intro")), 2000);
    }
    moveInk();
    if (routePending && state.loaded) { routePending = false; applyRoute(); }
  }

  function setCount(el, n) {
    const prev = el.textContent; el.textContent = n;
    if (state.loaded && prev !== String(n) && el._seen) { el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); }
    if (state.loaded) el._seen = true;
  }

  // the tab underline slides to whichever drawer is open
  const tabsEl = document.querySelector(".tabs");
  function moveInk() {
    const t = document.querySelector('.tab[aria-selected="true"]'), ink = $("tabInk");
    if (!t || !ink) return;
    ink.style.width = t.offsetWidth + "px";
    ink.style.transform = `translateX(${t.offsetLeft}px)`;
    if (!tabsEl.classList.contains("inked")) { tabsEl.classList.add("inked"); requestAnimationFrame(() => requestAnimationFrame(() => tabsEl.classList.add("ready"))); }
  }
  window.addEventListener("resize", moveInk);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveInk);

  // Screen readers hear a short count after the list settles, not every card on every keystroke.
  let announceTimer = 0;
  function announceCount() {
    clearTimeout(announceTimer);
    if (!state.loaded) return;
    announceTimer = setTimeout(() => {
      const all = rowsOf(state.tab).length, shown = all ? filtered().length : 0;
      const what = state.tab === "owned" ? "in your box" : "on your wishlist";
      const text = !all ? `Nothing ${what} yet` : shown === all ? `${all} tool${all === 1 ? "" : "s"} ${what}` : `${shown} of ${all} tools ${what} match`;
      if ($("listStatus").textContent !== text) $("listStatus").textContent = text;
    }, 500);
  }

  function renderRail() {
    const owned = rowsOf("owned");
    const rows = owned.slice().sort((a, b) => String(addedAt(b)).localeCompare(String(addedAt(a)))).slice(0, 12);
    $("railWrap").hidden = !rows.length;
    if (!rows.length) return;
    const withPh = owned.filter(photoOf).length;
    $("railCount").textContent = `${owned.length} tool${owned.length === 1 ? "" : "s"}${withPh ? ` · ${withPh} with your photos` : ""}`;
    if (!state.railIntro) { state.railIntro = true; $("rail").classList.add("intro"); setTimeout(() => $("rail").classList.remove("intro"), 2200); }
    $("rail").innerHTML = rows.map((r, i) => { const p = photoOf(r), pr = worthOf(r);
      return `<button class="shot" type="button" data-id="${esc(r.id)}" style="--i:${i}"><span class="plate${p ? "" : " art-bg"}">${p ? imgTag(p, displayName(r)) : artTag(artOf(r))}</span><span class="cap">${esc(displayName(r))}</span><span class="pr">${pr ? money(pr, pr % 1) : esc(r.part_number || "")}</span></button>`; }).join("");
  }

  // A "?" beside a panel's title opens a short, plain explanation of what the panel shows.
  // Which ones are open is remembered, so they stay open when the panels redraw.
  const helpOpen = new Set();
  const phead = (title, key, text) => `<div class="phead"><h2>${title}</h2><button class="qmark" type="button" data-help="${key}" aria-expanded="${helpOpen.has(key)}" aria-controls="help-${key}" aria-label="What's this?">?</button></div><p class="explain" id="help-${key}"${helpOpen.has(key) ? "" : " hidden"}>${text}</p>`;
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-help]"); if (!b) return;
    const k = b.dataset.help, on = !helpOpen.has(k);
    on ? helpOpen.add(k) : helpOpen.delete(k);
    b.setAttribute("aria-expanded", on);
    const p = document.getElementById("help-" + k); if (p) p.hidden = !on;
  });
  function activity() {
    const ev = [], nm = (r) => `<strong>${esc(displayName(r))}</strong>`;
    state.items.forEach((r) => {
      const t = addedAt(r);
      if (t) ev.push({ t, kind: r.list === "wishlist" ? "wish" : r.from_wishlist ? "wish" : "add", r, html: r.list === "wishlist" ? `Put ${nm(r)} on the wishlist` : r.from_wishlist ? `Bought ${nm(r)} off the wishlist` : `Added ${nm(r)} to the box` });
      const h = hist(r);
      for (let i = 1; i < h.length; i++) if (h[i].p !== h[i - 1].p) {
        const d = h[i].p - h[i - 1].p;
        ev.push({ t: h[i].d, kind: d < 0 ? "down" : "up", r, html: `${nm(r)} ${d < 0 ? "dropped" : "went up"} <span class="chg ${d < 0 ? "down" : "up"}">${money(Math.abs(d), true)}</span>` });
      }
      if (r.photo_at && hasMine(r)) ev.push({ t: r.photo_at, kind: "photo", r, html: `New photo of ${nm(r)}` });
    });
    return ev.sort((a, b) => String(b.t).localeCompare(String(a.t))).slice(0, 7);
  }
  function feedHtml() {
    const ev = activity();
    const icon = (e) => { const p = e.r && ["add", "photo", "wish"].includes(e.kind) ? photoOf(e.r) : null; return p ? `<span class="ic img">${imgTag(p, "")}</span>` : `<span class="ic ${e.kind}">${{ add: ICON.add, wish: ICON.star, down: ICON.down, up: ICON.up, photo: ICON.cam, check: ICON.check }[e.kind]}</span>`; };
    if (!ev.length) return "";
    return `<div class="panel feed">${phead(`<span class="live" aria-hidden="true"></span>Recent activity`, "feed", "The latest things that happened in your box: tools you added or bought, new photos, and eBay price changes on your tools.")}<ol>${ev.map((e) => `<li>${icon(e)}<span class="what">${e.html}</span><span class="when">${rel(e.t)}</span></li>`).join("")}</ol></div>`;
  }
  function renderInsights() {
    const box = $("insights");
    if (state.tab === "owned") {
      const totals = {};
      rowsOf("owned").forEach((r) => { const d = deptOf(catOf(r)); totals[d] = (totals[d] || 0) + worthAll(r); });
      const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]), max = entries.length ? entries[0][1] : 0;
      const warranty = rowsOf("owned").filter((r) => r.condition === "Needs warranty");
      const html = feedHtml()
        + (entries.length ? `<div class="panel">${phead("Worth by department", "dept", "What your tools are worth today, added up by type of tool. Each tool counts at its Snap-on list price when there is one, otherwise its eBay price, otherwise what you paid.")}${entries.map(([c, v]) => `<div class="cat"><div class="line"><span>${esc(c)}</span><span class="num">${money(Math.round(v))}</span></div><div class="bar"><span style="width:${max ? Math.max(3, (v / max) * 100) : 0}%"></span></div></div>`).join("")}</div>` : "")
        + valueChartHtml()
        + runsHtml()
        + yearsHtml()
        + (warranty.length ? `<div class="panel">${phead("Warranty pile", "warranty", "Snap-on hand tools have a lifetime warranty: take a broken one to the truck and they swap it for a new one. Tap <strong>Broken</strong> on a tool to put it here, send the list to your dealer, then tap <strong>Swapped</strong> when you get the new one.")}${warranty.map((r) => `<div class="cat"><div class="line"><span>${esc(displayName(r))}${r.part_number ? ` <span class="pn">${esc(r.part_number)}</span>` : ""}</span>${state.readonly ? "" : `<button class="btn small ghost" type="button" data-swap="${esc(r.id)}">Swapped</button>`}</div></div>`).join("")}<span class="meta-line">Take these to the truck next time it stops.</span><div class="warr-actions"><button class="btn small primary" type="button" data-warr="share">${navigator.share ? "Send list" : "Copy list"}</button><button class="btn small" type="button" data-warr="print">Print</button></div></div>` : "")
        + whoHasHtml();
      const gaps = sizeRuns().reduce((n, g) => n + g.miss.length, 0);
      box.innerHTML = html; showStats(html, [warranty.length ? `${warranty.length} need${warranty.length === 1 ? "s" : ""} warranty` : "", gaps ? `${gaps} size${gaps === 1 ? "" : "s"} missing` : "", entries.length ? `${entries.length} department${entries.length === 1 ? "" : "s"}` : ""]);
    } else {
      const wl = rowsOf("wishlist");
      const next = wl.filter((r) => wishCost(r) > 0).sort((a, b) => PRIS.indexOf(a.priority || "Want") - PRIS.indexOf(b.priority || "Want") || (wishCost(a) - (Number(a.saved) || 0)) - (wishCost(b) - (Number(b.saved) || 0)))[0];
      const pr = PRIS.map((p) => [p, wl.filter((r) => (r.priority || "Want") === p).reduce((s, r) => s + wishCost(r), 0)]);
      const html = feedHtml()
        + (next ? `<div class="panel">${phead("Next up", "next", "The wishlist tool to get next: your highest priority, with the least left to save. The bar shows how much you've saved toward it so far.")}<div class="nextup">${thumb(next)}<div class="cat"><strong>${esc(displayName(next))}</strong><span class="meta-line">${money(Math.max(wishCost(next) - (Number(next.saved) || 0), 0))} left of ${money(wishCost(next))}</span><div class="bar"><span style="width:${Math.min(100, Math.round(((Number(next.saved) || 0) / wishCost(next)) * 100))}%"></span></div></div></div></div>` : "")
        + whenHtml()
        + (wl.length ? `<div class="panel">${phead("By priority", "priority", "What your wishlist adds up to for each priority: Need, Want and Someday.")}${pr.map(([p, v]) => `<div class="cat"><div class="line"><span>${p}</span><span class="num">${money(Math.round(v))}</span></div></div>`).join("")}</div>` : "");
      box.innerHTML = html; showStats(html, [next ? `Next up: ${displayName(next)}` : "", `${wl.length} on the wishlist`]);
    }
  }

  /* ---------- box value over time (from the shared price history) ---------- */
  function valueSeries() {
    const owned = rowsOf("owned");
    if (!owned.length) return [];
    const dayOf = (v) => String(v || "").slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const tools = owned.map((r) => ({ from: dayOf(r.date_bought) || dayOf(r.created_at) || today, h: hist(r), paid: Number(r.price) || 0, n: qtyOf(r) }));
    let start = tools.reduce((m, t) => (t.from < m ? t.from : m), today);
    const histStart = tools.flatMap((t) => t.h.map((x) => x.d)).sort()[0];
    if (histStart && histStart > start) start = histStart; // before any price was tracked there's nothing to chart but what you paid
    const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
    if (start < yearAgo) start = yearAgo;
    const days = [];
    for (let d = new Date(start + "T00:00:00Z"); d.toISOString().slice(0, 10) <= today; d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
    if (days.length < 2) return [];
    const step = Math.max(1, Math.ceil(days.length / 120));
    const pick = days.filter((_, i) => i % step === 0 || i === days.length - 1);
    return pick.map((d) => ({ d, v: tools.reduce((s, t) => {
      if (t.from > d) return s;
      let p = null; for (const x of t.h) { if (x.d <= d) p = x.p; else break; }
      if (p == null && t.h.length) p = t.h[0].p;
      return s + (p ?? t.paid) * t.n;
    }, 0) }));
  }
  function valueChartHtml() {
    const pts = valueSeries();
    if (pts.length < 2 || state.readonly) return "";
    const vs = pts.map((p) => p.v), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || Math.max(hi * 0.1, 1);
    const W = 300, H = 100, x = (i) => (i / (pts.length - 1)) * W, y = (v) => H - 6 - ((v - lo) / span) * (H - 16);
    const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
    const first = pts[0], last = pts[pts.length - 1], diff = Math.round(last.v - first.v);
    const fmt = (d) => new Date(d + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `<div class="panel">${phead("Box value over time", "value", "How the total worth of your box has moved, using each tool's eBay price history. Tools without an eBay price count at what you paid.")}<svg class="valchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Box value went from ${money(Math.round(first.v))} to ${money(Math.round(last.v))}"><polygon class="area" points="0,${H} ${line} ${W},${H}"/><polyline class="ln" points="${line}"/></svg><div class="valrow"><span>${fmt(first.d)} · ${money(Math.round(first.v))}</span><span>${diff ? `<span class="delta ${diff > 0 ? "up" : "down"}">${signed(diff)}</span> · ` : ""}today ${money(Math.round(last.v))}</span></div><span class="meta-line">Uses eBay prices; tools without one count at what you paid.</span></div>`;
  }

  /* ---------- sizes missing from a run ----------
     Own FM10, FM12 and FM13 and the gap is FM11: same letters before and after the size, so the same kind
     of socket or wrench. Only gaps inside what you already have count, so it never guesses at sizes past
     your biggest or below your smallest. Three-digit numbers carry a style digit (FS121 is 12/32" + 1). */
  const RUN_KIND = { socket: "sockets", "socket-12": "12-point sockets", "socket-deep": "deep sockets", "socket-impact": "impact sockets", "socket-swivel": "swivel sockets" };
  function sizeRuns() {
    const groups = new Map();
    rowsOf("owned").forEach((r) => {
      const pn = r.part_number || "", g = pnGuess(pn);
      if (!g || !g.size || !/^(socket|wrench)/.test(g.key) || /^socket-(bit|spark|o2)/.test(g.key)) return;
      const m = pn.match(/^([A-Z]+?)(\d{1,3})([A-Z]*)$/); if (!m) return;
      const metric = /mm/.test(g.size), three = m[2].length === 3;
      if (three && !/[012]$/.test(m[2])) return;
      const n = three ? Math.floor(+m[2] / 10) : +m[2], style = three ? m[2].slice(-1) : "";
      if (!metric && !three && n > (SAE_MAX[g.drive] || 48)) return; // a 2-digit number with a style digit: too unsure
      const k = `${m[1]}|${style}|${m[3]}`;
      const grp = groups.get(k) || { pre: m[1], style, suf: m[3], metric, key: g.key, drive: g.drive, have: new Set() };
      grp.have.add(n); groups.set(k, grp);
    });
    const out = [];
    for (const grp of groups.values()) {
      if (grp.have.size < 2) continue;
      const sizes = [...grp.have].sort((a, b) => a - b), lo = sizes[0], hi = sizes[sizes.length - 1];
      const step = grp.metric || sizes.some((x) => x % 2) ? 1 : 2; // inch sockets go up by 1/16" (2/32) unless you own odd ones
      const all = []; for (let x = lo; x <= hi; x += step) all.push(x);
      const miss = all.filter((x) => !grp.have.has(x));
      if (!miss.length || miss.length > 8) continue;
      const pn = (x) => grp.pre + x + grp.style + grp.suf, label = (x) => (grp.metric ? x + "mm" : inch32(x).replace('"', ""));
      out.push({ ...grp, all: all.map((x) => ({ pn: pn(x), label: label(x), have: grp.have.has(x) })), miss: miss.map(pn) });
    }
    return out;
  }
  function runsHtml() {
    const runs = sizeRuns();
    if (!runs.length) return "";
    return `<div class="panel runs">${phead("Gaps in your sets", "gaps", "Looks at single sockets and wrenches you own from the same line (the same letters in the part number) and finds the sizes missing in between. For example, if you own FSM10, FSM12 and FSM13, then FSM11 is missing. Tap the button to put the missing ones on your wishlist.")}${runs.map((g) => {
      const what = `${g.drive ? g.drive + " " : ""}${g.metric ? "metric " : ""}${/^wrench/.test(g.key) ? "wrenches" : RUN_KIND[g.key] || "sockets"}`;
      return `<div class="run"><div class="line"><span><span class="pn">${esc(g.pre)}…${esc(g.style + g.suf)}</span> ${esc(what)}</span><span class="num">${g.all.length - g.miss.length} of ${g.all.length}</span></div>
        <div class="sizes">${g.all.map((x) => `<span class="sz${x.have ? " have" : ""}" title="${esc(x.pn)}${x.have ? "" : " missing"}">${esc(x.label)}</span>`).join("")}</div>
        ${state.readonly ? "" : `<button class="btn small" type="button" data-runadd="${esc(g.miss.join(" "))}">Add ${g.miss.length === 1 ? g.miss[0] : `the ${g.miss.length} missing`} to wishlist</button>`}</div>`;
    }).join("")}<span class="meta-line">Part numbers are worked out from the ones you own. Check them on the truck before you buy.</span></div>`;
  }

  /* ---------- your box by year: what went in, what you paid, what it's worth now ---------- */
  function yearsHtml() {
    if (state.readonly) return "";
    const by = {};
    rowsOf("owned").forEach((r) => {
      const y = String(r.date_bought || r.created_at || "").slice(0, 4); if (!/^\d{4}$/.test(y)) return;
      const b = by[y] || (by[y] = { n: 0, paid: 0, worth: 0 });
      b.n += qtyOf(r); b.paid += (Number(r.price) || 0) * qtyOf(r); b.worth += worthAll(r);
    });
    const years = Object.keys(by).sort().reverse();
    if (!years.length) return "";
    const anyPaid = years.some((y) => by[y].paid > 0), val = (b) => (anyPaid ? b.paid : b.worth), max = Math.max(1, ...years.map((y) => val(by[y])));
    return `<div class="panel">${phead("Your box by year", "years", "Your tools grouped by the year you bought them, with what you paid that year and what they're worth now. Handy at tax time. If you haven't entered what you paid, it shows what they're worth today instead.")}${years.map((y) => { const b = by[y];
      return `<div class="cat"><div class="line"><span>${y} · ${b.n} tool${b.n === 1 ? "" : "s"}</span><span class="num">${anyPaid ? `${money(Math.round(b.paid))} spent` : `${money(Math.round(b.worth))} today`}</span></div><div class="bar"><span style="width:${Math.max(3, (val(b) / max) * 100)}%"></span></div>${anyPaid && b.worth ? `<span class="meta-line">Worth ${money(Math.round(b.worth))} today</span>` : ""}</div>`; }).join("")}
      <span class="meta-line">${anyPaid ? "Handy at tax time if you write off your tools." : "Add what you paid to a tool to see what you spent each year."}</span></div>`;
  }

  /* ---------- wishlist: when each tool fits on the truck account ----------
     One tool at a time, in priority order, each on its own 8 to 10 week plan that starts when the one
     before it (or what you owe now) is paid off. Uses your truck account's pay interval and interest. */
  function whenPlan() {
    const wl = rowsOf("wishlist").filter((r) => (r.priority || "Want") !== "Someday" && wishCost(r) - (Number(r.saved) || 0) > 0)
      .sort((a, b) => PRIS.indexOf(a.priority || "Want") - PRIS.indexOf(b.priority || "Want") || (wishCost(a) - (Number(a.saved) || 0)) - (wishCost(b) - (Number(b.saved) || 0)));
    if (!wl.length) return null;
    const t = state.readonly ? null : truckPlanned(getTruck());
    const owing = !!t && Number(t.balance) > 0 && !!t.end && t.end > today();
    let start = owing ? t.end : today();
    const every = t && PAY_EVERY[t.every] ? t.every : "weekly", weeks = t && t.weeks ? clampWeeks(t.weeks) : TRUCK_MAX_WEEKS, apr = (t && t.apr) || 0;
    const rows = wl.slice(0, 5).map((r) => { const p = truckPlan(round2(wishCost(r) - (Number(r.saved) || 0)), apr, every, weeks, start); start = p.end; return { r, p }; });
    return { rows, owing, t, every, weeks };
  }
  function whenHtml() {
    const w = whenPlan(); if (!w || state.readonly) return "";
    const ev = PAY_EVERY[w.every];
    return `<div class="panel plan-ahead">${phead("When you can get it", "when", "If you buy your wishlist off the truck one tool at a time, this shows when each one could start and when it would be paid off, always within your 8 to 10 weeks. It starts once what you owe now is paid off, uses your truck account's payment and interest, and goes Need first, then Want. Someday tools are left out.")}<span class="meta-line">${w.owing ? `Your truck account is paid off ${fmtDate(w.t.end, false)}. After that, one tool at a time, each paid off in ${w.weeks} weeks:` : `One tool at a time, each paid off in ${w.weeks} weeks:`}</span>
      <ol>${w.rows.map(({ r, p }) => `<li>${thumb(r)}<span class="what"><strong>${esc(displayName(r))}</strong><span class="meta-line">From ${fmtDate(p.start, false)} · ${money(p.pay, true)} ${ev.label}</span></span><span class="when-end">done ${fmtDate(p.end, false)}</span></li>`).join("")}</ol>
      ${w.t ? "" : `<span class="meta-line">Set up your truck account to use your own pay day and interest.</span>`}</div>`;
  }

  /* ---------- box check: go through the box drawer by drawer and see what's missing ----------
     Tools are grouped by where they're kept (or their department when that's blank). What you've ticked
     is kept in this browser only, so you can stop halfway and carry on later. */
  const checkDlg = $("checkDlg"), CHECK_LS = () => `${LS}-check-${state.demo ? "demo" : state.user ? state.user.id : "local"}`;
  const checkGet = () => { try { return new Set(JSON.parse(localStorage.getItem(CHECK_LS()) || "[]")); } catch { return new Set(); } };
  const checkSet = (ids) => { try { localStorage.setItem(CHECK_LS(), JSON.stringify([...ids])); } catch {} };
  function renderCheck() {
    const found = checkGet(), only = $("ck-missing").checked, rows = rowsOf("owned");
    const isFound = (r) => found.has(String(r.id)) || !!r.lent_to;
    const groups = {};
    rows.forEach((r) => { const g = (r.location || "").trim() || deptOf(catOf(r)); (groups[g] || (groups[g] = [])).push(r); });
    const n = rows.filter(isFound).length, all = rows.length;
    $("ck-bar").firstElementChild.style.width = (all ? (n / all) * 100 : 0) + "%";
    $("ck-count").innerHTML = !all ? "Add some tools first." : n === all ? `<strong>All ${all} found.</strong> Nothing's missing.` : `<strong>${n} of ${all}</strong> found · ${all - n} still to find`;
    $("ck-list").innerHTML = Object.keys(groups).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((g) => {
      const list = groups[g].sort((a, b) => displayName(a).localeCompare(displayName(b))), left = list.filter((r) => !isFound(r)).length;
      const show = only ? list.filter((r) => !isFound(r)) : list;
      if (!show.length) return "";
      return `<section class="ck-group"><h3>${esc(g)}<span class="count">${left ? `${left} left` : "✓"}</span></h3>${show.map((r) => {
        const f = isFound(r);
        return `<button type="button" class="ck-row${f ? " on" : ""}" data-ck="${esc(r.id)}" aria-pressed="${f}"${r.lent_to ? " disabled" : ""}>${thumb(r)}<span class="what"><strong>${esc(displayName(r))}${qtyOf(r) > 1 ? ` ×${qtyOf(r)}` : ""}</strong><span class="meta-line">${esc([r.part_number, r.lent_to ? `lent to ${r.lent_to}` : ""].filter(Boolean).join(" · "))}</span></span><span class="tick" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg></span></button>`;
      }).join("")}</section>`;
    }).join("") || (only && all ? `<p class="meta-line">Everything's been found.</p>` : "");
  }
  function openCheck() {
    renderCheck();
    checkDlg.showModal();
    routeOpen(checkDlg, "/box-check", "Box check");
  }
  $("boxCheck").onclick = () => { if (!rowsOf("owned").length) return toast("Add some tools first, then you can check your box."); openCheck(); };
  $("ck-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ck]"); if (!b) return;
    const ids = checkGet(), id = b.dataset.ck, on = !ids.has(id);
    on ? ids.add(id) : ids.delete(id);
    checkSet(ids);
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", on);
    if (on && navigator.vibrate) try { navigator.vibrate(8); } catch {}
    // the row ticks right away; the counts catch up a moment later so a fast run of taps stays smooth
    clearTimeout(renderCheck._t); renderCheck._t = setTimeout(renderCheck, $("ck-missing").checked ? 450 : 0);
  });
  $("ck-missing").addEventListener("change", renderCheck);
  $("ck-reset").onclick = () => { checkSet(new Set()); renderCheck(); toast("Box check started over"); };
  $("ck-done").onclick = () => {
    const found = checkGet(), miss = rowsOf("owned").filter((r) => !found.has(String(r.id)) && !r.lent_to);
    checkDlg.close();
    toast(!miss.length ? "Box check done. Everything's there." : `${miss.length} not found yet: ${miss.slice(0, 3).map(displayName).join(", ")}${miss.length > 3 ? "…" : ""}`);
  };

  /* ---------- warranty list: send to the dealer or print ---------- */
  function warrantyText() {
    const rows = rowsOf("owned").filter((r) => r.condition === "Needs warranty");
    return "Warranty list\n" + rows.map((r) => `- ${displayName(r)}${r.part_number ? ` (${r.part_number})` : ""}${r.notes ? ` - ${r.notes}` : ""}`).join("\n");
  }
  $("insights").addEventListener("click", async (e) => {
    const sw = e.target.closest("[data-swap]");
    if (sw) return itemAct("swapped", sw.dataset.swap, sw);
    const ra = e.target.closest("[data-runadd]");
    if (ra) { if (await addMany(ra.dataset.runadd.split(" "), "wishlist")) burst(...centerOf(ra), 14); return; }
    const b = e.target.closest("[data-warr]"); if (!b) return;
    const text = warrantyText();
    if (b.dataset.warr === "share") {
      if (navigator.share) { try { await navigator.share({ title: "Warranty list", text }); } catch {} return; }
      try { await navigator.clipboard.writeText(text); toast("Warranty list copied. Paste it in a text to your dealer."); } catch { toast("Couldn't copy. Try Print instead."); }
      return;
    }
    const w = window.open("", "_blank");
    if (!w) return toast("Allow pop-ups to print the warranty list.");
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Warranty list</title><body style="font:16px system-ui;padding:24px"><h1 style="font-size:22px">Warranty list</h1><ol>${rowsOf("owned").filter((r) => r.condition === "Needs warranty").map((r) => `<li style="margin:6px 0"><strong>${esc(displayName(r))}</strong>${r.part_number ? ` &nbsp;<code>${esc(r.part_number)}</code>` : ""}${r.notes ? `<br><small>${esc(r.notes)}</small>` : ""}</li>`).join("")}</ol><script>print()<\/script>`);
    w.document.close();
  });

  function showStats(html, bits) {
    $("stats").hidden = !html;
    const ev = activity().length;
    $("statsPeek").textContent = [ev ? "Recent activity" : "", ...bits].filter(Boolean).join(" · ");
  }
  // Stats are one tap-to-open row, so the list comes first. They stay open once you open them,
  // and the Money screen always shows them open.
  const STATS_KEY = "bx-stats-open";
  const statsPref = () => { try { return localStorage.getItem(STATS_KEY) === "1"; } catch { return false; } };
  $("stats").open = statsPref();
  $("stats").addEventListener("toggle", () => { if (state.money) return; try { localStorage.setItem(STATS_KEY, $("stats").open ? "1" : "0"); } catch {} });

  // Snap-on's store search folds to one row once you have tools, until you open it.
  function syncShop(anyItems) {
    const open = state.shopOpen ?? !anyItems;
    document.querySelector(".shop").classList.toggle("folded", !open);
    $("shopToggle").setAttribute("aria-expanded", open);
  }
  $("shopToggle").onclick = () => {
    state.shopOpen = $("shopToggle").getAttribute("aria-expanded") !== "true";
    syncShop();
    if (state.shopOpen) $("shopQ").focus();
  };

  // Phones: category and sort fold under one Filter button next to search.
  $("fMore").onclick = () => {
    const open = $("toolbar").classList.toggle("filters-open");
    $("fMore").setAttribute("aria-expanded", open);
    if (open) $("fCat").focus();
  };

  function renderWatch() {
    const changes = state.items.map((r) => ({ r, ch: lastChange(r) })).filter((x) => x.ch).sort((a, b) => String(b.ch.d).localeCompare(String(a.ch.d)) || (a.ch.to - a.ch.from) - (b.ch.to - b.ch.from));
    const trackedN = state.items.filter((r) => r.part_number).length;
    const wishN = rowsOf("wishlist").length;
    $("watch").innerHTML = changes.length
      ? `<ul>${changes.slice(0, 5).map(({ r, ch }) => `<li>${thumb(r)}<span class="nm">${r.list === "wishlist" ? "★ " : ""}${esc(displayName(r))}</span><span class="delta ${ch.to < ch.from ? "up" : "down"}">${ch.to < ch.from ? "↓" : "↑"} ${money(Math.abs(ch.to - ch.from), true)}</span></li>`).join("")}</ul><span class="note">Based on eBay prices.</span>`
      : `<div class="watch-empty"><span class="note">${trackedN ? `eBay prices for your ${trackedN} part number${trackedN === 1 ? "" : "s"} refresh every few hours.` : "Add tools by part number and their eBay prices fill in on their own."}</span>${!wishN && state.loaded ? `<button class="btn-watch" type="button" data-watch-go>Start a wishlist →</button>` : ""}</div>`;
    if (trackedN && !state.readonly) {
      const pns = state.items.filter((r) => r.part_number), withList = pns.filter((r) => listPrice(r) != null).length;
      $("watch").insertAdjacentHTML("beforeend", `<div class="watch-empty"><span class="note">${withList} of ${pns.length} tool${pns.length === 1 ? "" : "s"} have a Snap-on list price.</span>${state.admin ? `<button class="btn-watch" type="button" data-list-prices>Manage list prices →</button>` : ""}</div>`);
    }
    $("watch").insertAdjacentHTML("beforeend", EMAIL_ALERTS_READY && signedIn() && !state.demo && !state.readonly
      ? `<label class="alert-opt"><input type="checkbox" id="alertDrops"${state.alerts && state.alerts.email_drops ? " checked" : ""}><span>Email me when something on my wishlist drops</span></label>` : "");
    $("sync").dataset.mode = signedIn() ? "account" : "local";
    $("syncText").textContent = !state.loaded ? "Loading…" : state.readonly ? "Shared box" : state.demo ? "Sample box · not saved" : state.offline ? "Offline · last saved copy" : signedIn() ? "Synced to your account" : sb ? "Saved in this browser" : "Offline";
  }


  /* ---------- photos ---------- */
  async function shrink(file, max, quality) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      return await new Promise((res) => c.toBlob(res, "image/jpeg", quality));
    } catch { return /^image\/(jpeg|png|webp)$/.test(file.type) ? file : null; }
  }
  async function makeThumb(blob, path) {
    if (!state.dbArt) return; // thumbnails start once the database stops counting them toward the photo limit
    const t = await shrink(blob, 480, 0.74);
    if (t) await sb.storage.from("tool-photos").upload(thumbOf(path), t, { contentType: "image/jpeg", upsert: true }).catch(() => {});
  }
  async function uploadBlob(blob) {
    const path = `${state.user.id}/${newId()}.jpg`;
    const { error } = await sb.storage.from("tool-photos").upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
    if (error) throw error;
    await makeThumb(blob, path); // a missing thumbnail only means the card loads the full photo
    return path;
  }
  async function photoFields(file) {
    if (state.demo) throw { code: "demo" };
    if (signedIn()) {
      const blob = await shrink(file, 1600, 0.85);
      if (!blob) throw { code: "type" };
      if (blob.size > 3 * 1024 * 1024) throw { code: "big" };
      return { photo_path: await uploadBlob(blob), photo_at: new Date().toISOString() };
    }
    const blob = await shrink(file, 900, 0.8);
    if (!blob) throw { code: "type" };
    const data = await new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = rej; f.readAsDataURL(blob); });
    return { photo_data: data, photo_at: new Date().toISOString() };
  }
  const PHOTO_ERR = { demo: "Photos are off in the sample box. Start your own box to add photos.", type: "That photo format isn't supported. Try a JPG or PNG.", big: "That photo is too big. Try a smaller one.", quota: "This browser is out of room for photos. Sign in to store photos in your account.", limit: "You've reached the limit of 300 photos per account. Remove some photos to add more." };
  const photoErr = (e) => {
    if (e && PHOTO_ERR[e.code]) return PHOTO_ERR[e.code];
    const msg = String((e && e.message) || "");
    if (/row-level security/i.test(msg)) return PHOTO_ERR.limit;
    if (/maximum allowed size|too large/i.test(msg)) return PHOTO_ERR.big;
    return "Couldn't save that photo. Try again.";
  };
  // Messages the database writes for people (limits, price rules) are shown as they are.
  const dbMsg = (e) => (e && e.code === "P0001" && e.message ? e.message : null);
  function dropOldPhoto(oldPath, newPath) { if (signedIn() && oldPath && oldPath !== newPath) sb.storage.from("tool-photos").remove([oldPath, thumbOf(oldPath)]).catch(() => {}); }

  let photoTarget = null;
  function pickPhotoFor(id) { photoTarget = id; $("photoInput").value = ""; $("photoInput").click(); }
  $("photoInput").addEventListener("change", async () => {
    const file = $("photoInput").files[0], id = photoTarget; photoTarget = null;
    const item = state.items.find((r) => r.id === id);
    if (!file || !item) return;
    state.uploading[id] = true; render();
    try {
      const fields = await photoFields(file);
      await saveItem({ ...item, ...fields });
      dropOldPhoto(item.photo_path, fields.photo_path);
      toast("Photo saved. It's only shown to you.");
    } catch (e) { toast(photoErr(e)); }
    finally { delete state.uploading[id]; render(); }
  });

  const viewer = $("viewer");
  let viewing = null;
  function openViewer(id) {
    const r = state.items.find((x) => x.id === id); if (!r) return;
    const p = photoOf(r);
    viewing = id;
    const pr = r.list === "owned" ? worthOf(r) : wishCost(r);
    $("vName").textContent = displayName(r);
    $("vImg").classList.remove("zoom");
    viewer.classList.toggle("showroom", !p);
    if (p) {
      $("vImg").innerHTML = imgTag(p, displayName(r), true).replace(' loading="lazy"', "");
      $("vMeta").textContent = [r.part_number, pr ? money(pr, pr % 1) : "", state.readonly ? "Photo" : "Your photo"].filter(Boolean).join(" · ");
      $("vHint").textContent = "· Click the photo to zoom";
      $("vPhoto").textContent = "Replace photo";
    } else {
      // no photo yet: the drawing on a showroom floor, lit by a light you can move around
      const a = artOf(r);
      $("vImg").innerHTML = `<div class="stage art-bg" id="vStage">${artTag(a, "", { refl: true })}</div>`;
      $("vMeta").textContent = [r.part_number, pr ? money(pr, pr % 1) : "", a.label].filter(Boolean).join(" · ");
      $("vHint").textContent = matchMedia("(hover: hover)").matches ? "· Move the pointer to light it" : "· Drag to move the light";
      $("vPhoto").textContent = "Add your photo";
      showroomLight(true);
      // tools with a 3D model swap the drawing for the model, which you can spin around
      load3d().then((t) => {
        if (!t || !t.has(a.key) || viewing !== id || !viewer.open || !$("vStage")) return;
        showroomLight(false);
        const stop = t.viewer($("vStage"), ...m3dOf(a).split("|"));
        if (!stop) return;
        $("vStage").classList.add("is3d"); $("vHint").textContent = "· Drag to spin it";
        viewer.addEventListener("close", stop, { once: true });
      });
    }
    $("vPhoto").hidden = state.readonly || state.demo;
    // the same things the card's buttons do, so a phone's compact list doesn't need a row of buttons per tool
    const del = `<button class="btn small ghost danger" type="button" data-vact="del">Delete</button>`, edit = `<button class="btn small" type="button" data-vact="edit">Edit</button>`;
    const acts = state.readonly ? "" : r.list === "owned"
      ? (r.lent_to ? `<button class="btn small" type="button" data-vact="returned">Got it back</button>` : `<button class="btn small" type="button" data-vact="lend">Lend</button>`)
        + (r.condition === "Needs warranty" ? `<button class="btn small" type="button" data-vact="swapped" title="You got the new one: take it off the warranty list">Swapped</button>` : `<button class="btn small" type="button" data-vact="broken" title="Put it on your warranty list to swap on the truck">Broken</button>`) + edit + del
      : `<button class="btn small" type="button" data-vact="bought">Bought it</button>` + edit + del;
    $("vActs").innerHTML = acts; $("vActs").hidden = !acts;
    viewer.showModal();
    routeOpen(viewer, `/tool/${encodeURIComponent(id)}/${slug(displayName(r)) || "tool"}`, displayName(r));
  }
  /* ---------- real 3D models (tool3d.js) ----------
     The 3D engine is big, so it loads after the page is up. Until then, and on devices without 3D
     graphics, every tool shows its drawing. Once loaded, drawings of tools that have a model are
     swapped for a picture of the model, made once per kind and size of tool. */
  let t3 = null;
  const load3d = () => t3 || (t3 = (() => {
    try { const c = document.createElement("canvas"); if (!(c.getContext("webgl2") || c.getContext("webgl"))) return Promise.resolve(null); } catch (e) { return Promise.resolve(null); }
    return import("/tool3d.js").catch(() => null);
  })());
  function upgrade3d() {
    const todo = [...document.querySelectorAll("[data-m3d]:not([data-m3d-done])")];
    if (!todo.length) return;
    load3d().then((t) => {
      if (!t) return;
      for (const el of todo) {
        el.setAttribute("data-m3d-done", "");
        const [key, size, drive, pn, look] = el.dataset.m3d.split("|");
        if (!t.has(key)) continue;
        const square = el.classList.contains("plate");
        t.picture(key, size, square ? 360 : 720, square ? 360 : 450, drive, pn, look).then((url) => {
          if (!url || !el.isConnected) return;
          const art = el.querySelector(".art"); if (!art) return;
          const img = new Image(); img.className = "m3d"; img.alt = ""; img.src = url;
          // the drawing stays until the picture is ready to paint, then fades across (no blank tile in between);
          // once it shows, the card's tool slowly turns while it's on screen (see turn() in tool3d.js)
          const show = () => { if (!el.isConnected) return; art.parentElement.appendChild(img); el.classList.add("has3d"); if (!square) t.turn?.(el, img, key, size, 720, 450, drive, pn, look); };
          (img.decode ? img.decode() : new Promise((ok) => { img.onload = ok; })).then(show, () => {});
        });
      }
    });
  }
  new MutationObserver(() => { clearTimeout(upgrade3d.t); upgrade3d.t = setTimeout(upgrade3d, 60); }).observe(document.body, { childList: true, subtree: true });
  setTimeout(upgrade3d, 300);
  // One copy of the studio lighting whose light can move: it follows the pointer over a drawing card
  // and over the showroom view, so the chrome catches the light as you move, like turning a tool in your hand.
  const liveLight = (() => {
    const base = document.getElementById("bx-3d"), live = base.cloneNode(true);
    live.id = "bx-3d-live"; base.parentNode.appendChild(live);
    const lamps = live.querySelectorAll("feDistantLight");
    // x, y: where the light is, from -0.5 (left/top) to 0.5 (right/bottom) of the drawing
    return (x, y) => {
      const az = (Math.atan2(y, x) * 180) / Math.PI, el = 64 - Math.min(1, Math.hypot(x, y) * 2) * 30;
      lamps.forEach((l) => { l.setAttribute("azimuth", az.toFixed(1)); l.setAttribute("elevation", el.toFixed(1)); });
    };
  })();
  let orbit = 0, lastTouch = 0;
  function showroomLight(on) {
    cancelAnimationFrame(orbit); orbit = 0;
    if (!on || reduce) { liveLight(-0.35, -0.35); return; }
    // while nobody is moving it, the light circles the tool twice, then rests. It moves about 12 times a
    // second rather than every frame, since each move relights the whole drawing.
    const t0 = performance.now(); let last = 0;
    const step = (t) => {
      if (!viewer.open || !viewer.classList.contains("showroom") || t - t0 > 30000) return;
      if (t - last > 80 && t - lastTouch > 2500) { last = t; const a = Math.PI * 1.25 + (t - t0) / 2400; liveLight(Math.cos(a) * 0.42, Math.sin(a) * 0.3 - 0.12); }
      orbit = requestAnimationFrame(step);
    };
    orbit = requestAnimationFrame(step);
  }
  const aimAt = (e, el) => { const b = el.getBoundingClientRect(); liveLight((e.clientX - b.left) / b.width - 0.5, (e.clientY - b.top) / b.height - 0.5); lastTouch = performance.now(); };
  $("vImg").addEventListener("pointermove", (e) => { const st = e.target.closest(".stage"); if (st) aimAt(e, st); });
  $("vImg").addEventListener("pointerdown", (e) => { const st = e.target.closest(".stage"); if (st) aimAt(e, st); });
  viewer.addEventListener("close", () => showroomLight(false));
  // Click the photo to look closer; the zoom follows the pointer.
  const zoomAt = (e) => {
    const img = $("vImg").querySelector("img"); if (!img) return;
    const r = img.getBoundingClientRect();
    img.style.setProperty("--zx", Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)) + "%");
    img.style.setProperty("--zy", Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)) + "%");
  };
  $("vImg").addEventListener("click", (e) => { if (!e.target.closest("img")) return; zoomAt(e); $("vImg").classList.toggle("zoom"); });
  $("vImg").addEventListener("pointermove", (e) => { if ($("vImg").classList.contains("zoom")) zoomAt(e); });
  $("vClose").onclick = () => viewer.close();
  viewer.addEventListener("click", (e) => { if (e.target === viewer) viewer.close(); });
  $("vPhoto").onclick = () => { const v = viewing; viewer.close(); if (v) pickPhotoFor(v); };
  // A tool with your photo opens the viewer; one showing a drawing takes you to its card.
  $("rail").addEventListener("click", (e) => {
    const b = e.target.closest(".shot"); if (!b) return;
    const r = state.items.find((x) => x.id === b.dataset.id); if (!r) return;
    if (photoOf(r)) return openViewer(r.id);
    if (state.tab !== "owned") setTab("owned");
    let card = $("list").querySelector(`[data-id="${CSS.escape(r.id)}"]`);
    if (!card && ($("q").value || $("fCat").value)) { $("q").value = ""; $("fCat").value = ""; render(); card = $("list").querySelector(`[data-id="${CSS.escape(r.id)}"]`); }
    if (!card) return;
    card.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    if (!reduce && card.animate) card.animate([{ boxShadow: "0 0 0 3px var(--accent), var(--shadow-hi)" }, { boxShadow: "0 0 0 0 transparent, var(--shadow)" }], { duration: 1600, delay: 350, easing: "ease-out" });
  });
  // Mouse users can grab the photo rail and fling it sideways.
  (() => {
    const rail = $("rail"); let down = null, moved = false;
    rail.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse" || e.button !== 0) return; down = { x: e.clientX, left: rail.scrollLeft, id: e.pointerId }; moved = false; });
    rail.addEventListener("pointermove", (e) => {
      if (!down) return;
      const dx = e.clientX - down.x;
      if (!moved && Math.abs(dx) > 5) { moved = true; rail.classList.add("dragging"); try { rail.setPointerCapture(down.id); } catch {} }
      if (moved) rail.scrollLeft = down.left - dx;
    });
    const up = () => { if (!down) return; down = null; if (moved) setTimeout(() => rail.classList.remove("dragging"), 0); };
    rail.addEventListener("pointerup", up); rail.addEventListener("pointercancel", up);
    rail.addEventListener("click", (e) => { if (moved) { e.stopImmediatePropagation(); moved = false; } }, true);
  })();

  /* ---------- who has my stuff ---------- */
  function whoHasHtml() {
    const lent = rowsOf("owned").filter((r) => r.lent_to);
    if (!lent.length || state.readonly) return "";
    const by = new Map();
    lent.forEach((r) => { const k = r.lent_to.trim(); if (!by.has(k)) by.set(k, []); by.get(k).push(r); });
    const people = [...by.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    return `<div class="panel">${phead("Who has my stuff", "lent", "Tools you've lent out and who has them. Tap <strong>Lend</strong> on a tool to add it here, and <strong>Got it back</strong> when it comes home.")}${people.map(([who, rs]) => `<div class="cat"><div class="line"><strong>${esc(who)}</strong><span class="num">${rs.length} tool${rs.length === 1 ? "" : "s"}</span></div>${rs.map((r) => `<span class="meta-line">${esc(displayName(r))} · ${lentDays(r)} day${lentDays(r) === 1 ? "" : "s"}</span>`).join("")}</div>`).join("")}</div>`;
  }

  /* ---------- truck account: balance, pay interval, interest, 8–10 week payoff ---------- */
  // Truck accounts are short: paid off in 8 to 10 weeks, never longer. The person picks how often they pay
  // and the yearly interest rate; we work out the plan. Simple interest: balance × rate × weeks ÷ 52.
  // Stored as { balance (left to pay, interest included), principal, apr, every, weeks, interest, total,
  // pay, n, start, end, dealer, log }. Signed in: the person's own auth metadata; signed out: this browser.
  const TRUCK_LS = LS + "-truck";
  const TRUCK_MIN_WEEKS = 8, TRUCK_MAX_WEEKS = 10;
  const PAY_EVERY = { weekly: { days: 7, one: "week", label: "a week" }, biweekly: { days: 14, one: "2 weeks", label: "every 2 weeks" }, monthly: { days: 365.25 / 12, one: "month", label: "a month" } };
  function getTruck() {
    if (state.demo) return state.demoTruck;
    if (signedIn()) return state.user.user_metadata?.truck || null;
    try { return JSON.parse(localStorage.getItem(TRUCK_LS)); } catch { return null; }
  }
  async function setTruck(t) {
    if (t && t.log) t.log = t.log.slice(0, 30);
    if (state.demo) state.demoTruck = t;
    else if (signedIn()) {
      const { data, error } = await sb.auth.updateUser({ data: { truck: t } });
      if (error) throw error;
      if (data && data.user) state.user = data.user;
    } else {
      try { t ? localStorage.setItem(TRUCK_LS, JSON.stringify(t)) : localStorage.removeItem(TRUCK_LS); } catch { throw { code: "quota" }; }
    }
    render();
  }
  const truckOn = () => !state.readonly && !!getTruck();
  const round2 = (n) => Math.round(n * 100) / 100;
  const clampWeeks = (w) => Math.min(TRUCK_MAX_WEEKS, Math.max(TRUCK_MIN_WEEKS, Math.round(Number(w)) || TRUCK_MAX_WEEKS));
  const addDays = (iso, n) => { const d = toDate(iso) || new Date(); d.setDate(d.getDate() + Math.round(n)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  // The plan for paying off `principal` in `weeks` weeks, paying `every` (weekly/biweekly/monthly).
  // Only payments that land inside the term count, so the last one is never past the week limit.
  function truckPlan(principal, apr, every, weeks, start = today()) {
    weeks = clampWeeks(weeks);
    const ev = PAY_EVERY[every] || PAY_EVERY.weekly;
    const n = Math.max(1, Math.floor((weeks * 7) / ev.days + 1e-9));
    const interest = round2(principal * (Math.max(0, Number(apr) || 0) / 100) * (weeks / 52));
    const total = round2(principal + interest);
    const pay = Math.ceil((total / n) * 100) / 100; // round up so n payments always cover it
    return { principal: round2(principal), apr: Number(apr) || 0, every: PAY_EVERY[every] ? every : "weekly", weeks, n, interest, total, pay,
      perWeek: round2(total / weeks), perMonth: round2((total / weeks) * 52 / 12), start, end: addDays(start, n * ev.days) };
  }
  // Older accounts only had a balance and a weekly payment: read them as a weekly plan from today.
  function truckPlanned(t) {
    if (!t || t.every) return t;
    return { ...t, ...truckPlan(Number(t.balance) || 0, 0, "weekly", TRUCK_MAX_WEEKS), balance: Number(t.balance) || 0, legacy: true };
  }
  async function truckCharge(amount, what) {
    const t = truckPlanned(getTruck()); if (!t || !(amount > 0)) return;
    // New tool on the account: what's left plus the new tool (with its interest) starts a fresh 8–10 week plan.
    const add = truckPlan(amount, t.apr, t.every, t.weeks);
    const p = truckPlan(0, 0, t.every, t.weeks);
    const balance = round2((Number(t.balance) || 0) + add.total);
    const pay = Math.ceil((balance / p.n) * 100) / 100;
    await setTruck({ ...t, legacy: undefined, balance, principal: round2((Number(t.principal) || 0) + amount), interest: round2((Number(t.interest) || 0) + add.interest),
      total: round2((Number(t.total) || 0) + add.total), pay, n: p.n, perWeek: round2(balance / p.weeks), perMonth: round2((balance / p.weeks) * 52 / 12), start: p.start, end: p.end,
      log: [{ d: today(), amt: round2(add.total), what: what || "Added" }, ...(t.log || [])] });
  }
  function payoff(t) {
    const bal = Number(t.balance) || 0;
    if (bal <= 0) return { text: "All paid off" };
    const late = t.end && t.end < today();
    return { late, text: late ? `past the ${t.weeks}-week payoff date (${fmtDate(t.end, false)})` : `paid off by ${fmtDate(t.end, false)}` };
  }
  function renderTruck() {
    const tile = $("truckTile");
    tile.hidden = !!state.readonly;
    if (state.readonly) return;
    const t = truckPlanned(getTruck());
    if (!t) {
      $("truck").innerHTML = `<div class="watch-empty"><span class="note">Buying off the truck? Keep your balance here and see your payment for an 8 to 10 week payoff.</span><button class="btn-watch" type="button" data-truck="edit">Set it up →</button></div>`;
      return;
    }
    const bal = Number(t.balance) || 0, po = payoff(t), ev = PAY_EVERY[t.every];
    const paid = (t.log || []).filter((x) => x.amt < 0).reduce((sum, x) => sum - x.amt, 0);
    const pct = paid + bal > 0 ? Math.round((paid / (paid + bal)) * 100) : 100;
    const lastPay = (t.log || []).find((x) => x.amt < 0);
    const next = Math.min(t.pay, bal);
    $("truck").innerHTML = `<span class="big">${money(bal, bal % 1)}</span>
      <span class="sub">${t.legacy ? "Add your pay interval and interest to get a payment plan" : `${money(t.pay, true)} ${ev.label}${t.interest > 0 ? ` · ${t.apr}% interest` : ""} · ${esc(po.text)}`}${t.dealer ? ` · ${esc(t.dealer)}` : ""}${lastPay ? `<br>Last payment ${rel(lastPay.d)}` : ""}</span>
      <div class="bar ${bal <= 0 ? "done" : ""}"><span style="width:${pct}%"></span></div>
      <div class="truck-act">${bal > 0 && !t.legacy ? `<button class="btn-watch" type="button" data-truck="pay">I paid ${money(next, true)}</button>` : ""}<button class="btn-watch" type="button" data-truck="edit">${t.legacy ? "Set up plan →" : "Edit"}</button></div>`;
  }
  $("truck").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-truck]"); if (!b) return;
    if (b.dataset.truck === "edit") return openTruck();
    const t = truckPlanned(getTruck()); if (!t || t.legacy) return openTruck();
    const amt = round2(Math.min(Number(t.pay) || 0, Number(t.balance) || 0));
    if (!(amt > 0)) return openTruck();
    const before = getTruck();
    const ok = await guard(() => setTruck({ ...t, balance: round2(t.balance - amt), log: [{ d: today(), amt: -amt, what: "Payment" }, ...(t.log || [])] }));
    if (!ok) return;
    burst(...centerOf(b), 12);
    const left = round2(t.balance - amt);
    toast(left > 0 ? `Logged a ${money(amt, true)} payment. ${money(left, left % 1)} to go.` : "Logged the last payment. All paid off!", { label: "Undo", run: () => guard(() => setTruck(before), "Payment taken back") });
  });
  const truckDlg = $("truckDlg");
  // What's left before interest, so editing doesn't charge interest on interest.
  const truckLeftPrincipal = (t) => t && t.total > 0 ? round2(t.balance * (t.principal / t.total)) : Number(t?.balance) || 0;
  function truckFormPlan() {
    const bal = Number($("t-bal").value), apr = Number($("t-apr").value || 0);
    if ($("t-bal").value === "" || !(bal > 0) || !(apr >= 0) || apr > 100) return null;
    return truckPlan(bal, apr, $("t-every").value, $("t-weeks").value);
  }
  function renderTruckPlan() {
    const p = truckFormPlan();
    if (!p) { $("t-plan").innerHTML = ""; return; }
    const ev = PAY_EVERY[p.every];
    $("t-plan").innerHTML = `<div class="hero"><span class="label">Payment ${ev.label}</span><strong>${money(p.pay, true)}</strong></div>
      <div><span class="label">Weekly</span><strong>${money(p.perWeek, true)}</strong></div>
      <div><span class="label">Monthly</span><strong>${money(p.perMonth, true)}</strong></div>
      <div><span class="label">Total</span><strong>${money(p.principal, true)}</strong></div>
      <div><span class="label">Interest</span><strong>${money(p.interest, true)}</strong></div>
      <div class="hero"><span class="label">Total with interest</span><strong>${money(p.total, true)}</strong></div>
      <span class="all">${p.n} payment${p.n === 1 ? "" : "s"} of ${money(p.pay, true)}, paid off by ${fmtDate(p.end)} (${p.weeks} weeks).</span>`;
  }
  ["t-bal", "t-apr", "t-every", "t-weeks"].forEach((id) => $(id).addEventListener("input", renderTruckPlan));
  function openTruck() {
    const raw = getTruck(), t = truckPlanned(raw) || {};
    $("t-bal").value = raw ? truckLeftPrincipal(t) : "";
    $("t-apr").value = t.apr ? t.apr : "";
    $("t-every").value = PAY_EVERY[t.every] ? t.every : "weekly";
    $("t-weeks").value = String(t.weeks ? clampWeeks(t.weeks) : TRUCK_MAX_WEEKS);
    $("t-dealer").value = t.dealer || "";
    $("t-clear").hidden = !raw;
    $("t-err").hidden = true;
    renderTruckPlan();
    const log = (t.log || []).slice(0, 8);
    $("t-log").innerHTML = log.length ? `<div class="t-log"><span class="label">Recent</span>${log.map((x) => `<div class="line"><span>${esc(x.what)}</span><span class="num ${x.amt < 0 ? "pay" : ""}">${x.amt < 0 ? "−" : "+"}${money(Math.abs(x.amt), true)} · ${esc(fmtDate(x.d, false))}</span></div>`).join("")}</div>` : "";
    truckDlg.showModal();
    routeOpen(truckDlg, "/truck", "Truck account");
    setTimeout(() => deskFocus($("t-bal")), 0);
  }
  $("t-cancel").onclick = () => truckDlg.close();
  $("truckFrm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const bal = Number($("t-bal").value), apr = Number($("t-apr").value || 0), weeks = Number($("t-weeks").value);
    const err = (m) => { $("t-err").textContent = m; $("t-err").hidden = false; };
    if ($("t-bal").value === "" || !(bal >= 0) || bal >= 1000000) return err("Enter what you owe on the truck, or 0.");
    if (!(apr >= 0) || apr > 100) return err("Enter the interest as a yearly percent between 0 and 100, or leave it empty.");
    if (!(weeks >= TRUCK_MIN_WEEKS && weeks <= TRUCK_MAX_WEEKS)) return err("Truck accounts get paid off in 8 to 10 weeks.");
    if (!PAY_EVERY[$("t-every").value]) return err("Pick how often you pay.");
    const raw = getTruck(), t = truckPlanned(raw) || { log: [] };
    const dealer = $("t-dealer").value.trim().slice(0, 60);
    const same = raw && !t.legacy && round2(bal) === truckLeftPrincipal(t) && apr === t.apr && $("t-every").value === t.every && weeks === t.weeks;
    let next;
    if (same) next = { ...t, dealer }; // only the name changed: keep the plan and its dates
    else {
      const p = truckPlan(round2(bal), apr, $("t-every").value, weeks);
      next = { ...t, legacy: undefined, weekly: undefined, ...p, balance: p.total, dealer };
      if (raw && round2(p.total) !== round2(t.balance)) next.log = [{ d: today(), amt: round2(p.total - (Number(t.balance) || 0)), what: "New payment plan" }, ...(t.log || [])];
    }
    if (await guard(() => setTruck(next), "Truck account saved")) truckDlg.close();
  });
  $("t-clear").onclick = async () => {
    const before = getTruck();
    if (await guard(() => setTruck(null))) { truckDlg.close(); toast("Truck account removed", { label: "Undo", run: () => guard(() => setTruck(before)) }); }
  };

  /* ---------- tool insurance: the person's own policy from their own insurer ---------- */
  // BoxTally doesn't sell insurance. People pick who they're insured with and keep the details here,
  // private to them (signed in: the insurance_policies table, owner-only; signed out: this browser).
  const INS_PROVIDERS = [
    ["Tools & equipment policies", [
      ["Next Insurance", "https://www.nextinsurance.com"],
      ["Hiscox", "https://www.hiscox.com"],
      ["The Hartford", "https://www.thehartford.com"],
      ["Thimble", "https://www.thimble.com"],
      ["Travelers", "https://www.travelers.com"],
    ]],
    ["Home, renters or personal articles", [
      ["State Farm", "https://www.statefarm.com"],
      ["Allstate", "https://www.allstate.com"],
      ["Progressive", "https://www.progressive.com"],
      ["GEICO", "https://www.geico.com"],
      ["Nationwide", "https://www.nationwide.com"],
      ["Farmers", "https://www.farmers.com"],
      ["Liberty Mutual", "https://www.libertymutual.com"],
      ["USAA", "https://www.usaa.com"],
      ["American Family", "https://www.amfam.com"],
      ["Erie Insurance", "https://www.erieinsurance.com"],
      ["Lemonade", "https://www.lemonade.com"],
    ]],
  ];
  const insLink = (name) => { for (const [, list] of INS_PROVIDERS) for (const [n, u] of list) if (n === name) return u; return null; };
  const INS_LS = LS + "-insurance";
  function getIns() {
    if (state.demo) return state.demoIns || null;
    if (signedIn()) return state.ins || null;
    try { return JSON.parse(localStorage.getItem(INS_LS)); } catch { return null; }
  }
  // Older databases may not have the table yet; the tile says so instead of failing quietly.
  const insMissing = (e) => e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST202");
  async function loadIns() {
    state.ins = null; state.insReady = true;
    if (!signedIn()) return render();
    const { data, error } = await sb.from("insurance_policies").select("provider, policy_type, policy_number, coverage, deductible, premium, premium_every, renews_on, agent, notes").maybeSingle();
    if (error && insMissing(error)) state.insReady = false;
    state.ins = data || null;
    render();
  }
  async function setIns(p) {
    if (state.demo) state.demoIns = p;
    else if (signedIn()) {
      if (!state.insReady) throw { code: "P0001", message: "Insurance is still being set up. Try again soon." };
      const { error } = p
        ? await sb.from("insurance_policies").upsert({ user_id: state.user.id, ...p }, { onConflict: "user_id" })
        : await sb.from("insurance_policies").delete().eq("user_id", state.user.id);
      if (error) throw error;
      state.ins = p;
    } else {
      try { p ? localStorage.setItem(INS_LS, JSON.stringify(p)) : localStorage.removeItem(INS_LS); } catch { throw { code: "quota" }; }
    }
    render();
  }
  const daysUntil = (d) => { const t = toDate(d); if (!t) return null; const n = new Date(); return Math.round((t - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 86400000); };
  function renderIns(worth) {
    const tile = $("insTile");
    tile.hidden = !!state.readonly;
    if (state.readonly) return;
    const p = getIns();
    if (!p) {
      $("ins").innerHTML = `<div class="watch-empty"><span class="note">Are your tools insured? Pick your insurer and see if the policy covers your box.</span><button class="btn-watch" type="button" data-ins="edit">Set it up →</button></div>`;
      return;
    }
    const cov = Number(p.coverage) || 0, w = Math.round(worth || 0);
    const pct = cov && w ? Math.min(100, Math.round((cov / w) * 100)) : cov ? 100 : 0;
    const gap = w - cov;
    const left = daysUntil(p.renews_on);
    const renew = left == null ? "" : left < 0 ? `<span class="warn">Renewal date passed ${esc(fmtDate(p.renews_on))}</span>` : left <= 30 ? `<span class="warn">Renews in ${left} day${left === 1 ? "" : "s"}</span>` : `Renews ${esc(fmtDate(p.renews_on))}`;
    const cover = !cov ? "Add your coverage limit to compare it with your box."
      : !w ? "Covers up to this much."
      : gap > 0 ? `<span class="warn">${money(gap)} of your ${money(w)} box isn't covered</span>`
      : `Covers your whole ${money(w)} box`;
    const url = insLink(p.provider);
    $("ins").innerHTML = `<span class="big">${cov ? money(cov) : esc(p.provider)}</span>
      <span class="sub">${cover}<br>${cov ? `${esc(p.provider)}${renew ? " · " : ""}` : ""}${renew}</span>
      ${cov ? `<div class="bar ${w && gap <= 0 ? "done" : ""}"><span style="width:${pct}%"></span></div>` : ""}
      <div class="truck-act"><button class="btn-watch" type="button" data-ins="edit">Edit</button>${url ? `<a class="btn-watch" href="${url}" target="_blank" rel="noopener">${esc(p.provider)} ↗</a>` : ""}</div>`;
  }
  $("ins").addEventListener("click", (e) => { if (e.target.closest("[data-ins]")) openIns(); });
  const insDlg = $("insDlg");
  $("i-prov").innerHTML = `<option value="">Choose your insurer</option>`
    + INS_PROVIDERS.map(([g, list]) => `<optgroup label="${esc(g)}">${list.map(([n]) => `<option>${esc(n)}</option>`).join("")}</optgroup>`).join("")
    + `<option value="__other">Other</option>`;
  function insProvChanged() {
    const v = $("i-prov").value, other = v === "__other", url = insLink(v);
    $("i-otherRow").hidden = !other;
    $("i-tip").innerHTML = url
      ? `Not covered yet? Ask ${esc(v)} about a tools &amp; equipment policy or a scheduled-items add-on. <a href="${url}" target="_blank" rel="noopener">Visit ${esc(v)} ↗</a>`
      : other ? "Type the name of your insurer or agent." : "Pick who you're insured with, or who you'd like a quote from.";
  }
  $("i-prov").addEventListener("change", () => { insProvChanged(); if ($("i-prov").value === "__other") $("i-other").focus(); });
  function openIns() {
    const p = getIns() || {};
    const known = p.provider && insLink(p.provider);
    $("i-prov").value = !p.provider ? "" : known ? p.provider : "__other";
    $("i-other").value = p.provider && !known ? p.provider : "";
    $("i-type").value = p.policy_type || "";
    $("i-num").value = p.policy_number || "";
    $("i-cov").value = p.coverage != null ? Number(p.coverage) : "";
    $("i-ded").value = p.deductible != null ? Number(p.deductible) : "";
    $("i-prem").value = p.premium != null ? Number(p.premium) : "";
    $("i-every").value = p.premium_every || "year";
    $("i-renew").value = p.renews_on || "";
    $("i-agent").value = p.agent || "";
    $("i-notes").value = p.notes || "";
    $("i-clear").hidden = !getIns();
    $("i-err").hidden = true;
    insProvChanged();
    insDlg.showModal();
    routeOpen(insDlg, "/insurance", "Tool insurance");
    setTimeout(() => deskFocus($("i-prov")), 0);
  }
  $("i-cancel").onclick = () => insDlg.close();
  $("i-print").onclick = () => { insDlg.close(); $("exportPrint").click(); };
  $("insFrm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = (m) => { $("i-err").textContent = m; $("i-err").hidden = false; };
    const v = $("i-prov").value;
    const provider = (v === "__other" ? $("i-other").value : v).trim().slice(0, 60);
    if (!provider) return err(v === "__other" ? "Type your insurer's name." : "Choose your insurer, or pick Other.");
    const num = (id, max) => { const raw = $(id).value; if (raw === "") return null; const n = Number(raw); return n >= 0 && n < max ? round2(n) : NaN; };
    const coverage = num("i-cov", 10000000), deductible = num("i-ded", 1000000), premium = num("i-prem", 1000000);
    if (Number.isNaN(coverage)) return err("Enter your coverage limit in dollars, or leave it empty.");
    if (Number.isNaN(deductible)) return err("Enter your deductible in dollars, or leave it empty.");
    if (Number.isNaN(premium)) return err("Enter your premium in dollars, or leave it empty.");
    const next = {
      provider, policy_type: $("i-type").value, policy_number: $("i-num").value.trim().slice(0, 40),
      coverage, deductible, premium, premium_every: $("i-every").value === "month" ? "month" : "year",
      renews_on: $("i-renew").value || null, agent: $("i-agent").value.trim().slice(0, 80), notes: $("i-notes").value.trim().slice(0, 500),
    };
    if (await guard(() => setIns(next), "Insurance saved")) insDlg.close();
  });
  $("i-clear").onclick = async () => {
    const before = getIns();
    if (await guard(() => setIns(null))) { insDlg.close(); toast("Insurance removed", { label: "Undo", run: () => guard(() => setIns(before)) }); }
  };

  /* ---------- sample box: a pretend toolbox for first-time visitors, never saved ---------- */
  function demoItems() {
    const day = (n) => { const t = new Date(); t.setDate(t.getDate() - n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
    const at = (n) => new Date(Date.now() - n * 86400000).toISOString();
    const o = (i, name, pn, category, price, ago, location, extra = {}) => ({ id: "demo-" + i, list: "owned", name, part_number: pn, category, price, date_bought: day(ago), condition: "Good", location, notes: "", priority: null, saved: 0, created_at: at(ago), ...extra });
    const w = (i, name, pn, category, price, priority, saved, ago) => ({ id: "demo-w" + i, list: "wishlist", name, part_number: pn, category, price, date_bought: null, condition: null, location: "", notes: "", priority, saved, created_at: at(ago) });
    return [
      o(1, '3/8" drive dual 80 ratchet', "F80", '3/8" Drive Tools', 132, 420, "Top chest, drawer 1"),
      o(2, '3/8" drive flex head ratchet', "", '3/8" Drive Tools', 148, 300, "Top chest, drawer 1", { lent_to: "Mike", lent_at: day(6) }),
      o(3, '3/8" drive 6-point deep socket set, 10–19 mm', "", "Service Tools - Sets", 289, 260, "Top chest, drawer 2"),
      o(4, "13 mm 6-point swivel socket", "", '3/8" Drive Tools', 39, 200, "Top chest, drawer 2"),
      o(14, "", "FSM10", '3/8" Drive Tools', 18, 700, "Top chest, drawer 2"), o(15, "", "FSM12", '3/8" Drive Tools', 18, 700, "Top chest, drawer 2"),
      o(16, "", "FSM13", '3/8" Drive Tools', 18, 520, "Top chest, drawer 2"), o(17, "", "FSM15", '3/8" Drive Tools', 19, 520, "Top chest, drawer 2"),
      o(5, "Flank drive combination wrench set, 10–19 mm", "OEXM710B", "Wrenches", 640, 380, "Roll cab, drawer 1"),
      o(6, "10 × 12 mm flare nut wrench", "", "Wrenches", 58, 120, "Roll cab, drawer 1"),
      o(7, '1/2" drive click-type torque wrench', "", "Torque", 495, 90, "Roll cab, drawer 3"),
      o(8, "Needle nose pliers", "", "Pliers", 46, 150, "Top chest, drawer 3", { condition: "Worn" }),
      o(9, "Locking pliers", "", "Pliers", 41, 60, "Top chest, drawer 3"),
      o(10, "#2 Phillips screwdriver", "", "Screwdrivers", 24, 170, "Top chest, drawer 4"),
      o(11, "Hook pick", "", "Awls, Hooks and Picks", 18, 40, "Top chest, drawer 4", { lent_to: "Jess", lent_at: day(2) }),
      o(12, "Long pry bar", "", "Prybars", 78, 230, "Side locker", { condition: "Needs warranty" }),
      o(13, '14.4 V 3/8" drive cordless impact', "", "Power Tools", 389, 20, "Roll cab, bottom drawer"),
      w(1, '1/2" drive electronic torque wrench', "TECH3FR250", "Torque", 799, "Need", 320, 30),
      w(2, "Water pump pliers", "", "Pliers", 62, "Want", 62, 25),
      w(3, "Diagnostic scan tool", "", "Diagnostics", 2900, "Want", 400, 14),
      w(4, "11-drawer roll cab", "", "Tool Storage", 8900, "Someday", 500, 10),
    ];
  }
  function enterDemo() {
    const day = (n) => { const t = new Date(); t.setDate(t.getDate() - n); return t.toISOString().slice(0, 10); };
    state.demo = true; state.admin = false; state.items = demoItems(); state.introDone = false; state.railIntro = false;
    state.demoIns = { provider: "State Farm", policy_type: "Personal articles / scheduled items", policy_number: "", coverage: 2000, deductible: 250, premium: 96, premium_every: "year", renews_on: day(-40), agent: "", notes: "" };
    { const p = truckPlan(495, 12, "weekly", 10, day(21)); state.demoTruck = { ...p, balance: round2(p.total - 3 * p.pay), dealer: "Thursday truck", log: [{ d: day(7), amt: -p.pay, what: "Payment" }, { d: day(14), amt: -p.pay, what: "Payment" }, { d: day(21), amt: -p.pay, what: "Payment" }, { d: day(21), amt: p.total, what: '1/2" drive click-type torque wrench' }] }; }
    render();
    scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    loadCatalog().then(render);
  }
  $("localDemo").onclick = () => enterDemo();
  $("heroDemo").onclick = () => enterDemo();
  $("heroAdd").onclick = () => {
    $("quick").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    $("q-pn").focus({ preventScroll: true });
  };
  $("demoExit").onclick = () => { state.introDone = false; state.railIntro = false; state.demoTruck = null; state.demoIns = null; loadItems(); scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }); };

  /* ---------- share my box: a read-only link ---------- */
  const shareDlg = $("shareDlg");
  let shareRow = null;
  const shareUrl = (tok) => `${location.origin}/?box=${tok}`;
  function fillShare() {
    $("s-linkRow").hidden = !shareRow; $("s-off").hidden = !shareRow;
    $("s-save").textContent = shareRow ? "Save" : "Create link";
    if (shareRow) $("s-link").value = shareUrl(shareRow.token);
  }
  async function openShare() {
    if (state.demo) return toast("Start your own box first, then you can share it.");
    $("s-err").hidden = true;
    const { data, error } = await sb.from("box_shares").select("*").maybeSingle();
    if (error) return toast("Couldn't open sharing right now. Try again.");
    shareRow = data;
    $("s-title").value = data ? data.title : ""; $("s-prices").checked = data ? data.show_prices : false; $("s-wish").checked = data ? data.show_wishlist : true;
    fillShare();
    shareDlg.showModal();
    routeOpen(shareDlg, "/share", "Share my box");
  }
  $("s-close").onclick = () => shareDlg.close();

  /* ---------- delete my account: photos first (the database can't remove files), then everything else ---------- */
  const delDlg = $("delDlg");
  function openDel() {
    if (!signedIn()) return;
    $("d-word").value = ""; $("d-go").disabled = true; $("d-err").hidden = true;
    delDlg.showModal();
    routeOpen(delDlg, "/delete-account", "Delete my account");
  }
  $("delAcct").onclick = (e) => { e.preventDefault(); openDel(); };
  $("d-close").onclick = () => delDlg.close();
  $("d-word").oninput = () => { $("d-go").disabled = $("d-word").value.trim().toUpperCase() !== "DELETE"; };
  $("delFrm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if ($("d-go").disabled || !signedIn()) return;
    $("d-go").disabled = true; $("d-go").textContent = "Deleting…"; $("d-err").hidden = true;
    try {
      const bucket = sb.storage.from("tool-photos");
      for (;;) {
        const { data, error } = await bucket.list(state.user.id, { limit: 100 });
        if (error) throw error;
        if (!data.length) break;
        const { error: rmErr } = await bucket.remove(data.map((f) => `${state.user.id}/${f.name}`));
        if (rmErr) throw rmErr;
      }
      const { error } = await sb.rpc("delete_my_account");
      if (error) throw error;
      forgetSigned();
      await sb.auth.signOut({ scope: "local" }).catch(() => {});
      delDlg.close();
      toast("Your account and everything in it has been deleted.");
    } catch {
      $("d-err").textContent = "Couldn't finish deleting. Try again, or email contact@boxtally.app and we'll do it for you.";
      $("d-err").hidden = false;
    } finally {
      $("d-go").textContent = "Delete everything"; $("d-go").disabled = false;
    }
  });
  $("shareFrm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { title: $("s-title").value.trim().slice(0, 60), show_prices: $("s-prices").checked, show_wishlist: $("s-wish").checked };
    const q = shareRow ? sb.from("box_shares").update(body).eq("user_id", state.user.id) : sb.from("box_shares").insert(body);
    const { data, error } = await q.select().single();
    if (error) { $("s-err").textContent = "Couldn't save that. Try again."; $("s-err").hidden = false; return; }
    const created = !shareRow; shareRow = data; fillShare();
    toast(created ? "Link ready. Copy it and send it to anyone." : "Saved");
  });
  $("s-copy").onclick = async () => {
    const url = $("s-link").value;
    try { if (navigator.share && matchMedia("(pointer: coarse)").matches) { await navigator.share({ title: "My toolbox on BoxTally", url }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(url); toast("Link copied"); } catch { $("s-link").select(); toast("Select the link and copy it"); }
  };
  $("s-off").onclick = async () => {
    const { error } = await sb.from("box_shares").delete().eq("user_id", state.user.id);
    if (error) return toast("Couldn't turn the link off. Try again.");
    shareRow = null; fillShare(); toast("Link turned off. Anyone who has it will see that it's gone.");
  };

  /* ---------- price-drop emails ---------- */
  // Switched on once the email sender is set up (see README: "Price-drop emails").
  const EMAIL_ALERTS_READY = false;
  async function loadAlerts() {
    state.alerts = null;
    if (!EMAIL_ALERTS_READY || !signedIn()) return;
    const { data } = await sb.from("alert_prefs").select("email_drops").maybeSingle();
    state.alerts = data || { email_drops: false };
    renderWatch();
  }
  $("watch").addEventListener("change", async (e) => {
    if (e.target.id !== "alertDrops") return;
    const on = e.target.checked;
    const { error } = await sb.from("alert_prefs").upsert({ user_id: state.user.id, email_drops: on }, { onConflict: "user_id" });
    if (error) { e.target.checked = !on; return toast("Couldn't save that. Try again."); }
    state.alerts = { email_drops: on };
    toast(on ? `We'll email ${state.user.email} when something on your wishlist drops.` : "Price-drop emails off");
  });

  /* ---------- install as an app ---------- */
  let installEvt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; $("installBtn").hidden = false; });
  window.addEventListener("appinstalled", () => { installEvt = null; $("installBtn").hidden = true; toast("BoxTally is on your home screen"); });
  async function installApp() { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch {} installEvt = null; $("installBtn").hidden = true; }
  // iPhones don't offer an install button, so tell people where it is
  if (/iP(hone|ad|od)/.test(navigator.userAgent) && !navigator.standalone) $("iosHint").hidden = false;

  /* ---------- events ---------- */
  function setTab(tab) {
    if (tab !== state.tab) state.introDone = false;
    state.tab = tab; state.confirm = null;
    if (state.money) { state.money = false; document.body.classList.remove("screen-money"); $("stats").open = statsPref(); }
    $("tab-tools").setAttribute("aria-selected", tab === "owned");
    $("tab-wish").setAttribute("aria-selected", tab === "wishlist");
    $("list").setAttribute("aria-labelledby", tab === "owned" ? "tab-tools" : "tab-wish");
    setSortOptions(); render();
    if (!routeSync) go(tabPath());
  }
  $("tab-tools").onclick = () => setTab("owned");
  $("tab-wish").onclick = () => setTab("wishlist");

  /* ---------- phones: the bar along the bottom ----------
     Box and Wishlist are the two lists. Money is its own screen with what the box is worth, the truck
     account, tool insurance, prices and stats, so the lists don't have to scroll past all of that.
     Add opens the add form for whichever list you're on. On bigger screens everything shows at once. */
  function syncBnav() {
    const on = state.money ? "money" : state.tab;
    document.querySelectorAll("#bnav [data-go]").forEach((b) => { if (b.dataset.go === on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  }
  function setMoney(on) {
    if (on === !!state.money) return;
    state.money = on; state.confirm = null;
    document.body.classList.toggle("screen-money", on);
    $("stats").open = on || statsPref();
    syncBnav();
    if (!routeSync) go(tabPath());
    scrollTo({ top: 0 });
  }
  // Box, Wishlist and Money cross-fade into each other instead of jumping (browsers that can't, just switch)
  const fade = (fn) => (!reduce && document.startViewTransition && state.loaded ? document.startViewTransition(fn) : fn());
  $("bnav").addEventListener("click", (e) => {
    const b = e.target.closest("[data-go]"); if (!b) return;
    const to = b.dataset.go;
    if (to !== "add" && (to === "money" ? !state.money : state.money || state.tab !== to)) return fade(() => bnavGo(to));
    bnavGo(to);
  });
  function bnavGo(to) {
    if (to === "money") return setMoney(true);
    if (to === "add") { if (state.money) setTab("owned"); return openForm(null); }
    const same = !state.money && state.tab === to;
    if (state.money && state.tab === to) setMoney(false); else setTab(to);
    if (same) scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }); // tapping the list you're on goes back to its top
  }
  ["q", "fCat", "fSort"].forEach((id) => $(id).addEventListener("input", render));

  // A message at the bottom; with an action (like Undo) it stays a little longer and has a button.
  function toast(msg, action) {
    const t = $("toast");
    t.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button" class="toast-act">${esc(action.label)}</button>` : "");
    if (action) t.querySelector(".toast-act").onclick = () => { t.hidden = true; clearTimeout(toast._t); action.run(); };
    t.hidden = false; t.style.animation = "none"; void t.offsetWidth; t.style.animation = "";
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), action ? 7000 : 3800);
  }

  /* ---------- little touches ---------- */
  // A burst of sparks, for buying a tool or sharing a price.
  function burst(x, y, n = 18) {
    if (reduce || !document.body.animate) return;
    const colors = ["var(--tag)", "var(--accent)", "var(--good)", "#ff8a5c"];
    for (let i = 0; i < n; i++) {
      const s = document.createElement("i");
      s.className = "spark"; s.style.left = x + "px"; s.style.top = y + "px"; s.style.background = colors[i % colors.length];
      document.body.appendChild(s);
      const a = -Math.PI * (0.08 + 0.84 * Math.random()), d = 45 + Math.random() * 75, rot = (Math.random() - 0.5) * 900;
      const mx = Math.cos(a) * d, my = Math.sin(a) * d;
      s.animate([
        { transform: "translate(-50%, -50%) rotate(0deg) scale(1)", opacity: 1 },
        { transform: `translate(calc(-50% + ${mx.toFixed(1)}px), calc(-50% + ${my.toFixed(1)}px)) rotate(${(rot / 2).toFixed(0)}deg) scale(1)`, opacity: 1, offset: 0.45 },
        { transform: `translate(calc(-50% + ${(mx * 1.25).toFixed(1)}px), calc(-50% + ${(my + 60).toFixed(1)}px)) rotate(${rot.toFixed(0)}deg) scale(.5)`, opacity: 0 },
      ], { duration: 800 + Math.random() * 450, easing: "cubic-bezier(.2, .6, .35, 1)" }).finished.then(() => s.remove(), () => s.remove());
    }
  }
  const centerOf = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  function shake(el) { el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); setTimeout(() => el.classList.remove("shake"), 600); }

  // Cards and the dashboard tiles lean toward the pointer; the band's work light follows it.
  if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
    let tiltEl = null, raf = 0, last = null;
    const band = document.querySelector(".band");
    document.addEventListener("pointermove", (e) => {
      last = e; if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const t = last.target instanceof Element ? last.target : null;
        const el = t && t.closest(".card, .tile");
        if (tiltEl && tiltEl !== el) { tiltEl.style.removeProperty("--rx"); tiltEl.style.removeProperty("--ry"); tiltEl.classList.remove("live"); }
        tiltEl = el;
        if (el) {
          const r = el.getBoundingClientRect(), px = (last.clientX - r.left) / r.width, py = (last.clientY - r.top) / r.height;
          el.style.setProperty("--mx", (px * 100).toFixed(1) + "%"); el.style.setProperty("--my", (py * 100).toFixed(1) + "%");
          el.style.setProperty("--px", (px - 0.5).toFixed(3)); el.style.setProperty("--py", (py - 0.5).toFixed(3));
          // a drawing on the card turns to catch the light where the pointer is
          if (!viewer.open && el.querySelector(".photo.art-bg")) { el.classList.add("live"); liveLight(px - 0.5, py - 0.5); }
          // no lean while a card has a form open, so typing stays steady
          if (!reduce && !el.querySelector("form, .confirm")) {
            const k = el.classList.contains("tile") ? 3 : 2; // just a hint of lean
            el.style.setProperty("--rx", ((0.5 - py) * k).toFixed(2) + "deg"); el.style.setProperty("--ry", ((px - 0.5) * k).toFixed(2) + "deg");
          }
        }
        const br = band.getBoundingClientRect(), inBand = last.clientY >= br.top && last.clientY <= br.bottom;
        band.style.setProperty("--glow", inBand ? 1 : 0);
        if (inBand) { band.style.setProperty("--sx", (last.clientX - br.left) + "px"); band.style.setProperty("--sy", (last.clientY - br.top) + "px"); }
      });
    }, { passive: true });
    document.addEventListener("pointerleave", () => band.style.setProperty("--glow", 0));
  }

  // Keyboard: N to add, / to search, 1 and 2 to switch drawers.
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    if (document.querySelector("dialog[open]")) return;
    const t = e.target;
    if (t instanceof Element && t.closest("input, textarea, select, [contenteditable]")) return;
    if (e.key === "/") {
      e.preventDefault();
      const s = !$("filters").hidden && !$("toolbar").hidden ? $("q") : $("q-pn");
      s.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); s.focus({ preventScroll: true }); s.select();
    } else if ((e.key === "n" || e.key === "N") && !state.readonly) {
      e.preventDefault();
      $("quick").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); $("q-pn").focus({ preventScroll: true });
    } else if (e.key === "1") setTab("owned");
    else if (e.key === "2") setTab("wishlist");
  });
  async function guard(fn, okMsg) {
    try { await fn(); if (okMsg) toast(okMsg); return true; }
    catch (e) { toast(e && e.code === "quota" ? PHOTO_ERR.quota : dbMsg(e) || "Couldn't save that. Check your connection and try again."); return false; }
  }
  const blank = (list) => list === "owned"
    ? { list, name: "", part_number: "", category: "Other", price: 0, date_bought: today(), condition: "Good", location: "", notes: "", priority: null, saved: 0 }
    : { list, name: "", part_number: "", category: "Other", price: 0, date_bought: null, condition: null, location: "", notes: "", priority: "Want", saved: 0 };
  const addedMsg = (pn, where) => {
    const e = state.ebay[pn];
    return e && e.median != null ? `Added ${pn} to your ${where}, with its eBay price.` : `Added ${pn} to your ${where}. Its eBay price usually fills in within half an hour.`;
  };

  async function addByPn(pn, list) {
    if (!pn) return false;
    if (!PN_RE.test(pn)) { shake($("quick")); toast("That doesn't look like a Snap-on part number. Use letters, numbers, dots, dashes or slashes."); return false; }
    const same = (r) => (r.part_number || "") === pn;
    if (rowsOf(list).some(same)) { shake($("quick")); toast(`${pn} is already on your ${list === "owned" ? "box" : "wishlist"}.`); return false; }
    if (list === "wishlist" && rowsOf("owned").some(same)) { shake($("quick")); toast(`You already own ${pn}. It's in your box.`); return false; }
    const ok = await guard(() => saveItem({ ...blank(list), part_number: pn }));
    if (ok) toast(addedMsg(pn, list === "owned" ? "box" : "wishlist"));
    return ok;
  }
  /* ---------- scan a part number with the camera ---------- */
  const scanCands = (text) => {
    const seen = new Set(), out = [];
    String(text || "").toUpperCase().replace(/[^A-Z0-9./\-\s]/g, " ").split(/\s+/).forEach((w) => {
      const t = w.replace(/^[./-]+|[./-]+$/g, "");
      if (t.length < 2 || t.length > 20 || !/[A-Z]/.test(t) || !/[0-9]/.test(t) || !PN_RE.test(t) || seen.has(t)) return;
      seen.add(t); out.push(t);
    });
    // part numbers usually start with letters (F80, TM72SET, FDX81)
    return out.sort((a, b) => (/^[A-Z]/.test(b) ? 1 : 0) - (/^[A-Z]/.test(a) ? 1 : 0)).slice(0, 6);
  };
  let tessWorker = null;
  const loadScript = (src) => new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  async function readImage(file) {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    if ("BarcodeDetector" in window) {
      try { const codes = await new BarcodeDetector().detect(c); const hit = scanCands(codes.map((x) => x.rawValue).join(" ")); if (hit.length) return hit; } catch {}
    }
    if (!window.Tesseract) await loadScript("/vendor/tesseract-5.1.1.min.js");
    if (!tessWorker) { tessWorker = await Tesseract.createWorker("eng"); await tessWorker.setParameters({ tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-./ " }); }
    const { data } = await tessWorker.recognize(c);
    return scanCands(data.text);
  }
  function showPick(cands) {
    const box = $("scanPick");
    box.innerHTML = `<span>Which one?</span>${cands.map((c) => `<button type="button" data-pn="${esc(c)}">${esc(c)}</button>`).join("")}`;
    box.hidden = false;
  }
  $("scanPick").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pn]"); if (!b) return;
    $("q-pn").value = b.dataset.pn; $("scanPick").hidden = true; $("q-pn").focus();
    toast(`Check ${b.dataset.pn} is right, then tap ${$("q-add").textContent}.`);
  });
  $("q-scan").onclick = () => { $("scanPick").hidden = true; $("scanInput").value = ""; $("scanInput").click(); };
  $("scanInput").addEventListener("change", async () => {
    const f = $("scanInput").files && $("scanInput").files[0]; if (!f) return;
    const btn = $("q-scan"); btn.disabled = true; const old = btn.lastChild.textContent; btn.lastChild.textContent = "Reading…";
    toast("Reading the part number…");
    try {
      const cands = await readImage(f);
      if (!cands.length) toast("Couldn't read a part number. Try closer, with good light, or type it in.");
      else if (cands.length === 1) { $("q-pn").value = cands[0]; $("q-pn").focus(); toast(`Found ${cands[0]}. Check it, then tap ${$("q-add").textContent}.`); }
      else showPick(cands);
    } catch { toast("Scanning didn't work on this device. Type the part number instead."); }
    finally { btn.disabled = false; btn.lastChild.textContent = old; }
  });

  $("quick").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (state.readonly) return;
    // in a list, only words with letters and numbers count; "ratchet" or "3/8" get reported, not added
    const parts = $("q-pn").value.split(/[\s,;]+/).map(cleanPn).filter(Boolean);
    if (!parts.length) { openForm(null); return; }
    if (parts.length > 1) { if (await addMany(parts, state.tab)) $("q-pn").value = ""; return; }
    if (await addByPn(parts[0], state.tab)) { $("q-pn").value = ""; burst(...centerOf($("q-add")), 10); }
  });
  // Pasting a list (one per line, from a receipt or a set's contents) keeps the part numbers apart
  $("q-pn").addEventListener("paste", (e) => {
    const text = (e.clipboardData || window.clipboardData)?.getData("text") || "";
    if (!/[\r\n\t]/.test(text)) return;
    e.preventDefault();
    const el = $("q-pn"), a = el.selectionStart ?? el.value.length, b = el.selectionEnd ?? a;
    // from each line (a receipt row, a set's contents) keep just the part number
    const joined = text.split(/[\r\n\t]+/).map((x) => x.trim()).filter(Boolean)
      .map((line) => line.split(/[\s,;]+/).find((w) => pnLike(cleanPn(w))) || line).join(", ");
    el.setRangeText((a > 0 && !/[\s,]$/.test(el.value.slice(0, a)) ? ", " : "") + joined, a, b, "end");
  });
  const pnLike = (p) => PN_RE.test(p) && /\d/.test(p) && /[A-Z]/.test(p);
  async function addMany(pns, list) {
    const all = [...new Set(pns)], uniq = all.slice(0, 200);
    const bad = uniq.filter((p) => !pnLike(p)), good = uniq.filter(pnLike);
    const have = new Set(rowsOf(list).map((r) => r.part_number)), owned = new Set(rowsOf("owned").map((r) => r.part_number));
    const add = good.filter((p) => !have.has(p) && !(list === "wishlist" && owned.has(p)));
    const skipped = good.length - add.length, where = list === "owned" ? "box" : "wishlist";
    if (!add.length) { shake($("quick")); toast(skipped ? `All of those are already on your ${where}.` : "None of those look like Snap-on part numbers."); return false; }
    let n = 0;
    if (!(await guard(async () => { n = await saveMany(add.map((pn) => ({ ...blank(list), part_number: pn }))); }))) return false;
    burst(...centerOf($("q-add")), 18);
    toast(`Added ${n} tool${n === 1 ? "" : "s"} to your ${where}.`
      + (skipped ? ` Skipped ${skipped} already there.` : "")
      + (bad.length ? ` ${bad.length} didn't look like part numbers (${bad.slice(0, 3).join(", ")}${bad.length > 3 ? "…" : ""}).` : "")
      + (all.length > 200 ? " Only the first 200 at a time." : ""));
    return true;
  }
  $("q-more").onclick = () => openForm(null, cleanPn($("q-pn").value), true);

  const SHOP_CATS = ["Ratchets", "Socket sets", "Combination wrenches", "Torque wrenches", "Impact wrenches", "Screwdrivers", "Pliers", "Pry bars", "Tool storage", "Diagnostics"];
  $("shopCats").insertAdjacentHTML("beforeend", SHOP_CATS.map((c) => `<a href="${esc(storeLink(c))}" target="_blank" rel="noopener">${esc(c)}</a>`).join(""));
  const shopHref = () => { const q = $("shopQ").value.trim(); return q ? storeLink(q) : "https://shop.snapon.com"; };
  $("shopQ").addEventListener("input", () => { $("shopGo").href = shopHref(); });
  $("shopQ").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("shopGo").href = shopHref(); $("shopGo").click(); } });
  // One add box for everything: these jump to the Wishlist tab and put the cursor in it.
  function goAddWish() {
    if (state.tab !== "wishlist") setTab("wishlist");
    $("quick").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    $("q-pn").focus({ preventScroll: true });
  }
  $("shopWish").onclick = goAddWish;

  document.querySelector(".seg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-view]"); if (!b || b.dataset.view === state.view) return;
    state.view = b.dataset.view; state.confirm = null; state.introDone = false; render();
    try { localStorage.setItem(LS + "-view", state.view); } catch {}
  });

  // Phones: a floating add button once the add box has scrolled out of sight.
  let quickVisible = true;
  const syncFab = () => { $("fab").hidden = quickVisible || !state.loaded || state.readonly; };
  if ("IntersectionObserver" in window) new IntersectionObserver(([en]) => { quickVisible = en.isIntersecting; syncFab(); }).observe($("quick"));
  $("fab").onclick = () => {
    $("quick").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    $("q-pn").focus({ preventScroll: true });
  };
  $("watch").addEventListener("click", (e) => {
    if (e.target.closest("[data-watch-go]")) goAddWish();
    if (e.target.closest("[data-list-prices]")) openListPrices();
  });

  /* ---------- Snap-on list prices, managed by the BoxTally owner ----------
     Snap-on's store can't be read by a website, but an AI app that searches the web (Gemini) can find
     list prices. The owner copies part numbers (from everyone's boxes, part numbers only) with the
     question, asks Gemini, and pastes its answer back. Prices go in list_prices, which everyone reads.
     Only admins (public.admins) can see admin_parts() or call admin_save_list_prices(). */
  const listDlg = $("listDlg");
  const LIST_BATCH = 12;
  const pnKey = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  let lpTab = "todo", curBatch = null;
  async function loadAdmin() {
    state.admin = false; state.adminParts = [];
    if (!sb || !signedIn() || state.demo || state.readonly) return;
    const a = await sb.rpc("is_admin");
    if (a.error || !a.data) return;
    const r = await sb.rpc("admin_parts");
    if (r.error) return;
    state.admin = true; state.adminParts = r.data || [];
  }
  // not checked = never looked up; checked = has a price, or was looked up and none was found
  const lpTodo = () => state.adminParts.filter((p) => !p.checked_at);
  const lpDone = () => state.adminParts.filter((p) => p.checked_at).sort((a, b) => (a.price != null) - (b.price != null) || a.part_number.localeCompare(b.part_number));
  const ask = (pns) => `What is the current Snap-on list price (new, US dollars) for each of these Snap-on part numbers? Search for each one. Answer with one line per part number, like this: PARTNUMBER $PRICE\nOnly if you really can't find a price, write PARTNUMBER ?\n\n${pns.join("\n")}`;
  // second try for ones Gemini couldn't find: allow the same tool in another color, and the last known price
  const askAgain = (pns) => `These Snap-on part numbers are harder to find. For each one, search shop.snapon.com and Google for the Snap-on list price (new, US dollars). Letters at the end are often just the color or kit (for example DB, GM, R, O, G, HD, C2), so if the exact number isn't listed, use the price of the same tool in another color, or the last list price shown before it was discontinued. Answer with one line per part number, like this: PARTNUMBER $PRICE\nOnly if there is still no price at all, write PARTNUMBER ?\n\n${pns.join("\n")}`;
  // The same tool in another color or kit: CTR868DB and CTR868GMDB share CTR868 once the letters after
  // the last digit are dropped. New ones get the priced one's price offered, for the owner to OK.
  const lpBase = (pn) => { const m = String(pn).match(/^(.*\d)[A-Z]{1,4}$/); return m && m[1].length >= 3 ? m[1] : String(pn); };
  function lpLookalikes() {
    const priced = new Map();
    state.adminParts.filter((p) => p.price != null).forEach((p) => { const k = lpBase(p.part_number); if (!priced.has(k)) priced.set(k, p); });
    return lpTodo().map((p) => ({ pn: p.part_number, from: priced.get(lpBase(p.part_number)) })).filter((x) => x.from);
  }
  let curLooks = [];
  function renderListDlg() {
    const looks = lpTab === "todo" ? lpLookalikes() : [], lookSet = new Set(looks.map((x) => x.pn));
    const todo = lpTodo().filter((p) => !lookSet.has(p.part_number)), done = lpDone(), missing = done.filter((p) => p.price == null);
    curLooks = looks;
    $("l-n-todo").textContent = lpTodo().length; $("l-n-done").textContent = done.length;
    document.querySelectorAll("[data-lp-tab]").forEach((b) => b.setAttribute("aria-selected", b.dataset.lpTab === lpTab));
    // the batch shown is the one that gets copied: newest tools first, or the not-found ones to try again
    const pns = (lpTab === "todo" ? todo : missing).slice(0, LIST_BATCH).map((p) => p.part_number);
    curBatch = pns;
    const b = $("l-batch"); b.textContent = "";
    const head = document.createElement("div");
    if (lpTab === "todo") head.textContent = todo.length ? `${todo.length} tool${todo.length === 1 ? "" : "s"} still to check. This batch is these ${pns.length}:` : looks.length ? "" : "Every tool has been checked. New tools people add show up here.";
    else head.textContent = done.length ? `${done.length - missing.length} with a price, ${missing.length} where Gemini found none.${pns.length ? ` Try these ${pns.length} again:` : ""}` : "Nothing checked yet.";
    if (looks.length) {
      const lk = document.createElement("div"); lk.className = "lp-looks";
      const t = document.createElement("div");
      t.textContent = `${looks.length} look${looks.length === 1 ? "s" : ""} like another color or kit of a tool you've already priced:`;
      const box = document.createElement("div"); box.className = "lp-done";
      looks.forEach(({ pn, from }) => {
        const row = document.createElement("div"), a = document.createElement("span"), v = document.createElement("span");
        a.className = "pn"; a.textContent = pn; v.textContent = `${money(from.price, true)} like ${from.part_number}`;
        row.append(a, v); box.append(row);
      });
      const go = document.createElement("button"); go.type = "button"; go.className = "btn small primary"; go.id = "l-looks";
      go.textContent = `Use ${looks.length === 1 ? "this price" : "these prices"}`;
      lk.append(t, box, go); b.append(lk);
      if (todo.length) { const more = document.createElement("div"); more.textContent = "The rest go to Gemini:"; more.style.marginTop = "10px"; b.append(more); }
    }
    b.append(head);
    if (pns.length) {
      const list = document.createElement("div"); list.className = "lp-pns";
      pns.forEach((pn) => { const x = document.createElement("span"); x.textContent = pn; list.append(x); });
      b.append(list);
    }
    if (lpTab === "done" && done.length) {
      const box = document.createElement("div"); box.className = "lp-done";
      done.forEach((p) => {
        const row = document.createElement("div"), a = document.createElement("span"), v = document.createElement("span");
        a.className = "pn"; a.textContent = p.part_number;
        v.textContent = p.price != null ? money(p.price, true) : "no price found"; if (p.price == null) v.className = "miss";
        row.append(a, v); box.append(row);
      });
      b.append(box);
    }
    $("l-copy").hidden = !pns.length;
    $("l-copy").textContent = `Copy ${pns.length} for Gemini`;
    $("l-hint").textContent = (lpTab === "done" ? "If Gemini still can't find one, look it up on shop.snapon.com in your browser and type a line like PTM18AM $42.50 here. " : "") + "Lines with a part number and a $ price are saved. A part number with ? is marked checked with no price. To fix a price, paste a line like F80 $159.00.";
  }
  function openListPrices() {
    if (!state.admin) return;
    $("l-err").hidden = true; $("l-text").value = "";
    lpTab = lpTodo().length ? "todo" : "done";
    renderListDlg();
    listDlg.showModal();
  }
  document.querySelectorAll("[data-lp-tab]").forEach((b) => (b.onclick = () => { lpTab = b.dataset.lpTab; renderListDlg(); }));
  $("ownerGo").onclick = openListPrices;
  $("l-close").onclick = () => listDlg.close();
  $("l-copy").onclick = async () => {
    const pns = curBatch || []; if (!pns.length) return;
    const text = lpTab === "done" ? askAgain(pns) : ask(pns);
    try { await navigator.clipboard.writeText(text); toast(`Copied ${pns[0]} to ${pns[pns.length - 1]}. Paste it into Gemini and send.`); }
    catch { $("l-text").value = text; $("l-text").select(); toast("Couldn't copy on its own. The question is in the box: copy it from there."); }
  };
  // "F80 $159.00", "| CTR881 | $455.00 |", "F80: $1,299", "GSL832 ?" -> Map(part number -> price, or null for "?")
  function parseListPrices(text) {
    const known = new Map(state.adminParts.map((p) => [pnKey(p.part_number), p.part_number]));
    const out = new Map();
    for (const line of String(text).split(/\r?\n/)) {
      const up = line.toUpperCase();
      const word = up.split(/[^A-Z0-9./-]+/).find((w) => known.has(pnKey(w)));
      if (!word) continue;
      const rest = up.replace(word, " ");
      const m = rest.match(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)/) || rest.match(/(?:^|[\s|:=])(\d[\d,]*\.\d{2})(?!\d)/);
      const v = m ? Number(m[1].replace(/,/g, "")) : NaN;
      if (v > 0 && v < 1000000) out.set(known.get(pnKey(word)), Math.round(v * 100) / 100);
      else if (/\?|NOT FOUND|N\/A|UNKNOWN|NO PRICE/.test(rest) && !out.has(known.get(pnKey(word)))) out.set(known.get(pnKey(word)), null);
    }
    return out;
  }
  const lpErr = (m) => { $("l-err").textContent = m; $("l-err").hidden = false; };
  $("listFrm").addEventListener("submit", (e) => {
    e.preventDefault();
    const found = parseListPrices($("l-text").value);
    if (!found.size) return lpErr("No part numbers found. Paste Gemini's answer with lines like F80 $159.00.");
    saveListPrices(found);
  });
  $("l-batch").addEventListener("click", (e) => {
    if (e.target.id === "l-looks" && curLooks.length) saveListPrices(new Map(curLooks.map(({ pn, from }) => [pn, Number(from.price)])));
  });
  async function saveListPrices(found) {
    const err = lpErr;
    $("l-save").disabled = true; $("l-save").textContent = "Saving…";
    try {
      const rows = [...found].map(([pn, price]) => ({ pn, price }));
      const res = await sb.rpc("admin_save_list_prices", { rows });
      if (res.error) throw res.error;
      // your own private list price on a tool would hide the shared one, so drop it for these
      const mine = state.items.filter((r) => found.has(r.part_number) && Number(r.list_price) > 0);
      if (mine.length) await Promise.all(mine.map((r) => sb.from("items").update({ list_price: null }).eq("id", r.id)));
      state.items = state.items.map((r) => (found.has(r.part_number) && Number(r.list_price) > 0 ? { ...r, list_price: null } : r));
      await Promise.all([loadAdmin(), loadCatalog()]);
      render();
      const priced = [...found.values()].filter((v) => v != null).length;
      $("l-text").value = ""; $("l-err").hidden = true;
      if (lpTab === "todo" && !lpTodo().length) lpTab = "done";
      renderListDlg();
      toast(`Saved ${priced} price${priced === 1 ? "" : "s"}${found.size > priced ? `, ${found.size - priced} with none found` : ""}. The next batch is ready.`);
    } catch (ex) { err(dbMsg(ex) || "Couldn't save those. Check your connection and try again."); }
    $("l-save").disabled = false; $("l-save").textContent = "Save prices";
  }

  $("list").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) {
      // a tap anywhere on a list row (not one of its buttons or links) opens the tool
      const row = e.target.closest(".ri[data-id]");
      if (row && !e.target.closest("a, button, input, select, textarea, form, label")) openViewer(row.dataset.id);
      return;
    }
    itemAct(btn.dataset.act, btn.closest("[data-id]")?.dataset.id, btn);
  });
  // The viewer's buttons: close it, then do what the card's button would.
  $("vActs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-vact]"); if (!b || !viewing) return;
    const id = viewing;
    viewer.close();
    itemAct(b.dataset.vact, id, null);
    // Lend and Bought it ask their question on the tool's card or row: bring it into view
    if (["lend", "bought"].includes(b.dataset.vact)) setTimeout(() => document.querySelector(`#list [data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" }), 60);
  });
  // What a tool's buttons do. btn is the button pressed on the card (null when it came from the viewer).
  function itemAct(act, id, btn) {
    if (act === "demo") return enterDemo();
    const item = state.items.find((r) => r.id === id);
    if (item && act === "view") return openViewer(id); // anyone can look closer, even on a shared box
    if (!item || state.readonly) return;
    if (state.demo && act === "photo") return toast("This is the sample box, so photos are off. Tap \"Start my own box\" up top to make yours.");
    if (act === "lend") { state.lendEdit = id; render(); setTimeout(() => { const f = document.querySelector(`[data-lend-form="${CSS.escape(id)}"] input`); if (f) f.focus({ preventScroll: !btn }); }, 0); return; }
    if (act === "lend-cancel") { state.lendEdit = null; return render(); }
    if (act === "returned") return guard(() => saveItem({ ...item, lent_to: null, lent_at: null }), `${displayName(item)} is back in the box`);
    if (act === "photo") return pickPhotoFor(id);
    if (act === "edit") return openForm(item);
    // Snap-on swaps broken hand tools on the truck: a broken one goes on the warranty list, and comes off as new
    if (act === "broken" || act === "swapped") {
      const before = { ...item }, broke = act === "broken";
      return guard(() => saveItem({ ...item, condition: broke ? "Needs warranty" : "New" })).then((ok) => ok && toast(broke ? `${displayName(item)} is on your warranty list` : `${displayName(item)} swapped. Marked as new.`, { label: "Undo", run: () => guard(() => saveItem(before)) }));
    }
    if (act === "bought") { state.confirm = { id, kind: act }; return render(); }
    if (act === "cancel") { state.confirm = null; return render(); }
    if (act === "del") {
      state.confirm = null;
      const copy = { ...item };
      const go = async () => {
        if (await guard(() => removeItem(item))) toast(`Deleted ${displayName(copy)}`, { label: "Undo", run: () => guard(() => restoreItem(copy), "Put back") });
        else render();
      };
      const el = btn && btn.closest("[data-id]");
      if (reduce || !el || !el.animate) return go();
      // the card tips forward and drops out before it's gone
      return el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "perspective(900px) rotateX(18deg) translateY(16px) scale(.92)" }], { duration: 260, easing: "cubic-bezier(.5, 0, .75, 0)", fill: "forwards" }).finished.then(go, go);
    }
    if (act === "bought-yes" || act === "bought-truck") {
      state.confirm = null;
      burst(...centerOf(btn), 26);
      const cost = wishCost(item);
      return guard(async () => {
        await saveItem({ ...item, list: "owned", price: cost, date_bought: today(), condition: "New", location: "", priority: null, saved: 0, from_wishlist: true, created_at: undefined });
        if (act === "bought-truck") await truckCharge(cost);
      }, act === "bought-truck" ? `Moved to Owned and added ${money(cost, cost % 1)} to your truck account` : "Moved to Owned");
    }
  }

  $("list").addEventListener("submit", (e) => {
    const lf = e.target.closest("[data-lend-form]");
    if (lf) {
      e.preventDefault();
      const item = state.items.find((r) => r.id === lf.dataset.lendForm), who = lf.who.value.trim().slice(0, 60);
      if (!item) return;
      if (!who) { lf.who.focus(); return; }
      state.lendEdit = null;
      rememberWho(who);
      guard(() => saveItem({ ...item, lent_to: who, lent_at: today() }), `${displayName(item)} lent to ${who}`);
    }
  });

  /* ---------- export: a spreadsheet, or a printable list (handy for insurance) ---------- */
  const byCatName = (a, b) => String(catOf(a) || "").localeCompare(String(catOf(b) || "")) || displayName(a).localeCompare(displayName(b));
  const exportRows = () => [...rowsOf("owned").sort(byCatName), ...rowsOf("wishlist").sort(byCatName)];
  // Text that starts like a formula is prefixed so spreadsheet apps show it as text instead of running it.
  const csvText = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csvNum = (n) => (n == null || n === "" || !Number.isFinite(Number(n)) ? "" : String(Math.round(Number(n) * 100) / 100));
  function toCsv(rows) {
    const head = ["List", "Tool", "Part number", "Category", "How many", "Condition", "Date bought", "Price paid / your price", "eBay price", "Where it's kept", "Lent to", "Priority", "Saved so far", "Notes", "Store link"];
    const lines = rows.map((r) => {
      const owned = r.list === "owned";
      return [
        csvText(owned ? "Owned" : "Wishlist"), csvText(displayName(r)), csvText(r.part_number), csvText(catOf(r)), csvNum(qtyOf(r)),
        csvText(owned ? r.condition : ""), csvText(owned ? r.date_bought || "" : ""), csvNum(Number(r.price) || ""),
        csvNum(ebayPrice(r)),
        csvText(owned ? r.location : ""), csvText(owned ? r.lent_to || "" : ""), csvText(owned ? "" : r.priority || "Want"), csvNum(owned ? "" : Number(r.saved) || ""),
        csvText(r.notes), csvText(r.part_number ? storeLink(r.part_number) : ""),
      ].join(",");
    });
    return "﻿" + [head.map(csvText).join(","), ...lines].join("\r\n") + "\r\n";
  }
  $("exportCsv").onclick = () => {
    const rows = exportRows();
    if (!rows.length) { toast("Add some tools first, then you can download them."); return; }
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `snapon-toolbox-${today()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast(`Downloaded ${rows.length} tool${rows.length === 1 ? "" : "s"}`);
  };
  function printHtml() {
    const owned = rowsOf("owned").sort(byCatName), wish = rowsOf("wishlist").sort(byCatName);
    const paid = owned.reduce((s, r) => s + paidAll(r), 0);
    const worth = owned.reduce((s, r) => s + worthAll(r), 0), nOwned = pieces(owned);
    const who = state.user ? state.user.user_metadata?.full_name || state.user.email || "" : "";
    const m = (n) => (n ? money(n, true) : "");
    const pol = getIns();
    const ownedRows = owned.map((r) => `<tr><td>${esc(displayName(r))}</td><td class="pn">${esc(r.part_number)}</td><td>${esc(catOf(r))}</td><td class="n">${qtyOf(r)}</td><td>${esc(r.condition || "")}</td><td>${esc(r.date_bought ? fmtDate(r.date_bought) : "")}</td><td class="n">${m(Number(r.price) || 0)}</td><td class="n">${m(nowPrice(r))}</td><td>${esc(r.location || "")}</td></tr>`).join("");
    const wishRows = wish.map((r) => `<tr><td>${esc(displayName(r))}</td><td class="pn">${esc(r.part_number)}</td><td>${esc(catOf(r))}</td><td>${esc(r.priority || "Want")}</td><td class="n">${m(wishCost(r))}</td><td class="n">${m(Number(r.saved) || 0)}</td></tr>`).join("");
    return `<h1>BoxTally</h1>
      <p class="meta">Tool list as of ${esc(fmtDate(today()))}${who ? ` · ${esc(who)}` : ""}</p>
      ${pol ? `<p class="meta">Insured with ${esc(pol.provider)}${pol.policy_number ? ` · policy ${esc(pol.policy_number)}` : ""}${Number(pol.coverage) ? ` · coverage ${money(pol.coverage, true)}` : ""}</p>` : ""}
      <h2>Owned tools</h2>
      ${owned.length ? `<p class="totals"><span>${nOwned} tool${nOwned === 1 ? "" : "s"}</span><span>Paid ${money(paid, true)}</span><span>Worth today ${money(worth, true)}</span></p>
      <table><thead><tr><th>Tool</th><th>Part number</th><th>Category</th><th class="n">Qty</th><th>Condition</th><th>Bought</th><th class="n">Paid (each)</th><th class="n">eBay now</th><th>Kept in</th></tr></thead><tbody>${ownedRows}</tbody></table>` : `<p>No owned tools yet.</p>`}
      ${wish.length ? `<h2>Wishlist</h2><table><thead><tr><th>Tool</th><th>Part number</th><th>Category</th><th>Priority</th><th class="n">Price</th><th class="n">Saved</th></tr></thead><tbody>${wishRows}</tbody></table>` : ""}
      <p class="foot">Prices today are Snap-on list prices where we could confirm them (checked weekly), otherwise typical eBay asking prices for new tools (refreshed every few hours). BoxTally is not affiliated with Snap-on.</p>`;
  }
  $("exportPrint").onclick = () => {
    if (!state.items.length) { toast("Add some tools first, then you can print them."); return; }
    $("printSheet").innerHTML = printHtml();
    window.print();
  };
  window.addEventListener("beforeprint", () => { if (!$("printSheet").innerHTML) $("printSheet").innerHTML = printHtml(); });
  window.addEventListener("afterprint", () => { $("printSheet").innerHTML = ""; });

  /* ---------- form ---------- */
  const dlg = $("dlg");
  const pf = { file: null, url: null, remove: false };
  function clearPf() { if (pf.url) URL.revokeObjectURL(pf.url); pf.file = null; pf.url = null; pf.remove = false; }
  function renderPf() {
    const it = state.editing;
    let p = null;
    if (pf.url) p = { src: pf.url, mine: true };
    else if (it && !pf.remove) p = photoOf(it);
    $("pfPrev").className = "pf-prev" + (p ? "" : " art-bg");
    if (p) { $("pfPrev").innerHTML = imgTag(p, "Photo preview", true); $("pfPrev")._art = null; }
    else {
      // the drawing follows what you type, so you can see which one your card will get
      const form = { ...(it || {}), name: $("i-name").value, part_number: cleanPn($("i-pn").value), category: $("i-cat").value };
      const a = artOf({ ...form, art: $("i-art").value });
      $("i-art").options[0].textContent = `Automatic (${artOf({ ...form, art: null }).label})`;
      if ($("pfPrev")._art !== a.key + "|" + a.size) { $("pfPrev").innerHTML = artTag(a, $("pfPrev")._art && !$("pfPrev")._art.startsWith(a.key + "|") ? "swap" : "", { refl: true }); $("pfPrev")._art = a.key + "|" + a.size; }
      $("pfPrev")._label = a.label;
    }
    const mine = !!pf.url || (it && hasMine(it) && !pf.remove);
    $("pfPick").innerHTML = ICON.cam + (mine ? "Change photo" : "Upload photo");
    $("pfRemove").hidden = !mine;
    $("pfNote").textContent = pf.url ? "Saves when you tap Save. Only you see it." : mine ? "Your photo of this tool. Only you see it." : `Drawing: ${$("pfPrev")._label || "tool"}. Wrong one? Pick another under More details, or add your own photo (only you see it).`;
  }
  // typing a part number or name that says the drive moves a drive category to match (S80A → 1/2" Drive Tools)
  ["i-name", "i-pn"].forEach((id) => $(id).addEventListener("input", () => { const c = catOf({ name: $("i-name").value, part_number: cleanPn($("i-pn").value), category: $("i-cat").value }); if (c && c !== $("i-cat").value) $("i-cat").value = c; }));
  ["i-name", "i-pn", "i-cat", "i-art"].forEach((id) => $(id).addEventListener("input", () => { if (dlg.open) renderPf(); }));
  $("pfPick").onclick = () => { $("pfFile").value = ""; $("pfFile").click(); };
  $("pfFile").addEventListener("change", () => { const f = $("pfFile").files[0]; if (!f) return; clearPf(); pf.file = f; pf.url = URL.createObjectURL(f); renderPf(); });
  $("pfRemove").onclick = () => { const had = !!pf.url; clearPf(); if (!had) pf.remove = true; renderPf(); };
  function updateLookup() { const pn = cleanPn($("i-pn").value); $("lookup").hidden = !pn; if (pn) $("lookup").href = storeLink(pn); }
  // more: open "More details" straight away (the "Add with details & photo" button)
  function openForm(item, pn, more) {
    state.editing = item; clearPf();
    const list = item ? item.list : state.tab;
    // editing shows everything; adding starts with just the basics
    $("frmMore").open = !!item || !!more;
    $("moreSum").textContent = list === "owned" ? "Category, drawing, list price, condition, where it's kept, notes" : "Category, drawing, list price, notes";
    $("dlgTitle").textContent = item ? "Edit tool" : list === "owned" ? "Add tool" : "Add to wishlist";
    $("l-price").textContent = list === "owned" ? "Snap-on price you paid ($)" : "Your price ($)";
    document.querySelectorAll("[data-only]").forEach((el) => (el.hidden = el.dataset.only !== list));
    $("i-name").value = item?.name || "";
    $("i-name").placeholder = (item && storeOf(item)?.name) || '3/8" drive dual 80 ratchet';
    $("i-pn").value = item?.part_number || pn || "";
    $("i-cat").value = CATS.includes(catOf(item)) ? catOf(item) : '3/8" Drive Tools';
    $("i-art").value = item?.art && ART[item.art] ? item.art : "";
    $("i-art").closest(".field").hidden = signedIn() && !state.dbArt;
    $("i-price").value = item?.price ? Number(item.price) : "";
    $("i-qty").value = item ? qtyOf(item) : 1;
    if (signedIn() && !state.dbQty) $("f-qty").hidden = true;
    $("i-list").value = item?.list_price ? Number(item.list_price) : "";
    $("i-date").value = item?.date_bought || (list === "owned" ? today() : "");
    $("i-cond").value = item?.condition || "Good";
    $("i-loc").value = item?.location || "";
    $("i-pri").value = item?.priority || "Want";
    $("i-saved").value = item?.saved ? Number(item.saved) : "";
    $("i-notes").value = item?.notes || "";
    $("frmErr").hidden = true;
    $("pfPrev")._art = null;
    updateLookup(); renderPf();
    dlg.showModal();
    routeOpen(dlg, item ? `/tool/${encodeURIComponent(item.id)}/edit` : list === "wishlist" ? "/wishlist/add" : "/add", $("dlgTitle").textContent);
    setTimeout(() => deskFocus($(item || pn ? "i-name" : "i-pn")), 0);
  }
  $("i-pn").addEventListener("input", updateLookup);
  $("cancelBtn").onclick = () => dlg.close();
  dlg.addEventListener("close", clearPf);
  $("frm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("i-name").value.trim(), pn = cleanPn($("i-pn").value);
    const err = (m) => { $("frmErr").textContent = m; $("frmErr").hidden = false; };
    if (!name && !pn) return err("Add a name or a part number so you can find this tool later.");
    if (pn && !PN_RE.test(pn)) return err("That part number has characters Snap-on doesn't use. Use letters, numbers, dots, dashes or slashes.");
    const list = state.editing ? state.editing.list : state.tab;
    const item = {
      ...(state.editing || blank(list)),
      name, part_number: pn, category: $("i-cat").value, art: $("i-art").value || null, price: Math.max(0, Number($("i-price").value) || 0), notes: $("i-notes").value.trim(),
      list_price: Number($("i-list").value) > 0 ? Math.round(Number($("i-list").value) * 100) / 100 : null,
      ...(list === "owned"
        ? { date_bought: $("i-date").value || null, condition: $("i-cond").value, location: $("i-loc").value.trim(), qty: Math.max(1, Math.min(999, Math.round(Number($("i-qty").value)) || 1)) }
        : { priority: $("i-pri").value, saved: Math.max(0, Number($("i-saved").value) || 0) }),
    };
    const oldPath = state.editing ? state.editing.photo_path : null;
    $("saveBtn").disabled = true;
    try {
      if (pf.file) { $("saveBtn").textContent = "Uploading photo…"; Object.assign(item, await photoFields(pf.file)); }
      else if (pf.remove) { item.photo_path = null; item.photo_at = null; delete item.photo_data; }
    } catch (ex) { err(photoErr(ex)); $("saveBtn").disabled = false; $("saveBtn").textContent = "Save"; return; }
    $("saveBtn").textContent = "Saving…";
    const ok = await guard(() => saveItem(item), state.editing ? "Saved" : (pn ? null : "Added"));
    $("saveBtn").disabled = false; $("saveBtn").textContent = "Save";
    if (ok) {
      if (!state.editing && pn) toast(addedMsg(pn, list === "owned" ? "box" : "wishlist"));
      dropOldPhoto(oldPath, item.photo_path);
      dlg.close();
    } else if (item.photo_path && item.photo_path !== oldPath) dropOldPhoto(item.photo_path, null);
  });

  /* ---------- page addresses ----------
     Every view has its own address, like any other site: boxtally.app/wishlist, /tool/<id>/<name> for a tool
     you opened, /add, /truck, /insurance, /share. Opening something adds a step to the browser's history, so
     Back closes it, Refresh keeps it open, and the address can be saved or sent. Closing it puts the plain
     address back. A shared box keeps its ?box= on every address. */
  let routeSync = false, routePending = true, routeBacking = false, routeQueue = [], baseTitle = document.title;
  const slug = (s) => String(s || "").toLowerCase().replace(/["']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const shareQ = () => (state.shareToken ? `?box=${encodeURIComponent(state.shareToken)}` : "");
  const tabPath = () => (state.money ? "/money" : state.tab === "wishlist" ? "/wishlist" : "/");
  const here = () => location.pathname.replace(/\/index\.html$/, "/");
  // move to an address; while Back from closing something is still on its way, wait for it first
  function go(path, opts = {}) {
    if (routeBacking) { routeQueue.push(() => go(path, opts)); return; }
    if (path === here()) return;
    history[opts.replace ? "replaceState" : "pushState"](opts.open ? { bx: "open" } : { bx: "page" }, "", path + shareQ());
  }
  // called right after a dialog opens: give it its address and a tab title
  function routeOpen(d, path, title) {
    d._route = path;
    document.title = title ? `${title} · BoxTally` : baseTitle;
    if (!routeSync) go(path, { open: true });
    else if (path !== here()) history.replaceState(history.state, "", path + shareQ()); // tidy a pasted link, e.g. a renamed tool
  }
  // a dialog closed (its button, Esc, a tap outside, or Save): go to the page underneath as a new step,
  // like leaving a page on any other site, so Back takes you to what you just closed, then on back from there
  function routeClosed(d) {
    if (!d._route) return;
    const was = d._route; d._route = null;
    if (!document.querySelector("dialog[open]")) document.title = baseTitle;
    if (was !== here() || routeSync) return; // Back already moved the address
    go(tabPath());
  }
  document.querySelectorAll("dialog").forEach((d) => d.addEventListener("close", () => routeClosed(d)));
  function readRoute() {
    let seg = [];
    try { seg = here().split("/").filter(Boolean).map(decodeURIComponent); } catch {}
    const [a, b, c] = seg;
    if (!a) return { tab: "owned" };
    if (a === "wishlist" && !b) return { tab: "wishlist" };
    if (a === "money" && !b) return { money: true };
    if (a === "wishlist" && b === "add" && !c) return { tab: "wishlist", open: "add" };
    if (a === "add" && !b) return { tab: "owned", open: "add" };
    if (a === "tool" && b) return { open: c === "edit" ? "edit" : "tool", id: b };
    if (["truck", "insurance", "share", "delete-account", "box-check"].includes(a) && !b) return { open: a };
    return { tab: "owned", unknown: true };
  }
  // make the page match the address: on arrival, and on Back and Forward
  function applyRoute() {
    if (!state.loaded) { routePending = true; return; }
    const r = readRoute();
    const ro = state.readonly, me = signedIn() && !state.demo;
    const item = r.id ? state.items.find((x) => String(x.id) === r.id) : null;
    const want = r.open === "tool" ? viewer : r.open === "edit" || r.open === "add" ? dlg : r.open === "truck" ? truckDlg : r.open === "insurance" ? insDlg : r.open === "share" ? shareDlg : r.open === "delete-account" ? delDlg : r.open === "box-check" ? checkDlg : null;
    const ok = !r.unknown && (!r.open || (r.open === "tool" ? !!item : r.open === "edit" ? !!item && !ro : r.open === "share" || r.open === "delete-account" ? me && !ro : !ro));
    routeSync = true;
    try {
      document.querySelectorAll("dialog[open]").forEach((d) => { if (d._route !== here() || !ok) d.close(); });
      if (!ok) {
        if (r.id) toast("That tool isn't in this box anymore.");
        go(tabPath(), { replace: true });
        return;
      }
      const tab = item ? item.list : r.tab;
      if (tab && tab !== state.tab) setTab(tab);
      if (r.money) setMoney(true);
      else if (r.tab) setMoney(false);
      if (want && !want.open) {
        if (r.open === "tool") openViewer(item.id);
        else if (r.open === "edit") openForm(item);
        else if (r.open === "add") openForm(null);
        else if (r.open === "truck") openTruck();
        else if (r.open === "insurance") Promise.resolve(state.insP).then(() => { if (readRoute().open === "insurance" && !insDlg.open) { routeSync = true; try { openIns(); } finally { routeSync = false; } } });
        else if (r.open === "share") openShare();
        else if (r.open === "delete-account") openDel();
        else if (r.open === "box-check") openCheck();
      }
      if (!want) document.title = baseTitle;
    } finally { routeSync = false; }
  }
  window.addEventListener("popstate", () => {
    if (routeBacking) {
      // this Back was ours, from closing something: the page already matches, so just catch up
      routeBacking = false;
      const q = routeQueue; routeQueue = [];
      q.forEach((f) => f());
      return;
    }
    applyRoute();
  });
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  // The BoxTally name at the top always takes you back to the front of the box, whatever's open.
  // An open window covers the page (and its name), so each one gets the BoxTally mark in its corner too.
  const markSvg = document.querySelector("#homeLink .mark svg").outerHTML;
  document.querySelectorAll("dialog").forEach((d) => d.insertAdjacentHTML("beforeend", `<a class="dlg-home" href="/" data-home title="BoxTally home" aria-label="BoxTally home">${markSvg}</a>`));
  document.addEventListener("click", (e) => {
    const a = e.target.closest("#homeLink, [data-home]"); if (!a) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; // a new tab or window works like a normal link
    e.preventDefault();
    routeBacking = false; routeQueue = [];
    go("/");
    routeSync = true;
    try { document.querySelectorAll("dialog[open]").forEach((d) => d.close()); setMoney(false); if (state.tab !== "owned") setTab("owned"); }
    finally { routeSync = false; }
    document.title = baseTitle;
    scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  });

  /* ---------- start ---------- */
  // ?box=... opens someone's shared box, read-only
  const boxToken = new URLSearchParams(location.search).get("box");
  if (boxToken) {
    state.readonly = true; state.shareToken = boxToken.slice(0, 40);
    const m = document.createElement("meta"); m.name = "robots"; m.content = "noindex"; document.head.appendChild(m);
    document.title = "A shared toolbox · BoxTally";
  }
  // Phones start on the compact list (a tool per row) unless you picked a view; bigger screens on cards.
  let savedView = null;
  try { savedView = localStorage.getItem(LS + "-view"); } catch {}
  if (["cards", "list", "drawers"].includes(savedView)) state.view = savedView;
  else if (matchMedia("(max-width: 620px)").matches) state.view = "list";
  baseTitle = document.title;
  if (readRoute().tab === "wishlist") { routeSync = true; setTab("wishlist"); routeSync = false; }
  if (readRoute().money) { routeSync = true; setMoney(true); routeSync = false; }
  renderAccount();
  render();
  if (!sb) { if (state.readonly) { loadShared(); return; } state.items = local.read(); state.loaded = true; render(); return; }
  // fires once on load (INITIAL_SESSION), and again on sign-in and sign-out
  sb.auth.onAuthStateChange((_event, session) => { setTimeout(() => setUser(session ? session.user : null), 0); });
  // Installable app: works offline for the page itself; your box comes from the last-saved copy.
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("/sw.js").catch(() => {});
});
