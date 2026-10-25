// BoxTally 3D tools.
// Real 3D models of the most common tools, built from simple shapes with three.js (a 3D engine that
// runs in the browser) and lit with a studio light so chrome reflects like it does in a catalog photo.
// The page loads this file only when it needs it. Cards get a still picture of the model; tapping a
// tool opens it in a view you can spin around. Tools without a model keep their 2D drawing.
//
// Sizes are in millimetres. Flat tools are drawn lying on the bench: x runs along the tool, y is up
// and z points at the camera.
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { THREE, Q, mat, PI, DRIVES, mesh, slab, circle, poly, starPath, turned, cyl, box, tube, sphere, capsule, at, group, label } from "./kit3d.js";

import { ratchet, socket, insertBit, openHead, boxHead, wrench, handle, screwdriver, nutdriver, pick, pliers, extension, breaker, adapter, hammer, prybar, punch, torque, hexkeys, socketRail, wrenchSet, JAWS } from "./core3d.js";

// More tools live in their own files, grouped by kind. One broken file only loses its own tools.
const EXTRA = await Promise.all(["./power3d.js", "./storage3d.js", "./shop3d.js", "./hand3d.js"].map((p) => import(p).then((m) => m.MODELS, (e) => { console.error("3D models failed to load", p, e); return {}; })));
// Sockets lie on their side like a catalog shot: opening toward the camera, size stamp facing up,
// so you see the hex inside, the barrel and the square drive end instead of a round top.
function lying(s, yaw = 0.62, spin = 0) {
  s.rotation.y = spin; const tip = group(s); tip.rotation.x = -PI / 2;
  s.traverse((m) => { const t = m.material?.map; if (t?.isCanvasTexture) { t.center.set(0.5, 0.5); t.rotation = PI; } }); // keep printed sizes upright
  bright(s); // a lying barrel mostly mirrors the dark studio; lift it like a catalog shot
  return turnTo(group(tip), yaw + PI);
}
const brightChrome = mat.chrome.clone(); Object.assign(brightChrome, { roughness: 0.14, envMapIntensity: 1.7 }); brightChrome.color.set(0xffffff);
function bright(o) { o.traverse((m) => { if (m.material === mat.chrome) m.material = brightChrome; }); return o; }
function turnTo(o, yaw) { o.userData.yaw = yaw; return o; }
// which socket a set's pieces are (from the set's part number)
const SET_SOCKET = { "socket-12": { points: 12 }, "socket-deep": { deep: true }, "socket-impact": { impact: true }, "socket-swivel": { swivel: true } };
const MODELS = {
  // Snap-on ratchets are hard-handle (chrome) unless the part is a soft grip one; "-soft" keys get the red grip.
  ...Object.fromEntries([["ratchet", {}], ["ratchet-long", { len: 280 }], ["ratchet-stubby", { len: 115 }], ["ratchet-flex", { flex: true }], ["ratchet-long-flex", { len: 280, flex: true }],
    ["ratchet-round", { round: true }], ["ratchet-thumbwheel", { thumb: true }]].flatMap(([k, o]) => [[k, (x = {}) => ratchet({ ...o, drive: x.drive, pn: x.pn, look: x.look, grip: false })], [k + "-soft", (x = {}) => ratchet({ ...o, drive: x.drive, pn: x.pn, look: x.look, grip: true })]])),
  "ratchet-hard": (x = {}) => ratchet({ drive: x.drive, pn: x.pn, look: x.look, grip: false }),
  socket: (o) => lying(socket(o)), "socket-12": (o) => lying(socket({ ...o, points: 12 })), "socket-deep": (o) => lying(socket({ ...o, deep: true })), "socket-impact": (o) => lying(socket({ ...o, impact: true, r: 12 })),
  "socket-spark": (o) => lying(socket({ ...o, deep: true, r: 11.5, spark: true })), "socket-o2": (o) => lying(socket({ ...o, deep: true, r: 13, slot: true }), 0.9, 0.2), "socket-swivel": (o) => lying(socket({ ...o, swivel: true })), "socket-bit": (o) => lying(socket({ ...o, h: 20, bit: true })),
  ...Object.fromEntries([["wrench", "combo"], ["wrench-open", "open"], ["wrench-box", "box"], ["wrench-ratchet", "ratchet"], ["wrench-flare", "flare"], ["wrench-speed", "speed"], ["wrench-rbox", "rbox"]].map(([k, style]) => [k, (o) => wrench({ ...o, style })])),
  screwdriver: (o = {}) => screwdriver({ pn: o.pn }), "screwdriver-phillips": (o = {}) => screwdriver({ tip: "phillips", pn: o.pn }), "screwdriver-torx": (o = {}) => screwdriver({ tip: "torx", pn: o.pn }),
  "screwdriver-stubby": (o = {}) => screwdriver({ len: 120, hlen: 70, r: 14, pn: o.pn }), "screwdriver-stubby-phillips": (o = {}) => screwdriver({ tip: "phillips", len: 120, hlen: 70, r: 14, pn: o.pn }),
  insulated: (o = {}) => screwdriver({ m: mat.yellow, insulated: true, pn: o.pn }), nutdriver: (o = {}) => nutdriver({ size: o.size, pn: o.pn }),
  "insert-bit": (o = {}) => insertBit({ tip: (o.look.find((w) => /^t-/.test(w)) || "t-ph").slice(2), long: o.look.includes("long") }),
  pick: (o = {}) => pick({ pn: o.pn }), "pick-straight": (o = {}) => pick({ shape: "straight", pn: o.pn }), "pick-45": (o = {}) => pick({ shape: "45", pn: o.pn }), "pick-complex": (o = {}) => pick({ shape: "complex", pn: o.pn }),
  pliers: (o = {}) => pliers({ pn: o.pn }), "pliers-needle": (o = {}) => pliers({ jaw: "needle", pn: o.pn }), "pliers-diag": (o = {}) => pliers({ jaw: "diag", pn: o.pn }), "pliers-pump": (o = {}) => pliers({ pump: true, pn: o.pn }), "pliers-strip": (o = {}) => pliers({ jaw: "strip", pn: o.pn }),
  extension: (o = {}) => bright(extension({ drive: o.drive, size: o.size, pn: o.pn })), breaker: (o = {}) => breaker({ pn: o.pn }), adapter: () => turnTo(bright(adapter()), 1.05),
  hammer: (o = {}) => hammer({ pn: o.pn }), "hammer-ballpeen": (o = {}) => hammer({ pn: o.pn }), "hammer-deadblow": (o = {}) => hammer({ kind: "deadblow", pn: o.pn }), "hammer-mallet": (o = {}) => hammer({ kind: "mallet", pn: o.pn }), "hammer-sledge": (o = {}) => hammer({ kind: "sledge", pn: o.pn }),
  pry: (o = {}) => prybar({ pn: o.pn }), punch: () => punch({ chisel: true }), "punch-pin": () => punch(), torque: (o = {}) => torque({ electronic: true, pn: o.pn }), "torque-click": (o = {}) => torque({ pn: o.pn }), hexkeys: () => hexkeys(),
  set: (o = {}) => socketRail({ drive: o.drive, sae: /SAE/i.test(o.size || ""), list: o.sizes?.length ? o.sizes : null, kind: SET_SOCKET[o.member] || {} }), "socket-rail": (o = {}) => socketRail({ drive: o.drive, sae: /SAE/i.test(o.size || "") }), "set-wrench": (o = {}) => wrenchSet(o.sizes?.length ? { sizes: o.sizes, member: o.member } : {}),
};
Object.assign(MODELS, ...EXTRA);
export const has = (key) => key in MODELS;
export const keys = () => Object.keys(MODELS);

