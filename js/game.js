import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const $ = (id) => document.getElementById(id);
const CONTENT = await fetch('data/content.json').then((r) => r.json());
const MISSIONS = CONTENT.missions;
const F = CONTENT.facts;

// ---- anti-zoom / input hygiene ----
['gesturestart','gesturechange','gestureend','dblclick','contextmenu'].forEach((e) =>
  document.addEventListener(e, (ev) => ev.preventDefault(), { passive: false })
);
document.addEventListener('touchmove', (e) => { if (e.target.closest('#boardHost')) return; e.preventDefault(); }, { passive: false });
const TOUCH = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;

// ---- renderer / scene ----
const R = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
R.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.35 : 2));
R.setSize(innerWidth, innerHeight);
R.toneMapping = THREE.ACESFilmicToneMapping;
R.toneMappingExposure = 1.05;
R.outputColorSpace = THREE.SRGBColorSpace;
R.shadowMap.enabled = true;
R.shadowMap.type = TOUCH ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
document.body.prepend(R.domElement);

const S = new THREE.Scene();
S.background = new THREE.Color(0x87b7e0);
S.fog = new THREE.Fog(0x87b7e0, 28, 70);
const pm = new THREE.PMREMGenerator(R);
S.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;

const C = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 120);
function fit() {
  const a = innerWidth / innerHeight;
  C.aspect = a;
  C.fov = a >= 1 ? 70 : Math.min(92, (2 * Math.atan(Math.tan((35 * Math.PI) / 180) / Math.max(a, 0.55)) * 180) / Math.PI);
  C.updateProjectionMatrix();
  R.setSize(innerWidth, innerHeight);
}
fit();
addEventListener('resize', fit);
addEventListener('orientationchange', () => setTimeout(fit, 280));

S.add(new THREE.HemisphereLight(0xfff6e8, 0x4a5a48, 0.7));
const sun = new THREE.DirectionalLight(0xfff2d8, 1.55);
sun.position.set(8, 16, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(TOUCH ? 1024 : 2048, TOUCH ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 22, bottom: -22, near: 1, far: 50 });
sun.shadow.bias = -0.0004;
S.add(sun, sun.target);

// ---- helpers ----
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const TEX = new THREE.TextureLoader();
function loadTex(url, rep = [1, 1]) {
  const t = TEX.load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep[0], rep[1]);
  t.anisotropy = 4;
  return t;
}
const floorMap = loadTex('assets/tex/floor_c.jpg', [6, 6]);
const tileMap = loadTex('assets/tex/tile_c.jpg', [3, 3]);

function box(w, h, d, color, matOpts = {}) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, ...matOpts })
  );
  m.castShadow = m.receiveShadow = true;
  return m;
}
function cyl(r, h, color) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), new THREE.MeshStandardMaterial({ color, roughness: 0.65 }));
  m.castShadow = m.receiveShadow = true;
  return m;
}
function labelSprite(text, color = '#fff', bg = '#1a2740cc') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.roundRect(8, 8, 240, 48, 12); g.fill();
  g.fillStyle = color; g.font = 'bold 28px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  s.scale.set(1.6, 0.4, 1);
  return s;
}

const people = {};
async function loadPeople() {
  const files = {
    boy: 'assets/models/Casual_Male.glb',
    girl: 'assets/models/Casual_Female.glb',
    elder: 'assets/models/OldClassy_Female.glb',
    worker: 'assets/models/Worker_Female.glb',
  };
  await Promise.all(Object.entries(files).map(async ([k, url]) => {
    try {
      const gltf = await loader.loadAsync(url);
      people[k] = gltf.scene;
      people[k].traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    } catch (e) { console.warn('model', k, e); }
  }));
}
function spawnPerson(kind, x, z, scale = 0.9, rotY = 0) {
  if (!people[kind]) {
    const p = cyl(0.25, 1.4, 0x6699cc); p.position.set(x, 0.7, z); return p;
  }
  const root = SkeletonUtils.clone(people[kind]);
  root.position.set(x, 0, z);
  root.rotation.y = rotY;
  root.scale.setScalar(scale);
  return root;
}

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
}

