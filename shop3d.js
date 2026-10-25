// BoxTally 3D: shop equipment, measuring and diagnostic tools (jacks, vise, clamps, gauges, pullers, lights).
// Flat tools lie on the bench (x along the tool, y up, z toward the camera); jacks, stands, the vise, the work light
// and the pistol-grip tools stand upright.
import { THREE, mat, PI, mesh, slab, poly, turned, cyl, box, sphere, capsule, at, group } from "./kit3d.js";

/* ---------- local materials ---------- */
const L = {
  led: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3dc, emissiveIntensity: 1.8, roughness: 0.2 }),
  cob: new THREE.MeshStandardMaterial({ color: 0xd2e400, emissive: 0xb8cc00, emissiveIntensity: 0.35, roughness: 0.3 }),
  green: new THREE.MeshStandardMaterial({ color: 0x3be07a, emissive: 0x22cc55, emissiveIntensity: 1.3, roughness: 0.3 }),
  laser: new THREE.MeshStandardMaterial({ color: 0xff3a2a, emissive: 0xee1a10, emissiveIntensity: 1.2, roughness: 0.1 }),
  plug: new THREE.MeshPhysicalMaterial({ color: 0x4a2a16, roughness: 0.42, clearcoat: 0.8 }), // sticky tire plug strip
  anod: new THREE.MeshPhysicalMaterial({ color: 0x9b0812, metalness: 0.6, roughness: 0.3, clearcoat: 0.6 }), // anodised aluminium
  lens: new THREE.MeshPhysicalMaterial({ color: 0x343844, metalness: 0.3, roughness: 0.12, clearcoat: 1 }),
  alu: new THREE.MeshPhysicalMaterial({ color: 0xc4c9cf, metalness: 0.9, roughness: 0.38 }),
};
const WHITE = { color: "#f3f5f7" };

/* ---------- local helpers ---------- */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function canvasTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
// printed text on a transparent strip, sized to the strip's height
function textMat(text, w, h, { color = "#20252c", weight = 700, family = "Helvetica, Arial, sans-serif", opacity = 0.92 } = {}) {
  const W = 512, H = Math.max(16, Math.round((512 * h) / w));
  const t = canvasTex(W, H, (x) => {
    let fs = H * 0.78; x.font = `${weight} ${fs}px ${family}`;
    const m = x.measureText(text).width; if (m > W * 0.94) { fs *= (W * 0.94) / m; x.font = `${weight} ${fs}px ${family}`; }
    x.fillStyle = color; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(text, W / 2, H / 2 + fs * 0.04);
  });
  return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity, polygonOffset: true, polygonOffsetFactor: -2 });
}
const decal = (text, w, h, o) => mesh(new THREE.PlaneGeometry(w, h), textMat(text, w, h, o), false); // faces +z
const flat = (o) => { o.rotation.x = -PI / 2; return o; }; // turn something that faces +z to face up
const printed = (tex, o = {}) => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, ...o });
const lit = (tex, k = 0.3) => new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: k, roughness: 0.4 });
const disc = (r, m) => mesh(new THREE.CircleGeometry(r, 64).rotateX(-PI / 2), m, false); // face up
// an upright 2D outline (x, y) given thickness along z
function plate(shape, depth, bevel, m) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 32 });
  g.translate(0, 0, -depth / 2); return mesh(g, m);
}
// a turned profile's V-grooves (threads, knurling): [radius, position] pairs from a to b
function grooved(r, a, b, pitch, depth) { const p = []; for (let y = a; y + pitch <= b + 1e-6; y += pitch) p.push([r, y], [r - depth, y + pitch / 2]); p.push([r, b]); return p; }
const hose = (pts, r, m, segs = 120, radial = 14) => mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => V(...p))), segs, r, radial, false), m);
const ring = (R, r, m, arc = 2 * PI) => mesh(new THREE.TorusGeometry(R, r, 12, 64, arc), m); // in the xy plane
function span(o, a, b) { // stretch a y-axis part between two points
  const A = V(...a), B = V(...b); o.position.copy(A).add(B).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(V(0, 1, 0), B.sub(A).normalize()); return o;
}
const ds = (m) => { const c = m.clone(); c.side = THREE.DoubleSide; return c; };
const alongZ = (o) => { o.rotation.x = PI / 2; return o; }; // y-axis part to z

/* ---------- dials ---------- */
// A printed gauge face. Canvas angle 0 points +x and runs clockwise; 0 sits lower left on a 270° dial, at the top on a full one.
function dialAngle(v, max, full) { return (full ? -PI / 2 : PI * 0.75) + ((full ? 2 * PI : PI * 1.5) * v) / max; }
function dialTex({ max = 60, major = 10, minor = 2, mid = 0, every = major, unit = "PSI", sub = "", zones = [], full = false, face = "#f5f5f1", ink = "#15181c", inner = null, rev = false } = {}) {
  return canvasTex(512, 512, (x, W) => {
    const c = W / 2, ang = (v) => dialAngle(v, max, full);
    x.fillStyle = face; x.beginPath(); x.arc(c, c, c, 0, 2 * PI); x.fill();
    x.strokeStyle = "rgba(0,0,0,.18)"; x.lineWidth = 6; x.beginPath(); x.arc(c, c, c * 0.975, 0, 2 * PI); x.stroke();
    zones.forEach(([a, b, col]) => { x.strokeStyle = col; x.lineWidth = c * 0.075; x.beginPath(); x.arc(c, c, c * 0.79, ang(a), ang(b)); x.stroke(); });
    x.strokeStyle = ink;
    const n = Math.round(max / minor), isk = (v, k) => k && Math.abs(v / k - Math.round(v / k)) < 1e-6;
    for (let i = 0; i < n + (full ? 0 : 1); i++) {
      const v = i * minor, a = ang(v), big = isk(v, major), md = !big && isk(v, mid);
      const r0 = c * (big ? 0.72 : md ? 0.79 : 0.83), r1 = c * 0.92; x.lineWidth = big ? 7 : md ? 4.5 : 2.6;
      x.beginPath(); x.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); x.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1); x.stroke();
    }
    x.fillStyle = ink; x.textAlign = "center"; x.textBaseline = "middle"; x.font = `700 ${Math.round(c * 0.16)}px Helvetica, Arial, sans-serif`;
    for (let v = 0; v <= max - (full ? every : 0) + 1e-6; v += every) { const a = ang(v); x.fillText(String(v), c + Math.cos(a) * c * 0.56, c + Math.sin(a) * c * 0.56); }
    if (inner) { // a second scale (kPa, bar) inside, in red
      x.fillStyle = x.strokeStyle = inner.color || "#c0141c"; x.font = `700 ${Math.round(c * 0.085)}px Helvetica, Arial, sans-serif`; x.lineWidth = 2.5;
      for (let v = 0; v <= inner.max + 1e-6; v += inner.step) { const a = ang((v / inner.max) * max); x.fillText(String(v), c + Math.cos(a) * c * 0.38, c + Math.sin(a) * c * 0.38); x.beginPath(); x.moveTo(c + Math.cos(a) * c * 0.45, c + Math.sin(a) * c * 0.45); x.lineTo(c + Math.cos(a) * c * 0.5, c + Math.sin(a) * c * 0.5); x.stroke(); }
      x.fillText(inner.unit, c, c + c * 0.62);
    }
    if (rev) { // small revolution counter in the upper half
      const rx = c, ry = c - c * 0.29, rr = c * 0.12; x.lineWidth = 2; x.strokeStyle = ink; x.beginPath(); x.arc(rx, ry, rr, 0, 2 * PI); x.stroke();
      for (let i = 0; i < 10; i++) { const a = -PI / 2 + (i * PI) / 5; x.beginPath(); x.moveTo(rx + Math.cos(a) * rr * 0.72, ry + Math.sin(a) * rr * 0.72); x.lineTo(rx + Math.cos(a) * rr, ry + Math.sin(a) * rr); x.stroke(); }
    }
    x.fillStyle = ink; x.font = `800 ${Math.round(c * 0.13)}px Helvetica, Arial, sans-serif`; x.fillText(unit, c, c + c * (full ? 0.3 : 0.4));
    if (sub) { x.font = `500 ${Math.round(c * 0.075)}px Helvetica, Arial, sans-serif`; x.fillText(sub, c, c + c * (full ? 0.44 : 0.78)); }
  });
}
// a needle lying flat, pointing +x from its pivot; turn it with rotation.y = -canvasAngle
function needle(len, m = mat.red, w = 1.7) {
  return group(slab(poly([[-len * 0.22, -w], [len, -w * 0.22], [len, w * 0.22], [-len * 0.22, w]]), 0.5, 0, m));
}
// a round dial gauge in a rubber boot, face up, bottom at y = 0
function gauge(R, tex, alpha, { boot = mat.rubber, depth = 22 } = {}) {
  const n = needle(R * 0.8); n.rotation.y = -alpha; n.position.y = depth - 0.6;
  return group(
    turned([[0.1, 0], [R - 4, 0], [R + 1, 2.5], [R + 3, depth * 0.45], [R + 2.6, depth * 0.85], [R + 0.6, depth], [R - 2.4, depth + 0.7], [R - 2.6, depth - 1.6], [0.1, depth - 1.6]], boot, { along: "y", segs: 64, flutes: 16, flute: 0.012 }),
    at(flat(ring(R - 2.2, 1.5, mat.chrome)), 0, depth - 0.3, 0),
    at(disc(R - 2.4, lit(tex)), 0, depth - 1.4, 0), n,
    at(cyl(R * 0.07, 1.6, mat.chrome), 0, depth - 0.2, 0),
  );
}

