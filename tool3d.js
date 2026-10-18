// BoxTally 3D tools.
// Real 3D models of the most common tools, built from simple shapes with three.js (a 3D engine that
// runs in the browser) and lit with a studio light so chrome reflects like it does in a catalog photo.
// The page loads this file only when it needs it. Cards get a still picture of the model; tapping a
// tool opens it in a view you can spin around. Tools without a model keep their 2D drawing.
//
// Sizes are in millimetres. Flat tools are drawn lying on the bench: x runs along the tool, y is up
// and z points at the camera.
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { THREE, mat, PI, DRIVES, mesh, slab, circle, poly, starPath, turned, cyl, box, tube, sphere, capsule, at, group, label } from "./kit3d.js";

import { ratchet, socket, openHead, boxHead, wrench, handle, screwdriver, nutdriver, pick, pliers, extension, breaker, adapter, hammer, prybar, punch, torque, hexkeys, socketRail, wrenchSet, JAWS } from "./core3d.js";

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
const MODELS = {
  // Snap-on ratchets are hard-handle (chrome) unless the part is a soft grip one; "-soft" keys get the red grip.
  ...Object.fromEntries([["ratchet", {}], ["ratchet-long", { len: 280 }], ["ratchet-stubby", { len: 115 }], ["ratchet-flex", { flex: true }], ["ratchet-long-flex", { len: 280, flex: true }],
    ["ratchet-round", { round: true }], ["ratchet-thumbwheel", { thumb: true }]].flatMap(([k, o]) => [[k, (x = {}) => ratchet({ ...o, drive: x.drive, pn: x.pn, grip: false })], [k + "-soft", (x = {}) => ratchet({ ...o, drive: x.drive, pn: x.pn, grip: true })]])),
  "ratchet-hard": (x = {}) => ratchet({ drive: x.drive, pn: x.pn, grip: false }),
  socket: (o) => lying(socket(o)), "socket-12": (o) => lying(socket({ ...o, points: 12 })), "socket-deep": (o) => lying(socket({ ...o, deep: true })), "socket-impact": (o) => lying(socket({ ...o, impact: true, r: 12 })),
  "socket-spark": (o) => lying(socket({ ...o, deep: true, r: 11.5, spark: true })), "socket-o2": (o) => lying(socket({ ...o, deep: true, r: 13, slot: true }), 0.9, 0.2), "socket-swivel": (o) => lying(socket({ ...o, swivel: true })), "socket-bit": (o) => lying(socket({ ...o, h: 20, bit: true })),
  wrench: (o) => wrench(o), "wrench-open": (o) => wrench({ ...o, right: "open" }), "wrench-box": (o) => wrench({ ...o, left: "box" }), "wrench-ratchet": (o) => wrench({ ...o, ratcheting: true }), "wrench-flare": (o) => wrench({ ...o, left: "flare", right: "flare" }),
  screwdriver: () => screwdriver(), "screwdriver-phillips": () => screwdriver({ tip: "phillips" }), "screwdriver-torx": () => screwdriver({ tip: "torx" }),
  "screwdriver-stubby": () => screwdriver({ len: 120, hlen: 70, r: 14 }), "screwdriver-stubby-phillips": () => screwdriver({ tip: "phillips", len: 120, hlen: 70, r: 14 }),
  insulated: () => screwdriver({ m: mat.yellow, insulated: true }), nutdriver: () => nutdriver(),
  pick: () => pick(), "pick-straight": () => pick({ shape: "straight" }), "pick-45": () => pick({ shape: "45" }), "pick-complex": () => pick({ shape: "complex" }),
  pliers: () => pliers(), "pliers-needle": () => pliers({ jaw: "needle" }), "pliers-diag": () => pliers({ jaw: "diag" }), "pliers-pump": () => pliers({ pump: true }), "pliers-strip": () => pliers({ jaw: "strip" }),
  extension: (o = {}) => bright(extension({ drive: o.drive })), breaker: () => breaker(), adapter: () => turnTo(bright(adapter()), 1.05),
  hammer: () => hammer(), "hammer-ballpeen": () => hammer(), "hammer-deadblow": () => hammer({ kind: "deadblow" }), "hammer-mallet": () => hammer({ kind: "mallet" }), "hammer-sledge": () => hammer({ kind: "sledge" }),
  pry: () => prybar(), punch: () => punch({ chisel: true }), "punch-pin": () => punch(), torque: () => torque(), "torque-click": () => torque(), hexkeys: () => hexkeys(),
  set: (o = {}) => socketRail({ drive: o.drive, sae: /SAE/i.test(o.size || "") }), "socket-rail": (o = {}) => socketRail({ drive: o.drive, sae: /SAE/i.test(o.size || "") }), "set-wrench": () => wrenchSet(),
};
Object.assign(MODELS, ...EXTRA);
export const has = (key) => key in MODELS;
export const keys = () => Object.keys(MODELS);

