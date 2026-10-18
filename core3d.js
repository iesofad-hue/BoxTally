// BoxTally 3D: the core hand tools (ratchets, sockets, wrenches, screwdrivers, pliers, hammers...).
import { THREE, mat, PI, mesh, slab, circle, poly, starPath, turned, cyl, box, tube, sphere, capsule, at, group, label } from "./kit3d.js";

/* ---------- small helpers shared by the tools ---------- */
// a knurled grip band for a turned profile: fine rings from a to b at radius r
export const knurl = (r, a, b, pitch = 1.3, depth = 0.35) => { const p = []; for (let y = a; y < b - pitch / 2; y += pitch) p.push([r, y], [r - depth, y + pitch / 2]); p.push([r, b]); return p; };
// a little round-headed screw or rivet sitting on a surface
export const rivet = (r, m = mat.satin) => { const g = new THREE.SphereGeometry(r, 16, 8, 0, PI * 2, 0, PI / 2); return mesh(g, m); };

const chromeDS = mat.chrome.clone(); chromeDS.side = THREE.DoubleSide; // for the slotted O2 socket
const softFace = new THREE.MeshPhysicalMaterial({ color: 0xaab0b7, roughness: 0.7 }); // grey non-marring rubber
const brushed = new THREE.MeshPhysicalMaterial({ color: 0xdadee3, metalness: 0.6, roughness: 0.42 }); // bead-blasted panels that catch the key light
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ring = (cx, cy, r, n = 28) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i * 2 * PI) / n), cy + r * Math.sin((i * 2 * PI) / n)]);
// convex outline around a cloud of points (for heads and levers made of two round ends)
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length > 1 && cr(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length > 1 && cr(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop(); return poly(lo.concat(up));
}
// printed text lying flat on a top face (reads from the camera); rz turns it in the plane
function decal(text, w, h, x, y, z, { rz = 0, ...o } = {}) {
  const p = mesh(new THREE.PlaneGeometry(w, h), label(text, w, h, o), false);
  p.rotation.set(-PI / 2, 0, rz); p.position.set(x, y, z); return p;
}
// printed text wrapped round a vertical barrel, centred on angle `a` (0 faces the camera)
function band(text, r, h, y, { a = 0, span = 2.6, ...o } = {}) {
  const p = mesh(new THREE.CylinderGeometry(r, r, h, 48, 1, true, a - span / 2, span), label(text, r * span, h, o), false);
  p.position.y = y; return p;
}
// a slotted cheese-head screw standing on a surface
function screw(r, m = mat.satin, turn = 0.6) {
  const head = turned([[0.1, 0], [r, 0], [r, r * 0.3], [r * 0.8, r * 0.55], [0.1, r * 0.6]], m, { along: "y", segs: 20 });
  const slot = at(box(r * 1.7, 0.5, r * 0.34, mat.hole, 0.05), 0, r * 0.52, 0); slot.rotation.y = turn;
  return group(head, slot);
}
// a lathe whose cross-section is lobed and/or finely ribbed: amt(y) scales the lobes along the axis
function lobed(profile, m, { lobes = 3, lobe = 0.07, amt = () => 1, ribs = 0, rib = 0, ribAmt = () => 0, segs = 96, along = "x", spin = 0 } = {}) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs, spin);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    let k = 1 + lobe * amt(y) * Math.cos(a * lobes);
    if (ribs) { const t = Math.cos(a * ribs); k -= rib * ribAmt(y) * (t > 0.55 ? (t - 0.55) / 0.45 : 0); }
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  g.computeVertexNormals(); if (along === "x") g.rotateZ(-PI / 2);
  return mesh(g, m);
}
// a turned part lying across the bench (axis along z), e.g. a hammer head
function turnedZ(profile, m, { segs = 48, spin = 0 } = {}) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs); g.rotateY(spin); g.rotateX(PI / 2); return mesh(g, m);
}
// a flat prism standing up from y0 to y0+depth (dark holes inside sockets)
function prism(shape, depth, m, y0 = 0) { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 24 }); g.rotateX(-PI / 2); g.translate(0, y0, 0); return mesh(g, m, false); }
const hexShape = (r, rot = PI / 6) => poly(Array.from({ length: 6 }, (_, i) => [r * Math.cos(rot + (i * PI) / 3), r * Math.sin(rot + (i * PI) / 3)]));
const pathShape = (path) => new THREE.Shape(path.getPoints());

