// Real playthrough: keyboard movement, mouse-drag looking, E to interact, real clicks on board UI.
// Reads __GAME.state / __GAME.targets for navigation only (no completion hooks).
import { chromium } from 'playwright';
const URL = process.argv[2] || 'http://127.0.0.1:8765/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
await page.goto(URL);
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 120000 });
await page.click('[data-testid="start"]');
await page.waitForFunction(() => window.__GAME.state.running);
const START = +(process.env.START || 0);
const st = () => page.evaluate(() => window.__GAME.state);
const targets = () => page.evaluate(() => window.__GAME.targets);
const wait = (ms) => page.waitForTimeout(ms);
async function waitMission(i) { await page.waitForFunction((i) => window.__GAME.state.missionIndex === i, i, { timeout: 30000 }); await wait(600); }

async function turnTo(x, z) {
  for (let k = 0; k < 4; k++) {
    const p = (await st()).player;
    const want = Math.atan2(-(x - p.x), -(z - p.z));
    let d = want - p.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    if (Math.abs(d) < 0.06) return;
    const px = -d / 0.0025;
    await page.mouse.move(640, 250); await page.mouse.down();
    const steps = Math.max(2, Math.ceil(Math.abs(px) / 40));
    for (let s = 1; s <= steps; s++) await page.mouse.move(640 + (px * s) / steps, 250);
    await page.mouse.up(); await page.mouse.move(640, 250);
  }
}
async function walkTo(x, z, stop = 1.0) {
  for (let k = 0; k < 40; k++) {
    await turnTo(x, z);
    const p = (await st()).player;
    const dist = Math.hypot(x - p.x, z - p.z);
    if (dist <= stop + 0.15) return;
    const ms = Math.min(1500, ((dist - stop) / 4.2) * 1000 * 1.6);
    await page.keyboard.down('KeyW'); await wait(Math.max(250, ms)); await page.keyboard.up('KeyW');
    await wait(80);
  }
}
async function interact(x, z, stop = 1.0) {
  await walkTo(x, z, stop); await turnTo(x, z);
  await page.keyboard.press('KeyE'); await wait(350);
}
async function pickTok(id) { const t = (await targets()).find((t) => t.id === id && t.type === 'pickup'); await interact(t.x, t.z); }
async function useType(type, label) { const t = (await targets()).find((t) => t.type === type && (!label || t.label === label)); await interact(t.x, t.z); }
const clickText = async (sel, text) => page.locator(sel, { hasText: text }).first().click();
const shots = [];
async function shot(n) { const f = `previews/v2b_play_${n}.png`; await page.screenshot({ path: f }); shots.push(f); }

// M1
await waitMission(0); log('M1');
const C = await page.evaluate(() => window.__GAME.CONTENT.facts.mapMatch);
for (let i = 0; i < C.length; i++) { await pickTok(C[i].answer); await page.locator('#needs .slot').nth(i).click(); await wait(200); }
await shot('m1');
// M2
await waitMission(1); log('M2');
for (let k = 0; k < 8; k++) { const tt = (await targets())[0]; if (!tt || tt.type !== 'collect') break; await interact(tt.x, tt.z, 0.8); }
await shot('m2');
await clickText('#dirs .choice', '南'); await clickText('#dirs .choice', '西');
// M3
await waitMission(2); log('M3');
for (const [i, id] of ['title', 'legend', 'north', 'route'].entries()) { await pickTok(id); await page.locator('#steps .slot').nth(i).click(); await wait(200); }
// M4
await waitMission(3); log('M4');
const rows4 = page.locator('#q .row');
await rows4.nth(0).locator('.choice', { hasText: /^多$/ }).click();
await rows4.nth(1).locator('.choice', { hasText: '較少' }).click();
await rows4.nth(2).locator('.choice', { hasText: '較分散' }).click();
for (const w of ['新界北部', '新界西北部', '九龍']) await rows4.nth(3).locator('.choice', { hasText: new RegExp('^' + w + '$') }).click();
await page.click('#chk');
// M5
await waitMission(4); log('M5');
const years = await page.evaluate(() => window.__GAME.CONTENT.facts.airport.timeline.map((t) => t.y));
await pickTok('dolphin'); await useType('dropzone');
await shot('m5');
for (const y of years) await page.locator('#tl .choice', { hasText: y }).first().click();
// M6
await waitMission(5); log('M6');
const F6 = await page.evaluate(() => window.__GAME.CONTENT.facts);
const whoLab = { A: '輪候公屋居民', B: '商界代表', C: '環保人士' };
for (let i = 0; i < F6.stakeholders.length; i++) await page.locator('#stk .row').nth(i).locator('.choice', { hasText: whoLab[F6.stakeholders[i].who] }).click();
for (const w of F6.northernFill) await page.locator('#fills .chip', { hasText: new RegExp('^' + w + '$') }).click();
await page.click('#chk');
// M7
await waitMission(6); log('M7');
for (const s of F6.seasons) { await pickTok(s.item); await useType('dropzone', `${s.id}季`); }
// M8
await waitMission(7); log('M8');
await pickTok('tape');
await walkTo(0.2, -1.2, 0.3);
await useType('window'); await useType('window');
await shot('m8');
await clickText('#acts .choice', '關好窗戶'); await clickText('#acts .choice', '在玻璃窗貼上膠紙');
await page.click('#chk');
// M9
await waitMission(8); log('M9');
for (const id of ['coat', 'drink']) { await pickTok(id); log('held', JSON.stringify((await st()).held)); const e = (await targets()).find((t) => t.type === 'elder'); await interact(e.x, e.z, 1.5); log('pill', await page.textContent('#missionPill'), JSON.stringify((await st()).player)); }
await shot('m9');
await clickText('#why .choice', '血壓變高'); await clickText('#why .choice', '肌肉和關節'); await page.click('#chk');
// M10
await waitMission(9); log('M10');
const E = F6.earth;
for (let i = 0; i < 5; i++) { await page.locator('#pieces .chip', { hasText: E.puzzleAnswers[i] + '.' }).click(); await page.locator('#slots .slot').nth(i).click(); }
const qa = ['多', '七', '四', '亞洲', '大洋洲', '太平洋', '北冰洋'];
for (let i = 0; i < qa.length; i++) await page.locator('#quiz .qi').nth(i).locator('.choice', { hasText: new RegExp('^' + qa[i] + '$') }).click();
await page.click('#chk');
// M11
await waitMission(10); log('M11');
for (const w of ['沙漠', '長袍', '駱駝', '極地', '保暖', '捕魚']) await page.locator('#opts .chip', { hasText: new RegExp('^' + w + '$') }).click();
await page.click('#chk');
// M12
await waitMission(11); log('M12');
await walkTo(-2, 0.6, 0.2); await useType('duck');
await wait(1700);
await useType('safe');
await shot('m12');
for (const w of F6.disaster.volcano) await clickText('#v .choice', w);
for (const w of F6.disaster.reduce) await clickText('#r .choice', w);
await page.click('#chk');
await page.waitForSelector('#end:not(.hide)', { timeout: 15000 });
await wait(800); await shot('end');
const final = await st();
console.log(JSON.stringify({ errors, score: final.score, done: final.missionDone.filter(Boolean).length, endText: await page.textContent('#end') }, null, 1));
await browser.close();
process.exit(errors.length || final.missionDone.filter(Boolean).length !== 12 ? 1 : 0);