/* ---------- shop light: a rechargeable LED work light on its stand ---------- */
function shopLight() {
  const W = 200, H = 140, D = 34, py = 156;
  const dots = canvasTex(512, 384, (x, w, h) => {
    x.fillStyle = "#1b1d20"; x.fillRect(0, 0, w, h);
    const cols = 12, rows = 8, sx = w / cols, sy = h / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const cx = (i + 0.5) * sx, cy = (j + 0.5) * sy;
      x.fillStyle = "#4a4e54"; x.fillRect(cx - sx * 0.44, cy - sy * 0.44, sx * 0.88, sy * 0.88);
      const gr = x.createRadialGradient(cx, cy, 0, cx, cy, sx * 0.34); gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.45, "#fff2cf"); gr.addColorStop(1, "rgba(255,230,180,0)");
      x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, sx * 0.34, 0, 2 * PI); x.fill();
    }
  });
  const head = group(
    box(W, H, D, mat.redp, 9),
    at(box(W - 16, H - 16, 4, mat.black, 1.5), 0, 0, D / 2),
    at(mesh(new THREE.PlaneGeometry(W - 30, H - 40), lit(dots, 1.1), false), 0, 5, D / 2 + 2.1),
    at(decal("1500 LM", 44, 8, WHITE), 0, -H / 2 + 14, D / 2 + 2.2),
    at(ring(24, 3.2, mat.satin, PI), 0, H / 2 - 2, -6),
    at(cyl(7, 4, mat.rubber), 46, H / 2 + 1.5, 4),
  );
  [-1, 1].forEach((sx) => [-1, 1].forEach((sy) => head.add(at(box(34, 34, D + 6, mat.rubber, 9), sx * (W / 2 - 12), sy * (H / 2 - 12), 0))));
  for (let i = -3; i <= 3; i++) head.add(at(box(4, H - 44, 9, mat.black, 1), i * 22, 0, -D / 2 - 3.5));
  for (let i = 0; i < 3; i++) head.add(at(box(5, 2, 3, L.green, 0.5), 62 + i * 8, H / 2 + 0.6, 4));
  head.rotation.x = -0.32; head.position.y = py;
  const g = group(head, at(box(280, 18, 96, mat.rubber, 7), 0, 9, 0), at(box(262, 8, 80, mat.black, 3), 0, 21, 0), at(cyl(5, 250, mat.satin, { along: "x" }), 0, py, 0));
  [-1, 1].forEach((s) => {
    g.add(at(box(14, py - 10, 30, mat.black, 3), s * 118, 24 + (py - 10) / 2, 0));
    const k = turned([[0.1, 0], [15, 0], [17, 2], [17, 11], [13, 15], [0.1, 15]], mat.rubber, { along: "x", flutes: 9, flute: 0.07 });
    if (s < 0) k.rotation.y = PI; g.add(at(k, s * 125, py, 0));
  });
  g.userData.yaw = -0.4;
  return g;
}

/* ---------- floor jack ---------- */
function floorJack() {
  const g = group();
  const sp = poly([[-312, 64], [-212, 64], [-186, 34], [292, 34], [314, 48], [314, 90], [298, 104], [-150, 120], [-262, 168], [-312, 168]]);
  [-1, 1].forEach((s) => {
    g.add(at(plate(sp, 7, 2, mat.redp), 0, 0, s * 150));
    // steel front wheels outside the frame, swivel casters under the back
    const w = turned([[0.1, -13], [30, -13], [37, -12], [40, -9], [40, 9], [37, 12], [30, 13], [18, 13], [16, 17], [0.1, 17]], mat.steel, { along: "y", segs: 48 });
    w.rotation.x = s * PI / 2; g.add(at(w, 258, 40, s * 172));
    g.add(at(cyl(8, 6, mat.chrome, { segs: 6, along: "z" }), 258, 40, s * 191));
    const c = group(at(box(48, 6, 48, mat.oxide, 1), 0, 61, 0), at(cyl(12, 8, mat.satin), 0, 55, 0), at(box(24, 4, 30, mat.oxide, 1), 0, 52, 0),
      at(box(20, 34, 4, mat.oxide, 1), 0, 36, 13), at(box(20, 34, 4, mat.oxide, 1), 0, 36, -13),
      at(cyl(24, 18, mat.rubber, { along: "z" }), 0, 24, 0), at(cyl(10, 22, mat.satin, { along: "z" }), 0, 24, 0), at(cyl(4, 32, mat.chrome, { along: "z" }), 0, 24, 0));
    g.add(at(c, -262, 0, s * 112));
    g.add(at(cyl(13, 5, mat.chrome, { segs: 6, along: "z" }), -140, 96, s * 155));
    g.add(at(cyl(10, 4, mat.chrome, { segs: 6, along: "z" }), -290, 150, s * 155));
  });
  g.add(at(cyl(9, 368, mat.satin, { along: "z" }), 258, 40, 0), at(cyl(14, 300, mat.oxide, { along: "z" }), 300, 66, 0), at(box(10, 100, 300, mat.redp, 2), -308, 116, 0));
  // pump and ram between the plates
  g.add(at(cyl(40, 96, mat.satin, { segs: 48 }), -238, 118, 0), at(turned([[0.1, 0], [30, 0], [32, 4], [26, 10], [0.1, 10]], mat.chrome, { along: "y" }), -238, 166, 0),
    at(cyl(26, 170, mat.satin, { along: "x" }), -130, 104, 0), at(cyl(13, 60, mat.chrome, { along: "x" }), -20, 106, 0),
    at(cyl(7, 14, mat.chrome, { along: "z" }), -280, 100, 150 + 10));
  // lift arm and saddle
  const arm = group(at(box(440, 32, 104, mat.redp, 6), 220, 0, 0), at(cyl(20, 24, mat.satin), 424, 26, 0),
    at(turned([[0.1, 0], [50, 0], [56, 3], [60, 12], [60, 20], [55, 22], [52, 16], [0.1, 15]], mat.chrome, { along: "y", segs: 64 }), 424, 34, 0),
    at(turned([[0.1, 0], [49, 0], [49, 2], [44, 3], [44, 1.6], [38, 1.6], [38, 3], [0.1, 3]], mat.rubber, { along: "y", segs: 48 }), 424, 49, 0));
  arm.position.set(-140, 96, 0); arm.rotation.z = 0.07; g.add(arm);
  // handle yoke and the long two-piece handle
  g.add(at(box(40, 50, 10, mat.redp, 3), -322, 150, 36), at(box(40, 50, 10, mat.redp, 3), -322, 150, -36), at(cyl(8, 92, mat.chrome, { along: "z" }), -324, 150, 0));
  const grip = turned([[0.1, 0], [16, 0], ...grooved(19, 3, 100, 6, 1.6), [17, 108], [0.1, 110]], mat.rubber, { along: "x" });
  const hd = group(at(cyl(21, 90, mat.redp, { along: "x" }), 50, 0, 0), at(cyl(15, 200, mat.redp, { along: "x" }), 195, 0, 0), at(cyl(22, 60, mat.rubber, { along: "x" }), 150, 0, 0),
    at(cyl(17.5, 24, mat.satin, { along: "x" }), 307, 0, 0), at(cyl(15, 120, mat.redp, { along: "x" }), 379, 0, 0), at(grip, 439, 0, 0));
  hd.position.set(-324, 150, 0); hd.rotation.z = PI - 0.72; g.add(hd);
  g.add(at(decal("3 TON", 120, 28, WHITE), 40, 70, 154.3), at(box(52, 30, 0.6, mat.yellow, 0.2), -205, 104, 154), at(decal("MAX 3 T", 46, 10), -205, 104, 154.5));
  g.userData.yaw = -0.45;
  return g;
}

/* ---------- jack stands (a pair) ---------- */
function jackStand(lift = 0) {
  const H = 232, D0 = 112, D1 = 34, S = Math.hypot(H, D0 - D1), phi = Math.atan2(D0 - D1, H);
  const g = group();
  for (let k = 0; k < 4; k++) {
    const ar = D0 - 26, c = S * 0.66, s = new THREE.Shape();
    s.moveTo(-D0, 0); s.lineTo(-ar, 0); s.bezierCurveTo(-ar, c, ar, c, ar, 0); s.lineTo(D0, 0); s.lineTo(D1, S); s.lineTo(-D1, S); s.closePath();
    const f = group(plate(s, 4, 1, mat.redp)); if (k === 0) f.add(at(decal("3 TON", 54, 13, WHITE), 0, S * 0.8, 3.2));
    f.rotation.x = -phi; f.position.z = D0; const p = group(f); p.rotation.y = (k * PI) / 2; g.add(p);
  }
  const top = H + 89 + lift;
  g.add(at(box(80, 34, 80, mat.redp, 4), 0, H + 12, 0), at(box(34, 220, 30, mat.satin, 2), 0, top - 110, 0));
  for (let y = H + 36; y < top - 6; y += 11) { const t = at(box(30, 3, 5, mat.satin, 0.6), 0, y, 16); t.rotation.x = 0.45; g.add(t); }
  const sd = new THREE.Shape(); sd.moveTo(-38, 0); sd.lineTo(38, 0); sd.lineTo(38, 30); sd.lineTo(27, 34); sd.quadraticCurveTo(0, -6, -27, 34); sd.lineTo(-38, 30); sd.closePath();
  g.add(at(plate(sd, 46, 2, mat.satin), 0, top, 0));
  g.add(at(cyl(7, 10, mat.chrome, { along: "z" }), 24, H + 12, 45), hose([[24, H + 12, 46], [60, H + 2, 52], [98, H - 26, 56], [116, H - 46, 58]], 5.5, mat.redp, 32, 10),
    span(cyl(7.5, 36, mat.rubber), [112, H - 42, 58], [134, H - 70, 60]));
  return g;
}
function jackStands() {
  const a = jackStand(0), b = jackStand(70);
  a.position.set(-135, 0, 20); a.rotation.y = 0.25; b.position.set(140, 0, -40); b.rotation.y = -0.35;
  const g = group(a, b); g.userData.yaw = -0.1; return g;
}

