// Art layer: PBR materials, skies, environments, detailed props.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const Q = (() => {
  const touch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
  const low = touch || (navigator.hardwareConcurrency || 8) <= 4;
  return { touch, low, shadow: low ? 1024 : 2048, density: low ? 0.6 : 1 };
})();

let R, S, root, anim, colliders;
export function initArt(ctx) { ({ R, S } = ctx); }
export function bindWorld(r, a, c) { root = r; anim = a; colliders = c; }

// ---------- textures / materials ----------
const TL = new THREE.TextureLoader();
const texCache = {};
function tex(url, srgb, rep) {
  const key = url + rep;
  if (texCache[key]) return texCache[key];
  const t = TL.load(url);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, rep);
  t.anisotropy = Q.low ? 4 : 8;
  return (texCache[key] = t);
}
const matCache = {};
export function pbr(name, rep = 1, o = {}) {
  const key = name + rep + JSON.stringify(o);
  if (matCache[key]) return matCache[key];
  const b = `assets/pbr/${name}_`;
  const m = new THREE.MeshStandardMaterial({
    map: tex(b + 'c.jpg', true, rep),
    normalMap: tex(b + 'n.jpg', false, rep),
    roughnessMap: tex(b + 'r.jpg', false, rep),
    roughness: 1, metalness: 0, ...o,
  });
  if (o.normalScale) m.normalScale.set(o.normalScale, o.normalScale);
  return (matCache[key] = m);
}
export function std(color, rough = 0.6, metal = 0, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
}
function sh(m, cast = true, rec = true) { m.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = rec; } }); return m; }
export function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true;
  (parent || root).add(m); return m;
}
export const rbox = (w, h, d, r = 0.03) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.1, h / 2.1, d / 2.1));

// canvas texture helper
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const FONT = '"PingFang HK","Noto Sans CJK TC","Noto Sans TC","Microsoft JhengHei",sans-serif';
export { FONT };

// ---------- sky / lighting presets ----------
let sky, sun, hemi, envRT, pm;
export function setupLights(sunLight, hemiLight) {
  sun = sunLight; hemi = hemiLight;
  pm = new THREE.PMREMGenerator(R);
  sky = new Sky(); sky.scale.setScalar(4000);
}
const roomEnv = () => (setupLights._room ||= pm.fromScene(new RoomEnvironment(), 0.04).texture);

export function outdoor({ elev = 35, azim = 140, turb = 2.5, rayleigh = 1.2, fog = 0xb9d4ea, near = 40, far = 160, sunI = 3.1, hemiI = 0.38, sunC = 0xfff1dc, expo = 0.62, mie = 0.003 } = {}) {
  const u = sky.material.uniforms;
  u.turbidity.value = turb; u.rayleigh.value = rayleigh; u.mieCoefficient.value = mie; u.mieDirectionalG.value = 0.85;
  const phi = THREE.MathUtils.degToRad(90 - elev), th = THREE.MathUtils.degToRad(azim);
  const v = new THREE.Vector3().setFromSphericalCoords(1, phi, th);
  u.sunPosition.value.copy(v);
  S.add(sky);
  const es = new THREE.Scene(); const sk2 = sky.clone(); es.add(sk2);
  envRT?.dispose(); envRT = pm.fromScene(es, 0, 0.1, 5000);
  S.environment = envRT.texture; S.environmentIntensity = 0.55;
  S.background = null;
  S.fog = new THREE.Fog(fog, near, far);
  sun.position.copy(v).multiplyScalar(40); sun.userData.off = sun.position.clone();
  sun.intensity = sunI; sun.color.set(sunC);
  hemi.intensity = hemiI; hemi.color.set(0xdfefff); hemi.groundColor.set(0x6b5a45);
  R.toneMappingExposure = expo;
}
export function indoor({ bg = 0x1b2333, expo = 1.0, sunI = 1.6, hemiI = 0.35, sunDir = [-10, 12, 4], sunC = 0xfff0d6, envI = 0.55 } = {}) {
  S.remove(sky);
  S.environment = roomEnv(); S.environmentIntensity = envI;
  S.background = new THREE.Color(bg);
  S.fog = null;
  sun.position.set(...sunDir).normalize().multiplyScalar(40); sun.userData.off = sun.position.clone();
  sun.intensity = sunI; sun.color.set(sunC);
  hemi.intensity = hemiI; hemi.color.set(0xfff6ea); hemi.groundColor.set(0x5b4b3c);
  R.toneMappingExposure = expo;
}

