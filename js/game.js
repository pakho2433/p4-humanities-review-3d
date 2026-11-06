import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import * as A from './art.js';

const $ = (id) => document.getElementById(id);
const CONTENT = await fetch('data/content.json').then((r) => r.json());
const MISSIONS = CONTENT.missions;
const F = CONTENT.facts;

['gesturestart','gesturechange','gestureend','dblclick','contextmenu'].forEach((e) =>
  document.addEventListener(e, (ev) => ev.preventDefault(), { passive: false })
);
document.addEventListener('touchmove', (e) => { if (e.target.closest('#boardHost')) return; e.preventDefault(); }, { passive: false });
const TOUCH = A.Q.touch;

// ---- renderer / scene ----
const R = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio, A.Q.low ? 1.5 : 2);
R.setPixelRatio(pixelRatio);
R.setSize(innerWidth, innerHeight);
R.toneMapping = THREE.ACESFilmicToneMapping;
R.toneMappingExposure = 1.0;
R.outputColorSpace = THREE.SRGBColorSpace;
R.shadowMap.enabled = true;
R.shadowMap.type = A.Q.low ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
document.body.prepend(R.domElement);

const S = new THREE.Scene();
const C = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.05, 6000);
function fit() {
  const a = innerWidth / innerHeight;
  C.aspect = a;
  C.fov = a >= 1 ? 68 : Math.min(92, (2 * Math.atan(Math.tan((34 * Math.PI) / 180) / Math.max(a, 0.55)) * 180) / Math.PI);
  C.updateProjectionMatrix();
  R.setSize(innerWidth, innerHeight);
}
fit();
addEventListener('resize', fit);
addEventListener('orientationchange', () => setTimeout(fit, 280));

const hemi = new THREE.HemisphereLight(0xfff6e8, 0x4a5a48, 0.5);
S.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(A.Q.shadow, A.Q.shadow);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 120 });
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03;
S.add(sun, sun.target);
A.initArt({ R, S });
A.setupLights(sun, hemi);

// ---- models ----
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const MODELS = {};
const MODEL_FILES = {
  boy: 'Casual_Male', girl: 'Casual_Female', elder: 'OldClassy_Female', worker: 'Worker_Female',
  teacher: 'Suit_Male', girl2: 'Casual2_Female', boy2: 'Casual3_Male',
  tram: 'tram', taxi: 'taxi', minibus: 'minibus', tonglau: 'tonglau', phonebox: 'phonebox', newsstand: 'newsstand', hawker: 'hawker',
};
let modelsP = null;
const SKIN = 0xf0c8a0;
const PALETTE = {
  boy: { Skin: SKIN, Shirt: 0x3f7fd6, Pants: 0x2d3748, Belt: 0x3a2a1a, Hair: 0x2a1a10 },
  boy2: { Skin: 0xe8b98f, Shirt: 0xf2f4f7, Pants: 0x24406e, Belt: 0x3a2a1a, Hair: 0x1a1210 },
  girl: { Skin: SKIN, Shirt: 0xe85d75, Pants: 0x2d3748, Belt: 0x3a2a1a, Hair: 0x24160f },
  girl2: { Skin: 0xf2cfab, Shirt: 0x3fb27f, Pants: 0x3a3f58, Hair: 0x1c120c },
  elder: { Skin: 0xe9c4a2, Hair: 0xcfcfd4 },
  teacher: { Skin: 0xe8be96, Hair: 0x1a1210, Black: 0x2b3550 },
  worker: { Skin: 0xe6b88f },
};
function loadModels() {
  return (modelsP ||= Promise.all(Object.entries(MODEL_FILES).map(async ([k, f]) => {
    try {
      const g = await loader.loadAsync(`assets/models/${f}.glb`);
      const pal = PALETTE[k];
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = true;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => { if (!m) return; m.envMapIntensity = 0.8; if (m.name === 'Face') { m.color.set(0x1b1410); m.roughness = 0.25; }
        if (pal && pal[m.name] !== undefined) { m.color.set(pal[m.name]); m.roughness = m.name === 'Hair' ? 0.55 : 0.75; } });
      });
      if (PALETTE[k]) addEyes(g.scene);
      if (PALETTE[k] || ['boy','girl','elder','worker','teacher','girl2','boy2'].includes(k)) { const bb = new THREE.Box3().setFromObject(g.scene); g.unit = 1.72 / (bb.max.y - bb.min.y); console.info('model h', k, (bb.max.y - bb.min.y).toFixed(2)); }
      MODELS[k] = g;
    } catch (e) { console.warn('model', k, e); }
  })));
}
const mixers = [];
function addEyes(scene) {
  scene.updateMatrixWorld(true);
  let brow = null, head = null;
  scene.traverse((o) => { if (o.isMesh && o.material?.name === 'Face') brow = o; if (o.isBone && /head/i.test(o.name) && !head) head = o; });
  if (!brow || !head) return;
  const bb = new THREE.Box3(); const v = new THREE.Vector3();
  const n = brow.geometry.attributes.position.count;
  for (let i = 0; i < n; i++) { if (brow.isSkinnedMesh) brow.getVertexPosition(i, v); else v.fromBufferAttribute(brow.geometry.attributes.position, i); v.applyMatrix4(brow.matrixWorld); bb.expandByPoint(v); }
  const H = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3()).y;
  const w = bb.max.x - bb.min.x, cx = (bb.max.x + bb.min.x) / 2;
  const r = H * 0.024;
  const eyeM = new THREE.MeshStandardMaterial({ color: 0x15110e, roughness: 0.15 });
  const hiM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const cheekM = new THREE.MeshBasicMaterial({ color: 0xff8f8f, transparent: true, opacity: 0.45, depthWrite: false });
  const mouthM = new THREE.MeshStandardMaterial({ color: 0x8a3b30, roughness: 0.5 });
  const add = (mesh, x, y, z) => { const p = new THREE.Vector3(x, y, z); head.worldToLocal(p); mesh.position.copy(p); head.add(mesh); };
  const z = bb.max.z;
  for (const s of [-1, 1]) {
    const ex = cx + s * w * 0.24, ey = bb.min.y - r * 1.3;
    const e = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), eyeM); e.scale.set(0.95, 1.25, 0.55); add(e, ex, ey, z - r * 0.1);
    const h = new THREE.Mesh(new THREE.SphereGeometry(r * 0.32, 8, 6), hiM); add(h, ex + r * 0.25, ey + r * 0.4, z + r * 0.15);
    const c = new THREE.Mesh(new THREE.CircleGeometry(r * 0.9, 16), cheekM); add(c, cx + s * w * 0.4, ey - r * 1.8, z + r * 0.05);
  }
  const m = new THREE.Mesh(new THREE.TorusGeometry(r * 0.9, r * 0.22, 6, 12, Math.PI), mouthM); m.rotation.z = Math.PI; add(m, cx, bb.min.y - r * 3.6, z + r * 0.05);
}
function spawnPerson(kind, x, z, scale = 1, rotY = 0, clip = 'Idle') {
  const src = MODELS[kind];
  if (!src) { const g = new THREE.Group(); g.position.set(x, 0, z); return g; }
  const inner = SkeletonUtils.clone(src.scene);
  inner.scale.setScalar(scale * (src.unit || 1));
  const root = new THREE.Group(); root.add(inner);
  root.position.set(x, 0, z); root.rotation.y = rotY;
  if (src.animations?.length) {
    const mx = new THREE.AnimationMixer(inner);
    const c = src.animations.find((a) => a.name === clip) || src.animations[0];
    const act = mx.clipAction(c); act.play(); act.time = Math.random() * c.duration;
    mixers.push(mx); root.userData.mixer = mx; root.userData.clips = src.animations;
  }
  return root;
}
function playClip(p, name) {
  const mx = p.userData.mixer; if (!mx) return;
  const c = p.userData.clips.find((a) => a.name === name); if (!c) return;
  mx.stopAllAction(); const a = mx.clipAction(c); a.reset().play();
}
function placeModel(kind, x, z, { h, w, ry = 0, y = 0 } = {}) {
  const src = MODELS[kind]; if (!src) return null;
  const m = src.scene.clone(true);
  const b = new THREE.Box3().setFromObject(m); const sz = b.getSize(new THREE.Vector3());
  const k = h ? h / sz.y : w ? w / Math.max(sz.x, sz.z) : 1;
  m.scale.setScalar(k);
  const b2 = new THREE.Box3().setFromObject(m); const c = b2.getCenter(new THREE.Vector3());
  const g = new THREE.Group(); m.position.set(-c.x, -b2.min.y, -c.z); g.add(m);
  g.position.set(x, y, z); g.rotation.y = ry; worldRoot.add(g);
  return g;
}
function walker(kind, path, speed = 1.1) {
  const p = spawnPerson(kind, path[0][0], path[0][1], 1, 0, 'Walk'); worldRoot.add(p);
  let seg = 0, u = 0;
  anims.push((dt) => {
    const a = path[seg], b = path[(seg + 1) % path.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); u += (dt * speed) / L;
    if (u >= 1) { u = 0; seg = (seg + 1) % path.length; return; }
    p.position.set(a[0] + (b[0] - a[0]) * u, 0, a[1] + (b[1] - a[1]) * u);
    p.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
  });
  return p;
}
const anims = [];

// ---- player ----
const keys = {};
addEventListener('keydown', (e) => { keys[e.code] = true; if (['Space','KeyE'].includes(e.code)) e.preventDefault(); });
addEventListener('keyup', (e) => { keys[e.code] = false; });

const player = { x: 0, y: 1.55, z: 6, yaw: 0, pitch: 0, speed: 4.2 };
const vel = { x: 0, z: 0 };
let joy = { active: false, dx: 0, dy: 0 };
let lookDrag = null;

function setCam() {
  C.position.set(player.x, player.y, player.z);
  C.rotation.order = 'YXZ';
  C.rotation.y = player.yaw;
  C.rotation.x = player.pitch;
  C.rotation.z = 0;
}

// pointer look (desktop)
R.domElement.addEventListener('mousedown', (e) => {
  if (boardModal) return;
  lookDrag = { x: e.clientX, y: e.clientY };
});
addEventListener('mouseup', () => { lookDrag = null; });
addEventListener('mousemove', (e) => {
  if (!lookDrag || boardModal) return;
  player.yaw -= e.movementX * 0.0025;
  player.pitch -= e.movementY * 0.0022;
  player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch));
});

// touch: left joy, right look
const joyEl = $('joy'), knob = $('knob');
if (TOUCH) joyEl.style.display = 'block';
function joyPos(cx, cy) {
  const r = joyEl.getBoundingClientRect();
  const jx = r.left + r.width / 2, jy = r.top + r.height / 2;
  let dx = (cx - jx) / (r.width / 2), dy = (cy - jy) / (r.height / 2);
  const len = Math.hypot(dx, dy) || 1;
  if (len > 1) { dx /= len; dy /= len; }
  joy.dx = dx; joy.dy = dy;
  knob.style.left = `${40 + dx * 35}px`;
  knob.style.top = `${40 + dy * 35}px`;
}
addEventListener('touchstart', (e) => {
  for (const t of e.changedTouches) {
    if (t.target.closest?.('.board,#act,.ov')) continue;
    if (t.clientX < innerWidth * 0.45) { joy.active = t.identifier; joyPos(t.clientX, t.clientY); }
    else if (!boardModal && !t.target.closest?.('.board')) lookDrag = { id: t.identifier, x: t.clientX, y: t.clientY };
  }
}, { passive: true });
addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === joy.active) joyPos(t.clientX, t.clientY);
    if (lookDrag && t.identifier === lookDrag.id) {
      player.yaw -= (t.clientX - lookDrag.x) * 0.004;
      player.pitch -= (t.clientY - lookDrag.y) * 0.0035;
      player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch));
      lookDrag.x = t.clientX; lookDrag.y = t.clientY;
    }
  }
}, { passive: true });
addEventListener('touchend', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === joy.active) { joy.active = false; joy.dx = joy.dy = 0; knob.style.left = '40px'; knob.style.top = '40px'; }
    if (lookDrag && t.identifier === lookDrag.id) lookDrag = null;
  }
});

const colliders = []; // {x,z,r}
function blocked(nx, nz) {
  if (Math.abs(nx) > bounds || Math.abs(nz) > bounds) return true;
  for (const c of colliders) {
    if (Math.hypot(nx - c.x, nz - c.z) < c.r) return true;
  }
  return false;
}
let bounds = 14;

function movePlayer(dt) {
  let ix = 0, iz = 0;
  if (keys['KeyW'] || keys['ArrowUp']) iz -= 1;
  if (keys['KeyS'] || keys['ArrowDown']) iz += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) ix -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) ix += 1;
  if (joy.active !== false) { ix += joy.dx; iz += joy.dy; }
  const len = Math.hypot(ix, iz);
  if (len > 0) { ix /= len; iz /= len; }
  const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
  const dx = (ix * c + iz * s) * player.speed * dt;
  const dz = (-ix * s + iz * c) * player.speed * dt;
  if (!blocked(player.x + dx, player.z)) player.x += dx;
  if (!blocked(player.x, player.z + dz)) player.z += dz;
  setCam();
}

// ---- world / mission state ----
const worldRoot = new THREE.Group();
S.add(worldRoot);
A.bindWorld(worldRoot, anims, colliders);
let shake = 0;
let interactables = [];
let boardOpen = false;
let boardModal = false;
let score = 0;
let missionIndex = 0;
let missionTimeLeft = 0;
let missionTimerOn = false;
let running = false;
let held = null; // carried object userData
let missionDone = new Array(MISSIONS.length).fill(false);

function clearWorld() {
  while (worldRoot.children.length) {
    const o = worldRoot.children.pop();
    o.traverse?.((x) => {
      if (x.geometry) x.geometry.dispose?.();
    });
    worldRoot.remove(o);
  }
  colliders.length = 0;
  anims.length = 0; mixers.length = 0; shake = 0;
  interactables = [];
  held = null;
  hideBoard();
  setPrompt('');
  setAct(false);
}

function setBounds(b) { bounds = b; }