// pointer look (desktop)
R.domElement.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || boardOpen) return;
  lookDrag = { x: e.clientX, y: e.clientY };
});
addEventListener('mouseup', () => { lookDrag = null; });
addEventListener('mousemove', (e) => {
  if (!lookDrag || boardOpen) return;
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
    if (t.clientX < innerWidth * 0.45) { joy.active = t.identifier; joyPos(t.clientX, t.clientY); }
    else if (!boardOpen) lookDrag = { id: t.identifier, x: t.clientX, y: t.clientY };
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
let interactables = [];
let boardOpen = false;
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
  interactables = [];
  held = null;
  hideBoard();
  setPrompt('');
  setAct(false);
}

function addFloor(size = 28, colorMap = floorMap) {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: colorMap, roughness: 0.85 }));
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; worldRoot.add(g);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xdde8f5, roughness: 0.9 });
  for (const [x, z, w, d] of [[0, -size/2, size, 0.4],[0, size/2, size, 0.4],[-size/2, 0, 0.4, size],[size/2, 0, 0.4, size]]) {
    const wll = new THREE.Mesh(new THREE.BoxGeometry(w, 3.2, d), wallMat);
    wll.position.set(x, 1.6, z); wll.receiveShadow = true; worldRoot.add(wll);
  }
  bounds = size / 2 - 0.8;
}

function toast(emoji, ms = 900) {
  const t = $('toast'); t.textContent = emoji; t.style.opacity = '1';
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.style.opacity = '0'; }, ms);
}
function setPill(html) { $('missionPill').innerHTML = html; }
function setStats() {
  const m = Math.max(0, Math.ceil(missionTimeLeft));
  $('stats').textContent = `⭐ ${score} · ⏱ ${missionTimerOn ? m + 's' : '--'}`;
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
  boardOpen = false;
  const h = $('boardHost');
  h.classList.remove('show', 'modal');
  h.innerHTML = '';
}
function showBoard(html, modal = false) {
  boardOpen = true;
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
  let best = null, bd = 2.2;
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(C.quaternion);
  for (const m of interactables) {
    if (!m.visible || m.userData.spent) continue;
    const p = m.getWorldPosition(new THREE.Vector3());
    const d = C.position.distanceTo(p);
    if (d > bd) continue;
    const to = p.clone().sub(C.position).normalize();
    if (dir.dot(to) < 0.15 && d > 1.2) continue;
    best = m; bd = d;
  }
  return best;
}

function completeMission(bonus = 0) {
  const m = MISSIONS[missionIndex];
  const timeBonus = Math.round(Math.max(0, missionTimeLeft) * 0.5);
  const gain = m.points + timeBonus + bonus;
  score += gain;
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
  missionTimerOn = true;
  player.x = 0; player.z = 5; player.yaw = 0; player.pitch = 0;
  setPill(`${m.icon} ${m.name} · ${CONTENT.lessons.find((l) => l.id === m.lesson).name}`);
  refreshProgress();
  setStats();
  const builders = [buildM1, buildM2, buildM3, buildM4, buildM5, buildM6, buildM7, buildM8, buildM9, buildM10, buildM11, buildM12];
  builders[i]();
  setCam();
}

function endGame() {
  running = false;
  missionTimerOn = false;
  $('end').classList.remove('hide');
  const stars = score > 1400 ? '⭐⭐⭐' : score > 1000 ? '⭐⭐' : '⭐';
  $('endStars').textContent = stars;
  $('endScore').textContent = `總分 ${score} · 完成 ${missionDone.filter(Boolean).length}/${MISSIONS.length} 任務`;
  setAct(false);
}

// ========== MISSION BUILDERS ==========
function buildM1() {
  // Map matching board — physical pick cards then place
  addFloor(20, tileMap);
  S.background = new THREE.Color(0x9ec9ef);
  const desk = box(3.2, 0.9, 1.6, 0xc4a574); desk.position.set(0, 0.45, -1); worldRoot.add(desk); colliders.push({ x: 0, z: -1, r: 1.4 });
  const maps = [
    { id: 'A', name: '世界地圖', color: 0x4a90d9 },
    { id: 'B', name: '亞洲地圖', color: 0xf5a623 },
    { id: 'C', name: '香港全境圖', color: 0x7ed321 },
    { id: 'D', name: '香港街道圖', color: 0xd0021b },
  ];
  maps.forEach((mp, i) => {
    const card = box(0.7, 0.02, 0.9, mp.color);
    card.position.set(-3 + i * 1.5, 0.12, 2);
    const sp = labelSprite(mp.name); sp.position.set(0, 0.35, 0); card.add(sp);
    makeInteractable(card, { type: 'pickup', id: mp.id, label: mp.name });
  });
  showBoard(`
    <h2>🗺️ 地圖配對</h2>
    <p>走到桌上地圖 ✋ 拾取，再點正確空格放上。</p>
    <div class="slotrow" id="needs"></div>
    <p style="font-size:13px;opacity:.7">手持：<span id="heldLbl">（無）</span></p>
  `);
  const needs = F.mapMatch;
  const host = $('boardHost').querySelector('#needs');
  needs.forEach((n, idx) => {
    const el = document.createElement('div');
    el.className = 'slot';
    el.dataset.ans = n.answer;
    el.dataset.idx = idx;
    el.innerHTML = `<b>${n.need}</b><br><span class="dropzone">放下</span>`;
    el.addEventListener('click', () => {
      if (!held) return failNudge('先拾取地圖');
      if (held.id !== n.answer) return failNudge('地圖不對');
      el.classList.add('filled');
      el.querySelector('.dropzone').textContent = F.mapTypes[held.id];
      held = null; updateHeld();
      if ([...host.querySelectorAll('.slot')].every((s) => s.classList.contains('filled'))) completeMission();
    });
    host.appendChild(el);
  });
  function updateHeld() { const el = $('boardHost').querySelector('#heldLbl'); if (el) el.textContent = held ? held.label : '（無）'; }
  window.__m1UpdateHeld = updateHeld;
  // keep board partially open but allow walking — use compact floating style
  // Actually for this mission we keep board open with slots; player still walks behind it visually.
}

