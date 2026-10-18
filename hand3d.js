// BoxTally 3D: more hand tools (adjustables, special pliers, drive accessories, cutting and body tools, sets).
// Millimetres. Flat tools lie on the bench: x runs along the tool, y is up, z points at the camera.
import { THREE, mat, PI, mesh, slab, circle, poly, starPath, turned, cyl, box, tube, sphere, capsule, at, group, label } from "./kit3d.js";
import { handle, openHead, socket } from "./core3d.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

/* ---------- local helpers ---------- */
const V3 = (p) => new THREE.Vector3(...p);
const phys = (o) => new THREE.MeshPhysicalMaterial(o);
const green = () => phys({ color: 0x168a3c, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 });
const dipYellow = () => phys({ color: 0xf2b705, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 });

// printed text lying flat on a surface (rot turns it in the bench plane)
function decal(text, w, h, x, y, z, o = {}, rot = 0) {
  const p = mesh(new THREE.PlaneGeometry(w, h), label(text, w, h, o), false);
  p.rotation.set(-PI / 2, 0, rot); p.position.set(x, y, z); return p;
}
// a canvas-painted material (dials, rulers, file teeth)
function paint(w, h, draw, props = {}, repeat = null) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return phys({ map: t, ...props });
}
// a 2D outline that follows a centre line with the given width(s)
function strip(pts, w) {
  const L = [], R = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const h = (Array.isArray(w) ? w[i] : w) / 2;
    L.push([p[0] - dy * h, p[1] + dx * h]); R.push([p[0] + dy * h, p[1] - dx * h]);
  });
  return poly([...L, ...R.reverse()]);
}
const smooth2 = (pts, n = 24) => new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(n).map((v) => [v.x, v.y]);
// an outline standing up (profile in x/y, thickness along z)
function vslab(shape, depth, bevel = 1, m = mat.chrome) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 32 });
  g.translate(0, 0, -depth / 2); return mesh(g, m);
}
// a polyline with rounded bends, as a curve for TubeGeometry
function bent(pts, R) {
  const cp = new THREE.CurvePath(), v = pts.map(V3); let start = v[0];
  for (let i = 1; i < v.length - 1; i++) {
    const a = v[i - 1], b = v[i], c = v[i + 1], r = Math.min(R, a.distanceTo(b) * 0.45, b.distanceTo(c) * 0.45);
    const p1 = b.clone().addScaledVector(b.clone().sub(a).normalize(), -r), p2 = b.clone().addScaledVector(c.clone().sub(b).normalize(), r);
    cp.add(new THREE.LineCurve3(start, p1)); cp.add(new THREE.QuadraticBezierCurve3(p1, b, p2)); start = p2;
  }
  cp.add(new THREE.LineCurve3(start, v.at(-1))); return cp;
}
const pipe = (pts, R, r, m, segs = 120, radial = 20) => mesh(new THREE.TubeGeometry(bent(pts, R), segs, r, radial, false), m);
// a turned band with rings of small grooves (knurl / thread look)
function knurl(r, len, m, { n = 12, depth = 0.6, along = "x", flutes = 0 } = {}) {
  const prof = [[0.1, 0], [r - 0.6, 0], [r, 0.6]], step = (len - 1.2) / n;
  for (let i = 0; i < n; i++) { const y = 0.6 + i * step; prof.push([r, y + step * 0.18], [r - depth, y + step * 0.5], [r, y + step * 0.82]); }
  prof.push([r, len - 0.6], [r - 0.6, len], [0.1, len]);
  return turned(prof, m, { along, segs: 40, flutes, flute: flutes ? 0.03 : 0 });
}
// dipped plier handle along a world-space path: coloured grip, black end cap
function grip(pts, r, m = mat.red, endM = mat.black, endFrac = 0.22) {
  const c = new THREE.CatmullRomCurve3(pts.map(V3)), all = c.getPoints(60), cut = Math.round(60 * (1 - endFrac));
  const g = group(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(all.slice(0, cut + 2)), 40, r, 20, false), m),
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(all.slice(cut)), 16, r + 0.5, 20, false), endM));
  const s = all[0], e = all.at(-1); g.add(at(sphere(r, m), s.x, s.y, s.z), at(sphere(r + 0.5, endM), e.x, e.y, e.z));
  return g;
}
const rivet = (x, z, h, r = 3.4, m = mat.chrome) => group(at(cyl(r, h, m), x, 0, z), at(sphere(r * 0.9, m), x, h / 2 - r * 0.45, z));
const zig = (x0, x1, y, tooth, depth, dir = 1) => { const out = []; const n = Math.max(2, Math.round(Math.abs(x1 - x0) / tooth)); for (let i = 0; i <= n; i++) out.push([x0 + ((x1 - x0) * i) / n, y + (i % 2 ? depth * dir : 0)]); return out; };
const rot2 = (pts, a, cx = 0, cy = 0) => pts.map(([x, y]) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)]);
const hexBolt = (x, y, z, r = 4, h = 3) => group(at(cyl(r, h, mat.chrome, { segs: 6 }), x, y + h / 2, z), at(cyl(r * 0.8, 0.6, mat.satin), x, y + h + 0.3, z));

// a twisted fluted part standing along +y (drill bits, screw extractors)
function twisted(r, len, m, { lobes = 2, pitch = 26, tip = 1.2, taper = 0, depth = 0.45 } = {}) {
  const s = new THREE.Shape(), N = 64;
  for (let i = 0; i <= N; i++) { const a = (i / N) * PI * 2, k = 1 - depth * Math.pow(Math.abs(Math.sin((a * lobes) / 2)), 3); i ? s.lineTo(Math.cos(a) * r * k, Math.sin(a) * r * k) : s.moveTo(Math.cos(a) * r * k, Math.sin(a) * r * k); }
  let g = new THREE.ExtrudeGeometry(s, { depth: len, steps: 60, bevelEnabled: false, curveSegments: 1 });
  const p = g.attributes.position, tl = r * tip;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i), a = (z / pitch) * PI * 2; let x = p.getX(i), y = p.getY(i);
    let k = 1 - taper * (z / len); if (z > len - tl) k *= Math.max(0.03, (len - z) / tl);
    x *= k; y *= k; p.setXYZ(i, x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z);
  }
  g.deleteAttribute("uv"); g.deleteAttribute("normal"); g = mergeVertices(g, 1e-3); g.computeVertexNormals(); g.rotateX(-PI / 2);
  return mesh(g, m);
}

/* ---------- adjustable wrench ---------- */
function adjustable({ gap = 18 } = {}) {
  const T = 9, a = 0.26, P = 22; // head turned 15° about x = P
  const top = smooth2([[-48, 10], [-51, 17], [-45, 27], [-27, 33], [-6, 32], [10, 26], [22, 18]], 22);
  const bot = smooth2([[22, -17], [12, -26], [2, -35], [-8, -38], [-15, -36], [-17, -30]], 16);
  const handleTop = smooth2([[44, 12], [80, 10.5], [160, 11.5], [214, 12.5], [228, 9.5], [233, 0]], 24);
  const handleBot = handleTop.slice(0, -1).reverse().map(([x, y]) => [x, -y]);
  const frame = poly([...rot2(top, a, P), ...handleTop, ...handleBot, ...rot2(bot, a, P), ...rot2([[-17, 10]], a, P)]);
  const win = new THREE.Path(); rot2([[-14, -12], [-14, -31], [-1, -31], [-1, -12]], a, P).forEach(([x, y], i) => (i ? win.lineTo(x, y) : win.moveTo(x, y))); win.closePath(); frame.holes.push(win);
  frame.holes.push(new THREE.Path().absarc(221, 0, 5.5, 0, PI * 2, true));
  const y0 = 10 - gap;
  const jaw = poly(smooth2([[-50, y0], [-34, y0], [-17.5, y0], [-17.5, -20], [-17.5, -33], [-26, -36], [-39, -31], [-48, -21], [-51.5, y0 - 4], [-50, y0]], 30));
  const inner = group(
    at(slab(jaw, T - 1.2, 1.2, mat.chrome), 0, -0.3, 0),
    at(knurl(6, 18, mat.satin, { n: 8, depth: 1.3 }), -7.5, 0, 12.5),
    at(cyl(1.6, 23, mat.chrome, { along: "z" }), -7.5, 0, 21.5),
    decal("10  20  30", 22, 3.6, -34, T / 2 + 0.9, -y0 + 4, { color: "#1b2026" }),
  );
  inner.children[1].rotation.y = -PI / 2;
  inner.position.x = -P; const head = group(inner); head.position.x = P; head.rotation.y = a;
  const gw = (x) => 2 * (11 + (x - 110) * 0.012) + 2.4;
  const gripG = slab(strip([[112, 0], [150, 0], [192, 0]], [gw(112), gw(150), gw(192)]), T + 1.2, 3.2, mat.red);
  const endG = slab(strip([[192, 0], [207, 0]], [gw(193) + 0.6, gw(205)]), T + 1.8, 3.4, mat.black);
  const neckG = slab(strip([[106, 0], [114, 0]], [gw(106) + 0.4, gw(114) + 0.4]), T + 1.8, 3.4, mat.black);
  return group(slab(frame, T, 1.4, mat.satin), head, gripG, endG, neckG, decal('10"', 12, 6, 70, T / 2 + 1.5, 0, { color: "#1b2026" }));
}