function toast(emoji, ms = 900) {
  const t = $('toast'); t.textContent = emoji; t.style.opacity = '1';
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.style.opacity = '0'; }, ms);
}
function setPill(html) { $('missionPill').innerHTML = html; }
function hint(t) { const h = $('hint'); if (h) { h.textContent = t; h.classList.add('show'); clearTimeout(hint._t); hint._t = setTimeout(() => h.classList.remove('show'), 4200); } }
function updateHeldHud() { const h = $('held'); if (!h) return; h.classList.toggle('show', !!held); h.innerHTML = held ? `<span>手持</span><b>${held.label}</b>` : ''; }
function setStats() {
  const m = Math.max(0, Math.ceil(missionTimeLeft));
  const el = Math.floor((performance.now() - (window.__t0 || performance.now())) / 1000);
  $('stats').textContent = `⭐ ${score} · ⏱ ${Math.floor(el / 60)}:${String(el % 60).padStart(2, '0')}`;
}
function setPrompt(txt) {
  const p = $('prompt');
  if (!txt) { p.style.display = 'none'; return; }
  p.style.display = 'block'; p.textContent = txt;
}
function setAct(on) {
  const a = $('act');
  a.style.display = running ? 'block' : 'none';
  a.classList.toggle('on', !!on);
}
function refreshProgress() {
  $('progress').innerHTML = MISSIONS.map((_, i) => {
    const cls = missionDone[i] ? 'done' : i === missionIndex ? 'cur' : '';
    return `<i class="${cls}" title="${MISSIONS[i].name}"></i>`;
  }).join('');
}

function hideBoard() {
  boardOpen = false; boardModal = false;
  const h = $('boardHost');
  h.classList.remove('show', 'modal');
  h.innerHTML = '';
}
function showBoard(html, modal = false) {
  boardOpen = true; boardModal = !!modal;
  const h = $('boardHost');
  h.classList.add('show');
  h.classList.toggle('modal', !!modal);
  h.innerHTML = `<div class="board" data-testid="board">${html}</div>`;
  return h.querySelector('.board');
}

function makeInteractable(mesh, data) {
  mesh.userData.interact = data;
  interactables.push(mesh);
  worldRoot.add(mesh);
  return mesh;
}

function nearestInteractable() {
  let best = null, bd = 2.1, bs = 1e9;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  for (const m of interactables) {
    if (!m.visible || m.userData.spent) continue;
    const p = m.getWorldPosition(_v);
    const dx = p.x - player.x, dz = p.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d > bd) continue;
    const dot = (dx * fx + dz * fz) / (d || 1);
    if (dot < 0.2 && d > 1.0) continue;
    const sc = d * (1.6 - dot);
    if (sc < bs) { best = m; bs = sc; }
  }
  return best;
}
const _v = new THREE.Vector3();

const FIGHT = { 1: 3, 4: 4, 7: 4, 9: 5 }; const fought = {};
function completeMission(bonus = 0) {
  if (FIGHT[missionIndex] && !fought[missionIndex]) { fought[missionIndex] = true; hideBoard(); spawnSlimes(FIGHT[missionIndex], () => completeMission(bonus)); return; }
  const m = MISSIONS[missionIndex];
  const timeBonus = Math.round(Math.max(0, missionTimeLeft) * 0.5);
  const gain = m.points + timeBonus + bonus;
  score += gain; money += 40; updWeap();
  missionDone[missionIndex] = true;
  missionTimerOn = false;
  toast('✅');
  setPill(`${m.icon} ${m.name} 完成！+${gain}`);
  refreshProgress();
  setStats();
  setTimeout(() => {
    missionIndex++;
    if (missionIndex >= MISSIONS.length) endGame();
    else startMission(missionIndex);
  }, 900);
}

function failNudge(msg = '再試一次') {
  toast('❌');
  setPill(`⚠️ ${msg}`);
}

function startMission(i) {
  clearWorld();
  missionIndex = i;
  const m = MISSIONS[i];
  missionTimeLeft = m.seconds;
  missionTimerOn = false;
  player.x = 0; player.z = 5; player.yaw = 0; player.pitch = 0;
  setPill(`<span class="ic">${m.icon}</span><b>${m.name}</b><small>${CONTENT.lessons.find((l) => l.id === m.lesson).name}</small>`);
  hint(m.hint);
  refreshProgress();
  setStats();
  const builders = [buildM1, buildM2, buildM3, buildM4, buildM5, buildM6, buildM7, buildM8, buildM9, buildM10, buildM11, buildM12];
  builders[i]();
  setCam();
}

function endGame() {
  if (!bossWon) { startBoss(); return; }
  running = false;
  hideBoard(); setPrompt('');
  missionTimerOn = false;
  $('end').classList.remove('hide');
  const stars = score > 1400 ? '⭐⭐⭐' : score > 1000 ? '⭐⭐' : '⭐';
  $('endStars').textContent = stars;
  $('endScore').innerHTML = `<b>${score}</b><span>總分</span>`;
  $('endDone').textContent = `完成 ${missionDone.filter(Boolean).length} / ${MISSIONS.length} 個任務`;
  setAct(false);
}