/* ---------- funnel ---------- */
function funnel() {
  const pl = ds(mat.redp);
  const mesh_ = canvasTex(512, 512, (x, w) => {
    x.strokeStyle = "#d9b44a"; x.lineWidth = 3; const st = 14;
    for (let i = 0; i <= w; i += st) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, w); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
  });
  const scr = new THREE.MeshStandardMaterial({ map: mesh_, transparent: true, alphaTest: 0.3, metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide });
  const g = group(
    turned([[6.5, 0], [9, 0], [12.5, 95], [80, 185], [88, 187], [89, 193], [80, 194], [77.5, 189], [10, 99], [6.5, 0]], pl, { along: "y", segs: 72 }),
    at(disc(47.5, scr), 0, 150, 0), at(flat(ring(47.5, 1.3, mat.brass)), 0, 150, 0),
    at(box(30, 5, 32, pl, 2), 98, 190, 0), at(cyl(6, 5.4, mat.hole), 104, 190, 0),
  );
  for (let i = 0; i < 3; i++) { const a = (i * 2 * PI) / 3 + 0.4, r = 11.6; const rib = span(box(2.4, 1, 3, pl, 0.5), [Math.cos(a) * 9.6, 8, Math.sin(a) * 9.6], [Math.cos(a) * r, 80, Math.sin(a) * r]); rib.scale.y = 72; g.add(rib); }
  return g;
}

/* ---------- air hose: a recoil hose with a quick coupler and a plug ---------- */
function hoseEnd(kind, r) { // along +x from the hose end at x = 0
  const pts = []; for (let i = 0; i <= 160; i++) { const a = (i / 160) * 11 * 2 * PI; pts.push(V(-26 - (i / 160) * 44, Math.cos(a) * (r + 1.5), Math.sin(a) * (r + 1.5))); }
  const g = group(turned([[r + 0.4, -24], [r + 3, -23], [r + 3.2, -2], [r + 1.6, 0], [0.1, 0]], mat.chrome, { along: "x" }), mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 500, 0.9, 6), mat.chrome));
  if (kind === "plug") g.add(at(cyl(9.5, 9, mat.brass, { segs: 6, along: "x" }), 4.5, 0, 0), turned([[0.1, 9], [5.6, 9], [5.6, 22], [7.2, 24], [7.2, 27], [4.6, 29.5], [4.6, 36], [3.6, 37], [0.1, 37]], mat.brass, { along: "x" }));
  else g.add(at(cyl(9.5, 8, mat.brass, { segs: 6, along: "x" }), 4, 0, 0), turned([[0.1, 8], [9.5, 8], [10.5, 10], ...grooved(12.4, 12, 34, 2, 0.6), [12.4, 36], [10, 38], [10, 46], [8.5, 47.5], [0.1, 47.5]], mat.chrome, { along: "x" }), at(cyl(5, 1, mat.hole, { along: "x" }), 47.8, 0, 0));
  return g;
}
function airHose() {
  const R = 42, P = 17, N = 10, r = 5.2, Lh = N * P, x0 = -Lh / 2, x1 = Lh / 2, pts = [];
  [[x0 - 85, -R, 30], [x0 - 50, -R, 28], [x0 - 22, -R, 18], [x0 - 6, -R + 1, 7]].forEach((p) => pts.push(V(...p)));
  for (let i = 0; i <= N * 24; i++) { const a = PI + (i / 24) * 2 * PI; pts.push(V(x0 + (i / 24) * P, R * Math.cos(a), R * Math.sin(a))); }
  [[x1 + 6, -R + 1, -7], [x1 + 22, -R, -18], [x1 + 50, -R, -28], [x1 + 85, -R, -30]].forEach((p) => pts.push(V(...p)));
  const coil = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 1100, r, 14, false), mat.blue);
  const a = hoseEnd("plug", r); a.rotation.y = PI; a.position.set(x0 - 85, -R, 30);
  const b = hoseEnd("coupler", r); b.position.set(x1 + 85, -R, -30);
  const g = group(coil, a, b); g.userData.yaw = -0.25; return g;
}

/* ---------- tire gauges ---------- */
function chuck() { // a straight clip-on chuck along +x
  return group(turned([[0.1, 0], [7, 0], [8, 2], [8, 22], [9, 24], [9, 40], [7.5, 44], [0.1, 44]], mat.chrome, { along: "x" }), at(box(26, 3, 6, mat.chrome, 1), 24, 9.5, 0), at(cyl(4, 1, mat.hole, { along: "x" }), 44.2, 0, 0));
}
function tireGauge() {
  const tex = dialTex({ max: 60, major: 10, minor: 1, mid: 5, unit: "PSI", inner: { max: 400, step: 100, unit: "kPa" }, zones: [[28, 36, "#2e9d4f"]] });
  const g = group(gauge(33, tex, dialAngle(32, 60)));
  const ex = V(Math.cos(0.45) * 34, 10, Math.sin(0.45) * 34);
  g.add(span(cyl(6.5, 22, mat.chrome), [ex.x - 6, 10, ex.z - 3], [ex.x + 12, 10, ex.z + 6]), at(cyl(4, 6, mat.red), ex.x + 4, 17, ex.z + 2),
    hose([[ex.x + 10, 9, ex.z + 5], [80, 7, 34], [140, 7, 40], [190, 7, 22], [232, 7, 4]], 5, mat.rubber, 80));
  const c = chuck(); c.position.set(230, 7, 5); c.rotation.y = 0.35; g.add(c);
  g.userData.yaw = -0.2; return g;
}
function tireInflator() {
  const tex = dialTex({ max: 160, major: 20, minor: 5, mid: 10, every: 20, unit: "PSI", inner: { max: 11, step: 2, unit: "bar" } });
  const gg = gauge(40, tex, dialAngle(36, 160), { depth: 24 }); gg.rotation.x = PI / 2; gg.position.set(24, 172, -11);
  const grip = turned([[0.1, 0], [14, 0], [16, 3], [16.5, 40], [16, 90], [14.5, 100], [0.1, 100]], mat.rubber, { along: "y", flutes: 12, flute: 0.03 });
  grip.rotation.z = -0.2; grip.position.set(0, 16, 0);
  const lever = hose([[74, 112, 0], [66, 92, 0], [52, 62, 0], [40, 44, 0]], 5, mat.chrome, 24, 10); lever.scale.z = 1.8;
  const nip = turned([[0.1, 0], [5.6, 0], [5.6, 13], [7.2, 15], [7.2, 18], [4.6, 20.5], [4.6, 27], [0.1, 28]], mat.brass, { along: "x" }); nip.rotation.y = PI; nip.position.set(-26, 9, 0);
  const g = group(gg, grip, lever, nip, at(capsule(16, 96, mat.chrome), 34, 126, 0), at(cyl(8, 24, mat.satin), 24, 142, -4),
    at(box(30, 18, 30, mat.satin, 4), -2, 9, 0), at(cyl(9, 8, mat.brass, { segs: 6, along: "x" }), -21, 9, 0),
    at(cyl(6, 28, mat.satin, { along: "z" }), 76, 114, 0), at(cyl(10, 12, mat.brass, { segs: 6, along: "x" }), 104, 126, 0), at(cyl(6, 8, mat.red, { along: "x" }), -32, 126, 0),
    hose([[108, 126, 0], [150, 118, 10], [178, 80, 30], [184, 30, 55], [205, 9, 95], [255, 9, 112], [292, 9, 108]], 6, mat.rubber, 120));
  const c = chuck(); c.position.set(290, 9, 108); c.rotation.y = 0.1; g.add(c);
  g.userData.yaw = -0.35; return g;
}
function tHandle(m) { // T-handle lying flat: bar along z, shaft along +x
  const bar = capsule(11, 84, m); bar.rotation.y = PI / 2; bar.scale.set(1, 0.85, 1);
  const g = group(bar, at(cyl(10, 24, m, { along: "x", r2: 7 }), 10, 0, 0), at(cyl(6.5, 10, mat.chrome, { along: "x" }), 26, 0, 0));
  [-1, 1].forEach((s) => { const e = at(cyl(11.4, 16, mat.rubber, { along: "z" }), 0, 0, s * 46); e.scale.x = 1; e.scale.y = 0.86; g.add(e); });
  return g;
}
function tirePlug() {
  const ream = tHandle(mat.red); ream.add(turned([[0.1, 30], [3.8, 30], [3.8, 40], ...grooved(4, 40, 112, 2.2, 0.9), [3, 116], [1.2, 124], [0.1, 126]], mat.chrome, { along: "x" }));
  const tip = at(cyl(3.7, 10, mat.chrome, { along: "x", r2: 0.4, segs: 4 }), 139, 0, 0); tip.scale.y = 0.33;
  const ins = tHandle(mat.red); ins.add(at(cyl(3.2, 60, mat.chrome, { along: "x" }), 60, 0, 0), at(box(44, 2.4, 7.5, mat.chrome, 0.8), 112, 0, 0), at(box(28, 2.6, 1.8, mat.hole, 0.3), 118, 0, 0), tip,
    at(box(9, 2.6, 84, L.plug, 1.1), 118, 0.4, 0));
  ream.position.set(0, 9.4, -60); ins.position.set(18, 9.4, 50); ins.rotation.y = -0.08;
  const g = group(ream, ins);
  for (let i = 0; i < 4; i++) { const s = at(box(110, 3, 9, L.plug, 1.2), 230 + i * 3, 1.5, -64 + i * 12); s.rotation.y = 0.04 * i - 0.06; g.add(s); }
  const tb = group(cyl(9, 50, L.alu, { along: "x" }), at(box(16, 2.5, 19, L.alu, 0.8), -32, 0, 0), at(cyl(9, 6, L.alu, { along: "x", r2: 5 }), 28, 0, 0),
    at(turned([[0.1, 0], ...grooved(6, 0, 12, 1.5, 0.5), [0.1, 12]], mat.black, { along: "x" }), 31, 0, 0), at(flat(decal("CEMENT", 34, 8, { color: "#a8000c" })), 0, 9.15, 0));
  tb.position.set(236, 9, 60); g.add(tb);
  g.userData.yaw = -0.25; return g;
}

