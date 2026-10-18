// BoxTally 3D: power tools. Cordless tools (a generic line, a slim 14.4V line and a chunky 18V line), air tools and
// shop electrics. Pistol-grip tools stand on their battery (or hose fitting) with the nose pointing +x; inline tools
// (ratchets, die grinder, cut-off) lie on the bench with the head at the left.
import { THREE, mat, PI, DRIVES, mesh, slab, circle, poly, starPath, turned, cyl, box, tube, sphere, capsule, at, group, label } from "./kit3d.js";

/* ---------- local materials ---------- */
const M = {
  ledG: new THREE.MeshStandardMaterial({ color: 0x3be07a, emissive: 0x22cc55, emissiveIntensity: 1.3, roughness: 0.3 }),
  ledR: new THREE.MeshStandardMaterial({ color: 0xff4a3a, emissive: 0xee2211, emissiveIntensity: 1.2, roughness: 0.3 }),
  ledOff: new THREE.MeshStandardMaterial({ color: 0x27302b, roughness: 0.35 }),
  ledW: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3dc, emissiveIntensity: 1.5, roughness: 0.2 }),
  foam: new THREE.MeshPhysicalMaterial({ color: 0xe0600f, roughness: 0.95 }),
  disc: new THREE.MeshPhysicalMaterial({ color: 0x4a4740, roughness: 0.9 }),
  sponge: new THREE.MeshPhysicalMaterial({ color: 0xd2ad48, roughness: 1 }),
  comp: new THREE.MeshPhysicalMaterial({ color: 0x25282d, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.25 }), // air tool composite
  guard: new THREE.MeshPhysicalMaterial({ color: 0xc9ced4, metalness: 1, roughness: 0.38, side: THREE.DoubleSide }),
  heat: new THREE.MeshPhysicalMaterial({ color: 0x8d8478, metalness: 1, roughness: 0.4 }), // heat-tinted steel
};
const WHITE = { color: "#f3f5f7" };

/* ---------- small helpers ---------- */
// a side profile (x along the tool, y up) given thickness along z, with rounded edges; the outline stays where drawn
function ext(shape, t, b, m, curve = 20) {
  b = Math.min(b, t / 2 - 0.05);
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.1, t - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 4, curveSegments: curve });
  g.translate(0, 0, -(t - 2 * b) / 2); return mesh(g, m);
}
// polygon with rounded corners (r per corner or one for all)
function rp(pts, r = 4) {
  const s = new THREE.Shape(), n = pts.length, P = (i) => pts[(i + n) % n];
  for (let i = 0; i < n; i++) {
    const [x, y] = P(i), [px, py] = P(i - 1), [nx, ny] = P(i + 1), rr = Array.isArray(r) ? r[i] : r;
    const d1 = Math.hypot(px - x, py - y), d2 = Math.hypot(nx - x, ny - y), k1 = Math.min(rr, d1 / 2) / d1, k2 = Math.min(rr, d2 / 2) / d2;
    const ax = x + (px - x) * k1, ay = y + (py - y) * k1;
    i ? s.lineTo(ax, ay) : s.moveTo(ax, ay); s.quadraticCurveTo(x, y, x + (nx - x) * k2, y + (ny - y) * k2);
  }
  s.closePath(); return s;
}
// a block, rounded in side view and bevelled across: w along x, h along y, d along z
const rbox = (w, h, d, m, r = 4, b = 2) => ext(rp([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], r), d, b, m, 8);
const xturn = (prof, m, o = {}) => turned(prof, m, { along: "x", ...o });
const yturn = (prof, m, o = {}) => turned(prof, m, { along: "y", ...o });
const zturn = (prof, m, o = {}) => { const t = turned(prof, m, { along: "y", ...o }); t.geometry.rotateX(PI / 2); return t; }; // runs toward +z
const band = (r, a, b, m = mat.hole) => xturn([[r, a], [r, b]], m, { segs: 40 }); // open ring along x
// a curved slot strip on a body along x (side +1 = facing +z, -1 = -z, 0 = top)
function slit(r, w, a, side, x, m = mat.hole) {
  const c = side > 0 ? 0 : side < 0 ? PI : -PI / 2, g = new THREE.CylinderGeometry(r, r, w, 10, 1, true, c - a / 2, a); g.rotateZ(-PI / 2);
  return at(mesh(g, m, false), x, 0, 0);
}
const plane = (w, h, text, o) => mesh(new THREE.PlaneGeometry(w, h), label(text, w, h, o), false);
const print = (text, w, h, x, y, z, o = WHITE, face = "z") => { const p = at(plane(w, h, text, o), x, y, z); if (face === "-z") p.rotation.y = PI; if (face === "x") p.rotation.y = PI / 2; if (face === "y") p.rotation.x = -PI / 2; return p; };
// a slotted screw head set into a side face (s = +1 faces +z)
const screw = (x, y, z, s = 1) => group(at(cyl(3.2, 1.2, mat.hole, { along: "z" }), x, y, z), at(cyl(2.2, 1.4, mat.satin, { along: "z", segs: 16 }), x, y, z + 0.4 * s), at(box(3.4, 0.6, 0.5, mat.hole, 0.1), x, y, z + 1.1 * s));
// LED row: n lamps, first `lit` on, along z, facing +x
const gauge = (n, lit, x, y, step = 6, r = 1.5, face = "x") => group([...Array(n)].map((_, i) => { const l = cyl(r, 1.2, i < lit ? M.ledG : M.ledOff, { along: face, segs: 14 }); return face === "x" ? at(l, x, y, (i - (n - 1) / 2) * step) : at(l, (i - (n - 1) / 2) * step + x, y, 0); }));
// a quick-connect air plug pointing down from the origin (about 38 mm long)
function airPlug(m = mat.satin) {
  return group(at(cyl(9, 9, m, { segs: 6 }), 0, -4.5, 0), at(cyl(6.5, 6, mat.steel), 0, -12, 0), at(cyl(6.5, 2, mat.brass, { segs: 6 }), 0, -16, 0),
    at(cyl(4.6, 14, mat.chrome), 0, -24, 0), at(cyl(5.6, 3, mat.chrome), 0, -27, 0), at(cyl(3.6, 4, mat.chrome, { r2: 4.6 }), 0, -36, 0), at(cyl(5, 4, mat.chrome, { r2: 3.6 }), 0, -32, 0));
}
// tip a model so two of its points (x, y) both touch the bench
function rest(model, [x1, y1], [x2, y2]) { const w = group(model); model.rotation.z = Math.atan((y2 - y1) / (x1 - x2)); return w; }
// helix of tube (springs, coil holders): along +x from the origin
function helix(r, len, turns, wire, m) { const pts = []; for (let i = 0; i <= turns * 16; i++) { const a = (i / 16) * PI * 2; pts.push([(i / (turns * 16)) * len, Math.sin(a) * r, Math.cos(a) * r]); } return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), turns * 24, wire, 8, false), m); }

// Molded grip texture: a field of small raised diamonds, as a bump map on the rubber overmold. Extruded
// side faces get UVs in millimetres, so one repeat of the canvas covers about 6 mm.
const gripCache = new Map();
function gripRubber(m = mat.rubber) {
  if (gripCache.has(m)) return gripCache.get(m);
  const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d");
  x.fillStyle = "#000"; x.fillRect(0, 0, 64, 64); x.fillStyle = "#fff";
  for (const [cx, cy] of [[0, 0], [64, 0], [0, 64], [64, 64], [32, 32]]) { x.beginPath(); x.moveTo(cx, cy - 13); x.lineTo(cx + 13, cy); x.lineTo(cx, cy + 13); x.lineTo(cx - 13, cy); x.closePath(); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 6, 1 / 6); t.anisotropy = 4;
  const r = m.clone(); r.bumpMap = t; r.bumpScale = 1.2; r.roughness = 0.9;
  gripCache.set(m, r); return r;
}
// twist drill bit along +x from the origin: two spiral flutes up a ground shank, with a pointed tip
function drillBit(len = 40, r = 3) {
  const fl = len * 0.72, geo = new THREE.CylinderGeometry(r, r, fl, 24, 48); geo.rotateZ(-PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, y) + (x / fl) * PI * 5, rr = Math.hypot(y, z);
    const k = rr < 0.01 ? 0 : 1 - 0.38 * Math.max(0, Math.cos(2 * (Math.atan2(z, y) - (x / fl) * PI * 5))) ** 3; // two flutes
    const tip = x > fl / 2 - r * 1.1 ? Math.max(0.08, (fl / 2 - x) / (r * 1.1)) : 1; // conical point
    p.setY(i, Math.cos(a) * rr * k * tip); p.setZ(i, Math.sin(a) * rr * k * tip);
  }
  geo.computeVertexNormals();
  return group(at(cyl(r, len - fl, mat.steel, { along: "x", segs: 20 }), (len - fl) / 2, 0, 0), at(mesh(geo, mat.oxide), len - fl + fl / 2, 0, 0));
}