/* ---------- locking pliers ---------- */
function lockingPliers() {
  const teethU = zig(-50, -6, 1.2, 3, -1.4), teethL = zig(-50, -6, -1.2, 3, 1.4);
  const upper = poly([[-53, 4], ...teethU, [-4, 1.2], [8, 5], [30, 9], [48, 11], [48, 25], [30, 25], [10, 23], [-10, 20], [-30, 16], [-46, 10]]);
  const lower = poly([[-53, -4], ...teethL, [-4, -1.2], [6, -3], [18, -7], [26, -13], [20, -20], [4, -17], [-12, -16], [-30, -14], [-46, -9]]);
  const lowPath = [[20, 0, 15], [60, 0, 23], [110, 0, 33], [168, 0, 45]];
  const g = group(
    slab(upper, 10, 1.4), at(slab(lower, 9, 1.2), 0, -0.3, 0),
    tube([[40, 0, -18], [100, 0, -19], [178, 0, -20]], 7, mat.satin, 20),
    grip([[64, 0, -18.3], [120, 0, -19.3], [172, 0, -20]], 8.6, mat.red, mat.red, 0.01),
    tube(lowPath, 6.6, mat.satin, 20),
    grip([[64, 0, 23.8], [110, 0, 33], [164, 0, 44.2]], 8.2, mat.red, mat.black, 0.2),
    at(slab(strip([[34, -18], [150, 18]], 8), 5, 0.8, mat.oxide), 0, -0.5, 0),
    at(slab(strip(smooth2([[106, -20], [138, -24.5], [168, -32]], 10), 6), 3.4, 1, mat.chrome), 0, 0, 0),
    at(knurl(4.4, 16, mat.satin, { n: 8, depth: 0.8 }), 180, 0, -20),
    at(knurl(9, 17, mat.chrome, { n: 8, depth: 1, flutes: 18 }), 195, 0, -20),
    at(cyl(3, 2, mat.satin, { along: "x" }), 212.5, 0, -20),
    rivet(2, -3, 12.6), rivet(20, 14, 11.6), rivet(36, 18, 10.6, 3), rivet(110, -20, 15, 2.4),
  );
  return g;
}

/* ---------- snap-ring pliers ---------- */
function snapRingPliers() {
  const half = (s) => {
    const arm = slab(strip(smooth2([[10, 1.2], [-10, 2.2], [-34, 3.4], [-60, 4.6]], 16), [11, 10, 9, 8, 7, 6.4, 5.8, 5.2, 4.8, 4.4, 4.1, 3.8, 3.6, 3.4, 3.3, 3.2, 3.1]), 4.6, 0.8);
    if (s < 0) arm.scale.z = -1;
    const pin = at(cyl(1.3, 9, mat.satin, { along: "x" }), -64, 0, -4.7 * s);
    const pinEnd = at(cyl(0.9, 1.4, mat.satin, { along: "x", r2: 1.3 }), -69, 0, -4.7 * s);
    const h = grip([[9, 0, -4 * s], [40, 0, -9 * s], [90, 0, -16 * s], [128, 0, -20 * s]], 5.8);
    const g = group(arm, pin, pinEnd, h); g.position.y = s * 1.4; return g;
  };
  const coil = []; for (let i = 0; i <= 80; i++) { const t = i / 80, a = t * PI * 2 * 7; coil.push([30 + 2.6 * Math.cos(a), 2.6 * Math.sin(a), -9 + 18 * t]); }
  return group(half(1), half(-1), at(cyl(6.5, 8.4, mat.chrome), 0, 0, 0), at(cyl(2.6, 9.4, mat.satin), 0, 0, 0),
    tube(coil, 0.6, mat.steel, 8), decal("INT", 10, 3.4, 0, 5.2, 9, { color: "#20252c" }));
}

/* ---------- ratcheting screwdriver ---------- */
function ratchetDriver() {
  const hl = 112, r = 16.5;
  const g = group(handle(hl, r, mat.red, mat.black));
  g.add(at(turned([[r * 1.0 + 0.4, 34], [r * 1.02 + 0.6, 40], [r * 1.02 + 0.6, 62], [r * 0.97 + 0.4, 68]].map(([a, b]) => [a, b - 34]).concat([[0.1, 34]]).reverse().concat([[0.1, 0]]).reverse(), mat.black, { flutes: 3, flute: 0.07 }), 34, 0, 0));
  // ratchet collar with selector
  g.add(at(turned([[0.1, 0], [11.5, 0], [12.5, 1.5], [12.5, 13], [10.5, 16], [8, 18], [0.1, 18]], mat.chrome), hl - 2, 0, 0));
  g.add(at(knurl(12.8, 7, mat.satin, { n: 6, depth: 0.6, flutes: 24 }), hl, 0, 0));
  g.add(at(box(7, 5, 6, mat.black, 1.6), hl + 9, 13.2, 0));
  g.add(decal("F  ·  L  ·  R", 16, 3, hl + 10, 12.9, 6, { color: "#20252c" }, PI / 2));
  // hex shaft, bit holder, bit
  const sx = hl + 16;
  g.add(at(cyl(4.2, 70, mat.chrome, { along: "x" }), sx + 35, 0, 0));
  g.add(at(turned([[0.1, 0], [5.6, 0], [5.6, 14], [4.8, 15], [0.1, 15]], mat.chrome, { segs: 6 }), sx + 66, 0, 0));
  g.add(at(cyl(3.2, 12, mat.satin, { along: "x", segs: 6 }), sx + 86, 0, 0));
  g.add(at(cyl(2.4, 4, mat.satin, { along: "x" }), sx + 94, 0, 0));
  g.add(at(cyl(2.4, 7, mat.satin, { along: "x", segs: 4, r2: 0.4 }), sx + 99.5, 0, 0));
  return g;
}

/* ---------- universal joint ---------- */
function ujoint(drive = "3/8") {
  const a = group(
    turned([[0.1, 0], [10.5, 0], [11.5, 1], [11.5, 17], [10.5, 19], [8, 21], [0.1, 21]], mat.chrome),
    at(box(0.6, 9.8, 9.8, mat.hole), 0.2, 0, 0),
    decal(drive, 9, 3.4, 9, 11.6, 0, {}, -PI / 2),
  );
  for (const s of [1, -1]) a.add(at(box(17, 13, 3.6, mat.satin, 1.2), 26, 0, 9.6 * s), at(cyl(6.5, 3.6, mat.satin, { along: "z" }), 34, 0, 9.6 * s), at(cyl(3.8, 1.2, mat.chrome, { along: "z" }), 34, 0, 11.9 * s));
  const cross = group(at(box(7, 7, 7, mat.oxide, 1.2), 0, 0, 0), cyl(2.8, 16, mat.oxide, { along: "z" }), cyl(2.8, 16, mat.oxide));
  a.add(at(cross, 34, 0, 0));
  const b = group(
    at(turned([[0.1, 0], [7, 0], [9.5, 3], [9.5, 15], [7, 18], [6, 19], [0.1, 19]], mat.chrome), 11, 0, 0),
    at(box(9.5, 9.5, 9.5, mat.chrome, 1), 34.5, 0, 0), at(sphere(1.4, mat.chrome), 35, 0, 4.9),
  );
  for (const s of [1, -1]) b.add(at(box(14, 3.6, 13, mat.satin, 1.2), 7, 9.6 * s, 0), at(cyl(6.5, 3.6, mat.satin), 0, 9.6 * s, 0), at(cyl(3.8, 1.2, mat.chrome), 0, 11.9 * s, 0));
  b.position.x = 34; b.rotation.y = 0.5;
  const g = group(a, b); g.userData.yaw = 0.35; return g;
}

