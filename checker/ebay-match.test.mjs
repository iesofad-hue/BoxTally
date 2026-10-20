// Checks how eBay listing titles are matched to part numbers. Run: node checker/ebay-match.test.mjs
// Titles are real ones the eBay checker saw on 2026-10-20.
import { exact, variant, sibling, pick, altQueries, base } from "./ebay-match.mjs";

let bad = 0;
const eq = (got, want, what) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };

// exact: the title names the part number as its own word
eq(exact("Snap-on CTR881DB 3/8” 14.4V HIGH-SPEED Cordless Ratchet [Used]", "CTR881"), false, "CTR881DB is not exactly CTR881");
eq(exact("SRXRM710 Flank Drive Ratcheting Box/Speed OpenEnd Combination Wrench Set 10–19mm", "SRXRM710"), true, "long part number without Snap-on");
eq(exact("Snap-On Non-Marring Storage Bag C0100 for set No. PKN500 or PSN500 Set [ used ]", "PSN500"), false, "a bag for a set is not the set");
eq(exact("SNAP ON CTB314 REBUILT BY THE BEST", "CTB314"), false, "rebuild service");
eq(exact("Snap-on Tools NEW RED Soft Grip Handle 1/4\" Hex Pop-Up Shank Screwdriver SGDQ6", "SGDQ6"), true, "plain exact");
eq(exact("Snap on CTR 881 ratchet", "CTR881"), true, "split part number");
eq(exact("Snap-on FXM810 wrench", "FXM8"), false, "FXM8 is not FXM810");

// variant: another color/kit ending, or 0/O
eq(variant("Snap-on CTR881DB 3/8” 14.4V HIGH-SPEED Cordless Ratchet [Used]", "CTR881"), "CTR881DB", "CTR881 ~ CTR881DB");
eq(variant("Snap-on CT9055G impact", "CT9055DB"), "CT9055G", "CT9055DB ~ CT9055G");
eq(variant("Snap-on OFCA1KT filter wrench kit", "0FCA1KT"), "OFCA1KT", "0/O typo");
eq(variant("Snap-on Tools NEW 3/8” High-Speed 14.4V Ratchet w/Foam & Battery CTR881WP1FOAM", "CTR881"), null, "kit with battery is not a variant");
eq(variant("Snap-on S80 ratchet", "S80A"), null, "too short to guess");
eq(base("CTR868GM"), "CTR868", "base");

// similar: same letters and digits, only the last digit differs
eq(sibling("SNAP-ON CTR869 3/8\" EXTRA LONG NECK 14.4V RATCHET", "CTR868GM"), "CTR869", "CTR869 is a sibling of CTR868GM");
eq(sibling("Snap-on CTR761C 14.4V 3/8\" Ratchet", "CTR868GM"), null, "CTR761 is not");
eq(sibling("Snap On CTR714 14.4 V 1/4\" Drive", "CTR868GM"), null, "CTR714 is not");

// pick: exact Buy It Now wins; else variant; else auction; else similar
const it = (title, value, extra = {}) => ({ itemId: title + value, title, price: { value: String(value), currency: "USD" }, condition: "Used", buyingOptions: ["FIXED_PRICE"], ...extra });
eq(pick([it("Snap-on CTR881DB ratchet", 380), it("Snap-on CTR881DB ratchet new", 424.95, { condition: "New" })], "CTR881").source, "variant", "variant chosen");
eq(pick([it("Snap-on F80 ratchet", 99), it("Snap-on F80 ratchet", 120, { buyingOptions: ["AUCTION"], currentBidPrice: { value: "40", currency: "USD" } })], "F80").median, 99, "auction ignored when Buy It Now exists");
eq(pick([it("Snap-on PKNC075 pick", 1, { buyingOptions: ["AUCTION"], currentBidPrice: { value: "25", currency: "USD" } })], "PKNC075").source, "auction", "auction fallback");
const sim = pick([it("Snap-on CTR869 ratchet", 250), it("Snap-on CTR867A ratchet", 300), it("Snap-on CTR861 ratchet", 220), it("Snap-on CTR761 ratchet", 140)], "CTR868GM");
eq([sim.source, sim.listings, sim.median], ["similar", 3, 250], "similar estimate");
eq(pick([it("Snap-on CTR869 ratchet", 250)], "CTR868GM"), null, "one sibling isn't enough");
const wide = pick([it("Snap-on CT9038DB impact", 285), it("Snap-on CT9015DB impact", 250), it("Snap On CT9080G impact", 379.99), it("Snap-on CT861 impact", 199)], "CT9055DB");
eq([wide.source, wide.listings, wide.median, wide.note], ["similar", 3, 285, "CT9038DB, CT9015DB, CT9080G"], "wider family for 4-digit numbers");
eq(sibling("Snap-on F87 ratchet", "F80", true), null, "no wide family for short numbers");

eq(altQueries("CTR868GM"), ["CTR868"], "alt query base");
eq(altQueries("0FCA1KT"), ["OFCA1KT", "0FCA1"], "alt query 0/O");

console.log(bad ? `${bad} failed` : "All eBay matching checks passed.");
process.exit(bad ? 1 : 0);