// ========== SCENE ART HELPERS ==========
const LESSON_COL = { L1: '#2f80ed', L2: '#27ae60', L3: '#f2994a', L4: '#9b51e0' };
function addTok(opts, data) {
  const t = A.token(opts); return makeInteractable(t, data);
}
function classroom({ w = 16, d = 14, title = '小小考察隊', lines = [], desks = true } = {}) {
  A.indoor({ bg: 0xcfe2f5, expo: 1.15, sunI: 2.6, sunDir: [-14, 9, 3], envI: 0.6 });
  A.room({ w, d, h: 3.6, floor: 'woodfloor051', floorRep: 4, wall: 'plaster001', wallColor: 0xf6efe2, windows: 'left', wainscot: true });
  for (let x = -w / 2 + 3; x < w / 2 - 1; x += 4) for (let z = -d / 2 + 3; z < d / 2 - 1; z += 4) { const pl = new THREE.PointLight(0xfff1dc, 5, 7, 1.8); pl.position.set(x, 3.3, z); worldRoot.add(pl); }
  A.board(0, 1.75, -d / 2 + 0.06, 4.4, 1.5, (g, W, H) => A.chalkboard(g, W, H, title, lines));
  // teacher desk + teacher
  const td = A.desk(-3.4, -d / 2 + 1.6, 0, false); td.scale.set(1.3, 1, 1.2);
  colliders.push({ x: -3.4, z: -d / 2 + 1.6, r: 0.9 });
  const t = spawnPerson('teacher', -4.6, -d / 2 + 1.3, 1, 0.5); worldRoot.add(t);
  A.bookshelf(w / 2 - 0.25, 1.5, -Math.PI / 2, 2.4); colliders.push({ x: w / 2 - 0.3, z: 1.5, r: 1.2 });
  A.bookshelf(w / 2 - 0.25, -2.2, -Math.PI / 2, 2.4);
  // posters
  A.board(w / 2 - 0.08, 2.0, 4.6, 1.6, 1.1, posterHK, -Math.PI / 2);
  A.board(-w / 2 + 2.5, 2.0, d / 2 - 0.08, 1.4, 1.0, posterWorld, Math.PI);
  A.board(2.6, 2.0, d / 2 - 0.08, 1.4, 1.0, posterWeather, Math.PI);
  A.plant(w / 2 - 0.6, -d / 2 + 0.6, 1.3); A.plant(-w / 2 + 0.6, d / 2 - 0.6, 1.2);
  // clock
  const ck = A.mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 32), A.std(0xffffff, 0.3), 3.2, 2.9, -d / 2 + 0.05); ck.rotation.x = Math.PI / 2;
  A.mesh(new THREE.TorusGeometry(0.28, 0.025, 8, 32), A.std(0x222831, 0.3, 0.6), 3.2, 2.9, -d / 2 + 0.07);
  if (desks) {
    const kids = ['boy', 'girl', 'boy2', 'girl2'];
    let k = 0;
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
      const x = -4.5 + c * 3, z = -2.2 - r * 1.6;
      if (Math.abs(x + 3.4) < 1.6 && z < -d / 2 + 3) continue;
      A.desk(x, z, 0); colliders.push({ x, z: z + 0.2, r: 0.75 });
      if ((r + c) % 3 === 0) { const p = spawnPerson(kids[k++ % 4], x + 0.0, z + 0.62, 0.78, Math.PI, 'Idle'); worldRoot.add(p); }
    }
  }
  // standing classmates chatting near the windows / back
  if (desks) {
    const a1 = spawnPerson('girl', -6.2, 1.2, 0.8, 0.9); worldRoot.add(a1); colliders.push({ x: -6.2, z: 1.2, r: 0.4 });
    const a2 = spawnPerson('boy2', -5.3, 2.0, 0.82, -2.4); worldRoot.add(a2); colliders.push({ x: -5.3, z: 2.0, r: 0.4 });
    const a3 = spawnPerson('girl2', 5.6, -0.2, 0.8, -1.2, 'Victory'); worldRoot.add(a3); colliders.push({ x: 5.6, z: -0.2, r: 0.4 });
    walker('boy', [[6.5, 4.5], [6.5, -4.5]], 0.8);
  }
  // window-wall extras: radiator, globe on teacher desk, notice board
  A.board(-1.2, 1.9, d / 2 - 0.08, 2.0, 1.1, (g2, W, H) => { g2.fillStyle = '#b5835a'; g2.fillRect(0, 0, W, H); for (let i = 0; i < 9; i++) { g2.fillStyle = ['#fff6b0', '#ffd1dc', '#c9f0ff', '#d9ffd1'][i % 4]; const px = 40 + (i % 3) * 320 + Math.random() * 30, py = 30 + ((i / 3) | 0) * 180 + Math.random() * 20; g2.save(); g2.translate(px, py); g2.rotate((Math.random() - 0.5) * 0.2); g2.fillRect(0, 0, 250, 150); g2.fillStyle = '#e74c3c'; g2.beginPath(); g2.arc(125, 10, 8, 0, 7); g2.fill(); g2.fillStyle = '#555'; for (let k = 0; k < 4; k++) g2.fillRect(20, 40 + k * 25, 120 + Math.random() * 90, 8); g2.restore(); } }, Math.PI);
  const gl = A.mesh(new THREE.SphereGeometry(0.2, 24, 16), A.std(0x2f80ed, 0.4), -3.0, 1.18, -d / 2 + 1.6);
  setBounds(Math.min(w, d) / 2 - 0.6);
}
function posterHK(g, w, h) {
  g.fillStyle = '#f7f1e3'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2f80ed'; g.fillRect(0, 0, w, h * 0.16); g.fillStyle = '#fff'; g.font = `700 ${h * 0.1}px ${A.FONT}`; g.textAlign = 'center'; g.fillText('香港全境圖', w / 2, h * 0.115);
  g.fillStyle = '#a9d6f5'; g.fillRect(30, h * 0.2, w - 60, h * 0.75);
  const blobs = [['新界', '#7cc576', 0.5, 0.42, 0.33, 0.17], ['九龍', '#f2c94c', 0.5, 0.66, 0.12, 0.05], ['香港島', '#eb8f6a', 0.55, 0.8, 0.14, 0.05], ['大嶼山', '#9bd08f', 0.2, 0.72, 0.13, 0.07]];
  for (const [n, c, x, y, rx, ry] of blobs) { g.fillStyle = c; g.beginPath(); g.ellipse(x * w, y * h, rx * w, ry * h, 0.1, 0, 7); g.fill(); g.fillStyle = '#1a2740'; g.font = `700 ${h * 0.055}px ${A.FONT}`; g.fillText(n, x * w, y * h + 10); }
}
function posterWorld(g, w, h) {
  g.fillStyle = '#0f3d66'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffe68a'; g.font = `700 ${h * 0.1}px ${A.FONT}`; g.textAlign = 'center'; g.fillText('七大洲 · 四大洋', w / 2, h * 0.13);
  g.fillStyle = '#5fb36a';
  [[0.22, 0.4, 0.1, 0.12], [0.27, 0.66, 0.05, 0.13], [0.5, 0.36, 0.05, 0.06], [0.52, 0.6, 0.07, 0.14], [0.7, 0.4, 0.15, 0.13], [0.8, 0.72, 0.06, 0.05], [0.5, 0.93, 0.25, 0.03]].forEach(([x, y, rx, ry]) => { g.beginPath(); g.ellipse(x * w, y * h, rx * w, ry * h, 0, 0, 7); g.fill(); });
}
function posterWeather(g, w, h) {
  g.fillStyle = '#fff6e5'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#f2994a'; g.font = `700 ${h * 0.1}px ${A.FONT}`; g.textAlign = 'center'; g.fillText('香港的四季', w / 2, h * 0.14);
  ['🌸 春', '☀️ 夏', '🍁 秋', '❄️ 冬'].forEach((t, i) => { g.font = `${h * 0.12}px ${A.FONT}`; g.fillStyle = '#333'; g.fillText(t, w * (0.15 + 0.233 * i), h * 0.6); });
}
function mapFace(kind) {
  return (g, w, h) => {
    g.fillStyle = '#bfe3f7'; g.fillRect(16, 16, w - 32, h - 32);
    g.fillStyle = '#69b06a';
    if (kind === 'A') [[0.3, 0.4, 0.14, 0.12], [0.32, 0.68, 0.06, 0.12], [0.55, 0.38, 0.06, 0.08], [0.56, 0.62, 0.08, 0.14], [0.75, 0.42, 0.16, 0.13], [0.8, 0.75, 0.07, 0.05]].forEach(([x, y, a, b]) => { g.beginPath(); g.ellipse(x * w, y * h, a * w, b * h, 0, 0, 7); g.fill(); });
    if (kind === 'B') { g.beginPath(); g.ellipse(w * 0.5, h * 0.45, w * 0.36, h * 0.28, 0.2, 0, 7); g.fill(); g.fillStyle = '#e74c3c'; g.beginPath(); g.ellipse(w * 0.55, h * 0.48, w * 0.14, h * 0.1, 0, 0, 7); g.fill(); }
    if (kind === 'C') { g.beginPath(); g.ellipse(w * 0.5, h * 0.4, w * 0.3, h * 0.17, 0, 0, 7); g.fill(); g.fillStyle = '#f2c94c'; g.beginPath(); g.ellipse(w * 0.5, h * 0.62, w * 0.12, h * 0.05, 0, 0, 7); g.fill(); g.fillStyle = '#eb8f6a'; g.beginPath(); g.ellipse(w * 0.55, h * 0.75, w * 0.15, h * 0.05, 0, 0, 7); g.fill(); }
    if (kind === 'D') { g.fillStyle = '#f4f1ea'; g.fillRect(16, 16, w - 32, h - 32); g.strokeStyle = '#f2c94c'; g.lineWidth = 16; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(16, i * h / 4); g.lineTo(w - 16, i * h / 4 + 10); g.stroke(); g.beginPath(); g.moveTo(i * w / 4, 16); g.lineTo(i * w / 4 - 10, h - 16); g.stroke(); } g.fillStyle = '#e74c3c'; g.beginPath(); g.arc(w * 0.62, h * 0.55, 14, 0, 7); g.fill(); }
    g.strokeStyle = '#1a2740'; g.lineWidth = 4; g.beginPath(); g.moveTo(w - 48, 70); g.lineTo(w - 48, 30); g.stroke(); g.fillStyle = '#1a2740'; g.font = `700 26px ${A.FONT}`; g.textAlign = 'center'; g.fillText('N', w - 48, 98);
  };
}
function hkStreet(size = 22) {
  A.outdoor({ elev: 38, azim: 125, turb: 5, fog: 0xc6dbee, near: 30, far: 140 });
  A.ground('pavingstones070', 60, 18);
  // roads around plaza
  for (const [x, z, w, d] of [[0, -11.5, 60, 5], [0, 11.5, 60, 5], [-11.5, 0, 5, 60], [11.5, 0, 5, 60]]) {
    const r = A.mesh(new THREE.PlaneGeometry(w, d), A.pbr('asphalt026b', 6), x, 0.012, z); r.rotation.x = -Math.PI / 2; r.castShadow = false;
  }
  // tram tracks + tram
  for (const dz of [-0.5, 0.5]) A.mesh(new THREE.BoxGeometry(60, 0.03, 0.08), A.std(0x8a9099, 0.3, 0.9), 0, 0.03, -11.5 + dz);
  const tram = placeModel('tram', -6, -11.5, { w: 8, ry: Math.PI / 2 });
  if (tram) anims.push((dt) => { tram.position.x += dt * 2.2; if (tram.position.x > 34) tram.position.x = -34; });
  placeModel('taxi', 6, 11.2, { w: 4.4, ry: -Math.PI / 2 });
  const mb = placeModel('minibus', -11.5, 3, { w: 5.2 });
  if (mb) anims.push((dt) => { mb.position.z -= dt * 3; if (mb.position.z < -34) mb.position.z = 34; });
  placeModel('taxi', 11.5, -4, { w: 4.4, ry: Math.PI });
  // tong lau ring
  const tl = [[-18, -18], [-6, -18], [6, -18], [18, -18], [-18, 18], [-6, 18], [6, 18], [18, 18], [-18, -6], [-18, 6], [18, -6], [18, 6]];
  tl.forEach(([x, z], i) => { const g = placeModel('tonglau', x, z, { h: 13 + (i % 3) * 3, ry: Math.atan2(-x, -z) }); if (!g) A.building(x, z, 9, 9, 16); });
  for (const [x, z, h] of [[-30, -32, 50], [-10, -36, 64], [12, -34, 44], [30, -30, 58], [0, -44, 80]]) A.building(x, z, 10, 10, h, { tone: 0xc9d3dd });
  placeModel('newsstand', 7.5, 7.5, { h: 2.4, ry: -Math.PI * 0.75 }); colliders.push({ x: 7.5, z: 7.5, r: 1.2 });
  placeModel('phonebox', -7.6, 7.6, { h: 2.5, ry: Math.PI * 0.75 }); colliders.push({ x: -7.6, z: 7.6, r: 0.7 });
  placeModel('hawker', -7.5, -7.2, { h: 2.4, ry: Math.PI / 4 }); colliders.push({ x: -7.5, z: -7.2, r: 1.2 });
  for (const [x, z] of [[-8.6, -2], [8.6, 2], [8.6, -6], [-8.6, 4]]) A.lamp(x, z);
  for (const [x, z] of [[-8.8, 0.8], [8.8, -2.6]]) A.tree(x, z, 1.1);
  walker('worker', [[-8, 8.8], [8, 8.8]], 1.0);
  walker('boy2', [[8.8, -8], [8.8, 8]], 1.2);
  walker('girl2', [[-9, -9], [9, -9]], 1.1);
  setBounds(9.3);
}
function hillsScene() {
  A.outdoor({ elev: 28, azim: 200, turb: 4, fog: 0xbcd6ea, near: 140, far: 520, expo: 0.6 });
  const peaks = [[-26, -60, 957], [-6, -70, 934], [16, -58, 602], [34, -66, 495]];
  const hf = (x, z) => {
    let y = 0; for (const [px, pz, h] of peaks) { const s = 7 + h / 120; y += (h / 957) * 22 * Math.exp(-((x - px) ** 2 + (z - pz) ** 2) / (2 * s * s)); }
    y += Math.max(0, -z - 30) * 0.12 * (1 + Math.sin(x * 0.08) * 0.5) + Math.sin(x * 0.21) * Math.cos(z * 0.17) * 0.6 * Math.min(1, Math.abs(z) / 12);
    return y * Math.min(1, Math.max(0, (-z - 6) / 20)) + (z > -6 ? Math.sin(x * 0.4) * 0.08 : 0);
  };
  A.terrain(240, A.Q.low ? 140 : 220, hf, 'grass004', 40);
  A.water(800, 0.2).position.z = 160;
  peaks.forEach(([x, z, h], i) => { const nm = F.terrain.peaks[i]; const l = A.label(`${nm.name} ${nm.m}m`, { icon: '⛰️', accent: '#27ae60', scale: 4 }); l.position.set(x, hf(x, z) + 2, z); worldRoot.add(l); });
  // lookout deck
  A.mesh(A.rbox(10, 0.25, 6, 0.04), A.pbr('wood049', 3, { color: 0xc9a27a }), 0, 0.12, 2);
  for (let x = -5; x <= 5; x += 1) A.mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 8), A.std(0x2b3440, 0.4, 0.8), x, 0.75, -1);
  A.mesh(new THREE.BoxGeometry(10, 0.06, 0.08), A.std(0x2b3440, 0.4, 0.8), 0, 1.25, -1);
  for (let i = 0; i < 60 * A.Q.density; i++) { const x = (Math.random() - 0.5) * 120, z = -10 - Math.random() * 50; A.tree(x, z, 1 + Math.random() * 1.2).position.y = hf(x, z); }
  colliders.length = 0; setBounds(4.5);
  const tel = new THREE.Group(); tel.position.set(1.5, 0.25, -0.4); worldRoot.add(tel);
  A.mesh(new THREE.CylinderGeometry(0.03, 0.05, 1.1, 8), A.std(0x333a44, 0.3, 0.9), 0, 0.55, 0, tel);
  const tube = A.mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.6, 16), A.std(0x2f80ed, 0.3, 0.5), 0, 1.15, 0, tel); tube.rotation.x = 1.3;
}
function harbourScene() {
  A.outdoor({ elev: 24, azim: 230, turb: 2, fog: 0xc8dcec, near: 120, far: 700, expo: 0.55, sunC: 0xffe6c2 });
  A.water(1200, -0.4);
  // pier
  A.mesh(A.rbox(22, 0.6, 14, 0.08), A.pbr('pavingstones070', 6, { color: 0xe6d6c0 }), 0, -0.3, 3);
  for (let x = -10.5; x <= 10.5; x += 1.5) { A.mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 8), A.std(0xe8eef3, 0.3, 0.8), x, 0.5, -3.9); }
  A.mesh(new THREE.BoxGeometry(22, 0.06, 0.06), A.std(0xe8eef3, 0.3, 0.8), 0, 1.0, -3.9);
  // airport island with runway
  const isl = A.mesh(new THREE.BoxGeometry(90, 1, 30), A.pbr('concrete034', 10, { color: 0xc9c4ba }), 0, -0.3, -55);
  const rw = A.mesh(new THREE.PlaneGeometry(84, 6), new THREE.MeshStandardMaterial({ map: A.canvasTex(1024, 128, (g, w, h) => { g.fillStyle = '#3b3f45'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; for (let x = 20; x < w; x += 50) g.fillRect(x, h / 2 - 3, 28, 6); g.fillRect(0, 8, w, 4); g.fillRect(0, h - 12, w, 4); }), roughness: 0.8 }), 0, 0.22, -50);
  rw.rotation.x = -Math.PI / 2;
  // terminal
  const term = A.mesh(new THREE.BoxGeometry(30, 4, 8), new THREE.MeshPhysicalMaterial({ color: 0x9fc6e0, roughness: 0.1, metalness: 0.6 }), 0, 2.2, -64);
  A.mesh(new THREE.CylinderGeometry(15.5, 15.5, 30, 24, 1, false, 0, Math.PI), A.std(0xe9edf1, 0.4, 0.5), 0, 4.2, -64).rotation.z = Math.PI / 2;
  A.mesh(new THREE.CylinderGeometry(0.6, 0.8, 14, 12), A.std(0xf3f3f3, 0.4), 22, 7, -62);
  A.mesh(new THREE.CylinderGeometry(2, 1.5, 2.2, 8), new THREE.MeshPhysicalMaterial({ color: 0x223344, roughness: 0.1, metalness: 0.5 }), 22, 15, -62);
  // planes
  const mkPlane = (s) => {
    const g = new THREE.Group(); const wm = A.std(0xf7f9fb, 0.35, 0.3); const tail = A.std(0x1f6fd1, 0.4);
    A.mesh(new THREE.CapsuleGeometry(0.9, 9, 8, 16), wm, 0, 0, 0, g).rotation.z = Math.PI / 2;
    A.mesh(A.rbox(2.6, 0.18, 12, 0.08), wm, -0.3, -0.2, 0, g);
    A.mesh(A.rbox(1.4, 0.12, 4.4, 0.05), wm, -4.8, 0.2, 0, g);
    A.mesh(A.rbox(1.8, 2.4, 0.16, 0.05), tail, -4.9, 1.4, 0, g);
    for (const z of [-2.6, 2.6]) A.mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.3, 16), A.std(0xaab3bd, 0.3, 0.8), 0.2, -0.7, z, g).rotation.z = Math.PI / 2;
    g.scale.setScalar(s); worldRoot.add(g); return g;
  };
  const p1 = mkPlane(1.1); p1.position.set(-30, 1.6, -50);
  anims.push((dt) => { p1.position.x += dt * 9; if (p1.position.x > 10) { p1.position.y += dt * 3.5; p1.rotation.z = 0.18; } if (p1.position.x > 120) { p1.position.set(-40, 1.6, -50); p1.rotation.z = 0; } });
  const p2 = mkPlane(1); p2.position.set(12, 1.5, -60); p2.rotation.y = Math.PI;
  // dolphins jumping
  const dm = A.std(0xf2b8c0, 0.35);
  for (let i = 0; i < 3; i++) {
    const d = new THREE.Group(); const body = A.mesh(new THREE.SphereGeometry(0.35, 20, 12), dm, 0, 0, 0, d); body.scale.set(1, 0.9, 3.2);
    A.mesh(new THREE.ConeGeometry(0.16, 0.5, 8), dm, 0, 0.35, 0.1, d);
    const tl = A.mesh(new THREE.ConeGeometry(0.3, 0.4, 3), dm, 0, 0, -1.2, d); tl.rotation.x = Math.PI / 2; tl.scale.x = 2;
    worldRoot.add(d); const ph = i * 2.1, cx = -14 + i * 6, cz = -16 - i * 4;
    anims.push((dt, t) => { const u = ((t * 0.5 + ph) % 3) / 3; const y = Math.sin(u * Math.PI) * 2.2 - 0.6; d.position.set(cx + (u - 0.5) * 6, y, cz); d.rotation.x = -Math.cos(u * Math.PI) * 0.9; d.rotation.y = Math.PI / 2; d.visible = u < 1; });
  }
  // boats & buoys
  for (let i = 0; i < 6; i++) { const b = A.mesh(new THREE.SphereGeometry(0.3, 12, 8), A.std(0xf2c94c, 0.4), 2 + (i % 3) * 1.4, -0.2, -6 - Math.floor(i / 3) * 1.4); anims.push((dt, t) => { b.position.y = -0.25 + Math.sin(t * 1.5 + i) * 0.08; }); }
  A.signPost(6.8, -3, '海岸公園', '🐬', '#1f8fb3');
  // far shore skyline + hills
  for (let i = 0; i < 40; i++) { const x = -160 + i * 8 + Math.random() * 3; A.building(x, -130 - Math.random() * 20, 5 + Math.random() * 3, 5, 12 + Math.random() * 40, { tone: [0xd8dee6, 0xc6ced8, 0xe8e2d8][i % 3] }); }
  for (let i = 0; i < 6; i++) { const h = A.mesh(new THREE.SphereGeometry(40 + i * 6, 24, 12), A.std(0x5f8a5a, 0.9), -150 + i * 60, -20, -190 - (i % 2) * 20); h.scale.y = 0.55; }
  // ferry
  const ferry = new THREE.Group(); worldRoot.add(ferry);
  A.mesh(A.rbox(7, 1.2, 2.4, 0.3), A.std(0x2e7d4f, 0.5), 0, 0.2, 0, ferry); A.mesh(A.rbox(5, 1.1, 2.1, 0.2), A.std(0xf3f3ef, 0.4), 0, 1.3, 0, ferry);
  for (let i = 0; i < 6; i++) A.mesh(new THREE.BoxGeometry(0.5, 0.4, 0.02), A.std(0x1d2a38, 0.2, 0.3), -2 + i * 0.8, 1.4, 1.06, ferry);
  anims.push((dt, t) => { ferry.position.set(-60 + ((t * 3) % 120), -0.2 + Math.sin(t) * 0.05, -26); });
  walker('worker', [[-9, 8.5], [9, 8.5]], 1);
  setBounds(9.5);
}
function cityScene() {
  A.outdoor({ elev: 30, azim: 160, turb: 6, fog: 0xc6daea, near: 40, far: 220 });
  A.terrain(200, 80, (x, z) => (z < -20 ? Math.max(0, -z - 60) * 0.3 : 0), 'grass004', 30);
  A.water(60, 0.06).position.set(-10, 0.06, -12);
  for (let i = 0; i < 18; i++) { const x = 4 + (i % 6) * 6, z = -14 - Math.floor(i / 6) * 9; A.building(x, z, 4.5, 4.5, 18 + Math.random() * 30, { tone: [0xe7ddd0, 0xd0dbe5, 0xf2efe8][i % 3] }); }
  for (let i = 0; i < 20; i++) A.tree(-22 + Math.random() * 18, -2 - Math.random() * 25, 1 + Math.random() * 0.5);
  A.ground('pavingstones070', 14, 4, 0.02);
  setBounds(6);
}
function parkScene() {
  A.outdoor({ elev: 45, azim: 140, turb: 4, fog: 0xcfe2f0, near: 40, far: 180 });
  A.ground('grass004', 120, 30);
  const path = A.mesh(new THREE.PlaneGeometry(14, 3), A.pbr('pavingstones070', 3), 0, 0.012, 0.6); path.rotation.x = -Math.PI / 2;
  for (const [x, z, s] of [[-12, -10, 1.6], [12, -10, 1.8], [-14, 6, 1.4], [13, 8, 1.6], [0, -16, 2.2], [-6, -14, 1.7], [7, -15, 1.9]]) A.tree(x, z, s);
  A.bench(-6, 5.5, Math.PI); A.bench(5, 5.5, Math.PI); A.lamp(-8, 1); A.lamp(8, 1);
  setBounds(9);
}