/* ---------- ratchets ---------- */
// The pear-shaped head seen from above: round over the gear, narrowing into the neck toward +x.
function pear(R, nx, nw, th = 0.62) {
  const s = new THREE.Shape(), ex = R * Math.cos(th), ey = R * Math.sin(th);
  s.moveTo(ex, ey); s.absarc(0, 0, R, th, 2 * PI - th, false);
  s.quadraticCurveTo(R * 1.12, -nw - 0.6, nx, -nw); s.lineTo(nx, nw); s.quadraticCurveTo(R * 1.12, nw + 0.6, ex, ey);
  return s;
}
// Snap-on's head seen from above: a long oval round the gear (gear centre at x=0, near the front)
// that flows into the neck toward +x, so the whole head reads as a teardrop.
function ovalHead(nx = 40, nw = 8.2, cx = 5, a = 22, b = 16) {
  return hull([...Array.from({ length: 96 }, (_, i) => [cx + a * Math.cos((i * 2 * PI) / 96), b * Math.sin((i * 2 * PI) / 96)]), [nx, -nw], [nx, nw]]);
}
const ellipse = (cx, a, b, n = 72) => poly(Array.from({ length: n }, (_, i) => [cx + a * Math.cos((i * 2 * PI) / n), b * Math.sin((i * 2 * PI) / n)]));
// Head: the Snap-on oval with a raised polished crown and the sculpted reversing lever lying on top.
// The round (sealed) head keeps its gear cover plate, screws and quick-release button.
function ratchetHead({ round = false, thumb = false, drive = 9.5 } = {}) {
  const R = round ? 19.5 : 17.5, top = 7.8;
  const g = group(slab(round ? pear(R, 32, 8.2, 0.42) : ovalHead(), 12, 1.8));
  if (round) {
    const pr = R - 3.4; // cover plate radius
    g.add(at(slab(circle(pr), 0.5, 0.3, mat.satin), 0, top + 0.25, 0));
    const seam = mesh(new THREE.TorusGeometry(pr + 0.35, 0.28, 6, 48), mat.hole); seam.rotation.x = PI / 2; seam.position.y = top + 0.1; g.add(seam);
    for (const a of [2.55, -2.55]) g.add(at(screw(1.7, mat.chrome, a), Math.cos(a) * (pr - 3.6), top + 0.8, Math.sin(a) * (pr - 3.6)));
    g.add(at(turned([[4.6, 0], [6.6, 0], [6.6, 1], [5.8, 1.7], [4.6, 1.7]], mat.chrome, { along: "y" }), 0, top + 0.8, 0));
    const gapR = mesh(new THREE.TorusGeometry(4.65, 0.4, 6, 32), mat.hole); gapR.rotation.x = PI / 2; gapR.position.y = top + 2.4; g.add(gapR);
    const btn = sphere(4.3, mat.chrome); btn.scale.y = 0.55; btn.position.y = top + 2.1; g.add(btn);
  } else g.add(at(slab(ellipse(4, 17.5, 11.5), 0.4, 0.6, brushed), 0, top + 0.2, 0)); // raised satin crown
  if (thumb) // knurled thumbwheel over the gear
    g.add(at(lobed([[0.1, 0], [10.8, 0], [11.4, 0.6], [11.4, 2.8], [10.8, 3.4], [0.1, 3.4]], mat.satin, { lobes: 32, lobe: 0.03, along: "y", segs: 128 }), -2, top + 0.6, 0));
  // reversing lever: a teardrop paddle pivoting behind the gear, its wide end toward the handle, with grip ridges
  const lever = group(slab(hull([...ring(0, 0, 4.2, 16), ...ring(12.5, 0, 6.6, 24)]), 1.8, 0.7));
  [10, 12.6, 15.2].forEach((x) => lever.add(at(box(0.7, 0.5, 8, mat.hole, 0.1), x, 1.5, 0)));
  lever.add(at(screw(2.2, mat.satin, 1.2), 0, 1.3, 0));
  const lx = round ? R + 1.8 : 9, ly = top + (round ? 1.5 : 1.3);
  lever.rotation.y = 0.3; lever.position.set(lx, ly, 0); g.add(lever, at(cyl(4.8, 1.2, mat.satin), lx, top + 0.4, 0));
  // underneath: collar, square drive and its detent ball
  g.add(at(cyl(8.2, 1.4, mat.satin), 0, -8.4, 0), at(box(drive, drive - 0.5, drive, mat.chrome, 0.8), 0, -8.3 - (drive - 0.5) / 2, 0), at(sphere(1.4, mat.chrome), drive / 2 + 0.2, -8.8 - drive / 2, 0));
  return g;
}
// diamond knurling printed on a hard handle's grip panel
let knurlMat = null;
function knurling() {
  if (knurlMat) return knurlMat;
  const c = document.createElement("canvas"); c.width = 512; c.height = 128; const x = c.getContext("2d");
  x.strokeStyle = "rgba(24,28,34,.8)"; x.lineWidth = 2.6;
  for (let i = -128; i < 640; i += 9) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 128, 128); x.moveTo(i + 128, 0); x.lineTo(i, 128); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (knurlMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.75 }));
}
// Ratchet: Snap-on oval head on a chrome beam. Most Snap-on ratchets have a hard handle: polished chrome
// that swells a little toward the rounded end, with a knurled grip panel and a hang hole. Soft-grip ones
// (FH80, FHK80...) get the red dipped grip with molded ribs and a black end cap.
export function ratchet({ len = 200, grip = true, flex = false, round = false, thumb = false } = {}) {
  const head = ratchetHead({ round, thumb }), parts = [];
  const b0 = flex ? 50 : 28, gl = grip ? Math.min(100, len * 0.48) : 0, gx = len - gl - 20; // grip from gx to len+4
  const hl = Math.min(46, len * 0.3); // hard handle: the wider grip zone at the end
  if (grip) parts.push(slab(poly([[b0, -8], [b0 + 18, -6.2], [len - 6, -6], [len, -3.6], [len, 3.6], [len - 6, 6], [b0 + 18, 6.2], [b0, 8]]), 7, 1.4, mat.satin));
  else {
    const s = new THREE.Shape(), e = 6.8, x1 = len - hl;
    s.moveTo(b0, -8); s.lineTo(b0 + 18, -5.8); s.lineTo(x1 - 14, -5.6); s.quadraticCurveTo(x1 - 4, -5.6, x1, -e); s.lineTo(len - e, -e);
    s.absarc(len - e, 0, e, -PI / 2, PI / 2, false); s.lineTo(x1, e); s.quadraticCurveTo(x1 - 4, 5.6, x1 - 14, 5.6); s.lineTo(b0 + 18, 5.8); s.lineTo(b0, 8);
    parts.push(slab(s, 7, 1.4, mat.satin));
  }
  const pEnd = grip ? gx - 4 : len - hl - 16, pLen = pEnd - (b0 + 16); // recessed satin panel with the drive size
  if (pLen > 12) {
    parts.push(at(slab(poly([[b0 + 16, -3.2], [pEnd, -3.4], [pEnd, 3.4], [b0 + 16, 3.2]]), 0.3, 0.25, brushed), 0, 5.1, 0));
    if (pLen > 26) parts.push(decal('3/8" DR', Math.min(34, pLen - 6), 5, b0 + 16 + pLen / 2, 5.6, 0));
  }
  if (grip) {
    const Lr = gl + 6;
    const red = turned([[0.1, 0], [8.2, 0], [10.4, 1.5], [11, 4], [10.6, 7], [9.7, 10], [9.9, 14], [10.8, 19], ...knurl(10.9, 21, Lr - 12, 3.4, 0.75), [11.2, Lr - 9], [11.4, Lr - 2], [11.3, Lr], [0.1, Lr]], mat.red, { segs: 40 });
    const cap = turned([[0.1, 0], [11.5, 0], [11.7, 2], [11.5, 12], [10.5, 18], [8, 21.5], [4, 23.2], [0.1, 23.6]], mat.black, { segs: 40 });
    red.scale.y = cap.scale.y = 0.8; red.position.set(gx, 1, 0); cap.position.set(gx + Lr - 0.5, 1, 0);
    parts.push(red, cap, at(cyl(3, 1.2, mat.hole, { segs: 20 }), gx + Lr + 9, 1 + 11.6 * 0.8 - 0.75, 0));
  } else { // hard handle: satin knurled grip panel and a hang hole
    const k0 = len - hl + 2, k1 = len - 13;
    parts.push(at(slab(poly([[k0, -4.6], [k1, -4.6], [k1, 4.6], [k0, 4.6]]), 0.3, 0.3, brushed), 0, 5.1, 0));
    const kn = mesh(new THREE.PlaneGeometry(k1 - k0, 9.2), knurling(), false); kn.rotation.x = -PI / 2; kn.position.set((k0 + k1) / 2, 5.62, 0); parts.push(kn);
    parts.push(at(cyl(2.6, 7.4, mat.hole, { segs: 20 }), len - 6, 1.4, 0));
  }
  if (flex) { // head on a pinned yoke, tipped up
    head.add(at(box(14, 8, 9, mat.chrome, 2.5), 38, 0, 0));
    const piv = group(head); head.position.x = -42; piv.position.x = 42; piv.rotation.z = -0.42;
    parts.push(piv, at(box(16, 8.4, 3.2, mat.chrome, 1.2), 46, 0, 6.3), at(box(16, 8.4, 3.2, mat.chrome, 1.2), 46, 0, -6.3),
      at(cyl(3.2, 17.4, mat.satin, { along: "z" }), 42, 0, 0), at(cyl(1.4, 17.8, mat.hole, { along: "z", segs: 12 }), 42, 0, 0));
  } else parts.push(head);
  return group(parts);
}