// The wrench gap and printed size come from the size the page already worked out ("13 mm", '9/16"').
// The drive ('1/2"') sets a ratchet's square, length and stamp, a socket's drive hole and a cordless impact's anvil.
// A ratchet also carries its part number stamped on the handle, like the real one.
// The look ("long+ind", "rev", "c-gm") is how this one differs inside its kind: a long wrench, a reversible
// ratcheting one, the black industrial finish, a gunmetal cordless tool. See lookOf() in app.js.
function opts(key, size, drive, pn, look = "") {
  const o = { look: String(look || "").split("+").filter(Boolean) }; const d = String(drive || "").replace(/"/g, ""); if (DRIVES[d]) o.drive = d;
  if (/^[A-Z0-9-]{2,14}$/.test(pn || "")) o.pn = pn;
  if (/^box:/.test(size || "")) { o.box = size.slice(4); return o; } // tool storage: "box:cab;68;3/4,2;p"
  if (/^set:/.test(size || "")) { const [member, list] = size.slice(4).split(";"); o.member = member; o.sizes = (list || "").split(",").filter(Boolean); return o; }
  if (!size) return o;
  // two sizes on a box or ratcheting box wrench: "10 × 11 mm", "3/8 × 7/16"
  const pair = String(size).match(/^([\d.\/]+)\s*×\s*([\d.\/]+)\s*(mm)?$/);
  if (pair) { const v = (z) => (pair[3] ? +z : /\//.test(z) ? (25.4 * z.split("/")[0]) / z.split("/")[1] : NaN); if (v(pair[1]) > 4 && v(pair[2]) < 40) { o.gap = v(pair[1]); o.gap2 = v(pair[2]); o.size = pair[1] + (pair[3] ? "mm" : ""); o.size2 = pair[2] + (pair[3] ? "mm" : ""); } return o; }
  const mm = String(size).match(/^(\d+(?:\.\d)?)\s*mm$/i), fr = String(size).match(/^(\d+)\/(\d+)"?$/);
  const gap = mm ? +mm[1] : fr ? (25.4 * fr[1]) / fr[2] : null;
  if (gap && gap > 4 && gap < 40) { o.gap = gap; if (/^socket/.test(key) && key !== "socket-bit") o.r = Math.max(7, gap * 0.6 + 3.2); }
  if (!/×/.test(size)) o.size = String(size).replace(/\s+/g, "");
  return o;
}

// Build a model and give it its finish: black industrial chrome for the G tools, the cordless colors
// (gunmetal, green, orange, hi-viz, blue) for housings, and colored grips. Paint swaps the red; the
// industrial finish swaps every bright metal for black chrome.
const PAINT = { "c-gm": 0x4b5057, "c-g": 0x2f9e44, "c-o": 0xe8590c, "c-hv": 0xc9d81b, "c-mb": 0x1f63c6, "c-bk": 0x1d1f23 };
const tints = new Map(), shared = new WeakSet(); // tinted materials are shared by every model, so never disposed
function tinted(m, how) {
  const id = m.uuid + how;
  if (!tints.has(id)) {
    if (tints.size > 400) tints.clear(); // a model's own one-off materials would otherwise pile up
    const t = m.clone();
    if (how === "ind") { t.color.set(0x2c3036); t.roughness = Math.max(0.16, m.roughness * 0.9 + 0.06); t.envMapIntensity = 1.25; }
    else t.color.set(PAINT[how]);
    tints.set(id, t); shared.add(t);
  }
  return tints.get(id);
}
const isRed = (m) => { if (!m.color || m.emissive?.getHex()) return false; const c = m.color.getHSL({}); return (c.h < 0.03 || c.h > 0.97) && c.s > 0.7 && c.l > 0.1; }; // the paint and dip, not the LEDs
const isBright = (m) => m.metalness >= 0.6 && m.color && m.color.getHSL({}).l > 0.55;
function build(key, size, drive, pn, look) {
  const o = opts(key, size, drive, pn, look), model = MODELS[key](o);
  const paint = o.look.find((w) => PAINT[w]), ind = o.look.includes("ind");
  if (paint || ind) model.traverse((m) => {
    if (!m.isMesh || Array.isArray(m.material) || m.material.map) return;
    if (paint && isRed(m.material)) m.material = tinted(m.material, paint);
    else if (ind && isBright(m.material)) m.material = tinted(m.material, "ind");
  });
  return model;
}

/* ---------- the studio: lights, floor and camera ---------- */
// What the chrome reflects: a dark photo studio with a few bright softboxes and a pale bench.
// Mirror-polished tools look like chrome because of the dark-and-bright contrast they reflect.
function studioReflections() {
  const s = new THREE.Scene();
  const glow = (v) => new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(v), side: THREE.DoubleSide });
  s.add(new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), new THREE.MeshBasicMaterial({ color: 0x23272d, side: THREE.BackSide })));
  const bench = new THREE.Mesh(new THREE.CircleGeometry(60, 48), glow(0.32)); bench.rotation.x = -PI / 2; bench.position.y = -14; s.add(bench);
  const box = (w, h, v, x, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glow(v)); m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m); };
  box(46, 12, 7, 0, 40, 8);    // big strip light overhead
  box(10, 34, 4.5, -40, 14, 14); // tall strip on the left
  box(10, 30, 2.4, 40, 10, -8);  // fainter one on the right
  box(34, 8, 2, 0, 12, 44);      // soft fill from the camera side
  box(7, 26, 5, -22, -2, 40); box(5, 26, 3, 26, -2, 36); // low strips in front, for bright streaks down round chrome
  return s;
}
function studio(renderer) {
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(studioReflections(), 0.02).texture; pm.dispose();
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-120, 300, 160); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 8; key.shadow.bias = -0.0005;
  Object.assign(key.shadow.camera, { left: -260, right: 260, top: 260, bottom: -260, near: 1, far: 900 });
  scene.add(key);
  const floor = mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.ShadowMaterial({ opacity: 0.28 }), false); floor.rotation.x = -PI / 2; scene.add(floor);
  return { scene, key, floor };
}
function stage(st, model) {
  // tools lie at an angle on the bench, the way catalog shots show them
  model.rotation.y = model.userData.yaw ?? -0.32;
  const b = new THREE.Box3().setFromObject(model), c = b.getCenter(new THREE.Vector3());
  model.position.x -= c.x; model.position.z -= c.z; model.position.y -= b.min.y; // centred, standing on the floor
  st.scene.add(model);
  const fit = new THREE.Box3().setFromObject(model), r = Math.max(260, fit.getBoundingSphere(new THREE.Sphere()).radius * 1.3);
  // the key light's shadow covers the whole tool, from a socket to a roll cab
  st.key.position.set(-120, 300, 160).multiplyScalar(Math.max(1, r / 260)); st.key.target.position.set(0, 0, 0);
  Object.assign(st.key.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: Math.max(900, r * 4) }); st.key.shadow.camera.updateProjectionMatrix();
  return fit;
}
const FRONT = new THREE.Vector3(0.12, 0.7, 1), ABOVE = new THREE.Vector3(0.06, 2.6, 1); // ABOVE: looking down into a drawer
// Point the camera down at the tool from the front and move in until the tool fills the frame.
// pts: the points that must stay in view (the box's corners unless given).
function frame(camera, box, aspect, fill = 0.86, pts = null, from = FRONT) {
  camera.aspect = aspect; camera.updateProjectionMatrix();
  pts = pts || [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
  const dir = from.clone().normalize(), target = box.getCenter(new THREE.Vector3()), v = new THREE.Vector3();
  let d = box.getBoundingSphere(new THREE.Sphere()).radius * 3;
  for (let i = 0; i < 5; i++) {
    camera.position.copy(target).addScaledVector(dir, d); camera.lookAt(target); camera.updateMatrixWorld();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { v.copy(p).project(camera); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    const halfH = d * Math.tan((camera.fov * PI) / 360), halfW = halfH * aspect;
    target.addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), ((x0 + x1) / 2) * halfW).addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1), ((y0 + y1) / 2) * halfH);
    d *= Math.max((x1 - x0) / 2, (y1 - y0) / 2) / fill;
  }
  camera.position.copy(target).addScaledVector(dir, d); camera.lookAt(target);
  camera.near = d / 30; camera.far = d * 8; camera.updateProjectionMatrix();
  return { target, d };
}
function makeRenderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas: canvas || undefined, antialias: true, alpha: true, preserveDrawingBuffer: !canvas });
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1; r.outputColorSpace = THREE.SRGBColorSpace;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.setClearColor(0x000000, 0);
  return r;
}
const disposeTree = (o) => o.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material && m.material !== brightChrome && !shared.has(m.material) && !Object.values(mat).includes(m.material)) { m.material.map?.dispose(); m.material.dispose(); } });

