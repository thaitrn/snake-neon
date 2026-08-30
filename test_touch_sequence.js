// Verify portrait tap steering through a VALID play sequence (no reversals).
// Simulates how a real player turns clockwise: RIGHT→DOWN→LEFT→UP→RIGHT.
const puppeteer = require('puppeteer');
const path = require('path');
const FILE = 'file://' + path.resolve(__dirname, 'index.html');
const VW = 390, VH = 844;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-web-security'] });
  const page = await browser.newPage();
  await page.setViewport({ width: VW, height: VH, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await page.goto(FILE, { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('canvas').length > 0, { timeout: 15000 });
  await sleep(500);

  const getRect = async () => page.evaluate(() => {
    const r = document.querySelector('canvas').getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const dirName = (x, y) => (x === 0 && y === -1) ? 'UP' : (x === 0 && y === 1) ? 'DOWN' : (x === -1 && y === 0) ? 'LEFT' : (x === 1 && y === 0) ? 'RIGHT' : '?';

  async function tapAt(tx, ty) {
    await page.touchscreen.touchStart(tx, ty);
    await sleep(15);
    const n = await page.evaluate(() => {
      const q = snake.dirQueue;
      const d = q.length > 0 ? q[q.length - 1] : snake.direction;
      return { x: d.x, y: d.y };
    });
    await page.touchscreen.touchEnd();
    await sleep(30);
    return n;
  }

  let results = [];
  for (let round = 0; round < 2; round++) {
    const rect = await getRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const off = Math.min(rect.width, rect.height) * 0.3;

    // Start game
    await page.touchscreen.touchStart(cx, cy);
    await sleep(40);
    await page.touchscreen.touchEnd();
    await sleep(400);

    // Snake starts RIGHT. Valid clockwise turns.
    const seq = [
      ['DOWN',  cx,        cy + off, 'DOWN'],
      ['LEFT',  cx - off,  cy,       'LEFT'],
      ['UP',    cx,        cy - off, 'UP'],
      ['RIGHT', cx + off,  cy,       'RIGHT'],
    ];
    console.log('=== Round ' + (round + 1) + ' ===');
    for (const [label, tx, ty, expected] of seq) {
      const d = await tapAt(tx, ty);
      const got = dirName(d.x, d.y);
      const ok = got === expected;
      results.push(ok);
      console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + ': expected ' + expected + ' got ' + got);
    }
    // Go back to menu for round 2
    await page.evaluate(() => { currentState = STATES.MENU; });
    await sleep(200);
  }

  await browser.close();
  const p = results.filter(Boolean).length;
  console.log('\n' + p + '/' + results.length + ' taps passed');
  process.exit(p === results.length ? 0 : 1);
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
