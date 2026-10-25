// BoxTally 3D: storage, sets, diagnostics and shop extras (roll cabs, carts, kits, scan tools, creepers...).
import { THREE, mat, PI, mesh, slab, circle, poly, starPath, turned, cyl, box, tube, sphere, capsule, at, group, label } from "./kit3d.js";
import { screwdriver, pliers, pick, punch, socket, ratchet, extension, adapter, handle } from "./core3d.js";

/* ---------- local materials ---------- */
const M = {
  liner: new THREE.MeshPhysicalMaterial({ color: 0x0b0c0e, roughness: 0.92 }), // drawer gaps, case interiors
  alu: new THREE.MeshPhysicalMaterial({ color: 0xd3d8de, metalness: 1, roughness: 0.2 }), // drawer pulls
  vinyl: new THREE.MeshPhysicalMaterial({ color: 0x17181b, roughness: 0.45, clearcoat: 0.7, clearcoatRoughness: 0.35 }),
  foam: new THREE.MeshPhysicalMaterial({ color: 0x26282c, roughness: 0.95 }),
  redrub: new THREE.MeshPhysicalMaterial({ color: 0xa00912, roughness: 0.72, clearcoat: 0.15 }),
  dark: new THREE.MeshPhysicalMaterial({ color: 0x2c3036, roughness: 0.5, clearcoat: 0.3 }),
  grey: new THREE.MeshPhysicalMaterial({ color: 0x8a8d92, roughness: 0.55, clearcoat: 0.2 }), // blow-molded cases
  hdpe: new THREE.MeshPhysicalMaterial({ color: 0x1b1c1f, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
  green: new THREE.MeshPhysicalMaterial({ color: 0x1f9d55, roughness: 0.35, clearcoat: 0.8 }),
  lens: new THREE.MeshPhysicalMaterial({ color: 0x05070a, roughness: 0.02, clearcoat: 1, metalness: 0.3 }),
  led: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  ledg: new THREE.MeshBasicMaterial({ color: 0x44ff77 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.03, clearcoat: 1, transparent: true, opacity: 0.16, depthWrite: false }),
};

/* ---------- helpers ---------- */
const V = (p) => (p.isVector3 ? p.clone() : new THREE.Vector3(...p));
const rot = (o, x = 0, y = 0, z = 0) => { o.rotation.set(x, y, z); return o; };
const sc = (o, x, y = x, z = x) => { o.scale.set(x, y, z); return o; };
function rrect(w, h, r, path = false) { // rounded rectangle centred on 0
  const s = path ? new THREE.Path() : new THREE.Shape(), a = w / 2 - r, b = h / 2 - r;
  s.moveTo(-a, -h / 2); s.lineTo(a, -h / 2); s.absarc(a, -b, r, -PI / 2, 0); s.lineTo(w / 2, b); s.absarc(a, b, r, 0, PI / 2);
  s.lineTo(-a, h / 2); s.absarc(-a, b, r, PI / 2, PI); s.lineTo(-w / 2, -b); s.absarc(-a, -b, r, PI, 1.5 * PI);
  return s;
}
const frameShape = (w, h, r, wall) => { const s = rrect(w, h, r); s.holes.push(rrect(w - 2 * wall, h - 2 * wall, Math.max(1, r - wall), true)); return s; };
const starShape = (n, rIn, rOut) => { const s = new THREE.Shape(); for (let i = 0; i < n * 2; i++) { const a = (i * PI) / n, r = i % 2 ? rIn : rOut; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(r, 0); } s.closePath(); return s; };
// a 2D outline extruded toward the camera (+z), centred on z = 0
function prism(shape, depth, bevel, m) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 32 });
  g.translate(0, 0, -depth / 2); return mesh(g, m);
}
function pipe(pts, r, m, { segs = 96, radial = 14, closed = false } = {}) {
  return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(V), closed), segs, r, radial, closed), m);
}
function rod(a, b, r, m, { segs = 16, r2 = r } = {}) { // a cylinder from point a to point b
  const A = V(a), d = V(b).sub(A), L = d.length(), o = cyl(r, L, m, { segs, r2 });
  o.position.copy(A).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return o;
}
// a canvas drawn picture (screens, dials, printed scales)
function canvasMat(w, h, draw, { lit = false, transparent = false, px = 512 } = {}) {
  const c = document.createElement("canvas"); c.width = px; c.height = Math.max(8, Math.round((px * h) / w));
  const x = c.getContext("2d"); draw(x, c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return lit ? new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, transparent, depthWrite: !transparent })
    : new THREE.MeshBasicMaterial({ map: t, transparent, depthWrite: !transparent, toneMapped: false });
}
const plane = (w, h, m) => mesh(new THREE.PlaneGeometry(w, h), m, false); // faces +z
const up = (o) => rot(o, -PI / 2); // a plane turned to face up
function txt(x, s, X, Y, px, color = "#fff", align = "left", weight = 600) { x.fillStyle = color; x.font = `${weight} ${px}px Helvetica, Arial, sans-serif`; x.textAlign = align; x.textBaseline = "middle"; x.fillText(s, X, Y); }
function rr(x, X, Y, w, h, r) { x.beginPath(); x.roundRect(X, Y, w, h, r); }
// several printed words spaced evenly along a strip (size rows under sockets, bits and drivers)
const rowLabel = (words, w, h, color = "#f1f3f5") => canvasMat(w, h, (x, W, H) => words.forEach((s, i) => txt(x, s, ((i + 0.5) * W) / words.length, H / 2, H * 0.62, color, "center", 700)), { lit: true, transparent: true, px: 1024 });

// a soft dark contact shadow on the floor under big things (the studio's shadow map only covers bench-sized tools)
function blob(w, d, op = 0.45) {
  const m = canvasMat(w, d, (x, W, H) => { const g = x.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2); g.addColorStop(0, `rgba(0,0,0,${op})`); g.addColorStop(0.6, `rgba(0,0,0,${op * 0.7})`); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, W, H); }, { transparent: true, px: 128 });
  m.toneMapped = true; const o = up(plane(w, d, m)); o.position.y = 0.4; o.receiveShadow = false; return o;
}
// an open-topped tray: rim walls plus a floor, optional liner mat
function tray(w, d, h, { wall = 8, r = 10, m = mat.redp, floor = 6, liner = null } = {}) {
  const g = group(at(slab(frameShape(w - 2, d - 2, r, wall), h - 2, 1, m), 0, h / 2, 0), at(slab(rrect(w - 2, d - 2, r), floor - 2, 1, m), 0, floor / 2, 0));
  if (liner) g.add(at(slab(rrect(w - 2 * wall - 2, d - 2 * wall - 2, Math.max(2, r - wall)), 2, 0.5, liner), 0, floor + 1, 0));
  return g;
}
// swivel caster standing on the floor; userData.h is the height of its top plate
function caster(R = 50, W = 30, { brake = false, lite = false } = {}) {
  const H = 2 * R + 12, f0 = R - 6, f1 = H - 6, oz = -R * 0.22;
  const g = group(
    at(cyl(R, W, mat.rubber, { along: "x", segs: 40 }), 0, R, 0),
    at(cyl(R * 0.64, W + 1.5, mat.grey, { along: "x", segs: 32 }), 0, R, 0),
    at(cyl(R * 0.2, W + 13, mat.chrome, { along: "x", segs: 16 }), 0, R, 0),
    at(box(4, f1 - f0, R * 0.95, mat.satin, 1.5), -(W / 2 + 4), (f0 + f1) / 2, oz),
    at(box(4, f1 - f0, R * 0.95, mat.satin, 1.5), W / 2 + 4, (f0 + f1) / 2, oz),
    at(box(W + 12, 6, R * 0.95, mat.satin, 1.5), 0, f1, oz),
  );
  if (!lite) g.add(at(cyl(R * 0.42, 8, mat.steel), 0, H + 1, oz), at(box(R * 1.4, 5, R * 1.4, mat.satin, 1.5), 0, H + 7.5, oz));
  if (brake) g.add(at(rot(box(W * 0.9, 5, R * 0.7, mat.red, 2), -0.35), 0, f1 + 4, R * 0.5));
  g.userData.h = lite ? H - 3 : H + 10;
  return g;
}

/* ---------- storage ---------- */
// one column of drawers: red fronts, a long aluminium pull lip at the top of each, black gaps
function drawers(g, x0, x1, yTop, hs, z, gap = 8) {
  const w = x1 - x0, cx = (x0 + x1) / 2; let y = yTop;
  for (const h of hs) {
    g.add(at(box(w, h, 14, mat.redp, 3), cx, y - h / 2, z + 7));
    g.add(at(sc(capsule(6, w - 64, M.alu), 1, 1, 1.3), cx, y - 13, z + 19));
    g.add(at(box(w - 52, 4, 3, M.liner, 1), cx, y - 22.5, z + 14.8));
    y -= h + gap;
  }
  return y + gap;
}
function lock(x, y, z) { return group(at(cyl(9, 8, mat.chrome, { along: "z", segs: 28 }), x, y, z + 4), at(box(1.6, 8, 2, mat.hole, 0.3), x, y, z + 8.4)); }
function rollCab({ W = 1300, D = 480, Hc = 860 } = {}) {
  const cR = 55, cs = [caster(cR, 34, { brake: true }), caster(cR, 34, { brake: true }), caster(cR, 34), caster(cR, 34)];
  const y0 = cs[0].userData.h, g = group();
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz], i) => g.add(at(cs[i], sx * (W / 2 - 80), 0, sz * (D / 2 - 75))));
  const zf = D / 2, top = y0 + Hc;
  g.add(at(box(W, Hc, D, mat.redp, 8), 0, y0 + Hc / 2, 0));
  g.add(at(box(W - 36, Hc - 56, 4, M.liner, 1), 0, y0 + Hc / 2 + 4, zf + 1));
  g.add(at(box(W + 10, 18, D + 10, mat.rubber, 6), 0, top + 6, 0)); // top bumper
  g.add(at(box(W + 8, 34, D + 8, mat.rubber, 6), 0, y0 + 14, 0)); // kick bumper
  const x0 = -W / 2 + 22, x1 = W / 2 - 22, mid = 0;
  let y = drawers(g, x0, x1, top - 26, [86], zf + 3) - 8;
  drawers(g, x0, mid - 4, y, [90, 90, 130, 160, 210], zf + 3);
  drawers(g, mid + 4, x1, y, [90, 130, 200, 268], zf + 3);
  // side: raised panel, chrome handle on stand-offs
  g.add(at(box(6, Hc - 150, D - 120, mat.redp, 3), W / 2 + 1, y0 + Hc / 2 + 10, 0));
  const hy = top - 90;
  g.add(pipe([[W / 2 + 4, hy, -D / 2 + 70], [W / 2 + 52, hy, -D / 2 + 95], [W / 2 + 60, hy, 0], [W / 2 + 52, hy, D / 2 - 95], [W / 2 + 4, hy, D / 2 - 70]], 13, mat.chrome, { segs: 64 }));
  g.add(at(box(14, 40, 40, mat.rubber, 5), W / 2 + 5, hy, -D / 2 + 70), at(box(14, 40, 40, mat.rubber, 5), W / 2 + 5, hy, D / 2 - 70));
  g.add(lock(W / 2 - 60, top - 13, zf));
  g.userData.top = top + 15;
  return g;
}
function topChest({ W = 1300, D = 450, Hb = 360, open = 0 } = {}) {
  const g = group(), zf = D / 2;
  g.add(at(box(W, Hb, D, mat.redp, 8), 0, Hb / 2, 0));
  g.add(at(box(W - 36, Hb - 40, 4, M.liner, 1), 0, Hb / 2, zf + 1));
  const x0 = -W / 2 + 22, x1 = W / 2 - 22, bw = (x1 - x0 - 16) / 3;
  let y = drawers(g, x0, x1, Hb - 18, [62, 62], zf + 3) - 8;
  for (let i = 0; i < 3; i++) drawers(g, x0 + i * (bw + 8), x0 + i * (bw + 8) + bw, y, [56, 56, 82], zf + 3);
  // the till (top compartment) and its lid, hinged at the back
  g.add(at(tray(W, D, 62, { wall: 14, r: 8, floor: 6, liner: M.liner }), 0, Hb, 0));
  g.add(at(box(W - 30, 6, 10, M.liner, 1), 0, Hb + 3, zf - 2)); // seam
  const lid = group(at(box(W, 46, D + 6, mat.redp, 10), 0, 23, D / 2 + 3), at(sc(capsule(6.5, W - 140, M.alu), 1, 1, 1.3), 0, 8, D + 9));
  if (open) lid.add(at(box(W - 40, 3, D - 40, M.liner, 1), 0, -1, D / 2 + 3));
  const pivot = group(lid); pivot.position.set(0, Hb + 62, -D / 2); pivot.rotation.x = -open; g.add(pivot);
  if (open) { // gas struts from the till walls to the lid
    pivot.updateMatrix();
    for (const sx of [-1, 1]) {
      const a = V([sx * (W / 2 - 30), Hb + 50, -D / 2 + 150]), b = V([sx * (W / 2 - 30), -6, 200]).applyMatrix4(pivot.matrix), m = a.clone().lerp(b, 0.55);
      g.add(rod(a, m, 7, mat.oxide), rod(m, b, 3.2, mat.chrome));
    }
  } else g.add(lock(W / 2 - 70, Hb + 42, zf + 4));
  // chrome side handles
  for (const sx of [-1, 1]) g.add(pipe([[sx * (W / 2 + 2), Hb - 70, -110], [sx * (W / 2 + 34), Hb - 64, -90], [sx * (W / 2 + 40), Hb - 62, 0], [sx * (W / 2 + 34), Hb - 64, 90], [sx * (W / 2 + 2), Hb - 70, 110]], 9, mat.chrome, { segs: 48 }));
  return g;
}
function rollCabChest() {
  const cab = rollCab(), chest = at(topChest({ D: 440 }), 0, cab.userData.top, -10);
  const g = group(blob(1500, 640), cab, chest); g.userData.yaw = -0.45; return g;
}
function chestOpen() {
  const D = 450, Hb = 360, g = topChest({ W: 1000, D, Hb, open: 1.78 }); g.add(blob(1150, 560, 0.4));
  // a few tools left in the till
  const r = ratchet(); r.position.set(-220, Hb + 15, 40); r.rotation.y = 0.15; g.add(r);
  [[120, 8.4], [170, 9.8], [222, 11]].forEach(([x, rr2], i) => g.add(at(socket({ r: rr2, h: 26 + i * 2 }), x, Hb + 8, 60)));
  g.userData.yaw = -0.42; return g;
}
/* ---------- a box built from what it really is ----------
   spec is "type;width;layout;flags" from boxSpec() in app.js: "cab;68;3/4,2;p" is a 68" roll cab, three
   full-width drawers (the top one a PowerDrawer) over banks of 4 and 2. Flags: p power, l bed liner top,
   ss stainless top, L/R the side a locker goes on. Sizes are the real ones, in mm. */
