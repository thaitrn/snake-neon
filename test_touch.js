// Verify portrait-mode TAP = instant direction change (task t_0b1dc64b).
// Game globals are top-level `let` in a <script> — accessible by bare
// identifier in page.evaluate, but NOT via window.* property access.
const puppeteer = require('puppeteer');
const path = require('path');
const FILE = 'file://' + path.resolve(__dirname, 'index.html');
const VW = 390, VH = 844;  // iPhone 12 portrait
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-web-security'] });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERR:', e.message));
  await page.setViewport({ width: VW, height: VH, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await page.goto(FILE, { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('canvas').length > 0, { timeout: 15000 });
  await sleep(500);

  const rect = await page.evaluate(() => {
    const r = document.querySelector('canvas').getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const off = Math.min(rect.width, rect.height) * 0.3;
  console.log('canvas:', JSON.stringify(rect));

  const getDir = () => page.evaluate(() => {
    const d = snake.direction;
    const q = snake.dirQueue;
    const n = q.length > 0 ? q[q.length - 1] : snake.direction;
    return { dx: d.x, dy: d.y, ndx: n.x, ndy: n.y };
  });
  const getState = () => page.evaluate(() => currentState);
  const dirName = (x, y) => (x === 0 && y === -1) ? 'UP' : (x === 0 && y === 1) ? 'DOWN' : (x === -1 && y === 0) ? 'LEFT' : (x === 1 && y === 0) ? 'RIGHT' : '?';

  // Start: tap center on MENU → PLAYING
  console.log('state before start:', await getState());
  await page.touchscreen.touchStart(cx, cy);
  await sleep(40);
  await page.touchscreen.touchEnd();
  await sleep(400);
  console.log('state after start tap:', await getState());

  async function tapZone(label, tx, ty, expected) {
    const t0 = Date.now();
    // Touch START only — the fix resolves direction on touchstart (instant),
    // so nextDirection should change before touchEnd even fires.
    await page.touchscreen.touchStart(tx, ty);
    await sleep(20);
    const afterStart = await getDir();
    await page.touchscreen.touchEnd();
    await sleep(40);
    const elapsed = Date.now() - t0;
    // nextDirection is the authoritative input signal
    const got = dirName(afterStart.ndx, afterStart.ndy);
    const ok = got === expected;
    console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + ': expected ' + expected + ' got ' + got + ' (' + elapsed + 'ms)');
    return ok;
  }

  // Snake starts moving RIGHT. UP/DOWN/LEFT are all valid (not reverse).
  let r = [];
  r.push(await tapZone('UP',    cx,      cy - off, 'UP'));
  r.push(await tapZone('RIGHT', cx + off, cy,      'RIGHT'));
  r.push(await tapZone('DOWN',  cx,      cy + off, 'DOWN'));
  r.push(await tapZone('LEFT',  cx - off, cy,      'LEFT'));

  await browser.close();
  const p = r.filter(Boolean).length;
  console.log('\n' + p + '/' + r.length + ' zones passed');
  process.exit(p === r.length ? 0 : 1);
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