/* ---------- still pictures for cards, made one at a time with a single hidden renderer ---------- */
// A card's tool sits on a turntable: a pivot under the middle of the tool, so turning it spins the tool
// in place. The camera is framed to fit the tool at every angle, so the still and the turning card match.
function turntable(key, size, drive, pn, look, hd = false) {
  // cards and the display shelf build at full detail (twice as finely cut, sharper stamps), like the spin-around
  // view; small list-row pictures and foam pockets stay at the lighter level, since a big box has many of them
  let model; Q.hd = hd; try { model = build(key, size, drive, pn, look); } finally { Q.hd = false; }
  const pivot = new THREE.Group(); pivot.add(model);
  model.rotation.y = model.userData.yaw ?? -0.32;
  const b = new THREE.Box3().setFromObject(model), c = b.getCenter(new THREE.Vector3());
  model.position.x -= c.x; model.position.z -= c.z; model.position.y -= b.min.y;
  const fit = new THREE.Box3();
  for (let i = 0; i < 16; i++) { pivot.rotation.y = (i * PI) / 8; pivot.updateMatrixWorld(true); fit.union(new THREE.Box3().setFromObject(pivot)); }
  pivot.rotation.y = 0;
  // As it turns, the tool sweeps out a round drum, not a square box. Framing the drum (how far the tool's
  // farthest point reaches from the middle) instead of the box's corners lets the tool fill the card.
  let reach = 0; const v = new THREE.Vector3(); pivot.updateMatrixWorld(true);
  pivot.traverse((m) => { const pos = m.isMesh && m.geometry.attributes.position; if (!pos) return; for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); reach = Math.max(reach, Math.hypot(v.x, v.z)); } });
  const drum = reach > 0 ? Array.from({ length: 48 }, (_, i) => new THREE.Vector3(reach * Math.cos((i * PI) / 12), i < 24 ? fit.min.y : fit.max.y, reach * Math.sin((i * PI) / 12))) : null;
  // a long thin tool (a saw) seen end-on is just a stick, so it rocks to and fro instead of turning all the way round
  return { pivot, fit, drum, sway: model.userData.sway || 0, r: Math.max(260, fit.getBoundingSphere(new THREE.Sphere()).radius * 1.3), cams: new Map() };
}
// the key light's shadow covers the whole tool, from a socket to a roll cab
function light(st, r) {
  st.key.position.set(-120, 300, 160).multiplyScalar(Math.max(1, r / 260)); st.key.target.position.set(0, 0, 0);
  Object.assign(st.key.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: Math.max(900, r * 4) }); st.key.shadow.camera.updateProjectionMatrix();
}
function camFor(t, w, h) {
  const id = w + "x" + h;
  if (!t.cams.has(id)) { const cam = new THREE.PerspectiveCamera(28, w / h); frame(cam, t.fit, w / h, 0.86, t.drum); t.cams.set(id, cam); }
  return t.cams.get(id);
}
let still = null, queue = Promise.resolve();
const cache = new Map();
function studioOnce() { if (!still) { still = { r: makeRenderer(null), w: 0, h: 0 }; still.st = studio(still.r); } return still; }
function draw(t, w, h, turn) {
  const s = studioOnce();
  if (s.w !== w || s.h !== h) { s.r.setPixelRatio(1); s.r.setSize(w, h, false); s.w = w; s.h = h; }
  t.pivot.rotation.y = turn; light(s.st, t.r); s.st.scene.add(t.pivot);
  s.r.render(s.st.scene, camFor(t, w, h));
  s.st.scene.remove(t.pivot);
  return s.r.domElement;
}
export function picture(key, size = "", w = 640, h = 400, drive = "", pn = "", look = "") {
  const id = [key, size, w, h, drive, pn, look].join("|");
  if (!MODELS[key]) return Promise.resolve(null);
  if (!cache.has(id)) cache.set(id, (queue = queue.then(() => new Promise((ok) => requestAnimationFrame(() => {
    try {
      // the model built for the picture is kept for the card to turn, unless nothing is going to turn
      const hd = w >= 360, tid = [key, size, drive, pn, look, hd].join("|"), t = tables.get(tid) || turntable(key, size, drive, pn, look, hd);
      draw(t, w, h, 0).toBlob((b) => { if (quiet()) { if (!tables.has(tid)) disposeTree(t.pivot); } else keep(tid, t); ok(b ? URL.createObjectURL(b) : null); }, "image/png");
    } catch (e) { console.error("3D picture failed", key, e); ok(null); }
  })))));
  return cache.get(id);
}

