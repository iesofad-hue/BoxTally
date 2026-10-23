// Tells the owner when tools nobody has checked for a Snap-on list price show up.
//
// Keeps one GitHub issue, "Tools need a Snap-on list price", up to date: opens it when there are
// unchecked part numbers, comments (with an @mention, so GitHub emails the owner) when new ones
// appear, and closes it when every tool has been checked. Part numbers only, never who added them.
// Runs daily from .github/workflows/unpriced.yml.
//
// Environment: SUPABASE_URL, SUPABASE_SECRET_KEY, GITHUB_TOKEN, GITHUB_REPOSITORY, OWNER_LOGIN
// Run by hand: node checker/unpriced.mjs --dry-run

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://ctteljhhjsfvyyiwzxiy.supabase.co").replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SECRET_KEY || "";
const GH = process.env.GITHUB_TOKEN || "";
const REPO = process.env.GITHUB_REPOSITORY || "iesofad-hue/BoxTally";
const OWNER = process.env.OWNER_LOGIN || REPO.split("/")[0];
const DRY = process.argv.includes("--dry-run");
const TITLE = "Tools need a Snap-on list price";
const SITE = "https://boxtally.app/";

if (!KEY) { console.error("Missing SUPABASE_SECRET_KEY."); process.exit(1); }

async function rest(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...opts, headers: { apikey: KEY, "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(`${path.split("?")[0]} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
async function gh(path, { method = "GET", body } = {}) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${GH}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub ${method} ${path} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const [tracked, checked] = await Promise.all([
  rest("rpc/parts_for_ebay", { method: "POST", body: "{}" }),
  rest("list_prices?select=part_number,price,source"),
]);
// checked = has a price, or the owner marked it "no price found" (the automatic lookup's misses still count)
const done = new Set(checked.filter((r) => r.price != null || r.source === "owner").map((r) => r.part_number));
const todo = tracked.map((t) => t.part_number).filter((pn) => !done.has(pn)).sort();
console.log(`${tracked.length} tracked part numbers, ${todo.length} not checked yet${todo.length ? `: ${todo.join(" ")}` : ""}`);
if (DRY) process.exit(0);
if (!GH) { console.error("Missing GITHUB_TOKEN."); process.exit(1); }

const body = (pns) => `${pns.length} tool${pns.length === 1 ? "" : "s"} in BoxTally ${pns.length === 1 ? "hasn't" : "haven't"} been checked for a Snap-on list price yet.\n\nOpen [BoxTally](${SITE}), tap **Check them** on the owner bar, and copy them for Gemini 12 at a time.\n\n<!-- pns:${pns.join(",")} -->\n${pns.map((p) => `- ${p}`).join("\n")}\n\n_This issue updates itself every day and closes when every tool has been checked._`;
const open = (await gh(`issues?state=open&creator=app%2Fgithub-actions&per_page=50`)).find((i) => i.title === TITLE && !i.pull_request);

if (!todo.length) {
  if (open) { await gh(`issues/${open.number}`, { method: "PATCH", body: { state: "closed", state_reason: "completed" } }); console.log(`Closed #${open.number}: every tool is checked.`); }
  process.exit(0);
}
if (!open) {
  const i = await gh("issues", { method: "POST", body: { title: TITLE, body: `@${OWNER} ${body(todo)}` } });
  console.log(`Opened #${i.number}.`);
  process.exit(0);
}
const before = new Set(((open.body || "").match(/<!-- pns:([^>]*) -->/) || [, ""])[1].split(",").filter(Boolean));
const fresh = todo.filter((pn) => !before.has(pn));
await gh(`issues/${open.number}`, { method: "PATCH", body: { body: `@${OWNER} ${body(todo)}` } });
if (fresh.length) {
  await gh(`issues/${open.number}/comments`, { method: "POST", body: { body: `@${OWNER} ${fresh.length} new tool${fresh.length === 1 ? "" : "s"} to check: ${fresh.join(", ")}` } });
  console.log(`Updated #${open.number} and pinged about ${fresh.length} new.`);
} else console.log(`Updated #${open.number}; nothing new since last time.`);