const IN = 25.4;
// bed liner: a rough black coat with a fine pebbled bump
const bedLiner = (() => {
  let m = null;
  return () => {
    if (m) return m;
    const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d");
    x.fillStyle = "#808080"; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5000; i++) { const v = 90 + ((i * 97) % 120); x.fillStyle = `rgb(${v},${v},${v})`; x.beginPath(); x.arc((i * 73.13) % 256, (i * 151.7) % 256, 0.6 + ((i * 7) % 5) * 0.35, 0, 2 * PI); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 3);
    return (m = new THREE.MeshPhysicalMaterial({ color: 0x141518, roughness: 1, bumpMap: t, bumpScale: 3 }));
  };
})();
// shallow drawers on top, deeper toward the floor (the drawing does the same)
const stackH = (n, h) => { const w = Array.from({ length: n }, (_, i) => 1 + 0.45 * i), s = w.reduce((a, b) => a + b, 0); return w.map((x) => (x * h) / s); };
// the drawer fronts of a cab or chest between yTop and yBot: full-width ones, then each bank's column
function drawerFace(g, W, yTop, yBot, z, f, cols, power) {
  const x0 = -W / 2 + 22, x1 = W / 2 - 22, gap = 8, all = yTop - yBot;
  const full = f && cols.length > 1 ? Math.min(all * 0.12, all / (f + 3)) : 0;
  let y = yTop;
  for (let i = 0; i < f; i++) {
    drawers(g, x0, x1, y, [full - gap], z, gap);
    if (i === 0 && power) { // PowerDrawer: a black panel with USB ports and a power light at the right end
      const pw = Math.min(260, (x1 - x0) * 0.14), px = x1 - pw / 2 - 30, py = y - full / 2 + 6;
      g.add(at(box(pw, full - gap - 26, 6, mat.rubber, 2), px, py, z + 17));
      [-0.3, 0, 0.3].forEach((t, j) => g.add(at(box(14, 7, 2, j === 2 ? M.ledg : M.lens, 1), px + t * pw, py, z + 21)));
    }
    y -= full;
  }
  const cw = (x1 - x0 - gap * (cols.length - 1)) / cols.length;
  cols.forEach((n, i) => { const a = x0 + i * (cw + gap); drawers(g, a, a + cw, y, stackH(Math.max(1, n), y - yBot).map((h) => h - gap), z, gap); });
}
function casters(g, W, D, R = 55) {
  const xs = W > 2300 ? [-1, 0, 1] : [-1, 1];
  for (const sz of [1, -1]) for (const sx of xs) g.add(at(caster(R, 34, { brake: sz > 0 && sx !== 0 }), sx * (W / 2 - 80), 0, sz * (D / 2 - 75)));
  return caster(R, 34).userData.h;
}
const sideHandle = (W, D, hy, sx) => pipe([[sx * (W / 2 + 4), hy, -D / 2 + 70], [sx * (W / 2 + 52), hy, -D / 2 + 95], [sx * (W / 2 + 60), hy, 0], [sx * (W / 2 + 52), hy, D / 2 - 95], [sx * (W / 2 + 4), hy, D / 2 - 70]], 13, mat.chrome, { segs: 64 });
function topMat(g, W, D, y, flags) {
  if (flags.includes("ss")) g.add(at(box(W + 6, 14, D + 6, mat.satin, 4), 0, y + 5, 0));
  else if (flags.includes("l")) g.add(at(box(W + 12, 22, D + 12, bedLiner(), 7), 0, y + 8, 0));
  else g.add(at(box(W + 10, 18, D + 10, mat.rubber, 6), 0, y + 6, 0));
}
function boxUnit(spec) {
  const [type, wIn, lay = "0/1", fl = ""] = spec.split(";"), flags = fl.split("+"), has = (x) => flags.includes(x);
  const [fs, cs] = lay.split("/"), f = +fs || 0, cols = (cs || "1").split(",").map(Number).filter((n) => n >= 0);
  const W = (+wIn || 54) * IN, g = group();
  if (type === "cab" || type === "end" || type === "locker") {
    const D = 25 * IN, Hc = (type === "locker" ? 56 : 37) * IN, y0 = casters(g, W, D, type === "cab" ? 55 : 48), top = y0 + Hc, zf = D / 2;
    g.add(blob(W + 260, D + 200));
    g.add(at(box(W, Hc, D, mat.redp, 8), 0, y0 + Hc / 2, 0));
    topMat(g, W, D, top, type === "cab" ? flags : []);
    g.add(at(box(W + 8, 34, D + 8, mat.rubber, 6), 0, y0 + 14, 0)); // kick bumper
    if (type === "locker") {
      const n = cols[0] || 0, dh = n ? Math.min(118, (Hc * 0.4) / n) : 0, dBot = y0 + 40 + n * dh;
      if (n) drawerFace(g, W, dBot, y0 + 40, zf + 3, 0, [n], false);
      g.add(at(box(W - 36, top - dBot - 40, 14, mat.redp, 4), 0, (top + dBot) / 2 - 10, zf + 7)); // the door
      g.add(at(box(W - 60, 4, 3, M.liner, 1), 0, dBot + 2, zf + 13));
      const hx = (has("R") ? -1 : 1) * (W / 2 - 70);
      g.add(at(sc(capsule(9, 260, M.alu), 1, 1, 1.3), hx, top - (top - dBot) * 0.45, zf + 22)); g.children[g.children.length - 1].rotation.z = PI / 2;
      if (has("p")) { g.add(at(box(W * 0.5, 120, 6, mat.rubber, 3), 0, top - 140, zf + 16)); [-0.3, -0.1, 0.1, 0.3].forEach((t) => g.add(at(box(22, 30, 3, M.lens, 1), t * W * 0.5, top - 140, zf + 20))); g.add(at(box(10, 10, 3, M.ledg, 1), W * 0.2, top - 105, zf + 20)); }
    } else {
      g.add(at(box(W - 36, Hc - 56, 4, M.liner, 1), 0, y0 + Hc / 2 + 4, zf + 1));
      drawerFace(g, W, top - 26, y0 + 40, zf + 3, f, cols, has("p"));
      g.add(lock(W / 2 - 60, top - 13, zf));
    }
    const hy = top - 90;
    if (type !== "locker") for (const sx of type === "end" ? [1] : [-1, 1]) { g.add(sideHandle(W, D, hy, sx)); g.add(at(box(14, 40, 40, mat.rubber, 5), sx * (W / 2 + 5), hy, -D / 2 + 70), at(box(14, 40, 40, mat.rubber, 5), sx * (W / 2 + 5), hy, D / 2 - 70)); }
    g.userData.yaw = type === "cab" ? -0.45 : -0.55;
    return g;
  }
  if (type === "chest" || type === "section") {
    const D = 18 * IN, Hb = (type === "chest" ? 18.6 : 20) * IN, zf = D / 2;
    g.add(blob(W + 200, D + 160, 0.4));
    g.add(at(box(W, Hb, D, mat.redp, 8), 0, Hb / 2, 0));
    g.add(at(box(W - 36, Hb - 40, 4, M.liner, 1), 0, Hb / 2, zf + 1));
    drawerFace(g, W, Hb - 18, 22, zf + 3, f, cols, false);
    if (type === "chest") { // the till and its closed lid, with the long pull and lock
      g.add(at(tray(W, D, 62, { wall: 14, r: 8, floor: 6, liner: M.liner }), 0, Hb, 0));
      g.add(at(box(W, 46, D + 6, mat.redp, 10), 0, Hb + 62 + 23, 3), at(sc(capsule(6.5, W - 140, M.alu), 1, 1, 1.3), 0, Hb + 62 + 8, D / 2 + 9), lock(W / 2 - 70, Hb + 42, zf + 4));
    } else topMat(g, W, D, Hb, []);
    for (const sx of [-1, 1]) g.add(pipe([[sx * (W / 2 + 2), Hb - 70, -110], [sx * (W / 2 + 34), Hb - 64, -90], [sx * (W / 2 + 40), Hb - 62, 0], [sx * (W / 2 + 34), Hb - 64, 90], [sx * (W / 2 + 2), Hb - 70, 110]], 9, mat.chrome, { segs: 48 }));
    g.userData.yaw = -0.42; return g;
  }
  if (type === "hutch" || type === "riser") {
    const D = 14 * IN, H = (type === "hutch" ? 18 : 32) * IN, cab = type === "hutch" ? H : 11 * IN, doors = W >= 60 * IN ? 3 : 2, side = 2.5 * IN;
    g.add(blob(W + 200, D + 160, 0.35));
    const yc = H - cab; // bottom of the cabinet
    g.add(at(box(W, cab, D, mat.redp, 8), 0, yc + cab / 2, 0));
    const dw = (W - 40) / doors;
    for (let i = 0; i < doors; i++) { const x = -W / 2 + 20 + dw * (i + 0.5); g.add(at(box(dw - 10, cab - 40, 10, mat.redp, 3), x, yc + cab / 2, D / 2 + 5), at(sc(capsule(5, dw * 0.45, M.alu), 1, 1, 1.3), x, yc + 40, D / 2 + 14)); }
    g.add(at(box(W - 60, 8, 30, M.led, 2), 0, yc - 4, D / 2 - 40)); // LED strip under the cabinet
    if (type === "riser") {
      const D2 = 25 * IN;
      g.add(at(box(W + 10, 22, D2, mat.satin, 4), 0, 11, D2 / 2 - D / 2)); // stainless work surface
      for (const sx of [-1, 1]) g.add(at(box(side, yc - 22, D, mat.redp, 6), sx * (W / 2 - side / 2), 22 + (yc - 22) / 2, 0));
      g.add(at(box(W - 2 * side, yc - 22, 8, M.dark, 2), 0, 22 + (yc - 22) / 2, -D / 2 + 6)); // back panel
      for (let x = -W / 2 + side + 40; x < W / 2 - side - 30; x += 50) for (let y = 70; y < yc - 30; y += 50) g.add(at(cyl(4, 2, M.liner, { along: "z", segs: 8 }), x, y, -D / 2 + 11));
    }
    g.userData.yaw = -0.4; return g;
  }
  // a portable metal box: lid seam, two latches, a carry handle
  const Wb = 20 * IN, Hb = 9 * IN, Db = 8.5 * IN;
  g.add(blob(Wb + 120, Db + 120, 0.35), at(box(Wb, Hb, Db, mat.redp, 8), 0, Hb / 2, 0), at(box(Wb + 2, 4, Db + 2, M.liner, 1), 0, Hb * 0.62, 0));
  for (const sx of [-1, 1]) g.add(at(box(40, 60, 10, mat.chrome, 3), sx * Wb * 0.3, Hb * 0.62, Db / 2 + 4));
  g.add(pipe([[-110, Hb, 0], [-100, Hb + 70, 0], [100, Hb + 70, 0], [110, Hb, 0]], 9, mat.chrome, { segs: 48 }));
  g.userData.yaw = -0.4; return g;
}
function serviceCart() {
  const W = 800, D = 460, cR = 50, cs = [caster(cR, 30, { brake: true }), caster(cR, 30, { brake: true }), caster(cR, 30), caster(cR, 30)];
  const y0 = cs[0].userData.h, g = group(blob(940, 600, 0.4)), px = W / 2 - 28, pz = D / 2 - 28;
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz], i) => g.add(at(cs[i], sx * px, 0, sz * pz)));
  const levels = [y0 + 40, y0 + 360, y0 + 680];
  levels.forEach((y, i) => g.add(at(tray(W, D, i === 2 ? 70 : 60, { wall: 10, r: 14, floor: 6, liner: mat.rubber }), 0, y, 0)));
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    g.add(at(cyl(15, levels[2] + 70 - y0 + 10, mat.chrome, { segs: 28 }), sx * px, y0 + (levels[2] + 70 - y0 + 10) / 2 - 5, sz * pz));
    g.add(at(cyl(18, 8, mat.rubber, { segs: 28 }), sx * px, levels[2] + 74, sz * pz));
  }
  // drawer under the top tray
  const dy = levels[2] - 50;
  g.add(at(box(W - 90, 96, D - 50, mat.redp, 4), 0, dy, -5));
  g.add(at(box(W - 110, 80, 12, mat.redp, 3), 0, dy, D / 2 - 30 + 6));
  g.add(at(sc(capsule(6, W - 200, M.alu), 1, 1, 1.3), 0, dy + 26, D / 2 - 30 + 16));
  g.add(at(box(W - 190, 4, 3, M.liner, 1), 0, dy + 16, D / 2 - 30 + 13));
  // push handle with a foam grip on the right end
  const hx = W / 2, hy = levels[2] + 60;
  g.add(pipe([[hx - 10, hy - 30, -D / 2 + 60], [hx + 60, hy + 40, -D / 2 + 70], [hx + 80, hy + 70, -120], [hx + 80, hy + 70, 120], [hx + 60, hy + 40, D / 2 - 70], [hx - 10, hy - 30, D / 2 - 60]], 11, mat.chrome, { segs: 80 }));
  g.add(at(rot(cyl(17, 200, M.foam, { along: "z", segs: 28 })), hx + 80, hy + 70, 0));
  // a few things on the top tray
  const r = ratchet(); r.position.set(-150, levels[2] + 21, 40); r.rotation.y = -0.2; g.add(r);
  [[120, 9], [170, 10.5], [220, 12]].forEach(([x, rr2]) => g.add(at(socket({ r: rr2 }), x, levels[2] + 8, -40)));
  g.userData.yaw = -0.5; return g;
}