// ---------- labels ----------
export function label(text, { icon = '', color = '#14223a', bg = 'rgba(255,255,255,0.92)', accent = '#2f80ed', scale = 1 } = {}) {
  const font = `700 52px ${FONT}`;
  const c0 = document.createElement('canvas').getContext('2d'); c0.font = font;
  const tw = c0.measureText(text).width + (icon ? 70 : 0);
  const W = Math.ceil(tw + 70), H = 96;
  const t = canvasTex(W, H + 18, (g) => {
    g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 12; g.shadowOffsetY = 4;
    g.fillStyle = bg; g.beginPath(); g.roundRect(6, 6, W - 12, H - 12, 40); g.fill();
    g.shadowColor = 'transparent';
    g.fillStyle = accent; g.beginPath(); g.roundRect(6, H - 18, W - 12, 6, 3); g.fill();
    g.beginPath(); g.moveTo(W / 2 - 12, H - 7); g.lineTo(W / 2 + 12, H - 7); g.lineTo(W / 2, H + 10); g.fillStyle = bg; g.fill();
    g.font = font; g.textBaseline = 'middle'; g.fillStyle = color;
    let x = 35;
    if (icon) { g.font = `52px ${FONT}`; g.fillText(icon, x, H / 2); x += 70; g.font = font; }
    g.fillText(text, x, H / 2 + 2);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, depthWrite: false, transparent: true }));
  const k = 0.0042 * scale; s.scale.set(W * k, (H + 18) * k, 1); s.center.set(0.5, 0);
  s.renderOrder = 10;
  return s;
}

// ---------- pickup token ----------
const ringTex = () => (ringTex._t ||= canvasTex(256, 256, (g) => {
  const gr = g.createRadialGradient(128, 128, 40, 128, 128, 126);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.15)');
  gr.addColorStop(0.82, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
}));
export function glowRing(r = 0.6, color = 0x6fd3ff) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: ringTex(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.renderOrder = 2;
  return m;
}
// face drawer: (g,w,h) draws illustration; or emoji
export function token({ x, z, icon = '❓', name, color = '#2f80ed', face, y = 0 }) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = (Math.random() - 0.5) * 0.3;
  const wood = pbr('wood049', 0.4, { color: 0xc08a5a });
  // easel: two front legs + back leg + tray
  for (const sx of [-0.32, 0.32]) { const l = mesh(rbox(0.05, 1.5, 0.05, 0.015), wood, sx, 0.72, 0.06, g); l.rotation.x = -0.12; l.rotation.z = sx > 0 ? 0.08 : -0.08; }
  const bl = mesh(rbox(0.045, 1.45, 0.045, 0.015), wood, 0, 0.66, -0.3, g); bl.rotation.x = 0.36;
  mesh(rbox(0.8, 0.05, 0.12, 0.015), wood, 0, 0.62, 0.12, g);
  mesh(rbox(0.7, 0.04, 0.04, 0.01), wood, 0, 1.38, 0.0, g);
  const ring = glowRing(0.85, new THREE.Color(color)); g.add(ring);
  const ft = canvasTex(256, 256, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#eef2f8');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    if (face) face(c, w, h); else { c.font = `150px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(icon, w / 2, h / 2 + 10); }
  });
  const faceMat = new THREE.MeshStandardMaterial({ map: ft, roughness: 0.55, emissive: 0xffffff, emissiveMap: ft, emissiveIntensity: 0.12 });
  const frameM = std(new THREE.Color(color), 0.4, 0.1);
  const card = new THREE.Group(); card.position.set(0, 1.0, 0.1); card.rotation.x = -0.14; g.add(card);
  mesh(rbox(0.74, 0.74, 0.05, 0.02), frameM, 0, 0, -0.01, card);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), faceMat); p.position.z = 0.017; card.add(p);
  const lb = label(name, { accent: color, scale: 0.8 }); lb.position.y = 1.55; g.add(lb);
  sh(g); ring.castShadow = false; lb.castShadow = false; p.castShadow = false;
  const ph = Math.random() * 6;
  anim.push((dt, t) => { ring.material.opacity = 0.5 + Math.sin(t * 3 + ph) * 0.3; lb.position.y = 1.55 + Math.sin(t * 2 + ph) * 0.03; });
  return g;
}
// drop pad: glowing circle with sign
export function pad({ x, z, name, icon = '', color = '#27ae60', r = 0.95 }) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.06, 0.08, 40), pbr('terrazzo013', 0.6)); base.position.y = 0.04; g.add(base);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(r * 0.82, 40), std(new THREE.Color(color), 0.5, 0, { emissive: new THREE.Color(color), emissiveIntensity: 0.25 }));
  inner.rotation.x = -Math.PI / 2; inner.position.y = 0.085; g.add(inner);
  const ring = glowRing(r * 1.35, new THREE.Color(color)); g.add(ring);
  const lb = label(name, { icon, accent: color }); lb.position.y = 0.55; g.add(lb);
  sh(g); g.userData.inner = inner;
  anim.push((dt, t) => { ring.material.opacity = 0.55 + Math.sin(t * 2.4) * 0.35; });
  return g;
}