/* ---------- battery packs ---------- */
const PACKS = {
  "18": { L: 120, W: 80, H: 62, v: "18V", lo: mat.redp, hi: mat.black, btn: mat.black, panel: true, leds: 4 },
  gen: { L: 108, W: 74, H: 52, v: "18V", lo: mat.black, hi: mat.grey, btn: mat.redp, panel: true, leds: 4 },
  "14": { L: 96, W: 64, H: 42, v: "14.4V", lo: mat.black, hi: mat.black, btn: mat.redp, panel: false, leds: 3 },
};
// slide-on pack, standing on the bench, slides on toward -x; release button and fuel gauge on the front (+x)
function battery(kind = "18", { top = false } = {}) {
  const p = PACKS[kind], { L, W, H } = p, yl = H * 0.58, hh = H - yl + 2, g = group();
  g.add(at(rbox(L, yl, W, p.lo, 8, 5), 0, yl / 2, 0));
  g.add(at(rbox(L - 6, hh, W - 6, p.hi, 6, 4), -1, yl - 2 + hh / 2, 0));
  g.add(at(rbox(L - 3, 1.6, W - 3, mat.hole, 1, 0.6), 0, yl - 0.6, 0)); // shell seam
  g.add(at(rbox(L - 10, 3, W - 10, mat.rubber, 1.5, 1), 0, 1.2, 0)); // rubber skid
  if (p.panel) for (const s of [1, -1]) { // rubber side panels with grip ribs
    g.add(at(rbox(L * 0.56, yl * 0.62, 2.6, mat.rubber, 4, 0.9), -L * 0.12, yl * 0.47, s * (W / 2 + 0.3)));
    for (let i = 0; i < 3; i++) g.add(at(rbox(2, yl * 0.5, 1.6, mat.rubber, 0.8, 0.5), -L * 0.36 + i * 5 + 4, yl * 0.47, s * (W / 2 + 1.6)));
  }
  if (p.lo === p.hi) g.add(at(rbox(L - 4, 3, W - 4, mat.redp, 1.5, 1), 0, yl + 3, 0)); // 14.4V: red stripe
  const lz = W / 2 + (p.panel ? 1.9 : 0.5), lx = p.panel ? -L * 0.1 : L * 0.1;
  g.add(print(p.v, 40, 15, lx + 4, yl * 0.52, lz), print(p.v, 40, 15, lx + 4, yl * 0.52, -lz, WHITE, "-z"));
  g.add(print(kind === "14" ? "Li-ion · 2.5 Ah" : "Li-ion · 5.0 Ah", 30, 5, lx + 4, yl * 0.52 - 10, lz, { color: "#9aa3ad" }));
  for (const s of [1, -1]) { // cooling slots along both sides of the top shell, and rubber bumpers on the corners
    for (let i = 0; i < 5; i++) g.add(at(box(2, hh * 0.38, 1.2, mat.hole, 0.3), -L * 0.3 + i * 5.5, yl - 2 + hh * 0.5, s * ((W - 6) / 2 + 0.1)));
    for (const e of [1, -1]) g.add(at(rbox(7, yl * 0.8, 7, mat.rubber, 3, 1.4), e * (L / 2 - 2.6), yl * 0.44, s * (W / 2 - 2.6)));
  }
  g.add(at(box(14, 0.4, 2, mat.hole, 0.1), L / 2 - 14, yl - 0.2, W / 2 - 0.4)); // latch slot
  // front: release button on the upper shell, fuel gauge window on the lower one
  const fx = L / 2;
  g.add(at(rbox(6, hh * 0.6, W * 0.44, p.btn, 2, 1.4), fx - 3.2, yl + hh * 0.45, 0));
  for (const z of [-6, 0, 6]) g.add(at(box(1.2, hh * 0.42, 1.2, mat.hole, 0.2), fx + 0.2, yl + hh * 0.45, z));
  g.add(at(rbox(1.4, 7, p.leds * 6 + 4, mat.screen, 2, 0.5), fx - 0.1, yl * 0.58, -4));
  g.add(gauge(p.leds, p.leds - 1, fx + 0.6, yl * 0.58).translateZ(-4));
  g.add(at(cyl(2.8, 1.6, mat.grey, { along: "x", segs: 16 }), fx + 0.2, yl * 0.58, p.leds * 3 + 6));
  if (top) { // rail tower, contacts and latch (hidden inside the tool's foot otherwise)
    const tw = W * 0.42, tl = L * 0.7, tx = -L * 0.1;
    g.add(at(rbox(tl, 10, tw, mat.black, 3, 1.5), tx, H + 4, 0));
    for (const s of [1, -1]) g.add(at(rbox(tl, 2.4, 7, mat.satin, 1, 0.6), tx, H + 8.2, s * (tw / 2 + 1.5)));
    for (let i = 0; i < 4; i++) { const z = (i - 1.5) * 6; g.add(at(box(14, 0.6, 2.4, mat.hole, 0.1), tx + tl / 2 - 9, H + 9.2, z), at(box(12, 0.8, 1, mat.brass, 0.1), tx + tl / 2 - 9, H + 9.1, z)); }
    g.add(at(rbox(12, 6, tw * 0.7, p.btn, 2, 1.2), tx + tl / 2 + 8, H + 1.5, 0));
    g.add(print(kind === "14" ? "14.4 V" : "18 V", 26, 6, tx - 8, H + 9.2, 0, WHITE, "y"));
  }
  return g;
}
function batteryModel(kind) { const g = battery(kind, { top: true }); g.userData.yaw = -0.55; return g; }

