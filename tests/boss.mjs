import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs=[]; p.on('pageerror', e => errs.push(String(e)));
await p.goto('http://127.0.0.1:8765/'); await p.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 120000 });
await p.click('[data-testid=start]'); await p.waitForTimeout(1500);
await p.evaluate(() => { __BOSS.give(200); __BOSS.start(); });
await p.waitForTimeout(800);
await p.click('[data-testid=shop]'); await p.click('[data-testid=buy-solar]'); await p.click('[data-testid=buy-solar]'); await p.click('#shopClose');
console.log('after shop', JSON.stringify((await p.evaluate(() => __BOSS.s))));
for (let i = 0; i < 80; i++) { await p.mouse.move(640, 400); await p.mouse.down(); await p.waitForTimeout(120); await p.mouse.up(); if (i % 7 == 6) await p.keyboard.press('KeyR'); const s = await p.evaluate(() => __BOSS.s); if (!s.bossOn) break; }
await p.screenshot({ path: 'previews/v3_boss.png' });
console.log('end', JSON.stringify(await p.evaluate(() => __BOSS.s)), errs);
await b.close();