/* ---------- bench vise ---------- */
function vise() {
  const gap = 36, g = group();
  g.add(at(turned([[0.1, 0], [78, 0], [80, 2], [80, 14], [74, 18], [60, 20], [0.1, 20]], mat.redp, { along: "y", segs: 64 }), -70, 0, 0), at(cyl(64, 8, mat.oxide, { segs: 64 }), -70, 24, 0));
  for (let k = 0; k < 3; k++) { const a = (k * 2 * PI) / 3 + PI / 6, e = group(at(box(40, 12, 44, mat.redp, 3), 80, 6, 0), at(cyl(7, 12.4, mat.hole), 88, 6, 0), at(cyl(10, 4, mat.chrome, { segs: 6 }), 88, 13.5, 0)); e.rotation.y = -a; e.position.x = -70; g.add(e); }
  [-1, 1].forEach((s) => g.add(at(cyl(4, 40, mat.chrome, { along: "z" }), -20, 20, s * 76), at(sphere(6, mat.rubber), -20, 20, s * 98)));
  // fixed casting, anvil and jaw
  g.add(at(box(140, 82, 88, mat.redp, 10), -70, 69, 0), at(box(44, 66, 130, mat.redp, 8), -22, 137, 0), at(box(80, 18, 72, mat.satin, 3), -100, 119, 0));
  [-1, 1].forEach((s) => g.add(at(box(110, 50, 4, mat.redp, 1.5), -72, 68, s * 45)));
  g.add(at(decal("125 MM", 70, 14, WHITE), -72, 68, 47.2));
  // moving jaw on its slide beam, screw and handle
  g.add(at(box(44, 66, 130, mat.redp, 8), 70, 137, 0), at(box(44, 70, 80, mat.redp, 8), 70, 82, 0), at(box(220, 52, 60, mat.redp, 6), -18, 76, 0));
  g.add(at(turned([[0.1, 0], [26, 0], [26, 10], [20, 16], [0.1, 16]], mat.redp, { along: "x" }), 92, 76, 0), at(cyl(9, 40, mat.chrome, { along: "x" }), 128, 76, 0),
    at(turned([[0.1, 0], [14, 0], [15, 3], [15, 24], [13, 27], [0.1, 27]], mat.chrome, { along: "x" }), 140, 76, 0),
    at(cyl(7, 232, mat.chrome), 154, 128, 0), at(sphere(11, mat.chrome), 154, 12, 0), at(sphere(11, mat.chrome), 154, 245, 0));
  // jaw plates, their screws, and the pipe jaws below
  [3, 9 + gap].forEach((x) => { g.add(at(box(6, 40, 124, mat.steel, 1), x, 150, 0)); for (const z of [-38, 38]) g.add(at(cyl(4, 1.4, mat.oxide, { segs: 6 }), x, 170.8, z)); });
  for (let i = 0; i < 4; i++) { g.add(at(box(6, 4, 40, mat.oxide, 0.8), 4, 100 + i * 6, 0), at(box(6, 4, 40, mat.oxide, 0.8), 6 + gap - 1, 100 + i * 6, 0)); }
  g.userData.yaw = -0.62; return g;
}

/* ---------- C-clamp ---------- */
function cClamp() {
  const fr = slab(poly([[-84, -54], [-80, -66], [-70, -74], [56, -74], [56, -54], [-56, -54], [-62, -50], [-64, -40], [-64, 40], [-62, 50], [-56, 54], [56, 54], [56, 74], [-70, 74], [-80, 66], [-84, 54]]), 16, 2, mat.redp);
  const scr = turned([[0.1, 0], [6.5, 0], ...grooved(7.5, 1, 140, 2.5, 1), [6, 142], [6, 152], [0.1, 152]], mat.satin, { along: "y" }); alongZ(scr); scr.position.set(50, 0, -32);
  const pad = turned([[0.1, 0], [12, 0], [13.5, 1.5], [13.5, 6], [8, 9], [0.1, 9]], mat.chrome, { along: "y" }); pad.rotation.x = -PI / 2; pad.position.set(50, 0, -27);
  const g = group(fr, scr, pad, at(cyl(15, 30, mat.redp, { along: "z" }), 50, 0, 64), at(cyl(12, 8, mat.satin, { along: "z" }), 50, 0, -50),
    at(cyl(4.5, 110, mat.chrome, { along: "x" }), 72, 0, 116), at(sphere(6.5, mat.chrome), 17, 0, 116), at(sphere(6.5, mat.chrome), 127, 0, 116),
    at(flat(decal("100 MM", 46, 12, WHITE)), -14, 10.2, 64));
  g.userData.yaw = -0.3; return g;
}

/* ---------- digital caliper ---------- */
function caliper() {
  const read = 25.4, f = -24 + read;
  const sc = canvasTex(1320, 96, (x, w, h) => {
    x.fillStyle = "#1c2026"; const px = w / 220;
    for (let mm = 0; mm <= 210; mm++) { const X = (mm + 10) * px, big = mm % 10 === 0, half = mm % 5 === 0; x.fillRect(X - 1.2, 0, 2.4, big ? 34 : half ? 24 : 15); }
    x.font = "700 26px Helvetica, Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    for (let mm = 0; mm <= 200; mm += 10) x.fillText(String(mm / 10), (mm + 10) * px, 52);
    for (let i = 0; i <= 80; i++) { const X = (10 + i * 2.54) * px; x.fillRect(X - 1, h - (i % 10 === 0 ? 22 : i % 5 === 0 ? 16 : 10), 2, 22); }
  });
  const lcd = canvasTex(512, 180, (x, w, h) => {
    x.fillStyle = "#a9b7a4"; x.fillRect(0, 0, w, h); x.fillStyle = "#192019";
    x.font = "700 128px ui-monospace, Menlo, monospace"; x.textAlign = "right"; x.textBaseline = "middle"; x.fillText(read.toFixed(2), w - 110, h / 2 + 6);
    x.font = "700 46px Helvetica, Arial, sans-serif"; x.textAlign = "left"; x.fillText("mm", w - 100, h / 2 + 30);
  });
  const P = (pts) => poly(pts.map(([px, pz]) => [px, -pz]));
  const fixed = [[-50, -8], [-30, -8], [-28.5, -25], [-25, -25], [-24, -8], [-24, 42], [-25.6, 48], [-28.6, 48], [-50, 14]];
  const moving = fixed.map(([px, pz]) => [f - 24 - px, pz]).reverse();
  const g = group(
    at(box(250, 3.4, 16, mat.satin, 0.8), 75, 1.7, 0), at(slab(P(fixed), 2.6, 0.4, mat.satin), 0, 1.7, 0), at(slab(P(moving), 2.6, 0.4, mat.satin), 0, 1.7, 0),
    at(flat(mesh(new THREE.PlaneGeometry(220, 15), printed(sc, { transparent: true, metalness: 0.2 }), false)), 86, 3.48, 0),
    at(box(80, 6.4, 24, mat.satin, 1), f + 40, 1.7, 0), at(box(66, 8, 34, mat.redp, 3), f + 44, 6, 7),
    at(box(44, 1, 17, mat.black, 0.4), f + 40, 10.2, 2), at(flat(mesh(new THREE.PlaneGeometry(40, 14), lit(lcd, 0.25), false)), f + 40, 10.75, 2),
    at(turned([[0.1, 0], ...grooved(4.5, 0, 5, 0.8, 0.4), [0.1, 5]], mat.satin, { along: "y", segs: 36 }), f + 82, 0, 9),
    at(turned([[0.1, 0], ...grooved(3.4, 0, 4, 0.8, 0.3), [0.1, 4]], mat.satin, { along: "y", segs: 30 }), f + 72, 4.9, -9),
    at(box(29.4, 1.2, 3.2, mat.satin, 0.3), 200 + read / 2 - 2, 1.7, 0),
  );
  [["ON/OFF", 24], ["ZERO", 40], ["mm/in", 56]].forEach(([t, dx]) => g.add(at(cyl(3.2, 2, mat.black), f + dx, 11, 17), at(flat(decal(t, 14, 3.4, WHITE)), f + dx, 10.1, 22.2)));
  g.userData.yaw = -0.18; return g;
}