// A tool lying in its drawer foam: seen from above, with no floor shadow, so the page can cut a pocket
// around its outline. Still pictures only; pockets don't turn.
export function pocket(key, size = "", w = 480, h = 300, drive = "", pn = "", look = "") {
  const id = ["pocket", key, size, w, h, drive, pn, look].join("|");
  if (!MODELS[key]) return Promise.resolve(null);
  if (!cache.has(id)) cache.set(id, (queue = queue.then(() => new Promise((ok) => requestAnimationFrame(() => {
    let t = null; const s = studioOnce();
    try {
      t = turntable(key, size, drive, pn, look);
      if (s.w !== w || s.h !== h) { s.r.setPixelRatio(1); s.r.setSize(w, h, false); s.w = w; s.h = h; }
      // long tools lie along the drawer; the turntable angle is for showing them off
      t.pivot.rotation.y = 0.32; t.pivot.updateMatrixWorld(true);
      const cam = new THREE.PerspectiveCamera(28, w / h); frame(cam, new THREE.Box3().setFromObject(t.pivot), w / h, 0.92, null, ABOVE);
      light(s.st, t.r); s.st.floor.visible = false; s.st.scene.add(t.pivot);
      s.r.render(s.st.scene, cam);
      s.st.scene.remove(t.pivot); s.st.floor.visible = true;
      s.r.domElement.toBlob((b) => { disposeTree(t.pivot); ok(b ? URL.createObjectURL(b) : null); }, "image/png");
    } catch (e) { console.error("3D pocket failed", key, e); s.st.floor.visible = true; if (t) s.st.scene.remove(t.pivot); ok(null); }
  })))));
  return cache.get(id);
}