/* ---------- speed handle ---------- */
function speeder() {
  const g = group(
    pipe([[0, 0, 0], [110, 0, 0], [132, 0, -58], [222, 0, -58], [244, 0, 0], [420, 0, 0]], 18, 5.2, mat.chrome),
    at(turned([[0.1, -36], [9, -36], [13, -31], [14.5, -22], [12, -10], [8, -4], [6.5, 0], [0.1, 0]].map(([r, y]) => [r, y + 36]), mat.red), -36, 0, 0),
    at(knurl(14.2, 8, mat.black, { n: 4, flutes: 16, depth: 0.5 }), -30, 0, 0),
    at(cyl(6.8, 6, mat.chrome, { along: "x" }), 2, 0, 0),
    at(capsule(10.5, 62, mat.red), 177, 0, -58), at(capsule(11, 4, mat.black), 144, 0, -58), at(capsule(11, 4, mat.black), 210, 0, -58),
    at(turned([[0.1, 0], [6, 0], [8.5, 4], [8.5, 18], [7.8, 20], [0.1, 20]], mat.chrome), 416, 0, 0),
    at(box(9.5, 9.5, 9.5, mat.chrome, 1), 440.5, 0, 0), at(sphere(1.4, mat.chrome), 441, 4.9, 0),
  );
  return g;
}

/* ---------- crowfoot ---------- */
function crowfoot({ gap = 13, size = "", drive = "3/8" } = {}) {
  const R = gap * 0.62 + 10, w = gap / 2, tip = Math.asin(Math.min(0.95, (w + 2.4) / R)), tw = 10.5, L = R + 14, a1 = Math.asin(tw / R);
  const s = new THREE.Shape();
  s.moveTo(-R * Math.cos(tip) + 0.8, w); s.lineTo(1.5, w); s.lineTo(1.5, -w); s.lineTo(-R * Math.cos(tip) + 0.8, -w);
  s.absarc(0, 0, R, -PI + tip, -a1, false); s.lineTo(L, -tw); s.absarc(L, 0, tw, -PI / 2, PI / 2, false); s.lineTo(R * Math.cos(a1), tw); s.absarc(0, 0, R, a1, PI - tip, false); s.closePath();
  const sq = new THREE.Path(); [[-4.8, -4.8], [4.8, -4.8], [4.8, 4.8], [-4.8, 4.8]].forEach(([x, y], i) => (i ? sq.lineTo(L + x, y) : sq.moveTo(L + x, y))); sq.closePath(); s.holes.push(sq);
  const T = 8;
  const g = group(slab(s, T, 1.3, mat.satin),
    at(turned([[6.8, 0], [8.4, 0], [8.4, 0.7], [6.8, 0.9]], mat.satin, { along: "y", segs: 48 }), L, T / 2 + 1.25, 0),
    at(box(9.4, 5, 9.4, mat.hole, 0.2), L, 0, 0),
    decal(size ? size.replace(/mm$/, "") : String(gap), 11, 5, R * 0.36, T / 2 + 1.35, R * 0.66, {}, 0),
    decal(`${drive} DR`, 14, 3.4, L - 16, T / 2 + 1.35, 0, {}, PI / 2));
  g.userData.yaw = -0.5; return g;
}

/* ---------- oil filter wrench (band type) ---------- */
function filterWrench() {
  const R = 46, H = 16;
  const ring = turned([[R - 1.1, 0], [R + 0.9, 0], [R + 0.9, H], [R - 1.1, H]], mat.oxide, { along: "y", segs: 96 });
  const lip = (s) => { const b = box(22, H, 2, mat.oxide, 0.6); b.position.set(R + 6, H / 2, 6.5 * s); b.rotation.y = -0.42 * s; return b; };
  const g = group(ring, at(turned([[R - 1.4, 0], [R - 1.1, 0], [R - 1.1, H], [R - 1.4, H]], mat.rubber, { along: "y", segs: 96 }), 0, 0, 0), lip(1), lip(-1),
    at(box(16, H + 4, 16, mat.chrome, 2.5), R + 18, H / 2, 0), at(cyl(3.2, H + 6.5, mat.satin), R + 16, H / 2, 0), at(sphere(3.2, mat.satin), R + 16, H + 3, 0),
    at(cyl(6.2, 60, mat.chrome, { along: "x" }), R + 54, H / 2, 0),
  );
  const gr = at(capsule(11, 104, mat.red), R + 140, H / 2, 0); gr.scale.set(1, 0.85, 1);
  const end = at(capsule(11.6, 18, mat.black), R + 192, H / 2, 0); end.scale.set(1, 0.88, 1);
  g.add(gr, end);
  g.userData.yaw = -0.5; return g;
}

/* ---------- torque angle gauge ---------- */
function angleGauge() {
  const dial = paint(512, 512, (x, w) => {
    x.fillStyle = "#f2f4f6"; x.beginPath(); x.arc(256, 256, 256, 0, PI * 2); x.fill();
    x.translate(256, 256); x.strokeStyle = "#15191e"; x.fillStyle = "#15191e";
    for (let d = 0; d < 360; d += 2) { const long = d % 10 === 0; x.lineWidth = long ? 4 : 2; const a = (d * PI) / 180; x.beginPath(); x.moveTo(Math.cos(a) * 244, Math.sin(a) * 244); x.lineTo(Math.cos(a) * (long ? 206 : 224), Math.sin(a) * (long ? 206 : 224)); x.stroke(); }
    x.font = "700 30px ui-monospace, Menlo, monospace"; x.textAlign = "center"; x.textBaseline = "middle";
    for (let d = 0; d < 360; d += 30) { const a = (d * PI) / 180 - PI / 2; x.save(); x.translate(Math.cos(a) * 176, Math.sin(a) * 176); x.rotate(a + PI / 2); x.fillStyle = d === 0 ? "#b0000d" : "#15191e"; x.fillText(String(d), 0, 0); x.restore(); }
    x.fillStyle = "#b0000d"; x.font = "700 22px ui-monospace, Menlo, monospace"; x.fillText("DEGREES", 0, 70);
  }, { roughness: 0.25, clearcoat: 1 });
  const face = mesh(new THREE.CircleGeometry(24, 64), dial, false); face.rotation.x = -PI / 2; face.position.y = 22.6;
  const needle = box(1.6, 0.8, 19, mat.red, 0.3); needle.position.set(0, 23.6, -9); needle.rotation.y = -0.5;
  const ng = group(needle); // pivot at centre
  const g = group(
    turned([[0.1, 0], [25, 0], [27, 1.5], [27, 20], [25.5, 22], [0.1, 22]], mat.black, { along: "y", segs: 64 }),
    at(knurl(28.2, 9, mat.rubber, { n: 3, depth: 0.4, along: "y", flutes: 40 }), 0, 6, 0),
    at(turned([[23.6, 0], [26.5, 0], [27.2, 1.4], [26.4, 3.2], [23.6, 3.4]], mat.chrome, { along: "y", segs: 64, flutes: 60, flute: 0.006 }), 0, 21.6, 0),
    face, ng,
    at(turned([[0.1, 0], [9.5, 0], [9.5, 3.2], [8.6, 4], [0.1, 4]], mat.chrome, { along: "y" }), 0, 21.8, 0),
    at(box(12.7, 1, 12.7, mat.hole, 0.2), 0, 25.4, 0),
    at(box(98, 2.2, 11, mat.oxide, 0.6), 74, 8, 0), at(box(16, 9, 14, mat.red, 3), 120, 8, 0), at(box(3, 12, 14.4, mat.black, 0.8), 126.5, 8, 0),
    at(box(10, 7, 16, mat.chrome, 2), 28, 8, 0),
  );
  g.userData.yaw = -0.5; return g;
}