// The wrench gap and printed size come from the size the page already worked out ("13 mm", '9/16"').
// The drive ('1/2"') sets a ratchet's square, length and stamp, a socket's drive hole and a cordless impact's anvil.
// A ratchet also carries its part number stamped on the handle, like the real one.
function opts(key, size, drive, pn) {
  const o = {}; const d = String(drive || "").replace(/"/g, ""); if (DRIVES[d]) o.drive = d;
  if (/^[A-Z0-9-]{2,14}$/.test(pn || "")) o.pn = pn;
  if (!size) return o;
  const mm = String(size).match(/^(\d+(?:\.\d)?)\s*mm$/i), fr = String(size).match(/^(\d+)\/(\d+)"?$/);
  const gap = mm ? +mm[1] : fr ? (25.4 * fr[1]) / fr[2] : null;
  if (gap && gap > 4 && gap < 40) { o.gap = gap; if (/^socket/.test(key) && key !== "socket-bit") o.r = Math.max(7, gap * 0.6 + 3.2); }
  if (!/×/.test(size)) o.size = String(size).replace(/\s+/g, "");
  return o;
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
// Point the camera down at the tool from the front and move in until the tool fills the frame.
function frame(camera, box, aspect, fill = 0.86) {
  camera.aspect = aspect; camera.updateProjectionMatrix();
  const pts = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
  const dir = new THREE.Vector3(0.12, 0.7, 1).normalize(), target = box.getCenter(new THREE.Vector3()), v = new THREE.Vector3();
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
const disposeTree = (o) => o.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material && m.material !== brightChrome && !Object.values(mat).includes(m.material)) { m.material.map?.dispose(); m.material.dispose(); } });

/* ---------- still pictures for cards, made one at a time with a single hidden renderer ---------- */
let still = null, queue = Promise.resolve();
const cache = new Map();
export function picture(key, size = "", w = 640, h = 400, drive = "", pn = "") {
  const id = [key, size, w, h, drive, pn].join("|");
  if (!MODELS[key]) return Promise.resolve(null);
  if (!cache.has(id)) cache.set(id, (queue = queue.then(() => new Promise((ok) => requestAnimationFrame(() => {
    try {
      if (!still) { still = { r: makeRenderer(null) }; still.st = studio(still.r); still.cam = new THREE.PerspectiveCamera(28, 1.6); }
      still.r.setPixelRatio(1); still.r.setSize(w, h, false);
      const model = MODELS[key](opts(key, size, drive, pn)); frame(still.cam, stage(still.st, model), w / h);
      still.r.render(still.st.scene, still.cam);
      still.r.domElement.toBlob((b) => { still.st.scene.remove(model); disposeTree(model); ok(b ? URL.createObjectURL(b) : null); }, "image/png");
    } catch (e) { console.error("3D picture failed", key, e); ok(null); }
  })))));
  return cache.get(id);
}

/* ---------- the spin-around view ---------- */
export function viewer(el, key, size = "", drive = "", pn = "") {
  if (!MODELS[key]) return null;
  const canvas = document.createElement("canvas"); canvas.className = "m3d-live"; el.appendChild(canvas);
  const r = makeRenderer(canvas); r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const st = studio(r), cam = new THREE.PerspectiveCamera(28, 1.6);
  const model = MODELS[key](opts(key, size, drive, pn)); const bx = stage(st, model), radius = bx.getBoundingSphere(new THREE.Sphere()).radius;
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