// generic hands-on carry task: items -> pads (3D)
function placeTask(items, pads, onDone, tip) {
  let left = pads.length;
  items.forEach((it) => addTok({ x: it.x, z: it.z, icon: it.icon, name: it.name, color: it.color || '#2f80ed', face: it.face }, { type: 'pickup', id: it.id, label: it.name }));
  pads.forEach((pd) => {
    const node = pd.node || A.pad({ x: pd.x, z: pd.z, name: pd.name, icon: pd.icon || '', color: pd.color || '#27ae60', r: pd.r || 0.8 });
    if (pd.node) node.position.set(pd.x, 0, pd.z);
    makeInteractable(node, { type: 'dropzone', label: pd.name, want: pd.want, onUse: () => {
      if (!held) return failNudge('先拿物品');
      if (held.id !== pd.want) { const h = held; held = null; updateHeldHud(); const t = interactables.find((m) => m.userData.interact.id === h.id); if (t) { t.visible = true; t.userData.spent = false; } return failNudge(pd.wrong || '放錯位置'); }
      const t = interactables.find((m) => m.userData.interact.id === held.id);
      if (t) { t.visible = true; t.position.set(pd.x + 0.7, 0, pd.z); t.scale.setScalar(0.6); }
      held = null; updateHeldHud(); node.userData.spent = true; toast('✔️'); money += 5; updWeap();
      if (node.userData.inner) node.userData.inner.material.color.set(0x5fd36a);
      if (--left <= 0) onDone();
    } });
  });
  if (tip) setPill(tip);
}
// ========== MISSION BUILDERS ==========
function buildM1() {
  classroom({ title: '地圖配對', lines: ['世界地圖 · 亞洲地圖', '香港全境圖 · 香港街道圖'] });
  const maps = [
    { id: 'A', name: '世界地圖', color: '#2f80ed' },
    { id: 'B', name: '亞洲地圖', color: '#f2994a' },
    { id: 'C', name: '香港全境圖', color: '#27ae60' },
    { id: 'D', name: '香港街道圖', color: '#eb5757' },
  ];
  maps.forEach((mp, i) => addTok({ x: -3.3 + i * 2.2, z: 1.8, name: mp.name, color: mp.color, face: mapFace(mp.id) }, { type: 'pickup', id: mp.id, label: mp.name }));
  showBoard(`
    <h2>🗺️ 地圖配對</h2>
    <p class="tip">拾取地圖 ✋ → 點空格放下</p>
    <div class="slotrow" id="needs"></div>
  `);
  const needs = F.mapMatch;
  const host = $('boardHost').querySelector('#needs');
  needs.forEach((n, idx) => {
    const el = document.createElement('div');
    el.className = 'slot'; el.dataset.ans = n.answer; el.dataset.idx = idx;
    el.innerHTML = `<b>${n.need}</b><span class="dropzone">放下</span>`;
    el.addEventListener('click', () => {
      if (!held) return failNudge('先拾取地圖');
      if (held.id !== n.answer) return failNudge('地圖不對');
      el.classList.add('filled');
      el.querySelector('.dropzone').textContent = F.mapTypes[held.id];
      held = null; updateHeldHud();
      if ([...host.querySelectorAll('.slot')].every((s) => s.classList.contains('filled'))) completeMission();
    });
    host.appendChild(el);
  });
}

function buildM2() {
  hkStreet();
  const cells = {};
  // painted grid decal
  const dec = A.mesh(new THREE.PlaneGeometry(9.6, 9.6), new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.8, map: A.canvasTex(1024, 1024, (g, w, h) => {
    g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 10; g.setLineDash([]);
    for (let i = 0; i <= 3; i++) { g.beginPath(); g.moveTo(i * w / 3, 0); g.lineTo(i * w / 3, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / 3); g.lineTo(w, i * h / 3); g.stroke(); }
    g.fillStyle = 'rgba(47,128,237,.18)'; for (let i = 0; i < 9; i++) if (i % 2) g.fillRect((i % 3) * w / 3 + 5, ((i / 3) | 0) * h / 3 + 5, w / 3 - 10, h / 3 - 10);
    g.font = `700 70px ${A.FONT}`; g.fillStyle = 'rgba(255,255,255,.95)'; g.textAlign = 'center';
    for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) g.fillText('ABC'[c] + (3 - r), c * w / 3 + 70, r * h / 3 + 90);
  }) }), 0, 0.02, -1);
  dec.rotation.x = -Math.PI / 2; dec.castShadow = false;
  for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) { const code = 'ABC'[col] + (3 - row); cells[code] = { x: (col - 1) * 3.2, z: (row - 1) * 3.2 - 1 }; }
  const icons = { 街市: '🥬', 博物館: '🏛️', 餐廳: '🍜', 法定古蹟: '🏯', 醫院: '🏥' };
  const targets = F.sheungWan.slice(0, 3);
  let found = 0;
  targets.forEach((t) => {
    const pos = cells[t.grid];
    const marker = A.token({ x: pos.x, z: pos.z, icon: icons[t.facility], name: `${t.facility} ${t.grid}`, color: '#f2994a' });
    makeInteractable(marker, {
      type: 'collect', label: t.facility,
      onUse: () => {
        marker.userData.spent = true; marker.visible = false;
        found++; toast('📦');
        setPill(`🧭 格網尋寶 <b>${found}/${targets.length}</b>`);
        if (found >= targets.length) {
          const st = A.label('西港城（起點）', { icon: '🏛️', accent: '#2f80ed' }); st.position.set(0, 0.3, 2.5); worldRoot.add(st);
          setPill('🧭 由西港城出發：<b>先向南，再向西</b>（北 = 前方）');
          const gate = (x, z, dir, ok, next) => { const g = A.pad({ x, z, name: '向' + dir, icon: '➡️', color: ok ? '#2f80ed' : '#7f8c8d', r: 0.7 }); makeInteractable(g, { type: 'gate', label: '向' + dir, want: ok ? 'ok' : 'no', onUse: () => { if (!ok) return failNudge('方向不對：先南後西'); g.userData.spent = true; toast('👣'); next(); } }); return g; };
          const g1 = [gate(0, 6.2, '南', true, () => { g1.forEach((g) => (g.visible = false)); gate(-6.5, 6.2, '西', true, () => { toast('🎭'); completeMission(20); }); gate(6.5, 6.2, '東', false); }), gate(0, -2, '北', false), gate(3.5, 2.5, '東', false)];
        }
      },
    });
  });
  setPill('🧭 到格網拾取 <b>街市 · 博物館 · 餐廳</b>');
}

function buildM3() {
  classroom({ title: '繪畫考察路線圖', lines: ['① 標題  ② 圖例', '③ 方向標  ④ 考察路線'] });
  const items = [
    { id: 'legend', name: '圖例', icon: '🔣', color: '#56ccf2' },
    { id: 'north', name: '方向標', icon: '🧭', color: '#f2994a' },
    { id: 'title', name: '標題', icon: '🏷️', color: '#bb6bd9' },
    { id: 'route', name: '考察路線', icon: '📍', color: '#eb5757' },
  ];
  items.forEach((it, i) => addTok({ x: -3.3 + i * 2.2, z: 2.2, icon: it.icon, name: it.name, color: it.color }, { type: 'pickup', id: it.id, label: it.name }));
  const slotsNeeded = ['title', 'legend', 'north', 'route'];
  const placed = new Set();
  showBoard(`
    <h2>✏️ 考察路線圖</h2>
    <p class="tip">按次序放下四個要素</p>
    <div class="slotrow" id="steps"></div>
  `);
  const host = $('boardHost').querySelector('#steps');
  slotsNeeded.forEach((id, idx) => {
    const el = document.createElement('div');
    el.className = 'slot';
    el.textContent = `${idx + 1}. ？`;
    el.onclick = () => {
      if (!held) return failNudge('先拾取要素');
      const expect = slotsNeeded[placed.size];
      if (held.id !== expect) return failNudge('次序不對');
      placed.add(held.id);
      el.classList.add('filled');
      el.textContent = `${idx + 1}. ${held.label}`;
      held = null; updateHeldHud();
      if (placed.size === 4) completeMission();
    };
    host.appendChild(el);
  });
}

function buildM4() {
  hillsScene();
  player.z = 4; player.pitch = 0.08; setBounds(4.6);
  const map = A.mesh(new THREE.PlaneGeometry(8, 3.6), new THREE.MeshStandardMaterial({ roughness: 0.8, map: A.canvasTex(1024, 460, (g, w, h) => { g.fillStyle = '#9fd0ef'; g.fillRect(0, 0, w, h); g.fillStyle = '#7cb36a'; g.beginPath(); g.ellipse(w * 0.5, h * 0.35, w * 0.42, h * 0.3, 0, 0, 7); g.fill(); g.fillStyle = '#d9c38a'; g.beginPath(); g.ellipse(w * 0.55, h * 0.7, w * 0.1, h * 0.08, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(w * 0.6, h * 0.88, w * 0.12, h * 0.07, 0, 0, 7); g.fill(); g.fillStyle = '#123'; g.font = `700 36px ${A.FONT}`; g.fillText('香港地勢模型', 20, 44); }) }), 0, 0.27, 2.2);
  map.rotation.x = -Math.PI / 2; map.castShadow = false;
  const flags = [0, 1, 2].map((i) => ({ id: 'flat' + i, name: '平地旗 ' + (i + 1), icon: '🚩', color: '#f2994a', x: -3.6 + i * 0.8, z: 4.2 }));
  const regs = [['新界北部', -1.4, 1.3, 1], ['新界西北部', -3.2, 1.7, 1], ['九龍', 0.2, 2.5, 1], ['新界東部', 3.0, 1.2, 0], ['香港島', 2.6, 3.9, 0]];
  let n = 0;
  const pads = regs.map(([name, x, z, ok]) => ({ name, x, z, r: 0.5, want: ok ? '__any' : '__no' }));
  placeTask(flags, [], () => {}, '⛰️ 把 3 支 <b>平地旗</b> 插在平地集中的地方');
  pads.forEach((pd) => { const node = A.pad({ x: pd.x, z: pd.z, name: pd.name, icon: '📍', color: '#27ae60', r: 0.45 }); makeInteractable(node, { type: 'dropzone', label: pd.name, want: pd.want === '__any' ? 'flat' : 'no', onUse: () => {
    if (!held) return failNudge('先拿平地旗');
    if (pd.want !== '__any') { const h = held; held = null; updateHeldHud(); const t = interactables.find((m) => m.userData.interact.id === h.id); t.visible = true; t.userData.spent = false; return failNudge(pd.name + '多山，平地少'); }
    held = null; updateHeldHud(); node.userData.spent = true; node.userData.inner.material.color.set(0xf2994a); toast('🚩'); money += 5; updWeap();
    if (++n >= 3) quickQuiz('⛰️ 香港地勢', [{ q: '山地', opts: ['多', '不多'], ans: '多' }, { q: '平地', opts: ['較多', '較少'], ans: '較少' }, { q: '平地分佈', opts: ['較分散', '較集中'], ans: '較分散' }], () => completeMission());
  } }); });
}
function quickQuiz(title, qs, ok) {
  const b = showBoard(`<h2>${title}</h2><div id="qq"></div><button class="go" id="chk">提交</button>`, true);
  const pick = {};
  qs.forEach((q, i) => { const w = document.createElement('div'); w.className = 'qi'; w.innerHTML = `<span>${q.q}</span>`; const r = document.createElement('div'); r.className = 'row';
    q.opts.forEach((o) => { const bt = document.createElement('button'); bt.className = 'choice'; bt.textContent = o; if (o === q.ans) bt.dataset.ok = '1'; bt.onclick = () => { pick[i] = o; r.querySelectorAll('.choice').forEach((c) => c.classList.remove('sel')); bt.classList.add('sel'); }; r.appendChild(bt); });
    w.appendChild(r); b.querySelector('#qq').appendChild(w); });
  b.querySelector('#chk').onclick = () => { if (qs.every((q, i) => pick[i] === q.ans)) { hideBoard(); ok(); } else failNudge('再想想'); };
}

function buildM5() {
  harbourScene();
  player.z = 7;
  const tl = F.airport.timeline;
  const items = tl.map((t, i) => ({ id: 'ev' + i, name: t.t, icon: ['🛬', '✈️', '🏗️', '🚧', '🛫'][i], color: '#2f80ed', x: [-7, -3.5, 0, 3.5, 7][(i * 3) % 5], z: 6 }));
  const pads = tl.map((t, i) => ({ id: 'y' + i, name: t.y, icon: '📅', x: -7 + i * 3.5, z: 0.8, want: 'ev' + i, wrong: '年份不對，再看時間線', color: '#f2994a', r: 0.75 }));
  placeTask(items, pads, () => {
    setPill('🐬 把中華白海豚送到 <b>' + F.airport.marinePark + '</b>');
    placeTask([{ id: 'dolphin', name: '中華白海豚', icon: '🐬', color: '#ff8fa3', x: -5, z: 3.4 }], [{ name: '海岸公園', icon: '🌊', x: 6, z: -2, want: 'dolphin', color: '#1fa3c9' }], () => completeMission());
  }, '✈️ 把機場事件搬到 <b>正確年份</b>');
}

function buildM6() {
  cityScene(); A.ground('pavingstones070', 18, 5, 0.09); setBounds(7); player.z = 5;
  const who = { A: ['🏠', '輪候公屋的居民', 'elder'], B: ['💼', '商界代表', 'teacher'], C: ['🌿', '環保人士', 'girl2'] };
  const pads = F.stakeholders.map((s, i) => { const x = -4 + i * 4, z = -2.5; const p = spawnPerson(who[s.who][2], x, z - 0.6, 1, 0); worldRoot.add(p); colliders.push({ x, z: z - 0.6, r: 0.5 });
    const sp = A.label('「' + s.say.slice(0, 14) + (s.say.length > 14 ? '…' : '') + '」', { accent: '#27ae60', scale: 1.1 }); sp.position.set(x, 2.15 + (i % 2) * 0.45, z - 0.6); worldRoot.add(sp);
    return { name: '是誰？', icon: '💬', x, z: z + 0.6, want: 'b' + s.who, wrong: '再讀一次他的說話', r: 0.6 }; });
  const items = ['A', 'B', 'C'].map((k, i) => ({ id: 'b' + k, name: who[k][1], icon: who[k][0], color: '#27ae60', x: -4 + i * 4, z: 3 }));
  placeTask(items, pads, () => {
    setPill('🏙️ 規劃北部都會區：<b>住宅、創科、保育濕地</b>');
    placeTask([{ id: 'home', name: '大量住宅', icon: '🏢', x: -4, z: 3.5 }, { id: 'tech', name: '創新科技產業', icon: '🔬', x: 0, z: 3.5 }, { id: 'eco', name: '保育區', icon: '🦆', x: 4, z: 3.5 }],
      [{ name: '新增土地（住宅）', icon: '🏗️', x: -4, z: 0.2, want: 'home', wrong: '這裏用來興建住宅' }, { name: '新增土地（產業）', icon: '🏗️', x: 0, z: 0.2, want: 'tech', wrong: '這裏用來發展產業' }, { name: '濕地', icon: '🌾', x: 4, z: 0.2, want: 'eco', wrong: '濕地要保育，保護動植物', color: '#1fa3c9' }],
      () => completeMission());
  }, '🏙️ 把身份牌交給 <b>說這句話的人</b>');
}

function buildM7() {
  parkScene();
  player.z = 7;
  const items = [
    { id: 'A', name: '抽濕機', icon: '💧', color: '#56ccf2' },
    { id: 'B', name: '手提風扇', icon: '🌀', color: '#f2994a' },
    { id: 'C', name: '暖水袋', icon: '🔥', color: '#eb5757' },
    { id: 'D', name: '護手霜', icon: '🧴', color: '#bb6bd9' },
  ];
  items.forEach((it, i) => addTok({ x: -4.5 + i * 3, z: 3.2, icon: it.icon, name: it.name, color: it.color }, { type: 'pickup', id: it.id, label: it.name }));
  const theme = { 春: ['🌸', '#ff9ec7', { leaf: 0xf7a8c8 }], 夏: ['☀️', '#f2c94c', { leaf: 0x3f9a3a }], 秋: ['🍁', '#e67e22', { leaf: 0xd9772b }], 冬: ['❄️', '#7fb3ff', { bare: true }] };
  let done = 0;
  F.seasons.forEach((s, i) => {
    const x = -4.5 + i * 3, z = -2.2;
    const [ic, col, tr] = theme[s.id];
    A.tree(x, z - 2.6, 1.15, tr);
    if (s.id === '冬') A.particles(120, 4, 0xffffff, 0.12, 0.5, 5).position.set(x, 0, z - 1.5);
    if (s.id === '春') A.particles(80, 4, 0xffc0dc, 0.1, 0.4, 4).position.set(x, 0, z - 1.5);
    if (s.id === '秋') A.particles(60, 4, 0xe67e22, 0.14, 0.6, 4).position.set(x, 0, z - 1.5);
    if (s.id === '夏') { const u = new THREE.Group(); u.position.set(x + 1, 0, z - 1.2); worldRoot.add(u); A.mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 8), A.std(0xffffff, 0.4), 0, 1.1, 0, u); A.mesh(new THREE.ConeGeometry(1.1, 0.5, 12, 1, true), A.std(0xf2c94c, 0.6, 0, { side: THREE.DoubleSide }), 0, 2.2, 0, u); }
    const pad = A.pad({ x, z, name: `${s.id} · ${s.trait}`, icon: ic, color: col });
    makeInteractable(pad, {
      type: 'dropzone', label: `${s.id}季`,
      onUse: () => {
        if (!held) return failNudge('先拿物品');
        if (held.id !== s.item) return failNudge(`${s.id}要用${s.itemName}`);
        held = null; updateHeldHud(); pad.userData.spent = true;
        pad.userData.inner.material.color.set(0x5fd36a); pad.userData.inner.material.emissive.set(0x5fd36a);
        const t = A.token({ x: 0, z: 0, icon: '✅', name: s.itemName, color: '#27ae60' }); t.scale.setScalar(0.6); pad.add(t);
        done++; toast('✔️');
        if (done >= 4) completeMission();
      },
    });
  });
  setPill('🌦️ 把物品放到 <b>對應季節</b>');
}