/* ---------- crimpers ---------- */
function crimpers() {
  const nests = [[-48, 2.6, "#c8171f"], [-34, 3.2, "#1f5fbf"], [-19, 4, "#f2b705"]];
  const jaw = (s) => {
    const sh = new THREE.Shape(); sh.moveTo(-62, 0.4);
    for (const [c, r] of nests) { sh.lineTo(c - r, 0.4); sh.absarc(c, 0.4, r, PI, 0, true); }
    sh.lineTo(-3, 0.4); sh.lineTo(9, 5); sh.lineTo(10, 15); sh.lineTo(-18, 17); sh.lineTo(-48, 15); sh.lineTo(-60, 10); sh.lineTo(-64, 4); sh.closePath();
    const j = slab(sh, 6, 1); if (s < 0) j.scale.z = -1;
    const parts = [j, grip([[8, 0, -8 * s], [60, 0, -15 * s], [120, 0, -21 * s], [176, 0, -25 * s]], 6.8)];
    nests.forEach(([c, r, col]) => parts.push(at(cyl(2.1, 0.8, new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.35, clearcoat: 1 })), c, 4.2, (r + 5.5) * s)));
    const g = group(parts); g.position.y = s * 1.7; return g;
  };
  const g = group(jaw(1), jaw(-1), at(cyl(7, 11, mat.chrome), 1, 0, 0), at(cyl(4.6, 12.4, mat.satin, { segs: 6 }), 1, 0, 0),
    decal("22-18   16-14   12-10", 48, 3.4, -33, 5.25, -15.5));
  return g;
}

/* ---------- hose clamp pliers ---------- */
function hoseClampPliers() {
  const half = (s) => {
    const jawPts = smooth2([[10, 0], [-14, 3], [-36, 7], [-50, 10]], 12);
    const j = slab(strip(jawPts, [16, 15, 14, 13.5, 13, 12.5, 12, 11.5, 11, 10.5, 10, 10, 10]), 6, 1.2); if (s < 0) j.scale.z = -1;
    const cap = group(cyl(7, 13, mat.chrome), at(box(14.4, 1.4, 2.4, mat.hole, 0.2), 0, 6.3, 0)); cap.position.set(-52, 0, -10 * s);
    const h = grip([[9, 0, -6 * s], [50, 0, -14 * s], [110, 0, -22 * s], [168, 0, -27 * s]], 7);
    const g = group(j, cap, h); g.position.y = s * 1.8; return g;
  };
  const rack = poly([[0, -2.5], ...zig(4, 46, 2.5, 3, 2.2), [48, 2.5], [48, -2.5]]);
  const bar = slab(rack, 2.4, 0.4, mat.satin); bar.rotation.y = -PI / 2 + 0.06; bar.position.set(124, 7.4, -24);
  const g = group(half(1), half(-1), at(cyl(7.5, 11.5, mat.chrome), 0, 0, 0), at(cyl(3, 12.5, mat.satin), 0, 0, 0), bar, rivet(124, -24, 18, 2.4),
    at(box(7, 7, 8, mat.satin, 1.4), 128, 5, 24));
  return g;
}

/* ---------- tap & die ---------- */
function tapDie() {
  const base = at(box(270, 8, 160, mat.black, 3), 0, 4, 0), y = 8;
  const dieShape = circle(19.5); dieShape.holes.push(new THREE.Path().absarc(0, 0, 5, 0, PI * 2, true));
  for (let i = 0; i < 4; i++) { const a = (i * PI) / 2 + PI / 4; dieShape.holes.push(new THREE.Path().absarc(Math.cos(a) * 10, Math.sin(a) * 10, 3.6, 0, PI * 2, true)); }
  const stock = group(
    turned([[19.6, 0], [27, 0], [28, 1.2], [28, 11], [27, 12.2], [19.6, 12.2]], mat.chrome, { along: "y", segs: 64 }),
    at(slab(dieShape, 8, 0.8, mat.oxide), 0, 6, 0), decal("M10×1.5", 13, 3.4, 0, 10.9, 14.5),
    at(cyl(6.4, 50, mat.chrome, { along: "x" }), 52, 6, 0), at(cyl(6.4, 50, mat.chrome, { along: "x" }), -52, 6, 0),
    at(capsule(8, 50, mat.red), 98, 6, 0), at(capsule(8, 50, mat.red), -98, 6, 0),
    at(capsule(8.4, 8, mat.black), 124, 6, 0), at(capsule(8.4, 8, mat.black), -124, 6, 0),
    at(cyl(3, 12, mat.chrome, { along: "z" }), 0, 6, 32), at(knurl(5, 6, mat.chrome, { n: 3, along: "y", flutes: 12 }), 0, 3, 38),
  );
  stock.children.at(-1).rotation.x = PI / 2; stock.children.at(-1).position.set(0, 6, 36);
  stock.position.set(0, y, -42);
  const tap = (len, r, z) => {
    const t = group(at(box(10, r * 1.5, r * 1.5, mat.steel, 0.6), -len - 5, 0, 0), at(cyl(r * 0.85, len * 0.5, mat.steel, { along: "x" }), -len * 0.75, 0, 0),
      at(knurl(r, len * 0.5, mat.steel, { n: Math.round(len / 3.2), depth: 0.9 }), -len * 0.5, 0, 0), at(cyl(r * 0.6, 4, mat.steel, { along: "x", r2: r }), 2, 0, 0));
    for (let i = 0; i < 3; i++) { const a = (i * 2 * PI) / 3 + 0.5, f = box(len * 0.5, 1.6, 2.2, mat.hole, 0.3); f.position.set(-len * 0.25, Math.sin(a) * (r - 0.4), Math.cos(a) * (r - 0.4)); f.rotation.x = -a; t.add(f); }
    t.position.set(-8, y + r * 1.0, z); return t;
  };
  const tw = group(
    at(knurl(7.5, 58, mat.chrome, { n: 14, depth: 0.7 }), 0, 0, 0),
    at(turned([[0.1, 0], [6, 0], [7, 2], [7, 12], [5, 14], [0.1, 14]], mat.chrome, { flutes: 4, flute: 0.08 }), -14, 0, 0),
    at(cyl(4.2, 76, mat.chrome, { along: "z" }), 64, 0, 0), at(sphere(5.5, mat.chrome), 64, 0, 38), at(sphere(5.5, mat.chrome), 64, 0, -38),
    at(cyl(8, 10, mat.chrome, { along: "x" }), 64, 0, 0),
  );
  tw.position.set(30, y + 8, 30);
  return group(base, stock, tap(92, 6, 22), tap(80, 4.5, 50), tw, decal("TAP & DIE  ·  METRIC", 60, 6, 70, 8.3, 72, { color: "#e3e7ec" }));
}

/* ---------- file ---------- */
function file() {
  const teeth = paint(128, 128, (x, w, h) => {
    x.fillStyle = "#b4bac1"; x.fillRect(0, 0, w, h);
    x.lineWidth = 12; x.strokeStyle = "#3a3f45";
    for (let i = -2; i < 4; i++) { x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64 + 128, h); x.stroke(); }
    x.lineWidth = 6; x.strokeStyle = "#4a5057";
    for (let i = -2; i < 6; i++) { x.beginPath(); x.moveTo(i * 32, h); x.lineTo(i * 32 + 70, 0); x.stroke(); }
    x.lineWidth = 3; x.strokeStyle = "#eef1f4";
    for (let i = -2; i < 4; i++) { x.beginPath(); x.moveTo(i * 64 + 6, 0); x.lineTo(i * 64 + 134, h); x.stroke(); }
  }, { metalness: 0.85, roughness: 0.42 }, [1 / 6, 1 / 6]);
  teeth.bumpMap = teeth.map; teeth.bumpScale = 1.4;
  const blade = slab(poly([[0, -12], [150, -12], [196, -8], [206, -5], [208, 0], [206, 5], [196, 8], [150, 12], [0, 12]]), 5, 0.4, teeth);
  const tang = slab(poly([[-34, -2.6], [-6, -5], [2, -10], [2, 10], [-6, 5], [-34, 2.6]]), 3.4, 0.6, mat.oxide);
  const h = handle(112, 15, mat.red, mat.black); h.position.x = -158;
  return group(blade, tang, h, at(turned([[0.1, 0], [8.4, 0], [9.4, 1], [9.4, 9], [8.4, 10], [0.1, 10]], mat.chrome), -48, 0, 0),
    decal('10"  BASTARD', 34, 5, 24, 3.05, 0, { color: "#1b2026" }));
}

/* ---------- gasket scraper ---------- */
function scraper() {
  const blade = slab(poly([[0, -5], [22, -9], [40, -15.5], [62, -16], [64, -15], [64, 15], [62, 16], [40, 15.5], [22, 9], [0, 5]]), 1.6, 0.4, mat.satin);
  const edge = slab(poly([[56, -15.8], [64.4, -15.2], [64.4, 15.2], [56, 15.8]]), 1.2, 0.3, mat.chrome);
  const h = handle(108, 13.5, mat.red, mat.black); h.position.x = -180;
  return group(blade, at(edge, 0, -0.1, 0), at(box(14, 4, 9, mat.satin, 1.6), 0, 0, 0),
    at(cyl(4, 60, mat.chrome, { along: "x" }), -32, 0, 0),
    at(turned([[0.1, 0], [7.8, 0], [8.6, 1], [8.6, 9], [6, 12], [4.4, 14], [0.1, 14]], mat.chrome), -73, 0, 0), h,
    decal("1-1/4", 12, 3.4, 38, 1.75, 0));
}

