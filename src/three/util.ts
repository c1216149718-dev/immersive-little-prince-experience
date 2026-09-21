import * as THREE from "three";

/* ---------- procedural textures (never remote) ---------- */
const texCache = new Map<string, THREE.Texture>();

export function glowTexture(size = 128, inner = "rgba(255,240,210,1)", outer = "rgba(255,220,160,0)", power = 1) {
  const key = `glow${size}${inner}${outer}${power}`;
  if (texCache.has(key)) return texCache.get(key)!;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner);
  grd.addColorStop(Math.min(0.99, 0.18 * power), inner.replace(/,1\)$/, ",0.55)"));
  grd.addColorStop(0.5, inner.replace(/,1\)$/, ",0.12)"));
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

export function starSpriteTexture(size = 64) {
  const key = `star${size}`;
  if (texCache.has(key)) return texCache.get(key)!;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const r = size / 2;
  const grd = g.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0, "rgba(255,248,230,1)");
  grd.addColorStop(0.25, "rgba(255,240,200,0.6)");
  grd.addColorStop(0.6, "rgba(255,225,170,0.08)");
  grd.addColorStop(1, "rgba(255,225,170,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  // faint 4-point flare
  g.globalCompositeOperation = "lighter";
  g.strokeStyle = "rgba(255,245,220,0.35)";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(r, r * 0.25);
  g.lineTo(r, r * 1.75);
  g.moveTo(r * 0.25, r);
  g.lineTo(r * 1.75, r);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

/** soft brushed paper texture used as a roughness / subtle color detail */
export function paperTexture(size = 256, seed = 1) {
  const key = `paper${size}${seed}`;
  if (texCache.has(key)) return texCache.get(key)!;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, size, size);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < size * 40; i++) {
    const v = 200 + Math.floor(rnd() * 55);
    g.fillStyle = `rgba(${v},${v},${v},${0.25 + rnd() * 0.4})`;
    g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  // brush strokes
  g.globalAlpha = 0.08;
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = rnd() > 0.5 ? "#c9c9c9" : "#ffffff";
    g.lineWidth = 2 + rnd() * 6;
    g.beginPath();
    const y = rnd() * size;
    g.moveTo(0, y);
    g.bezierCurveTo(size * 0.3, y + rnd() * 20 - 10, size * 0.6, y + rnd() * 20 - 10, size, y + rnd() * 10 - 5);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  texCache.set(key, t);
  return t;
}

/* ---------- noise ---------- */
export function hash(n: number) {
  const s = Math.sin(n) * 43758.5453123;
  return s - Math.floor(s);
}
export function noise3(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const n = (i: number, j: number, k: number) => hash(i * 127.1 + j * 311.7 + k * 74.7);
  const a = n(ix, iy, iz), b = n(ix + 1, iy, iz), c = n(ix, iy + 1, iz), d = n(ix + 1, iy + 1, iz);
  const e = n(ix, iy, iz + 1), f = n(ix + 1, iy, iz + 1), g = n(ix, iy + 1, iz + 1), h = n(ix + 1, iy + 1, iz + 1);
  const x1 = a + (b - a) * u, x2 = c + (d - c) * u, x3 = e + (f - e) * u, x4 = g + (h - g) * u;
  const y1 = x1 + (x2 - x1) * v, y2 = x3 + (x4 - x3) * v;
  return y1 + (y2 - y1) * w;
}
export function fbm(x: number, y: number, z: number, oct = 4) {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise3(x * f, y * f, z * f);
    a *= 0.5;
    f *= 2.1;
  }
  return s;
}

/* ---------- sphere placement ---------- */
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
/** Place object on a sphere surface so that its local +Y aligns with the surface normal. */
export function placeOnSphere(obj: THREE.Object3D, dir: THREE.Vector3, radius: number, spin = 0, lift = 0) {
  const n = dir.clone().normalize();
  obj.position.copy(n).multiplyScalar(radius + lift);
  _q.setFromUnitVectors(_up, n);
  obj.quaternion.copy(_q);
  if (spin) obj.rotateY(spin);
}
/** direction from spherical coords (lat/lon degrees) */
export function dirFromLatLon(lat: number, lon: number) {
  const la = THREE.MathUtils.degToRad(lat), lo = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo));
}

/* ---------- geometry helpers ---------- */
/** Slightly irregular sphere: handcrafted clay feel */
export function clayGeometry(radius: number, detail = 48, amount = 0.05, freq = 1.4, seed = 0) {
  const g = new THREE.SphereGeometry(radius, detail, detail);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    const d = fbm(n.x * freq + seed, n.y * freq + seed * 2, n.z * freq + seed * 3, 4) - 0.5;
    v.addScaledVector(n, d * amount * radius * 2);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Color a geometry's vertices with a callback (adds `color` attribute). */
export function paintVertices(g: THREE.BufferGeometry, fn: (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    fn(p, n, c);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

export const disposeObject = (root: THREE.Object3D) => {
  root.traverse((o: any) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m: any) => {
        Object.values(m).forEach((v: any) => v && v.isTexture && v.dispose && v.dispose());
        m.dispose && m.dispose();
      });
    }
  });
};
