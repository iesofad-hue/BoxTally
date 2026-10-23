// Checks that index.html asks for app.css, drawings.js and app.js with the same "?v=" number as VERSION in sw.js.
// If they drift apart, a phone could run a new page with old saved code (or the other way round).
// Run: node checker/versions.test.mjs
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const v = read("sw.js").match(/const VERSION = "boxtally-v(\d+)"/)?.[1];
const html = read("index.html");
let bad = 0;
if (!v) { console.log("FAIL sw.js has no VERSION"); bad++; }
for (const f of ["app.css", "drawings.js", "app.js"]) {
  const got = html.match(new RegExp(`/${f.replace(".", "\\.")}\\?v=(\\d+)`))?.[1];
  if (got !== v) { console.log(`FAIL index.html loads ${f}?v=${got} but sw.js VERSION is v${v}`); bad++; }
}
if (!bad) console.log(`Versions match (v${v}).`);
process.exit(bad ? 1 : 0);
