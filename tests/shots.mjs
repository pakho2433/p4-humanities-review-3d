import { chromium } from 'playwright';
const only = process.argv[2] ? process.argv[2].split(',').map(Number) : [...Array(12).keys()];
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
await page.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 90000 });
await page.waitForTimeout(2500);
if (!process.argv[3]) await page.screenshot({ path: 'previews/v2_title.png' });
await page.click('[data-testid="start"]');
await page.waitForFunction(() => window.__GAME?.state?.running);
for (const i of only) {
  await page.evaluate((i) => window.__GAME.jumpTo(i), i);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `previews/v2_m${i + 1}.png` });
}
console.log(errs.slice(0, 20).join('\n'));
await browser.close();
