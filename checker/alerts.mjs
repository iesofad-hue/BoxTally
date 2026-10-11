// BoxTally price-drop emails.
//
// Once a day: for everyone who ticked "Email me when something on my wishlist drops", look for store
// prices on their wishlist that went down since the last email, and send one short email listing them.
// Runs in GitHub Actions (.github/workflows/price-alerts.yml).
//
// Environment (GitHub Actions secrets):
//   SUPABASE_SECRET_KEY   the project's secret key (already used by the price checker)
//   SMTP_HOST             e.g. smtp.gmail.com
//   SMTP_PORT             e.g. 465
//   SMTP_USER             the account that sends the email
//   SMTP_PASS             its password (for Gmail: an app password)
//   ALERT_FROM            optional, e.g. "BoxTally <alerts@boxtally.app>"; defaults to SMTP_USER
//   DRY_RUN=1             optional: print what would be sent, send nothing

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://ctteljhhjsfvyyiwzxiy.supabase.co").replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SECRET_KEY || "";
const SITE = "https://boxtally.app";
const DRY = process.env.DRY_RUN === "1";
const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

if (!KEY) { console.log("No SUPABASE_SECRET_KEY: nothing to do."); process.exit(0); }
if (!DRY && !(SMTP_HOST && SMTP_USER && SMTP_PASS)) {
  console.log("::notice::Price-drop emails aren't set up yet (SMTP_HOST, SMTP_USER, SMTP_PASS secrets). Skipping.");
  process.exit(0);
}

const today = new Date().toISOString().slice(0, 10);
const money = (n) => Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function rest(path, { method = "GET", body } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} failed: ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const inList = (vals) => `(${vals.map((v) => `"${String(v).replace(/"/g, "")}"`).join(",")})`;

const people = await rest("alert_prefs?email_drops=eq.true&email=not.is.null&select=user_id,email,last_sent_d");
console.log(`${people.length} people want price-drop emails.`);
if (!people.length) process.exit(0);

let transport = null;
if (!DRY) {
  const nodemailer = (await import("nodemailer")).default;
  transport = nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT || 465), secure: Number(SMTP_PORT || 465) === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
}

let sent = 0;
for (const p of people) {
  try {
    const wish = await rest(`items?user_id=eq.${p.user_id}&list=eq.wishlist&part_number=neq.&select=part_number,name`);
    const pns = [...new Set(wish.map((w) => w.part_number))];
    const drops = [];
    if (pns.length) {
      const [hist, cat] = await Promise.all([
        rest(`catalog_prices?part_number=in.${inList(pns)}&select=part_number,d,price&order=d.desc&limit=5000`),
        rest(`catalog?part_number=in.${inList(pns)}&select=part_number,name`),
      ]);
      const names = Object.fromEntries(cat.map((c) => [c.part_number, c.name]));
      const by = {};
      hist.forEach((h) => (by[h.part_number] ||= []).push(h));
      for (const pn of pns) {
        const [now, before] = by[pn] || [];
        // a drop that happened after the last email went out
        if (now && before && Number(now.price) < Number(before.price) && (!p.last_sent_d || now.d > p.last_sent_d)) {
          const mine = wish.find((w) => w.part_number === pn);
          drops.push({ pn, name: (mine && mine.name) || names[pn] || pn, from: Number(before.price), to: Number(now.price) });
        }
      }
    }
    if (drops.length) {
      const subject = drops.length === 1
        ? `Price drop: ${drops[0].name} is now ${money(drops[0].to)}`
        : `${drops.length} price drops on your BoxTally wishlist`;
      const lines = drops.map((d) => `${d.name} (${d.pn}): ${money(d.from)} → ${money(d.to)}, down ${money(d.from - d.to)}`);
      const text = `Good news from BoxTally. Store prices dropped on your wishlist:\n\n${lines.join("\n")}\n\nPrices are shared by people who track each tool, so check Snap-on's store or your dealer before you buy.\n\nSee your wishlist: ${SITE}\nTo stop these emails, untick "Email me when something on my wishlist drops" under Price watch on ${SITE}.`;
      const html = `<p>Good news from BoxTally. Store prices dropped on your wishlist:</p><ul>${drops.map((d) => `<li><strong>${esc(d.name)}</strong> (${esc(d.pn)}): <s>${money(d.from)}</s> → <strong>${money(d.to)}</strong>, down ${money(d.from - d.to)}</li>`).join("")}</ul><p style="color:#586473">Prices are shared by people who track each tool, so check Snap-on's store or your dealer before you buy.</p><p><a href="${SITE}">See your wishlist</a></p><p style="color:#586473;font-size:12px">To stop these emails, untick "Email me when something on my wishlist drops" under Price watch on boxtally.app.</p>`;
      if (DRY) console.log(`Would email ${p.email}: ${subject}\n  ${lines.join("\n  ")}`);
      else { await transport.sendMail({ from: process.env.ALERT_FROM || SMTP_USER, to: p.email, subject, text, html }); sent++; }
    }
    if (!DRY) await rest(`alert_prefs?user_id=eq.${p.user_id}`, { method: "PATCH", body: { last_sent_d: today } });
  } catch (err) {
    console.log(`::warning::Couldn't handle one person's alerts: ${err.message}`);
  }
}
console.log(`Sent ${sent} email${sent === 1 ? "" : "s"}.`);