function buildM8() {
  A.indoor({ bg: 0x2a3340, expo: 1.1, sunI: 1.2, sunDir: [3, 10, 8], sunC: 0xd8e4f5, hemiI: 0.45, envI: 0.75 });
  { const cl = new THREE.PointLight(0xffe2b8, 14, 12, 1.6); cl.position.set(0, 2.9, 1); worldRoot.add(cl); }
  A.room({ w: 10, d: 10, h: 3.2, floor: 'woodfloor051', floorRep: 3, wall: 'plaster001', wallColor: 0xe9e1d2, windows: 'none', skip: '0' });
  // replace front wall with window wall: cover front with frame wall pieces
  const wm = A.pbr('plaster001', 2, { color: 0xe9e1d2 });
  const z0 = -4.0;
  A.mesh(new THREE.BoxGeometry(10, 0.8, 0.22), wm, 0, 0.4, z0); A.mesh(new THREE.BoxGeometry(10, 0.8, 0.22), wm, 0, 2.8, z0);
  A.mesh(new THREE.BoxGeometry(3.9, 1.6, 0.22), wm, -3.05, 1.6, z0); A.mesh(new THREE.BoxGeometry(3.9, 1.6, 0.22), wm, 3.05, 1.6, z0);
  // storm outside
  const out = A.mesh(new THREE.PlaneGeometry(30, 14), new THREE.MeshBasicMaterial({ map: A.canvasTex(1024, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1d2530'); gr.addColorStop(1, '#4d5a66'); g.fillStyle = gr; g.fillRect(0, 0, w, h); for (let i = 0; i < 24; i++) { const bw = 30 + Math.random() * 50, bh = 100 + Math.random() * 200, bx = Math.random() * w; g.fillStyle = '#2c3540'; g.fillRect(bx, h * 0.8 - bh, bw, bh + 200); g.fillStyle = 'rgba(255,214,150,.7)'; for (let y = h * 0.8 - bh + 8; y < h; y += 14) for (let x = bx + 5; x < bx + bw - 6; x += 10) if (Math.random() > 0.5) g.fillRect(x, y, 5, 7); } }) }), 0, 3, -9);
  A.rain(1200, 9).position.set(0, 0, -9.2);
  A.ground('asphalt026b', 40, 10, -0.02).position.z = -20;
  const outTrees = [A.tree(-3, -6.5, 1.3, { leaf: 0x2f5f35 }), A.tree(3.5, -7, 1.5, { leaf: 0x2f5f35 })];
  anims.push((dt, t) => { outTrees.forEach((tr, i) => { tr.rotation.z = Math.sin(t * 3 + i) * 0.12 + 0.1; }); });
  // window
  const winG = new THREE.Group(); winG.position.set(0, 1.6, z0 + 0.05); worldRoot.add(winG);
  const fm = A.std(0xf4f6f8, 0.35, 0.4);
  A.mesh(new THREE.BoxGeometry(2.3, 0.08, 0.16), fm, 0, 0.8, 0, winG); A.mesh(new THREE.BoxGeometry(2.3, 0.08, 0.16), fm, 0, -0.8, 0, winG);
  A.mesh(new THREE.BoxGeometry(0.08, 1.6, 0.16), fm, -1.12, 0, 0, winG); A.mesh(new THREE.BoxGeometry(0.08, 1.6, 0.16), fm, 1.12, 0, 0, winG);
  const sashL = new THREE.Group(); winG.add(sashL); const sashR = new THREE.Group(); winG.add(sashR);
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xbcd8ee, roughness: 0.05, transparent: true, opacity: 0.25 });
  A.mesh(new THREE.PlaneGeometry(1.05, 1.5), glassMat, 0, 0, 0, sashL).position.x = -0.55; A.mesh(new THREE.BoxGeometry(0.05, 1.5, 0.06), fm, -0.02, 0, 0, sashL);
  A.mesh(new THREE.PlaneGeometry(1.05, 1.5), glassMat, 0, 0, 0, sashR).position.x = 0.55; A.mesh(new THREE.BoxGeometry(0.05, 1.5, 0.06), fm, 0.02, 0, 0, sashR);
  sashL.position.x = -1.1; sashR.position.x = 1.1; sashL.rotation.y = 1.1; sashR.rotation.y = -1.1;
  const hit = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(0, 1.6, z0 + 0.1);
  hit.userData.sash = [sashL, sashR]; hit.userData.glass = glassMat; hit.userData.winG = winG;
  makeInteractable(hit, { type: 'window', label: '窗戶', state: { closed: false, taped: false } });
  // curtains blowing
  const cm = A.pbr('fabric045', 1, { color: 0xc9b38f, side: THREE.DoubleSide });
  const curt = [A.mesh(new THREE.PlaneGeometry(0.8, 2.3, 8, 8), cm, -1.6, 1.6, z0 + 0.25), A.mesh(new THREE.PlaneGeometry(0.8, 2.3, 8, 8), cm, 1.6, 1.6, z0 + 0.25)];
  anims.push((dt, t) => { const st = hit.userData.interact.state.closed; curt.forEach((c, i) => { c.rotation.x = st ? 0 : -0.25 - Math.sin(t * 4 + i) * 0.15; c.position.z = z0 + 0.25 + (st ? 0 : 0.2); }); });
  // living room
  const sofa = new THREE.Group(); sofa.position.set(-3.6, 0, -0.6); sofa.rotation.y = -Math.PI / 2; worldRoot.add(sofa);
  const fab = A.pbr('fabric045', 2, { color: 0x5b7fa6 });
  A.mesh(A.rbox(2.4, 0.45, 0.95, 0.1), fab, 0, 0.3, 0, sofa); A.mesh(A.rbox(2.4, 0.7, 0.25, 0.1), fab, 0, 0.7, 0.4, sofa);
  A.mesh(A.rbox(0.25, 0.65, 0.95, 0.1), fab, -1.2, 0.45, 0, sofa); A.mesh(A.rbox(0.25, 0.65, 0.95, 0.1), fab, 1.2, 0.45, 0, sofa);
  colliders.push({ x: -3.6, z: -0.6, r: 1.1 });
  A.bookshelf(-4.85, 2.6, Math.PI / 2, 2); A.plant(-4.4, -3.4, 1.2);
  for (const [x, y] of [[-4.88, 2.0], [-4.88, 1.5]]) {}
  A.board(-4.9, 2.1, -0.6, 1.4, 0.8, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#f7b267'); gr.addColorStop(1, '#4d96c9'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#2f5d3a'; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 20) g.lineTo(x, h * 0.6 - Math.sin(x * 0.01) * 80); g.lineTo(w, h); g.fill(); }, Math.PI / 2);
  const tbl = new THREE.Group(); tbl.position.set(-1.2, 0, -0.6); worldRoot.add(tbl); A.mesh(A.rbox(1.2, 0.06, 0.7, 0.02), A.pbr('wood049', 1), 0, 0.42, 0, tbl); for (const [lx, lz] of [[-0.5, -0.28], [0.5, -0.28], [-0.5, 0.28], [0.5, 0.28]]) A.mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), A.std(0x3a2a1e, 0.5), lx, 0.2, lz, tbl);
  A.mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.12, 12), A.std(0xffffff, 0.3), -1.0, 0.51, -0.6); colliders.push({ x: -1.2, z: -0.6, r: 0.6 });
  const rug = A.mesh(new THREE.PlaneGeometry(3, 2.2), A.pbr('fabric045', 2, { color: 0xb5523b }), 0, 0.01, -0.6); rug.rotation.x = -Math.PI / 2; rug.castShadow = false;
  const tv = A.mesh(new THREE.BoxGeometry(1.7, 1.0, 0.08), [A.std(0x111111), A.std(0x111111), A.std(0x111111), A.std(0x111111), new THREE.MeshBasicMaterial({ map: A.canvasTex(512, 300, (g, w, h) => { g.fillStyle = '#0b2a52'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = `700 54px ${A.FONT}`; g.textAlign = 'center'; g.fillText('八號烈風信號', w / 2, h * 0.32); g.font = `150px ${A.FONT}`; g.fillText('🌀', w / 2, h * 0.85); }) }), A.std(0x111111)], 4.85, 1.4, -0.6);
  tv.rotation.y = -Math.PI / 2;
  A.mesh(A.rbox(0.5, 0.5, 2.2, 0.03), A.pbr('wood049', 1), 4.7, 0.25, -0.6); colliders.push({ x: 4.7, z: -0.6, r: 0.8 });
  const lampL = new THREE.PointLight(0xffc98a, 6, 8, 2); lampL.position.set(-4, 1.8, 4.2); worldRoot.add(lampL);
  A.mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.35, 16, 1, true), A.std(0xfff2d6, 0.6, 0, { emissive: 0xffc98a, emissiveIntensity: 1.5, side: THREE.DoubleSide }), -4, 1.8, 4.2);
  A.mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 8), A.std(0x333333, 0.3, 0.8), -4, 0.8, 4.2);
  // lightning
  const flash = new THREE.PointLight(0xcfe3ff, 0, 30); flash.position.set(0, 4, -8); worldRoot.add(flash);
  let nextF = 2; anims.push((dt, t) => { if (t > nextF) { flash.intensity = 60; nextF = t + 3 + Math.random() * 4; } flash.intensity *= 0.85; });
  const plant = A.plant(2.2, -2.6, 1.3);
  makeInteractable(plant, { type: 'plant', label: '盆栽', outside: false });
  addTok({ x: -2, z: 0.8, icon: '🩹', name: '膠紙', color: '#f2c94c' }, { type: 'pickup', id: 'tape', label: '膠紙' });
  setBounds(4.4); player.z = 3.6;
  showBoard(`
    <h2>🌀 八號風球</h2>
    <p class="tip">選正確做法 · 並在房內關窗、貼膠紙</p>
    <div class="row" id="acts"></div>
    <button class="go" id="chk">完成檢查</button>
  `);
  const sel = new Set();
  const opts = ['關好窗戶', '把盆栽移到室外', '在玻璃窗貼上膠紙'];
  const row = $('boardHost').querySelector('#acts');
  opts.forEach((o) => {
    const b = document.createElement('button'); b.className = 'choice'; b.textContent = o;
    b.onclick = () => { if (sel.has(o)) { sel.delete(o); b.classList.remove('sel'); } else { sel.add(o); b.classList.add('sel'); } };
    row.appendChild(b);
  });
  $('boardHost').querySelector('#chk').onclick = () => {
    const listOk = sel.has('關好窗戶') && sel.has('在玻璃窗貼上膠紙') && !sel.has('把盆栽移到室外');
    const win = interactables.find((m) => m.userData.interact?.type === 'window');
    const pl = interactables.find((m) => m.userData.interact?.type === 'plant');
    const physOk = win?.userData.interact.state.closed && win?.userData.interact.state.taped && !pl?.userData.interact.outside;
    if (listOk && physOk) completeMission();
    else failNudge(!listOk ? '選項：關窗+貼膠紙' : '先關窗並貼膠紙，盆栽留室內');
  };
}