/* ---------- pistol-grip tools ---------- */
// body along x on top, grip down to a battery foot (cordless), a hose fitting (air) or a stand (heat gun)
function pistol(o = {}) {
  const { len = 150, R = 30, pk = "18", base = pk ? "pack" : "air", nose = "impact", drive = 12.7, body = mat.redp, trim = mat.rubber,
    gearM = mat.satin, gripH = 92, gripT = 34, gripW = 46, rake = 6, boot = false, ledRing = false, tag = "", tag2 = "", px = 8,
    rearCap = trim, sx = 1.05, sz = 0.9, mode = false, regulator = false, xr = -R * 1.55 } = o;
  const P = pk ? PACKS[pk] : null, g = group();
  let y0 = 0;
  if (base === "pack") { g.add(at(battery(pk), px, 0, 0)); y0 = P.H; }
  if (base === "air") y0 = 50;
  if (base === "stand") y0 = 0;
  const footH = base === "pack" ? 15 : base === "stand" ? 20 : 0;
  const gB = y0 + footH, yb = gB + gripH + R, xf = xr + len, hw = gripW / 2;
  const zAt = (dy) => R * sz * Math.sqrt(Math.max(0, 1 - (dy / (R * sx)) ** 2)); // half-width of the body at height dy
  // grip, with a rubber overmold on the back half
  const gT = yb - R * 0.35, gb = gB - 6, mid = (gb + gT) / 2;
  g.add(ext(rp([[-hw, gb], [hw, gb], [hw + 1 + rake * 0.5, mid], [hw + rake + 2, gT], [-hw + rake - 12, gT], [-hw - 3 + rake * 0.45, mid + 6]], 9), gripT, 9, body));
  g.add(ext(rp([[-hw - 1, gb + 9], [-1, gb + 9], [rake * 0.5, mid], [rake - 1, gT - 12], [-hw + rake - 13, gT - 12], [-hw - 4 + rake * 0.45, mid + 6]], 8), gripT + 1.8, 9.6, gripRubber(trim)));
  for (const s of [1, -1]) for (let i = 0; i < 4; i++) { const y = gb + 20 + i * ((gT - gb - 40) / 3); g.add(at(rbox(14, 2.2, 1.4, mat.black, 0.8, 0.5), -hw * 0.45 + rake * (y - gb) / (gT - gb) * 0.5, y, s * (gripT / 2 + 0.6))); }
  g.add(screw(hw - 6 + rake * 0.4, mid + 6, gripT / 2 - 0.3), screw(hw - 6 + rake * 0.4, mid + 6, -gripT / 2 + 0.3, -1));
  // foot over the battery
  if (base === "pack") {
    const fx0 = px - P.L / 2 + 3, fx1 = px + P.L / 2 - 3;
    g.add(ext(rp([[fx0, y0 - 1], [fx1, y0 - 1], [fx1 + 1, y0 + footH * 0.75], [fx1 - 12, y0 + footH], [hw + 10, gB + 3], [-hw - 6, gB + 3], [fx0 + 8, y0 + footH]], [3, 3, 5, 8, 10, 10, 8]), P.W - 8, 5, body));
    g.add(at(rbox(P.L - 8, 3, P.W - 9, trim, 1.4, 1), px, y0 + 1, 0)); // rubber skirt against the pack
    g.add(at(cyl(4.8, 2, mat.hole, { along: "x" }), fx1 + 0.6, y0 + footH * 0.42, 0), at(cyl(3.4, 2.4, M.ledW, { along: "x" }), fx1 + 0.9, y0 + footH * 0.42, 0)); // work light
    for (const s of [1, -1]) g.add(screw(fx1 - 14, y0 + 6, s * (P.W / 2 - 4.2), s), screw(fx0 + 12, y0 + 6, s * (P.W / 2 - 4.2), s));
    // spring-steel belt hook on the right of the foot, pivoting on a screw, its curled tip past the back
    const hz = (P.W - 8) / 2 + 1.6, hy = y0 + footH * 0.5;
    g.add(at(cyl(4.6, 2.6, mat.black, { along: "z" }), fx0 + 32, hy, hz - 0.6), at(cyl(2.2, 3.2, mat.satin, { along: "z", segs: 16 }), fx0 + 32, hy, hz + 0.4));
    g.add(at(ext(rp([[fx0 + 36, -3.6], [fx0 - 10, -3.6], [fx0 - 16, 0], [fx0 - 10, 3.6], [fx0 + 36, 3.6]], 2.4), 1.6, 0.5, mat.satin), 0, hy, hz + 1));
    g.add(at(mesh(new THREE.TorusGeometry(3.4, 0.8, 8, 16, PI), mat.satin), fx0 - 14.5, hy, hz - 2.4)); g.children.at(-1).rotation.set(PI / 2, 0, PI / 2);
    if (nose === "driver" || nose === "drill") { // magnetic bit holder on the left, with a spare bit
      const bz = -(P.W - 8) / 2 - 2.6;
      g.add(at(rbox(30, 9, 5, mat.black, 2.5, 1), fx0 + 26, hy, bz));
      g.add(at(cyl(2.2, 22, mat.chrome, { along: "x", segs: 6 }), fx0 + 26, hy, bz - 3.4), at(cyl(1.2, 3, mat.chrome, { along: "x", segs: 4, r2: 0.3 }), fx0 + 38.5, hy, bz - 3.4));
    }
    if (mode) { // mode button and three speed lamps on top of the foot
      const mx = fx1 - 20, my = y0 + footH + 0.4;
      g.add(at(rbox(30, 2, 20, mat.screen, 3, 0.8), mx - 4, my, 0), at(cyl(3.6, 2.4, mat.black), mx + 5, my + 1, 0));
      for (let i = 0; i < 3; i++) g.add(at(cyl(1.3, 1, i < 2 ? M.ledW : M.ledOff), mx - 14 + i * 5, my + 1, 0));
    }
  }
  if (base === "stand") { // wide stand foot for a tool that stands on its grip
    g.add(ext(rp([[-hw - 26, 0], [hw + 46, 0], [hw + 44, footH * 0.7], [hw + 12, footH + 4], [-hw - 8, footH + 4], [-hw - 24, footH * 0.7]], [4, 4, 6, 10, 10, 6]), 76, 6, body));
    g.add(at(rbox(gripW + 76, 4, 74, trim, 2, 1.4), 10, 1.6, 0));
    g.add(at(xturn([[7, 0], [6, -8], [4, -22]], trim, { segs: 20 }), -hw - 24, 10, 0));
    g.add(tube([[-hw - 44, 10, 0], [-hw - 70, 6, 0], [-hw - 96, 4, 26], [-hw - 80, 4, 64], [-hw - 30, 4, 74]], 3.6, trim, 10));
  }
  if (base === "air") { // rubber butt, exhaust and hose fitting
    g.add(at(rbox(gripW + 6, 16, gripT + 6, trim, 6, 4), 0, y0 + 2, 0));
    for (let i = 0; i < 4; i++) g.add(at(box(1.4, 8, 14, mat.hole, 0.3), -hw - 3.2, y0 + 3, -9 + i * 6));
    g.add(at(cyl(10, 4, mat.satin), 4, y0 - 7.5, 0), at(airPlug(), 4, y0 - 9.5, 0));
    if (regulator) { g.add(at(cyl(9.5, 7, mat.satin, { segs: 24 }), -hw + 2, y0 - 9, 0)); g.children.at(-1).rotation.z = 0.3; }
  }
  // the housing: motor body with a rubber rear cap, vents, seams, screws and print
  const bod = group(
    xturn([[0.1, xr + 6], [R * 0.72, xr + 6], [R * 0.93, xr + 12], [R * 0.99, xr + 22], [R, xr + len * 0.42], [R * 0.96, xf - 12], [R * 0.93, xf - 4], [R * 0.9, xf], [0.1, xf]], body, { segs: 48 }),
    xturn([[0.1, xr], [R * 0.6, xr], [R * 0.86, xr + 2.6], [R + 0.8, xr + 12], [R + 0.8, xr + 19], [R * 0.5, xr + 19]], rearCap, { segs: 48 }),
    band(R + 0.9, xr + 19, xr + 20.4),
  );
  for (let i = 0; i < 5; i++) for (const s of [1, -1]) bod.add(slit(R + 0.25, 2.2, 0.8, s, xr + 27 + i * 5.4));
  // the two halves of the housing meet in a fine seam along the top and bottom
  const seamPts = [[xr + 20.5, R * 1.003], [xr + len * 0.42, R * 1.003], [xf - 12, R * 0.963], [xf - 4, R * 0.933]];
  bod.add(mesh(new THREE.ExtrudeGeometry(poly([...seamPts, ...seamPts.map(([x, y]) => [x, -y]).reverse()]), { depth: 0.5, bevelEnabled: false }).translate(0, 0, -0.25), mat.hole, false));
  // cooling slots across the rubber rear cap
  for (let i = -2; i <= 2; i++) bod.add(at(box(1, 2, R * (1 - Math.abs(i) * 0.16), mat.hole, 0.3), xr - 0.2, i * 5.4, 0));
  bod.scale.set(1, sx, sz); bod.position.y = yb; g.add(bod);
  g.add(screw(xf - 18, yb - R * 0.5, zAt(-R * 0.5)), screw(xf - 18, yb - R * 0.5, -zAt(-R * 0.5), -1), screw(xr + 62, yb + R * 0.55, zAt(R * 0.55)), screw(xr + 62, yb + R * 0.55, -zAt(R * 0.55), -1));
  if (tag) g.add(print(tag, Math.min(34, len * 0.24), 10, xr + len * 0.64, yb + R * 0.12, zAt(R * 0.12) + 0.5));
  if (tag2) g.add(print(tag2, 36, 6, xr + len * 0.62, yb - R * 0.25, zAt(-R * 0.25) + 0.5, { color: "#d9dde2" }));
  if (regulator) { // power regulator knob on the back
    g.add(at(xturn([[0.1, -10], [R * 0.5, -10], [R * 0.55, -8], [R * 0.55, -1], [R * 0.4, 0]], mat.satin, { flutes: 16, flute: 0.05 }), xr, yb, 0));
    g.add(at(box(2, R * 0.75, 4, mat.redp, 0.4), xr - 10.3, yb, 0));
  }
  // trigger and forward/reverse button
  const tx = hw + rake - 1, ty = yb - R * 0.72;
  g.add(at(ext(rp([[0, 2], [12, 2], [17, -8], [14, -18], [15, -27], [6, -32], [0, -28]], [2, 3, 5, 6, 4, 3, 2]), 13, 3, mat.gloss), tx - 2, ty, 0));
  g.add(at(ext(rp([[1, -4], [12, -4], [14, -9], [12, -16], [3, -16]], 2), 13.4, 0.6, gripRubber(mat.black)), tx - 2, ty, 0)); // grippy face on the trigger
  const fr = 2 * zAt(-R * 0.66) + 12;
  g.add(at(cyl(4, fr, mat.chrome, { along: "z" }), tx - 4, yb - R * 0.66, 0), at(cyl(4.8, 3, mat.black, { along: "z" }), tx - 4, yb - R * 0.66, fr / 2), at(cyl(4.8, 3, mat.black, { along: "z" }), tx - 4, yb - R * 0.66, -fr / 2));
  // nose
  const N = group(); N.position.set(xf, yb, 0); g.add(N);
  const r0 = R * 0.86;
  if (nose === "impact") {
    const lc = R * 1.25;
    N.add(band(r0 + 0.8, -3, 0.6));
    N.add(xturn([[r0, -4], [r0, 1.5], [r0 - 1.2, 2.5], [r0 - 1.2, 4.5], [r0, 5.5], [r0, 9], [r0 * 0.98, lc * 0.45], [r0 * 0.88, lc * 0.78], [r0 * 0.7, lc - 2.5], [r0 * 0.56, lc], [0.1, lc]], gearM, { segs: 48 }));
    if (boot) N.add(xturn([[r0 + 1.2, 11], [r0 + 1.6, 14], [r0 * 0.98 + 1.6, lc * 0.45], [r0 * 0.88 + 1.5, lc * 0.78], [r0 * 0.72 + 1, lc - 3.5], [r0 * 0.6, lc - 1.5]], trim, { segs: 48 }));
    for (let i = 0; i < 4; i++) N.add(at(cyl(1.6, 4, mat.hole, { along: "x", segs: 12 }), lc - 1, Math.sin(i * PI / 2 + PI / 4) * r0 * 0.42, Math.cos(i * PI / 2 + PI / 4) * r0 * 0.42)); // case bolts
    if (ledRing) { const rg = mesh(new THREE.RingGeometry(r0 * 0.47, r0 * 0.56, 40), M.ledW, false); rg.rotation.y = PI / 2; N.add(at(rg, lc + 0.15, 0, 0)); }
    N.add(at(cyl(drive * 0.8, 10, mat.oxide, { along: "x" }), lc + 4, 0, 0));
    N.add(at(cyl(drive * 0.86, 3, mat.satin, { along: "x" }), lc + 1.2, 0, 0));
    const sq = at(rbox(drive * 1.3, drive, drive, mat.chrome, 1, 1), lc + 9 + drive * 0.65, 0, 0); N.add(sq);
    const hog = mesh(new THREE.TorusGeometry(drive * 0.7, 0.9, 8, 24), mat.satin); hog.rotation.y = PI / 2; N.add(at(hog, lc + 9 + drive * 0.3, 0, 0));
    N.add(at(sphere(1.3, mat.chrome), lc + 9 + drive * 0.95, 0, drive / 2));
  }
  if (nose === "driver") {
    const lc = R * 0.62;
    N.add(band(r0 + 0.8, -3, 0.6));
    N.add(xturn([[r0, -4], [r0, 6], [r0 * 0.92, lc * 0.8], [r0 * 0.62, lc], [0.1, lc]], gearM, { segs: 48 }));
    if (boot) N.add(xturn([[r0 + 1.2, 7], [r0 * 0.94 + 1.4, lc * 0.78], [r0 * 0.66 + 1, lc - 1]], trim, { segs: 48 }));
    if (ledRing) { const rg = mesh(new THREE.RingGeometry(r0 * 0.5, r0 * 0.58, 40), M.ledW, false); rg.rotation.y = PI / 2; N.add(at(rg, lc + 0.15, 0, 0)); }
    N.add(xturn([[0.1, lc - 1], [10, lc - 1], [10.8, lc + 2], [10.8, lc + 15], [9.4, lc + 18], [6.4, lc + 20], [0.1, lc + 20]], mat.black, { flutes: 16, flute: 0.05 }));
    N.add(band(11, lc + 6, lc + 8, mat.chrome));
    N.add(at(cyl(4, 1, mat.hole, { along: "x", segs: 6 }), lc + 20.2, 0, 0));
    N.add(at(cyl(3.6, 16, mat.chrome, { along: "x", segs: 6 }), lc + 27, 0, 0), at(cyl(2.2, 3, mat.chrome, { along: "x", segs: 16 }), lc + 36.5, 0, 0), at(cyl(2.6, 6, mat.chrome, { along: "x", segs: 4, r2: 0.4 }), lc + 41, 0, 0));
  }
  if (nose === "drill") {
    N.add(xturn([[r0 * 1.04, -2], [r0 * 1.08, 1], [r0 * 1.08, 12], [r0 * 0.94, 15], [0.1, 15]], mat.black, { flutes: 24, flute: 0.022 }));
    const ticks = mesh(new THREE.CylinderGeometry(r0 * 1.085, r0 * 1.085, 5.5, 48, 1, true, -PI / 2 - 1.1, 2.2), label("1  4  7  10  13  16  ◆", 120, 10, WHITE), false); ticks.geometry.rotateZ(-PI / 2); N.add(at(ticks, 3.2, 0, 0));
    N.add(xturn([[R * 0.55, 14], [R * 0.6, 17], [R * 0.6, 36], [R * 0.55, 40], [R * 0.4, 42]], mat.rubber, { flutes: 18, flute: 0.06 }));
    N.add(xturn([[R * 0.42, 41], [R * 0.4, 48], [R * 0.3, 53], [R * 0.16, 54.5], [0.1, 54.5]], mat.chrome));
    for (let i = 0; i < 3; i++) { const a = (i * 2 * PI) / 3; N.add(at(cyl(1.6, 4, mat.steel, { along: "x", segs: 8 }), 55.5, Math.sin(a) * 3.6, Math.cos(a) * 3.6)); }
    N.add(at(drillBit(44, 3), 52, 0, 0));
    // two-speed slider on top
    g.add(at(rbox(24, 4, 13, mat.black, 2, 1.2), xf - 34, yb + R * sx - 0.5, 0), at(rbox(8, 4, 10, mat.redp, 1.5, 1), xf - 39, yb + R * sx + 1.6, 0));
    g.add(print("1    2", 20, 5, xf - 34, yb + R * sx + 1.7, 7.4, WHITE, "y"));
  }
  if (nose === "hammer") { // barrel, quick-change retainer spring and a chisel
    N.add(band(r0 + 0.8, -3, 0.6, mat.satin));
    N.add(xturn([[r0, -4], [r0, 6], [r0 * 0.7, 12], [r0 * 0.56, 16], [r0 * 0.56, 95], [r0 * 0.5, 98], [0.1, 98]], mat.satin, { segs: 40 }));
    for (let i = 0; i < 6; i++) N.add(band(r0 * 0.565, 26 + i * 10, 27.2 + i * 10, mat.oxide));
    const sp = helix(r0 * 0.6, 26, 6, 1.6, mat.chrome); sp.position.x = 96; N.add(sp);
    N.add(at(cyl(7, 10, mat.oxide, { along: "x", segs: 6 }), 118, 0, 0), at(cyl(5.4, 48, mat.oxide, { along: "x", segs: 6 }), 146, 0, 0));
    const tip = new THREE.BoxGeometry(24, 10.8, 10.8), tp = tip.attributes.position; for (let i = 0; i < tp.count; i++) if (tp.getX(i) > 0) tp.setY(i, tp.getY(i) * 0.12); tip.computeVertexNormals();
    N.add(at(mesh(tip, mat.steel), 181, 0, 0));
  }
  if (nose === "saw") { // gear case, pivoting shoe and blade
    N.add(band(r0 + 0.8, -3, 0.6));
    N.add(xturn([[r0, -4], [r0, 4], [r0 * 0.82, 26], [r0 * 0.6, 30], [0.1, 30]], gearM, { segs: 40 }));
    N.add(xturn([[R * 1.02, -70], [R * 1.06, -64], [R * 1.06, -6], [R * 0.98, -1]], trim, { segs: 40, flutes: 14, flute: 0.02 }));
    N.add(at(ext(rp([[0, -R * 0.7], [8, -R * 0.75], [8, R * 0.45], [0, R * 0.42]], 2), 30, 1.5, mat.steel), 30, -2, 0));
    N.add(at(cyl(4, 34, mat.oxide, { along: "z" }), 34, -R * 0.6, 0));
    N.add(at(cyl(9, 12, mat.black, { along: "x" }), 36, 0, 0));
    const teeth = [...Array(37)].map((_, i) => [150 - i * 4.1, i % 2 ? -10 : -13.5]);
    const bl = ext(poly([[0, 9], [150, 6], [164, -4], ...teeth, [0, -10]]), 1.2, 0.2, mat.steel);
    N.add(at(bl, 38, 0, 0)); N.add(print("BI-METAL", 38, 6, 70, -4, 0.8, { color: "#2a3a8a" }));
  }
  if (nose === "heat") { // stainless nozzle with vent rings, fan grille at the back
    N.add(band(r0 + 0.8, -3, 0.6));
    N.add(xturn([[r0 * 0.66, -2], [r0 * 0.66, 2], [r0 * 0.58, 6], [r0 * 0.58, 76], [r0 * 0.55, 79], [r0 * 0.45, 79]], M.heat, { segs: 40 }));
    N.add(at(cyl(r0 * 0.45, 1, mat.hole, { along: "x" }), 79, 0, 0));
    for (let i = 0; i < 6; i++) for (const s of [1, -1, 0]) N.add(at(slit(r0 * 0.59, 2.4, 1.1, s, 0), 12 + i * 5, 0, 0));
    N.add(at(xturn([[r0 * 0.64, 4], [r0 * 0.64, 8]], mat.black), 0, 0, 0));
    for (let i = 1; i < 5; i++) { const rg = mesh(new THREE.RingGeometry(R * 0.12 * i, R * 0.12 * i + 1.6, 36), mat.hole, false); rg.rotation.y = -PI / 2; g.add(at(rg, xr - 0.2, yb, 0)); }
    // temperature dial
    g.add(at(zturn([[0.1, 0], [9, 0], [9, 5], [7, 6], [0.1, 6]], mat.black, { flutes: 12, flute: 0.06 }), xr + 30, yb + R * 0.2, zAt(R * 0.2) - 2));
    g.add(print("1 · 2 · 3 · 4 · 5", 34, 5, xr + 30, yb + R * 0.2 - 14, zAt(R * 0.2 - 14) + 0.5));
  }
  if (nose === "blow") { // long chrome nozzle with a rubber safety tip
    N.add(xturn([[R * 0.7, -2], [R * 0.7, 6], [R * 0.45, 10], [R * 0.45, 16]], mat.chrome));
    N.add(at(cyl(3.2, 96, mat.chrome, { along: "x", segs: 16 }), 62, 0, 0));
    N.add(xturn([[0.1, 108], [5.4, 108], [6, 114], [6, 124], [4, 126], [1.6, 126]], mat.rubber));
  }
  g.userData.yaw = -0.5; g.userData.yb = yb; g.userData.xr = xr; g.userData.xf = xf;
  return g;
}

