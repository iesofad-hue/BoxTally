// BoxTally 3D kit: the materials and shape helpers every tool model is built from.
// Sizes are in millimetres. Flat tools lie on the bench: x runs along the tool, y is up, z points at the camera.
import * as T3 from "three";

// Detail: the spin-around view builds its tool with Q.hd on, which doubles how finely every round
// shape is cut (barrels, knurling, handles, curved outlines) and prints stamps at twice the resolution.
// Cards and list rows stay at the lighter level, since many of them draw at once.
// Round shapes cut into fewer than 16 sides are left alone: those are hex nuts, hex bits and squares on purpose.
export const Q = { hd: false };
const more = (n, d) => { const v = n ?? d; return Q.hd && v >= 16 ? v * 2 : v; };
const moreExtrude = (o = {}) => (Q.hd ? { ...o, curveSegments: (o.curveSegments ?? 12) * 2, bevelSegments: (o.bevelSegments ?? 3) * 2 } : o);
export const THREE = {
  ...T3,
  LatheGeometry: class extends T3.LatheGeometry { constructor(pts, n, a, b) { super(pts, more(n, 12), a, b); } },
  CylinderGeometry: class extends T3.CylinderGeometry { constructor(rt, rb, h, n, hs, open, a, b) { super(rt, rb, h, more(n, 32), hs, open, a, b); } },
  SphereGeometry: class extends T3.SphereGeometry { constructor(r, w, h, ...rest) { super(r, more(w, 32), more(h, 16), ...rest); } },
  TorusGeometry: class extends T3.TorusGeometry { constructor(r, t, rs, ts, arc) { super(r, t, more(rs, 12), more(ts, 48), arc); } },
  TubeGeometry: class extends T3.TubeGeometry { constructor(path, ts, r, rs, closed) { super(path, more(ts, 64), r, more(rs, 8), closed); } },
  CapsuleGeometry: class extends T3.CapsuleGeometry { constructor(r, len, cs, rs) { super(r, len, cs, more(rs, 8)); } },
  CircleGeometry: class extends T3.CircleGeometry { constructor(r, n, a, b) { super(r, more(n, 32), a, b); } },
  ExtrudeGeometry: class extends T3.ExtrudeGeometry { constructor(shapes, o) { super(shapes, moreExtrude(o)); } },
};

/* ---------- materials ---------- */
export const mat = {
  chrome: new THREE.MeshPhysicalMaterial({ color: 0xf4f6f8, metalness: 1, roughness: 0.07 }),
  satin: new THREE.MeshPhysicalMaterial({ color: 0xd5dae0, metalness: 1, roughness: 0.32 }),
  red: new THREE.MeshPhysicalMaterial({ color: 0xa8000c, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 }),
  black: new THREE.MeshPhysicalMaterial({ color: 0x17191c, roughness: 0.55, clearcoat: 0.3 }),
  gloss: new THREE.MeshPhysicalMaterial({ color: 0x121315, roughness: 0.2, clearcoat: 1 }),
  oxide: new THREE.MeshPhysicalMaterial({ color: 0x2b2e33, metalness: 0.75, roughness: 0.42 }),
  hole: new THREE.MeshStandardMaterial({ color: 0x0a0b0d, metalness: 0.4, roughness: 0.7, side: THREE.DoubleSide }),
  yellow: new THREE.MeshPhysicalMaterial({ color: 0xf2b705, roughness: 0.3, clearcoat: 1 }),
  orange: new THREE.MeshPhysicalMaterial({ color: 0xe8590c, roughness: 0.35, clearcoat: 0.8 }),
  // plastics and the rest
  redp: new THREE.MeshPhysicalMaterial({ color: 0xb3000f, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.3 }), // power tool housings, storage paint
  rubber: new THREE.MeshPhysicalMaterial({ color: 0x1d1f22, roughness: 0.85 }),
  grey: new THREE.MeshPhysicalMaterial({ color: 0x5b6169, roughness: 0.5, clearcoat: 0.2 }),
  steel: new THREE.MeshPhysicalMaterial({ color: 0x9aa1a8, metalness: 1, roughness: 0.45 }), // raw/ground steel
  brass: new THREE.MeshPhysicalMaterial({ color: 0xc9a227, metalness: 1, roughness: 0.25 }),
  copper: new THREE.MeshPhysicalMaterial({ color: 0xb8673a, metalness: 1, roughness: 0.3 }),
  clear: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transmission: 0.9, thickness: 2, transparent: true, opacity: 0.6 }),
  screen: new THREE.MeshPhysicalMaterial({ color: 0x0c1a2a, roughness: 0.08, clearcoat: 1, emissive: 0x0b2a4a, emissiveIntensity: 0.6 }),
  blue: new THREE.MeshPhysicalMaterial({ color: 0x1f5fbf, roughness: 0.35, clearcoat: 0.8 }),
  white: new THREE.MeshPhysicalMaterial({ color: 0xeef0f2, roughness: 0.4, clearcoat: 0.4 }),
  wood: new THREE.MeshPhysicalMaterial({ color: 0x9c6b3c, roughness: 0.6, clearcoat: 0.4 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xdfe8ef, metalness: 1, roughness: 0.02 }), // mirror
};