/* ---------- close-up: the part that tells a tool apart ----------
   Most tools in a family look alike from across the room: a 3/8" ratchet and a flex-head one, a flat and a Phillips
   screwdriver, an impact and a drill. Cards and the display shelf get a round close-up of the end that's different,
   like the magnified detail in a catalog. ZOOM says where that is: the slice of the tool along its length (x, from
   0 at one end to 1 at the other) or its height (y), as the model is built before it's turned for the camera. */
const ZOOM = {
  ratchet: ["x", 0, 0.3], screwdriver: ["x", 0.84, 1], insulated: ["x", 0.86, 1], nutdriver: ["x", 0.82, 1], pick: ["x", 0.8, 1], "insert-bit": ["x", 0.55, 1],
  wrench: ["x", 0.74, 1], "wrench-open": ["x", 0.76, 1], pliers: ["x", 0, 0.36], extension: ["x", 0.84, 1], breaker: ["x", 0, 0.2], torque: ["x", 0.5, 0.76], "torque-click": ["x", 0.42, 0.78],
  hammer: ["x", 0, 0.3], pry: ["x", 0, 0.18], punch: ["x", 0.8, 1], "punch-pin": ["x", 0, 0.2], "wrench-adjust": ["x", 0, 0.34], "pipe-wrench": ["x", 0, 0.34],
  // a pistol-grip tool: the nose, above the grip (the chuck, anvil or bit holder is what tells them apart)
  power: ["x", 0.62, 1, "y", 0.6, 1], cl14: ["x", 0.62, 1, "y", 0.6, 1], cl18: ["x", 0.62, 1, "y", 0.6, 1], "air-impact": ["x", 0.62, 1, "y", 0.6, 1],
  "power-ratchet": ["x", 0, 0.3], "cl14-ratchet": ["x", 0, 0.3], "cl18-ratchet": ["x", 0, 0.3], "cl14-die": ["x", 0, 0.3],
};
const zoomOf = (key) => ZOOM[key] || (/-battery$|^cl18-inflator$|^cl1[48]-saw$|-angle$/.test(key) ? null : ZOOM[key.replace(/-soft$/, "")] || ZOOM[key.split("-")[0]] || null);
function focusPoints(model, spec) {
  model.updateMatrixWorld(true);
  const inv = model.matrixWorld.clone().invert(), m4 = new THREE.Matrix4(), v = new THREE.Vector3(), all = [];
  model.traverse((o) => { const pos = o.isMesh && o.geometry.attributes.position; if (!pos) return; m4.multiplyMatrices(inv, o.matrixWorld);
    const step = Math.max(1, Math.floor(pos.count / 3000)); for (let i = 0; i < pos.count; i += step) { v.fromBufferAttribute(pos, i); all.push([v.clone().applyMatrix4(m4), v.clone().applyMatrix4(o.matrixWorld)]); } });
  let keep = all;
  for (let i = 0; i < spec.length; i += 3) { // each [axis, from, to] narrows it down: along the tool, then up its height
    const [axis, a, b] = spec.slice(i, i + 3);
    let lo = Infinity, hi = -Infinity; for (const [l] of all) { lo = Math.min(lo, l[axis]); hi = Math.max(hi, l[axis]); }
    const x0 = lo + (hi - lo) * a, x1 = lo + (hi - lo) * b; keep = keep.filter(([l]) => l[axis] >= x0 && l[axis] <= x1);
  }
  return keep.map(([, w]) => w);
}
export const hasCloseup = (key) => !!(MODELS[key] && zoomOf(key));
export function closeup(key, size = "", w = 240, h = 240, drive = "", pn = "", look = "") {
  const id = ["zoom", key, size, w, h, drive, pn, look].join("|"), z = MODELS[key] && zoomOf(key);
  if (!z) return Promise.resolve(null);
  if (!cache.has(id)) cache.set(id, (queue = queue.then(() => new Promise((ok) => requestAnimationFrame(() => {
    const tid = [key, size, drive, pn, look, true].join("|"), s = studioOnce(); let t = null;
    try {
      t = tables.get(tid) || turntable(key, size, drive, pn, look, true);
      t.pivot.rotation.y = 0; t.pivot.updateMatrixWorld(true);
      const pts = focusPoints(t.pivot.children[0], z);
      if (pts.length < 4) { ok(null); return; }
      if (s.w !== w || s.h !== h) { s.r.setPixelRatio(1); s.r.setSize(w, h, false); s.w = w; s.h = h; }
      const cam = new THREE.PerspectiveCamera(28, w / h); frame(cam, new THREE.Box3().setFromPoints(pts), w / h, 0.78, pts, FRONT);
      light(s.st, t.r); s.st.scene.add(t.pivot); s.r.render(s.st.scene, cam); s.st.scene.remove(t.pivot);
      s.r.domElement.toBlob((bl) => { if (!tables.has(tid)) disposeTree(t.pivot); ok(bl ? URL.createObjectURL(bl) : null); }, "image/png");
    } catch (e) { console.error("3D close-up failed", key, e); if (t) s.st.scene.remove(t.pivot); ok(null); }
  })))));
  return cache.get(id);
}