/* ---------- tape measure ---------- */
function tape() {
  const ticks = paint(1024, 192, (x, w, h) => {
    x.fillStyle = "#f2c200"; x.fillRect(0, 0, w, h); x.fillStyle = "#14171b";
    const pmm = w / 136; x.font = "700 46px ui-monospace, Menlo, monospace"; x.textAlign = "center";
    for (let m = 0; m <= 136; m++) { const px = w - m * pmm, L = m % 10 === 0 ? 70 : m % 5 === 0 ? 48 : 28; x.fillRect(px - 1.5, 0, 3, L); x.fillRect(px - 1.5, h - L, 3, L); if (m % 10 === 0 && m) x.fillText(String(m / 10 + 20), px - 22, h / 2 + 16); }
    x.fillStyle = "#c8171f"; x.fillText("", 0, 0);
  }, { roughness: 0.3, clearcoat: 0.8 });
  const blade = mesh(new THREE.PlaneGeometry(136, 25), ticks, false); blade.rotation.x = -PI / 2; blade.position.set(102, 3.2, 0);
  const H = 70, W = 72, D = 40;
  const g = group(
    at(box(W, H, D, mat.redp, 12), 0, H / 2 + 1, 0),
    at(box(W + 2.4, H + 2.4, D - 14, mat.rubber, 13), 0, H / 2 + 1, 0),
    at(cyl(23, 1.4, mat.satin, { along: "z", segs: 48 }), -2, H / 2 + 1, D / 2 + 0.2),
    at(cyl(25, 0.9, mat.black, { along: "z", segs: 48 }), -2, H / 2 + 1, D / 2 - 0.1),
    at(cyl(2.4, 1, mat.chrome, { along: "z", segs: 6 }), -2, H / 2 + 1, D / 2 + 1.1),
    at(box(18, 7, 12, mat.black, 2.4), 18, H + 2.6, 0), at(box(4, 2, 12.4, mat.chrome, 0.5), 20, H + 6, 0),
    at(box(16, 50, 3, mat.satin, 1.2), -10, H / 2 + 6, -D / 2 - 1.6), at(box(16, 4, 7, mat.satin, 1.2), -10, H + 1.5, -D / 2 - 0.6),
    at(box(10, 7, 30, mat.black, 2), W / 2 + 3, 5, 0),
    at(box(136, 1.4, 25, mat.yellow, 0.3), 102, 2.4, 0), blade,
    at(box(9, 1.2, 27, mat.chrome, 0.4), 166, 3.8, 0), at(box(1.4, 8, 27, mat.chrome, 0.5), 170.4, 2.6, 0),
    at(cyl(0.9, 0.6, mat.satin), 163, 4.5, -6), at(cyl(0.9, 0.6, mat.satin), 163, 4.5, 6),
  );
  const lab = mesh(new THREE.PlaneGeometry(30, 9), label("8m · 26ft", 30, 9, { color: "#20252c" }), false); lab.position.set(-2, H / 2 + 1, D / 2 + 1.0); g.add(lab);
  g.userData.yaw = -0.6; return g;
}

/* ---------- utility knife ---------- */
function knife() {
  const outline = [[0, -11], [8, -14], [100, -14], [126, -12], [146, -7], [152, -2], [150, 6], [128, 12], [60, 15], [12, 14], [0, 9]];
  const body = poly(outline);
  const rubber = poly([[8, -10], [16, -11.6], [90, -11.6], [96, -6], [96, 7], [60, 10.4], [16, 10.4], [7, 6]]);
  const blade = poly([[132, -8.6], [178, -8.6], [160, 7], [132, 7]]);
  const g = group(
    at(slab(body, 7, 1, mat.redp), 0, -4.85, 0), at(slab(body, 7, 1, mat.redp), 0, 4.85, 0),
    at(slab(rubber, 1, 0.6, mat.rubber), 0, 9.3, 0),
    at(slab(blade, 0.6, 0.15, mat.satin), 0, 0, 0), at(slab(poly([[140, -8.8], [178.4, -8.8], [175, -5.6], [140, -5.6]]), 0.9, 0.1, mat.chrome), 0, 0, 0),
    at(cyl(3.6, 1.6, mat.chrome, { segs: 6 }), 110, 9.6, 1), at(cyl(1.4, 0.4, mat.hole), 110, 10.5, 1),
    at(box(22, 13, 6, mat.black, 2), 104, 0, -16),
  );
  for (let i = 0; i < 4; i++) g.add(at(box(1.4, 13.6, 2, mat.rubber, 0.4), 96 + i * 5, 0, -18.6));
  g.userData.yaw = -0.25; return g;
}

/* ---------- trim tools ---------- */
function trimTools() {
  const tool = (end, m) => {
    let pts;
    if (end === "fork") pts = [[0, -10], [96, -10], [150, -8], [186, -9], [190, -9], [178, 0], [190, 9], [186, 9], [150, 8], [96, 10], [0, 10]];
    else if (end === "wedge") pts = [[0, -10], [96, -10], [160, -9], [186, -7], [188, 7], [160, 9], [96, 10], [0, 10]];
    else if (end === "narrow") pts = [[0, -10], [96, -10], [130, -5], [182, -4], [184, 0], [182, 4], [130, 5], [96, 10], [0, 10]];
    else if (end === "hook") pts = [[0, -10], [96, -10], [150, -6], [176, -6], [182, -12], [188, -12], [186, 6], [150, 6], [96, 10], [0, 10]];
    else pts = [[0, -10], [96, -10], [140, -9], [170, 2], [176, 16], [168, 20], [150, 12], [130, 9], [96, 10], [0, 10]];
    const s = poly(pts); s.holes.push(new THREE.Path().absarc(14, 0, 4, 0, PI * 2, true));
    const t = slab(s, 6, 1.5, m);
    const p = t.geometry.attributes.position; // thin the blade toward its tip
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); if (x > 100) p.setY(i, p.getY(i) * Math.max(0.22, 1 - (x - 100) / 110)); }
    t.geometry.computeVertexNormals();
    const g = group(t); for (let i = 0; i < 5; i++) g.add(at(box(2, 1, 14, m === mat.black ? mat.grey : mat.black, 0.4), 34 + i * 9, 4.3, 0));
    return g;
  };
  const kinds = ["fork", "wedge", "hook", "narrow", "angle"], ms = [mat.redp, mat.black, mat.redp, mat.black, mat.redp];
  const g = group(kinds.map((k, i) => { const t = tool(k, ms[i]); t.position.set(i * 9, 0, -60 + i * 30); t.rotation.y = 0.03 * (i - 2); return t; }));
  return g;
}

/* ---------- bolt extractors ---------- */
function extractors() {
  const rail = group(at(box(210, 6, 24, mat.red, 2), 0, 3, 0), at(box(214, 4, 26, mat.black, 1.5), 0, -1, 0));
  const sizes = ["10", "12", "13", "14", "17"];
  sizes.forEach((sz, i) => {
    const r = 8 + i * 1.3, h = 30 + i * 1.6, rIn = r * 0.7, x = -84 + i * 42;
    const s = group(
      turned([[0.1, 0], [r - 1.6, 0], [r - 0.8, 0.8], [r - 0.8, 9], [r, 11], [r, h - 1.2], [r - 0.9, h], [rIn + 1, h], [rIn, h - 1]], mat.oxide, { along: "y", segs: 64 }),
      at(cyl(rIn, 12, mat.hole, { segs: 32 }), 0, h - 6, 0),
    );
    for (let k = 0; k < 4; k++) { const pts = []; for (let j = 0; j <= 16; j++) { const t = j / 16, a = (k * PI) / 2 - t * 1.7; pts.push([Math.cos(a) * (rIn - 0.6), h - 0.8 - t * 10, Math.sin(a) * (rIn - 0.6)]); } s.add(tube(pts, 1.1, mat.satin, 6)); }
    for (let k = 0; k < 6; k++) { const pts = []; for (let j = 0; j <= 16; j++) { const t = j / 16, a = (k * PI) / 3 + t * 1.1; pts.push([Math.cos(a) * (r + 0.05), 12 + t * (h - 15), Math.sin(a) * (r + 0.05)]); } s.add(tube(pts, 0.55, mat.satin, 5)); }
    const band = mesh(new THREE.CylinderGeometry(r + 0.4, r + 0.4, 6, 48, 1, true, -0.7, 1.4), label(sz, 30, 12, { color: "#e9edf1" }), false); band.position.y = 6.4; s.add(band);
    s.position.set(x, 6, 0); rail.add(s);
  });
  for (let i = 0; i < 2; i++) {
    const e = group(twisted(3.4 + i * 1.2, 34, mat.oxide, { lobes: 4, pitch: -24, taper: 0.6, tip: 0.5, depth: 0.3 }), at(box(5 + i * 1.6, 16, 5 + i * 1.6, mat.oxide, 0.6), 0, -8, 0));
    e.rotation.z = -PI / 2; e.position.set(-60 + i * 70, 4 + i, 36); rail.add(e);
  }
  return rail;
}