function buildM9() {
  A.outdoor({ elev: 9, azim: 250, turb: 9, rayleigh: 2.4, fog: 0xd9c3b0, near: 25, far: 120, sunC: 0xffc38a, sunI: 2.0, expo: 0.55 });
  A.ground('pavingstones070', 60, 16);
  for (const [x, z, ry] of [[-14, -8, 0.6], [0, -16, 0], [14, -8, -0.6], [-16, 8, 1.6], [16, 8, -1.6]]) { const g = placeModel('tonglau', x, z, { h: 18, ry }); if (!g) A.building(x, z, 10, 10, 18); colliders.push({ x, z, r: 5 }); }
  const pavilion = new THREE.Group(); pavilion.position.set(0, 0, -3.4); worldRoot.add(pavilion);
  const rm = A.std(0x9c3d2f, 0.5);
  for (const [x, z] of [[-1.8, -1.2], [1.8, -1.2], [-1.8, 1.2], [1.8, 1.2]]) A.mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 12), rm, x, 1.3, z, pavilion);
  A.mesh(new THREE.ConeGeometry(3.0, 1.0, 4), A.std(0x2f5d50, 0.6), 0, 3.1, 0, pavilion).rotation.y = Math.PI / 4;
  A.bench(0, -3.9, 0);
  const elder = spawnPerson('elder', 0, -3.2, 1, 0, 'Idle');
  worldRoot.add(elder); colliders.push({ x: 0, z: -3.2, r: 0.7 });
  makeInteractable(elder, { type: 'elder', label: '陳婆婆' });
  const nm = A.label('陳婆婆', { icon: '👵', accent: '#f2994a' }); nm.position.set(0, 2.0, -3.2); worldRoot.add(nm);
  for (const [x, z] of [[-6, -1], [6, -1], [-6, 6], [6, 6]]) { A.lamp(x, z); const pl = new THREE.PointLight(0xffc98a, 8, 9, 2); pl.position.set(x + 0.8, 3.7, z); worldRoot.add(pl); }
  for (const [x, z] of [[-8, -4], [8, -4], [-9, 3], [9, 3]]) A.tree(x, z, 1.2, { leaf: 0x5d7f3a });
  walker('boy', [[-7, 7.5], [7, 7.5]], 1.0);
  A.particles(300, 20, 0xffffff, 0.06, 0.15, 6);
  const gifts = [
    { id: 'coat', name: '禦寒衣物', icon: '🧥', color: '#2f80ed' },
    { id: 'drink', name: '熱飲', icon: '☕', color: '#eb5757' },
    { id: 'visit', name: '問候卡', icon: '💌', color: '#f2c94c' },
  ];
  gifts.forEach((g, i) => addTok({ x: [-4, 4, -4][i], z: [2, 2, -0.6][i], icon: g.icon, name: g.name, color: g.color }, { type: 'pickup', id: g.id, label: g.name }));
  let given = 0;
  elder.userData.interact.onUse = () => {
    if (!held) return failNudge('先拿送暖物品');
    held = null; updateHeldHud(); given++; toast('❤️');
    playClip(elder, 'Victory'); setTimeout(() => playClip(elder, 'Idle'), 1600);
    setPill(`🧣 送暖 <b>${given}/2</b>`);
    if (given >= 2) {
      showBoard(`
        <h2>🤔 長者為何容易跌倒？</h2>
        <p class="tip">選兩個原因</p>
        <div class="row" id="why"></div>
        <button class="go" id="chk">提交</button>
      `);
      const sel = new Set();
      const opts = ['血壓變高，容易頭暈', '肌肉和關節較繃緊', '因為穿得太少而已', '只因地面濕滑'];
      const row = $('boardHost').querySelector('#why');
      opts.forEach((o) => {
        const b = document.createElement('button'); b.className = 'choice'; b.textContent = o;
        b.onclick = () => { if (sel.has(o)) { sel.delete(o); b.classList.remove('sel'); } else { sel.add(o); b.classList.add('sel'); } };
        row.appendChild(b);
      });
      $('boardHost').querySelector('#chk').onclick = () => {
        if (sel.has(opts[0]) && sel.has(opts[1]) && sel.size === 2) completeMission();
        else failNudge('選兩個正確原因');
      };
    }
  };
  setBounds(8.5); player.z = 7;
  setPill('🧣 拾取物品 · 送給 <b>陳婆婆</b>');
}

function buildM10() {
  A.indoor({ bg: 0x05070f, expo: 1.0, sunI: 2.6, sunDir: [8, 4, 6], sunC: 0xffffff, hemiI: 0.08, envI: 0.15 });
  A.stars(A.Q.low ? 1200 : 2500);
  const fl = A.mesh(new THREE.CircleGeometry(9, 64), A.std(0x1a2030, 0.25, 0.7), 0, 0, 0); fl.rotation.x = -Math.PI / 2;
  const ring = A.mesh(new THREE.TorusGeometry(3.2, 0.05, 8, 96), A.std(0x6fd3ff, 0.3, 0, { emissive: 0x3fb3ff, emissiveIntensity: 2 }), 0, 0.03, -2); ring.rotation.x = Math.PI / 2;
  const TL = new THREE.TextureLoader();
  const em = TL.load('assets/misc/earth_atmos_2048.jpg'); em.colorSpace = THREE.SRGBColorSpace; em.anisotropy = 8;
  const earth = A.mesh(new THREE.SphereGeometry(1.8, 64, 48), new THREE.MeshStandardMaterial({ map: em, normalMap: TL.load('assets/misc/earth_normal_2048.jpg'), roughnessMap: TL.load('assets/misc/earth_specular_2048.jpg'), roughness: 0.7, metalness: 0 }), 0, 2.2, -2);
  earth.rotation.z = 0.41;
  const atm = A.mesh(new THREE.SphereGeometry(1.95, 48, 32), new THREE.MeshBasicMaterial({ color: 0x5fb6ff, transparent: true, opacity: 0.18, side: THREE.BackSide, blending: THREE.AdditiveBlending }), 0, 2.2, -2);
  anims.push((dt) => { earth.rotation.y += dt * 0.18; });
  A.mesh(new THREE.CylinderGeometry(0.5, 0.8, 0.4, 32), A.std(0x2a3448, 0.3, 0.8), 0, 0.2, -2);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const p = new THREE.PointLight(0x3fb3ff, 2, 6); p.position.set(Math.cos(a) * 3.2, 0.3, -2 + Math.sin(a) * 3.2); worldRoot.add(p); }
  colliders.push({ x: 0, z: -2, r: 2 });
  setBounds(8); player.z = 6;
  const pos = [[2.2, 0.2], [-0.4, 1.4], [3.8, 2.4], [-3.2, 2.8], [1.0, 3.4]]; // 亞洲 非洲 太平洋 南美洲 印度洋 on floor world map
  const fm = A.mesh(new THREE.PlaneGeometry(10, 5), new THREE.MeshStandardMaterial({ roughness: 0.6, map: A.canvasTex(1024, 512, (g, w, h) => { g.fillStyle = '#1d5d8f'; g.fillRect(0, 0, w, h); g.fillStyle = '#5fb36a'; [[0.2, 0.3, 0.12, 0.15], [0.47, 0.25, 0.05, 0.08], [0.83, 0.75, 0.06, 0.06], [0.5, 0.92, 0.3, 0.04]].forEach(([x, y, a, b2]) => { g.beginPath(); g.ellipse(x * w, y * h, a * w, b2 * h, 0, 0, 7); g.fill(); }); g.fillStyle = '#fff'; g.font = `700 26px ${A.FONT}`; [['北美洲', 0.16, 0.3], ['歐洲', 0.45, 0.22], ['大洋洲', 0.8, 0.78], ['南極洲', 0.45, 0.97], ['大西洋', 0.32, 0.5], ['北冰洋', 0.45, 0.06]].forEach(([t, x, y]) => g.fillText(t, x * w, y * h)); }) }), 0, 0.02, 2.4);
  fm.rotation.x = -Math.PI / 2; fm.castShadow = false;
  const opt = F.earth.puzzleOptions; const items = Object.entries(opt).map(([k, v], i) => ({ id: k, name: `${k}. ${v}`, icon: '🧩', color: '#9b51e0', x: -6 + i * 3, z: 6.6 }));
  const pads = F.earth.puzzleAnswers.map((ans, i) => ({ name: `缺塊 ${i + 1}`, icon: '❓', x: pos[i][0] - 0.5, z: pos[i][1], want: ans, wrong: '位置不對，看看地圖', color: '#9b51e0', r: 0.55 }));
  placeTask(items, pads, () => quickQuiz('🌍 快問快答', [{ q: '海洋比陸地', opts: ['多', '少'], ans: '多' }, { q: '最大大洲', opts: ['亞洲', '非洲'], ans: '亞洲' }, { q: '最大大洋', opts: ['印度洋', '太平洋'], ans: '太平洋' }], () => completeMission()), '🌍 把拼塊搬到地上世界地圖的 <b>缺塊</b>');
}

function buildM11() {
  A.outdoor({ elev: 50, azim: 180, turb: 2, fog: 0xdfe6ee, near: 80, far: 260, expo: 0.55 });
  const sandM = A.pbr('ground054', 10, { color: 0xf0cf96 });
  const snowM = A.pbr('snow006', 10);
  const mkHalf = (sx, mat, amp) => {
    const geo = new THREE.PlaneGeometry(60, 80, 80, 80); geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) + sx, z = p.getZ(i); const dist = Math.max(0, Math.hypot(x * 0.6, z) - 6); p.setY(i, (Math.sin(x * 0.25 + z * 0.1) * 0.5 + Math.sin(z * 0.18) * 0.7 + 0.6) * amp * Math.min(1, dist / 8)); }
    geo.computeVertexNormals(); const m = new THREE.Mesh(geo, mat); m.position.x = sx; m.receiveShadow = true; worldRoot.add(m);
  };
  mkHalf(-30, sandM, 2.5); mkHalf(30, snowM, 1.6);
  // desert props: cacti, tent
  const cm = A.std(0x4f8a3c, 0.7);
  for (const [x, z, s] of [[-7, -5, 1.2], [-11, 2, 1], [-5, -9, 1.4], [-13, -7, 1.1]]) { const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); worldRoot.add(g); A.mesh(new THREE.CapsuleGeometry(0.22, 1.6, 6, 12), cm, 0, 1, 0, g); const a = A.mesh(new THREE.CapsuleGeometry(0.13, 0.6, 6, 10), cm, 0.35, 1.2, 0, g); a.rotation.z = -0.3; const b = A.mesh(new THREE.CapsuleGeometry(0.12, 0.5, 6, 10), cm, -0.32, 1.5, 0, g); b.rotation.z = 0.3; colliders.push({ x, z, r: 0.4 }); }
  const tent = A.mesh(new THREE.ConeGeometry(1.8, 2.2, 6), A.pbr('fabric045', 2, { color: 0xc8955a }), -6, 1.1, -1.5); colliders.push({ x: -6, z: -1.5, r: 1.7 });
  // polar: igloo, ice blocks
  const ig = A.mesh(new THREE.SphereGeometry(1.8, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf4f8ff, roughness: 0.35, map: A.canvasTex(512, 256, (g, w, h) => { g.fillStyle = '#eef4fb'; g.fillRect(0, 0, w, h); g.strokeStyle = '#b9cde3'; g.lineWidth = 3; for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (y / 32) % 2 ? 0 : 24; x < w; x += 48) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); } } }) }), 6.5, 0, -2);
  colliders.push({ x: 6.5, z: -2, r: 2 });
  for (let i = 0; i < 6; i++) A.mesh(A.rbox(0.8, 0.5, 0.6, 0.06), new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, roughness: 0.15, transmission: 0.3, thickness: 0.5 }), 9 + (i % 3) * 0.9, 0.25 + Math.floor(i / 3) * 0.5, 2);
  A.particles(200, 16, 0xffffff, 0.1, 0.8, 7).position.x = 8;
  const div = A.label('沙漠 ⟷ 極地', { icon: '🧭', accent: '#9b51e0', scale: 1.4 }); div.position.set(0, 2.6, -6); worldRoot.add(div);
  setBounds(8); player.z = 6;
  const d = spawnPerson('boy2', -5, -3, 1, 0); worldRoot.add(d); colliders.push({ x: -5, z: -3, r: 0.5 });
  const p = spawnPerson('girl', 5, -3, 1, 0); worldRoot.add(p); colliders.push({ x: 5, z: -3, r: 0.5 });
  const items = [['robe', '長袍', '🥻'], ['camel', '駱駝', '🐫'], ['vest', '背心', '🎽'], ['horse', '馬匹', '🐎'], ['fur', '保暖皮毛衣', '🧥'], ['fish', '捕魚工具', '🎣'], ['fan', '散熱風扇', '🌀'], ['hoe', '耕種鋤頭', '⛏️']].map(([id, name, icon], i) => ({ id, name, icon, color: i % 2 ? '#e0a040' : '#5fb6ff', x: -7 + (i % 4) * 4.6 / 1 * 0.8 + (i >= 4 ? 7.6 : 0) - 0.4, z: 4.2 - Math.floor((i % 4) / 2) * 0 }));
  items.forEach((it, i) => { it.x = [-7, -5.5, -4, -2.5, 2.5, 4, 5.5, 7][i]; it.z = 4; });
  placeTask(items, [{ name: '沙漠穿著', icon: '🏜️', x: -6, z: 0.8, want: 'robe', wrong: '沙漠要防曬防沙' }, { name: '沙漠交通', icon: '🏜️', x: -3.5, z: 0.8, want: 'camel', wrong: '沙漠用甚麼代步？' }, { name: '極地穿著', icon: '❄️', x: 3.5, z: 0.8, want: 'fur', wrong: '極地嚴寒要保暖', color: '#5fb6ff' }, { name: '極地食物', icon: '❄️', x: 6, z: 0.8, want: 'fish', wrong: '極地以甚麼為主食？', color: '#5fb6ff' }], () => completeMission(), '🏜️❄️ 幫兩地居民 <b>選衣食住行</b>');
}