/* ---------- sets ---------- */
function screwdriverSet() {
  const specs = [["flat", 75, 80, 10.5, "3/16"], ["phillips", 75, 80, 10.5, "#1"], ["flat", 100, 90, 11.5, "1/4"], ["phillips", 100, 90, 11.5, "#2"], ["flat", 150, 100, 12.5, "5/16"], ["phillips", 150, 100, 12.5, "#2"], ["flat", 200, 108, 13.5, "3/8"], ["phillips", 200, 108, 13.5, "#3"]];
  const sp = 38, L = specs.length * sp + 30, Yb = 232, g = group();
  specs.forEach(([tip, shaft, hlen, r], i) => {
    const x = (i - (specs.length - 1) / 2) * sp, d = screwdriver({ tip, len: hlen + shaft, hlen, r, shaftR: r * 0.25 });
    d.rotation.z = -PI / 2; d.position.set(x, Yb + hlen, 0); g.add(d);
    g.add(at(cyl(r * 0.25 + 4, 0.6, mat.hole, { segs: 24 }), x, Yb + 0.3, 0));
  });
  g.add(at(box(L, 24, 56, mat.redp, 4), 0, Yb - 12, 0));
  for (const s of [-1, 1]) g.add(at(box(14, Yb - 14, 50, mat.redp, 3), s * (L / 2 - 7), 14 + (Yb - 14) / 2 - 6, -2));
  g.add(at(box(L + 30, 14, 96, M.hdpe, 4), 0, 7, 0), at(box(L - 30, 8, 44, mat.rubber, 3), 0, 18, 0));
  const lab = plane(L - 30, 12, rowLabel(specs.map((s) => s[4]), L - 30, 12)); lab.position.set(0, Yb - 12, 28.3); g.add(lab);
  g.userData.yaw = -0.22; return g;
}
// a red tray with a black foam insert and dark cut-outs under each tool
function foamTray(w, d, pockets, { h = 34 } = {}) {
  const g = group(tray(w, d, h, { wall: 9, r: 12, floor: 5 }), at(box(w - 20, h - 12, d - 20, M.foam, 3), 0, 5 + (h - 12) / 2, 0));
  const ft = 5 + h - 12;
  pockets.forEach(([shape, x, z, ry = 0]) => g.add(at(rot(slab(shape, 0.6, 0, M.liner), 0, ry), x, ft + 0.35, z)));
  g.userData.top = ft; return g;
}
function pliersSet() {
  const kinds = [["slip", false, 51], ["needle", false, 78], ["diag", false, 36], ["slip", true, 51]];
  const sp = 74, n = kinds.length, ft = 5 + 34 - 12, pockets = [], tools = [];
  const handlePk = poly([[-6, 20], [60, 27], [118, 36], [146, 38], [149, 12], [118, 8], [60, 2], [40, 0], [60, -2], [118, -8], [149, -12], [146, -38], [118, -36], [60, -27], [-6, -20]]);
  kinds.forEach(([jaw, pump, Lj], i) => {
    const z = (i - (n - 1) / 2) * sp, p = pliers({ jaw, pump }); p.position.set(0, ft + 4.2, z); tools.push(p);
    pockets.push([handlePk, 0, z]);
    const jp = poly([[10, 18], [-Lj * 0.5, 14], [-Lj - 9, 6], [-Lj - 9, -6], [-Lj * 0.5, -14], [10, -18]]);
    if (pump) { pockets.push([jp, 0, z - 11, -0.5], [jp, 0, z + 11, 0.5]); } else pockets.push([jp, 0, z]);
  });
  const g = group(at(foamTray(290, n * sp + 26, pockets), 30, 0, 0)); tools.forEach((t) => { t.position.x -= 0; g.add(t); });
  g.children[0].children.slice(2).forEach((pk) => { pk.position.x -= 30; });
  g.userData.yaw = -0.3; return g;
}
function pickSet() {
  const shapes = ["straight", "45", "hook", "complex"], sp = 36, n = shapes.length, ft = 5 + 34 - 12, pockets = [], tools = [];
  shapes.forEach((s, i) => {
    const z = (i - (n - 1) / 2) * sp, p = pick({ shape: s }); p.position.set(-110, ft + 7.5, z); tools.push(p);
    pockets.push([rrect(108, 30, 11), -110 + 46, z], [rrect(136, 12, 5), -110 + 160, z], [rrect(40, 30, 8), -110 + 214, z + 6]);
  });
  const g = group(foamTray(270, n * sp + 30, pockets), ...tools);
  g.userData.yaw = -0.28; return g;
}
function punchSet() {
  const front = [0.6, 0.66, 0.72, 0.78, 0.84, 0.9], back = [0.74, 0.8, 0.86, 0.92, 0.98], W = 250, g = group();
  const fl = ["1/16", "3/32", "1/8", "5/32", "3/16", "1/4"], bl = ["1/4", "5/16", "3/8", "1/2", "5/8"];
  g.add(at(box(W + 20, 10, 130, M.hdpe, 3), 0, 5, -2)); // base
  g.add(at(box(W, 42, 52, mat.redp, 4), 0, 10 + 21, 30), at(box(W, 90, 56, mat.redp, 4), 0, 10 + 45, -26));
  const row = (list, chisel, yTop, z, sp) => list.forEach((s, i) => {
    const x = (i - (list.length - 1) / 2) * sp, p = sc(punch({ chisel }), s);
    if (chisel) rot(p, 0, PI / 2, PI / 2); else rot(p, 0, 0, PI / 2);
    p.position.set(x, yTop - 16 * s, z); g.add(p);
    g.add(at(cyl(9.4 * s, 0.6, mat.hole, { segs: 24 }), x, yTop + 0.3, z));
  });
  row(front, false, 52, 30, 38); row(back, true, 100, -26, 46);
  g.add(at(plane(W - 20, 11, rowLabel(fl, W - 20, 11)), 0, 31, 56.3), at(plane(W - 20, 11, rowLabel(bl, W - 20, 11)), 0, 82, 2.3));
  g.userData.yaw = -0.22; return g;
}
function bitTip(kind, m) {
  if (kind === "SL") return at(box(5.6, 7, 1.1, m, 0.3), 0, 3.5, 0);
  if (kind === "PH" || kind === "PZ") return rot(at(cyl(3, 7.5, m, { segs: kind === "PH" ? 4 : 8, r2: 0.5 }), 0, 3.75, 0), 0, PI / 4);
  if (kind === "T") return at(slab(starShape(6, 1.5, 2.5), 6.4, 0.3, m), 0, 3.5, 0);
  if (kind === "SQ") return at(cyl(2.2, 7, m, { segs: 4 }), 0, 3.5, 0);
  return at(cyl(2.4, 7, m, { segs: 6 }), 0, 3.5, 0);
}
function bitSet() {
  const rows = [["SL4", "SL5", "SL6", "SL8", "PH0", "PH1", "PH2", "PH3", "PZ1", "PZ2"], ["T10", "T15", "T20", "T25", "T27", "T30", "T40", "T45", "T50", "T55"], ["H2", "H2.5", "H3", "H4", "H5", "H6", "H8", "SQ1", "SQ2", "SQ3"]];
  const sp = 14, W = 10 * sp + 18, g = group(at(box(W + 16, 8, 96, M.hdpe, 3), 0, 4, -4));
  rows.forEach((row, i) => {
    const h = 20 + i * 16, z = 26 - i * 24, top = 8 + h;
    g.add(at(box(W, h, 24, i === 1 ? mat.redp : M.dark, 3), 0, 8 + h / 2, z));
    g.add(at(plane(W - 10, 7, rowLabel(row, W - 10, 7, "#eef1f4")), 0, top - 6, z + 12.2));
    row.forEach((name, j) => {
      const x = (j - 4.5) * sp, kind = name.match(/^[A-Z]+/)[0], shank = i === 2 ? mat.oxide : mat.satin;
      g.add(at(cyl(3.67, 22, shank, { segs: 6 }), x, top + 11 - 7, z - 2));
      const t = bitTip(kind, i === 2 ? mat.oxide : mat.steel); t.position.x = x; t.position.y += top + 15; t.position.z = z - 2; g.add(t);
    });
  });
  // bit driver lying in front
  const drv = group(handle(92, 13), at(cyl(4.8, 56, mat.chrome, { along: "x" }), 120, 0, 0), at(cyl(6.5, 16, mat.chrome, { along: "x", segs: 32 }), 152, 0, 0), at(cyl(3.6, 1, mat.hole, { along: "x", segs: 6 }), 160.2, 0, 0));
  drv.position.set(-80, 13, 82); drv.rotation.y = 0.06; g.add(drv);
  g.userData.yaw = -0.26; return g;
}
function socketKit() {
  const W = 430, D = 300, H = 72, g = group(), it = 40; // insert top
  g.add(tray(W, D, H, { wall: 8, r: 20, floor: 6, m: mat.redp }));
  g.add(at(box(W - 18, it - 6, D - 18, M.hdpe, 4), 0, 6 + (it - 6) / 2, 0));
  const pk = (shape, x, z, ry = 0) => g.add(at(rot(slab(shape, 0.6, 0, M.liner), 0, ry), x, it + 0.35, z));
  // sockets standing in a row at the back
  const sizes = [8, 10, 11, 12, 13, 14, 15, 16, 17, 19]; let x = -W / 2 + 34;
  sizes.forEach((s) => { const r = s * 0.6 + 3.2; x += r; g.add(at(socket({ r, h: 22 + r * 0.55, size: String(s) }), x, it - 2, -88)); pk(circle(r + 2), x, -88); x += r + 6.5; });
  const rt = ratchet({ len: 200 }); rt.position.set(-112, it + 7.6, -20); g.add(rt);
  pk(poly([[-24, 22], [30, 12], [210, 13], [214, 0], [210, -13], [30, -12], [-24, -22]]), -112, -20);
  const e1 = extension({ len: 150 }); e1.position.set(-150, it + 8, 52); g.add(e1); pk(rrect(166, 22, 8), -150 + 82, 52);
  const e2 = extension({ len: 75 }); e2.position.set(-150, it + 8, 98); g.add(e2); pk(rrect(92, 22, 8), -150 + 45, 98);
  const ad = adapter(); ad.position.set(70, it + 8.5, 98); g.add(ad); pk(rrect(48, 24, 8), 70 + 22, 98);
  const sk = socket({ r: 12.5, deep: true, size: "21" }); rot(sk, 0, 0, PI / 2); sk.position.set(130, it + 10, 54); g.add(sk); pk(rrect(58, 28, 8), 105, 54);
  // latches, handle, hinges
  for (const s of [-1, 1]) g.add(at(box(36, 30, 9, mat.black, 3), s * 120, H - 14, D / 2 + 3), at(cyl(3, 30, mat.satin, { along: "x" }), s * 120, H - 24, D / 2 + 8.5));
  g.add(at(sc(capsule(9, 96, mat.black), 1, 0.85, 1), 0, H - 26, D / 2 + 22), at(box(10, 12, 24, mat.black, 3), -55, H - 26, D / 2 + 10), at(box(10, 12, 24, mat.black, 3), 55, H - 26, D / 2 + 10));
  // the lid, opened back past upright
  const shell = tray(W, D, 44, { wall: 8, r: 20, floor: 6, m: mat.redp });
  shell.add(at(box(W - 18, 10, D - 18, M.foam, 3), 0, 11, 0));
  const tag = plane(200, 22, canvasMat(200, 22, (x, w, h) => { txt(x, "3/8  DRIVE  ·  METRIC  6 PT", w / 2, h / 2, h * 0.55, "#e9edf1", "center", 700); }, { lit: true, transparent: true }));
  tag.rotation.x = -PI / 2; tag.position.set(0, 16.4, -40); shell.add(tag);
  for (const s of [-1, 1]) shell.add(at(box(30, 12, 9, mat.black, 3), s * 120, 38, -D / 2 - 3));
  shell.rotation.x = PI; shell.position.set(0, 44, D / 2);
  const pivot = group(shell); pivot.position.set(0, H, -D / 2); pivot.rotation.x = -1.9; g.add(pivot);
  for (const s of [-1, 1]) g.add(at(cyl(7, 46, mat.black, { along: "x" }), s * 130, H + 1, -D / 2 - 4));
  g.userData.yaw = -0.3; return g;
}

