import { chromium, devices } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765/';
mkdirSync('previews', { recursive: true });

async function runViewport(name, opts) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...opts,
    locale: 'zh-HK',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('console:' + msg.text());
  });

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('[data-testid="start"]');
  await page.screenshot({ path: `previews/${name}-title.png` });
  await page.click('[data-testid="start"]');
  await page.waitForFunction(() => window.__GAME?.state?.running === true, null, { timeout: 30000 });

  // Complete all 12 missions via test hook (verifies no crash / progression)
  for (let i = 0; i < 12; i++) {
    await page.waitForFunction(
      (idx) => window.__GAME?.state?.missionIndex === idx && window.__GAME?.state?.running,
      i,
      { timeout: 15000 }
    );
    await page.screenshot({ path: `previews/${name}-m${i + 1}.png` });
    // real input sample on first mission: WASD + click
    if (i === 0) {
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(400);
      await page.keyboard.up('KeyW');
      await page.keyboard.press('KeyE');
    }
    await page.evaluate(() => window.__GAME.completeMission());
    await page.waitForTimeout(1000);
  }

  await page.waitForSelector('[data-testid="end"]:not(.hide)', { timeout: 15000 });
  await page.screenshot({ path: `previews/${name}-end.png` });
  const state = await page.evaluate(() => window.__GAME.state);
  await browser.close();
  return { name, errors, state };
}

const results = [];
results.push(await runViewport('desktop', { viewport: { width: 1280, height: 800 } }));
results.push(await runViewport('ipad', {
  ...devices['iPad Pro 11'],
  viewport: { width: 834, height: 1194 },
  hasTouch: true,
  isMobile: true,
}));

console.log(JSON.stringify(results, null, 2));
const failed = results.some((r) => r.errors.length || r.state.missionDone.filter(Boolean).length < 12);
writeFileSync('previews/playtest-report.json', JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);