/* ---------- micrometer ---------- */
// texture for a part turned along x: draw(ctx, lx, ly) gets axial (left = -x) and around coordinates in px, u=0 facing +z
function wrapTex(len, circ, px, draw) {
  return canvasTex(Math.round(circ * px), Math.round(len * px), (x, w, h) => { x.translate(0, h); x.rotate(-PI / 2); draw(x, h, w); });
}
const openCyl = (r, len, m) => mesh(new THREE.CylinderGeometry(r, r, len, 72, 1, true).rotateZ(-PI / 2), m);
function micrometer() {
  const read = 12.5, pxm = 24;
  const sleeveT = wrapTex(40, 2 * PI * 6.02, pxm, (x, w, h) => {
    x.fillStyle = "#c9ced3"; x.fillRect(0, 0, w, h); x.fillStyle = "#1a1d22"; const ly = 0.86 * h, m = pxm;
    x.fillRect(0, ly - 1.5, w, 3);
    for (let k = 0; k <= 25; k++) { const X = (2 + k) * m; x.fillRect(X - 1.5, ly - 2.2 * m, 3, 2.2 * m); if (k < 25) x.fillRect(X + 0.5 * m - 1.5, ly, 3, 1.5 * m); }
    x.font = `700 ${2.4 * m}px Helvetica, Arial, sans-serif`; x.textAlign = "center"; x.textBaseline = "middle";
    for (let k = 0; k <= 25; k += 5) x.fillText(String(k), (2 + k) * m, ly - 3.7 * m);
  });
  const thimT = wrapTex(22.5, 2 * PI * 8.62, pxm, (x, w, h) => {
    x.fillStyle = "#d3d8dd"; x.fillRect(0, 0, w, h); x.fillStyle = "#1a1d22";
    x.font = `700 ${1.9 * pxm}px Helvetica, Arial, sans-serif`; x.textAlign = "left"; x.textBaseline = "middle";
    for (let k = 0; k < 50; k++) { const ly = ((0.86 + (k - 25) / 50 + 1) % 1) * h; const big = k % 5 === 0; x.fillRect(0, ly - 1.4, (big ? 3.8 : 2.4) * pxm, 2.8); if (big) x.fillText(String(k), 4.6 * pxm, ly); }
  });
  const fs = new THREE.Shape(), Ro = 40, Ri = 26;
  fs.moveTo(-Ro, 8); fs.lineTo(-Ro, 0); fs.absarc(0, 0, Ro, PI, 2 * PI, false); fs.lineTo(Ro, 8); fs.lineTo(Ri, 8); fs.lineTo(Ri, 0); fs.absarc(0, 0, Ri, 2 * PI, PI, true); fs.lineTo(-Ri, 8); fs.closePath();
  const pad = new THREE.Shape(); pad.absarc(0, 0, 37.5, 1.12 * PI, 1.88 * PI, false); pad.absarc(0, 0, 28.5, 1.88 * PI, 1.12 * PI, true); pad.closePath();
  const t0 = 40 + 2 + read; // thimble edge
  const g = group(
    slab(fs, 9, 1, mat.chrome), at(slab(pad, 1.4, 0.4, mat.black), 0, 6.2, 0), at(flat(decal("0-25 mm  0.01", 34, 5.5, WHITE)), 0, 7.5, 33),
    at(cyl(7, 14, mat.chrome, { along: "x" }), -33, 0, 0), at(cyl(8, 14, mat.chrome, { along: "x" }), 33, 0, 0),
    at(cyl(3.2, 12, mat.satin, { along: "x" }), -20, 0, 0), at(cyl(3.2, 27.5, mat.satin, { along: "x" }), 12.25 - 14 + read, 0, 0),
    at(openCyl(6, 40, printed(sleeveT, { metalness: 0.5, roughness: 0.35 })), 60, 0, 0),
    at(cyl(6.2, 3, mat.chrome, { along: "x", r2: 8.6 }), t0 + 1.5, 0, 0),
    at(openCyl(8.6, 22.5, printed(thimT, { metalness: 0.5, roughness: 0.3 })), t0 + 3 + 11.25, 0, 0),
    at(turned([[8.6, 0], ...grooved(8.6, 0, 13, 0.9, 0.45), [6, 14], [0.1, 14]], mat.satin, { along: "x" }), t0 + 25.5, 0, 0),
    at(turned([[0.1, 0], [5.5, 0], ...grooved(5.5, 1, 14, 0.8, 0.35), [4.5, 15.5], [0.1, 16]], mat.chrome, { along: "x" }), t0 + 39.5, 0, 0),
    at(box(4, 3, 14, mat.chrome, 0.8), 33, 6, -12), at(cyl(4, 5, mat.chrome), 33, 5, -6),
  );
  g.userData.yaw = -0.22; return g;
}

/* ---------- feeler gauge ---------- */
function feeler() {
  const blade = (w0, w1, len, th, m) => { const s = new THREE.Shape(); s.moveTo(0, -w0); s.lineTo(len, -w1); s.absarc(len, 0, w1, -PI / 2, PI / 2, false); s.lineTo(0, w0); s.absarc(0, 0, w0, PI / 2, 1.5 * PI, false); const h = new THREE.Path(); h.absarc(0, 0, 2.2, 0, 2 * PI, true); s.holes.push(h); return slab(s, th, 0.12, m); };
  const sizes = [".0015", ".002", ".003", ".004", ".005", ".006", ".008", ".010", ".012", ".015", ".020", ".025"];
  const g = group(), dy = 0.62;
  const cover = (y, a) => { const c = blade(7.6, 5, 98, 1.2, mat.oxide); c.position.y = y; c.rotation.y = a; return c; };
  g.add(cover(-1.1, -0.02));
  sizes.forEach((t, i) => {
    const b = group(blade(6.4, 3.2, 95, 0.32, mat.satin), at(flat(decal(t, 17, 4.6)), 78, 0.33, 0)); b.position.y = i * dy; b.rotation.y = i * 0.112; g.add(b);
  });
  g.add(cover(sizes.length * dy + 0.6, -0.26), at(cyl(4.2, 1.2, mat.chrome), 0, sizes.length * dy + 1.9, 0), at(cyl(4.2, 1.2, mat.chrome), 0, -2.3, 0),
    at(turned([[0.1, 0], [5, 0], [5.4, 0.6], [5.4, 3], [4.6, 3.6], [0.1, 3.6]], mat.chrome, { along: "y", flutes: 14, flute: 0.05 }), 0, sizes.length * dy + 2.4, 0));
  g.userData.yaw = -0.05; return g;
}

/* ---------- dial indicator: lying on its back, stem toward the camera ---------- */
function dialIndicator() {
  const R = 25.5, tex = dialTex({ max: 100, major: 10, minor: 1, mid: 5, every: 10, full: true, unit: "0.01 mm", rev: true, ink: "#111418" });
  const n = needle(R * 0.92, mat.black, 1.3); n.rotation.y = -dialAngle(27, 100, true); n.position.y = 21.2;
  const sn = needle(2.6, mat.red, 0.5); sn.rotation.y = -(-PI / 2 + 0.6); sn.position.set(0, 21.1, -0.29 * R);
  const g = group(
    at(cyl(26, 3, mat.satin), 0, 1.5, 0), turned([[0.1, 3], [27, 3], [28, 4.5], [28, 16], [0.1, 16]], mat.satin, { along: "y", segs: 64 }),
    turned([[25.6, 16], [30.5, 16], [31.5, 17.5], [31.5, 22], [30.5, 23], [26.2, 23], [25.6, 22]], mat.chrome, { along: "y", segs: 96, flutes: 60, flute: 0.008 }),
    at(disc(R, lit(tex, 0.32)), 0, 20.5, 0), n, sn, at(cyl(2.4, 1.8, mat.chrome), 0, 21.6, 0),
    at(cyl(4.2, 20, mat.chrome, { along: "z" }), 0, 10, 38), at(cyl(2, 16, mat.satin, { along: "z" }), 0, 10, 56), at(sphere(2.8, mat.chrome), 0, 10, 65),
    at(cyl(3.5, 8, mat.chrome, { along: "z" }), 0, 10, -31), at(box(16, 3, 22, mat.satin, 1), 0, 1.5, -36),
    at(cyl(8, 3, mat.satin), 0, 1.5, -48), at(cyl(3.3, 3.4, mat.hole), 0, 1.5, -48),
  );
  [0.5, 1.15].forEach((a) => g.add(at(box(3, 2, 4, mat.red, 0.5), Math.cos(a) * 31.8, 22, Math.sin(-a) * 31.8)));
  g.userData.yaw = -0.3; return g;
}

/* ---------- cooling system pressure tester ---------- */
function pressureTester() {
  const tex = dialTex({ max: 30, major: 5, minor: 1, every: 5, unit: "PSI", zones: [[13, 17, "#2e9d4f"], [25, 30, "#c0141c"]], inner: { max: 2, step: 0.5, unit: "bar" } });
  const Y = 23, gg = gauge(34, tex, dialAngle(15, 30)); gg.position.set(176, Y + 34, 0);
  const T = capsule(10, 80, mat.black); T.rotation.y = PI / 2;
  const g = group(
    at(turned([[0.1, 0], [20, 0], [22, 2], [22, 150], [20, 152], [0.1, 152]], mat.redp, { along: "x" }), 0, Y, 0), at(turned([[22, 30], ...grooved(23.4, 32, 118, 4, 1.2), [22, 120]], mat.rubber, { along: "x" }), 0, Y, 0),
    at(cyl(22.5, 10, mat.chrome, { along: "x" }), -4, Y, 0), at(cyl(5, 34, mat.chrome, { along: "x" }), -26, Y, 0), at(T, -48, Y, 0),
    at(turned([[0.1, 0], [24, 0], [26, 3], [26, 36], [18, 44], [10, 44], [10, 56], [0.1, 56]], mat.oxide, { along: "x" }), 150, Y, 0),
    at(cyl(7, 24, mat.chrome), 176, Y + 26, 0), at(cyl(6, 8, mat.yellow, { along: "z" }), 178, Y, 28), gg,
    hose([[204, Y, 0], [244, Y - 6, 14], [272, 14, 56], [272, 22, 104], [252, 50, 132], [236, 46, 140], [232, 36, 140]], 7, mat.rubber, 100),
  );
  const ad = group(turned([[0.1, 0], [30, 0], [31, 2], [31, 16], [24, 20], [16, 26], [10, 26], [10, 34], [0.1, 34]], mat.oxide, { along: "y", segs: 64 }), at(flat(ring(28, 2.6, mat.rubber)), 0, 1.5, 0),
    at(box(74, 6, 10, mat.oxide, 2), 0, 5, 0), at(cyl(8, 4, mat.chrome, { segs: 6 }), 0, 36, 0));
  ad.position.set(232, 0, 140); g.add(ad);
  g.userData.yaw = -0.3; return g;
}