/* ---------- diagnostics ---------- */
function scopeScreen(x, W, H) {
  x.fillStyle = "#03060a"; x.fillRect(0, 0, W, H);
  const t0 = H * 0.11, b0 = H * 0.87, L = W * 0.02, R = W * 0.98;
  x.fillStyle = "#111a26"; x.fillRect(0, 0, W, t0); x.fillRect(0, b0, W, H - b0);
  [["A  5 V", "#ffd21f"], ["B  2 V", "#45e07a"], ["C  20 A", "#4aa8ff"], ["D  50 V", "#ff5a5a"]].forEach(([s, c], i) => { x.fillStyle = c; x.fillRect(W * (0.02 + i * 0.17), t0 * 0.3, W * 0.012, t0 * 0.4); txt(x, s, W * (0.04 + i * 0.17), t0 / 2, t0 * 0.46, c); });
  txt(x, "1 ms/div", W * 0.98, t0 / 2, t0 * 0.46, "#cfd6de", "right");
  x.strokeStyle = "rgba(130,150,170,0.25)"; x.lineWidth = 1;
  for (let i = 0; i <= 10; i++) { const X = L + ((R - L) * i) / 10; x.beginPath(); x.moveTo(X, t0 + 3); x.lineTo(X, b0 - 3); x.stroke(); }
  for (let j = 0; j <= 8; j++) { const Y = t0 + 3 + ((b0 - t0 - 6) * j) / 8; x.beginPath(); x.moveTo(L, Y); x.lineTo(R, Y); x.stroke(); }
  const plot = (c, f) => { x.strokeStyle = c; x.lineWidth = H * 0.009; x.shadowColor = c; x.shadowBlur = 8; x.beginPath(); for (let i = 0; i <= 600; i++) { const t = i / 600, X = L + t * (R - L), Y = t0 + (b0 - t0) * f(t); i ? x.lineTo(X, Y) : x.moveTo(X, Y); } x.stroke(); x.shadowBlur = 0; };
  plot("#ffd21f", (t) => (((t * 7) % 1) < 0.5 ? 0.12 : 0.27));
  plot("#45e07a", (t) => 0.42 + 0.07 * Math.sin(t * PI * 2 * 3.2) + 0.015 * Math.sin(t * 90));
  plot("#4aa8ff", (t) => { const p = (t * 3) % 1; return p < 0.35 ? 0.66 - p * 0.35 : 0.66; });
  plot("#ff5a5a", (t) => { const p = (t * 3 + 0.65) % 1; return p < 0.012 ? 0.86 - p * 30 : p < 0.08 ? 0.8 + 0.02 * Math.sin(p * 400) : 0.83; });
  ["Scale", "Trigger", "Cursor", "Save", "Menu"].forEach((s, i) => { x.strokeStyle = "#3a4656"; x.lineWidth = 2; rr(x, W * (0.02 + i * 0.196), b0 + (H - b0) * 0.15, W * 0.176, (H - b0) * 0.7, 6); x.stroke(); txt(x, s, W * (0.11 + i * 0.196), b0 + (H - b0) / 2, (H - b0) * 0.38, "#cfd6de", "center"); });
}
function tabletScreen(x, W, H) {
  const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "#0e1a2b"); gr.addColorStop(1, "#16304d"); x.fillStyle = gr; x.fillRect(0, 0, W, H);
  const sb = H * 0.08; x.fillStyle = "#08101b"; x.fillRect(0, 0, W, sb);
  txt(x, "10:42", W * 0.02, sb / 2, sb * 0.55, "#dfe6ee"); txt(x, "VCI ●  84%", W * 0.98, sb / 2, sb * 0.55, "#7ee2a0", "right");
  txt(x, "Vehicle  ·  2.0L  ·  Auto", W * 0.04, sb + H * 0.07, H * 0.05, "#9fb3c8", "left", 500);
  const tiles = [["Scan", "#c8102e"], ["Codes", "#e8590c"], ["Live data", "#1f6fd1"], ["Tests", "#2a9d5c"], ["Scope", "#7b4bd1"], ["Service", "#4b5563"]];
  const cw = W * 0.29, ch = H * 0.32, gx = W * 0.035, gy = sb + H * 0.14;
  tiles.forEach(([s, c], i) => {
    const X = gx + (i % 3) * (cw + gx * 0.5 + 6), Y = gy + Math.floor(i / 3) * (ch + H * 0.04);
    x.fillStyle = c; rr(x, X, Y, cw, ch, 14); x.fill();
    x.strokeStyle = "rgba(255,255,255,0.9)"; x.lineWidth = 5; x.beginPath();
    const cx = X + cw / 2, cy = Y + ch * 0.42, r = ch * 0.18;
    if (i === 0) { x.arc(cx, cy, r, 0, PI * 2); x.moveTo(cx + r * 0.7, cy + r * 0.7); x.lineTo(cx + r * 1.5, cy + r * 1.5); }
    else if (i === 1) { x.moveTo(cx, cy - r); x.lineTo(cx + r * 1.1, cy + r); x.lineTo(cx - r * 1.1, cy + r); x.closePath(); }
    else if (i === 2) { for (let k = 0; k < 4; k++) { x.moveTo(cx - r + k * r * 0.66, cy + r); x.lineTo(cx - r + k * r * 0.66, cy + r - (k + 1) * r * 0.45); } }
    else if (i === 3) { x.rect(cx - r, cy - r * 0.7, r * 2, r * 1.4); x.moveTo(cx - r * 0.4, cy); x.lineTo(cx, cy + r * 0.4); x.lineTo(cx + r * 0.6, cy - r * 0.4); }
    else if (i === 4) { x.moveTo(cx - r * 1.3, cy); for (let k = 0; k <= 20; k++) x.lineTo(cx - r * 1.3 + (k * r * 2.6) / 20, cy - Math.sin(k * 0.65) * r * 0.8); }
    else { x.arc(cx, cy, r * 0.9, 0, PI * 2); x.moveTo(cx + r * 0.35, cy); x.arc(cx, cy, r * 0.35, 0, PI * 2); }
    x.stroke(); txt(x, s, cx, Y + ch * 0.82, ch * 0.15, "#fff", "center", 700);
  });
}
function handheldScreen(x, W, H) {
  x.fillStyle = "#0d1724"; x.fillRect(0, 0, W, H);
  x.fillStyle = "#b3000f"; x.fillRect(0, 0, W, H * 0.17); txt(x, "CODES  (3)", W * 0.05, H * 0.085, H * 0.1, "#fff", "left", 700); txt(x, "1/3", W * 0.95, H * 0.085, H * 0.09, "#fff", "right");
  [["P0301", "Cyl 1 misfire"], ["P0171", "System lean B1"], ["P0420", "Catalyst B1"]].forEach(([c, d], i) => {
    const Y = H * (0.27 + i * 0.2); if (i === 0) { x.fillStyle = "#1f3550"; x.fillRect(0, Y - H * 0.09, W, H * 0.18); }
    txt(x, c, W * 0.05, Y, H * 0.11, "#ffd21f", "left", 700); txt(x, d, W * 0.4, Y, H * 0.085, "#dfe6ee", "left", 500);
  });
  x.fillStyle = "#16212f"; x.fillRect(0, H * 0.86, W, H * 0.14); txt(x, "Y  Freeze frame     N  Back", W / 2, H * 0.93, H * 0.075, "#9fb3c8", "center");
}
function batteryScreen(x, W, H) {
  x.fillStyle = "#0b1218"; x.fillRect(0, 0, W, H);
  txt(x, "12.64", W * 0.06, H * 0.36, H * 0.4, "#f4f7fa", "left", 700); txt(x, "V", W * 0.72, H * 0.42, H * 0.18, "#9fb3c8", "left", 700);
  txt(x, "CCA  642 / 600", W * 0.06, H * 0.68, H * 0.12, "#cfd6de", "left", 600);
  x.fillStyle = "#1f9d55"; rr(x, W * 0.06, H * 0.79, W * 0.88, H * 0.14, 6); x.fill(); txt(x, "GOOD BATTERY", W / 2, H * 0.86, H * 0.09, "#fff", "center", 700);
}
function boreScreen(x, W, H) {
  x.fillStyle = "#050607"; x.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H * 0.5, r = H * 0.44;
  const g = x.createRadialGradient(cx - r * 0.15, cy - r * 0.1, r * 0.05, cx, cy, r);
  g.addColorStop(0, "#2a1d12"); g.addColorStop(0.45, "#6b4a2a"); g.addColorStop(0.8, "#b58a55"); g.addColorStop(1, "#e2c08a");
  x.save(); x.beginPath(); x.arc(cx, cy, r, 0, PI * 2); x.clip(); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = "rgba(40,25,10,0.55)"; x.lineWidth = 3; for (let k = 1; k < 6; k++) { x.beginPath(); x.ellipse(cx, cy, r * k * 0.17, r * k * 0.15, 0, 0, PI * 2); x.stroke(); }
  x.fillStyle = "rgba(255,240,210,0.35)"; x.beginPath(); x.ellipse(cx - r * 0.45, cy - r * 0.3, r * 0.22, r * 0.08, -0.6, 0, PI * 2); x.fill(); x.restore();
  txt(x, "LED ▮▮▮▯", W * 0.03, H * 0.08, H * 0.07, "#e6edf3"); txt(x, "1.5x", W * 0.97, H * 0.08, H * 0.07, "#e6edf3", "right");
}
// a slab device lying face up (rubber body, red face shell); returns the group plus the face height
function deviceBody(w, l, t, { r = 18, face = mat.redp, body = mat.rubber } = {}) {
  return group(at(slab(rrect(w, l, r), t - 8, 2, body), 0, (t - 4) / 2, 0), at(slab(rrect(w - 10, l - 10, r - 4), 4, 1.2, face), 0, t - 3.2, 0));
}
function screenOn(g, w, h, draw, x, y, z) { // bezel, picture and a faint glass sheen, face up
  g.add(at(slab(rrect(w + 10, h + 10, 6), 1.5, 0.5, mat.gloss), x, y + 0.8, z));
  g.add(at(up(plane(w, h, canvasMat(w, h, draw))), x, y + 2.1, z), at(up(plane(w + 4, h + 4, M.glass)), x, y + 2.3, z));
}
function probe(m, len = 100) { // a test lead probe lying along +x, the cable entering at x = 0
  return group(
    at(cyl(3.4, 16, m, { along: "x", r2: 5.2 }), 8, 0, 0),
    at(capsule(5.6, len * 0.55, m), 16 + len * 0.275 + 4, 0, 0),
    at(cyl(8.5, 3, m, { along: "x", segs: 28 }), 24 + len * 0.55, 0, 0),
    at(cyl(2.6, 10, m, { along: "x", r2: 1.8 }), 30 + len * 0.55, 0, 0),
    at(cyl(1.3, 22, mat.chrome, { along: "x", r2: 0.25 }), 46 + len * 0.55, 0, 0),
  );
}
function gator(m) { // alligator clip lying along +x, cable at x = 0
  const jaw = (y, s) => at(rot(slab(poly([[0, -5.5], [36, -3.2], [42, 0], [36, 3.2], [0, 5.5]]), 2, 0.5, mat.steel), 0, 0, s * 0.12), 40, y, 0);
  return group(at(sc(capsule(7, 30, m), 1, 0.75, 1.05), 22, 5.5, 0), jaw(9, 1), jaw(4, -1), at(cyl(1.8, 14, mat.steel, { along: "z" }), 44, 6.5, 0));
}
const lay = (o, p, dir) => { o.position.copy(V(p)); o.rotation.y = Math.atan2(-dir[1], dir[0]); return o; }; // place along a floor direction [dx, dz]
// stand a face-up device on its edge, tipped back by a, with a fold-out stand behind it
function propped(unit, a, { W, L, T }) {
  unit.rotation.x = a; unit.updateMatrixWorld(true);
  const floor = new THREE.Box3().setFromObject(unit).min.y, g = group(unit), feet = [];
  for (const s of [-1, 1]) {
    const p = V([s * (W / 2 - 40), 2, -L / 2 + 40]).applyMatrix4(unit.matrix), f = V([p.x, floor + 4, p.z - (p.y - floor) * 0.55]);
    g.add(rod(p, f, 4, mat.satin), at(sphere(5.5, mat.rubber), f.x, f.y, f.z)); feet.push(f);
  }
  g.add(rod(feet[0], feet[1], 3.2, mat.satin));
  return { g, floor, w: (v) => V(v).applyMatrix4(unit.matrix) };
}
function labScope() {
  const W = 270, L = 185, T = 36, u = group();
  u.add(at(slab(rrect(W - 6, L - 6, 16), T - 4, 2, M.dark), 0, 0, 0));
  u.add(at(slab(frameShape(W + 16, L + 16, 24, 22), T + 4, 2, M.redrub), 0, 0, 0)); // rubber boot
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) u.add(at(slab(rrect(46, 46, 16), T + 8, 2, M.redrub), sx * (W / 2 - 12), 0, sz * (L / 2 - 12)));
  screenOn(u, W - 48, L - 64, scopeScreen, 0, T / 2, -10);
  for (let i = 0; i < 5; i++) u.add(at(cyl(6, 3, mat.grey, { segs: 24 }), -76 + i * 30, T / 2 + 1.5, L / 2 - 22));
  u.add(at(cyl(6.5, 3, M.green, { segs: 24 }), 100, T / 2 + 1.5, L / 2 - 22));
  // four channel inputs on the sides
  const ch = [[1, -40, mat.yellow], [1, 20, M.green], [-1, -40, mat.blue], [-1, 20, mat.red]];
  ch.forEach(([s, z, m]) => u.add(at(cyl(6, 16, mat.chrome, { along: "x", segs: 24 }), s * (W / 2 + 14), 0, z), at(cyl(8, 4, m, { along: "x", segs: 24 }), s * (W / 2 + 9), 0, z)));
  const { g, floor, w } = propped(u, 0.86, { W, L, T });
  // two leads out of the right side, down to the bench and round to the front, ending in probes
  [[-40, mat.yellow, 0], [20, M.green, 1]].forEach(([z, m, k]) => {
    const p = w([W / 2 + 22, 0, z]), y = floor + 5.6, e = [p.x + 30 + k * 40, y, 175 + k * 26];
    g.add(at(rot(cyl(4.5, 14, m, { along: "x" })), p.x + 4, p.y, p.z));
    g.add(pipe([[p.x + 6, p.y, p.z], [p.x + 40, p.y - 6, p.z + 6], [p.x + 80 + k * 30, (p.y + y) / 2, p.z + 40], [p.x + 110 + k * 40, y, p.z + 120], [p.x + 100 + k * 50, y, e[2] - 10], e], 3.4, mat.rubber));
    g.add(lay(probe(m), e, [-1, 0.25 - k * 0.2]));
  });
  g.userData.yaw = -0.38; return g;
}
function scanTablet() {
  const W = 300, L = 205, T = 28, u = group();
  u.add(at(slab(rrect(W - 4, L - 4, 18), T - 4, 2, mat.redp), 0, 0, 0));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) u.add(at(slab(rrect(44, 44, 16), T + 4, 3, mat.rubber), sx * (W / 2 - 14), 0, sz * (L / 2 - 14)));
  for (const s of [-1, 1]) u.add(at(slab(rrect(10, L - 90, 4), T, 2, mat.rubber), s * (W / 2 + 1), 0, 0));
  u.add(at(slab(rrect(W - 30, L - 30, 10), 1.5, 0.5, mat.gloss), 0, T / 2 + 0.8, 0));
  u.add(at(up(plane(W - 52, L - 52, canvasMat(W - 52, L - 52, tabletScreen))), 0, T / 2 + 2.1, 0), at(up(plane(W - 46, L - 46, M.glass)), 0, T / 2 + 2.3, 0));
  u.add(at(sphere(2.2, mat.lens), 0, T / 2 + 1.6, -L / 2 + 22)); // camera
  u.add(at(box(26, 8, 6, mat.grey, 2), W / 2 - 70, 0, -L / 2 - 2)); // power key on the top edge
  const { g, floor } = propped(u, 0.9, { W, L, T });
  // the wireless vehicle interface on the bench beside it
  const vci = group(at(box(74, 26, 44, mat.redp, 8), 0, 13, 0), at(box(76, 10, 46, mat.rubber, 4), 0, 5, 0), at(slab(poly([[-20, -9], [20, -9], [16, 9], [-16, 9]]), 12, 2, mat.black), 46, 13, 0));
  vci.children[2].rotation.set(0, 0, PI / 2); vci.add(at(sphere(2.4, M.ledg), -18, 26.5, 10), at(sphere(2.4, M.ledg), -8, 26.5, 10));
  vci.position.set(W / 2 + 40, floor, 170); vci.rotation.y = -0.5; g.add(vci);
  g.userData.yaw = -0.36; return g;
}
function obdPlug() { // the 16-pin plug, lying flat with its face toward -x
  const face = poly([[-22, -10], [22, -10], [17, 10], [-17, 10]]);
  const p = group(at(rot(prism(face, 18, 2, mat.black), 0, PI / 2), 9, 11, 0), at(box(34, 22, 40, mat.redp, 6), 34, 12, 0), at(cyl(5, 26, mat.rubber, { along: "x", r2: 7 }), 60, 11, 0));
  for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2 === 0) p.add(at(box(0.6, 2.4, 2.4, mat.hole, 0.2), -1.4, 7 + j * 7, -14 + i * 4));
  return p;
}
function handheldScanner() {
  const g = deviceBody(108, 200, 36, { r: 24 }), t = 36;
  screenOn(g, 76, 60, handheldScreen, 0, t, -42);
  g.add(at(cyl(17, 3, mat.black, { segs: 32 }), 0, t + 1.5, 28), at(cyl(7, 4, mat.satin, { segs: 24 }), 0, t + 2.5, 28));
  [[0, -11], [0, 11], [-11, 0], [11, 0]].forEach(([dx, dz]) => g.add(at(rot(cyl(3, 3, mat.grey, { segs: 3 }), 0, Math.atan2(dx, -dz) + PI), dx, t + 3.2, 28 + dz)));
  g.add(at(cyl(7.5, 4, M.green, { segs: 24 }), -30, t + 2, 66), at(cyl(7.5, 4, mat.red, { segs: 24 }), 30, t + 2, 66));
  g.add(at(box(14, 5, 6, mat.grey, 2), -32, t + 1.5, 6), at(box(14, 5, 6, mat.grey, 2), 32, t + 1.5, 6));
  // cable out of the top to the plug lying on the bench
  g.add(at(cyl(7, 18, mat.rubber, { along: "z" }), 0, 18, -106));
  g.add(pipe([[0, 18, -112], [0, 12, -150], [40, 7, -190], [130, 7, -170], [175, 7, -100], [175, 11, -40]], 5, mat.rubber));
  const plug = obdPlug(); plug.rotation.y = PI / 2; plug.position.set(175, 0, 33); g.add(plug);
  g.userData.yaw = -0.3; return g;
}
// SOLUS+ / SOLUS Edge / ETHOS (EESC, EETH): a wide black tablet with ribbed rubber grips at the ends, red accents
// on the top and bottom edge, a light home screen and the keys in a column on the right; propped up like a tablet
function solusScreen(x, W, H) {
  x.fillStyle = "#eef1f4"; x.fillRect(0, 0, W, H);
  x.fillStyle = "#dfe3e8"; x.fillRect(0, 0, W, H * 0.06); txt(x, "10:53 AM", W * 0.97, H * 0.03, H * 0.035, "#4b5563", "right");
  ["Scanner", "OBD-II/EOBD", "Quick Lookups", "Previous Vehicles", "Training", "Tools"].forEach((s, i) => {
    const cx = W * (0.25 + (i % 3) * 0.25), cy = H * (0.36 + Math.floor(i / 3) * 0.32), r = H * 0.06;
    x.fillStyle = "#1f3a5a"; rr(x, cx - r * 1.2, cy - r, r * 2.4, r * 1.7, 4); x.fill();
    txt(x, s, cx, cy + H * 0.11, H * 0.035, "#4b5563", "center", 500);
  });
}
function solusScanner() {
  const W = 300, L = 176, T = 30, u = group();
  u.add(at(slab(rrect(W - 20, L, 16), T - 6, 2, mat.rubber), 0, 0, 0));
  for (const s of [-1, 1]) { // the ribbed grips at each end
    u.add(at(slab(rrect(30, L - 10, 12), T + 2, 3, mat.rubber), s * (W / 2 - 14), 0, 0));
    for (let i = 0; i < 7; i++) u.add(at(box(6, T - 6, 12, mat.black, 2), s * (W / 2 + 1), 0, -54 + i * 18));
  }
  for (const s of [-1, 1]) u.add(at(box(150, T - 10, 6, mat.redp, 2.5), -10, 0, s * (L / 2 + 1))); // red accents top and bottom
  u.add(at(slab(rrect(W - 60, L - 24, 8), 1.5, 0.5, mat.gloss), -4, T / 2 - 2, 0));
  u.add(at(up(plane(170, 104, canvasMat(170, 104, solusScreen))), -18, T / 2 + 0.2, 4), at(up(plane(176, 110, M.glass)), -18, T / 2 + 0.4, 4));
  u.add(at(up(plane(40, 8, label("SOLUS+", 40, 8, { color: "#f1f3f5", font: "800 80px Helvetica, Arial, sans-serif" }))), -18, T / 2 + 0.3, -60));
  u.add(at(up(plane(48, 10, label("Snap-on", 48, 10, { color: "#e3262f", font: "italic 900 80px Helvetica, Arial, sans-serif" }))), -18, T / 2 + 0.3, 66));
  const kx = W / 2 - 54; // keys: Y/N, the D-pad, the shortcut key and power
  u.add(at(cyl(14, 3, mat.black, { segs: 32 }), kx, T / 2 - 0.5, -24), at(cyl(5, 4, mat.satin, { segs: 20 }), kx, T / 2, -24));
  u.add(at(cyl(5, 3, mat.black, { segs: 20 }), kx - 7, T / 2 - 0.5, -56), at(cyl(5, 3, mat.black, { segs: 20 }), kx + 7, T / 2 - 0.5, -56));
  u.add(at(cyl(8, 3, mat.black, { segs: 24 }), kx, T / 2 - 0.5, 16), at(cyl(8, 3, mat.black, { segs: 24 }), kx, T / 2 - 0.5, 52));
  u.add(at(cyl(3, 3.6, mat.grey, { segs: 16 }), kx, T / 2, 16), at(cyl(3, 3.6, mat.grey, { segs: 16 }), kx, T / 2, 52));
  const { g } = propped(u, 0.9, { W: W - 40, L, T });
  g.userData.yaw = -0.3; return g;
}
function kelvinClamp(m) { // battery clamp lying flat, jaws toward +x, cable at x = 0
  const half = (s) => group(
    at(rot(sc(capsule(9, 62, m), 1, 0.7, 1), 0, s * 0.16), 40, 8, s * 9),
    at(rot(slab(poly([[0, -6], [38, -4], [46, 0], [38, 4], [0, 6]]), 4, 0.8, mat.copper), 0, -s * 0.14), 84, 8 + s * 1.5, s * 3),
  );
  return group(half(1), half(-1), at(cyl(6, 22, mat.steel, { along: "z" }), 80, 8, 0), at(cyl(4, 14, m, { along: "x", r2: 7 }), 6, 8, 0));
}
function batteryTester() {
  const g = deviceBody(124, 176, 40, { r: 20 }), t = 40;
  screenOn(g, 92, 58, batteryScreen, 0, t, -38);
  [-36, -12, 12, 36].forEach((x, i) => g.add(at(box(18, 5, 12, i === 3 ? M.green : mat.grey, 2.5), x, t + 1.5, 20)));
  g.add(at(cyl(13, 4, mat.black, { segs: 32 }), 0, t + 2, 54), at(cyl(5, 5, mat.satin, { segs: 24 }), 0, t + 3, 54));
  for (const [s, m] of [[-1, mat.red], [1, mat.black]]) {
    g.add(at(cyl(8, 16, m, { along: "z" }), s * 34, 20, -94));
    g.add(pipe([[s * 34, 20, -100], [s * 40, 12, -140], [s * 110, 9, -150], [s * 165, 9, -90], [s * 172, 9, -10]], 5.5, m === mat.red ? M.redrub : mat.rubber));
    const c = kelvinClamp(m); c.rotation.y = -PI / 2; c.position.set(s * 172, 0, -16); g.add(c);
  }
  g.userData.yaw = -0.3; return g;
}
function borescope() {
  const g = group(deviceBody(118, 100, 30, { r: 16 }), at(deviceBody(54, 140, 32, { r: 22 }), 0, 0, 104));
  screenOn(g, 92, 70, boreScreen, 0, 30, -2);
  [[0, 82, M.green], [-12, 108, mat.grey], [12, 108, mat.grey]].forEach(([x, z, m]) => g.add(at(cyl(5.5, 4, m, { segs: 24 }), x, 33, z)));
  g.add(at(cyl(7, 18, mat.rubber, { along: "z", r2: 4.5 }), 0, 16, 180));
  const y = 4.5, pts = [[0, 16, 188], [6, 10, 228], [90, y, 255], [200, y, 195], [232, y, 60], [190, y, -80], [60, y, -125], [-90, y, -110], [-155, y, 0], [-150, y, 120], [-112, y, 168]];
  g.add(pipe(pts, 4, mat.oxide, { segs: 160, radial: 10 }));
  const tip = group(at(cyl(5.5, 30, mat.chrome, { along: "x", segs: 28 }), -15, 0, 0), at(cyl(3, 1, M.lens, { along: "x", segs: 24 }), -30.4, 0, 0));
  for (let i = 0; i < 4; i++) { const a = (i * PI) / 2 + PI / 4; tip.add(at(sphere(0.9, M.led), -30.4, Math.sin(a) * 4.3, Math.cos(a) * 4.3)); }
  tip.position.set(-112, y + 1, 168); tip.rotation.y = Math.atan2(0.78, -0.62); g.add(tip);
  g.userData.yaw = -0.3; return g;
}
function dmmLcd(x, W, H) {
  x.fillStyle = "#a7b19a"; x.fillRect(0, 0, W, H);
  txt(x, "12.68", W * 0.93, H * 0.56, H * 0.7, "#1a1f17", "right", 700); txt(x, "DC", W * 0.05, H * 0.22, H * 0.17, "#1a1f17", "left", 700);
  txt(x, "AUTO", W * 0.05, H * 0.8, H * 0.14, "#1a1f17", "left", 700); txt(x, "V", W * 0.96, H * 0.18, H * 0.15, "#1a1f17", "right", 700);
}
function dmmDial(x, W, H) {
  const cx = W / 2, cy = H / 2, r = W * 0.36, marks = ["OFF", "V~", "V⎓", "mV", "Ω", "·)))", "A", "mA", "µA"];
  marks.forEach((s, i) => {
    const a = -PI * 0.75 + (i * PI * 1.5) / (marks.length - 1) - PI / 2;
    x.strokeStyle = "#e9edf1"; x.lineWidth = 5; x.beginPath(); x.moveTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8); x.lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95); x.stroke();
    txt(x, s, cx + Math.cos(a) * r * 1.2, cy + Math.sin(a) * r * 1.2, W * 0.06, i === 0 ? "#ff6a6a" : "#e9edf1", "center", 700);
  });
}
function multimeter() {
  const g = group(at(slab(rrect(100, 196, 20), 44, 3, M.redrub), 0, 25, 0), at(slab(rrect(84, 178, 12), 4, 1, M.dark), 0, 49, 0)), t = 52;
  g.add(at(slab(rrect(72, 40, 4), 1.2, 0.4, mat.gloss), 0, t + 0.6, -56), at(up(plane(64, 32, canvasMat(64, 32, dmmLcd))), 0, t + 1.9, -56), at(up(plane(66, 34, M.glass)), 0, t + 2.1, -56));
  [-27, -9, 9, 27].forEach((x, i) => g.add(at(box(13, 4, 7, i === 0 ? mat.yellow : mat.grey, 2), x, t + 1, -26)));
  g.add(at(up(plane(76, 76, canvasMat(76, 76, dmmDial, { transparent: true }))), 0, t + 0.3, 20));
  g.add(at(turned([[0.1, 0], [22, 0], [23, 2], [22, 8], [0.1, 9]], mat.black, { along: "y", segs: 40 }), 0, t, 20));
  g.add(at(rot(box(40, 7, 9, mat.black, 3), 0, -0.6), 0, t + 10, 20), at(rot(box(14, 1, 2, mat.white, 0.4), 0, -0.6), 9, t + 13.7, 20 - 6.8));
  const jacks = [[-30, mat.red], [-10, mat.red], [10, mat.black], [30, mat.red]];
  jacks.forEach(([x, m]) => g.add(at(cyl(6, 2, m, { segs: 24 }), x, t + 1, 72), at(cyl(2.6, 1, mat.hole, { segs: 16 }), x, t + 2.1, 72)));
  // red lead from V, black lead from COM, probes lying in front
  for (const [x, m, s] of [[-10, mat.red, -1], [10, mat.black, 1]]) {
    g.add(at(cyl(5.4, 16, m, { segs: 24 }), x, t + 9, 72), at(cyl(3.6, 8, m, { segs: 20, r2: 2.6 }), x, t + 20, 72));
    const e = [s * 70, 5.6, 210];
    g.add(pipe([[x, t + 24, 72], [x, t + 26, 92], [x + s * 10, 26, 118], [s * 40 + x, 5.6, 170], [s * 150, 5.6, 175], [s * 150, 5.6, 230], e], 2.4, m === mat.red ? M.redrub : mat.rubber, { segs: 128 }));
    g.add(lay(probe(m, 96), e, [-s, -0.1]));
  }
  g.userData.yaw = -0.25; return g;
}
function testLight() {
  const g = group(
    at(turned([[0.1, 0], [8, 0], [9.5, 3], [9.5, 16], [0.1, 16]], mat.black), 0, 9.5, 0), // end cap
    at(turned([[9.5, 0], [10.5, 6], [10.5, 70], [9, 82], [0.1, 82]], mat.red, { flutes: 6, flute: 0.04 }), 16, 10.5, 0),
    at(turned([[9, 0], [9, 26], [6, 34], [0.1, 34]], mat.clear), 96, 10.5, 0), // clear window
    at(sphere(4.5, M.led), 108, 10.5, 0),
    at(turned([[6, 0], [6, 6], [3, 10], [0.1, 10]], mat.chrome), 130, 10.5, 0),
    at(cyl(1.6, 64, mat.steel, { along: "x", r2: 0.3 }), 170, 10.5, 0),
  );
  for (let i = 0; i < 6; i++) g.add(at(cyl(10.8, 2, mat.black, { along: "x" }), 30 + i * 8, 10.5, 0));
  // coiled cord running back to an alligator clip
  const pts = [[0, 9.5, 0], [-12, 8, 0]]; const R = 7.5, n = 22;
  for (let i = 0; i <= n * 6; i++) { const a = (i / 6) * PI * 2, x = -20 - (i / 6) * 7.5; pts.push([x, 9.5 + Math.sin(a) * R, Math.cos(a) * R]); }
  pts.push([-20 - n * 7.5 - 20, 6, 10], [-20 - n * 7.5 - 40, 5.5, 26]);
  g.add(pipe(pts, 2.2, mat.red, { segs: 900, radial: 10 }));
  const cl = gator(mat.black); cl.position.set(-20 - n * 7.5 - 40, 0, 26); cl.rotation.y = PI - 0.6; g.add(cl);
  g.userData.yaw = -0.25; return g;
}