function buildM2() {
  addFloor(18, tileMap);
  S.background.set(0xa8d4f0);
  // 3x3 grid A1..C3 on floor
  const cells = {};
  const labels = { A: 0, B: 1, C: 2 };
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      const code = 'ABC'[col] + (3 - row);
      const x = (col - 1) * 3.2, z = (row - 1) * 3.2 - 1;
      const tile = box(2.8, 0.05, 2.8, (col + row) % 2 ? 0xd5e8f7 : 0xc2d8ec);
      tile.position.set(x, 0.03, z); worldRoot.add(tile);
      const sp = labelSprite(code, '#1a2740', '#ffffffcc'); sp.position.set(x, 0.2, z); worldRoot.add(sp);
      cells[code] = { x, z };
    }
  }
  // place facilities at correct grids (subset for play)
  const targets = F.sheungWan.slice(0, 3);
  let found = 0;
  targets.forEach((t) => {
    const pos = cells[t.grid];
    const marker = box(0.6, 0.6, 0.6, 0xffcc33);
    marker.position.set(pos.x, 0.35, pos.z);
    const sp = labelSprite(t.facility); sp.position.set(0, 0.55, 0); marker.add(sp);
    makeInteractable(marker, {
      type: 'collect',
      check: () => true,
      onUse: () => {
        marker.userData.spent = true; marker.visible = false;
        found++; toast('📦');
        setPill(`格網尋寶 ${found}/${targets.length} · 下一個？`);
        if (found >= targets.length) {
          // direction bonus: south then west
          showBoard(`
            <h2>🧭 由西港城到上環文娛中心</h2>
            <p>先向哪方？再向哪方？</p>
            <div class="row" id="dirs"></div>
          `);
          const order = [];
          const row = $('boardHost').querySelector('#dirs');
          ['北', '南', '東', '西'].forEach((d) => {
            const b = document.createElement('button');
            b.className = 'choice'; b.textContent = d; b.dataset.d = d;
            b.onclick = () => {
              order.push(d); b.classList.add('sel');
              if (order.length === 2) {
                if (order[0] === '南' && order[1] === '西') completeMission(20);
                else { failNudge('方向：先南後西'); order.length = 0; row.querySelectorAll('.choice').forEach((c) => c.classList.remove('sel')); }
              }
            };
            row.appendChild(b);
          });
        }
      },
    });
  });
  setPill('🧭 走到標籤格網，拾取街市／博物館／餐廳');
}