/* ---------- sockets ---------- */
// Socket: standing on its drive end with the opening up. Deep, impact (black), 12-point, spark plug,
// slotted O2 sensor, swivel and bit sockets are variations. The size is printed on the barrel.
export function socket({ h = 26, r = 10.5, deep = false, impact = false, points = 6, bit = false, size = "", spark = false, slot = false, swivel = false } = {}) {
  if (deep) h = 54;
  const m = impact ? mat.oxide : mat.chrome, rIn = r * 0.66, J = swivel ? 28 : 0, top = h, sa = 1.05; // sa: where the O2 slot faces (right-front)
  const prof = [[0.1, 0], [r - 1.6, 0], [r - 0.8, 0.8], [r - 0.8, 10], [r, 12], ...(deep ? [[r, 16], [r - 0.6, 19], [r - 0.6, top - 8], [r, top - 5]] : []), [r, top - 1.2], [r - 0.9, top], [rIn + 1.2, top], [rIn, top - 1]];
  const g = group();
  if (slot) { // a slot down the side for the sensor wire
    g.add(turned(prof.filter(([, y]) => y <= 12).concat([[rIn * 0.8, 12], [0.1, 12]]), m, { along: "y", segs: 64 }));
    const up = prof.filter(([, y]) => y >= 12), lg = new THREE.LatheGeometry(up.map(([a, b]) => new THREE.Vector2(a, b)), 64, sa + 0.42, 2 * PI - 0.84);
    g.add(mesh(lg, chromeDS));
    const ig = new THREE.LatheGeometry([[rIn + 0.4, 12], [rIn + 0.4, top - 1]].map(([a, b]) => new THREE.Vector2(a, b)), 48, sa + 0.42, 2 * PI - 0.84);
    g.add(mesh(ig, mat.hole)); // dark inside wall
  } else {
    g.add(turned(prof, m, { along: "y", segs: 64 }));
    const hole = points === 12 ? pathShape(starPath(12, rIn * 0.88, rIn)) : hexShape(rIn);
    g.add(prism(hole, 9, mat.hole, top - 9.6));
  }
  if (!swivel) { // the square drive hole in the bottom, with a chamfered rim
    const sq = Math.min(9.6, r * 0.95);
    g.add(at(box(sq, 1.2, sq, mat.hole, 0.4), 0, 0.45, 0), at(mesh(new THREE.TorusGeometry(sq * 0.74, 0.5, 8, 40), mat.satin), 0, 0.1, 0));
    g.children.at(-1).rotation.x = PI / 2;
  }
  const groove = mesh(new THREE.TorusGeometry(r - 0.2, 0.35, 8, 64), mat.satin); groove.rotation.x = PI / 2; groove.position.y = 11; g.add(groove); // speed ring line
  if (!deep && !bit) g.add(turned([[r - 0.9, 1.8], ...knurl(r - 0.35, 2, 9.2, 1.2, 0.55), [r - 0.9, 9.4]], impact ? mat.black : mat.steel, { along: "y", segs: 64 })); // knurled grip band
  if (deep && !slot) g.add(turned([[r - 1.1, 2], ...knurl(r - 0.5, 2.4, 8.8, 1.3, 0.5), [r - 1.1, 9]], mat.steel, { along: "y", segs: 64 }));
  if (impact) { // retaining ring groove and pin hole
    const o = mesh(new THREE.TorusGeometry(r + 0.05, 0.75, 8, 48), mat.rubber); o.rotation.x = PI / 2; o.position.y = 5.2; g.add(o);
    g.add(at(cyl(1.1, 1, mat.hole, { along: "z", segs: 12 }), 0, 5.2, r + 0.5));
  }
  if (spark) { // rubber insert that grips the plug, and a hex near the top for a wrench
    const ins = mesh(new THREE.TorusGeometry(rIn * 0.78, 1.3, 8, 32), mat.rubber); ins.rotation.x = PI / 2; ins.position.y = top - 3.2; g.add(ins);
    g.add(at(turned([[r + 0.5, 0], [r + 1.4, 1], [r + 1.4, 8], [r + 0.5, 9]], m, { along: "y", segs: 6 }), 0, top - 11, 0));
  }
  if (bit) { // hex bit with a retaining groove, pressed into the socket
    const b = turned([[0.1, 0], [4.4, 0], [4.4, 14], [3.6, 15.5], [3.6, 17], [4.4, 18.5], [4.4, 25], [3.6, 27], [0.1, 27.4]], mat.chrome, { along: "y", segs: 6 });
    b.position.y = top - 8; g.add(b, at(cyl(4.6, 1.6, mat.oxide, { segs: 6 }), 0, top + 0.6, 0));
  }
  if (size) {
    const y = deep ? top * 0.58 : (12 + top) / 2;
    g.add(band(size, r + 0.15, deep ? 9 : Math.min(9, top - 15), y, { a: slot ? -0.4 : 0, color: impact ? "#e9edf1" : "#20252c" }));
  }
  if (swivel) { // universal joint and female drive under the socket
    g.position.y = J;
    const lower = group(turned([[0.1, 0], [8.4, 0], [9, 0.8], [9, 9], [8.2, 10.5], [0.1, 10.5]], mat.chrome, { along: "y", segs: 48 }));
    for (const sd of [-1, 1]) lower.add( // drive-side ears (pin along x) and socket-side ears (pin along z), with rounded ends
      at(box(3.2, 9, 10, mat.chrome, 1.2), sd * 5.6, 14.5, 0), at(cyl(5, 3.2, mat.chrome, { along: "x" }), sd * 5.6, 18.6, 0),
      at(box(10, 9, 3.2, mat.chrome, 1.2), 0, 23, sd * 5.6), at(cyl(5, 3.2, mat.chrome, { along: "z" }), 0, 18.8, sd * 5.6),
      at(cyl(1.8, 1, mat.satin, { along: "x" }), sd * 7.4, 18.6, 0), at(cyl(1.8, 1, mat.satin, { along: "z" }), 0, 18.8, sd * 7.4));
    lower.add(at(box(7.4, 7.4, 7.4, mat.satin, 1.2), 0, 18.7, 0), at(turned([[0.1, 0], [8.8, 0], [8.8, 1.4], [0.1, 1.4]], mat.chrome, { along: "y" }), 0, 26.8, 0));
    return group(lower, g);
  }
  return g;
}