/* ---------- general and other ---------- */
function rulerTape(x, W, H) {
  x.fillStyle = "#f2c200"; x.fillRect(0, 0, W, H); x.fillStyle = "#14161a";
  const cm = W / 15;
  for (let i = 0; i <= 150; i++) { const X = i * (cm / 10), h = i % 10 === 0 ? 0.36 : i % 5 === 0 ? 0.24 : 0.14; x.fillRect(X - 1, 0, 2, H * h); x.fillRect(X - 1, H * (1 - h), 2, H * h); }
  for (let i = 1; i < 15; i++) txt(x, String(i), i * cm, H * 0.55, H * 0.32, i % 10 === 0 ? "#c8102e" : "#14161a", "center", 700);
}
function tapeMeasure() {
  const S = 80, T = 44, cy = S / 2 + 3, g = group(
    at(prism(rrect(S - 4, S - 4, 18), T - 10, 3, mat.redp), 0, cy, 0),
    at(prism(frameShape(S + 4, S + 4, 22, 13), T - 2, 2, mat.rubber), 0, cy, 0),
    at(cyl(24, 3, mat.rubber, { along: "z", segs: 40 }), 0, cy, T / 2 - 0.5), at(cyl(4.2, 2, mat.chrome, { along: "z", segs: 6 }), 0, cy, T / 2 + 1.5),
    at(cyl(24, 3, mat.rubber, { along: "z", segs: 40 }), 0, cy, -T / 2 + 0.5),
  );
  const badge = plane(30, 9, label("8m / 26ft", 30, 9, { color: "#e9edf1", font: "700 80px Helvetica, Arial, sans-serif" })); badge.position.set(0, cy - 12, T / 2 + 1.1); g.add(badge);
  [[-27, 27], [27, 27], [-27, -27]].forEach(([dx, dy]) => g.add(at(cyl(2.4, 1.6, mat.chrome, { along: "z", segs: 6 }), dx, cy + dy, T / 2 - 2.6)));
  g.add(at(box(14, 10, 18, mat.black, 3), 22, S + 3, 0), at(box(10, 3, 12, mat.red, 1), 22, S + 8.5, 0)); // blade lock
  g.add(at(box(14, 66, 4, mat.satin, 1.5), -4, cy + 2, -T / 2 - 4), at(box(14, 6, 8, mat.satin, 1.5), -4, cy + 34, -T / 2 - 1)); // belt clip
  g.add(at(box(10, 10, 32, mat.chrome, 2), S / 2 + 2, 9, 0), at(box(3, 3, 26, mat.hole, 0.5), S / 2 + 7, 8, 0)); // blade exit
  const blade = group(at(box(150, 0.8, 26, mat.yellow, 0.3), 75, 0, 0), at(up(plane(150, 26, canvasMat(150, 26, rulerTape, { lit: true, px: 1024 }))), 75, 0.45, 0));
  blade.add(at(box(1.6, 13, 28, mat.chrome, 0.5), 151, 5.5, 0), at(box(8, 1.2, 28, mat.chrome, 0.4), 147, -0.4, 0));
  blade.position.set(S / 2 + 6, 7.5, 0); blade.rotation.z = -0.045; g.add(blade);
  g.userData.yaw = -0.5; return g;
}
function closedCase() {
  const W = 440, D = 310, Hb = 72, Hl = 50, g = group(
    at(slab(rrect(W - 8, D - 8, 24), Hb - 8, 4, mat.redp), 0, Hb / 2, 0),
    at(slab(rrect(W - 16, D - 16, 20), 4, 1, mat.black), 0, Hb + 2, 0),
    at(slab(rrect(W - 8, D - 8, 24), Hl - 12, 6, mat.redp), 0, Hb + 4 + Hl / 2, 0),
    at(slab(rrect(W - 120, D - 110, 18), 6, 3, mat.redp), 0, Hb + 4 + Hl + 1, -6), // raised lid panel
  );
  for (const z of [-60, 0, 60]) g.add(at(sc(capsule(5, W - 190, mat.redp), 1, 0.6, 1), 0, Hb + Hl + 12, z - 6));
  for (const s of [-1, 1]) {
    g.add(at(box(40, 46, 10, mat.black, 3), s * 130, Hb + 2, D / 2 + 2), at(cyl(3.2, 34, mat.satin, { along: "x" }), s * 130, Hb - 12, D / 2 + 8), at(box(24, 8, 4, mat.satin, 1.5), s * 130, Hb + 14, D / 2 + 7.4));
    g.add(at(cyl(8, 52, mat.black, { along: "x" }), s * 120, Hb + 2, -D / 2 - 2));
  }
  g.add(at(sc(capsule(10, 100, mat.black), 1, 0.8, 1), 0, Hb + 20, D / 2 + 26), at(box(12, 14, 30, mat.black, 3), -58, Hb + 20, D / 2 + 10), at(box(12, 14, 30, mat.black, 3), 58, Hb + 20, D / 2 + 10));
  const tag = plane(110, 20, canvasMat(110, 20, (x, w, h) => { x.fillStyle = "#cfd5dc"; rr(x, 2, 2, w - 4, h - 4, 10); x.fill(); txt(x, "SAE · METRIC", w / 2, h / 2, h * 0.42, "#20252c", "center", 700); }, { lit: true, transparent: true }));
  up(tag); tag.position.set(0, Hb + Hl + 8.4, 60); g.add(tag);
  g.userData.yaw = -0.32; return g;
}

