// Weekly backup of BoxTally's database (.github/workflows/backup.yml).
// Copies every table, plus each account's email and truck account (kept in sign-in data), into one JSON file
// in the private "backups" storage bucket, and keeps the newest 8. Only the secret key can read that bucket:
// it has no policies, so nobody on the site can list or download it.
// To get a backup: Supabase dashboard > Storage > backups > download.
//
//   SUPABASE_URL          https://<project>.supabase.co
//   SUPABASE_SECRET_KEY   the project's secret key (sb_secret_...)
//
// Run: node checker/backup.mjs [--dry-run]

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://ctteljhhjsfvyyiwzxiy.supabase.co").replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SECRET_KEY || "";
const DRY = process.argv.includes("--dry-run");
const BUCKET = "backups";
const KEEP = 8;
const TABLES = ["items", "alert_prefs", "box_shares", "insurance_policies", "admins", "catalog", "list_prices", "ebay_prices", "ebay_price_history"];

if (!KEY) {
  console.error("Missing SUPABASE_SECRET_KEY.");
  process.exit(1);
}

async function call(path, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: { apikey: KEY, ...(body !== undefined && typeof body !== "string" ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} failed: ${res.status} ${text.slice(0, 300)}`);
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

// a table, 1,000 rows at a time
async function table(name) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const page = await call(`/rest/v1/${name}?select=*`, { headers: { Range: `${from}-${from + 999}` } });
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

// sign-in accounts: only what BoxTally itself stores (email, truck account), not sign-in tokens
async function accounts() {
  const out = [];
  for (let page = 1; ; page++) {
    const res = await call(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const users = res.users || [];
    out.push(...users.map((u) => ({ id: u.id, email: u.email, created_at: u.created_at, truck: u.user_metadata?.truck ?? null })));
    if (users.length < 200) return out;
  }
}

const backup = { made_at: new Date().toISOString(), tables: {}, accounts: await accounts() };
for (const t of TABLES) backup.tables[t] = await table(t);
const summary = [`${backup.accounts.length} accounts`, ...TABLES.map((t) => `${backup.tables[t].length} ${t}`)].join(", ");
console.log(summary);
if (DRY) { console.log("Dry run: nothing saved."); process.exit(0); }

// the bucket: private, made on the first run
const buckets = await call("/storage/v1/bucket");
if (!buckets.some((b) => b.id === BUCKET)) {
  await call("/storage/v1/bucket", { method: "POST", body: { id: BUCKET, name: BUCKET, public: false } });
  console.log(`Made the private "${BUCKET}" bucket.`);
}

const file = `boxtally-${backup.made_at.slice(0, 10)}.json`;
await call(`/storage/v1/object/${BUCKET}/${file}`, {
  method: "POST",
  body: JSON.stringify(backup),
  headers: { "Content-Type": "application/json", "x-upsert": "true" },
});
console.log(`Saved ${file}.`);

// keep the newest few
const files = (await call(`/storage/v1/object/list/${BUCKET}`, { method: "POST", body: { prefix: "", limit: 1000, sortBy: { column: "name", order: "desc" } } }))
  .map((f) => f.name).filter((n) => /^boxtally-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().reverse();
const old = files.slice(KEEP);
if (old.length) {
  await call(`/storage/v1/object/${BUCKET}`, { method: "DELETE", body: { prefixes: old } });
  console.log(`Removed ${old.length} older backup${old.length === 1 ? "" : "s"}.`);
}