/* ---------- wrenches ---------- */
// Combination wrench: open end on the left, offset 12-point box end on the right, I-beam shank with the size stamped in it.
export function openHead(gap) {
  const R = gap * 0.6 + 8, w = gap / 2, tip = Math.asin(Math.min(0.95, (w + 2.6) / R));
  const s = new THREE.Shape(); s.moveTo(-R * Math.cos(tip) + 0.8, w); s.lineTo(2, w); s.lineTo(2, -w); s.lineTo(-R * Math.cos(tip) + 0.8, -w);
  s.absarc(0, 0, R, -PI + tip, PI - tip, false); s.closePath();
  return { shape: s, R };
}
export function boxHead(gap, { slot = false } = {}) {
  const R = gap * 0.55 + 7.5, s = circle(R);
  if (slot) { const st = openHead(gap * 0.6); return { shape: st.shape, R }; }
  s.holes.push(starPath(12, gap * 0.5, gap * 0.56)); return { shape: s, R };
}
// flare-nut head: a 12-point ring with a slot through it for the line (slot faces -x)
function flareShape(gap, R) {
  const sw = gap * 0.3, a = Math.asin(sw / R), ri = gap * 0.53, b = Math.asin(sw / ri), s = new THREE.Shape();
  s.moveTo(-R * Math.cos(a), -sw); s.absarc(0, 0, R, -PI + a, PI - a, false); s.lineTo(-ri * Math.cos(b), sw);
  for (let k = 11; k >= -11; k--) { const t = (k * PI) / 12; if (Math.abs(t) < PI - b - 0.02) { const rr = k % 2 ? gap * 0.5 : gap * 0.56; s.lineTo(rr * Math.cos(t), rr * Math.sin(t)); } }
  s.lineTo(-ri * Math.cos(b), -sw); s.closePath(); return s;
}
export function wrench({ gap = 13, left = "open", right = "box", size = "", ratcheting = false } = {}) {
  const len = 110 + gap * 4, xe = len / 2 - 6, T = 3.2 + gap * 0.07, top = T / 2 + 1;
  const w = (x) => 3.6 + 0.12 * gap + 1.6 * (Math.abs(x) / xe) ** 2.2; // shank half-width, flaring into the heads
  const xs = Array.from({ length: 21 }, (_, i) => -xe + (2 * xe * i) / 20);
  const strip = (lo, hi, x0, x1) => { const q = xs.filter((x) => x >= x0 && x <= x1); return poly([...q.map((x) => [x, lo(x)]), ...q.slice().reverse().map((x) => [x, hi(x)])]); };
  const parts = [slab(strip((x) => -w(x), (x) => w(x), -xe, xe), T, 1, mat.satin)];
  const rx = xe - 18; // raised chrome rails along both edges, satin web sunk between them: the I-beam
  for (const s of [-1, 1]) parts.push(at(slab(strip((x) => s * (w(x) - 0.3), (x) => s * (w(x) - 1.7), -rx, rx), 0.7, 0.45), 0, top + 0.35, 0));
  parts.push(at(slab(strip((x) => -(w(x) - 1.9), (x) => w(x) - 1.9, -rx + 4, rx - 4), 0.1, 0.1, brushed), 0, top + 0.06, 0));
  const end = (kind, sd) => {
    const g = group();
    if (kind === "open") {
      const h = openHead(gap); g.add(slab(h.shape, T + 1.2, 1.4, mat.satin)); g.rotation.y = (sd < 0 ? 0 : PI) + 0.26; g.position.x = sd * (xe + h.R * 0.62);
      return g;
    }
    const R = gap * 0.55 + 7.5, H = T + (kind === "box" ? 2.4 : 3.2);
    let sh;
    if (kind === "flare") sh = flareShape(gap, R);
    else { sh = hull([...ring(0, 0, R, 48), ...ring(-R * 1.05, 0, w(xe) + 0.6, 16)]); sh.holes.push(ratcheting ? circle(gap * 0.5 + 3.2) : starPath(12, gap * 0.5, gap * 0.56, PI / 12)); }
    const head = slab(sh, H, 1.4, mat.satin); g.add(head);
    if (kind === "box" && !ratcheting) { const c = new THREE.Shape(); c.absarc(0, 0, gap * 0.56 + 1.7, 0, 2 * PI); c.holes.push(starPath(12, gap * 0.5, gap * 0.56, PI / 12)); g.add(at(slab(c, 0.2, 0.2, mat.chrome), 0, H / 2 + 1.25, 0)); } // polished chamfer ring
    if (ratcheting) { // gear ring with its 12-point bore, and the cover ring
      const gr = circle(gap * 0.5 + 3.25); gr.holes.push(starPath(12, gap * 0.5, gap * 0.56, PI / 12));
      g.add(slab(gr, H + 0.6, 0.3, mat.oxide));
      const cv = circle(gap * 0.5 + 5.6); cv.holes.push(circle(gap * 0.5 + 3.4)); g.add(at(slab(cv, 0.3, 0.2, mat.chrome), 0, H / 2 + 1.3, 0));
    }
    if (kind === "flare") g.rotation.y = sd < 0 ? 0 : PI; else g.rotation.y = sd < 0 ? PI : 0; // slot outward / neck toward the shank
    const piv = group(g), dx = 6 + R * 0.62; g.position.x = sd * dx; piv.position.x = sd * (xe - 6);
    if (kind === "box") piv.rotation.z = sd * 0.2; // 15-degree style offset: the box end is raised off the bench
    return piv;
  };
  parts.push(end(left, -1), end(right, 1));
  if (size) parts.push(decal(size, Math.min(44, rx * 2 - 20), 6.4, 0, top + 0.35, 0, { font: "800 80px ui-sans-serif, Helvetica, Arial, sans-serif" }));
  return group(parts);
}