/* ---------- cards that turn by themselves ---------- */
// Every tool on screen slowly turns, like an item on a showroom turntable. To stay light on phones:
// - one hidden renderer draws each turning card in turn and copies the frame onto that card's own canvas
//   (one 3D engine for the whole page instead of one per card);
// - only cards on screen turn, about 30 times a second, and the page is left alone while a tab is hidden
//   or the spin-around view is open;
// - if frames start taking too long, fewer cards turn at once (the rest keep their still picture);
// - nothing turns for people who ask their device for less motion, or who have data saver on.
// A card always starts turning from the angle of its still picture, so the swap can't be seen.
const TURN = 14000; // milliseconds for one full turn
const calm = matchMedia("(prefers-reduced-motion: reduce)");
const quiet = () => calm.matches || navigator.connection?.saveData;
const cards = new Map(); // card element -> what it shows
const tables = new Map(); // built turntables, reused by every card showing the same tool (newest last)
let raf = 0, last = 0, avg = 0, most = matchMedia("(pointer: coarse)").matches ? 4 : 10, broken = false;
const seen = typeof IntersectionObserver === "function" && new IntersectionObserver((list) => {
  for (const e of list) { const c = cards.get(e.target); if (!c) continue; c.on = e.isIntersecting; if (!c.on) rest(c); }
  wake();
}, { rootMargin: "48px 0px" }); // a card rests only once it is fully off screen, so its jump back to the still picture is never seen
function rest(c) { c.a = 0; c.at = 0; c.el.classList.remove("turning"); if (c.canvas) { c.canvas.remove(); c.canvas = null; } }
function keep(id, t) {
  tables.delete(id); tables.set(id, t);
  // keep the newest few dozen; older ones are rebuilt if their card comes back
  for (const [old, o] of tables) { if (tables.size <= 24) break; if (old === id) continue; tables.delete(old); disposeTree(o.pivot); }
  return t;
}
const tableFor = (c) => keep(c.id, tables.get(c.id) || turntable(c.key, c.size, c.drive, c.pn, c.look, c.w >= 360));
let scrolled = 0;
addEventListener("scroll", () => { scrolled = performance.now(); }, { passive: true, capture: true });
addEventListener("touchmove", () => { scrolled = performance.now(); }, { passive: true });
function wake() { if (!raf && !broken && !quiet()) raf = requestAnimationFrame(tick); }
function tick(now) {
  raf = 0;
  for (const [el, c] of cards) if (!el.isConnected) { seen.unobserve(el); rest(c); cards.delete(el); }
  const on = [...cards.values()].filter((c) => c.on);
  if (!on.length || quiet()) { on.forEach(rest); return; }
  raf = requestAnimationFrame(tick);
  // hold still while the page is scrolling, but only if frames are heavy enough to make a scroll stutter:
  // small list-row pictures are cheap, so they keep turning smoothly instead of stopping and starting
  if (now - last < 30 || (avg > 5 && now - scrolled < 180) || document.querySelector("dialog[open] .m3d-live")) return;
  last = now;
  const t0 = performance.now();
  let built = false;
  on.forEach((c, i) => {
    if (i >= most) { rest(c); return; }
    if (!tables.has(c.id)) { if (built) return; built = true; } // build at most one new model per frame
    try {
      const t = tableFor(c);
      // turn on from the angle it stopped at: after a pause for scrolling it carries on, it doesn't jump ahead
      c.a += (Math.min(now - (c.at || now), 50) / TURN) * PI * 2; c.at = now;
      const src = draw(t, c.w, c.h, t.sway ? Math.sin(c.a) * t.sway : c.a);
      if (!c.canvas) { c.canvas = document.createElement("canvas"); c.canvas.className = "m3d m3d-turn"; c.canvas.width = c.w; c.canvas.height = c.h; c.ctx = c.canvas.getContext("2d"); }
      c.ctx.clearRect(0, 0, c.w, c.h); c.ctx.drawImage(src, 0, 0);
      if (!c.canvas.isConnected) { c.img.after(c.canvas); c.el.classList.add("turning"); }
    } catch (e) { console.error("3D turn failed", c.key, e); broken = true; cards.forEach(rest); }
  });
  // keep each frame's work small: turn fewer cards if it grows, more again once there's room
  avg = avg * 0.9 + (performance.now() - t0) * 0.1;
  if (avg > 12 && most > 1) { most--; avg = 8; } else if (avg < 4 && on.length > most && most < 12) { most++; avg = 6; }
}
calm.addEventListener?.("change", () => { if (quiet()) cards.forEach(rest); else wake(); });
// Called once a card's still picture is showing: from then on the card turns while it's on screen.
export function turn(el, img, key, size = "", w = 640, h = 400, drive = "", pn = "", look = "") {
  if (!seen || !MODELS[key] || cards.has(el)) return;
  cards.set(el, { el, img, key, size, drive, pn, look, w, h, id: [key, size, drive, pn, look, w >= 360].join("|"), on: false, a: 0, at: 0, canvas: null });
  seen.observe(el);
}