/* ---------- hand impact driver ---------- */
function handImpact() {
  const g = group(
    turned([[0.1, 0], [16, 0], [19, 2.5], [19.5, 18], [18, 22], [0.1, 22]], mat.chrome),
    at(knurl(17.6, 72, mat.rubber, { n: 7, depth: 0.8, flutes: 14 }), 20, 0, 0),
    at(turned([[0.1, 0], [17.8, 0], [18.2, 1], [18.2, 16], [15, 22], [11, 28], [9, 31], [0.1, 31]], mat.chrome), 91, 0, 0),
    at(knurl(18.6, 9, mat.satin, { n: 6, depth: 0.5, flutes: 30 }), 93, 0, 0),
    at(box(12.7, 12.7, 12.7, mat.chrome, 1), 128, 0, 0),
    at(turned([[0.1, 0], [8.5, 0], [10, 2], [10, 24], [8.6, 26], [0.1, 26]], mat.chrome), 126, 0, 0),
    at(cyl(4, 14, mat.satin, { along: "x", segs: 6 }), 157, 0, 0), at(cyl(4, 9, mat.satin, { along: "x", segs: 4, r2: 0.5 }), 168, 0, 0),
    decal("◄ L     R ►", 30, 4.5, 56, 0, 0),
  );
  const lab = g.children.at(-1); lab.position.set(101, 18.9, 0); lab.rotation.set(-PI / 2, 0, 0); lab.scale.set(0.5, 1, 1);
  const bit = (x, z, tip) => group(at(cyl(4, 30, mat.oxide, { along: "x", segs: 6 }), x, -15.4, z), tip === "flat" ? at(box(10, 2, 8, mat.oxide, 0.4), x + 19, -15.4, z) : at(cyl(4, 8, mat.oxide, { along: "x", segs: 4, r2: 0.5 }), x + 19, -15.4, z));
  g.add(bit(30, 36, "flat"), bit(80, 36, "ph"));
  g.userData.yaw = -0.4; return g;
}

/* ---------- hacksaw ---------- */
function hacksaw() {
  const TL = 300, toothY = zig(TL, 0, 0, 1.6, -1.6);
  const teeth = poly([[0, 3], [TL, 3], ...toothY]);
  const bladeBody = poly([[0, 2.5], [TL, 2.5], [TL, 12.5], [0, 12.5]]);
  const frame = [[-6, -4, 0], [-8, 0, -88], [24, 0, -98], [296, 0, -98], [316, 0, -86], [318, 0, -40]].map(([x, , z]) => [x, 0, z]);
  const hShape = poly([[306, -6], [322, -10], [372, -32], [386, -12], [380, 40], [344, 96], [314, 96], [304, 40]]);
  hShape.holes.push((() => { const h = new THREE.Path(); [[326, 8], [358, -12], [368, -2], [362, 30], [340, 70], [330, 64]].forEach(([x, y], i) => (i ? h.lineTo(x, y) : h.moveTo(x, y))); h.closePath(); return h; })());
  const g = group(
    slab(bladeBody, 0.65, 0.1, mat.blue), slab(teeth, 0.9, 0.1, mat.steel),
    pipe(frame, 16, 6, mat.red),
    at(slab(hShape, 20, 3, mat.redp), 0, 0, 0),
    at(slab(strip(smooth2([[372, -26], [384, -8], [378, 40], [344, 92]], 16), 13), 23, 3.4, mat.rubber), 0, 0, 0),
    at(cyl(2, 6, mat.chrome), 3, 0, -7.5), at(cyl(2, 6, mat.chrome), TL - 3, 0, -7.5),
    at(box(18, 6, 10, mat.satin, 1.5), -4, 0, -7.5), at(box(14, 6, 10, mat.satin, 1.5), 306, 0, -7.5),
    at(cyl(2.4, 20, mat.chrome, { along: "x" }), -20, 0, -7.5), at(cyl(5, 8, mat.chrome, { along: "x" }), -32, 0, -7.5),
    at(box(4, 14, 26, mat.chrome, 1.6), -32, 0, -7.5),
    rivet(338, -2, 24, 2.6), rivet(356, -40, 24, 2.6),
    decal("24 TPI  BI-METAL", 60, 6, 150, 0.6, -7.5, { color: "#f2f4f6" }),
  );
  g.userData.yaw = -0.28; return g;
}

/* ---------- aviation snips ---------- */
function snip(m) {
  const T = 6;
  const bladeU = poly([[-44, 0.6], [-30, 1.2], [-6, 2.2], [4, 6], [6, 12], [-6, 14], [-26, 9], [-40, 4]]);
  const bladeL = poly([[-44, -0.6], [-30, -1.2], [-6, -2.2], [4, -6], [6, -12], [-6, -14], [-26, -9], [-40, -4]]);
  const g = group(
    at(slab(bladeU, T, 0.9, mat.oxide), 0, 1.6, 0), at(slab(bladeL, T, 0.9, mat.oxide), 0, -1.6, 0),
    at(slab(poly([[-42, 0.5], [-6, 1.8], [-6, 3.4], [-42, 2.2]]), T, 0.5, mat.chrome), 0, 1.7, 0),
    at(slab(strip([[2, 8], [26, 13]], 9), 3, 0.8, mat.oxide), 0, 6.2, 0), at(slab(strip([[2, -8], [26, -13]], 9), 3, 0.8, mat.oxide), 0, 6.2, 0),
    at(slab(strip([[8, 0], [26, 13]], 8), 4, 0.8, mat.satin), 0, -5, 0),
    rivet(0, 0, 13, 4.2), rivet(4, -8, 12, 2.6), rivet(4, 8, 12, 2.6), rivet(26, -13, 12, 2.6), rivet(26, 13, 12, 2.6),
    grip([[26, 0, -13], [60, 0, -20], [120, 0, -26], [172, 0, -28]], 7.2, m), grip([[26, 0, 13], [60, 0, 20], [120, 0, 26], [172, 0, 28]], 7.2, m),
  );
  const coil = []; for (let i = 0; i <= 60; i++) { const t = i / 60, a = t * PI * 2 * 6; coil.push([40 + 2.4 * Math.cos(a), 2.4 * Math.sin(a), -12 + 24 * t]); }
  g.add(tube(coil, 0.6, mat.steel, 8));
  return g;
}
function snips() {
  const g = group();
  [[dipYellow(), 0], [mat.red, 1], [green(), 2]].forEach(([m, i]) => { const s = snip(m); s.position.set(i * 12, i * 0.01, -78 + i * 78); g.add(s); });
  return g;
}