/* ---------- screwdrivers and picks ---------- */
// Handle: sculpted red acetate with three soft lobes and fine grip ridges, a black butt band.
// x runs from the butt (0) to the nose (len).
export function handle(len = 100, r = 12.5, m = mat.red, bandM = mat.black) {
  const ribZone = (y) => smooth(12, 20, y) * (1 - smooth(len * 0.5, len * 0.62, y));
  const body = lobed([[0.1, 0], [r * 0.62, 0.3], [r * 0.86, 1.6], [r * 0.97, 4.5], [r, 9], [r, len * 0.56], [r * 0.95, len * 0.68], [r * 0.84, len * 0.78], [r * 0.68, len * 0.87], [r * 0.6, len * 0.9], [r * 0.64, len * 0.92], [r * 0.54, len * 0.96], [r * 0.47, len], [0.1, len]],
    m, { ribs: 15, rib: 0.05, ribAmt: ribZone, segs: 120 });
  const cap = lobed([[0.1, -0.4], [r * 0.66, -0.1], [r * 0.9, 1.4], [r * 1.0, 4.6], [r * 1.01, 11], [r * 0.99, 12], [0.1, 12]], bandM, { segs: 72 });
  return group(body, cap);
}
// chrome ferrule at the nose and the hex bolster the shaft comes out of
const bolster = (x, r, shaftR) => { const b = shaftR + 2.6; return group(at(turned([[0.1, 0], [r * 0.47, 0], [r * 0.47, 1.6], [r * 0.38, 3.4], [0.1, 3.4]], mat.chrome), x - 0.6, 0, 0), at(turned([[0.1, 0], [b * 0.8, 0], [b, 1.2], [b, 7.8], [b * 0.75, 9.4], [shaftR, 10.4], [0.1, 10.4]], mat.chrome, { segs: 6 }), x + 2.4, 0, 0)); };
export function screwdriver({ tip = "flat", len = 230, hlen = 100, r = 12.5, shaftR = 3, m = mat.red, insulated = false } = {}) {
  const sx = hlen, ex = len - 12;
  const parts = [handle(hlen, r, m, insulated ? mat.red : mat.black), bolster(sx, r, shaftR), at(cyl(shaftR, ex - sx - 10, insulated ? mat.red : mat.chrome, { along: "x" }), (sx + 10 + ex) / 2, 0, 0)];
  if (insulated) parts.push(at(cyl(shaftR * 0.8, 12, mat.chrome, { along: "x" }), ex - 4, 0, 0), at(turned([[shaftR, 0], [shaftR * 1.5, 1.5], [shaftR * 1.5, 5], [shaftR, 7]], mat.red), sx + 10, 0, 0));
  if (tip === "flat") { // ground blade: flares wider and thins to the edge
    const g = new THREE.BoxGeometry(18, shaftR * 1.5, shaftR * 2, 12, 1, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = (p.getX(i) + 9) / 18; p.setZ(i, p.getZ(i) * (1 + 0.5 * u)); p.setY(i, p.getY(i) * (1 - 0.8 * u)); }
    g.computeVertexNormals(); parts.push(at(mesh(g, mat.chrome), ex + 5, 0, 0));
  } else if (tip === "phillips") parts.push(at(lobed([[shaftR, 0], [shaftR, 4], [shaftR * 0.8, 8.5], [shaftR * 0.4, 12], [0.4, 13.4], [0.1, 13.6]], mat.chrome, { lobes: 4, lobe: 0.34, amt: (y) => smooth(3, 8, y), segs: 64, spin: PI / 4 }), ex - 2, 0, 0));
  else parts.push(at(lobed([[shaftR, 0], [shaftR, 4], [shaftR * 0.86, 6], [shaftR * 0.86, 11], [shaftR * 0.62, 12], [0.1, 12.2]], mat.chrome, { lobes: 6, lobe: 0.2, amt: (y) => smooth(4, 6, y), segs: 72 }), ex - 2, 0, 0));
  return group(parts);
}
export function nutdriver() {
  return group(handle(100), bolster(100, 12.5, 4.5), at(cyl(4.5, 96, mat.chrome, { along: "x" }), 158, 0, 0),
    at(turned([[0.1, 0], [4.5, 0], [4.5, 2], [6.8, 6], [7.2, 8], [7.2, 22], [6.6, 24], [0.1, 24]], mat.chrome), 205, 0, 0),
    at(cyl(4.4, 2, mat.hole, { segs: 6, along: "x" }), 228.2, 0, 0), decal("10mm", 12, 4, 219, 7.3, 0, { font: "800 80px ui-sans-serif, Helvetica, Arial, sans-serif" }));
}
export function pick({ shape = "hook" } = {}) {
  const k = shape === "straight" ? [[200, 0, 0], [230, 0, 0]] : shape === "45" ? [[196, 0, 0], [212, 0, 0], [222, 0, -8]] : shape === "complex" ? [[196, 0, 0], [214, 0, 0], [222, 0, -6], [216, 0, -12]] : [[196, 0, 0], [214, 0, 0], [222, 0, -4], [221, 0, -14]];
  const tipA = k.at(-1), tipB = k.at(-2), d = [tipA[0] - tipB[0], tipA[2] - tipB[2]], dl = Math.hypot(...d);
  const point = at(cyl(1.8, 5, mat.chrome, { r2: 0.25, segs: 12, along: "x" }), tipA[0] + (d[0] / dl) * 2.4, 0, tipA[2] + (d[1] / dl) * 2.4); // sharpened point
  point.rotation.y = -Math.atan2(d[1], d[0]);
  return group(handle(90, 10.5), bolster(90, 10.5, 1.8), tube([[100, 0, 0], [150, 0, 0], ...k], 1.8, mat.chrome, 12), point);
}