// ---------- environment pieces ----------
export function ground(name, size, rep, y = 0, o = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), pbr(name, rep, o));
  m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; root.add(m); return m;
}
export function room({ wainscot = false, skip = '', w = 16, d = 16, h = 3.6, floor = 'woodfloor051', floorRep = 5, wall = 'paintedplaster017', wallColor = 0xf3ead8, windows = 'left', outside = 'city', ceiling = true }) {
  const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d), pbr(floor, floorRep)); f.rotation.x = -Math.PI / 2; f.receiveShadow = true; root.add(f);
  const wm = pbr(wall, 2, { color: wallColor });
  const skirt = std(0x6b4a33, 0.5);
  const outsideTex = outsideBackdrop(outside);
  const walls = [
    { x: 0, z: -d / 2, ry: 0, len: w, win: windows === 'front' },
    { x: 0, z: d / 2, ry: Math.PI, len: w, win: false },
    { x: -w / 2, z: 0, ry: Math.PI / 2, len: d, win: windows === 'left' || windows === 'both' },
    { x: w / 2, z: 0, ry: -Math.PI / 2, len: d, win: windows === 'right' || windows === 'both' },
  ];
  for (const W of walls) {
    if (skip.includes(walls.indexOf(W))) continue;
    const g = new THREE.Group(); g.position.set(W.x, 0, W.z); g.rotation.y = W.ry; root.add(g);
    if (!W.win) {
      mesh(new THREE.BoxGeometry(W.len, h, 0.2), wm, 0, h / 2, -0.1, g);
    } else {
      const n = Math.max(2, Math.floor(W.len / 4)), seg = W.len / n, ww = seg * 0.62, wy0 = 0.95, wy1 = h - 0.45;
      mesh(new THREE.BoxGeometry(W.len, wy0, 0.2), wm, 0, wy0 / 2, -0.1, g);
      mesh(new THREE.BoxGeometry(W.len, h - wy1, 0.2), wm, 0, (h + wy1) / 2, -0.1, g);
      for (let i = 0; i <= n; i++) {
        const px = -W.len / 2 + i * seg; const pw = (seg - ww);
        const pierW = i === 0 || i === n ? pw / 2 : pw;
        const cx = i === 0 ? px + pierW / 2 : i === n ? px - pierW / 2 : px;
        mesh(new THREE.BoxGeometry(pierW, wy1 - wy0, 0.2), wm, cx, (wy0 + wy1) / 2, -0.1, g);
      }
      for (let i = 0; i < n; i++) {
        const cx = -W.len / 2 + seg * (i + 0.5);
        // frame
        const fm = std(0xf4f6f8, 0.35, 0.3);
        mesh(new THREE.BoxGeometry(ww, 0.06, 0.26), fm, cx, wy0 + 0.03, -0.1, g);
        mesh(new THREE.BoxGeometry(ww, 0.06, 0.26), fm, cx, wy1 - 0.03, -0.1, g);
        mesh(new THREE.BoxGeometry(0.05, wy1 - wy0, 0.12), fm, cx, (wy0 + wy1) / 2, -0.1, g);
        mesh(new THREE.BoxGeometry(ww, 0.04, 0.1), fm, cx, (wy0 + wy1) / 2 + 0.3, -0.1, g);
        const sill = mesh(new THREE.BoxGeometry(ww + 0.2, 0.05, 0.36), std(0xe9e4da, 0.4), cx, wy0 - 0.02, 0.02, g);
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, wy1 - wy0), new THREE.MeshPhysicalMaterial({ color: 0xcfe6ff, roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: 0.18, envMapIntensity: 1.5 }));
        glass.position.set(cx, (wy0 + wy1) / 2, -0.1); g.add(glass);
        sill.castShadow = false;
      }
      // backdrop
      const bd = new THREE.Mesh(new THREE.PlaneGeometry(W.len * 1.6, h * 2.4), new THREE.MeshBasicMaterial({ map: outsideTex, fog: false, toneMapped: true }));
      bd.position.set(0, h * 0.75, -4.5); g.add(bd);
    }
    // skirting + cornice + wainscot
    if (wainscot) { mesh(new THREE.BoxGeometry(W.len, 0.95, 0.03), pbr('wood049', 2, { color: 0xb88a5e }), 0, 0.475, 0.0, g); mesh(new THREE.BoxGeometry(W.len, 0.05, 0.06), std(0x7a5636, 0.5), 0, 0.97, 0.02, g); }
    mesh(new THREE.BoxGeometry(W.len, 0.14, 0.04), skirt, 0, 0.07, 0.02, g);
    mesh(new THREE.BoxGeometry(W.len, 0.08, 0.08), std(0xfaf7f0, 0.5), 0, h - 0.04, 0.02, g);
  }
  if (ceiling) {
    const cm = std(0xf7f5f0, 0.9, 0, { emissive: 0x9a958c, emissiveIntensity: 0.6, side: THREE.DoubleSide });
    const c = new THREE.Mesh(new THREE.PlaneGeometry(w, d), cm); c.rotation.x = Math.PI / 2; c.position.y = h; root.add(c);
    // light panels
    const lp = std(0xffffff, 0.4, 0, { emissive: 0xfff5e0, emissiveIntensity: 2.2 });
    for (let x = -w / 2 + 3; x < w / 2 - 1; x += 4) for (let z = -d / 2 + 3; z < d / 2 - 1; z += 4) {
      const p = new THREE.Mesh(rbox(1.4, 0.05, 0.4, 0.02), lp); p.position.set(x, h - 0.03, z); root.add(p);
    }
  }
}
function outsideBackdrop(kind) {
  return canvasTex(1024, 512, (g, w, h) => {
    const storm = kind === 'storm';
    const gr = g.createLinearGradient(0, 0, 0, h);
    if (storm) { gr.addColorStop(0, '#2a3340'); gr.addColorStop(1, '#5d6b78'); }
    else { gr.addColorStop(0, '#6fa9e6'); gr.addColorStop(0.7, '#cfe5f7'); gr.addColorStop(1, '#eef4f8'); }
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // clouds
    for (let i = 0; i < 14; i++) {
      g.fillStyle = storm ? 'rgba(30,36,44,.5)' : 'rgba(255,255,255,.55)';
      const cx = Math.random() * w, cy = Math.random() * h * 0.4;
      for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(cx + k * 22, cy + Math.sin(k) * 8, 50, 18, 0, 0, 7); g.fill(); }
    }
    // hills
    g.fillStyle = storm ? '#3c4a43' : '#6f9a6a';
    g.beginPath(); g.moveTo(0, h * 0.62);
    for (let x = 0; x <= w; x += 16) g.lineTo(x, h * 0.55 - Math.sin(x * 0.006) * 60 - Math.sin(x * 0.017) * 20);
    g.lineTo(w, h); g.lineTo(0, h); g.fill();
    // towers
    for (let i = 0; i < 26; i++) {
      const bw = 30 + Math.random() * 40, bh = 90 + Math.random() * 170, bx = Math.random() * w;
      const by = h * 0.75 - bh;
      const tone = storm ? 70 + Math.random() * 30 : 190 + Math.random() * 50;
      g.fillStyle = `rgb(${tone},${tone + 4},${tone + 10})`; g.fillRect(bx, by, bw, bh + 200);
      g.fillStyle = storm ? 'rgba(255,220,150,.6)' : 'rgba(80,110,140,.55)';
      for (let yy = by + 8; yy < h; yy += 12) for (let xx = bx + 5; xx < bx + bw - 6; xx += 9) if (Math.random() > 0.25) g.fillRect(xx, yy, 5, 6);
    }
    g.fillStyle = storm ? '#2e3a35' : '#4f7d4e';
    for (let x = 0; x < w; x += 10) { g.beginPath(); g.arc(x, h * 0.9 + Math.sin(x) * 5, 20 + Math.random() * 12, 0, 7); g.fill(); }
  });
}

