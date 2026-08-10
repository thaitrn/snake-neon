// Debug version: logs direction state at every step to find why LEFT fails.
const puppeteer = require('puppeteer');
const path = require('path');
const FILE = 'file://' + path.resolve(__dirname, 'index.html');
const VW = 390, VH = 844;
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

  const getFull = () => page.evaluate(() => ({
    dir: { x: snake.direction.x, y: snake.direction.y },
    next: snake.nextDirection ? { x: snake.nextDirection.x, y: snake.nextDirection.y } : null,
    state: currentState,
    tickInterval: tickInterval,
    foods: foodsEaten
  }));

  // Start
  await page.touchscreen.touchStart(cx, cy);
  await sleep(40);
  await page.touchscreen.touchEnd();
  await sleep(400);
  console.log('after start:', JSON.stringify(await getFull()));

  async function tapZone(label, tx, ty, expected) {
    const before = await getFull();
    await page.touchscreen.touchStart(tx, ty);
    await sleep(20);
    const after = await getFull();
    await page.touchscreen.touchEnd();
    await sleep(40);
    console.log(label, 'expected', expected);
    console.log('  before tap:', JSON.stringify(before));
    console.log('  after  tap:', JSON.stringify(after));
  }

  await tapZone('UP',    cx,      cy - off, 'UP');
  await tapZone('RIGHT', cx + off, cy,      'RIGHT');
  await tapZone('DOWN',  cx,      cy + off, 'DOWN');
  await tapZone('LEFT',  cx - off, cy,      'LEFT');

  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