/* ---------- pliers ---------- */
// Two forged halves crossing at a riveted pivot, serrated jaws (slightly open so the teeth show),
// red dipped grips with a flared finger stop and black dipped ends.
export const JAWS = {
  slip: [[8, 0], [8, 8.5], [-18, 8], [-38, 5.5], [-50, 1.2], [-51, 0]],
  needle: [[8, 0], [8, 7.5], [-18, 5.6], [-72, 1.6], [-78, 0.4], [-78, 0]],
  diag: [[8, 0], [8, 10], [-12, 10], [-28, 5], [-36, 0]],
};
function jawOutline(jaw) {
  const out = (JAWS[jaw] || JAWS.diag).slice(), tipX = out.at(-1)[0];
  if (jaw === "slip" || jaw === "needle") { // teeth along the gripping edge; slip-joint jaws also get the round pipe notch
    const pitch = jaw === "needle" ? 2.2 : 3, d = jaw === "needle" ? 0.9 : 1.5;
    let i = 0; for (let x = tipX + 2; x < -4; x += pitch / 2, i++) {
      const base = jaw === "slip" && x > -26 ? 3 * Math.sin((PI * (x + 26)) / 22) : 0;
      out.push([x, base + (i % 2 ? d : 0)]);
    }
  }
  if (jaw === "strip") { out.length = 0; out.push(...JAWS.diag); for (const [c, rr] of [[-20, 0.9], [-14, 1.2], [-7.5, 1.6]]) { for (let a = PI; a >= 0; a -= PI / 6) out.push([c - rr * Math.cos(a), rr * Math.sin(a)]); } }
  return out;
}
export function pliers({ jaw = "slip", pump = false } = {}) {
  const open = jaw === "diag" ? 0.015 : jaw === "strip" ? 0.03 : 0.062;
  const half = (s) => {
    const j = slab(poly(jawOutline(jaw).map(([x, y]) => [x, -s * y])), 5.2, 1, mat.satin); // jaw on the +s side, handle on the -s side
    if (pump) { const jp = group(j); jp.rotation.y = -0.5; jp.scale.setScalar(1.12); }
    const steel = group(pump ? j.parent : j, slab(circle(12), 5.2, 1, mat.satin), slab(poly([[4, s * 2.5], [36, s * 5.2], [36, s * 12.2], [4, s * 11]]), 4.4, 0.8, mat.satin));
    if (jaw === "diag" || jaw === "strip") steel.add(at(slab(poly([[-34, 0], [-28, -s * 2.6], [-12, -s * 3.4], [2, -s * 3.4], [2, 0]]), 0.2, 0.15, mat.chrome), 0, 3.75, 0)); // polished cutting bevel
    steel.position.y = s * 1.6;
    // the dipped grip: a turned sleeve along the handle line
    const C0 = [34, -s * 8.6], C1 = [140, -s * 25.4], dx = C1[0] - C0[0], dz = C1[1] - C0[1], L = Math.hypot(dx, dz);
    const red = turned([[0.1, -3], [6.4, -3], [9.4, 0.5], [10, 3], [9.2, 6], [7.6, 10], [7, 16], [7.2, 40], [7.5, 64], [7.2, L - 26], [7.1, L - 22], [0.1, L - 22]], mat.red, { segs: 40 });
    const tip = turned([[0.1, 0], [7.25, 0], [7.5, 2], [7.5, 18], [7, 24], [5.2, 27.5], [2.4, 29], [0.1, 29.3]], mat.black, { segs: 40 });
    tip.position.x = L - 24;
    const gr = group(red, tip); red.scale.y = tip.scale.y = 0.78; gr.rotation.y = -Math.atan2(dz, dx); gr.position.set(C0[0], 0, C0[1]);
    const hs = group(steel, gr); hs.rotation.y = s * open; return hs;
  };
  const top = half(1), parts = [top, half(-1)];
  if (pump) { // tongue-and-groove channel on the upper half
    const ch = group(slab(hull([...ring(11, 1.8, 5.6, 20), ...ring(31, 5.2, 5.6, 20)]), 1.2, 0.6, mat.satin));
    for (let i = 0; i < 5; i++) { const b = at(box(1, 0.6, 8, mat.hole, 0.1), 13 + i * 4.2, 1.2, -(2.2 + i * 0.72)); b.rotation.y = -0.17; ch.add(b); }
    top.children[0].add(at(ch, 0, 4.4, 0));
  }
  // riveted pivot: washer, domed head, dark seat line
  const dome = sphere(5.2, mat.chrome); dome.scale.y = 0.42; dome.position.y = 5.9;
  const seat = mesh(new THREE.TorusGeometry(7.3, 0.4, 6, 32), mat.hole); seat.rotation.x = PI / 2; seat.position.y = 5.25;
  parts.push(at(cyl(7.2, 0.8, mat.satin), 0, 5.6, 0), dome, seat, at(cyl(5.4, 9.4, mat.satin), 0, 0, 0));
  return group(parts);
}

/* ---------- drive accessories ---------- */
export function extension({ len = 150 } = {}) {
  return group(turned([[0.1, 0], [9.5, 0], [10, 1], [10, 4], ...knurl(10, 4, 18), [10, 20], [9.3, 21], [9.3, 22.2], [10, 23], [8, 25], [5.6, 28.5], [5.4, len - 12], [6.2, len - 10.5], [6.6, len - 8.5], [6.6, len - 1], [6, len], [0.1, len]], mat.chrome),
    at(box(9.6, 9.6, 9.6, mat.chrome, 0.8), len + 4.6, 0, 0), at(sphere(1.5, mat.chrome), len + 5.4, 0, 4.9), at(box(0.8, 8.6, 8.6, mat.hole, 0.3), 0.2, 0, 0),
    at(cyl(10.2, 1.2, mat.satin, { along: "x" }), 21.6, 0, 0));
}
// Breaker bar: flex head on a pinned yoke, long chrome bar, satin knurled grip.
export function breaker() {
  const tang = group(at(box(30, 11, 9.2, mat.chrome, 3), -11, 0, 0), at(box(12.7, 12, 12.7, mat.chrome, 1), -19, -10, 0), at(sphere(1.6, mat.chrome), -19, -11, 6.5), at(cyl(8, 1.2, mat.satin), -19, -4.9, 0));
  tang.rotation.z = 0.5;
  return group(turned([[0.1, -2], [6, -2], [7.5, 0], [7.5, 252], [0.1, 252]], mat.chrome), at(box(12, 13, 18, mat.chrome, 3), 2, 0, 0),
    at(box(18, 11, 3.4, mat.chrome, 1.4), -7, 0, 6.6), at(box(18, 11, 3.4, mat.chrome, 1.4), -7, 0, -6.6), at(cyl(3.6, 19, mat.satin, { along: "z" }), -10, 0, 0), at(cyl(1.5, 19.4, mat.hole, { along: "z", segs: 12 }), -10, 0, 0),
    at(tang, -10, 0, 0),
    turned([[0.1, 248], [7.5, 248], [9.4, 253], ...knurl(9.7, 255, 352, 2.2, 0.9), [9.4, 355], [8.6, 360], [6, 363], [0.1, 364]], mat.steel, { segs: 40 }),
    at(cyl(2.6, 19.4, mat.hole, { segs: 16 }), 357.5, 0, 0));
}
export function adapter() {
  return group(turned([[0.1, 0], [10.5, 0], [11, 1], [11, 3], ...knurl(11, 3, 15, 1.2, 0.45), [11, 17], [11, 20], [8, 24], [6, 28], [5.6, 30], [5.6, 34], [0.1, 35]], mat.chrome),
    at(box(7.2, 7.2, 7.2, mat.satin, 0.6), 38, 0, 0), at(sphere(1.2, mat.chrome), 38.5, 0, 3.7), at(box(0.8, 9.6, 9.6, mat.hole, 0.3), 0.2, 0, 0), at(cyl(11.2, 1, mat.satin, { along: "x" }), 18.5, 0, 0));
}

