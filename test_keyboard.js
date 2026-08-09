// Regression: desktop keyboard unaffected by touch fix (task t_0b1dc64b AC-6).
const puppeteer = require('puppeteer');
const path = require('path');
const FILE = 'file://' + path.resolve(__dirname, 'index.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-web-security'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });  // desktop, no touch
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('canvas').length > 0, { timeout: 15000 });
  await sleep(400);

  // Click START to enter PLAYING
  const rect = await page.evaluate(() => {
    const r = document.querySelector('canvas').getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  });
  await page.mouse.click(rect.cx, rect.cy);
  await sleep(300);
  const state = await page.evaluate(() => currentState);
  console.log('state after start:', state);

  // Use arrow keys in a valid sequence (no reversals — game rejects reverse).
  // Snake starts RIGHT. RIGHT→UP→LEFT→DOWN is a valid clockwise turn sequence.
  const getDir = () => page.evaluate(() => {
    const n = snake.nextDirection || snake.direction;
    return { x: n.x, y: n.y };
  });
  const dirName = (x, y) => (x === 0 && y === -1) ? 'UP' : (x === 0 && y === 1) ? 'DOWN' : (x === -1 && y === 0) ? 'LEFT' : (x === 1 && y === 0) ? 'RIGHT' : '?';

  async function key(label, key, expected) {
    await page.keyboard.press(key);
    await sleep(30);
    const d = await getDir();
    const got = dirName(d.x, d.y);
    const ok = got === expected;
    console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + ': expected ' + expected + ' got ' + got);
    return ok;
  }

  let r = [];
  r.push(await key('ArrowUp', 'ArrowUp', 'UP'));      // RIGHT→UP ok
  r.push(await key('ArrowLeft', 'ArrowLeft', 'LEFT')); // UP→LEFT ok
  r.push(await key('ArrowDown', 'ArrowDown', 'DOWN')); // LEFT→DOWN ok
  r.push(await key('ArrowRight', 'ArrowRight', 'RIGHT')); // DOWN→RIGHT ok

  await browser.close();
  const p = r.filter(Boolean).length;
  console.log('\n' + p + '/' + r.length + ' keys passed');
  process.exit(p === r.length ? 0 : 1);
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