function buildM3() {
  addFloor(16, floorMap);
  const items = [
    { id: 'legend', name: '圖例', color: 0x56ccf2 },
    { id: 'north', name: '方向標', color: 0xf2994a },
    { id: 'title', name: '標題', color: 0xbb6bd9 },
    { id: 'route', name: '考察路線', color: 0xeb5757 },
  ];
  items.forEach((it, i) => {
    const m = box(0.55, 0.55, 0.55, it.color);
    m.position.set(-3 + i * 1.6, 0.3, 2.5);
    { const __sp = labelSprite(it.name); __sp.position.set(0, 0.5, 0); m.add(__sp); };
    makeInteractable(m, { type: 'pickup', id: it.id, label: it.name });
  });
  const slotsNeeded = ['title', 'legend', 'north', 'route'];
  const placed = new Set();
  showBoard(`
    <h2>✏️ 繪畫考察路線圖</h2>
    <p>按正確四步：標題 → 圖例 → 方向標 → 考察路線</p>
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
      held = null;
      if (placed.size === 4) completeMission();
    };
    host.appendChild(el);
  });
}

function buildM4() {
  addFloor(18);
  S.background.set(0x8ecf9a);
  // mountains
  [[-4, 957, '大帽山'], [0, 934, '鳳凰山'], [4, 602, '飛鵝山'], [2, 495, '獅子山']].forEach(([x, h, name], i) => {
    const peak = new THREE.Mesh(new THREE.ConeGeometry(1.2 + i * 0.1, 1.5 + h / 500, 5), new THREE.MeshStandardMaterial({ color: 0x5a8f4a, flatShading: true }));
    peak.position.set(x, (1.5 + h / 500) / 2, -3); peak.castShadow = true; worldRoot.add(peak);
    const sp = labelSprite(`${name} ${h}m`); sp.position.set(x, 2.2 + h / 800, -3); worldRoot.add(sp);
  });
  showBoard(`
    <h2>⛰️ 香港地勢特徵</h2>
    <p>根據觀察選擇正確描述（可多選最後一題）</p>
    <div id="q"></div>
    <button class="go" id="chk">提交</button>`, true);
  const qs = [
    { q: '山地', opts: ['多', '不多'], ans: ['多'] },
    { q: '平地', opts: ['較多', '較少'], ans: ['較少'] },
    { q: '平地分佈', opts: ['較分散', '較集中'], ans: ['較分散'] },
    { q: '平地主要分佈在', opts: ['新界北部', '新界東部', '新界西北部', '九龍', '香港島'], ans: ['新界北部', '新界西北部', '九龍'], multi: true },
  ];
  const qel = $('boardHost').querySelector('#q');
  const picks = qs.map(() => new Set());
  qs.forEach((item, qi) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<p><b>${qi + 1}. ${item.q}</b></p>`;
    const row = document.createElement('div'); row.className = 'row';
    item.opts.forEach((o) => {
      const b = document.createElement('button'); b.className = 'choice'; b.textContent = o;
      b.onclick = () => {
        if (!item.multi) { picks[qi].clear(); row.querySelectorAll('.choice').forEach((c) => c.classList.remove('sel')); }
        if (picks[qi].has(o)) { picks[qi].delete(o); b.classList.remove('sel'); }
        else { picks[qi].add(o); b.classList.add('sel'); }
      };
      row.appendChild(b);
    });
    wrap.appendChild(row); qel.appendChild(wrap);
  });
  $('boardHost').querySelector('#chk').onclick = () => {
    const ok = qs.every((item, qi) => item.ans.length === picks[qi].size && item.ans.every((a) => picks[qi].has(a)));
    if (ok) completeMission(); else failNudge('再對照地圖');
  };
}

function buildM5() {
  addFloor(20);
  S.background.set(0x7ec8e3);
  // dolphin + runway pieces
  const dolphin = cyl(0.4, 0.5, 0xffb6c1); dolphin.position.set(-4, 0.3, 0); dolphin.rotation.z = Math.PI / 2;
  { const __sp = labelSprite('中華白海豚'); __sp.position.set(0, 0.8, 0); dolphin.add(__sp); };
  makeInteractable(dolphin, { type: 'pickup', id: 'dolphin', label: '中華白海豚' });
  const park = box(2.2, 0.2, 2.2, 0x56ccf2); park.position.set(4, 0.15, -2);
  { const __sp = labelSprite('海岸公園'); __sp.position.set(0, 0.5, 0); park.add(__sp); };
  makeInteractable(park, {
    type: 'dropzone', id: 'park',
    onUse: () => {
      if (!held || held.id !== 'dolphin') return failNudge('先帶海豚到公園');
      held = null; park.userData.saved = true; toast('🐬');
      maybeDone();
    },
  });
  // timeline board
  showBoard(`
    <h2>✈️ 機場時間線 + 保育</h2>
    <p>按年份由舊到新點選排序，並把海豚放到海岸公園。</p>
    <div class="row" id="tl"></div>
    <p id="tlOut" style="min-height:24px"></p>
    <p style="font-size:13px">正確公園名稱：<b>${F.airport.marinePark}</b></p>
  `);
  const years = F.airport.timeline.map((t) => t.y);
  const shuffled = [...years].sort(() => Math.random() - 0.5);
  const chosen = [];
  const tl = $('boardHost').querySelector('#tl');
  shuffled.forEach((y) => {
    const b = document.createElement('button'); b.className = 'choice'; b.textContent = y;
    b.onclick = () => {
      if (b.classList.contains('sel')) return;
      b.classList.add('sel'); chosen.push(y);
      $('boardHost').querySelector('#tlOut').textContent = chosen.join(' → ');
      maybeDone();
    };
    tl.appendChild(b);
  });
  function maybeDone() {
    const orderOk = chosen.length === years.length && chosen.every((y, i) => y === years[i]);
    if (orderOk && park.userData.saved) completeMission();
    else if (chosen.length === years.length && !orderOk) {
      failNudge('時間線次序不對'); chosen.length = 0;
      tl.querySelectorAll('.choice').forEach((c) => c.classList.remove('sel'));
      $('boardHost').querySelector('#tlOut').textContent = '';
    }
  }
}