/* ---------- hammers ---------- */
// Hammers lie on their side: handle along the bench (+x), head across it (along z) with the striking face toward the camera.
function hammerHandle(hl = 280, { shaftM = mat.red, gripM = mat.rubber } = {}) {
  const sl = hl - 105;
  const shaft = turned([[0.1, 0], [8.6, 0], [8.6, 14], [10.8, 16], [11.4, 22], [9.4, 32], [8.3, 70], [8.4, sl - 40], [9.2, sl], [0.1, sl]], shaftM, { segs: 40 });
  const grip = turned([[0.1, 0], [9.2, 0], [10, 4], [10.3, 10], ...knurl(10.6, 12, 82, 3.6, 0.9), [10.9, 86], [12.2, 95], [12.6, 101], [11.6, 107], [8, 110], [0.1, 110.6]], gripM, { segs: 40 });
  grip.position.x = sl - 6;
  const g = group(shaft, grip); [shaft, grip].forEach((m) => m.scale.set(1, 0.84, 1.14)); g.position.x = 4;
  return g;
}
// the end of the handle showing through the top of the eye, split by a steel wedge
const wedge = (x, rz, ry) => { const e = at(cyl(1, 0.8, mat.black, { along: "x", segs: 24 }), x, 0, 0); e.scale.set(1, ry, rz); return group(e, at(box(1.2, 1.4, rz * 1.6, mat.steel, 0.2), x - 0.4, 0, 0), at(cyl(1.4, 1.6, mat.steel, { along: "x", segs: 12 }), x - 0.5, 0, rz * 0.45)); };
export function hammer({ kind = "ballpeen" } = {}) {
  let head, hl = 262;
  if (kind === "deadblow") {
    head = group(turnedZ([[0.1, -34], [17, -34], [19.5, -33], [20.5, -31], [20.5, -26], [19.8, -25], [20.5, -24], [20.5, 24], [19.8, 25], [20.5, 26], [20.5, 31], [19.5, 33], [17, 34], [0.1, 34]], mat.red));
    for (const s of [-1, 1]) { const f = turnedZ([[0.1, 0], [19, 0], [20.6, 1.2], [21, 3], [21, 9], [0.1, 9]], mat.black); f.scale.z = s; f.position.z = s * 33; head.add(f); }
    head.add(decal("DEAD BLOW", 30, 6, 0, 20.6, 0, { color: "#f2f2f2", rz: PI / 2 }));
  } else if (kind === "mallet") {
    head = group(turnedZ([[0.1, -42], [19, -42], [22.5, -40.5], [24, -37], [24.6, -20], [24.8, 0], [24.6, 20], [24, 37], [22.5, 40.5], [19, 42], [0.1, 42]], mat.gloss, { segs: 56 }));
    const seam = mesh(new THREE.TorusGeometry(24.8, 0.45, 6, 56), mat.hole); head.add(at(seam, 0, 0, 0));
    const soft = turnedZ([[0.1, 0], [18.6, 0], [21.6, 1.4], [22.8, 4.2], [0.1, 4.2]], softFace, { segs: 56 }); soft.position.z = 41.2; head.add(soft); // non-marring face
  } else if (kind === "sledge") {
    hl = 340;
    head = group(turnedZ([[0.1, -44], [17, -44], [19, -42], [19, 42], [17, 44], [0.1, 44]], mat.steel, { segs: 8, spin: PI / 8 }));
    for (const s of [-1, 1]) { const f = turnedZ([[0.1, 0], [16.6, 0], [18.4, 1.6], [19, 4], [0.1, 4]], mat.satin, { segs: 8, spin: PI / 8 }); f.scale.z = -s; f.position.z = s * 47.6; head.add(f); }
    head.add(wedge(-17.7, 10, 7), at(box(22, 0.4, 30, brushed, 0.15), 0, 17.65, 0));
  } else { // ball peen: rounded face with a chamfer, neck, forged cheeks round the eye, neck, ball peen
    head = group(turnedZ([[0.1, -62], [5, -61.4], [9.5, -59], [12.2, -55], [13, -50], [12.4, -45], [9.6, -40.5], [8.2, -36], [8, -30], [9, -24], [11, -16], [11, 16], [10.8, 20], [11, 26], [13.4, 31], [15.6, 36], [16.2, 42], [15.6, 45.5], [13.8, 47.4], [9, 48.4], [0.1, 48.6]], mat.chrome, { segs: 56 }));
    head.add(at(box(24, 26, 30, mat.satin, 6.5), 0, 0, 0), at(box(17, 0.4, 23, brushed, 0.15), 0, 13.05, 0), wedge(-12.1, 8.6, 6.2));
    head.scale.setScalar(1.12);
  }
  if (kind === "deadblow" || kind === "mallet") head.add(at(cyl(11, 6, mat.red, { along: "x", r2: 9.4 }), 21, 0, 0));
  return group(hammerHandle(hl, { gripM: kind === "deadblow" ? mat.black : mat.rubber }), head);
}
export function prybar() {
  const g = group(turned([[0.1, 0], [6, 0], [6.4, 2], [6.4, 250], [0.1, 250]], mat.chrome, { segs: 6 }), tube([[2, 0, 0], [-10, 0, 1.5], [-20, 0, 6]], 6, mat.chrome, 6));
  const blade = slab(poly([[0, -6.6], [16, -5.6], [21, -4.6], [22, 0], [21, 4.6], [16, 5.6], [0, 6.6]]), 3.4, 0.6, mat.satin); // flattened, ground prying tip
  const bp = group(blade); bp.rotation.y = -(PI - 0.42); bp.position.set(-17, 0, 4.6);
  const grip = turned([[0.1, 0], [8.6, 0], [10.4, 3], [10.6, 8], [9.6, 12], ...knurl(10.2, 14, 80, 3.6, 0.8), [10.6, 84], [11, 92], [0.1, 92]], mat.red, { segs: 40 });
  const cap = turned([[0.1, 0], [11, 0], [11.2, 12], [10.4, 20], [0.1, 20]], mat.black, { segs: 40 });
  return group(g, bp, at(grip, 236, 0, 0), at(cap, 327, 0, 0), at(turned([[0.1, 0], [9.6, 0], [9.6, 4], [8.6, 7], [0.1, 7.4]], mat.chrome, { segs: 40 }), 346, 0, 0));
}
// Punches: chamfered striking end, knurled body, taper to the tip. The cold chisel has an octagonal body.
export function punch({ chisel = false } = {}) {
  if (chisel) {
    const m = turned([[0.1, 0], [6.4, 0], [8.2, 1.6], [8.6, 4], [8.6, 98], [7, 130], [6, 150], [0.1, 152]], mat.satin, { segs: 8 });
    m.geometry.rotateX(PI / 8);
    const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); if (x > 110) p.setY(i, p.getY(i) * (1 - Math.min(0.82, (x - 110) / 42))); } m.geometry.computeVertexNormals();
    const sb = turned([[8.7, 14], [8.9, 15], [8.9, 60], [8.7, 61]], brushed, { segs: 8 }); sb.geometry.rotateX(PI / 8);
    return group(m, sb, at(box(5, 1.2, 12, mat.satin, 0.3), 149.5, 0, 0), decal('3/4"', 22, 9, 38, 8.35, 0, { font: "800 80px ui-sans-serif, Helvetica, Arial, sans-serif" }));
  }
  const body = turned([[0.1, 0], [5.6, 0], [7.2, 1.4], [7.6, 3.5], [7.6, 10], ...knurl(7.6, 10, 82, 1.1, 0.45), [7.6, 92], [6.6, 102], [3.2, 120], [2.6, 124], [2.6, 178], [2.2, 179.4], [0.1, 179.6]], mat.chrome, { segs: 40 });
  return group(body, turned([[7.62, 84], [7.7, 85], [7.7, 91], [7.62, 92]], mat.satin, { segs: 40 }));
}
// Click torque wrench: ratchet head, chrome tube with a printed scale window, satin thimble with ticks, knurled red grip, lock knob.
export function torque() {
  const head = ratchetHead();
  const g = group(head, slab(poly([[26, -8], [50, -7], [50, 7], [26, 8]]), 9, 1.6), turned([[0.1, 0], [7, 0], [9.6, 10], [9.6, 216], [0.1, 216]], mat.chrome), turned([[0.1, 0], [9.6, 0], [10.2, 1], [10.2, 14], [10.6, 15], [0.1, 15]], mat.satin));
  g.children[2].position.x = 44; g.children[3].position.x = 258;
  g.add(at(slab(poly([[150, -3.6], [234, -3.6], [234, 3.6], [150, 3.6]]), 0.2, 0.25, mat.white), 0, 9.75, 0), decal("20  40  60  80  100", 80, 5, 192, 10.25, 0), at(box(1, 0.4, 7, mat.red, 0.1), 181, 10.3, 0));
  const ticks = mesh(new THREE.CylinderGeometry(10.25, 10.25, 12, 48, 1, true, -1, 2), label("| 0 | 2 | 4 | 6 |", 40, 10), false); ticks.rotation.z = -PI / 2; ticks.position.x = 265.5; g.add(ticks);
  g.add(at(turned([[0.1, 0], [10.2, 0], [11, 2], ...knurl(11.4, 4, 76, 2.2, 0.55), [11, 78], [10.2, 80], [0.1, 80]], mat.red, { segs: 40 }), 274, 0, 0));
  g.add(at(lobed([[0.1, 0], [10, 0], [10.6, 1.5], [10.6, 12], [9, 15], [5, 16.4], [0.1, 16.6]], mat.black, { lobes: 16, lobe: 0.05, segs: 96 }), 354, 0, 0));
  return g;
}
// Hex keys: nested L-keys with chamfered ends, held in a clip printed with their sizes.
export function hexkeys() {
  const sizes = [2, 2.5, 3, 4, 5, 6, 8], g = group();
  sizes.forEach((s, i) => {
    const r = s / 2 + 0.2, x0 = -i * 5, z = -i * 13, L = 70 + i * 13, sh = 20 + i * 4.5 + i * 13 * 0.25, bend = r * 1.6;
    const leg = (l) => turned([[0.1, 0], [r * 0.7, 0], [r, r * 0.45], [r, l - r * 0.45], [r * 0.7, l], [0.1, l]], mat.chrome, { segs: 6 });
    const long = leg(L - bend); long.position.set(x0 + bend, r, z);
    const short = leg(sh - bend); short.rotation.y = -PI / 2; short.position.set(x0, r, z + bend); // +x turned to +z
    const el = mesh(new THREE.TorusGeometry(bend, r, 6, 8, PI / 2), mat.chrome); el.rotation.x = PI / 2; el.rotation.z = PI; el.position.set(x0 + bend, r, z + bend);
    g.add(long, short, el);
  });
  // the clip: a red plastic strip across the long legs, sizes printed by each key
  const zc = (-(sizes.length - 1) * 13) / 2, cw = sizes.length * 13 + 10;
  g.add(at(box(22, 10, cw, mat.redp, 3), 46, 4, zc), at(box(24, 2.4, cw + 2, mat.black, 1), 46, 0.6, zc));
  sizes.forEach((s, i) => g.add(decal(String(s), 18, 8.5, 46, 9.1, -i * 13, { color: "#f4f5f6", font: "800 80px ui-sans-serif, Helvetica, Arial, sans-serif" })));
  return g;
}