/* ---------- inline ratchets (lying on the bench, head on the left) ---------- */
function rhead(r = 19, t = 15, drive = 9.5) {
  const g = group(
    yturn([[0.1, -t / 2], [r - 2.4, -t / 2], [r, -t / 2 + 2.4], [r, t / 2 - 2.4], [r - 2.4, t / 2], [r * 0.7, t / 2 + 1], [0.1, t / 2 + 1.2]], mat.chrome, { segs: 56 }),
    at(slab(poly([[r * 0.5, -r * 0.66], [44, -r * 0.62], [52, -r * 0.7], [52, r * 0.7], [44, r * 0.62], [r * 0.5, r * 0.66]]), t - 5, 2, mat.chrome), 0, 0, 0),
    at(yturn([[0.1, 0], [r * 0.62, 0], [r * 0.64, 2], [r * 0.6, 3.4], [0.1, 3.6]], mat.satin, { flutes: 10, flute: 0.03 }), 0, t / 2 + 0.6, 0), // reversing knob
    at(rbox(r * 0.95, 3.4, 5, mat.chrome, 1.4, 1.2), r * 0.15, t / 2 + 4.6, 0),
    at(cyl(r * 0.6, 3, mat.satin), 0, -t / 2 - 1.2, 0),
    at(rbox(drive, drive, drive, mat.chrome, 0.8, 0.8), 0, -t / 2 - 2.6 - drive / 2, 0),
    at(sphere(1.2, mat.chrome), drive / 2, -t / 2 - 2.6 - drive * 0.55, 0),
  );
  g.userData.bottom = -t / 2 - 2.6 - drive;
  return g;
}
function cratchet(kind = "gen", dr = "") {
  const K = { gen: { R: 20, hr: 19, drive: 9.5, len: 196 }, "14": { R: 18.5, hr: 18, drive: 9.5, len: 206 }, "18": { R: 22, hr: 21, drive: 9.5, len: 262 } }[kind];
  const { R, hr, len } = K, drive = DRIVES[dr] && DRIVES[dr] <= 12.7 ? DRIVES[dr] : K.drive, x1 = 64 + len, g = group(rhead(hr, 15, drive));
  g.add(xturn([[R * 0.6, 44], [R * 0.72, 50], [R * 0.78, 62], [R * 0.82, 66]], mat.satin));
  g.add(band(R * 0.84, 64.5, 66.5));
  g.add(xturn([[R * 0.82, 65], [R * 0.95, 70], [R, 90], [R * 0.95, 130], [R * 0.93, 200], [R * 0.98, x1 - 20], [R, x1 - 6], [R * 0.9, x1], [0.1, x1]], mat.redp, { segs: 48 }));
  // rubber grip with rings
  const gp = [[R * 0.95, 118]]; for (let x = 124; x < 206; x += 6) gp.push([R * 0.98 + 0.4, x], [R * 0.98 + 0.4, x + 3.6], [R * 0.95, x + 4.4], [R * 0.95, x + 5.4]); gp.push([R * 0.93, 212]);
  g.add(xturn(gp, mat.rubber, { segs: 40 }));
  for (let i = 0; i < 4; i++) for (const s of [1, -1]) g.add(slit(R * 1.0 + 0.2, 2, 0.8, s, 80 + i * 5));
  // paddle switch on top, light at the front
  g.add(at(ext(rp([[0, -4], [10, 0.6], [80, 0.8], [83, 4.6], [10, 6], [0, 2]], 2), 17, 3, mat.chrome), 96, R * 0.98 - 1, 0));
  g.add(at(cyl(4.2, 20, mat.black, { along: "z" }), 98, R * 0.98, 0));
  g.add(at(sphere(2.6, M.ledW), 71, R * 0.62, 0));
  g.add(print(drive > 11 ? "1/2" : drive > 9 ? "3/8" : "1/4", 16, 7, 26, 9.2, 0, { color: "#30363e" }, "y"));
  g.add(screw(150, R * 0.4, R * 0.9), screw(x1 - 22, R * 0.4, R * 0.94));
  let back;
  if (kind === "gen") { // small slide pack on the back, gauge on top
    const pb = rbox(76, 36, 44, mat.black, 9, 6); g.add(at(pb, x1 + 30, 0, 0), at(rbox(70, 4, 46, mat.grey, 2, 1.4), x1 + 31, 10, 0));
    g.add(gauge(4, 3, x1 + 44, 18.4, 5, 1.3, "y"), at(rbox(10, 3, 14, mat.redp, 1.4, 1), x1 + 18, 18.2, 0));
    for (const s of [1, -1]) g.add(at(rbox(14, 9, 3, mat.redp, 2, 1), x1 + 8, -2, s * 22.4));
    g.add(print("18V", 22, 9, x1 + 40, -2, 22.6));
    back = [x1 + 64, -18];
  } else if (kind === "14") { // stick pack inside the handle: black end cap with two release tabs
    g.add(xturn([[R * 0.9, x1 - 2], [R * 0.96, x1 + 2], [R * 0.96, x1 + 30], [R * 0.82, x1 + 37], [0.1, x1 + 38]], mat.black, { segs: 40 }));
    for (const s of [1, -1]) g.add(at(rbox(14, 8, 4, mat.redp, 2, 1.2), x1 + 14, 0, s * R * 0.95));
    g.add(band(R * 0.97, x1 + 22, x1 + 24, mat.redp));
    g.add(print("14.4V", 20, 6, x1 + 14, R * 0.55, R * 0.82 + 0.3)); g.children.at(-1).rotation.x = -0.6;
    back = [x1 + 30, -R * 0.96];
  } else { // 18V: slim foot under the back of the handle with the slide pack underneath
    const P = PACKS["18"], fx = x1 - P.L / 2 + 6, py = -R - 4 - P.H;
    g.add(at(rbox(P.L - 6, 13, R * 1.7, mat.redp, 5, 4), fx, -R + 1.5, 0));
    g.add(ext(rp([[fx - P.L / 2 - 26, -R * 0.4], [fx - P.L / 2 + 6, -R - 5], [fx - P.L / 2 + 10, -R + 4], [fx - P.L / 2 - 10, -R * 0.2]], 4), R * 1.6, 5, mat.redp));
    g.add(at(rbox(P.L - 8, 3, P.W - 9, mat.rubber, 1.4, 1), fx, -R - 3.6, 0));
    g.add(at(battery("18"), fx, py, 0));
    back = [fx + P.L / 2, py];
  }
  const w = rest(g, [0, g.children[0].userData.bottom], back); w.userData.yaw = -0.28; return w;
}

