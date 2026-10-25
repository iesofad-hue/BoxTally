// Snap-on sells the same tool in several colors and puts the color at the end of the part number:
// R, O, G, GM, HV, MB (red, orange, green, gunmetal, hi-viz, Power Blue), often followed by DB (tool only), and magnetic
// pickups carry AM before the color (PTM18AM, PTM18AMO). Every color of a tool has the same list price,
// so all of them share one family: CDR9050, CDR9050DB, CDR9050HVDB and CDR9050GDB are all "CDR9050".
// Black is BK, but only as BKDB (CTPP861BKDB): a bare BK is a kit (PHG1005BK). Other letter endings
// (B, HD, W, C...) can mean a different tool or kit, so they're left alone.
// Copies: supabase/functions/price-now/color-family.mjs and colorFamily in app.js
// (node checker/color-family.test.mjs checks all three match).
export const COLOR_END = /^(.*\d)(?:AM)?(?:R|O|G|GM|HV|MB|BKDB)?(?:DB)?$/;
export const colorFamily = (pn) => { const m = COLOR_END.exec(String(pn || "")); return m && m[1].length >= 3 ? m[1] : null; };