/* ---------- sets ---------- */
export function socketRail({ n = 7 } = {}) {
  const sizes = [8, 9, 10, 11, 12, 13, 14, 15, 17, 19].slice(0, n), rs = sizes.map((s) => s * 0.6 + 3.2), gap = 7;
  const W = rs.reduce((a, r) => a + 2 * r + gap, gap + 14);
  const rail = group(at(box(W, 6, 30, mat.red, 2), 0, 3, 0), at(box(W + 4, 3, 32, mat.black, 1), 0, -0.5, 0));
  for (const s of [-1, 1]) rail.add(at(box(9, 9, 32, mat.black, 2.5), s * (W / 2 - 2), 4, 0));
  const t = mesh(new THREE.PlaneGeometry(W * 0.5, 4.2), label('3/8" DRIVE  ·  METRIC', W * 0.5, 4.2, { color: "#f1f3f5" }), false); t.position.set(0, 3, 15.08); rail.add(t);
  let x = -W / 2 + 7 + gap;
  sizes.forEach((sz, i) => { const r = rs[i]; x += r; rail.add(at(cyl(4.2, 2, mat.black), x, 6.5, -3), at(socket({ r, h: 20 + r * 0.55, size: String(sz) }), x, 6.8, -3)); x += r + gap; });
  return rail;
}
export function wrenchSet() { const g = group(); [10, 11, 12, 13, 14].forEach((s, i) => { const w = wrench({ gap: s, size: s + "mm" }); w.position.set(0, i * 0.2, -i * 34); g.add(w); }); return g; }
