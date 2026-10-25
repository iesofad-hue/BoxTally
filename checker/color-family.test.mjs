// node checker/color-family.test.mjs
import { readFileSync } from "node:fs";
import { colorFamily, COLOR_END } from "./color-family.mjs";
const cases = {
  CDR9050: "CDR9050", CDR9050DB: "CDR9050", CDR9050HVDB: "CDR9050", CDR9050GDB: "CDR9050",
  CTR868GMDB: "CTR868", CTR868GM: "CTR868", CT9055DB: "CT9055", CT861AMG: "CT861",
  PTM18AM: "PTM18", PTM18AMO: "PTM18", PTM2AMG: "PTM2", SRPCR107O: "SRPCR107", SAPB200O: "SAPB200",
  CTPP861MBDB: "CTPP861", CTPP861BKDB: "CTPP861", CTPP861GMDB: "CTPP861", CTPP861HVDB: "CTPP861", CTPP861DB: "CTPP861",
  // not colors: left alone
  ADHW8AO: null, PHG1005BK: null, TPGDL2000HD: null, EESC337W: null, SOEXLM710B: null, PB206B: null, CSA12C: null, SPBSDC705FR: null,
  F80: "F80", PKNC075C2: "PKNC075C2", "": null,
};
let bad = 0;
for (const [pn, want] of Object.entries(cases)) {
  const got = colorFamily(pn);
  if (got !== want) { bad++; console.error(`${pn}: got ${got}, want ${want}`); }
}
const here = new URL(".", import.meta.url);
const copy = readFileSync(new URL("../supabase/functions/price-now/color-family.mjs", here), "utf8");
if (copy !== readFileSync(new URL("./color-family.mjs", here), "utf8")) { bad++; console.error("supabase/functions/price-now/color-family.mjs differs from checker/color-family.mjs"); }
if (!readFileSync(new URL("../app.js", here), "utf8").includes(`const COLOR_END = ${COLOR_END};`)) { bad++; console.error("app.js COLOR_END differs from checker/color-family.mjs"); }
if (bad) { console.error(`${bad} color family check(s) failed`); process.exit(1); }
console.log(`All ${Object.keys(cases).length} color family checks passed.`);