// classroom furniture
export function desk(x, z, ry = 0, withChair = true, parent) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; (parent || root).add(g);
  const top = pbr('wood049', 0.6);
  const leg = std(0x37414f, 0.35, 0.8);
  mesh(rbox(1.2, 0.05, 0.62, 0.015), top, 0, 0.74, 0, g);
  for (const [lx, lz] of [[-0.55, -0.27], [0.55, -0.27], [-0.55, 0.27], [0.55, 0.27]]) mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.72, 8), leg, lx, 0.36, lz, g);
  mesh(new THREE.BoxGeometry(1.08, 0.2, 0.02), leg, 0, 0.6, -0.27, g);
  mesh(rbox(1.08, 0.02, 0.5, 0.005), std(0x4a5566, 0.5, 0.5), 0, 0.6, 0, g);
  // books & pencil case
  const bc = [0xd94f45, 0x2f80ed, 0xf2c94c, 0x27ae60];
  if (Math.random() > 0.3) mesh(rbox(0.26, 0.03, 0.34, 0.006), std(bc[(Math.random() * 4) | 0], 0.6), -0.25 + Math.random() * 0.2, 0.78, 0.02, g).rotation.y = Math.random() - 0.5;
  if (Math.random() > 0.5) mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 12), std(0x7a5cff, 0.4), 0.3, 0.8, 0.1, g).rotation.z = Math.PI / 2;
  if (withChair) chair(0, 0.58, Math.PI, g);
  return g;
}
export function chair(x, z, ry = 0, parent) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; (parent || root).add(g);
  const seat = std(0x2f6fb5, 0.45);
  const leg = std(0x2b323d, 0.35, 0.8);
  mesh(rbox(0.44, 0.04, 0.42, 0.015), seat, 0, 0.44, 0, g);
  mesh(rbox(0.42, 0.28, 0.03, 0.012), seat, 0, 0.72, 0.2, g).rotation.x = -0.08;
  for (const [lx, lz] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.44, 8), leg, lx, 0.22, lz, g);
  mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.32, 8), leg, -0.19, 0.6, 0.2, g); mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.32, 8), leg, 0.19, 0.6, 0.2, g);
  return g;
}
export function board(x, y, z, w, h, draw, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; root.add(g);
  mesh(rbox(w + 0.16, h + 0.16, 0.06, 0.02), std(0x8a6a4a, 0.55), 0, 0, 0, g);
  const t = canvasTex(1024, Math.round(1024 * h / w), draw);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }));
  p.position.z = 0.035; g.add(p);
  mesh(new THREE.BoxGeometry(w * 0.9, 0.04, 0.1), std(0x8a6a4a, 0.55), 0, -h / 2 - 0.06, 0.06, g);
  return g;
}
export function chalkboard(g, w, h, title, lines = []) {
  g.fillStyle = '#1f4436'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
  g.fillStyle = 'rgba(255,255,255,.08)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 120, 30, Math.random(), 0, 7); g.fill(); }
  g.fillStyle = '#f5f2e8'; g.font = `700 ${Math.round(h * 0.13)}px ${FONT}`; g.textAlign = 'center'; g.fillText(title, w / 2, h * 0.2);
  g.font = `${Math.round(h * 0.075)}px ${FONT}`;
  lines.forEach((l, i) => { g.fillStyle = ['#f5f2e8', '#ffe68a', '#a8e6ff', '#ffb3c1'][i % 4]; g.fillText(l, w / 2, h * (0.38 + i * 0.13)); });
}
export function bookshelf(x, z, ry = 0, w = 2.2) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; root.add(g);
  const wd = pbr('wood049', 0.8, { color: 0xd8c0a0 });
  mesh(new THREE.BoxGeometry(w, 0.04, 0.4), wd, 0, 1.9, 0, g);
  mesh(new THREE.BoxGeometry(0.04, 1.9, 0.4), wd, -w / 2, 0.95, 0, g); mesh(new THREE.BoxGeometry(0.04, 1.9, 0.4), wd, w / 2, 0.95, 0, g);
  mesh(new THREE.BoxGeometry(w, 1.9, 0.02), wd, 0, 0.95, -0.19, g);
  const cols = [0xc0392b, 0x2980b9, 0x27ae60, 0xf39c12, 0x8e44ad, 0x16a085, 0xecf0f1, 0x34495e, 0xe67e22];
  const geos = []; const colors = [];
  for (let s = 0; s < 4; s++) {
    const sy = 0.05 + s * 0.47; mesh(new THREE.BoxGeometry(w, 0.03, 0.38), wd, 0, sy, 0, g);
    let bx = -w / 2 + 0.06;
    while (bx < w / 2 - 0.12) {
      const bw = 0.03 + Math.random() * 0.05, bh = 0.25 + Math.random() * 0.15;
      if (Math.random() < 0.08) { bx += 0.12; continue; }
      const geo = new THREE.BoxGeometry(bw, bh, 0.26 + Math.random() * 0.06); geo.translate(bx + bw / 2, sy + 0.015 + bh / 2, 0.02);
      if (Math.random() < 0.1) { geo.rotateZ(0); }
      const c = new THREE.Color(cols[(Math.random() * cols.length) | 0]);
      const n = geo.attributes.position.count; const ca = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.toArray(ca, i * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(ca, 3)); geos.push(geo);
      bx += bw + 0.004;
    }
  }
  mesh(mergeGeometries(geos), std(0xffffff, 0.7, 0, { vertexColors: true }), 0, 0, 0, g);
  return g;
}
export function plant(x, z, s = 1, parent) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); (parent || root).add(g);
  const pot = mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.36, 20), std(0xc96f4a, 0.7), 0, 0.18, 0, g);
  mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 20), std(0x3b2a1e, 1), 0, 0.35, 0, g);
  const lm = std(0x3f8f3a, 0.55, 0, { side: THREE.DoubleSide });
  for (let i = 0; i < 14; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 6), lm); leaf.scale.set(0.45, 0.12, 1.4);
    const a = (i / 14) * Math.PI * 2, tilt = 0.4 + Math.random() * 0.6;
    leaf.position.set(Math.cos(a) * 0.12, 0.45 + Math.random() * 0.35, Math.sin(a) * 0.12);
    leaf.rotation.set(tilt, -a + Math.PI / 2, 0); leaf.castShadow = true; g.add(leaf);
  }
  return g;
}
const leafTex = () => (leafTex._t ||= (() => { const t = canvasTex(256, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) {
    const x = 30 + Math.random() * 196, y = 30 + Math.random() * 196, a = Math.random() * 6.28, L = 26 + Math.random() * 20;
    const l = 55 + Math.random() * 30;
    g.fillStyle = `hsl(0,0%,${l}%)`; g.save(); g.translate(x, y); g.rotate(a);
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * 0.5, -L * 0.35, L, 0); g.quadraticCurveTo(L * 0.5, L * 0.35, 0, 0); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, 0); g.lineTo(L, 0); g.stroke(); g.restore();
  }
}); t.colorSpace = THREE.SRGBColorSpace; return t; })());
export function tree(x, z, s = 1, { leaf = 0x4f8f3f, trunk = 0x6b4a33, bare = false, snow = false } = {}) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); g.rotation.y = Math.random() * 6; root.add(g);
  const tm = pbr('wood049', 0.3, { color: trunk });
  const trunkGeo = new THREE.CylinderGeometry(0.09, 0.18, 2.0, 10, 4); const tp = trunkGeo.attributes.position;
  for (let i = 0; i < tp.count; i++) { const yy = tp.getY(i); tp.setX(i, tp.getX(i) + Math.sin(yy * 2) * 0.04); }
  trunkGeo.computeVertexNormals(); mesh(trunkGeo, tm, 0, 1.0, 0, g);
  const tips = [];
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3 + Math.random() * 0.5, len = 0.9 + Math.random() * 0.5, y0 = 1.4 + i * 0.18;
    const b = mesh(new THREE.CylinderGeometry(0.025, 0.06, len, 6), tm, 0, 0, 0, g);
    const dir = new THREE.Vector3(Math.cos(a), 1.1, Math.sin(a)).normalize();
    b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    b.position.set(dir.x * len / 2, y0 + dir.y * len / 2, dir.z * len / 2);
    tips.push(new THREE.Vector3(dir.x * len, y0 + dir.y * len, dir.z * len));
  }
  if (!bare) {
    const N = Math.round(480 * Q.density);
    const lm = new THREE.MeshStandardMaterial({ color: leaf, map: leafTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.6, 0.6), lm, N);
    const d = new THREE.Object3D(), col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const c = i < N * 0.35 ? new THREE.Vector3(0, 2.6, 0) : tips[i % tips.length];
      const v = new THREE.Vector3().randomDirection().multiplyScalar(Math.cbrt(Math.random()) * (i < N * 0.35 ? 1.05 : 0.7));
      v.y *= 0.75;
      d.position.copy(c).add(v);
      d.lookAt(d.position.clone().add(v)); d.rotateZ(Math.random() * 6.28);
      d.scale.setScalar(0.7 + Math.random() * 0.6); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
      const shade = 0.65 + 0.35 * Math.min(1, (d.position.y - 1.6) / 1.8) + (Math.random() - 0.5) * 0.15;
      im.setColorAt(i, col.setRGB(shade, shade, shade));
    }
    im.castShadow = true; im.receiveShadow = true;
    im.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafTex(), alphaTest: 0.5 });
    g.add(im);
    if (snow) for (let i = 0; i < 4; i++) mesh(new THREE.SphereGeometry(0.4, 12, 8), std(0xffffff, 0.9), (Math.random() - 0.5) * 0.8, 3.0 + Math.random() * 0.3, (Math.random() - 0.5) * 0.8, g).scale.y = 0.35;
  }
  colliders.push({ x, z, r: 0.35 * s });
  return g;
}
export function lamp(x, z, warm = true) {
  const g = new THREE.Group(); g.position.set(x, 0, z); root.add(g);
  const m = std(0x2b3440, 0.35, 0.8);
  mesh(new THREE.CylinderGeometry(0.06, 0.09, 4, 10), m, 0, 2, 0, g);
  mesh(new THREE.BoxGeometry(0.9, 0.06, 0.08), m, 0.4, 3.95, 0, g);
  mesh(rbox(0.4, 0.12, 0.22, 0.03), std(0xffffff, 0.2, 0, { emissive: warm ? 0xffd9a0 : 0xe8f4ff, emissiveIntensity: 3 }), 0.8, 3.88, 0, g);
  colliders.push({ x, z, r: 0.25 });
  return g;
}
export function bench(x, z, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; root.add(g);
  const w = pbr('wood049', 0.5, { color: 0xb07a4a }); const m = std(0x2c3a33, 0.4, 0.7);
  for (let i = 0; i < 3; i++) mesh(rbox(1.6, 0.04, 0.12, 0.01), w, 0, 0.45, -0.15 + i * 0.14, g);
  for (let i = 0; i < 2; i++) mesh(rbox(1.6, 0.1, 0.03, 0.01), w, 0, 0.65 + i * 0.14, 0.24, g).rotation.x = 0.15;
  for (const sx of [-0.7, 0.7]) { mesh(new THREE.BoxGeometry(0.05, 0.45, 0.42), m, sx, 0.22, 0.02, g); mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), m, sx, 0.65, 0.26, g); }
  colliders.push({ x, z, r: 0.7 });
  return g;
}
export function building(x, z, w, d, h, { tone = 0xd9d2c5, ry = 0, signs = [] } = {}) {
  const t = canvasTex(256, 512, (g, W, H) => {
    g.fillStyle = '#' + new THREE.Color(tone).getHexString(); g.fillRect(0, 0, W, H);
    for (let y = 8; y < H; y += 32) for (let xx = 10; xx < W - 10; xx += 40) {
      const lit = Math.random() > 0.55; g.fillStyle = lit ? '#ffe4a8' : '#5d7387'; g.fillRect(xx, y, 26, 20);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(xx, y + 20, 28, 3);
      if (Math.random() > 0.7) { g.fillStyle = '#8a8f96'; g.fillRect(xx + 6, y + 22, 14, 6); }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.max(1, w / 6), Math.max(1, h / 12));
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.75, emissive: 0x302010, emissiveMap: t, emissiveIntensity: 0.15 });
  const b = mesh(new THREE.BoxGeometry(w, h, d), [m, m, std(tone, 0.8), std(tone, 0.8), m, m], x, h / 2, z);
  b.rotation.y = ry;
  mesh(new THREE.BoxGeometry(w + 0.2, 0.3, d + 0.2), std(0x8e9196, 0.6), x, h + 0.15, z).rotation.y = ry;
  colliders.push({ x, z, r: Math.max(w, d) / 2 + 0.3 });
  return b;
}
export function water(size, y = -0.2) {
  const n1 = TL.load('assets/misc/waternormals.jpg'); n1.wrapS = n1.wrapT = THREE.RepeatWrapping; n1.repeat.set(size / 14, size / 14);
  const m = new THREE.MeshPhysicalMaterial({ color: 0x0e5a78, roughness: 0.06, metalness: 0.0, normalMap: n1, normalScale: new THREE.Vector2(0.6, 0.6), clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.2 });
  const w = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
  w.rotation.x = -Math.PI / 2; w.position.y = y; w.receiveShadow = true; root.add(w);
  anim.push((dt) => { n1.offset.x += dt * 0.012; n1.offset.y += dt * 0.007; });
  return w;
}
export function terrain(size, seg, heightFn, matName = 'grass004', rep = 12) {
  const geo = new THREE.PlaneGeometry(size, size, seg, seg); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position; const col = new Float32Array(p.count * 3);
  const grass = new THREE.Color(0xffffff), rock = new THREE.Color(0x9a8f80), snowC = new THREE.Color(0xe6e2da);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i); const y = heightFn(x, z); p.setY(i, y);
    const c = y > 9 ? rock.clone().lerp(snowC, Math.min(1, (y - 9) / 4)) : grass.clone().lerp(rock, Math.max(0, Math.min(1, (y - 3) / 6)));
    c.toArray(col, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  const m = pbr(matName, rep, { vertexColors: true });
  const t = new THREE.Mesh(geo, m); t.receiveShadow = true; t.castShadow = true; root.add(t);
  return t;
}
export function rain(count = 2500, area = 30) {
  const geo = new THREE.BufferGeometry(); const pos = new Float32Array(count * 6);
  for (let i = 0; i < count; i++) { const x = (Math.random() - 0.5) * area, y = Math.random() * 14, z = (Math.random() - 0.5) * area; pos.set([x, y, z, x - 0.05, y - 0.45, z], i * 6); }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xbfd4ea, transparent: true, opacity: 0.45 }));
  root.add(l);
  anim.push((dt) => { const a = geo.attributes.position.array; for (let i = 0; i < a.length; i += 6) { a[i + 1] -= dt * 22; a[i + 4] -= dt * 22; a[i] -= dt * 4; a[i + 3] -= dt * 4; if (a[i + 1] < 0) { a[i + 1] += 14; a[i + 4] += 14; a[i] += 2; a[i + 3] += 2; } } geo.attributes.position.needsUpdate = true; });
  return l;
}
export function particles(count, area, color, size, fall = 0.6, top = 8) {
  const geo = new THREE.BufferGeometry(); const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) pos.set([(Math.random() - 0.5) * area, Math.random() * top, (Math.random() - 0.5) * area], i * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dot = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const p = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, map: dot, transparent: true, depthWrite: false }));
  root.add(p);
  anim.push((dt, t) => { const a = geo.attributes.position.array; for (let i = 0; i < a.length; i += 3) { a[i + 1] -= dt * fall; a[i] += Math.sin(t + i) * dt * 0.2; if (a[i + 1] < 0) a[i + 1] = top; } geo.attributes.position.needsUpdate = true; });
  return p;
}
export function stars(n = 2000) {
  const geo = new THREE.BufferGeometry(); const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(60); v.y = Math.abs(v.y); pos.set(v.toArray(), i * 3); }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  root.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, sizeAttenuation: true, fog: false })));
}
export function signPost(x, z, text, icon, color = '#c0392b', ry = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; root.add(g);
  mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 10), std(0x9aa3ad, 0.3, 0.9), 0, 1.1, 0, g);
  const t = canvasTex(512, 256, (c, w, h) => { c.fillStyle = color; c.beginPath(); c.roundRect(0, 0, w, h, 30); c.fill(); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `110px ${FONT}`; c.fillText(icon, w / 2, h * 0.36); c.font = `700 62px ${FONT}`; c.fillText(text, w / 2, h * 0.78); });
  const p = mesh(new THREE.BoxGeometry(1.0, 0.5, 0.04), [std(0xdddddd), std(0xdddddd), std(0xdddddd), std(0xdddddd), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }), std(0xdddddd)], 0, 2.1, 0.05, g);
  return g;
}