/* ---------- air tools that lie on the bench ---------- */
function airRatchet() {
  const R = 17, g = group(rhead(17, 14, 9.5));
  g.add(xturn([[R * 0.6, 44], [R * 0.8, 50], [R * 0.86, 64], [R * 0.9, 68]], mat.satin));
  g.add(band(R * 0.92, 66.5, 68.5));
  const gp = [[R * 0.9, 68]]; for (let x = 74; x < 196; x += 6) gp.push([R + 0.6, x], [R + 0.6, x + 3.8], [R * 0.95, x + 4.6], [R * 0.95, x + 5.4]); gp.push([R, 200], [R * 0.9, 204]);
  g.add(xturn(gp, mat.rubber, { segs: 40 }));
  g.add(xturn([[R * 0.9, 202], [R * 0.95, 206], [R * 0.95, 222], [R * 0.75, 228], [R * 0.5, 230]], mat.satin));
  g.add(at(airPlug(), 230, 0, 0)); g.children.at(-1).rotation.z = PI / 2;
  for (let i = 0; i < 4; i++) g.add(slit(R * 0.96, 1.6, 1.2, 1, 210 + i * 3.2));
  // throttle lever along the top
  g.add(at(ext(rp([[0, 0], [6, 3], [110, 4], [112, 8], [6, 9], [0, 6]], 2), 12, 2.6, mat.chrome), 76, R - 1, 0));
  g.add(at(cyl(4, 16, mat.satin, { along: "z" }), 78, R + 2, 0));
  g.add(print("3/8 AIR", 26, 7, 26, 8.8, 0, { color: "#30363e" }, "y"));
  const w = rest(g, [0, g.children[0].userData.bottom], [216, -R * 0.95]); w.userData.yaw = -0.28; return w;
}
function dieGrinder() {
  const R = 17, g = group();
  const burr = xturn([[0.1, 0], [3, 0.4], [5, 3], [5.4, 8], [4.6, 13], [3, 15]], mat.steel, { flutes: 10, flute: 0.12 }); g.add(burr);
  g.add(at(cyl(3, 26, mat.chrome, { along: "x" }), 28, 0, 0));
  g.add(at(cyl(9, 12, mat.chrome, { along: "x", segs: 6 }), 46, 0, 0));
  g.add(xturn([[7, 52], [11, 54], [11.5, 64], [R * 0.9, 70]], mat.satin));
  g.add(band(R * 0.92, 69, 71));
  const gp = [[R * 0.9, 70]]; for (let x = 76; x < 170; x += 6) gp.push([R + 0.5, x], [R + 0.5, x + 3.8], [R * 0.96, x + 4.6], [R * 0.96, x + 5.4]); gp.push([R, 172], [R * 0.92, 176]);
  g.add(xturn(gp, mat.rubber, { segs: 40 }));
  g.add(xturn([[R * 0.92, 174], [R * 0.98, 178], [R * 0.98, 192], [R * 0.7, 198], [R * 0.5, 200]], mat.satin));
  // rotating exhaust deflector and inlet
  g.add(xturn([[R * 0.6, 196], [R * 0.8, 200], [R * 0.8, 206], [R * 0.55, 210]], M.comp));
  for (let i = 0; i < 3; i++) g.add(slit(R * 0.81, 1.4, 1.4, 1, 201 + i * 2.2));
  g.add(at(airPlug(), 210, 0, 0)); g.children.at(-1).rotation.z = PI / 2;
  // throttle lever with red safety lock
  g.add(at(ext(rp([[0, 0], [6, 3], [86, 4], [88, 8], [6, 9], [0, 6]], 2), 12, 2.6, mat.chrome), 82, R - 1, 0));
  g.add(at(cyl(4, 16, mat.satin, { along: "z" }), 84, R + 2, 0));
  g.add(at(rbox(12, 4, 8, mat.redp, 1.4, 1), 160, R + 6.5, 0));
  g.add(print("25,000 RPM", 30, 5, 122, 0, R + 1, WHITE));
  const w = group(g); g.position.y = R; w.userData.yaw = -0.3; return w;
}
function airCutoff() { // lies on its side with the 3" wheel on top
  const R = 17, hy = R + 13, g = group();
  g.add(at(yturn([[0.1, -13], [14, -13], [15, -10], [15, 6], [12, 9], [0.1, 9]], mat.satin), 0, R, 0));
  g.add(xturn([[13, 2], [R * 0.9, 18], [R * 0.95, 30]], mat.satin).translateY(R));
  g.add(at(band(R * 0.97, 29, 31), 0, R, 0));
  const gp = [[R * 0.95, 30]]; for (let x = 36; x < 150; x += 6) gp.push([R + 0.5, x], [R + 0.5, x + 3.8], [R * 0.96, x + 4.6], [R * 0.96, x + 5.4]); gp.push([R, 152], [R * 0.92, 156]);
  g.add(at(xturn(gp, mat.rubber, { segs: 40 }), 0, R, 0));
  g.add(at(xturn([[R * 0.92, 154], [R * 0.98, 158], [R * 0.98, 172], [R * 0.7, 178], [R * 0.5, 180]], mat.satin), 0, R, 0));
  g.add(at(airPlug(), 180, R, 0)); g.children.at(-1).rotation.z = PI / 2;
  g.add(at(ext(rp([[0, 0], [6, 3], [86, 4], [88, 8], [6, 9], [0, 6]], 2), 12, 2.6, mat.chrome), 46, 2 * R - 1, 0));
  g.add(at(cyl(4, 16, mat.satin, { along: "z" }), 48, 2 * R + 2, 0));
  // wheel, flange nut, guard over the back half
  const dr = 38;
  g.add(at(cyl(dr, 1.6, M.disc, { segs: 64 }), 0, hy + 1.6, 0), at(cyl(9, 2.4, mat.satin, { segs: 6 }), 0, hy + 3.6, 0), at(cyl(6, 2, mat.satin), 0, hy - 0.4, 0));
  g.add(print("76 mm · 20,000", 36, 5, 0, hy + 2.45, 24, WHITE, "y"));
  const gw = mesh(new THREE.CylinderGeometry(dr + 3, dr + 3, 10, 48, 1, true, PI / 2 - PI * 0.525, PI * 1.05), M.guard); g.add(at(gw, 0, hy + 1, 0));
  const gt = mesh(new THREE.RingGeometry(10, dr + 3, 48, 1, -PI * 0.525, PI * 1.05), M.guard); gt.rotation.x = -PI / 2; g.add(at(gt, 0, hy + 6, 0));
  g.userData.yaw = -0.35; return g;
}

