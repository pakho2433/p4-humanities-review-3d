import { chromium, devices } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [name, vp] of [['ipad_land', { width: 1180, height: 820 }], ['ipad_port', { width: 820, height: 1180 }]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['iPad Pro 11'].userAgent });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('http://127.0.0.1:8765/');
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `previews/v2_${name}_title.png` });
  await page.tap('[data-testid="start"]');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `previews/v2_${name}_m1.png` });
  await page.evaluate(() => window.__GAME.jumpTo(1)); await page.waitForTimeout(3000);
  await page.screenshot({ path: `previews/v2_${name}_m2.png` });
  console.log(name, JSON.stringify(await page.evaluate(() => window.__GAME.quality)), errs);
  await ctx.close();
}
await browser.close();
