// Full new-game playthrough with real input (keyboard/mouse/clicks). __GAME/__BOSS read only for navigation.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
const T0 = Date.now(); const log = (...a) => console.log(((Date.now() - T0) / 1000).toFixed(0) + 's', ...a);
await page.goto('http://127.0.0.1:8765/');
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 120000 });
await page.screenshot({ path: 'previews/v3_title.png' });
await page.click('[data-testid="start"]');
const START = +(process.env.START || 0);
if (START) { await page.waitForTimeout(1500); await page.evaluate((i) => window.__GAME.jumpTo(i), START); } // debug-only segment start
const st = () => page.evaluate(() => window.__GAME.state);
const bs = () => page.evaluate(() => window.__BOSS.s);
const targets = () => page.evaluate(() => window.__GAME.targets);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `previews/v3_${n}.png` });
async function waitMission(i) { await page.waitForFunction((i) => window.__GAME.state.missionIndex === i, i, { timeout: 60000 }); await wait(700); }
async function look(dyaw, dpitch = 0) {
  await page.mouse.move(512, 240); await page.mouse.down({ button: 'right' });
  const px = -dyaw / 0.0025, py = -dpitch / 0.0022, n = Math.max(2, Math.ceil(Math.max(Math.abs(px), Math.abs(py)) / 40));
  for (let s = 1; s <= n; s++) await page.mouse.move(512 + (px * s) / n, 240 + (py * s) / n);
  await page.mouse.up({ button: 'right' });
}
async function turnTo(x, z, y = null) {
  for (let k = 0; k < 4; k++) {
    const p = (await st()).player;
    const want = Math.atan2(-(x - p.x), -(z - p.z));
    let d = want - p.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const wp = y === null ? 0 : Math.atan2(y - p.y, Math.hypot(x - p.x, z - p.z));
    if (Math.abs(d) < 0.04 && Math.abs(wp - p.pitch) < 0.05) return;
    await look(d, wp - p.pitch);
  }
}
async function walkTo(x, z, stop = 1.0) {
  for (let k = 0; k < 40; k++) {
    await turnTo(x, z);
    const p = (await st()).player; const dist = Math.hypot(x - p.x, z - p.z);
    if (dist <= stop + 0.15) return;
    const before = p;
    await page.keyboard.down('KeyW'); await wait(Math.max(200, Math.min(1400, ((dist - stop) / 4.2) * 1500))); await page.keyboard.up('KeyW');
    const q = (await st()).player;
    if (Math.hypot(q.x - before.x, q.z - before.z) < 0.05) { await page.keyboard.down(k % 2 ? 'KeyA' : 'KeyD'); await wait(400); await page.keyboard.up(k % 2 ? 'KeyA' : 'KeyD'); }
  }
}
async function interact(x, z, stop = 0.7) { await walkTo(x, z, stop); await turnTo(x, z); await page.keyboard.press('KeyE'); await wait(300); }
async function pick(id) { const t = (await targets()).find((t) => t.type === 'pickup' && (t.id === id || (id === 'flat' && t.id.startsWith('flat')))); if (!t) throw new Error('no item ' + id + JSON.stringify(await targets()) + JSON.stringify(await st())); await interact(t.x, t.z); }
async function solveCarry(maxRounds = 12) {
  for (let r = 0; r < maxRounds; r++) {
    const pads = (await targets()).filter((t) => t.type === 'dropzone' && t.want && t.want !== 'no');
    if (!pads.length) return;
    const pd = pads[0]; log('carry', pd.want, pd.label, JSON.stringify((await st()).player)); await pick(pd.want); await interact(pd.x, pd.z); await wait(300);
  }
}
let wrongTried = false;
async function tryWrong() { // deliberately place a wrong item once to test feedback
  const ts = await targets(); const pads = ts.filter((t) => t.type === 'dropzone' && t.want && t.want !== 'no' && t.want !== 'flat');
  if (pads.length < 2) return; const other = pads[1].want; await pick(other); await interact(pads[0].x, pads[0].z);
  log('wrong-placement feedback:', await page.textContent('#missionPill')); wrongTried = true;
}
async function fightSlimes(tag) {
  await wait(500); let n = 0;
  for (let k = 0; k < 400; k++) {
    const sl = await page.evaluate(() => window.__BOSS.slimes); if (!sl.length) break;
    const p = (await st()).player; sl.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    await turnTo(sl[0].x, sl[0].z, 0.5);
    await page.mouse.move(512, 320); await page.mouse.down(); await wait(140); await page.mouse.up(); n++;
    if (k === 3 && tag) await shot(tag);
    const s = await bs(); const g = s.inv[s.gun]; if (g.mag === 0) { await page.keyboard.press(g.res > 0 ? 'KeyR' : 'KeyQ'); await wait(900); }
  }
  log('slimes cleared clicks', n, JSON.stringify(await bs()));
}
async function shop(buys) {
  await page.click('[data-testid="shop"]'); await wait(200);
  for (const b of buys) { const before = (await bs()).money; await page.click(`[data-testid="buy-${b}"]`); await wait(150); log('buy', b, before, '->', (await bs()).money); }
  await page.click('#shopClose');
}
async function quizOk() { const rows = page.locator('#qq .qi'); const n = await rows.count(); await rows.nth(0).locator('.choice:not([data-ok])').first().click(); await page.click('#chk'); log('wrong quiz:', await page.textContent('#missionPill')); for (let i = 0; i < n; i++) await rows.nth(i).locator('.choice[data-ok]').click(); await page.click('#chk'); }
const F = await page.evaluate(() => window.__GAME.CONTENT.facts);
// M1
if (START <= 0) {
await waitMission(0); log('M1');
for (let i = 0; i < F.mapMatch.length; i++) { await pick(F.mapMatch[i].answer); await page.locator('#needs .slot').nth(i).click(); await wait(200); }
await shot('m1');
// M2
}
if (START <= 1) {
await waitMission(1); log('M2');
for (let k = 0; k < 8; k++) { const tt = (await targets()).find((t) => t.type === 'collect'); if (!tt) break; await interact(tt.x, tt.z, 0.8); }
{ const w = (await targets()).find((t) => t.type === 'gate' && t.want === 'no'); await interact(w.x, w.z); log('wrong gate:', await page.textContent('#missionPill')); }
for (let k = 0; k < 2; k++) { const g = (await targets()).find((t) => t.type === 'gate' && t.want === 'ok'); await interact(g.x, g.z, 0.6); await wait(400); }
await shot('m2_gates');
await fightSlimes('fight_m2');
// M3
}
if (START <= 2) {
await waitMission(2); log('M3', JSON.stringify(await bs()));
await shop(['pistol']);
for (const [i, id] of ['title', 'legend', 'north', 'route'].entries()) { await pick(id); await page.locator('#steps .slot').nth(i).click(); await wait(200); }
// M4
}
if (START <= 3) {
await waitMission(3); log('M4');
await solveCarry(); await shot('m4'); await quizOk();
// M5
}
if (START <= 4) {
await waitMission(4); log('M5');
await tryWrong(); await solveCarry(); await wait(500); await shot('m5'); await solveCarry();
await fightSlimes('fight_m5');
// M6
}
if (START <= 5) {
await waitMission(5); log('M6', JSON.stringify(await bs()));
await shop(['pistol']);
await solveCarry(); await shot('m6'); await wait(400); await solveCarry();
// M7
}
if (START <= 6) {
await waitMission(6); log('M7');
for (const s of F.seasons) { await pick(s.item); const p = (await targets()).find((t) => t.type === 'dropzone' && t.label === `${s.id}季`); await interact(p.x, p.z); }
// M8
}
if (START <= 7) {
await waitMission(7); log('M8');
await pick('tape'); await walkTo(0.2, -1.2, 0.3);
for (let k = 0; k < 2; k++) { const w = (await targets()).find((t) => t.type === 'window'); await interact(w.x, w.z, 1.2); }
await shot('m8');
await page.locator('#acts .choice', { hasText: '關好窗戶' }).click(); await page.locator('#acts .choice', { hasText: '在玻璃窗貼上膠紙' }).click(); await page.click('#chk');
await fightSlimes('fight_m8');
// M9
}
if (START <= 8) {
await waitMission(8); log('M9', JSON.stringify(await bs()));
await shop(['solar', 'rifle']);
for (const id of ['coat', 'drink']) { await pick(id); const e = (await targets()).find((t) => t.type === 'elder'); await interact(e.x, e.z, 1.5); }
await page.locator('#why .choice', { hasText: '血壓變高' }).click(); await page.locator('#why .choice', { hasText: '肌肉和關節' }).click(); await page.click('#chk');
// M10
}
if (START <= 9) {
await waitMission(9); log('M10');
await solveCarry(); await shot('m10'); await quizOk();
await page.keyboard.press('Digit1');
await fightSlimes('fight_m10');
// M11
}
if (START <= 10) {
await waitMission(10); log('M11');
await tryWrong(); await solveCarry(); await shot('m11');
// M12
}
if (START <= 11) {
await waitMission(11); log('M12');
{ const l = (await targets()).find((t) => t.type === 'lift'); await interact(l.x, l.z, 1.4); log('lift:', await page.textContent('#missionPill')); }
await walkTo(-2, 0.6, 0.2); { const d = (await targets()).find((t) => t.type === 'duck'); await interact(d.x, d.z, 1.4); }
await wait(1700); { const d = (await targets()).find((t) => t.type === 'safe'); await interact(d.x, d.z); }
for (const w of F.disaster.volcano) await page.locator('#v .choice', { hasText: w }).click();
for (const w of F.disaster.reduce) await page.locator('#r .choice', { hasText: w }).click();
await page.click('#chk');
}
// BOSS
await page.waitForFunction(() => window.__BOSS.s.bossOn, null, { timeout: 30000 }); await wait(800);
log('BOSS', JSON.stringify(await bs()), 'stats', await page.textContent('#stats'));
await shop(['pistol', 'rifle', 'solar']);
await shot('boss_start');
// lose on purpose: walk into the boss
{ for (let k = 0; k < 30; k++) { const b = await page.evaluate(() => window.__BOSS.boss); await turnTo(b.x, b.z); await page.keyboard.down('KeyW'); await wait(500); await page.keyboard.up('KeyW'); if ((await bs()).pHp <= 0) break; } }
await page.waitForSelector('[data-testid="retry"]', { timeout: 30000 }); await shot('boss_lose'); log('lost', JSON.stringify(await bs()));
await page.click('[data-testid="retry"]'); await wait(800);
// win
let jumped = false, lastPh = 1;
for (let k = 0; k < 1500; k++) {
  const s = await bs(); if (!s.bossOn) break;
  const b = await page.evaluate(() => window.__BOSS.boss); if (!b) break;
  const sl = await page.evaluate(() => window.__BOSS.slimes);
  const p = (await st()).player;
  const tgt = sl.length && Math.hypot(sl[0].x - p.x, sl[0].z - p.z) < 6 ? { x: sl[0].x, z: sl[0].z, y: 0.5 } : { x: b.x, z: b.z, y: 2.3 };
  await turnTo(tgt.x, tgt.z, tgt.y);
  await page.mouse.move(512, 320); await page.mouse.down(); await wait(150); await page.mouse.up();
  if (k % 5 === 0) { await page.keyboard.press('Space'); jumped ||= (await bs()).jumpH > 0; }
  if (k % 9 === 0) { await page.keyboard.down('KeyA'); await wait(250); await page.keyboard.up('KeyA'); }
  const g = s.inv[s.gun]; if (g.mag === 0) await page.keyboard.press(g.res > 0 ? 'KeyR' : 'KeyQ');
  const ph = b.phase; if (ph !== lastPh) { lastPh = ph; await shot('boss_phase' + ph); log('phase', ph, JSON.stringify(s)); }
  if (s.pHp <= 0 || await page.locator('[data-testid="retry"]').count()) { log('died, retry', JSON.stringify(s)); await page.click('[data-testid="retry"]'); await wait(600); }
}
log('jumped', jumped);
await page.waitForSelector('#end:not(.hide)', { timeout: 30000 }); await wait(800); await shot('win');
const final = await st();
console.log(JSON.stringify({ errors, wrongTried, boss: await bs(), done: final.missionDone.filter(Boolean).length, end: await page.textContent('#end'), wallSec: (Date.now() - T0) / 1000 }));
await browser.close();