/* ---------- right-angle tools standing on their disc or pad: grinders, cut-off, polisher ---------- */
function rightAngle(o = {}) {
  const { pk = null, R = 26, len = 170, disc = 57.5, pad = false, cut = false, cord = false, handle = true, bail = false, body = mat.redp, tag = "", yb0 = pk ? 52 : 40 } = o;
  const g = group(), hb = pad ? 34 : cut ? 14 : 14, yb = pad ? 78 : yb0, hr = pad ? 30 : cut ? 21 : 26;
  // what sits on the bench: wheel, cut-off wheel or foam pad
  if (pad) {
    g.add(yturn([[18, 0], [72, 0], [76, 4], [76, 20], [72, 25], [56, 26], [18, 26]], M.foam, { segs: 64 }), at(cyl(18, 2, mat.hole), 0, 1, 0));
    g.add(yturn([[0.1, 26], [62, 26], [63, 29], [58, 32], [0.1, 32]], mat.black, { segs: 64 }), at(cyl(10, 4, mat.satin, { segs: 6 }), 0, 34, 0));
  } else if (cut) {
    g.add(at(cyl(disc, 1.6, M.disc, { segs: 64 }), 0, 6, 0), at(cyl(9, 4, mat.satin, { segs: 6 }), 0, 3.4, 0), at(cyl(11, 4, mat.satin), 0, 9, 0));
    g.add(print("76 mm", 22, 6, 0, 5.1, disc - 12, WHITE, "y")); g.children.at(-1).rotation.x = PI / 2;
  } else {
    g.add(yturn([[12, 2], [24, 2], [28, 4], [disc - 1, 4], [disc, 5], [disc, 9], [disc - 1, 10], [26, 10], [22, 12], [12, 12]], M.disc, { segs: 64 }));
    g.add(at(cyl(15, 3.6, mat.satin, { segs: 24 }), 0, 1.8, 0), at(cyl(5, 4, mat.hole, { segs: 12 }), 0, 1.2, 0));
    for (let i = 0; i < 2; i++) g.add(at(cyl(1.6, 4, mat.hole, { segs: 8 }), (i ? 1 : -1) * 9, 0.6, 0));
    g.add(at(cyl(12, 3, mat.satin), 0, 13.5, 0));
  }
  // guard over the back half
  if (!pad) {
    const gr = disc + 4, ga = cut ? PI * 1.2 : PI, gh = cut ? 14 : 18, g0 = PI - ga / 2 + PI / 2;
    g.add(at(mesh(new THREE.CylinderGeometry(gr, gr, gh, 56, 1, true, PI + (PI - ga) / 2 - PI / 2 + PI / 2, ga), M.guard), 0, 4 + gh / 2 - 2, 0));
    const top = mesh(new THREE.RingGeometry(hr - 2, gr, 56, 1, PI / 2 + (PI - ga) / 2, ga), M.guard); top.rotation.x = -PI / 2; g.add(at(top, 0, 4 + gh - 2, 0));
    g.add(at(cyl(hr + 1.5, 6, mat.satin), 0, 4 + gh + 1, 0), at(rbox(10, 6, 8, mat.black, 1.5, 1), -hr - 3, 4 + gh + 1, hr * 0.6));
  }
  // gear head
  const h0 = pad ? hb + 2 : cut ? 24 : 28, h1 = yb + R * 0.75;
  g.add(yturn([[0.1, h0], [hr * 0.8, h0], [hr, h0 + 4], [hr, h1 - 6], [hr * 0.86, h1], [0.1, h1 + 1]], mat.satin, { segs: 48 }));
  g.add(at(cyl(4, 3, mat.black), hr * 0.25, h1 + 1.4, 0)); // spindle lock
  for (let i = 0; i < 4; i++) { const a = PI / 4 + (i * PI) / 2; g.add(at(cyl(1.8, 1.6, mat.hole), Math.cos(a) * hr * 0.6, h1 + 0.6, Math.sin(a) * hr * 0.6)); }
  // motor body toward -x
  const xb = -hr + 4, xe = xb - len;
  const bod = group(xturn([[0.1, xe], [R * 0.7, xe], [R * 0.95, xe + 6], [R, xe + 18], [R * 0.96, xb - 30], [R * 1.02, xb - 8], [R * 0.9, xb + 6], [0.1, xb + 6]], body, { segs: 48 }));
  bod.add(band(R * 1.03, xb - 10, xb - 8));
  for (let i = 0; i < 6; i++) for (const s of [1, -1]) bod.add(slit(R * 0.99, 2.2, 0.9, s, xb - 40 - i * 5.4));
  if (!pk) for (let i = 0; i < 5; i++) for (const s of [1, -1]) bod.add(slit(R + 0.2, 2.2, 0.8, s, xe + 24 + i * 5.4));
  bod.add(xturn([[R * 0.97, xe + 30], [R + 1, xe + 34], [R + 1, xe + 78], [R * 0.98, xe + 82]], mat.rubber, { segs: 40, flutes: 12, flute: 0.02 }));
  bod.position.y = yb; g.add(bod);
  if (tag) g.add(print(tag, 34, 10, xb - 70, yb + R * 0.2, R * 0.98 + 0.5));
  g.add(screw(xb - 26, yb - R * 0.55, R * 0.82), screw(xb - 26, yb - R * 0.55, -R * 0.82, -1));
  // switch: paddle underneath (corded/cut-off) or slide switch on the side
  if (cord || cut || pad) g.add(at(ext(rp([[0, 0], [100, 0], [104, -6], [96, -9], [8, -9], [0, -4]], 2.5), 18, 2.6, pad ? mat.chrome : mat.black), xe + 40, yb - R + 3, 0), at(rbox(10, 6, 10, mat.redp, 1.6, 1), xe + 132, yb - R - 2, 0));
  else g.add(at(rbox(30, 7, 8, mat.black, 3, 1.4), xb - 52, yb + R * 0.5, R * 0.86), at(rbox(10, 8, 6, mat.redp, 2, 1.4), xb - 46, yb + R * 0.5, R * 0.86 + 3));
  // side handle
  if (handle && !bail) {
    const hd = zturn([[0.1, 0], [8, 0], [8, 6], [11, 9], [12.5, 30], [13, 70], [11, 84], [6, 88], [0.1, 88]], mat.rubber, { flutes: 6, flute: 0.05 });
    hd.rotation.y = PI; g.add(at(hd, -4, yb - 6, -hr + 2));
  }
  if (bail) { // D-handle loop over the head
    g.add(tube([[-12, h1 - 18, -hr - 2], [-10, h1 + 8, -hr - 16], [-8, h1 + 30, -10], [-8, h1 + 34, 0], [-8, h1 + 30, 10], [-10, h1 + 8, hr + 16], [-12, h1 - 18, hr + 2]], 7, mat.rubber, 16));
    for (const s of [1, -1]) g.add(at(cyl(9, 8, mat.satin, { along: "z" }), -12, h1 - 18, s * (hr + 2)));
  }
  // rear: speed dial for the polisher, then a battery foot or a cord
  if (pad) { g.add(at(zturn([[0.1, 0], [10, 0], [10, 6], [0.1, 6]], mat.black, { flutes: 14, flute: 0.06 }), xe + 20, yb + R * 0.7, -3)); g.children.at(-1).rotation.x = PI / 2 - 0.6; }
  if (pk) {
    const P = PACKS[pk], fx = xe - P.L / 2 + 30;
    g.add(ext(rp([[xe + 30, yb - R * 0.5], [xe + 18, P.H - 1], [fx - P.L / 2 + 2, P.H - 1], [fx - P.L / 2 + 5, P.H + 12], [xe - 14, yb + R * 0.72], [xe + 40, yb + R * 0.9]], [6, 6, 3, 8, 18, 12]), R * 2, 7, body));
    g.add(at(rbox(P.L - 8, 3, P.W - 9, mat.rubber, 1.4, 1), fx, P.H + 1, 0));
    g.add(at(battery(pk), fx, 0, 0));
  }
  if (cord) {
    g.add(at(xturn([[R * 0.55, 0], [R * 0.45, -10], [R * 0.28, -36], [R * 0.24, -44]], mat.rubber, { segs: 24 }), xe, yb, 0));
    g.add(tube([[xe - 40, yb, 0], [xe - 70, yb - 10, 0], [xe - 96, yb - 32, 10], [xe - 100, 5, 40], [xe - 70, 5, 70], [xe - 30, 5, 66]], 4, mat.rubber, 10));
  }
  g.userData.yaw = -0.62; return g;
}