/* ---------- bolt cutters ---------- */
function boltCutter() {
  const bladeU = poly([[-74, 0.6], [-60, 1.4], [-22, 3], [0, 7], [4, 24], [-24, 26], [-56, 16], [-70, 7]]);
  const bladeL = poly([[-74, -0.6], [-60, -1.4], [-22, -3], [0, -7], [4, -24], [-24, -26], [-56, -16], [-70, -7]]);
  const plate = poly([[-14, -26], [16, -30], [48, -24], [52, 0], [48, 24], [16, 30], [-14, 26], [-20, 0]]);
  const g = group(
    slab(bladeU, 11, 1.4, mat.oxide), slab(bladeL, 11, 1.4, mat.oxide),
    slab(poly([[-74, 0.7], [-24, 3.2], [-24, 6.2], [-70, 3.4]]), 11.6, 0.6, mat.steel), slab(poly([[-74, -0.7], [-24, -3.2], [-24, -6.2], [-70, -3.4]]), 11.6, 0.6, mat.steel),
    at(slab(plate, 3, 1, mat.oxide), 0, 8.4, 0), at(slab(plate, 3, 1, mat.oxide), 0, -8.4, 0),
    hexBolt(-6, 10.4, -16, 5), hexBolt(-6, 10.4, 16, 5), hexBolt(36, 10.4, -18, 5), hexBolt(36, 10.4, 18, 5),
    at(cyl(5, 6, mat.chrome, { segs: 6 }), -2, 10, 0), at(box(10, 6, 6, mat.satin, 1), 54, 0, 0),
    grip([[46, 0, -16], [140, 0, -26], [300, 0, -38], [450, 0, -46]], 10, mat.red, mat.rubber, 0.34),
    grip([[46, 0, 16], [140, 0, 26], [300, 0, 38], [450, 0, 46]], 10, mat.red, mat.rubber, 0.34),
    decal('18"', 12, 6, 20, 11.2, 0, { color: "#e9edf1" }),
  );
  return g;
}

/* ---------- wire brush ---------- */
function wireBrush() {
  const block = vslab((() => { const s = new THREE.Shape(); s.moveTo(4, 0); s.lineTo(136, 0); s.quadraticCurveTo(142, 0, 142, 8); s.lineTo(142, 20); s.lineTo(0, 20); s.lineTo(0, 6); s.quadraticCurveTo(0, 0, 4, 0); return s; })(), 26, 2.5, mat.redp);
  const hs = poly(smooth2([[138, 4], [200, 3], [260, 2.6], [292, 3], [300, 9], [292, 15], [260, 15.4], [200, 16], [138, 17]], 30));
  hs.holes.push(new THREE.Path().absarc(282, 9, 4, 0, PI * 2, true));
  const handleM = vslab(hs, 15, 2.5, mat.redp);
  const n = 4 * 24 * 14, geo = new THREE.CylinderGeometry(0.36, 0.42, 24, 5), wires = new THREE.InstancedMesh(geo, mat.steel, n);
  wires.castShadow = true; wires.receiveShadow = true;
  const o = new THREE.Object3D(); let k = 0, seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < 4; row++) for (let c = 0; c < 24; c++) for (let w = 0; w < 14; w++) {
    const cx = 7 + c * 5.5, cz = -9.6 + row * 6.4, a = rnd() * PI * 2, rr = rnd() * 2.2;
    o.position.set(cx + Math.cos(a) * rr, 22 + 12, cz + Math.sin(a) * rr); o.rotation.set((rnd() - 0.5) * 0.16, 0, (rnd() - 0.5) * 0.16); o.updateMatrix(); wires.setMatrixAt(k++, o.matrix);
  }
  const ferrules = []; for (let row = 0; row < 4; row++) ferrules.push(at(box(134, 1, 2.6, mat.hole, 0.3), 72, 22.6, -9.6 + row * 6.4));
  const sc = vslab(poly([[-14, 2], [0, 1], [0, 19], [-14, 15]]), 1.2, 0.4, mat.satin);
  return group(block, handleM, wires, ferrules, sc, at(cyl(1.6, 8, mat.chrome, { along: "z" }), 6, 10, 9));
}

/* ---------- drill bit set in an index ---------- */
function drillBits() {
  const W = 220, D = 62, Hb = 18;
  const g = group(
    at(box(W, Hb, D, mat.redp, 4), 0, Hb / 2, 0),
    at(box(W - 10, 3, D - 12, mat.black, 1), 0, Hb + 1, 0),
    at(box(W - 8, 2.4, 10, mat.satin, 0.8), 0, Hb - 4, D / 2 + 0.6),
  );
  const lid = group(at(box(W, 6, D, mat.redp, 3), 0, -3, -D / 2), at(box(W - 16, 0.6, D - 16, mat.grey, 0.2), 0, 0.2, -D / 2));
  lid.position.set(0, Hb - 1, -D / 2 + 3); lid.rotation.x = PI / 2 - 0.22; g.add(lid);
  const lab = mesh(new THREE.PlaneGeometry(90, 9), label("HSS  1/16 – 1/4", 90, 9, { color: "#e9edf1" }), false);
  lab.position.set(0, Hb + 2 + Math.sin(0.25) * 0.4, -D / 2 - 30); lid.add(lab); lab.position.set(0, 0.7, -D / 2 - 12); lab.rotation.x = -PI / 2;
  const sizes = ["1/16", "5/64", "3/32", "7/64", "1/8", "9/64", "5/32", "11/64", "3/16", "13/64", "7/32", "15/64", "1/4"];
  sizes.forEach((sz, i) => {
    const d = 1.6 + i * 0.4, L = 52 + i * 5.5, x = -96 + i * 16, fl = L * 0.62;
    const bit = group(at(cyl(d / 2, L - fl + 2, mat.oxide, { segs: 20 }), 0, (L - fl + 2) / 2 - 8, 0), at(twisted(d / 2, fl, mat.brass, { pitch: 7 + d * 3, tip: 0.9 }), 0, L - fl - 8, 0));
    bit.position.set(x, Hb + 2.5, -4); bit.rotation.z = -(i - 6) * 0.045; bit.rotation.x = -0.12; g.add(bit);
    g.add(at(cyl(d / 2 + 0.9, 0.4, mat.hole, { segs: 20 }), x, Hb + 2.6, -4));
    const t = mesh(new THREE.PlaneGeometry(14, 4.4), label(sz, 14, 4.4), false); t.position.set(x, Hb - 4, D / 2 + 1.85); g.add(t);
  });
  g.userData.yaw = -0.2; return g;
}

/* ---------- body hammer & dolly ---------- */
function bodyHammer() {
  const head = group(
    cyl(14, 50, mat.chrome, { along: "z" }), at(box(20, 20, 30, mat.satin, 4), 0, 0, -2),
    at(cyl(21, 14, mat.chrome, { along: "z", r2: 14 }), 0, 0, 31), at(cyl(21.5, 5, mat.chrome, { along: "z" }), 0, 0, 40.5),
    at(cyl(20.6, 1.2, mat.satin, { along: "z" }), 0, 0, 43.4),
    at(cyl(14, 62, mat.chrome, { along: "z", r2: 2.4 }), 0, 0, -56), at(sphere(2.4, mat.chrome), 0, 0, -87),
  );
  const handleG = group(at(capsule(7.5, 290, mat.red), 160, 0, 0), at(capsule(9, 100, mat.black), 255, 0, 0), at(cyl(9.5, 6, mat.chrome, { along: "x" }), 12, 0, 0));
  handleG.children[0].scale.set(1, 0.85, 1.2); handleG.children[1].scale.set(1, 0.9, 1.15);
  const ds = new THREE.Shape(); ds.moveTo(0, 0); ds.lineTo(80, 0); ds.quadraticCurveTo(96, 0, 94, 16); ds.quadraticCurveTo(88, 40, 50, 42); ds.quadraticCurveTo(12, 44, 0, 22); ds.closePath();
  const dolly = vslab(ds, 44, 6, mat.satin); dolly.position.set(140, 0, -86); dolly.rotation.y = 0.35;
  const g = group(head, handleG, dolly); g.userData.yaw = -0.4; return g;
}

/* ---------- 4-way lug wrench ---------- */
function lugWrench() {
  const arm = (ang, sz, drive = false) => {
    const L = 168, a = group(at(cyl(8.5, L - 10, mat.chrome, { along: "x" }), (L - 10) / 2, 0, 0));
    if (drive) a.add(at(turned([[0.1, 0], [8.5, 0], [10, 3], [10, 14], [7, 18], [0.1, 18]], mat.chrome), L - 14, 0, 0), at(box(12.7, 12.7, 12.7, mat.chrome, 1), L + 10, 0, 0), at(sphere(1.6, mat.chrome), L + 11, 6.5, 0));
    else {
      const R = +sz * 0.62 + 6, rIn = (+sz / 2) * 1.12;
      a.add(at(turned([[0.1, 0], [8.5, 0], [R, 8], [R, 34], [R - 1, 35], [rIn + 1, 35], [rIn, 34]], mat.chrome), L - 16, 0, 0), at(cyl(rIn, 12, mat.hole, { segs: 6, along: "x" }), L + 12.5, 0, 0));
      a.add(decal(sz, 12, 6, L + 2, R + 0.3, 0, {}, 0));
    }
    a.rotation.y = ang; return a;
  };
  const g = group(arm(0, "17"), arm(PI / 2, "19"), arm(PI, "21"), arm(-PI / 2, "", true), at(sphere(16, mat.chrome), 0, 0, 0), at(cyl(16, 10, mat.chrome), 0, 0, 0));
  g.children[4].scale.set(1, 0.7, 1);
  g.userData.yaw = 0.42; return g;
}