/* ---------- shape helpers ---------- */
export const PI = Math.PI;
// square drive sizes in mm, by the drive in inches
export const DRIVES = { "1/4": 6.35, "3/8": 9.5, "1/2": 12.7, "3/4": 19 };
export const mesh = (geo, m, castShadow = true) => { const o = new THREE.Mesh(geo, m); o.castShadow = castShadow; o.receiveShadow = true; return o; };
// a 2D outline seen from above, given thickness and rounded edges, lying flat on the bench
export function slab(shape, depth, bevel = 1, m = mat.chrome) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 48 });
  g.translate(0, 0, -depth / 2); g.rotateX(-PI / 2);
  return mesh(g, m);
}
export const circle = (r, x = 0, y = 0) => { const s = new THREE.Shape(); s.absarc(x, y, r, 0, PI * 2, false); return s; };
export const poly = (pts) => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); return s; };
export const starPath = (n, rIn, rOut, rot = 0) => { const p = new THREE.Path(); for (let i = 0; i < n * 2; i++) { const a = rot + (i * PI) / n, r = i % 2 ? rIn : rOut; i ? p.lineTo(Math.cos(a) * r, Math.sin(a) * r) : p.moveTo(Math.cos(a) * r, Math.sin(a) * r); } p.closePath(); return p; };
// a turned part (handle, socket, punch) from its profile: [radius, position along the axis]
export function turned(profile, m, { segs = 48, along = "x", flutes = 0, flute = 0 } = {}) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  if (flutes) { // gently lobed, like a screwdriver handle
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + flute * Math.cos(a * flutes); p.setX(i, x * k); p.setZ(i, z * k); }
    g.computeVertexNormals();
  }
  if (along === "x") g.rotateZ(-PI / 2);
  return mesh(g, m);
}
export const cyl = (r, len, m, { segs = 32, along = "y", r2 = r } = {}) => { const g = new THREE.CylinderGeometry(r2, r, len, segs); if (along === "x") g.rotateZ(-PI / 2); if (along === "z") g.rotateX(PI / 2); return mesh(g, m); };
export const box = (w, h, d, m, bevel = Math.min(w, h, d) * 0.12) => { // a block with softly rounded edges
  const b = Math.min(bevel, w / 2 - 0.01, d / 2 - 0.01, h / 2 - 0.01), s = new THREE.Shape();
  s.moveTo(-w / 2 + b, -d / 2); s.lineTo(w / 2 - b, -d / 2); s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + b); s.lineTo(w / 2, d / 2 - b); s.quadraticCurveTo(w / 2, d / 2, w / 2 - b, d / 2);
  s.lineTo(-w / 2 + b, d / 2); s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - b); s.lineTo(-w / 2, -d / 2 + b); s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + b, -d / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: h - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: 0, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -(h - 2 * b) / 2); g.rotateX(-PI / 2); return mesh(g, m);
};
export const tube = (pts, r, m, radial = 20) => mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 64, r, radial, false), m);
export const sphere = (r, m) => mesh(new THREE.SphereGeometry(r, 32, 16), m);
export const capsule = (r, len, m) => { const g = new THREE.CapsuleGeometry(r, len, 8, 32); g.rotateZ(PI / 2); return mesh(g, m); };
export const at = (o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); return o; };
export const group = (...kids) => { const g = new THREE.Group(); kids.flat().forEach((k) => k && g.add(k)); return g; };

// printed size: dark text on a transparent strip, for socket barrels and wrench shanks
export function label(text, w, h, { color = "#20252c", font = "700 80px ui-monospace, Menlo, monospace" } = {}) {
  const k = Q.hd ? 2 : 1, c = document.createElement("canvas"); c.width = 512 * k; c.height = Math.round((512 * k * h) / w);
  font = font.replace(/(\d+)px/, (_, n) => n * k + "px");
  const x = c.getContext("2d"); x.fillStyle = color; x.font = font; x.textAlign = "center"; x.textBaseline = "middle";
  const fit = Math.min(1, (c.width * 0.9) / x.measureText(text).width); x.font = font.replace(/\d+px/, Math.round(80 * k * fit) + "px");
  x.fillText(text, c.width / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Q.hd ? 8 : 4;
  return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.85 });
}

// printed text wrapped onto a round part lying along x (a handle, a bar, a shaft), reading along the part.
// x0..x0+w is where it sits along the axis; it's centred `a` radians round from the top toward the camera.
export function wrapX(text, r, w, h, x0, { a = 0.7, ...o } = {}) {
  const g = new THREE.PlaneGeometry(w, h, 8, 8), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const px = p.getX(i), ang = a - p.getY(i) / r; p.setXYZ(i, x0 + w / 2 + px, r * Math.cos(ang), r * Math.sin(ang)); }
  g.computeVertexNormals();
  return mesh(g, label(text, w, h, o), false);
}