function buildM6() {
  addFloor(14, tileMap);
  showBoard(`
    <h2>🏙️ 北部都會區 · 持份者</h2>
    <div id="stk"></div>
    <hr>
    <h2>填充</h2>
    <p>增加「____」供應，興建「____」，發展「____」；兼顧「____」，保育「____」，確保「____」棲息地。</p>
    <div class="row" id="fills"></div>
    <button class="go" id="chk">核對</button>`, true);
  const stk = $('boardHost').querySelector('#stk');
  const whoMap = {};
  F.stakeholders.forEach((s, i) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<p>${i + 1}. 「${s.say}」</p>`;
    const row = document.createElement('div'); row.className = 'row';
    [['A', '輪候公屋居民'], ['B', '商界代表'], ['C', '環保人士']].forEach(([k, lab]) => {
      const b = document.createElement('button'); b.className = 'choice'; b.textContent = lab;
      b.onclick = () => {
        row.querySelectorAll('.choice').forEach((c) => c.classList.remove('sel'));
        b.classList.add('sel'); whoMap[i] = k;
      };
      row.appendChild(b);
    });
    wrap.appendChild(row); stk.appendChild(wrap);
  });
  const fillPick = [];
  const fills = $('boardHost').querySelector('#fills');
  const words = [...F.northernFill].sort(() => Math.random() - 0.5);
  words.forEach((w) => {
    const b = document.createElement('button'); b.className = 'chip'; b.textContent = w;
    b.onclick = () => {
      if (b.classList.contains('sel')) { b.classList.remove('sel'); fillPick.splice(fillPick.indexOf(w), 1); }
      else if (fillPick.length < 6) { b.classList.add('sel'); fillPick.push(w); }
    };
    fills.appendChild(b);
  });
  $('boardHost').querySelector('#chk').onclick = () => {
    const stakeOk = F.stakeholders.every((s, i) => whoMap[i] === s.who);
    const fillOk = fillPick.length === 6 && fillPick.every((w, i) => w === F.northernFill[i]);
    if (stakeOk && fillOk) completeMission();
    else failNudge(!stakeOk ? '持份者不對' : '填充次序：土地→大量住宅→創新科技產業→環境保護→濕地→動植物');
  };
}

function buildM7() {
  addFloor(18);
  S.background.set(0xffe6a7);
  const seasons = F.seasons;
  const items = [
    { id: 'A', name: '抽濕機', color: 0x56ccf2 },
    { id: 'B', name: '手提風扇', color: 0xf2994a },
    { id: 'C', name: '暖水袋', color: 0xeb5757 },
    { id: 'D', name: '護手霜', color: 0xbb6bd9 },
  ];
  items.forEach((it, i) => {
    const m = box(0.5, 0.5, 0.5, it.color);
    m.position.set(-4.5 + i * 1.4, 0.3, 3);
    { const __sp = labelSprite(it.name); __sp.position.set(0, 0.45, 0); m.add(__sp); };
    makeInteractable(m, { type: 'pickup', id: it.id, label: it.name });
  });
  let done = 0;
  seasons.forEach((s, i) => {
    const pad = box(1.8, 0.15, 1.8, 0xffffff);
    pad.position.set(-4.5 + i * 2.5, 0.1, -2);
    { const __sp = labelSprite(`${s.id} · ${s.trait}`); __sp.position.set(0, 0.5, 0); pad.add(__sp); };
    makeInteractable(pad, {
      type: 'dropzone',
      onUse: () => {
        if (!held) return failNudge('先拿物品');
        if (held.id !== s.item) return failNudge(`${s.id}要用${s.itemName}`);
        held = null; pad.userData.spent = true;
        pad.material.color.set(0x9be89b); done++; toast('✔️');
        if (done >= 4) completeMission();
      },
    });
  });
  setPill('🌦️ 把物品放到對應季節墊上');
}

function buildM8() {
  addFloor(14);
  S.background.set(0x5a6a80);
  // room with window
  const wall = box(8, 3, 0.3, 0xe8eef5); wall.position.set(0, 1.5, -4); worldRoot.add(wall);
  const windowGlass = box(2.2, 1.6, 0.08, 0x88ccee); windowGlass.position.set(0, 1.6, -3.8);
  windowGlass.material.transparent = true; windowGlass.material.opacity = 0.55;
  makeInteractable(windowGlass, { type: 'window', state: { closed: false, taped: false } });
  const plant = cyl(0.25, 0.7, 0x2f9e44); plant.position.set(2.2, 0.4, -2.5);
  { const __sp = labelSprite('盆栽'); __sp.position.set(0, 0.6, 0); plant.add(__sp); };
  makeInteractable(plant, { type: 'plant', outside: false });
  const tape = box(0.35, 0.15, 0.35, 0xffee88); tape.position.set(-2, 0.15, 1);
  { const __sp = labelSprite('膠紙'); __sp.position.set(0, 0.35, 0); tape.add(__sp); };
  makeInteractable(tape, { type: 'pickup', id: 'tape', label: '膠紙' });

  showBoard(`
    <h2>🌀 八號東北烈風或暴風信號</h2>
    <p>正確做法（可多選）：</p>
    <div class="row" id="acts"></div>
    <p>並在 3D 場景：關窗、用膠紙貼窗。勿把盆栽移出室外。</p>
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
    else failNudge(!listOk ? '選項：關窗+貼膠紙' : '先關窗並貼膠紙（E），盆栽留室內');
  };
}