/* ---------- shop electrics and the rest ---------- */
function charger() {
  const g = group();
  g.add(at(rbox(170, 44, 120, mat.black, 12, 8), 0, 24, 0));
  g.add(at(rbox(164, 10, 114, mat.redp, 6, 4), 0, 48, 0));
  for (let i = 0; i < 4; i++) g.add(at(rbox(4, 8, 120.4, mat.rubber, 1.6, 0.6), -70 + i * 6, 22, 0)); // grip ribs
  for (const [x, z] of [[-70, -48], [70, -48], [-70, 48], [70, 48]]) g.add(at(cyl(8, 3, mat.rubber), x, 1.5, z));
  // the slot the pack slides into
  g.add(at(rbox(104, 12, 46, mat.black, 3, 1.5), -14, 58, 0));
  for (const s of [1, -1]) g.add(at(rbox(104, 2.4, 7, mat.satin, 1, 0.6), -14, 62.6, s * 24.5));
  for (let i = 0; i < 4; i++) { const z = (i - 1.5) * 7; g.add(at(box(16, 0.6, 2.6, mat.hole, 0.1), 30, 64, z), at(box(14, 0.8, 1.1, mat.brass, 0.1), 30, 63.9, z)); }
  g.add(at(rbox(14, 8, 40, mat.redp, 2, 1.4), 50, 57, 0));
  // status lamps and print on the front
  g.add(at(rbox(1.4, 16, 60, mat.screen, 3, 0.5), 85.2, 30, 0));
  g.add(at(cyl(2.4, 1.6, M.ledR, { along: "x" }), 86.2, 33, -14), at(cyl(2.4, 1.6, M.ledG, { along: "x" }), 86.2, 33, 14));
  g.add(print("CHARGE", 22, 5, 86.6, 25, -14, WHITE, "x"), print("READY", 22, 5, 86.6, 25, 14, WHITE, "x"));
  g.add(print("14.4V · 18V  Li-ion", 50, 7, 0, 30, 60.4));
  for (let i = 0; i < 6; i++) g.add(at(box(14, 1.6, 2, mat.hole, 0.2), -40 + i * 4.5, 53.4, -40)); // vents
  // cord
  g.add(at(xturn([[9, 0], [7, -8], [4.6, -20]], mat.rubber), -85, 20, 0));
  g.add(tube([[-104, 20, 0], [-120, 12, 0], [-130, 4, 20], [-118, 4, 56], [-80, 4, 74], [-30, 4, 78]], 4, mat.rubber, 10));
  g.userData.yaw = -0.5; return g;
}
function jumpStarter() {
  const g = group(), W = 250, H = 180, D = 96;
  g.add(at(rbox(W, H, D, mat.redp, 22, 10), 0, H / 2 + 6, 0));
  g.add(at(rbox(W - 8, 12, D + 4, mat.rubber, 6, 4), 0, 6, 0));
  for (const s of [1, -1]) g.add(at(rbox(18, H - 30, D + 6, mat.rubber, 9, 5), s * (W / 2 - 4), H / 2 + 6, 0)); // corner bumpers
  // carry handle
  const hs = rp([[-80, 0], [80, 0], [80, 46], [-80, 46]], 20); hs.holes.push(rp([[-62, 4], [62, 4], [62, 30], [-62, 30]], 12));
  g.add(at(ext(hs, 40, 8, mat.rubber), 0, H, 0));
  // front panel: display, gauge, buttons, ports, light
  g.add(at(rbox(W - 56, H - 46, 3, mat.black, 10, 1), 0, H / 2 + 8, D / 2));
  g.add(at(rbox(64, 34, 2, mat.screen, 4, 0.6), -46, H / 2 + 34, D / 2 + 1.6));
  g.add(print("12.6V  88%", 56, 12, -46, H / 2 + 36, D / 2 + 2.8, { color: "#7fd3ff" }));
  g.add(print("12V  JUMP START", 86, 10, 34, H / 2 + 50, D / 2 + 1.8));
  g.add(gauge(5, 4, 34, H / 2 + 26, 9, 2.4, "z").rotateY(0)); g.children.at(-1).children.forEach((l) => { l.position.z = D / 2 + 1.8; l.rotation.x = 0; });
  g.add(at(cyl(9, 3, mat.redp, { along: "z" }), 56, H / 2 - 6, D / 2 + 2), at(cyl(10.5, 2, mat.satin, { along: "z" }), 56, H / 2 - 6, D / 2 + 1.4));
  g.add(at(cyl(9, 3, mat.black, { along: "z" }), 24, H / 2 - 6, D / 2 + 2), at(cyl(10.5, 2, mat.satin, { along: "z" }), 24, H / 2 - 6, D / 2 + 1.4));
  for (let i = 0; i < 3; i++) g.add(at(rbox(12, 5, 2, mat.hole, 1, 0.4), -76 + i * 18, H / 2 - 28, D / 2 + 1.6));
  g.add(at(rbox(30, 14, 2, M.ledW, 4, 0.6), 50, H / 2 - 32, D / 2 + 1.8));
  g.add(print("USB  USB  12V", 54, 5, -58, H / 2 - 38, D / 2 + 1.8));
  // cables out of the top corners to the clamps hung on the sides
  const clamp = (m, s) => {
    const c = group(
      ext(rp([[0, 0], [60, -4], [74, 2], [70, 9], [0, 10]], 3), 18, 3, m),
      at(ext(rp([[0, 0], [60, 4], [74, -2], [70, -9], [0, -10]], 3), 18, 3, m), 0, -6, 0),
      at(cyl(5, 22, mat.satin, { along: "z" }), 44, -3, 0),
      at(ext(poly([[0, 0], [16, -1], [16, 6], [0, 5]]), 14, 0.6, mat.copper), -14, 1, 0), at(ext(poly([[0, 0], [16, 1], [16, -6], [0, -5]]), 14, 0.6, mat.copper), -14, -7, 0),
    );
    c.rotation.z = -PI / 2; c.position.set(s * (W / 2 + 16), H - 6, 6); return c;
  };
  g.add(clamp(mat.red, -1), clamp(mat.gloss, 1));
  for (const s of [-1, 1]) {
    g.add(at(cyl(9, 12, mat.rubber), s * (W / 2 - 40), H + 6, -20));
    g.add(tube([[s * (W / 2 - 40), H + 10, -20], [s * (W / 2 - 30), H + 36, -24], [s * (W / 2 + 6), H + 40, -10], [s * (W / 2 + 18), H + 72, 6]], 5, s < 0 ? mat.red : mat.gloss, 12));
  }
  g.userData.yaw = -0.4; return g;
}
function blowgun() {
  const g = group(), yb = 124;
  g.add(xturn([[0.1, -24], [8, -24], [10, -20], [10, 6], [8, 10], [0.1, 10]], mat.satin, { segs: 32 }).translateY(yb));
  g.add(ext(rp([[-15, 44], [13, 44], [16, 80], [13, yb - 6], [-24, yb - 6], [-21, 80]], 9), 26, 8, mat.redp));
  g.add(ext(rp([[-16, 52], [-2, 52], [0, 80], [-6, yb - 18], [-25, yb - 18], [-22, 80]], 7), 27.8, 8.8, mat.rubber));
  for (const s of [1, -1]) for (let i = 0; i < 4; i++) g.add(at(rbox(10, 2, 1.4, mat.black, 0.8, 0.5), -12, 62 + i * 9, s * 14.4));
  g.add(at(ext(rp([[0, 0], [7, -1], [10, -12], [9, -40], [5, -50], [1, -46], [2, -14]], [2, 3, 5, 6, 3, 2, 4]), 9, 2.4, mat.chrome), 13, yb - 7, 0));
  g.add(at(cyl(3, 16, mat.satin, { along: "z" }), 16, yb - 7, 0));
  g.add(at(cyl(9, 8, mat.satin, { segs: 6 }), 0, 40, 0), at(airPlug(), 0, 36, 0));
  g.add(xturn([[7, 10], [7, 18], [4.6, 22], [4.6, 26]], mat.chrome).translateY(yb));
  g.add(at(cyl(3.2, 70, mat.chrome, { along: "x", segs: 16 }), 60, yb, 0));
  g.add(xturn([[0.1, 92], [5.4, 92], [6.2, 98], [6.2, 108], [4, 110], [1.6, 110]], mat.rubber).translateY(yb));
  g.add(print("90 PSI", 22, 7, -6, 64, 14.6, WHITE));
  const hang = mesh(new THREE.TorusGeometry(6, 2, 10, 24), mat.satin); g.add(at(hang, -26, yb + 4, 0));
  g.userData.yaw = -0.5; return g;
}
function greaseGun() {
  const R = 26, g = group();
  g.add(at(cyl(R, 270, mat.redp, { along: "x", segs: 48 }), 165, R, 0));
  for (const x of [40, 290]) g.add(at(xturn([[R + 0.4, -4], [R + 1.6, -2], [R + 1.6, 2], [R + 0.4, 4]], mat.redp), x, R, 0));
  g.add(print("14 OZ", 40, 12, 170, R, R + 0.4)); g.add(print("GREASE", 46, 9, 230, R, R + 0.4));
  // head casting with the pump, lever and bleeder
  g.add(at(xturn([[R + 2, 0], [R + 3, 3], [R + 3, 26], [R + 1, 30]], mat.oxide, { segs: 48, flutes: 12, flute: 0.03 }), 4, R, 0));
  g.add(at(rbox(36, 42, 34, mat.oxide, 6, 4), 10, 2 * R + 12, 0));
  g.add(at(cyl(4, 8, mat.brass, { along: "z", segs: 6 }), 6, 2 * R + 12, 18));
  g.add(at(cyl(5, 40, mat.chrome, { along: "z" }), 22, 2 * R + 26, 0));
  const lev = ext(rp([[0, -6], [240, -3], [240, 5], [0, 8]], 3), 14, 3, mat.oxide); g.add(at(lev, 22, 2 * R + 26, 0)); lev.rotation.z = -0.06;
  g.add(at(capsule(9, 80, mat.rubber), 230, 2 * R + 12, 0)); g.children.at(-1).rotation.z = -0.06;
  g.add(at(rbox(14, 30, 16, mat.oxide, 3, 2), 34, 2 * R + 14, 0));
  // flex hose and coupler
  g.add(at(cyl(7, 14, mat.brass, { along: "x", segs: 6 }), -9, R + 6, 0));
  g.add(tube([[-16, R + 6, 0], [-50, R + 2, 10], [-80, 10, 50], [-60, 9, 100], [-10, 9, 110]], 6, mat.rubber, 14));
  g.add(at(cyl(7, 12, mat.brass, { along: "x", segs: 6 }), -2, 9, 110), at(cyl(8, 18, mat.chrome, { along: "x" }), 12, 9, 110), at(cyl(5, 8, mat.chrome, { along: "x", r2: 7 }), 24, 9, 110));
  // rear cap with the plunger rod and T-handle
  g.add(at(xturn([[R + 1.6, 0], [R + 2, 4], [R + 2, 16], [R * 0.6, 22], [8, 22]], mat.satin, { flutes: 16, flute: 0.03 }), 296, R, 0));
  g.add(at(cyl(4.5, 56, mat.chrome, { along: "x" }), 346, R, 0), at(cyl(4.5, 44, mat.chrome, { along: "z" }), 374, R, 0));
  for (const s of [1, -1]) g.add(at(sphere(5.5, mat.red), 374, R, s * 24));
  g.userData.yaw = -0.3; return g;
}
function solderingIron() {
  const g = group();
  // stand: heavy base, sponge tray, coil holder
  g.add(at(rbox(170, 14, 100, mat.oxide, 8, 4), 0, 7, 0));
  g.add(at(rbox(60, 8, 60, mat.black, 6, 2), 46, 16, 10), at(rbox(52, 6, 52, M.sponge, 5, 2), 46, 20, 10));
  for (let i = 0; i < 4; i++) g.add(at(box(40, 0.8, 1, mat.hole, 0.2), 46, 23.2, -6 + i * 10));
  g.add(at(cyl(5, 46, mat.satin), -50, 30, 0), at(cyl(16, 4, mat.satin), -50, 14, 0));
  const ang = 0.5, coil = group(helix(15, 70, 9, 1.4, mat.chrome), at(cyl(16, 4, mat.satin, { along: "x" }), 0, 0, 0)); coil.rotation.z = ang; coil.position.set(-36, 52, 0); g.add(coil);
  // the iron, resting in the coil: tip down at the front
  const iron = group(
    at(cyl(1.4, 14, mat.copper, { along: "x", r2: 0.3 }), -7, 0, 0).rotateY(0), at(cyl(2.4, 8, mat.steel, { along: "x", r2: 1.4 }), 3, 0, 0),
    at(cyl(3.4, 60, mat.satin, { along: "x" }), 36, 0, 0), at(cyl(6, 8, mat.chrome, { along: "x", segs: 24 }), 68, 0, 0),
    xturn([[6, 72], [9, 78], [9, 96], [11, 104], [12, 140], [10.6, 160], [7, 172], [5, 178]], mat.rubber, { flutes: 8, flute: 0.04 }),
    xturn([[9.2, 80], [9.2, 94]], mat.redp), xturn([[0.1, 176], [5, 176], [4, 200], [3, 204]], mat.rubber),
  );
  iron.add(print("400°C", 22, 6, 120, 0, 12.2));
  iron.rotation.z = ang; iron.position.set(-36 + Math.cos(ang) * 6, 52 + Math.sin(ang) * 6, 0); g.add(iron);
  // cord from the handle end down to the bench
  const ce = new THREE.Vector3(204, 0, 0).applyEuler(iron.rotation).add(iron.position);
  g.add(tube([[ce.x, ce.y, ce.z], [ce.x + 10, ce.y + 20, 10], [ce.x + 30, 30, 40], [ce.x + 10, 4, 70], [ce.x - 40, 4, 80]], 3, mat.rubber, 10));
  g.userData.yaw = -0.35; return g;
}