/* ---------- infrared thermometer ---------- */
function irThermometer() {
  const body = poly([[-22, 0], [24, 0], [28, 6], [42, 96], [52, 106], [118, 108], [128, 114], [128, 144], [120, 150], [-20, 150], [-26, 147], [-40, 104], [-28, 100], [-14, 96], [-26, 8]]);
  const over = poly([[-23, -1], [25, -1], [29, 6], [39.5, 78], [-16.5, 78], [-27, 8]]);
  const lcd = canvasTex(400, 400, (x, w, h) => {
    x.fillStyle = "#c2d8e6"; x.fillRect(0, 0, w, h); x.fillStyle = "#14202a"; x.textBaseline = "middle";
    x.font = "700 52px Helvetica, Arial, sans-serif"; x.textAlign = "left"; x.fillText("MAX 230.0", 26, 62);
    x.font = "700 150px ui-monospace, Menlo, monospace"; x.textAlign = "right"; x.fillText("212", w - 80, h / 2 + 30);
    x.font = "700 64px Helvetica, Arial, sans-serif"; x.textAlign = "left"; x.fillText("°F", w - 76, h / 2 + 10);
    x.font = "700 44px Helvetica, Arial, sans-serif"; x.fillText("EMS 0.95", 26, h - 46);
  });
  const n = V(-43, 14, 0).normalize(), sp = V(-33, 126, 0).addScaledVector(n, 5.4);
  const scr = mesh(new THREE.PlaneGeometry(32, 32), lit(lcd, 0.45), false); scr.position.copy(sp).addScaledVector(n, 0.9); scr.lookAt(scr.position.clone().add(n));
  const bez = box(38, 40, 1.4, mat.gloss, 0.5); bez.position.copy(sp); bez.lookAt(sp.clone().add(n));
  const g = group(plate(body, 40, 5, mat.redp), plate(over, 44, 3, mat.rubber), plate(poly([[44, 104], [66, 106], [64, 96], [56, 84], [48, 78], [43, 82]]), 16, 2, mat.black),
    at(turned([[0.1, 0], [17, 0], [18, 2], [18, 10], [15, 12], [0.1, 12]], mat.black, { along: "x" }), 131, 129, 0), at(mesh(new THREE.CircleGeometry(12, 48).rotateY(PI / 2), L.lens, false), 143.2, 129, 0),
    at(cyl(3.5, 4, L.laser, { along: "x" }), 133, 148, 0), scr, bez, at(ring(9, 1.6, mat.rubber), -22, 2, 0));
  [-11, 0, 11].forEach((z, i) => g.add(at(cyl(4, 2.4, i === 1 ? mat.yellow : mat.rubber), -4, 155.6, z)));
  g.add(at(flat(decal("°C/°F", 18, 5, WHITE)), 12, 155.2, 0));
  const side = new THREE.Shape(); side.moveTo(14, 118); side.lineTo(96, 118); side.quadraticCurveTo(104, 118, 104, 126); side.lineTo(104, 134); side.quadraticCurveTo(104, 142, 96, 142); side.lineTo(14, 142); side.quadraticCurveTo(6, 142, 6, 134); side.lineTo(6, 126); side.quadraticCurveTo(6, 118, 14, 118);
  g.add(plate(side, 51, 0.6, mat.gloss), at(decal("IR  -50~550°C", 80, 11, WHITE), 55, 130, 25.9), at(box(46, 2, 52, mat.gloss, 0.8), 74, 151, 0));
  for (let i = 0; i < 4; i++) g.add(at(box(2, 2, 46, mat.black, 0.8), 36 + i * 3.3 - 0.0, 18 + i * 18, 0));
  g.userData.yaw = 1.0; return g;
}

/* ---------- mechanic's stethoscope ---------- */
function stethoscope() {
  // probe along the front, hose looping back to the headset lying behind it
  const y = 13, hz = -150, g = group(
    at(turned([[0.1, 0], [8, 0], [12, 5], [13, 12], [13, 22], [10, 28], [6, 30], [6, 40], [0.1, 40]], mat.chrome, { along: "x" }), 0, y, 0),
    at(turned([[13.2, 4], [13.8, 6], [13.8, 22], [13.2, 24]], mat.red, { along: "x" }), 0, y, 0),
    at(turned([[0.1, 0], [3.5, 0], [3.5, 8], [2.4, 12], [2.2, 150], [1.2, 168], [0.1, 170]], mat.chrome, { along: "x" }), 40, y, 0),
    at(cyl(3.5, 14, mat.chrome, { along: "x" }), -7, y, 0),
    hose([[-12, y, 0], [-40, 8, -2], [-84, 4.5, -22], [-104, 4.5, -70], [-92, 4.5, -122], [-50, 4.5, hz - 2], [6, 4.5, hz]], 4.2, mat.rubber, 140),
    at(turned([[0.1, 0], [5, 0], [6.5, 6], [6.5, 10], [0.1, 12]], mat.chrome, { along: "x" }), 4, 6, hz),
    at(box(3, 1.6, 64, mat.chrome, 0.5), 96, 6, hz),
  );
  [-1, 1].forEach((s) => {
    g.add(hose([[14, 6, hz], [32, 6, hz + s * 13], [52, 6, hz + s * 24]], 3.2, mat.rubber, 32, 10),
      hose([[52, 6, hz + s * 24], [90, 6, hz + s * 33], [135, 6, hz + s * 32], [166, 6, hz + s * 19], [178, 6, hz + s * 10]], 1.8, mat.chrome, 60, 10));
    const tip = at(sphere(6, mat.rubber), 182, 6, hz + s * 7); tip.scale.set(1.3, 1, 1); g.add(tip);
  });
  g.userData.yaw = -0.2; return g;
}

/* ---------- three-jaw gear puller ---------- */
function gearPuller() {
  const g = group(
    turned([[0.1, 0], [2, 0], [11, 16], ...grooved(11, 18, 250, 3, 1.4), [12, 252], [0.1, 252]], mat.chrome, { along: "y" }),
    at(cyl(16, 20, mat.chrome, { segs: 6 }), 0, 262, 0), at(cyl(13, 4, mat.chrome), 0, 251, 0),
    at(turned([[0.1, -16], [24, -16], [27, -12], [27, 12], [24, 16], [0.1, 16]], mat.oxide, { along: "y" }), 0, 170, 0),
  );
  [-PI / 2, PI / 6, (5 * PI) / 6].forEach((th) => {
    const a = group(at(box(64, 22, 26, mat.oxide, 4), 50, 170, 0), at(box(22, 36, 34, mat.oxide, 4), 82, 170, 0), at(cyl(5, 38, mat.satin, { along: "z" }), 82, 170, 0));
    const jaw = at(box(17, 168, 24, mat.oxide, 3), 74, 88, 0); jaw.rotation.z = -0.09; a.add(jaw);
    const hook = at(box(30, 13, 24, mat.oxide, 2.5), 58, 8, 0); a.add(hook, at(cyl(3, 8, mat.oxide, { along: "x", r2: 5 }), 44, 10, 0));
    a.rotation.y = -th; g.add(a);
  });
  g.userData.yaw = -0.25; return g;
}

/* ---------- seal puller ---------- */
function gripHandle(len = 112, r = 13, m = mat.red) { // dipped, gently lobed grip along +x
  return group(turned([[0.1, 0], [r * 0.7, 0.5], [r * 0.92, 4], [r, 16], [r * 0.96, len * 0.7], [r * 0.8, len * 0.9], [r * 0.6, len], [0.1, len]], m, { along: "x", flutes: 4, flute: 0.06 }),
    turned([[0.1, -0.3], [r * 0.72, 0.2], [r * 0.95, 4], [r * 1.0, 14], [0.1, 14]], mat.black, { along: "x", flutes: 4, flute: 0.06 }));
}
function sealPuller() {
  const hook = slab(poly([[266, -4.5], [266, 4.5], [300, 4], [324, 0], [338, -10], [344, -26], [338, -42], [326, -50], [312, -50], [318, -44], [330, -38], [333, -26], [328, -14], [316, -6], [298, -4.5]]), 3.5, 0.8, mat.chrome);
  const g = group(gripHandle(), at(cyl(8.5, 12, mat.chrome, { along: "x", segs: 6 }), 116, 0, 0), at(box(150, 6, 10, mat.chrome, 2), 196, 0, 0), hook);
  g.userData.yaw = -0.2; return g;
}

/* ---------- ball joint separator (pickle fork) ---------- */
function ballJoint() {
  const s = new THREE.Shape(); s.moveTo(0, -26); s.lineTo(40, -27); s.lineTo(102, -16); s.quadraticCurveTo(107, -13, 102, -9.5); s.lineTo(44, -9);
  s.absarc(44, 0, 9, -PI / 2, PI / 2, true); s.lineTo(102, 9.5); s.quadraticCurveTo(107, 13, 102, 16); s.lineTo(40, 27); s.lineTo(0, 26); s.closePath();
  const fork = slab(s, 22, 1.5, mat.chrome), p = fork.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); if (x > 30) p.setY(i, -12.5 + (y + 12.5) * (1 - 0.82 * Math.min(1, (x - 30) / 75))); }
  fork.geometry.computeVertexNormals();
  const g = group(at(turned([[0.1, 0], [14, 0], [16, 2], [16, 14], [13, 16], [0.1, 16]], mat.chrome, { along: "x" }), 0, 0, 0),
    at(capsule(14.5, 100, mat.red), 70, 0, 0), at(cyl(15.3, 12, mat.black, { along: "x" }), 20, 0, 0), at(cyl(15.3, 12, mat.black, { along: "x" }), 124, 0, 0),
    at(cyl(16, 14, mat.chrome, { along: "x", segs: 6 }), 144, 0, 0), at(cyl(11, 122, mat.chrome, { along: "x", segs: 8 }), 212, 0, 0), at(fork, 270, 0, 0));
  g.userData.yaw = -0.22; return g;
}