function buildM12() {
  classroom({ title: '防災演習', lines: ['匿 · 掩 · 抓', '勿用升降機 · 到空曠處'], desks: false });
  for (const [x, z] of [[-4.5, -3], [1.5, -3], [4.5, -3], [-1.5, -1.2], [4.5, -1.2]]) { A.desk(x, z, 0); colliders.push({ x, z, r: 0.7 }); }
  const dk = A.desk(-2, -1, 0); colliders.push({ x: -2, z: -1, r: 0.9 });
  const hit = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.7), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(-2, 0.4, -1);
  makeInteractable(hit, { type: 'duck', label: '匿在課桌下' });
  const arrow = A.label('匿埋', { icon: '🪑', accent: '#eb5757' }); arrow.position.set(-2, 1.2, -1); worldRoot.add(arrow);
  // lift
  const lift = new THREE.Group(); lift.position.set(3, 0, -3); worldRoot.add(lift);
  A.mesh(A.rbox(1.6, 2.7, 0.3, 0.03), A.std(0x8b939c, 0.35, 0.8), 0, 1.35, 0, lift);
  A.mesh(new THREE.BoxGeometry(0.62, 2.3, 0.05), A.pbr('metal009', 1, { metalness: 1, roughness: 0.3 }), -0.32, 1.2, 0.16, lift);
  A.mesh(new THREE.BoxGeometry(0.62, 2.3, 0.05), A.pbr('metal009', 1, { metalness: 1, roughness: 0.3 }), 0.32, 1.2, 0.16, lift);
  const no = A.label('升降機', { icon: '⛔', accent: '#eb5757', bg: 'rgba(255,235,235,.95)' }); no.position.set(0, 2.8, 0.2); lift.add(no);
  colliders.push({ x: 3, z: -3, r: 0.9 });
  const lh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.4), new THREE.MeshBasicMaterial({ visible: false })); lh.position.set(3, 1.2, -2.6); makeInteractable(lh, { type: 'lift', label: '升降機', onUse: () => failNudge('地震時不要使用升降機！') });
  const open = A.pad({ x: 0, z: 3, name: '空曠安全處', icon: '🏞️', color: '#27ae60', r: 1.3 });
  makeInteractable(open, { type: 'safe', label: '空曠安全處' });
  // cracks, fallen books, dust
  A.particles(150, 12, 0xd8cbb8, 0.05, 0.25, 3.5);
  shake = 0.6;
  const swing = A.mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6), A.std(0x333333), 0, 3.2, 0);
  anims.push((dt, t) => { swing.rotation.z = Math.sin(t * 5) * 0.15 * (shake > 0.05 ? 1 : 0.2); });
  let ducked = false, safed = false;
  hit.userData.interact.onUse = () => { ducked = true; hit.userData.spent = true; arrow.visible = false; toast('🪑'); setPill('🪑 已匿埋 · 震動停止後到 <b>空曠處</b>'); player.y = 0.9; setTimeout(() => { player.y = 1.55; shake = 0; }, 1500); };
  open.userData.interact.onUse = () => {
    if (!ducked) return failNudge('先匿埋');
    safed = true; open.userData.spent = true; toast('🏞️');
    showBoard(`
      <h2>🚨 防災知識</h2>
      <p class="q">🌋 火山破壞（選2）</p><div class="row" id="v"></div>
      <p class="q">🛡️ 減低影響（選2）</p><div class="row" id="r"></div>
      <button class="go" id="chk">提交</button>
    `);
    const pick = (id, opts, need) => {
      const sel = new Set();
      const row = $('boardHost').querySelector('#' + id);
      opts.forEach((o) => {
        const b = document.createElement('button'); b.className = 'choice'; b.textContent = o;
        b.onclick = () => { if (sel.has(o)) { sel.delete(o); b.classList.remove('sel'); } else { sel.add(o); b.classList.add('sel'); } };
        row.appendChild(b);
      });
      return () => need.every((n) => sel.has(n)) && sel.size === need.length;
    };
    const okV = pick('v', ['山坡崩塌', '房屋被埋', '天氣變冷', '自動發電'], F.disaster.volcano);
    const okR = pick('r', ['加強建築物的防風抗震能力', '設立地震預警系統', '靠近斜坡觀察', '使用升降機逃生'], F.disaster.reduce);
    $('boardHost').querySelector('#chk').onclick = () => {
      if (okV() && okR() && safed) completeMission();
      else failNudge('對照作業簡答');
    };
  };
  setPill('🚨 地震！<b>匿埋 → 勿乘升降機 → 空曠處</b>');
}


// ===== money / shop / boss =====
let shopOpen = false, money = 0, bossOn = false, bossWon = false, boss = null, bossHp = 0, bossCd = 2, shots = [], fireCd = 0, reloadT = 0;
const GUNS = {
  water: { name: '💧 水炮槍', dmg: 10, rate: 0.3, range: 16, mag: 12, price: 0, ammoPrice: 0, col: 0x6fd3ff },
  pistol: { name: '🔫 淨化手槍', dmg: 22, rate: 0.35, range: 28, mag: 10, price: 100, ammoPrice: 15, col: 0x9be15d },
  rifle: { name: '🌬️ 風力連發槍', dmg: 12, rate: 0.1, range: 32, mag: 30, price: 180, ammoPrice: 25, col: 0xbfe3ff },
  solar: { name: '☀️ 太陽能狙擊槍', dmg: 70, rate: 0.9, range: 70, mag: 4, price: 260, ammoPrice: 20, col: 0xffd34d },
};
const inv = { water: { mag: 12, res: 999 } }; let gun = 'water';
const ui = document.createElement('div'); ui.id = 'weap'; ui.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:12px;max-width:calc(100vw - 340px);justify-content:center;z-index:6;pointer-events:auto;font-size:16px;display:flex;gap:6px;flex-wrap:wrap;align-items:center';
document.body.appendChild(ui);
function updWeap() {
  const g = GUNS[gun], v = inv[gun];
  ui.innerHTML = `<span class="pill" style="position:static;transform:none" data-testid="money">💰 ${money}</span>`
    + (bossOn || slimes.length ? `<span class="pill" style="position:static;transform:none" data-testid="ammo">${g.name} ${v.mag}/${v.res}</span><button class="choice" data-testid="fire" id="fireBtn">🔫 射擊</button><button class="choice" data-testid="reload" id="rlBtn">🔄 換彈</button><button class="choice" data-testid="swap" id="swBtn">🔁 換槍</button><button class="choice" data-testid="jump" id="jpBtn">⤴️ 跳</button>` : '')
    + `<button class="choice" data-testid="shop" id="shopBtn">🛒 商店</button>`;
  ui.querySelector('#shopBtn').onclick = openShop;
  if (bossOn || slimes.length) { ui.querySelector('#fireBtn').onpointerdown = () => fire(); ui.querySelector('#rlBtn').onclick = reload; ui.querySelector('#swBtn').onclick = swap; ui.querySelector('#jpBtn').onclick = jump; ui.querySelector('#fireBtn').onpointerup = () => {}; }
}
function openShop() {
  let ov = document.getElementById('shopOv'); if (!ov) { ov = document.createElement('div'); ov.id = 'shopOv'; ov.style.cssText = 'position:fixed;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:rgba(5,12,24,.55)'; document.body.appendChild(ov); }
  shopOpen = true; ov.style.display = 'flex';
  ov.innerHTML = `<div class="board" style="max-height:86vh;width:min(720px,94vw)"><h2>🛒 武器商店 · 💰 ${money}</h2><p class="tip">傷害／射速／射程／彈匣不同 · 補彈要錢</p><div class="row" id="shopRow"></div><button class="go" id="shopClose">關閉</button></div>`;
  const b = ov;
  const row = b.querySelector('#shopRow');
  for (const [k, g] of Object.entries(GUNS)) {
    const own = !!inv[k];
    const bt = document.createElement('button'); bt.className = 'choice'; bt.dataset.testid = 'buy-' + k;
    bt.textContent = own ? (k === 'water' ? `${g.name} ✅ 無限補彈` : `${g.name} 補彈 +${g.mag}（$${g.ammoPrice}）· 存 ${inv[k].res}`) : `${g.name} $${g.price} · 傷害${g.dmg} 射速${(1 / g.rate).toFixed(1)}/秒 射程${g.range} 彈匣${g.mag}`;
    bt.onclick = () => {
      const cost = own ? g.ammoPrice : g.price; if (money < cost) return failNudge('金錢不足');
      money -= cost; if (own) inv[k].res += g.mag; else { inv[k] = { mag: g.mag, res: g.mag * 2 }; gun = k; }
      toast('🛒'); updWeap(); openShop();
    };
    row.appendChild(bt);
  }
  b.querySelector('#shopClose').onclick = () => { ov.style.display = 'none'; shopOpen = false; updWeap(); };
}
function swap() { const ks = Object.keys(inv); gun = ks[(ks.indexOf(gun) + 1) % ks.length]; updWeap(); }
function reload() { const g = GUNS[gun], v = inv[gun]; const n = Math.min(g.mag - v.mag, v.res); if (n <= 0) return; v.res -= n; v.mag += n; reloadT = 0.8; toast('🔄', 500); updWeap(); }
const ray = new THREE.Raycaster();
function fire() {
  if (shopOpen || !(bossOn || slimes.length) || fireCd > 0 || reloadT > 0) return; const g = GUNS[gun], v = inv[gun];
  if (v.mag <= 0) { failNudge('冇子彈！按 R 換彈'); return; }
  v.mag--; fireCd = g.rate; updWeap();
  ray.setFromCamera({ x: 0, y: 0 }, C); ray.far = g.range; window.__shots = (window.__shots || 0) + 1;
  const hit = ray.intersectObjects([...(boss ? [boss] : []), ...slimes.map((q) => q.g), ...cover], true)[0];
  const end = hit ? hit.point : C.position.clone().add(ray.ray.direction.clone().multiplyScalar(g.range));
  const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 6), new THREE.MeshBasicMaterial({ color: gun === 'water' ? 0x6fd3ff : 0xffd34d }));
  const a = C.position.clone().add(new THREE.Vector3(0.2, -0.2, 0)); tr.position.copy(a).lerp(end, 0.5); tr.scale.y = a.distanceTo(end); tr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(a).normalize()); worldRoot.add(tr); setTimeout(() => worldRoot.remove(tr), 80);
  let sl = hit && slimes.find((q) => { let o = hit.object; while (o) { if (o === q.g) return true; o = o.parent; } return false; });
  if (sl) { sl.hp -= g.dmg; toast('💥', 200); if (sl.hp <= 0) killSlime(sl); return; }
  if (hit && cover.includes(hit.object)) { window.__blocked = (window.__blocked || 0) + 1; return; }
  if (hit) { window.__hits = (window.__hits || 0) + 1; bossHp -= g.dmg; toast('💥', 250); boss.scale.setScalar(1.05); setTimeout(() => boss && boss.scale.setScalar(1), 80); setPill(`👾 污染地球怪獸 <b>${Math.max(0, bossHp)} HP</b> · ❤️ ${pHp}`); if (bossHp <= 0) winBoss(); }
}
let pHp = 100;
function startBoss() {
  clearWorld(); slimes.length = 0; cover.length = 0; shots = []; bossOn = true; bossPhase = 1; missionTimerOn = false; pHp = 100; bossHp = 900; bossCd = 2.5; ringCd = 6;
  A.outdoor({ elev: 12, azim: 200, turb: 12, rayleigh: 3, fog: 0x8a7a5a, near: 20, far: 90, sunC: 0xffa060, expo: 0.55 });
  A.ground('ground054', 80, 20);
  for (let i = 0; i < 14; i++) A.tree((Math.random() - 0.5) * 40, -14 - Math.random() * 10, 1.2, { bare: true });
  for (const [x, z] of [[-4, -1], [4, -1], [0, 3]]) { cover.push(A.mesh(new THREE.CylinderGeometry(0.6, 0.7, 2, 16), A.pbr('concrete034', 1), x, 1, z)); colliders.push({ x, z, r: 0.9 }); }
  const crate = A.token({ x: 8, z: 6, icon: '📦', name: '彈藥箱', color: '#f2c94c' }); makeInteractable(crate, { type: 'ammo', label: '彈藥箱 +補彈', onUse: () => { inv[gun].res += GUNS[gun].mag; crate.userData.spent = true; crate.visible = false; toast('📦'); updWeap(); setTimeout(() => { crate.visible = true; crate.userData.spent = false; }, 20000); } });
  boss = new THREE.Group(); boss.position.set(0, 0, -9);
  const body = A.mesh(new THREE.SphereGeometry(2, 32, 24), new THREE.MeshPhysicalMaterial({ color: 0x4b3d5c, roughness: 0.3, clearcoat: 1, emissive: 0x1a3010 }), 0, 2.2, 0, boss); body.scale.y = 0.85;
  for (const s of [-1, 1]) { A.mesh(new THREE.SphereGeometry(0.35, 16, 12), A.std(0xffff66, 0.2, 0, { emissive: 0xffee00, emissiveIntensity: 2 }), s * 0.7, 2.9, 1.7, boss); A.mesh(new THREE.CylinderGeometry(0.35, 0.45, 2.2, 12), A.std(0x8a3b2a, 0.7), s * 1.2, 4, -0.4, boss); }
  A.mesh(new THREE.TorusGeometry(0.6, 0.12, 8, 16, Math.PI), A.std(0x220000), 0, 1.9, 1.85, boss).rotation.z = 0;
  const smoke = A.particles(120, 3, 0x555555, 0.3, -0.8, 6); boss.add(smoke); smoke.position.y = 4;
  worldRoot.add(boss);
  setBounds(14); player.x = 0; player.z = 8; player.yaw = 0; player.pitch = 0.1;
  setPill(`👾 污染地球怪獸 <b>${bossHp} HP</b> · ❤️ ${pHp}`); hint('點擊／🔫 射擊 · R 換彈 · Q 換槍 · 躲開污泥球');
  updWeap();
}
function bossTick(dt) {
  fireCd -= dt; if (reloadT > 0) reloadT -= dt;
  if (!boss) return;
  const dx = player.x - boss.position.x, dz = player.z - boss.position.z, d = Math.hypot(dx, dz);
  boss.rotation.y = Math.atan2(dx, dz); const sp = bossHp < 300 ? 2.2 : 1.3; boss.children[0].material.emissive.setHex(bossHp < 300 ? 0x5a1010 : 0x1a3010);
  const ph = bossHp > 600 ? 1 : bossHp > 300 ? 2 : 3;
  if (ph !== bossPhase) { bossPhase = ph; toast(ph === 2 ? '😡' : '🔥', 1200); hint(ph === 2 ? '第二階段：小污染怪出現！' : '第三階段：衝擊波！按空格跳起'); if (ph === 2) spawnSlimes(3, null, boss.position); shake = 0.8; setTimeout(() => (shake = 0), 600); }
  if (bossPhase === 3) { ringCd -= dt; if (ringCd <= 0) { ringCd = 4.5; const r = A.mesh(new THREE.TorusGeometry(1, 0.15, 8, 48), A.std(0x7aff3a, 0.4, 0, { emissive: 0x3a9a10, emissiveIntensity: 2 }), boss.position.x, 0.25, boss.position.z); r.rotation.x = Math.PI / 2; rings.push({ r, rad: 1, hit: false }); } }
  for (const q of rings) { q.rad += dt * 7; q.r.scale.setScalar(q.rad); if (!q.hit && Math.abs(Math.hypot(player.x - q.r.position.x, player.z - q.r.position.z) - q.rad) < 0.6 && jumpH < 0.35) { q.hit = true; hurt(15); } }
  rings = rings.filter((q) => (q.rad > 20 ? (worldRoot.remove(q.r), false) : true));
  if (d > 6) { boss.position.x += (dx / d) * sp * dt; boss.position.z += (dz / d) * sp * dt; }
  boss.position.y = Math.abs(Math.sin(clock.elapsedTime * 3)) * 0.3;
  if (d < 3.2) hurt(25 * dt);
  bossCd -= dt;
  if (bossCd <= 0) { bossCd = bossHp < 300 ? 1.3 : bossHp < 600 ? 1.8 : 2.4; const b = A.mesh(new THREE.SphereGeometry(0.35, 12, 8), A.std(0x6aff3a, 0.4, 0, { emissive: 0x2a8a10 }), boss.position.x, 2.4, boss.position.z); const v = new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(9); shots.push({ b, v, t: 0 }); }
  for (const s of shots) { s.t += dt; s.b.position.addScaledVector(s.v, dt); s.b.position.y = Math.max(0.5, 2.4 - s.t * 0.9); if (s.b.position.distanceTo(new THREE.Vector3(player.x, 1, player.z)) < 0.9) { hurt(15); s.t = 99; } }
  shots = shots.filter((s) => { if (s.t > 4) { worldRoot.remove(s.b); return false; } return true; });
  if (keys['KeyF'] || mouseFire) fire();
}
let bossPhase = 1, ringCd = 6, rings = [], jumpH = 0, jumpV = 0; const cover = [];
const slimes = []; let slimeDone = null;
function spawnSlimes(n, done, near) {
  slimeDone = done; fireCd = 0;
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group(); const a = (i / n) * Math.PI * 2;
    const cx = near ? near.x : player.x, cz = near ? near.z : player.z - 1;
    g.position.set(Math.max(-bounds + 1, Math.min(bounds - 1, cx + Math.sin(a) * 4.5)), 0, Math.max(-bounds + 1, Math.min(bounds - 1, cz - Math.cos(a) * 4.5 - 1)));
    const b = A.mesh(new THREE.SphereGeometry(0.45, 24, 16), new THREE.MeshPhysicalMaterial({ color: 0x5a4a6e, roughness: 0.3, clearcoat: 1, emissive: 0x1a3010 }), 0, 0.45, 0, g); b.scale.y = 0.8;
    for (const sx of [-1, 1]) A.mesh(new THREE.SphereGeometry(0.09, 10, 8), A.std(0xffff88, 0.2, 0, { emissive: 0xffee00 }), sx * 0.16, 0.6, 0.36, g);
    worldRoot.add(g); slimes.push({ g, hp: 40, cd: 1 });
  }
  if (!bossOn) { setPill(`👾 清除污染怪 <b>${slimes.length}</b> · 點擊／🔫 射擊`); hint('射擊污染怪！R 換彈 · 🛒 買武器'); }
  updWeap();
}
function killSlime(q) { worldRoot.remove(q.g); slimes.splice(slimes.indexOf(q), 1); money += 8; toast('💰', 400); updWeap();
  if (!bossOn) setPill(`👾 清除污染怪 <b>${slimes.length}</b>`);
  if (!slimes.length && slimeDone) { const f = slimeDone; slimeDone = null; pHp = 100; setTimeout(f, 600); updWeap(); } }
