// Focused state regressions; instrumentation is test-only, not a player playthrough.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
 const page = await browser.newPage({ viewport: { width: 820, height: 640 } });
 const errors = []; page.on('pageerror', e => errors.push(String(e)));
 await page.route('**/js/game.js', async route => {
  const response = await route.fetch();
  await route.fulfill({ response, body: (await response.text()) + `\nwindow.__QA = {
   hurt, spawnSlimes, startBoss, winBoss,
   stale() { rings.push({ r: new THREE.Group(), rad: 5, hit: false }); jumpH = 0.5; jumpV = 2; reloadT = 0.8; fireCd = 0.7; mouseFire = true; },
   get state() { return { pHp, rings: rings.length, jumpH, jumpV, reloadT, fireCd, mouseFire, slimes: slimes.length }; }
  };` });
 });
 await page.goto(process.env.BASE_URL || 'http://127.0.0.1:8765/');
 await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 120000 });
 await page.click('[data-testid="start"]');
 await page.evaluate(() => { window.__QA.startBoss(); window.__QA.hurt(0.25); });
 assert.equal((await page.evaluate(() => window.__QA.state)).pHp, 99.75, 'fractional damage accumulates');
 await page.evaluate(() => { window.__QA.stale(); window.__QA.startBoss(); });
 let s = await page.evaluate(() => window.__QA.state);
 assert.equal(s.rings, 0); assert.equal(s.jumpH, 0); assert.equal(s.jumpV, 0); assert.ok(s.reloadT <= 0); assert.ok(s.fireCd <= 0); assert.equal(s.mouseFire, false);
 await page.evaluate(() => window.__QA.spawnSlimes(2, null));
 await page.click('[data-testid="shop"]');
 const before = await page.evaluate(() => ({ state: window.__QA.state, slimes: window.__BOSS.slimes }));
 await page.waitForTimeout(1700);
 const after = await page.evaluate(() => ({ state: window.__QA.state, slimes: window.__BOSS.slimes }));
 assert.deepEqual(after, before, 'shop pauses slime attacks and motion');
 await page.click('#shopClose');
 await page.evaluate(() => window.__QA.winBoss());
 assert.equal((await page.evaluate(() => window.__QA.state)).slimes, 0, 'victory clears remaining enemies');
 assert.deepEqual(errors, []);
 console.log('PASS fractional damage, retry cleanup, shop enemy pause, victory cleanup; page errors: 0');
} finally { await browser.close(); }