/* ---------- strap wrench ---------- */
function strapWrench() {
  const loop = new THREE.Shape(); loop.absellipse(0, 0, 66, 50, 0, PI * 2, false);
  loop.holes.push(new THREE.Path().absellipse(0, 0, 63, 47, 0, PI * 2, true));
  const band = slab(loop, 26, 0.6, mat.rubber); band.position.set(-66, 0, 0);
  const g = group(band,
    at(box(42, 34, 30, mat.satin, 4), 4, 0, 0), at(box(36, 1.2, 24, mat.hole, 0.3), 4, 17.2, 0),
    rivet(-8, 9, 36, 2.6), rivet(-8, -9, 36, 2.6), rivet(16, 0, 36, 2.6),
    at(cyl(7, 40, mat.chrome, { along: "x" }), 40, 0, 0));
  const gr = at(capsule(11, 120, mat.red), 130, 0, 0); gr.scale.set(1, 0.85, 1);
  const end = at(capsule(11.8, 18, mat.black), 192, 0, 0); end.scale.set(1, 0.88, 1);
  const tail = slab(strip(smooth2([[24, -16], [44, -24], [80, -30], [120, -28]], 12), 25), 2.4, 0.5, mat.rubber); tail.position.y = -11.5;
  g.add(gr, end, tail, decal("150 mm", 24, 5, 130, 9.7, 0, {}));
  g.userData.yaw = -0.4; return g;
}

/* ---------- pipe wrench ---------- */
function pipeWrench() {
  const handleS = poly([[56, -13], [246, -11], [268, -10], [276, 0], [268, 10], [246, 11], [56, 13]]);
  handleS.holes.push(new THREE.Path().absarc(261, 0, 5.5, 0, PI * 2, true));
  const housing = poly([[-30, -22], [8, -22], [40, -17], [76, -14], [76, 14], [40, 17], [8, 21], [-30, 19]]);
  housing.holes.push((() => { const h = new THREE.Path(); h.moveTo(-3, -16); h.lineTo(-3, 16); h.lineTo(31, 16); h.lineTo(31, -16); h.closePath(); return h; })());
  const heel = poly([[-33, -18], [-12, -18], [-10, -34], [-16, -56], ...Array.from({ length: 13 }, (_, i) => [i % 2 ? -31 : -34, -56 + i * 3])]);
  const hookT = Array.from({ length: 13 }, (_, i) => [i % 2 ? -53.5 : -50.5, -14 - i * 3]);
  const hook = poly([[-74, 9], [52, 9], [52, -9], [-50.5, -9], ...hookT, [-54, -54], [-60, -60], [-70, -58], [-78, -46], [-80, -20], [-79, 2]]);
  const g = group(
    slab(handleS, 10, 1.4, mat.red),
    at(slab(strip([[60, 10.4], [246, 8.9]], 4), 15, 1, mat.red), 0, 0, 0), at(slab(strip([[60, -10.4], [246, -8.9]], 4), 15, 1, mat.red), 0, 0, 0),
    slab(housing, 26, 2, mat.red),
    slab(heel, 22, 1.2, mat.satin),
    slab(hook, 21, 1.6, mat.satin),
    at(knurl(17, 32, mat.steel, { n: 10, depth: 1.6, flutes: 22 }), -2, 0, 0),
    at(slab(poly([[42, -10], [68, -9], [68, 9], [42, 10]]), 1, 0.6, mat.oxide), 0, 15.2, 0),
    rivet(48, 0, 33, 2.6), rivet(62, 0, 33, 2.6),
    decal('14"', 16, 6, 140, 6.6, 0, { color: "#f2f4f6" }),
  );
  g.userData.yaw = -0.45; return g;
}

/* ---------- terminal tool kit ---------- */
function terminalKit() {
  const W = 250, D = 130, Hb = 16;
  const g = group(at(box(W, Hb, D, mat.black, 4), 0, Hb / 2, 0), at(box(W - 14, 2, D - 14, mat.rubber, 0.8), 0, Hb + 0.2, 0));
  const lid = group(at(box(W, 8, D, mat.black, 4), 0, -4, -D / 2), at(box(W - 14, 1, D - 14, mat.rubber, 0.4), 0, 0.2, -D / 2));
  lid.position.set(0, Hb - 2, -D / 2 + 4); lid.rotation.x = PI / 2 - 0.3; g.add(lid);
  const lab = mesh(new THREE.PlaneGeometry(110, 11), label("TERMINAL TOOLS", 110, 11, { color: "#e9edf1" }), false); lab.position.set(0, 0.9, -D / 2 - 20); lab.rotation.x = -PI / 2; lid.add(lab);
  const tips = ["flat", "pin", "fork", "tube", "hook", "flat", "pin", "fork", "tube", "hook"];
  const bands = [0xc8171f, 0x1f5fbf, 0xf2b705, 0x168a3c, 0xeef0f2];
  tips.forEach((tp, i) => {
    const t = group(
      turned([[0.1, 0], [4.6, 0], [5.6, 2], [5.8, 30], [5.2, 44], [3, 50], [0.1, 50]], i % 2 ? mat.black : mat.red, { flutes: 6, flute: 0.05 }),
      at(cyl(5.9, 4, new THREE.MeshPhysicalMaterial({ color: bands[i % 5], roughness: 0.35, clearcoat: 1 }), { along: "x" }), 8, 0, 0),
      at(cyl(1.6, 4, mat.chrome, { along: "x" }), 51, 0, 0), at(cyl(0.8, 38, mat.chrome, { along: "x" }), 71, 0, 0),
    );
    const tx = 90;
    if (tp === "flat") t.add(at(box(6, 0.5, 2, mat.chrome, 0.1), tx + 2, 0, 0));
    else if (tp === "pin") t.add(at(cyl(0.5, 7, mat.chrome, { along: "x" }), tx + 3, 0, 0));
    else if (tp === "fork") t.add(at(box(6, 0.5, 0.6, mat.chrome, 0.1), tx + 2, 0, 0.8), at(box(6, 0.5, 0.6, mat.chrome, 0.1), tx + 2, 0, -0.8));
    else if (tp === "tube") t.add(at(cyl(1.2, 7, mat.chrome, { along: "x" }), tx + 3, 0, 0));
    else t.add(tube([[tx - 1, 0, 0], [tx + 4, 0, 0], [tx + 6, 0, 1.6]], 0.5, mat.chrome, 6));
    t.rotation.y = -PI / 2; t.position.set(-W / 2 + 22 + i * 22.5, Hb + 6.6, -D / 2 + 16); g.add(t);
  });
  g.userData.yaw = -0.25; return g;
}

export const MODELS = {
  "wrench-adjust": (o = {}) => adjustable({ gap: o.gap ? Math.min(28, Math.max(12, o.gap)) : 18 }),
  "pliers-locking": () => lockingPliers(),
  "pliers-snap": () => snapRingPliers(),
  "screwdriver-ratchet": () => ratchetDriver(),
  ujoint: (o = {}) => ujoint(o.drive || "3/8"),
  speeder: () => speeder(),
  crowfoot: (o = {}) => crowfoot({ gap: o.gap || 13, size: o.size || "", drive: o.drive || "3/8" }),
  "filter-wrench": () => filterWrench(),
  "torque-angle": () => angleGauge(),
  "pliers-crimp": () => crimpers(),
  "pliers-hose": () => hoseClampPliers(),
  tapdie: () => tapDie(),
  file: () => file(),
  scraper: () => scraper(),
  tape: () => tape(),
  knife: () => knife(),
  "trim-tool": () => trimTools(),
  extractor: () => extractors(),
  "hand-impact": () => handImpact(),
  hacksaw: () => hacksaw(),
  snips: () => snips(),
  "bolt-cutter": () => boltCutter(),
  "wire-brush": () => wireBrush(),
  "drill-bits": () => drillBits(),
  "hammer-body": () => bodyHammer(),
  "lug-wrench": () => lugWrench(),
  "strap-wrench": () => strapWrench(),
  "pipe-wrench": () => pipeWrench(),
  "terminal-tool": () => terminalKit(),
};