/* ---------- brake caliper piston wind-back tool ---------- */
function brakeTool() {
  const y = 26, T = group(at(cyl(5, 120, mat.chrome, { along: "z" }), 0, 0, 0), at(capsule(8, 30, mat.rubber), 0, 0, 52), at(capsule(8, 30, mat.rubber), 0, 0, -52));
  T.children[1].rotation.y = PI / 2; T.children[2].rotation.y = PI / 2;
  const g = group(
    at(turned([[0.1, 20], [8, 20], ...grooved(8, 22, 228, 2.5, 1), [7, 230], [0.1, 230]], mat.chrome, { along: "x" }), 0, y, 0),
    at(turned([[0.1, 0], [24, 0], [26, 2], [26, 12], [22, 14], [0.1, 14]], mat.satin, { along: "x" }), 0, y, 0),
    at(cyl(3, 8, mat.chrome, { along: "x" }), -4, y, 13), at(cyl(3, 8, mat.chrome, { along: "x" }), -4, y, -13), at(box(10, 10, 10, mat.satin, 1), 18, y, 0),
    at(box(16, 34, 150, mat.satin, 3), 120, y, 0), at(box(36, 36, 40, mat.oxide, 4), 132, y, 0),
    at(turned([[0.1, 0], [11, 0], [12, 3], [12, 16], [10, 18], [0.1, 18]], mat.chrome, { along: "x" }), 228, y, 0), at(T, 240, y, 0),
  );
  [-1, 1].forEach((s) => g.add(at(cyl(5, 74, mat.satin, { along: "x" }), 76, y, s * 60), at(cyl(11, 6, mat.oxide, { along: "x" }), 40, y, s * 60), at(cyl(9, 7, mat.chrome, { along: "x", segs: 6 }), 106, y, s * 60)));
  const cube = group(box(34, 34, 34, mat.satin, 3), at(cyl(3, 6, mat.chrome), -8, 20, 0), at(cyl(3, 6, mat.chrome), 8, 20, 0), at(box(36, 1, 4, mat.hole, 0.3), 0, 17.1, 9));
  cube.position.set(50, 17, 112); cube.rotation.y = 0.4; g.add(cube);
  const d2 = group(turned([[0.1, 0], [22, 0], [23, 2], [23, 10], [21, 12], [0.1, 12]], mat.satin, { along: "y" }));
  for (let k = 0; k < 3; k++) { const a = (k * 2 * PI) / 3; d2.add(at(cyl(2.8, 6, mat.chrome), Math.cos(a) * 14, 15, Math.sin(a) * 14)); }
  d2.position.set(124, 0, 116); g.add(d2);
  g.userData.yaw = -0.3; return g;
}

/* ---------- strut spring compressor (a pair) ---------- */
function springRod(sign, xMove) {
  const g = group(at(turned([[0.1, 0], [8, 0], ...grooved(9, 2, 320, 2.6, 1.1), [7, 322], [0.1, 323]], mat.chrome, { along: "x" }), 0, 0, 0),
    at(cyl(14, 16, mat.chrome, { along: "x", segs: 6 }), -8, 0, 0), at(cyl(12, 3, mat.chrome, { along: "x" }), 1.5, 0, 0));
  const claw = (x, dir) => {
    const pts = [[-12, 8], [10, 8], [10, 46], [22, 49], [30, 56], [30, 62], [22, 68], [2, 70], [-10, 64], [-12, 54]].map(([a, b]) => [a * dir, -b * sign]);
    return group(at(box(34, 28, 30, mat.oxide, 4), x, 0, 0), at(slab(poly(pts), 16, 2, mat.redp), x, 0, 0), at(cyl(2.5, 10, mat.chrome), x, 15, 0));
  };
  g.add(claw(30, 1), claw(xMove, -1)); return g;
}
function springCompressor() {
  const a = springRod(-1, 230), b = springRod(1, 196); a.position.z = -34; b.position.z = 34; b.position.x = 14;
  const g = group(a, b); g.userData.yaw = -0.25; return g;
}