function slimeTick(dt) {
  for (const q of slimes) { const dx = player.x - q.g.position.x, dz = player.z - q.g.position.z, d = Math.hypot(dx, dz) || 1;
    q.g.rotation.y = Math.atan2(dx, dz); q.g.children[0].scale.y = 0.8 + Math.sin(clock.elapsedTime * 8 + d) * 0.08;
    if (d > 1.2) { const nx = q.g.position.x + (dx / d) * 1.4 * dt, nz = q.g.position.z + (dz / d) * 1.4 * dt; q.g.position.x = nx; q.g.position.z = nz; }
    q.cd -= dt; if (d < 1.4 && q.cd <= 0) { q.cd = 1.2; hurt(6); } }
}
function jump() { if (jumpH <= 0.001) jumpV = 5.2; }
addEventListener('keydown', (e) => { if (e.code === 'Space' && (bossOn || slimes.length)) jump(); });
let mouseFire = false;
R.domElement.addEventListener('mousedown', (e) => { if ((bossOn || slimes.length) && e.button === 0) { mouseFire = true; fire(); } });
addEventListener('mouseup', () => { mouseFire = false; });
addEventListener('keydown', (e) => { if (!(bossOn || slimes.length)) return; if (e.code === 'KeyR') reload(); if (e.code === 'KeyQ') swap(); });
function hurt(n) {
  pHp = Math.max(0, Math.round(pHp - n)); setPill(`👾 污染地球怪獸 <b>${Math.max(0, bossHp)} HP</b> · ❤️ ${pHp}`); shake = 0.4; setTimeout(() => (shake = 0), 200);
  if (pHp <= 0 && !bossOn && slimes.length) { pHp = 100; const n = slimes.length; slimes.forEach((q) => worldRoot.remove(q.g)); slimes.length = 0; failNudge('被擊倒！再試一次'); spawnSlimes(n, slimeDone); return; }
  if (pHp <= 0 && bossOn) { bossOn = false; const b = showBoard(`<h2>😵 被污染擊倒</h2><p class="tip">去商店補彈或買新武器，再挑戰！</p><button class="go" data-testid="retry" id="retry">🔁 重試 Boss</button>`, true); b.querySelector('#retry').onclick = () => { inv.water.mag = 12; startBoss(); }; }
}
function winBoss() { bossOn = false; bossWon = true; worldRoot.remove(boss); boss = null; money += 200; score += 500; toast('🏆', 1500); setTimeout(endGame, 1200); }
window.__BOSS = { get slimes() { return slimes.map((q) => ({ x: q.g.position.x, z: q.g.position.z, hp: q.hp })); }, get boss() { return boss ? { x: boss.position.x, z: boss.position.z, phase: bossPhase } : null; }, start: startBoss, give(n) { money += n; updWeap(); }, get s() { return { bossOn, bossHp, pHp, money, gun, jumpH, shots: window.__shots || 0, hits: window.__hits || 0, blocked: window.__blocked || 0, inv: JSON.parse(JSON.stringify(inv)) }; } };
updWeap();

// ---- interaction ----
function tryInteract() {
  const m = nearestInteractable();
  if (!m) return;
  const data = m.userData.interact;
  if (data.onUse) return data.onUse();
  if (data.type === 'pickup') {
    if (held) { const prev = interactables.find((o) => o.userData.interact?.id === held.id && o.userData.interact.type === 'pickup'); if (prev) { prev.visible = true; prev.userData.spent = false; } }
    held = { id: data.id, label: data.label };
    m.visible = false; m.userData.spent = true;
    toast('✋'); updateHeldHud();
    return;
  }
  if (data.type === 'window') {
    if (!data.state.closed) { data.state.closed = true; m.userData.sash.forEach((s) => (s.rotation.y = 0)); m.userData.glass.opacity = 0.4; toast('🪟'); setPill('🪟 已關窗 · 再用 <b>膠紙</b>'); return; }
    if (held?.id === 'tape' && !data.state.taped) {
      data.state.taped = true; held = null; updateHeldHud(); toast('✖️'); setPill('✅ 已貼膠紙');
      const tm = A.std(0xf3e08a, 0.6, 0, { transparent: true, opacity: 0.85 });
      for (const sx of [-0.55, 0.55]) for (const r of [0.95, -0.95]) { const s = A.mesh(new THREE.BoxGeometry(1.45, 0.05, 0.008), tm, sx, 0, 0.06, m.userData.winG); s.rotation.z = r * 0.95; s.castShadow = false; }
      return;
    }
    if (data.state.closed && !data.state.taped) return failNudge('先拿膠紙');
  }
  if (data.type === 'plant') {
    data.outside = !data.outside;
    m.position.z = data.outside ? -6 : -2.6;
    toast('🪴');
    setPill(data.outside ? '盆栽在室外（八號時不應）' : '盆栽留在室內 ✓');
  }
  if (data.type === 'dropzone' && data.onUse) data.onUse();
  if (data.type === 'collect' && data.onUse) data.onUse();
  if (data.type === 'flavor') toast('👀');
}

$('act').addEventListener('click', (e) => { e.preventDefault(); tryInteract(); });
addEventListener('keydown', (e) => {
  if (!running) return;
  if ((e.code === 'KeyE' || e.code === 'Space') && !boardModal) tryInteract();
});

// ---- loop ----
const clock = new THREE.Clock();
let titleSpin = null;
const lastTarget = new THREE.Vector3();
let fpsAcc = 0, fpsN = 0;
function adapt(dt) {
  fpsAcc += dt; fpsN++;
  if (fpsAcc < 2.5) return;
  const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
  if (fps < 40 && pixelRatio > 0.9) { pixelRatio = Math.max(0.85, pixelRatio - 0.25); R.setPixelRatio(pixelRatio); R.setSize(innerWidth, innerHeight); }
  else if (fps > 57 && pixelRatio < Math.min(devicePixelRatio, A.Q.low ? 1.5 : 2)) { pixelRatio = Math.min(pixelRatio + 0.1, Math.min(devicePixelRatio, A.Q.low ? 1.5 : 2)); R.setPixelRatio(pixelRatio); R.setSize(innerWidth, innerHeight); }
}
function loop() {
  const dt = Math.min(0.05, clock.getDelta());
  if (running && !boardModal && !shopOpen) movePlayer(dt);
  if (running && bossOn && !shopOpen) bossTick(dt);
  else if (running && slimes.length) { fireCd -= dt; if (reloadT > 0) reloadT -= dt; if (keys['KeyF'] || mouseFire) fire(); }
  if (running && slimes.length) slimeTick(dt);
  if (jumpV || jumpH > 0) { jumpV -= 14 * dt; jumpH = Math.max(0, jumpH + jumpV * dt); if (jumpH === 0) jumpV = 0; }
  C.position.y = player.y + jumpH;
  if (running) setStats();
  if (running && missionTimerOn) {
    missionTimeLeft -= dt;
    if (missionTimeLeft <= 0) {
      missionTimeLeft = 0; missionTimerOn = false;
      // soft fail: auto-advance with reduced score rather than soft-lock
      score += Math.round(MISSIONS[missionIndex].points * 0.35);
      missionDone[missionIndex] = true;
      toast('⏰');
      missionIndex++;
      if (missionIndex >= MISSIONS.length) endGame();
      else startMission(missionIndex);
    }
    setStats();
  }
  const near = running && !boardModal ? nearestInteractable() : null;
  setAct(!!near && running);
  if (near && near.userData.interact) {
    const lab = near.userData.interact.label || near.userData.interact.type;
    if (!boardModal) setPrompt(lab ? `✋ ${lab}` : '✋ 互動'); else setPrompt('');
  } else setPrompt('');
  // gentle globe spin etc
  const tt = clock.elapsedTime;
  for (const f of anims) f(dt, tt);
  for (const mx of mixers) mx.update(dt);
  if (titleSpin) { titleSpin.a += dt * 0.05; C.position.set(Math.sin(titleSpin.a) * 7, 2.2, Math.cos(titleSpin.a) * 7); C.lookAt(0, 1.4, 0); }
  if (shake > 0) { C.position.x += (Math.random() - 0.5) * shake * 0.08; C.position.y += (Math.random() - 0.5) * shake * 0.06; C.rotation.z = (Math.random() - 0.5) * shake * 0.02; }
  sun.target.position.set(C.position.x, 0, C.position.z);
  if (sun.userData.off) sun.position.copy(sun.userData.off).add(sun.target.position);
  R.render(S, C);
  adapt(dt);
}
R.setAnimationLoop(loop);

// ---- boot ----
loadModels().then(() => {
  // cinematic title backdrop
  clearWorld();
  hkStreet();
  titleSpin = { a: 0.6 };
  $('go').disabled = false; $('go').classList.remove('loading');
  document.body.classList.add('ready');
});
$('go').onclick = async () => {
  $('title').classList.add('hide');
  await loadModels();
  titleSpin = null;
  document.body.classList.add('playing');
  running = true; window.__t0 = performance.now();
  if (TOUCH) $('joy').style.display = 'block';
  $('act').style.display = 'block';
  startMission(0);
};
$('replay').onclick = () => location.reload();

// test hooks
window.__SCENE = S; window.__CAM = C;
window.__GAME = {
  CONTENT, MISSIONS, get state() {
    return { missionIndex, score, missionDone: [...missionDone], boardOpen, held, timeLeft: missionTimeLeft, running, player: { ...player } };
  },
  jumpTo(i) { startMission(i); },
  view(x, y, z, yaw = 0, pitch = 0) { Object.assign(player, { x, y, z, yaw, pitch }); },
  get targets() { return interactables.filter((m) => m.visible && !m.userData.spent).map((m) => { const p = m.getWorldPosition(new THREE.Vector3()); return { x: p.x, z: p.z, type: m.userData.interact.type, id: m.userData.interact.id, label: m.userData.interact.label, want: m.userData.interact.want }; }); },
  get quality() { return { pixelRatio, low: A.Q.low }; },
};

console.info('奇妙考察隊 ready', MISSIONS.length, 'missions');