/* ---------- shop extras ---------- */
function creeper() {
  const L = 1000, Wd = 440, cR = 30, g = group(blob(1100, 520, 0.4)), cs = caster(cR, 20, { lite: true }), y0 = cs.userData.h;
  [[-1, -1], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 1]].forEach(([sx, sz], i) => g.add(at(i ? caster(cR, 20, { lite: true }) : cs, sx * (L / 2 - 70), 0, sz * (Wd / 2 - 70))));
  g.add(at(slab(rrect(L - 20, Wd - 60, 30), 8, 2, mat.redp), 0, y0 + 6, 0)); // steel deck
  g.add(pipe([[-L / 2, 0, -Wd / 2 + 40], [-L / 2 + 40, 0, -Wd / 2], [L / 2 - 40, 0, -Wd / 2], [L / 2, 0, -Wd / 2 + 40], [L / 2, 0, Wd / 2 - 40], [L / 2 - 40, 0, Wd / 2], [-L / 2 + 40, 0, Wd / 2], [-L / 2, 0, Wd / 2 - 40]].map(([x, , z]) => [x, y0 + 12, z]), 12, mat.redp, { closed: true, segs: 160 }));
  // padded cushions: three body pads and a raised headrest
  const yp = y0 + 14;
  [[-160, 330], [175, 330]].forEach(([x, l]) => g.add(at(slab(rrect(l, Wd - 70, 40), 26, 12, M.vinyl), x, yp + 19, 0)));
  g.add(at(slab(rrect(150, Wd - 120, 50), 34, 16, M.vinyl), L / 2 - 105, yp + 25, 0));
  g.add(at(slab(rrect(120, Wd - 90, 40), 22, 10, M.vinyl), -L / 2 + 75, yp + 17, 0));
  for (const s of [-1, 1]) g.add(at(box(L - 80, 3, 4, mat.redp, 1), 0, yp + 34, s * (Wd / 2 - 38))); // piping
  g.userData.yaw = -0.4; return g;
}
function stool() {
  const g = group(blob(700, 700, 0.35)), cR = 30, n = 5, legR = 290, cy = caster(cR, 22).userData.h;
  for (let i = 0; i < n; i++) {
    const a = (i * PI * 2) / n + PI / 10, c = Math.cos(a), s = Math.sin(a);
    const leg = at(box(legR - 30, 26, 46, mat.redp, 6), (c * (legR + 30)) / 2, cy + 13, (-s * (legR + 30)) / 2); leg.rotation.y = a; g.add(leg);
    g.add(at(box(60, 30, 50, mat.black, 8), c * (legR - 10), cy + 15, -s * (legR - 10)));
    const k = caster(cR, 22); k.position.set(c * legR, 0, -s * legR); k.rotation.y = a; g.add(k);
  }
  g.add(at(turned([[0.1, 0], [62, 0], [56, 30], [36, 46], [0.1, 48]], mat.black, { along: "y", segs: 40 }), 0, cy - 2, 0));
  // round tool tray around the column
  g.add(at(turned([[0.1, 0], [190, 0], [205, 38], [210, 42], [212, 40], [198, 4], [195, 4], [0.1, 4]], mat.redp, { along: "y", segs: 64 }), 0, cy + 60, 0));
  g.add(at(turned([[30, 0], [184, 0], [184, 2], [30, 2]], mat.rubber, { along: "y", segs: 64 }), 0, cy + 64, 0));
  [[90, 30, 9], [-60, 100, 10.5], [40, -110, 12]].forEach(([x, z, r]) => g.add(at(socket({ r }), x, cy + 66, z)));
  const rt = ratchet({ len: 180 }); rt.position.set(-80, cy + 80, -20); rt.rotation.y = 0.5; g.add(rt);
  g.add(at(cyl(30, 200, mat.black, { segs: 32 }), 0, cy + 130, 0), at(cyl(22, 160, mat.chrome, { segs: 32 }), 0, cy + 300, 0));
  g.add(at(cyl(26, 6, mat.satin, { segs: 32 }), 0, cy + 232, 0));
  const sy = cy + 380;
  g.add(at(turned([[0.1, 0], [120, 0], [140, 18], [0.1, 22]], mat.black, { along: "y", segs: 48 }), 0, sy, 0));
  g.add(at(turned([[0.1, 0], [180, 0], [192, 6], [196, 28], [193, 56], [182, 70], [150, 78], [0.1, 80]], M.vinyl, { along: "y", segs: 72 }), 0, sy + 18, 0));
  g.add(at(rot(mesh(new THREE.TorusGeometry(195, 3.4, 10, 96), mat.red), PI / 2), 0, sy + 40, 0));
  g.add(at(box(70, 12, 30, mat.black, 4), 150, sy + 6, 0), at(rot(cyl(4, 80, mat.chrome), 0, 0, PI / 2), 190, sy + 6, 0), at(sphere(9, mat.black), 230, sy + 6, 0)); // height lever
  g.userData.yaw = -0.3; return g;
}
function nut(s, m = mat.chrome) { return group(at(cyl(s, s * 0.85, m, { segs: 6 }), 0, s * 0.425, 0), at(cyl(s * 0.55, 0.5, mat.hole, { segs: 24 }), 0, s * 0.86, 0)); }
function bolt(len, r) {
  const prof = [[0.1, 0], [r - 0.4, 0]]; for (let y = 1; y < len - 1; y += 1.6) prof.push([r, y], [r - 0.7, y + 0.8]);
  prof.push([r - 0.6, len], [0.1, len]);
  return group(at(cyl(r * 1.75, r * 1.3, mat.satin, { segs: 6, along: "x" }), -r * 0.65, r * 1.75, 0), at(turned(prof, mat.satin, { segs: 24 }), 0, r * 1.75, 0), at(turned([[0.1, 0], [r * 2.2, 0], [r * 2.2, 0.8], [0.1, 0.8]], mat.satin, { along: "x" }), -0.2, r * 1.75, 0));
}
function magTray() {
  const g = group(
    at(turned([[0.1, 0], [52, 0], [54, 2], [53, 6], [0.1, 6]], mat.rubber, { along: "y", segs: 64 }), 0, 0, 0),
    at(turned([[0.1, 7.2], [70, 7.2], [74, 9], [79, 32], [83, 36], [86, 36.5], [87, 35], [84, 33], [80.5, 30], [76, 6.5], [72, 5.5], [0.1, 5.5]].reverse(), mat.satin, { along: "y", segs: 96 }), 0, 0, 0),
  );
  const fy = 7.2;
  [[-30, 20, 7], [12, 38, 8.5], [34, -6, 6], [-8, -34, 9.5]].forEach(([x, z, s], i) => { const n = nut(s, i % 2 ? mat.satin : mat.chrome); n.position.set(x, fy, z); n.rotation.y = i; g.add(n); });
  [[[-45, -12], 0.4, 32, 4], [[0, 4], -0.9, 26, 3.4]].forEach(([[x, z], a, len, r]) => { const b = bolt(len, r); b.position.set(x, fy - 0.6, z); b.rotation.y = a; g.add(b); });
  [[40, 30], [52, 6]].forEach(([x, z]) => g.add(at(turned([[5, 0], [11, 0], [11, 1.2], [5, 1.2], [5, 0]], mat.steel, { along: "y", segs: 40 }), x, fy + 0.1, z)));
  g.userData.yaw = -0.3; return g;
}
function drainPan() {
  const R = 225, g = group(
    at(turned([[0.1, 0], [178, 0], [186, 4], [212, 96], [220, 104], [226, 106], [228, 103], [222, 100], [214, 92], [190, 10], [180, 7], [0.1, 7]], M.hdpe, { along: "y", segs: 96 }), 0, 0, 0),
  );
  // centre drain screen and raised collar
  const scr = circle(70); for (let i = 0; i < 4; i++) for (let k = 0; k < 6 + i * 6; k++) { const a = (k * PI * 2) / (6 + i * 6), rr2 = 10 + i * 15; scr.holes.push(circle(3.6, Math.cos(a) * rr2, Math.sin(a) * rr2)); }
  scr.holes.push(circle(3.6));
  g.add(at(slab(scr, 1.6, 0.4, mat.satin), 0, 40, 0), at(turned([[70, 0], [80, 0], [80, 34], [76, 36], [70, 36]], M.hdpe, { along: "y", segs: 64 }), 0, 7, 0));
  g.add(at(turned([[0.1, 0], [64, 0], [64, 2], [0.1, 2]], mat.hole, { along: "y", segs: 48 }), 0, 30, 0));
  // pour spout and molded grip on opposite sides of the rim
  g.add(at(rot(box(60, 10, 46, M.hdpe, 4), 0, 0, 0.2), R + 18, 102, 0));
  g.add(at(slab(frameShape(110, 60, 20, 14), 10, 3, M.hdpe), -R - 20, 100, 0));
  // drain plug with orange cap low on the side
  const pa = 0.9, plug = group(at(cyl(17, 10, mat.orange, { along: "x", segs: 12 }), 5, 0, 0), at(cyl(11, 4, mat.orange, { along: "x", segs: 24 }), 12, 0, 0));
  plug.position.set(Math.cos(pa) * 197, 40, Math.sin(pa) * 197); plug.rotation.set(0, -pa, 0.25); g.add(plug);
  for (const y of [42, 70]) g.add(at(rot(mesh(new THREE.TorusGeometry(190 + ((y - 10) * 24) / 82 - 0.6, 1.3, 8, 96), M.hdpe), PI / 2), 0, y, 0)); // fill marks
  g.userData.yaw = -0.3; return g;
}