/* ---------- flaring tool ---------- */
function flaringTool() {
  const holes = [["3/16", 4.8], ["1/4", 6.4], ["5/16", 7.9], ["3/8", 9.5], ["7/16", 11.1], ["1/2", 12.7], ["5/8", 15.9]];
  const g = group(at(box(180, 22, 15, mat.satin, 1.5), 0, 11, 7.8), at(box(180, 22, 15, mat.satin, 1.5), 0, 11, -7.8));
  let x = -64; const xs = [];
  holes.forEach(([, d]) => { xs.push(x); g.add(at(cyl(d / 2, 22.6, mat.hole), x, 11, 0), at(cyl(d / 2, 2.4, mat.hole, { r2: d / 2 + 1.8 }), x, 21.4, 0)); x += d + 10.5; });
  const tags = canvasTex(1024, 48, (c, w, h) => { c.fillStyle = "#20252c"; c.font = "700 30px Helvetica, Arial, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; holes.forEach(([t], i) => c.fillText(t, ((xs[i] + 90) / 180) * w, h / 2)); });
  g.add(at(flat(mesh(new THREE.PlaneGeometry(180, 8.4), new THREE.MeshBasicMaterial({ map: tags, transparent: true, depthWrite: false, opacity: 0.9 }), false)), 0, 22.6, 11));
  [-80, 80].forEach((wx) => g.add(at(cyl(4, 42, mat.satin, { along: "z" }), wx, 11, 0), at(cyl(7, 8, mat.satin, { along: "z" }), wx, 11, 20), at(box(34, 7, 3.4, mat.satin, 1.2), wx, 11, 22),
    at(cyl(7, 6, mat.satin, { along: "z", segs: 6 }), wx, 11, -18.5)));
  const yx = xs[3];
  const yk = plate(poly([[-27, 4], [-15, 4], [-15, 9], [-18, 10], [-18, 34], [18, 34], [18, 10], [15, 9], [15, 4], [27, 4], [27, 44], [18, 58], [-18, 58], [-27, 44]]), 16, 1.5, mat.oxide);
  yk.rotation.y = PI / 2; yk.position.set(yx, 0, 0); g.add(yk);
  g.add(at(turned([[0.1, 22], [6, 30], ...grooved(6, 30, 104, 1.6, 0.7), [0.1, 104]], mat.chrome, { along: "y" }), yx, 0, 0),
    at(cyl(8, 12, mat.chrome), yx, 108, 0), at(cyl(4, 90, mat.chrome, { along: "x" }), yx, 110, 0), at(sphere(6, mat.chrome), yx - 45, 110, 0), at(sphere(6, mat.chrome), yx + 45, 110, 0));
  for (let i = 0; i < 3; i++) g.add(at(turned([[0.1, 0], [6 + i, 0], [6 + i, 8], [3, 12], [0.1, 12]], mat.satin, { along: "y" }), -40 + i * 26, 0, 44));
  g.userData.yaw = -0.3; return g;
}

/* ---------- tubing cutter, on a piece of copper tube ---------- */
function tubingCutter() {
  const g = group(
    at(cyl(11, 220, mat.copper, { along: "z" }), 0, 44, 0), at(cyl(9.4, 220.6, mat.hole, { along: "z" }), 0, 44, 0),
    at(box(70, 22, 22, mat.redp, 4), 0, 11, 0), at(box(16, 112, 22, mat.redp, 4), 43, 56, 0), at(box(70, 16, 22, mat.redp, 4), 16, 106, 0),
    at(box(34, 24, 18, mat.satin, 3), 0, 80, 0),
    alongZ(at(turned([[0.1, -2.6], [10, -2.6], [13, 0], [10, 2.6], [0.1, 2.6]], mat.chrome, { along: "y", segs: 48 }), 0, 66, 0)),
    at(cyl(3, 21, mat.chrome, { along: "z" }), 0, 66, 0), at(cyl(4, 30, mat.chrome), 0, 112, 0),
    at(turned([[0.1, 0], [14, 0], [16, 3], [16, 20], [14, 24], [0.1, 24]], mat.chrome, { along: "y", flutes: 18, flute: 0.05 }), 0, 114, 0),
    at(plate(poly([[0, 0], [16, 8], [0, 18]]), 3, 0.6, mat.oxide), 52, 22, 0),
    at(decal("4-28 MM", 40, 8, WHITE), 0, 11, 11.2),
  );
  [-14, 14].forEach((rx) => g.add(alongZ(at(turned([[0.1, -10], [6.5, -10], ...grooved(7.5, -9, 9, 1.5, 0.5), [6.5, 10], [0.1, 10]], mat.satin, { along: "y" }), rx, 33, 0)), at(cyl(2.6, 23, mat.chrome, { along: "z" }), rx, 33, 0)));
  g.userData.yaw = -0.75; return g;
}

/* ---------- telescoping magnetic pickup ---------- */
function pickup() {
  const y = 7.2, g = group(
    at(turned([[0.1, 0], [5, 0], [6.2, 2], [6.2, 10]], mat.chrome, { along: "x" }), 0, y, 0),
    at(turned([[6.2, 10], [7.2, 12], ...grooved(7.2, 14, 86, 2.4, 0.5), [7.2, 90], [6, 92]], mat.red, { along: "x" }), 0, y, 0),
    at(cyl(6, 10, mat.chrome, { along: "x" }), 96, y, 0), at(box(64, 1.4, 4.2, mat.chrome, 0.5), 40, y + 7.9, 0), at(box(6, 4, 4.2, mat.chrome, 0.8), 10, y + 6.5, 0), at(sphere(2.2, mat.chrome), 70, y + 7.2, 0),
  );
  let x = 100; [[4.8, 76], [4.1, 72], [3.4, 68], [2.7, 64]].forEach(([r, len]) => { g.add(at(cyl(r, len + 4, mat.chrome, { along: "x" }), x + len / 2 - 2, y, 0), at(cyl(r + 0.5, 3, mat.chrome, { along: "x" }), x + len - 1.5, y, 0)); x += len; });
  g.add(at(turned([[0.1, 0], [5.5, 0], [6.5, 2], [6.5, 14], [6, 16], [0.1, 16]], mat.chrome, { along: "x" }), x, y, 0), at(cyl(6.6, 3, mat.red, { along: "x" }), x + 6, y, 0), at(cyl(4.5, 0.6, mat.oxide, { along: "x" }), x + 16.2, y, 0),
    at(cyl(5, 4, mat.chrome, { along: "x", segs: 6 }), x + 18.5, y + 1, 0), at(cyl(2.2, 4.4, mat.hole, { along: "x" }), x + 18.5, y + 1, 0));
  g.userData.yaw = -0.25; return g;
}

/* ---------- inspection mirror ---------- */
function inspectionMirror() {
  const y = 8, g = group(
    at(turned([[0.1, 0], [6, 0], [7.6, 3], [7.6, 10]], mat.black, { along: "x" }), 0, y, 0),
    at(turned([[7.6, 10], [8, 12], ...grooved(8, 14, 96, 3, 0.7), [8, 100], [6, 104]], mat.red, { along: "x" }), 0, y, 0),
    at(cyl(5.4, 8, mat.chrome, { along: "x" }), 106, y, 0),
  );
  let x = 108; [[4.2, 86], [3.5, 82], [2.8, 78]].forEach(([r, len]) => { g.add(at(cyl(r, len + 4, mat.chrome, { along: "x" }), x + len / 2 - 2, y, 0), at(cyl(r + 0.5, 3, mat.chrome, { along: "x" }), x + len - 1.5, y, 0)); x += len; });
  g.add(at(sphere(5, mat.chrome), x + 3, y, 0), span(cyl(2, 14, mat.chrome), [x + 3, y, 0], [x + 14, y + 4, 0]));
  const m = group(turned([[0.1, -4], [24, -4], [27, -2], [28.5, 0], [28.5, 1.5], [0.1, 1.5]], mat.black, { along: "y", segs: 64 }), at(flat(ring(27.3, 1.5, mat.chrome)), 0, 1.6, 0), at(disc(26.6, mat.glass), 0, 1.7, 0));
  m.rotation.x = 0.6; m.rotation.y = 0.2; m.position.set(x + 41, y + 18, 0); g.add(m);
  g.userData.yaw = -0.25; return g;
}

/* ---------- headlamp ---------- */
function headlamp() {
  const fab = canvasTex(1024, 64, (x, w, h) => {
    x.fillStyle = "#17191c"; x.fillRect(0, 0, w, h);
    x.fillStyle = "rgba(255,255,255,.05)"; for (let i = 0; i < w; i += 6) x.fillRect(i, 0, 2, h);
    x.fillStyle = "#b3000f"; x.fillRect(0, 6, w, 5); x.fillRect(0, h - 11, w, 5);
    x.fillStyle = "#9aa1a8"; for (let i = 0; i < w; i += 40) x.fillRect(i, h / 2 - 3, 24, 6);
  });
  fab.wrapS = THREE.RepeatWrapping; fab.repeat.set(3, 1);
  const band = mesh(new THREE.CylinderGeometry(1, 1, 32, 96, 1, true).scale(72, 1, 88), new THREE.MeshStandardMaterial({ map: fab, roughness: 0.85, side: THREE.DoubleSide }));
  band.position.y = 16;
  const g = group(band,
    at(box(64, 36, 8, mat.black, 3), 0, 18, 92), at(box(58, 30, 26, mat.redp, 8), 0, 19, 106), at(cyl(5, 66, mat.rubber, { along: "x" }), 0, 10, 100),
    at(ring(11.5, 1.8, mat.chrome), -10, 19, 119.6), at(cyl(3, 6, ds(mat.chrome), { along: "z", r2: 11 }), -10, 19, 116.4), at(sphere(2.6, L.led), -10, 19, 115.6),
    at(box(16, 10, 1.4, L.led, 0.4), 15, 19, 119.4), at(box(20, 14, 1, mat.black, 0.3), 15, 19, 118.9),
    at(cyl(5, 3, mat.rubber), 8, 35, 106), at(box(60, 26, 16, mat.black, 5), 0, 16, -95), at(box(30, 0.8, 0.8, mat.grey, 0.2), 0, 20, -103.2), at(box(3, 3, 1, L.green, 0.3), 18, 22, -103.4),
  );
  [-1, 1].forEach((s) => g.add(at(box(4, 26, 22, mat.black, 1.5), s * 74.5, 16, 0)));
  g.userData.yaw = -0.45; return g;
}

/* ---------- flashlight ---------- */
function flashlight() {
  const body = turned([[0.1, 0], [12, 0], [13.5, 2], ...grooved(13.5, 3, 20, 1.4, 0.5), [13.5, 22], [12.8, 24], [12.8, 38], ...grooved(13.2, 40, 110, 1.3, 0.6), [12.8, 112], [12.8, 140], [19.5, 170], [19.5, 196], [16, 196]], L.anod, { along: "x", segs: 48 });
  const g = group(body, at(turned([[0.1, -4], [8, -4], [10, -2], [10, 0.5]], mat.rubber, { along: "x" }), 0, 0, 0),
    at(turned([[16, 194], [20.4, 194], [20.4, 200], [16, 200]], mat.chrome, { along: "x", segs: 8 }), 0, 0, 0),
    at(turned([[4, 182], [16, 199]], ds(mat.chrome), { along: "x" }), 0, 0, 0), at(sphere(3, L.led), 183, 0, 0),
    at(cyl(20, 10, L.anod, { along: "x", segs: 8 }), 160, 0, 0),
    at(cyl(13.6, 6, mat.oxide, { along: "x" }), 30, 0, 0), at(box(70, 1.6, 7, mat.oxide, 0.6), 66, 14.2, 0),
  );
  const lab = decal("1000 LM", 40, 7, WHITE); lab.position.set(126, 13 * Math.sin(PI / 4), 13 * Math.cos(PI / 4)); lab.rotation.x = -PI / 4; g.add(lab);
  const w = group(g); g.position.y = 19.5; g.rotation.z = 0.032; w.userData.yaw = -0.7; return w;
}

// A 300 lumen slim pocket light (ECPNI032R): a flat black rubber bar, red face (lookOf paints it), a long window with
// a yellow COB strip on a white reflector at one end, "Snap-on" printed at the other and a lanyard hole in the end
function pocketLight() {
  const g = group(at(box(178, 14, 36, mat.rubber, 6), 0, 7, 0), at(box(166, 3, 30, mat.redp, 1.4), 0, 14.4, 0));
  for (let i = 0; i < 8; i++) for (const s of [-1, 1]) g.add(at(box(6, 10, 2.6, mat.black, 1), 20 + i * 8.6, 7, s * 18.4)); // grip ribs
  g.add(at(box(78, 2, 22, mat.black, 1.4), -38, 16.2, 0), at(box(72, 1.4, 17, mat.white, 0.6), -38, 16.8, 0), at(box(42, 1.4, 6, L.cob, 0.5), -40, 17.4, 0));
  g.add(at(flat(decal("Snap-on", 60, 15, { color: "#15181c", font: "italic 900 80px Helvetica, Arial, sans-serif" })), 46, 16.1, 0));
  g.add(at(box(2, 6, 10, mat.hole, 0.4), -89.2, 7, 0), at(cyl(1.2, 1, mat.black, { segs: 12 }), 4, 16.2, 0));
  g.rotation.x = 0.5; const w = group(g); w.userData.yaw = -0.35; return w;
}

// A 545 lumen project light (ECPRB042): a black rounded-octagon puck with a colored rubber bumper down its left side,
// one round lens with a big LED, standing on a hinged black stand. The bumper is red; lookOf() paints it orange or green.
function puckLight() {
  const R = 46, D = 28, oct = (r) => [...Array(8)].map((_, i) => { const a = PI / 8 + (i * PI) / 4; return [Math.cos(a) * r, Math.sin(a) * r]; });
  const prism = (pts, d, m, b = 3) => { const g = new THREE.ExtrudeGeometry(poly(pts), { depth: d - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 4 }); g.translate(0, 0, -(d - 2 * b) / 2); return mesh(g, m); };
  const zt = (prof, m, segs) => { const t = turned(prof, m, { along: "y", segs }); t.geometry.rotateX(PI / 2); return t; }; // faces +z
  const bump = mat.redp;
  const head = group(prism(oct(R), D, mat.black));
  const left = oct(R + 3.4).filter(([x]) => x < 1); head.add(prism([[0, left[0][1]], ...left, [0, left.at(-1)[1]]], D - 6, bump, 2.4));
  head.add(at(zt([[0.1, 0], [27, 0], [27, 2.4], [24, 3], [0.1, 3]], mat.chrome, 64), 0, 2, D / 2 - 1));
  head.add(at(zt([[0.1, 0], [22, 0], [22, 1.4], [0.1, 1.4]], L.lens, 64), 0, 2, D / 2 + 1.6));
  head.add(at(zt([[0.1, 0], [10, 0], [9, 1.6], [0.1, 2]], L.led, 48), 0, 2, D / 2 + 2.6));
  head.add(at(decal("Snap-on", 26, 6, { color: "#e8590c" }), 14, -28, D / 2 + 0.3));
  head.add(at(cyl(4, 2, mat.rubber, { along: "y" }), 0, R * 0.92 + 1, 0)); // power button on top
  head.position.y = 16 + R; head.rotation.x = -0.18;
  const g = group(head, at(box(78, 8, 58, mat.black, 3.5), 0, 4, -4), at(cyl(5, 46, mat.black, { along: "x" }), 0, 13, 0));
  for (const s of [1, -1]) g.add(at(box(8, 18, 12, mat.black, 2), s * 27, 14, 0));
  g.userData.yaw = -0.45; return g;
}

export const MODELS = {
  shop: () => shopLight(), "puck-light": () => puckLight(), "pocket-light": () => pocketLight(), "floor-jack": () => floorJack(), "jack-stand": () => jackStands(), funnel: () => funnel(), "air-hose": () => airHose(),
  "tire-gauge": () => tireGauge(), "tire-inflator": () => tireInflator(), "tire-plug": () => tirePlug(), vise: () => vise(), clamp: () => cClamp(),
  caliper: () => caliper(), micrometer: () => micrometer(), feeler: () => feeler(), "dial-indicator": () => dialIndicator(), "pressure-gauge": () => pressureTester(),
  thermometer: () => irThermometer(), stethoscope: () => stethoscope(), puller: () => gearPuller(), "seal-puller": () => sealPuller(), "ball-joint": () => ballJoint(),
  "brake-tool": () => brakeTool(), "spring-compressor": () => springCompressor(), flaring: () => flaringTool(), "tubing-cutter": () => tubingCutter(),
  pickup: () => pickup(), mirror: () => inspectionMirror(), headlamp: () => headlamp(), flashlight: () => flashlight(),
};
