// iPad viewport + touch emulation (Chromium, not real hardware). Uses CDP touch events for joystick/look and taps for buttons.
import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const out = {};
for (const [name, vp] of [['ipad_land', { width: 1180, height: 820 }], ['ipad_port', { width: 820, height: 1180 }]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: devices['iPad Pro 11'].userAgent });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  const cdp = await ctx.newCDPSession(page);
  const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:8765/');
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 120000 });
  await page.tap('[data-testid="start"]'); await page.waitForTimeout(2500);
  const p0 = await page.evaluate(() => window.__GAME.state.player);
  const j = await page.locator('#joy').boundingBox();
  const jx = j.x + j.width / 2, jy = j.y + j.height / 2;
  await touch('touchStart', [{ x: jx, y: jy, id: 1 }]); await touch('touchMove', [{ x: jx, y: jy - 50, id: 1 }]); await page.waitForTimeout(1200); await touch('touchEnd', []);
  const p1 = await page.evaluate(() => window.__GAME.state.player);
  const lx = vp.width * 0.75, ly = vp.height * 0.3;
  await touch('touchStart', [{ x: lx, y: ly, id: 2 }]); for (let i = 1; i <= 6; i++) await touch('touchMove', [{ x: lx - i * 20, y: ly, id: 2 }]); await touch('touchEnd', []);
  const p2 = await page.evaluate(() => window.__GAME.state.player);
  await page.screenshot({ path: `previews/v3_${name}_m1.png` });
  await page.evaluate(() => { window.__BOSS.give(400); window.__BOSS.start(); }); await page.waitForTimeout(1500);
  await page.tap('[data-testid="shop"]'); await page.tap('[data-testid="buy-pistol"]'); await page.screenshot({ path: `previews/v3_${name}_shop.png` }); await page.tap('#shopClose'); console.log(name, 'pre-fire', JSON.stringify(await page.evaluate(() => window.__BOSS.s)));
  const a0 = await page.evaluate(() => window.__BOSS.s);
  for (let i = 0; i < 4; i++) { await page.tap('[data-testid="fire"]'); await page.waitForTimeout(450); }
  const a1 = await page.evaluate(() => window.__BOSS.s);
  await page.tap('[data-testid="reload"]'); await page.waitForTimeout(900); await page.tap('[data-testid="jump"]'); await page.waitForTimeout(150);
  const a2 = await page.evaluate(() => window.__BOSS.s);
  await page.tap('[data-testid="swap"]'); const a3 = await page.evaluate(() => window.__BOSS.s);
  // overlap check: weapon bar vs act button vs joystick
  const box = async (s) => page.locator(s).first().boundingBox();
  const bar = await box('#weap'), act = await box('#act'), joy = await box('#joy');
  const ov = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  await page.screenshot({ path: `previews/v3_${name}_boss.png` });
  out[name] = { errs, moved: +(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toFixed(2), yawChange: +(p2.yaw - p1.yaw).toFixed(2), ammoAfterTapFire: [a0.inv[a0.gun].mag, a1.inv[a1.gun].mag], afterReload: a2.inv[a2.gun].mag, jumpH: a2.jumpH, swappedTo: a3.gun, overlap: { barAct: ov(bar, act), barJoy: ov(bar, joy) } };
  const result = out[name];
  assert.deepEqual(errs, [], name + ': no page errors');
  assert.ok(result.moved > 0.5, name + ': joystick moves');
  assert.ok(Math.abs(result.yawChange) > 0.1, name + ': touch look turns');
  assert.ok(result.ammoAfterTapFire[1] < result.ammoAfterTapFire[0], name + ': touch shoots');
  assert.ok(result.afterReload > result.ammoAfterTapFire[1], name + ': reload works');
  assert.ok(result.jumpH > 0, name + ': jump works');
  assert.notEqual(a0.gun, result.swappedTo, name + ': swap works');
  assert.equal(result.overlap.barAct, false, name + ': HUD clear of interact');
  assert.equal(result.overlap.barJoy, false, name + ': HUD clear of joystick');
  await ctx.close();
}
console.log("RESULT " + JSON.stringify(out));
await browser.close();