/* ---------- the keys ---------- */
/* Snap-on magnetic mats, trays and dishes. The color is the end of the part number (MAGMATR red, ...G green,
   ...HV hi-viz, none black): models are red and lookOf() paints them. Faces carry a carbon-fibre weave and a black
   "Snap-on" tag; the weave is a printed overlay so the paint shows through it. */
const weave = (w, d) => canvasMat(w, d, (x, W, H) => {
  x.clearRect(0, 0, W, H); const s = 10;
  for (let i = 0; i * s < W; i++) for (let j = 0; j * s < H; j++) {
    x.fillStyle = (i + j) % 2 ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.07)";
    x.beginPath(); (i + j) % 2 ? x.ellipse(i * s + s / 2, j * s + s / 2, s * 0.5, s * 0.22, PI / 4, 0, PI * 2) : x.ellipse(i * s + s / 2, j * s + s / 2, s * 0.5, s * 0.22, -PI / 4, 0, PI * 2); x.fill();
  }
}, { transparent: true, px: 1024 });
const snapTag = (w) => group(at(box(w, 1.4, w * 0.3, mat.black, 0.5), 0, 0.7, 0), at(up(plane(w * 0.86, w * 0.22, label("Snap-on", w, w * 0.25, { color: "#f1f3f5", font: "italic 900 80px Helvetica, Arial, sans-serif" }))), 0, 1.5, 0));
// a flat mat: black bound edge round a painted face; size "micro" (with a hang tab), "mini" (square), "xl" (long strip)
function magMat(size = "") {
  const [w, d, r] = { micro: [64, 64, 12], mini: [140, 140, 18], xl: [440, 92, 12] }[size] || [280, 204, 22];
  const g = group(at(slab(rrect(w, d, r), 2, 1, mat.rubber), 0, 2, 0), at(slab(rrect(w - 10, d - 10, r - 4), 0.6, 0.6, M.redrub), 0, 3.4, 0));
  g.add(at(up(plane(w - 10, d - 10, weave(w - 10, d - 10))), 0, 4.75, 0));
  if (size === "micro") { // the hang tab with the Snap-on S
    g.add(at(box(26, 2.4, 44, mat.rubber, 1), 0, 1.6, -d / 2 - 14), at(up(plane(14, 14, label("S", 14, 14, { color: "#f1f3f5", font: "italic 900 80px Helvetica, Arial, sans-serif" }))), 0, 2.9, -d / 2 - 22));
  } else {
    const t = snapTag(Math.min(52, w * 0.24)); t.position.set(size === "mini" ? 0 : w / 2 - 44, 4.2, d / 2 - 16); if (size !== "mini") t.rotation.y = 0.1; g.add(t);
  }
  if (!size || size === "xl") { // a few nuts and a bolt stuck to it
    [[-w * 0.3, -d * 0.2, 7], [w * 0.05, d * 0.18, 9], [w * 0.22, -d * 0.16, 6]].forEach(([x, z, s], i) => { const n = nut(s, i % 2 ? mat.satin : mat.chrome); n.position.set(x, 4.8, z); n.rotation.y = i; g.add(n); });
    const b = bolt(36, 4); b.position.set(-w * 0.08, 4.4, d * 0.05); b.rotation.y = 0.5; g.add(b);
  } else if (size === "mini") { const n = nut(8, mat.chrome); n.position.set(-24, 4.8, -20); g.add(n); }
  g.userData.yaw = -0.35; return g;
}
// folding magnetic tray (MAGTRAY): a soft square tray, walls folded up and pinched at the corners with black snaps
function foldTray() {
  const S = 160, Hh = 34, g = group(at(slab(rrect(S, S, 8), 2, 1, M.redrub), 0, 2, 0), at(up(plane(S - 6, S - 6, weave(S - 6, S - 6))), 0, 4.1, 0));
  for (let k = 0; k < 4; k++) {
    const wall = group(at(box(S - 18, Hh, 3, M.redrub, 1.2), 0, Hh / 2, 0), at(box(S - 18, 3, 4.4, mat.rubber, 1.2), 0, Hh, 0));
    wall.rotation.x = -0.32; wall.position.set(0, 2, S / 2 - 1); const arm = group(wall); arm.rotation.y = (k * PI) / 2; g.add(arm);
    const c = group(at(rot(box(16, Hh + 6, 16, mat.rubber, 4), 0, PI / 4), 0, (Hh + 6) / 2, 0), at(cyl(5, 3, mat.satin, { along: "z", segs: 20 }), 0, Hh - 4, 8));
    const a = (k * PI) / 2 + PI / 4; c.position.set(Math.sin(a) * (S / 2 + 4), 0, Math.cos(a) * (S / 2 + 4)); c.rotation.y = a; g.add(c);
  }
  const t = snapTag(36); t.position.set(0, 4.2, -S / 2 + 18); g.add(t);
  [[-30, 20, 7], [24, -14, 8]].forEach(([x, z, s], i) => { const n = nut(s, i ? mat.satin : mat.chrome); n.position.set(x, 4.2, z); g.add(n); });
  g.userData.yaw = -0.35; return g;
}
// collapsible magnetic dish (MAGDISH): a red square rubber cup with a black floor and a black lid hinged open behind
function magDish() {
  const S = 110, Hh = 66, g = group(at(slab(frameShape(S, S, 18, 6), Hh - 2, 1, M.redrub), 0, Hh / 2, 0), at(slab(rrect(S - 8, S - 8, 14), 2, 0.5, mat.rubber), 0, 3, 0));
  for (let i = 1; i < 4; i++) g.add(at(slab(frameShape(S + 1.4, S + 1.4, 18.6, 1.4), 1, 0.3, M.redrub), 0, i * 16, 0)); // collapse folds
  const lid = group(at(slab(rrect(S, S, 18), 4, 1, mat.rubber), 0, 0, -S / 2)); lid.position.set(0, Hh, -S / 2); lid.rotation.x = -1.2; g.add(lid);
  const t = snapTag(40); t.rotation.x = PI / 2; t.position.set(0, Hh * 0.62, S / 2 + 0.6); g.add(t);
  g.userData.yaw = -0.4; return g;
}
// magnetic tool pouch (MAGPOUCH): a flat black pouch standing up with its mouth open and "Snap-on" across the front
function magPouch() {
  const g = group(at(box(200, 110, 26, M.vinyl, 10), 0, 55, 0), at(box(186, 4, 14, mat.hole, 2), 0, 109, 0), at(box(204, 6, 30, mat.rubber, 3), 0, 3, 0));
  g.add(at(plane(110, 22, label("Snap-on", 110, 22, { color: "#f1f3f5", font: "italic 900 80px Helvetica, Arial, sans-serif" })), 0, 62, 13.2));
  g.userData.yaw = -0.4; return g;
}
// extra-large magnetic parts bowl (MAGBOWLXL): a long black open bowl with rounded ends and a few bolts in it
function magBowl() {
  const g = group(at(slab(frameShape(280, 92, 24, 5), 36, 1.5, M.hdpe), 0, 19, 0), at(slab(rrect(272, 84, 20), 2, 0.5, M.hdpe), 0, 2, 0));
  [[-80, 10, 7], [-40, -16, 9], [60, 8, 8]].forEach(([x, z, s], i) => { const n = nut(s, i % 2 ? mat.satin : mat.chrome); n.position.set(x, 4, z); g.add(n); });
  const b = bolt(40, 4.4); b.position.set(10, 3.6, 0); b.rotation.y = 0.3; g.add(b);
  g.userData.yaw = -0.3; return g;
}
// A soft zip kit bag: black nylon body, red band, zip along the top and a pull.
function kitBag() {
  const body = box(240, 70, 110, M.vinyl, 24), band = box(242, 14, 112, M.redrub, 6);
  const g = group(at(body, 0, 35, 0), at(band, 0, 26, 0), at(box(220, 2, 4, mat.black, 1), 0, 70.4, 0));
  g.add(at(box(14, 3, 8, mat.satin, 1), 70, 71, 0), at(rot(box(6, 2, 22, mat.black, 1), 0, 0, 0), 70, 71, 14));
  g.add(at(tube([[-60, 70, 0], [-50, 92, 0], [50, 92, 0], [60, 70, 0]], 4, mat.black, 12), 0, 0, 0));
  g.userData.yaw = -0.4; return g;
}
// A blow-moulded red bit case, closed: lid seam, two latches and a moulded handle.
function bitCase() {
  const g = group(at(box(220, 30, 150, mat.redp, 10), 0, 15, 0), at(box(222, 2, 152, mat.black, 1), 0, 22, 0), at(box(160, 2, 90, M.dark, 4), 0, 30.4, 0));
  [-60, 60].forEach((x) => g.add(at(box(26, 16, 6, mat.satin, 2), x, 22, 77)));
  g.add(at(tube([[-40, 15, -75], [-40, 15, -92], [40, 15, -92], [40, 15, -75]], 6, mat.black, 12), 0, 0, 0));
  g.userData.yaw = -0.5; return g;
}
// An open blow-molded case: the base on the bench with its insert, the lid swung up behind on its hinge and
// two latches on the front. fill(g, top) lays the contents on the insert.
// lidFill(lid, W, D) puts things on the lid's inside face: x across, z up the lid from the hinge, facing -y.
function openCase({ W = 240, D = 160, H = 30, shell = M.grey, insert = M.grey, fill = () => {}, lidFill = null, lidIn = M.liner } = {}) {
  const g = group(at(box(W, H, D, shell, 10), 0, H / 2, 0), at(box(W - 16, 4, D - 16, insert, 4), 0, H - 1, 0));
  const lid = group(at(box(W, 22, D, shell, 10), 0, 11, D / 2), at(box(W - 18, 2, D - 18, lidIn, 4), 0, 0.6, D / 2));
  if (lidFill) lidFill(lid, W, D);
  lid.position.set(0, H, -D / 2); lid.rotation.x = -PI / 2 - 0.22; g.add(lid);
  for (const x of [-W * 0.3, W * 0.3]) g.add(at(box(26, 12, 5, M.dark, 2), x, H - 6, D / 2 + 1.5));
  g.add(at(box(W * 0.36, 12, 8, shell, 4), 0, H / 2, D / 2 + 3)); // carry handle molded into the front
  fill(g, H + 1);
  g.userData.yaw = -0.35; return g;
}
// 40 pc 1/4" stubby bit socket set (BLPBSS40): four rows of ten bit sockets lying in a grey case
function bitSocketCase() {
  return openCase({ fill: (g, t) => {
    for (let row = 0; row < 4; row++) for (let i = 0; i < 10; i++) {
      const x = -96 + i * 21.3, z = -48 + row * 32, r = 5.6 + (i % 5) * 0.25;
      g.add(at(cyl(r, 14, mat.chrome, { along: "z", segs: 20 }), x, t + r, z - 4));
      g.add(at(cyl(r * 0.5, 10, row === 1 ? mat.chrome : mat.steel, { along: "z", segs: row % 2 ? 6 : 12 }), x, t + r, z + 8));
      g.add(at(box(r * 2.4, 1, 6, M.liner, 0.3), x, t + 0.3, z + 8));
    }
  } });
}
// a printed chart on the inside of a lid (x, z its centre on the lid)
const lidChart = (lid, w, h, draw, x, z) => lid.add(at(rot(plane(w, h, canvasMat(w, h, draw, { px: 1024 })), PI / 2), x, -0.6, z));
function lugChart(x, W, H) {
  x.fillStyle = "#f4f4f1"; x.fillRect(0, 0, W, H);
  txt(x, "YA1005C Deluxe Hubcap & Wheel Lock Removal Kit", W / 2, H * 0.07, H * 0.06, "#15181c", "center", 800);
  txt(x, "WARNING: Eye Protection Must Be Worn When Using These Tools", W / 2, H * 0.14, H * 0.035, "#15181c", "center", 700);
  x.fillStyle = "#2a2d31";
  [[0.04, 0.24, 0.05, 0.5], [0.91, 0.24, 0.05, 0.5]].forEach(([a, b, w, h]) => { rr(x, W * a, H * b, W * w, H * h, 6); x.fill(); });
  for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) {
    const X = W * (0.14 + i * 0.125), Y = H * (0.26 + r * 0.24), w = W * (0.035 + ((i + r) % 3) * 0.02);
    x.fillStyle = "#2a2d31"; rr(x, X, Y, w, H * 0.1, 5); x.fill();
    txt(x, ["Lock socket", "Extractor", "GM locks", "Spline", "Hubcap", "Ford locks"][(i + r) % 6], X + w / 2, Y + H * 0.15, H * 0.028, "#4a4f56", "center", 600);
  }
  x.fillStyle = "#2a2d31"; rr(x, W * 0.22, H * 0.2, W * 0.42, H * 0.04, 6); x.fill();
}
// Blue-Point deluxe hubcap & wheel lock removal kit (YA1005C): grey case, black oxide sockets and extractors in pockets, chart in the lid
function lugKitCase() {
  const W = 260, D = 176;
  return openCase({ W, D, H: 32, lidIn: mat.white, lidFill: (lid) => lidChart(lid, W - 30, D - 30, lugChart, 0, D / 2), fill: (g, t) => {
    const lay = (r, len, along, x, z, hex = false) => {
      g.add(at(box(along === "x" ? len + 6 : r * 2 + 6, 2, along === "x" ? r * 2 + 6 : len + 6, M.liner, 1), x, t + 0.2, z)); // the pocket
      g.add(at(cyl(r, len, mat.oxide, { along, segs: hex ? 6 : 28 }), x, t + r * 0.7, z));
    };
    lay(9, 92, "z", -110, -10); lay(11, 22, "z", -110, 46, true); lay(9, 92, "z", 110, -10); lay(11, 22, "z", 110, 46, true);
    lay(10, 140, "x", -10, -58); lay(6.5, 30, "x", 74, -58);
    lay(12, 80, "x", -40, -14); lay(14, 96, "x", -32, 40); lay(15, 74, "z", 40, 18, true); lay(9, 60, "z", 74, 22);
  } });
}
// Blue-Point master disconnect set (LDT40): big grey case, scissor tools and the chart in the lid; pliers and a
// line tool on top, two rows of coloured collars, chrome rings and coloured angled tools in the base
function masterChart(x, W, H) {
  x.fillStyle = "#f6f6f3"; x.fillRect(0, 0, W, H);
  txt(x, "Master Disconnect Set", W / 2, H * 0.06, H * 0.055, "#15181c", "center", 800);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 9; r++) { x.fillStyle = "#9aa0a6"; x.fillRect(W * (0.04 + c * 0.24), H * (0.13 + r * 0.09), W * (0.12 + ((r + c) % 3) * 0.03), H * 0.012); }
  x.fillStyle = "#2a2d31"; for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(W * (0.12 + i * 0.15), H * 0.95, H * 0.025, 0, PI * 2); x.fill(); }
}
const COLLAR = [mat.yellow, mat.redp, mat.blue, M.green, mat.black, mat.black, mat.white, mat.grey];
function collar(r, h, m) { // a split plastic disconnect collar standing up, with its slot and flange
  return group(turned([[r * 0.5, 0], [r * 1.25, 0], [r * 1.25, h * 0.22], [r, h * 0.3], [r, h], [r * 0.5, h]], m, { along: "y", segs: 40 }), at(box(r * 2.6, h + 0.4, r * 0.25, mat.hole, 0.2), 0, h / 2, r * 0.6));
}
function scissorTool(len, m = mat.chrome) { // two flat arms crossed at a pivot, half-round jaws at the top (along +z)
  const g = group();
  for (const s of [-1, 1]) g.add(at(rot(box(7, 3, len, m, 1.4), 0, s * 0.08), s * 5, s * 1.6, len / 2));
  g.add(at(cyl(7, 4, m, { segs: 24 }), 0, 0, len * 0.86), at(cyl(3.4, 5, mat.hole, { segs: 16 }), 0, 0, len * 0.86), at(cyl(2.4, 9, mat.steel, { segs: 12 }), 0, 0, len * 0.55));
  return g;
}
function masterDisconnect() {
  const W = 300, D = 250;
  return openCase({ W, D, H: 36, lidFill: (lid) => {
    lidChart(lid, 110, 120, masterChart, 0, 150);
    for (const x of [-120, -94, 94, 120]) { const sc = scissorTool(110); sc.position.set(x, -2, 92); lid.add(sc); }
    for (const x of [-70, 70]) { const sc = rot(scissorTool(80, mat.black), 0, x < 0 ? -PI / 2 + 0.2 : PI / 2 - 0.2, 0); sc.position.set(x, -2, 52); lid.add(sc); }
    lid.add(at(box(44, 6, 18, mat.black, 2), 100, -3, 52), at(cyl(8, 26, mat.chrome, { along: "x", segs: 20 }), 30, -8, 52));
  }, fill: (g, t) => {
    g.add(at(box(110, 8, 16, mat.black, 2), -60, t + 4, -96), at(box(30, 22, 16, mat.black, 3), -110, t + 6, -86));
    const pl = group(at(capsule(5, 56, mat.blue), 40, 0, -4), at(capsule(5, 56, mat.blue), 40, 0, 6), at(box(40, 5, 12, mat.chrome, 2), -10, 0, 1));
    pl.position.set(40, t + 5, -92); g.add(pl);
    for (let row = 0; row < 2; row++) for (let i = 0; i < 7; i++) {
      const r = row ? 10 : 6.5, c = collar(r, row ? 22 : 18, row ? COLLAR[i] : [mat.blue, mat.brass, mat.chrome, mat.brass, M.green, mat.black, mat.black][i]);
      c.position.set(-112 + i * 34, t, row ? -10 : -46); c.rotation.y = 0.4; g.add(c);
    }
    for (let i = 0; i < 6; i++) { const r = 12 - i * 1.3; g.add(at(turned([[r * 0.55, 0], [r, 0], [r, 8], [r * 0.55, 8]], mat.chrome, { along: "y", segs: 32 }), -116 + i * 26, t, 50)); }
    [mat.yellow, mat.blue, mat.redp, M.green, mat.yellow, mat.white].forEach((m, i) => {
      const a = group(at(box(8, 6, 46, m, 2.5), 0, 0, 0), at(rot(box(8, 6, 26, m, 2.5), 0.9), 0, 9, -26)); a.position.set(30 + i * 18, t + 4, 56); a.rotation.y = -0.25; g.add(a);
    });
  } });
}
// a smaller disconnect set: its collars standing in a black tray sized to the piece count (LDT8 = 8 collars)
function disconnectSet({ pn = "" } = {}) {
  const n = Math.max(4, Math.min(16, +(String(pn).match(/^LDT(\d+)/) || [])[1] || 8)), cols = Math.min(n, n > 8 ? Math.ceil(n / 2) : n), rows = Math.ceil(n / cols);
  const W = cols * 38 + 24, D = rows * 44 + 24;
  const g = group(at(box(W, 16, D, mat.black, 6), 0, 8, 0), at(box(W - 14, 2, D - 14, mat.hole, 3), 0, 16.2, 0));
  for (let i = 0; i < n; i++) {
    const c = collar(13 - (i % cols) * (5 / cols), 24, COLLAR[i % COLLAR.length]);
    c.position.set(-W / 2 + 31 + (i % cols) * 38, 17, -D / 2 + 34 + Math.floor(i / cols) * 44); c.rotation.y = 0.5; g.add(c);
  }
  g.userData.yaw = -0.3; return g;
}
// 44 pc ratcheting screwdriver master foam set (SGDMRC44FR): black case, red handle, four extensions, rows of bits
function sdFoamCase() {
  return openCase({ W: 300, D: 220, H: 34, shell: M.hdpe, insert: M.foam, fill: (g, t) => {
    const hd = group(at(capsule(15, 64, mat.redp), 0, 0, 0), at(capsule(13, 40, mat.rubber), -30, 0, 0), at(cyl(5, 22, mat.chrome, { along: "x" }), 56, 0, 0));
    g.add(at(hd, 50, t + 12, -76), at(box(80, 3, 26, M.redrub, 2), -90, t + 1.5, -76));
    [[-60, -40, 80], [60, -40, 70], [-30, -14, 170], [-60, 8, 110], [70, 8, 90]].forEach(([x, z, l]) => g.add(at(cyl(3.6, l, mat.chrome, { along: "x", segs: 12 }), x, t + 3.6, z)));
    for (let row = 0; row < 3; row++) for (let i = 0; i < 12; i++) {
      const x = -128 + i * 22.6 + (row === 2 && i > 5 ? 8 : 0), z = 34 + row * 26;
      g.add(at(cyl(3.4, 12, row === 1 ? mat.oxide : mat.chrome, { segs: 6 }), x, t + 6, z), at(cyl(1.6, 6, mat.steel, { segs: 8 }), x, t + 15, z));
    }
  } });
}
// An extension set: 3", 6" and 10" laid side by side.
// Lengths come from the set's part number (206AFX: 1-1/2" to 11"); they sit in a black clip rail, shortest in front.
function extensionSet({ sizes = ['3"', '6"', '10"'], drive = "3/8" } = {}) {
  const k = { "1/4": 0.7, "1/2": 1.32, "3/4": 1.9 }[drive] || 1, step = 20 * k + 4, ins = sizes.map(parseFloat).sort((a, b) => b - a), n = ins.length;
  const g = group(ins.map((inch, i) => { const e = extension({ len: Math.max(30, inch * 25.4), drive }); e.position.set(0, 10 * k + 4, (i - (n - 1) / 2) * step); return e; }));
  g.add(at(box(30, 8, n * step + 6, mat.black, 2), 12, 4, 0));
  g.position.x = -ins[0] * 12.7; g.rotation.x = 0.45; const out = group(g); out.userData.yaw = -0.1; return out;
}
export const MODELS = {
  storage: (o = {}) => (o.box ? boxUnit(o.box) : rollCabChest()),
  "storage-cart": () => serviceCart(),
  "storage-chest": (o = {}) => (o.box ? boxUnit(o.box) : chestOpen()),
  "set-screwdriver": () => screwdriverSet(),
  "set-sd-case": () => sdFoamCase(),
  "bit-socket-case": () => bitSocketCase(),
  "extractor-case": () => lugKitCase(),
  "disconnect-master": () => masterDisconnect(),
  "disconnect-set": (o = {}) => disconnectSet(o),
  "set-pliers": () => pliersSet(),
  "set-pick": () => pickSet(),
  "set-punch": () => punchSet(),
  "set-bit": () => bitSet(),
  "set-kit": () => socketKit(),
  diag: () => labScope(),
  "diag-solus": () => solusScanner(),
  "diag-tablet": () => scanTablet(),
  "diag-handheld": () => handheldScanner(),
  "battery-tester": () => batteryTester(),
  borescope: () => borescope(),
  multimeter: () => multimeter(),
  testlight: () => testLight(),
  general: () => tapeMeasure(),
  other: () => closedCase(),
  creeper: () => creeper(),
  stool: () => stool(),
  magtray: () => magTray(), magmat: () => magMat(), "magmat-mini": () => magMat("mini"), "magmat-micro": () => magMat("micro"), "magmat-xl": () => magMat("xl"),
  "magtray-fold": () => foldTray(), magdish: () => magDish(), magpouch: () => magPouch(), magbowl: () => magBowl(), "tool-bag": () => kitBag(), "bit-case": () => bitCase(), "set-extension": (o = {}) => extensionSet(o.sizes?.length ? { sizes: o.sizes, drive: o.drive } : {}),
  "drain-pan": () => drainPan(),
};