/* ---------- the catalog ---------- */
const imp = (o) => pistol({ nose: "impact", mode: true, ...o });
// the item's own drive (a 3/8" 18V impact) replaces the model's usual anvil and stamp
const sized = (base, o = {}) => (o.drive && DRIVES[o.drive] ? { ...base, drive: DRIVES[o.drive], tag: o.drive } : base);
export const MODELS = {
  // generic cordless line: grey/black packs, black overmold
  power: (o) => imp(sized({ pk: "gen", len: 120, R: 29, drive: 9.5, tag: "3/8", tag2: "BRUSHLESS", gearM: mat.oxide }, o)),
  "power-stubby": (o) => imp(sized({ pk: "gen", len: 94, R: 28, drive: 9.5, tag: "3/8", gearM: mat.oxide, gripH: 88 }, o)),
  "power-12": (o) => imp(sized({ pk: "gen", len: 142, R: 33, drive: 12.7, tag: "1/2", tag2: "HIGH TORQUE", gearM: mat.oxide, gripH: 96, gripT: 36, gripW: 48 }, o)),
  "power-driver": () => pistol({ pk: "gen", nose: "driver", len: 108, R: 27, tag: "1/4 HEX", gearM: mat.oxide, mode: true }),
  "power-drill": () => pistol({ pk: "gen", nose: "drill", len: 108, R: 28, tag2: "2-SPEED" }),
  "power-ratchet": (o = {}) => cratchet("gen", o.drive),
  // 14.4V: slimmer tools, smaller black packs
  "cl14-impact": (o) => imp(sized({ pk: "14", len: 108, R: 26, drive: 9.5, tag: "3/8", tag2: "14.4V", gripH: 84, gripT: 31, gripW: 42, px: 6 }, o)),
  "cl14-driver": () => pistol({ pk: "14", nose: "driver", len: 100, R: 25, tag: "1/4", tag2: "14.4V", gripH: 82, gripT: 31, gripW: 42, px: 6 }),
  "cl14-ratchet": (o = {}) => cratchet("14", o.drive),
  "cl14-battery": () => batteryModel("14"),
  // 18V: chunky tools with rubber nose boots and a ring light
  "cl18-impact": (o) => imp(sized({ pk: "18", len: 126, R: 31, drive: 12.7, tag: "1/2", tag2: "18V BRUSHLESS", boot: true, ledRing: true, gripH: 94, gripT: 36, gripW: 48 }, o)),
  "cl18-driver": () => pistol({ pk: "18", nose: "driver", len: 110, R: 29, tag: "1/4", tag2: "18V", boot: true, ledRing: true, mode: true, gripH: 92, gripT: 35 }),
  "cl18-drill": () => pistol({ pk: "18", nose: "drill", len: 112, R: 30, tag2: "18V 2-SPEED", gripH: 92, gripT: 35 }),
  "cl18-ratchet": (o = {}) => cratchet("18", o.drive),
  "cl18-grinder": () => rightAngle({ pk: "18", tag: "18V" }),
  "cl18-cutoff": () => rightAngle({ pk: "18", cut: true, disc: 38, R: 22, len: 150, handle: false, tag: "18V", yb0: 46 }),
  "cl18-saw": () => { const s = pistol({ pk: "18", nose: "saw", len: 250, R: 30, xr: -46, px: -6, tag: "18V", gripH: 92, gripT: 35 }); return s; },
  "cl18-battery": () => batteryModel("18"),
  battery: () => batteryModel("gen"),
  charger: () => charger(),
  // air tools: composite black housings, satin metal, hose fitting under the grip
  "air-impact": (o) => pistol(sized({ pk: null, nose: "impact", len: 130, R: 31, drive: 12.7, body: M.comp, trim: mat.rubber, rearCap: mat.satin, tag: "1/2", tag2: "AIR · 90 PSI", regulator: true, gripH: 98 }, o)),
  "air-hammer": () => pistol({ pk: null, nose: "hammer", len: 96, R: 26, body: M.comp, rearCap: mat.satin, tag2: "AIR HAMMER", gripH: 96, gripT: 32, gripW: 42 }),
  "air-ratchet": () => airRatchet(),
  "grinder-die": () => dieGrinder(),
  cutoff: () => airCutoff(),
  blowgun: () => blowgun(),
  "grinder-angle": () => rightAngle({ cord: true, tag: "115 mm" }),
  polisher: () => rightAngle({ pk: "gen", pad: true, bail: true, R: 28, len: 180, tag: "600-3000" }),
  rivet: () => rivetGun(),
  heatgun: () => pistol({ pk: null, base: "stand", nose: "heat", len: 150, R: 33, tag2: "1500 W", gripH: 80, gripT: 34 }),
  jump: () => jumpStarter(),
  "grease-gun": () => greaseGun(),
  solder: () => solderingIron(),
};

// pneumatic rivet gun: stands on its air/hydraulic cylinder, head on top with a mandrel catcher at the back
function rivetGun() {
  const g = group(), yb = 205;
  g.add(yturn([[0.1, 0], [36, 0], [38, 3], [38, 70], [36, 74], [24, 80], [0.1, 82]], mat.satin, { segs: 56 }));
  g.add(yturn([[38.4, 6], [38.4, 18]], mat.rubber), yturn([[38.4, 56], [38.4, 66]], mat.rubber));
  g.add(print("AIR · 90 PSI", 34, 8, 0, 40, 38.3));
  g.add(at(airPlug(), -30, 30, 0)); g.children.at(-1).rotation.z = -PI / 2;
  // handle
  g.add(ext(rp([[-20, 70], [20, 70], [16, 120], [14, yb - 16], [-26, yb - 16], [-22, 120]], 9), 32, 9, M.comp));
  g.add(ext(rp([[-21, 78], [-2, 78], [-2, 120], [-4, yb - 26], [-27, yb - 26], [-23, 120]], 7), 33.8, 9.8, mat.rubber));
  g.add(at(ext(rp([[0, 0], [10, 0], [14, -8], [12, -20], [4, -24], [0, -20]], 3), 12, 2.6, mat.chrome), 14, yb - 22, 0));
  // head
  g.add(xturn([[0.1, -70], [22, -70], [24, -66], [24, 40], [20, 46], [0.1, 46]], M.comp, { segs: 48 }).translateY(yb));
  g.add(at(band(24.4, -20, -16), 0, yb, 0), at(band(24.4, 20, 24, mat.redp), 0, yb, 0));
  g.add(xturn([[12, 46], [12, 60], [9, 64], [9, 80], [5, 84], [2.2, 84]], mat.chrome).translateY(yb));
  g.add(at(cyl(2.2, 1, mat.hole, { along: "x" }), 84.4, yb, 0));
  g.add(xturn([[16, -70], [18, -76], [18, -130], [15, -136], [0.1, -137]], mat.clear, { segs: 40 }).translateY(yb));
  g.add(xturn([[18.5, -78], [18.5, -84]], mat.black).translateY(yb));
  for (let i = 0; i < 5; i++) g.add(at(cyl(1.1, 26, mat.steel, { along: "x", segs: 6 }), -100 - (i % 2) * 4, yb - 10 + i * 1.6, -6 + i * 3));
  g.add(print("4.8 mm", 26, 7, -20, yb + 4, 24.2));
  g.userData.yaw = -0.6; return g;
}