function buildM9() {
  addFloor(16);
  S.background.set(0xb8d4ef);
  const elder = spawnPerson('elder', 0, -3, 0.95, Math.PI);
  worldRoot.add(elder); colliders.push({ x: 0, z: -3, r: 0.7 });
  makeInteractable(elder, { type: 'elder' });
  const gifts = [
    { id: 'coat', name: '禦寒衣物', color: 0x2f80ed },
    { id: 'drink', name: '熱飲', color: 0xeb5757 },
    { id: 'visit', name: '問候卡', color: 0xf2c94c },
  ];
  gifts.forEach((g, i) => {
    const m = box(0.45, 0.45, 0.45, g.color);
    m.position.set(-3 + i * 2, 0.25, 3);
    { const __sp = labelSprite(g.name); __sp.position.set(0, 0.4, 0); m.add(__sp); };
    makeInteractable(m, { type: 'pickup', id: g.id, label: g.name });
  });
  let given = 0;
  elder.userData.interact.onUse = () => {
    if (!held) return failNudge('先拿送暖物品');
    held = null; given++; toast('❤️');
    setPill(`送暖 ${given}/2`);
    if (given >= 2) {
      showBoard(`
        <h2>長者為何容易跌倒？</h2>
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
  setPill('🧣 拾取物品，送到長者處');
}

function buildM10() {
  addFloor(16, tileMap);
  S.background.set(0x6fa8dc);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(1.3, 32, 24), new THREE.MeshStandardMaterial({ color: 0x2d6a9f, roughness: 0.55 }));
  globe.position.set(0, 1.4, -2); globe.castShadow = true; worldRoot.add(globe);
  showBoard(`
    <h2>🌍 世界地圖缺塊</h2>
    <p>把正確名稱點到缺塊（答案來自作業）</p>
    <div class="slotrow" id="slots"></div>
    <div class="row" id="pieces"></div>
    <hr>
    <p>快問：海洋比陸地？大洲？大洋？最大洲／最小洲？最大洋／最小洋？</p>
    <div id="quiz"></div>
    <button class="go" id="chk">核對</button>`, true);
  const slots = F.earth.puzzleSlots;
  const answers = F.earth.puzzleAnswers;
  const placed = new Array(5).fill(null);
  let activePiece = null;
  const slotHost = $('boardHost').querySelector('#slots');
  slots.forEach((name, i) => {
    const el = document.createElement('div');
    el.className = 'slot';
    el.innerHTML = `<small>缺塊·${name}</small><b>—</b>`;
    el.onclick = () => {
      if (!activePiece) return;
      placed[i] = activePiece;
      el.classList.add('filled');
      el.querySelector('b').textContent = F.earth.puzzleOptions[activePiece];
      activePiece = null;
      $('boardHost').querySelectorAll('#pieces .chip').forEach((c) => c.classList.remove('sel'));
    };
    slotHost.appendChild(el);
  });
  const ph = $('boardHost').querySelector('#pieces');
  Object.entries(F.earth.puzzleOptions).forEach(([k, v]) => {
    const b = document.createElement('button'); b.className = 'chip piece'; b.textContent = `${k}. ${v}`;
    b.onclick = () => {
      activePiece = k;
      ph.querySelectorAll('.chip').forEach((c) => c.classList.remove('sel'));
      b.classList.add('sel');
    };
    ph.appendChild(b);
  });
  // quick facts
  const quiz = $('boardHost').querySelector('#quiz');
  const qState = {};
  const qItems = [
    { id: 'ol', q: '海洋覆蓋比陸地', opts: ['多', '少'], ans: '多' },
    { id: 'co', q: '大洲數目', opts: ['四', '七'], ans: '七' },
    { id: 'oc', q: '大洋數目', opts: ['四', '七'], ans: '四' },
    { id: 'lc', q: '最大大洲', opts: ['亞洲', '非洲'], ans: '亞洲' },
    { id: 'sc', q: '最小大洲', opts: ['南美洲', '大洋洲'], ans: '大洋洲' },
    { id: 'lo', q: '最大大洋', opts: ['印度洋', '太平洋'], ans: '太平洋' },
    { id: 'so', q: '最小大洋', opts: ['大西洋', '北冰洋'], ans: '北冰洋' },
  ];
  qItems.forEach((item) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<p style="margin:4px 0">${item.q}</p>`;
    const row = document.createElement('div'); row.className = 'row';
    item.opts.forEach((o) => {
      const b = document.createElement('button'); b.className = 'choice'; b.textContent = o;
      b.onclick = () => { qState[item.id] = o; row.querySelectorAll('.choice').forEach((c) => c.classList.remove('sel')); b.classList.add('sel'); };
      row.appendChild(b);
    });
    wrap.appendChild(row); quiz.appendChild(wrap);
  });
  $('boardHost').querySelector('#chk').onclick = () => {
    const puzzleOk = placed.every((p, i) => p === answers[i]);
    const quizOk = qItems.every((q) => qState[q.id] === q.ans);
    if (puzzleOk && quizOk) completeMission();
    else failNudge(!puzzleOk ? '缺塊應為 C,A,B,E,D' : '圈選答案再核對 p.27');
  };
}

function buildM11() {
  addFloor(18);
  S.background.set(0xf2d6a0);
  // desert zone left, polar right
  const sand = box(7, 0.08, 8, 0xe8c97a); sand.position.set(-4, 0.04, 0); worldRoot.add(sand);
  const ice = box(7, 0.08, 8, 0xe8f4ff); ice.position.set(4, 0.04, 0); worldRoot.add(ice);
  showBoard(`
    <h2>🏜️❄️ 衣食住行</h2>
    <p>沙漠：____ / ____ / ____　　極地：____ / ____ / ____</p>
    <div class="row" id="opts"></div>
    <p>已選：<span id="out"></span></p>
    <button class="go" id="chk">提交</button>`, true);
  const correct = ['沙漠', '長袍', '駱駝', '極地', '保暖', '捕魚'];
  const distractors = ['背心', '馬匹', '散熱', '耕種', '草原', '風扇'];
  const pool = [...correct, ...distractors].sort(() => Math.random() - 0.5);
  const picked = [];
  const opts = $('boardHost').querySelector('#opts');
  pool.forEach((w) => {
    const b = document.createElement('button'); b.className = 'chip'; b.textContent = w;
    b.onclick = () => {
      if (b.classList.contains('sel')) { b.classList.remove('sel'); picked.splice(picked.indexOf(w), 1); }
      else if (picked.length < 6) { b.classList.add('sel'); picked.push(w); }
      $('boardHost').querySelector('#out').textContent = picked.join('、');
    };
    opts.appendChild(b);
  });
  // also physical props
  [['長袍', -4, 0x2f80ed], ['駱駝', -5, 0xc4a574], ['皮毛衣', 4, 0x8d6e63], ['魚', 5, 0x56ccf2]].forEach(([name, x, col], i) => {
    const m = box(0.5, 0.5, 0.5, col); m.position.set(x, 0.3, 2.5);
    { const __sp = labelSprite(name); __sp.position.set(0, 0.4, 0); m.add(__sp); };
    makeInteractable(m, { type: 'flavor' });
  });
  $('boardHost').querySelector('#chk').onclick = () => {
    if (picked.length === 6 && correct.every((c) => picked.includes(c))) completeMission();
    else failNudge('沙漠：沙漠長袍駱駝；極地：極地保暖捕魚');
  };
}

function buildM12() {
  addFloor(16);
  S.background.set(0x6b7c8a);
  const desk = box(1.4, 0.75, 0.7, 0x8d6e63); desk.position.set(-2, 0.4, -1); worldRoot.add(desk); colliders.push({ x: -2, z: -1, r: 0.9 });
  makeInteractable(desk, { type: 'duck' });
  const elev = box(1.2, 2.4, 0.2, 0x999); elev.position.set(3, 1.2, -3);
  { const __sp = labelSprite('升降機 ❌'); __sp.position.set(0, 1.4, 0); elev.add(__sp); };
  worldRoot.add(elev); colliders.push({ x: 3, z: -3, r: 0.8 });
  const open = box(3, 0.05, 3, 0x9be89b); open.position.set(0, 0.04, 3);
  { const __sp = labelSprite('空曠安全處'); __sp.position.set(0, 0.3, 0); open.add(__sp); };
  makeInteractable(open, { type: 'safe' });
  let ducked = false, safed = false;
  desk.userData.interact.onUse = () => { ducked = true; toast('🪑'); setPill('已匿埋課桌下 · 再到空曠處'); };
  open.userData.interact.onUse = () => {
    if (!ducked) return failNudge('先匿埋');
    safed = true; toast('🏞️');
    showBoard(`
      <h2>🚨 防災知識</h2>
      <p>火山破壞（選2）：</p><div class="row" id="v"></div>
      <p>減低影響（選2）：</p><div class="row" id="r"></div>
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
  setPill('🚨 地震：匿埋 → 勿乘升降機 → 逃到空曠處');
}

// ---- interaction ----
function tryInteract() {
  const m = nearestInteractable();
  if (!m) return;
  const data = m.userData.interact;
  if (data.onUse) return data.onUse();
  if (data.type === 'pickup') {
    held = { id: data.id, label: data.label };
    m.visible = false; m.userData.spent = true;
    toast('✋'); setPill(`手持：${data.label}`);
    window.__m1UpdateHeld?.();
    return;
  }
  if (data.type === 'window') {
    if (!data.state.closed) { data.state.closed = true; m.material.color.set(0x445566); m.material.opacity = 0.9; toast('🪟'); setPill('已關窗'); return; }
    if (held?.id === 'tape' && !data.state.taped) {
      data.state.taped = true; held = null; toast('✖️'); setPill('已貼膠紙');
      const cross = box(0.08, 1.2, 0.08, 0xffee88); cross.position.copy(m.position); cross.position.z += 0.05; worldRoot.add(cross);
      const cross2 = box(1.2, 0.08, 0.08, 0xffee88); cross2.position.copy(m.position); cross2.position.z += 0.05; worldRoot.add(cross2);
      return;
    }
  }
  if (data.type === 'plant') {
    data.outside = !data.outside;
    m.position.z = data.outside ? 4 : -2.5;
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
  if (e.code === 'KeyE' || e.code === 'Space') tryInteract();
});

// ---- loop ----
const clock = new THREE.Clock();
function loop() {
  const dt = Math.min(0.05, clock.getDelta());
  if (running && !boardOpen) movePlayer(dt);
  else if (running && boardOpen) {
    // allow slight movement still for drop missions that need walk+board — m1/m7 keep board open
    const m = MISSIONS[missionIndex];
    if (['m1','m3','m7','m8','m9'].includes(m.id)) movePlayer(dt * 0.85);
  }
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
  const near = nearestInteractable();
  setAct(!!near && running);
  if (near && near.userData.interact) {
    const lab = near.userData.interact.label || near.userData.interact.type;
    if (!boardOpen || ['m1','m3','m7','m8','m9','m12'].includes(MISSIONS[missionIndex]?.id))
      setPrompt(lab ? `✋ ${lab}` : '✋ 互動');
  } else if (!boardOpen) setPrompt('');
  // gentle globe spin etc
  worldRoot.traverse((ch) => { if (ch.isMesh && ch.geometry?.type === 'SphereGeometry') ch.rotation.y += dt * 0.25; });
  R.render(S, C);
}
R.setAnimationLoop(loop);

// ---- boot ----
$('go').onclick = async () => {
  $('title').classList.add('hide');
  setPill('載入中…');
  await loadPeople();
  running = true;
  if (TOUCH) $('joy').style.display = 'block';
  $('act').style.display = 'block';
  startMission(0);
};
$('replay').onclick = () => location.reload();

// test hooks
window.__GAME = {
  CONTENT, MISSIONS, get state() {
    return { missionIndex, score, missionDone: [...missionDone], boardOpen, held, timeLeft: missionTimeLeft, running, player: { ...player } };
  },
  startMission, completeMission, tryInteract, showBoard, hideBoard,
  setHeld(id, label) { held = { id, label }; },
  jumpTo(i) { startMission(i); },
  autoSolveCurrent() {
    // used by playtest — complete with score
    completeMission();
  },
};

console.info('奇妙考察隊 ready', MISSIONS.length, 'missions');