/* ---------- the spin-around view ---------- */
export function viewer(el, key, size = "", drive = "", pn = "", look = "") {
  if (!MODELS[key]) return null;
  const canvas = document.createElement("canvas"); canvas.className = "m3d-live"; el.appendChild(canvas);
  // the one tool you're looking at gets the full detail: twice as finely cut, sharp on a phone's screen, crisp shadows
  const r = makeRenderer(canvas); r.setPixelRatio(Math.min(3, devicePixelRatio || 1));
  const st = studio(r), cam = new THREE.PerspectiveCamera(28, 1.6);
  st.key.shadow.mapSize.set(2048, 2048);
  let model; Q.hd = true; try { model = build(key, size, drive, pn, look); } finally { Q.hd = false; } const bx = stage(st, model), radius = bx.getBoundingSphere(new THREE.Sphere()).radius;
  const ctl = new OrbitControls(cam, canvas);
  Object.assign(ctl, { enableDamping: true, enablePan: false, autoRotate: !matchMedia("(prefers-reduced-motion: reduce)").matches, autoRotateSpeed: 1.6, minPolarAngle: 0.15, maxPolarAngle: PI / 2 - 0.06 });
  let raf = 0, alive = true;
  const size2 = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; r.setSize(w, h, false); const f = frame(cam, bx, w / h, 0.72); ctl.target.copy(f.target); ctl.minDistance = radius * 1.1; ctl.maxDistance = f.d * 2; ctl.update(); };
  size2(); const ro = new ResizeObserver(size2); ro.observe(el);
  ctl.addEventListener("start", () => { ctl.autoRotate = false; });
  const loop = () => { if (!alive) return; ctl.update(); r.render(st.scene, cam); raf = requestAnimationFrame(loop); };
  loop();
  return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); ctl.dispose(); disposeTree(model); r.dispose(); r.forceContextLoss(); canvas.remove(); };
}
