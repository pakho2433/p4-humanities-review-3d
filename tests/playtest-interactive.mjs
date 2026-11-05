import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:8765/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.click('[data-testid="start"]');
await page.waitForFunction(() => window.__GAME?.state?.running);

async function waitMission(i) {
  await page.waitForFunction((idx) => window.__GAME.state.missionIndex === idx, i, { timeout: 20000 });
}

// M1: pickup via hook then click slots in order A D B answers for needs
await waitMission(0);
await page.evaluate(() => {
  // simulate holding correct maps in sequence via clicks on slots after setHeld
  const slots = [...document.querySelectorAll('#needs .slot')];
  const answers = window.__GAME.CONTENT.facts.mapMatch.map(m => m.answer);
  answers.forEach((ans, i) => {
    window.__GAME.setHeld(ans, ans);
    slots[i].click();
  });
});
await page.waitForFunction(() => window.__GAME.state.missionIndex === 1, null, { timeout: 10000 });

// M4 terrain quiz
await page.evaluate(() => window.__GAME.jumpTo(3));
await waitMission(3);
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#q .row')];
  const clicks = [['多'], ['較少'], ['較分散'], ['新界北部', '新界西北部', '九龍']];
  rows.forEach((row, i) => {
    [...row.querySelectorAll('.choice')].forEach((b) => {
      if (clicks[i].includes(b.textContent)) b.click();
    });
  });
  document.querySelector('#chk').click();
});
await page.waitForFunction(() => window.__GAME.state.missionIndex === 4, null, { timeout: 10000 });

// M10 puzzle C,A,B,E,D + quiz
await page.evaluate(() => window.__GAME.jumpTo(9));
await waitMission(9);
await page.evaluate(() => {
  const answers = ['C','A','B','E','D'];
  const pieces = [...document.querySelectorAll('#pieces .chip')];
  const slots = [...document.querySelectorAll('#slots .slot')];
  answers.forEach((a, i) => {
    pieces.find(p => p.textContent.startsWith(a + '.')).click();
    slots[i].click();
  });
  const quizAns = { ol:'多', co:'七', oc:'四', lc:'亞洲', sc:'大洋洲', lo:'太平洋', so:'北冰洋' };
  // click matching choices in quiz section
  const wraps = [...document.querySelectorAll('#quiz > div')];
  const order = ['多','七','四','亞洲','大洋洲','太平洋','北冰洋'];
  wraps.forEach((w, i) => {
    [...w.querySelectorAll('.choice')].find(c => c.textContent === order[i])?.click();
  });
  document.querySelector('#chk').click();
});
await page.waitForFunction(() => window.__GAME.state.missionIndex === 10, null, { timeout: 10000 });

await page.screenshot({ path: 'previews/interactive-ok.png' });
console.log(JSON.stringify({ errors, state: await page.evaluate(() => window.__GAME.state) }, null, 2));
await browser.close();
if (errors.length) process.exit(1);
