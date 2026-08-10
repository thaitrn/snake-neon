// Isolate the 180° reversal guard on a portrait viewport.
// Uses the same touchscreen pattern as qa-mobile-ux.js.
const puppeteer = require('puppeteer');

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function joystickDrag(page, cx, cy, dx, dy, holdMs = 80) {
  await page.touchscreen.touchStart(cx, cy);
  await sleep(holdMs);
  await page.touchscreen.touchMove(cx + dx, cy + dy);
  await sleep(60);
  await page.touchscreen.touchEnd();
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

  await page.goto('http://127.0.0.1:8766/index.html', { waitUntil: 'networkidle2', timeout: 20000 });
  await sleep(500);

  const read = () => page.evaluate(() => ({
    state: typeof currentState !== 'undefined' ? currentState : '?',
    dir: (typeof snake !== 'undefined' && snake) ? { x: snake.direction.x, y: snake.direction.y } : null,
    nextDir: (typeof snake !== 'undefined' && snake && snake.nextDirection) ? { x: snake.nextDirection.x, y: snake.nextDirection.y } : null,
    orient: typeof currentOrientation !== 'undefined' ? currentOrientation : '?',
  }));

  await page.evaluate(() => { if (typeof handleAction === 'function') handleAction(); });
  await sleep(400);

  const box = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  console.log('canvas box:', JSON.stringify(box));
  console.log('initial:', JSON.stringify(await read()));

  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;

  console.log('\n--- STEP 1: drive to RIGHT (origin above center, drag right) ---');
  await joystickDrag(page, cx, cy - 30, 80, 0);
  await sleep(320);
  let st = await read();
  console.log('after RIGHT:', JSON.stringify(st));

  if (!st.dir || st.dir.x !== 1) {
    console.log('!! not RIGHT, retry');
    await joystickDrag(page, cx, cy - 30, 80, 0);
    await sleep(320);
    st = await read();
    console.log('after retry:', JSON.stringify(st));
  }

  console.log('\n--- STEP 2: 180° reversal RIGHT->LEFT (dead center, drag left) ---');
  // Instrument setDirection to log each call
  await page.evaluate(() => {
    if (!window.__sdLog) {
      window.__sdLog = [];
      const orig = window.setDirection;
      window.setDirection = function (nd) {
        const cd = (window.snake && (window.snake.nextDirection || window.snake.direction)) || { x: 0, y: 0 };
        const blocked = (nd.x === -cd.x && nd.y === -cd.y);
        window.__sdLog.push({ nd: { x: nd.x, y: nd.y }, compareDir: { x: cd.x, y: cd.y }, blocked });
        return orig.call(this, nd);
      };
    }
  });
  await joystickDrag(page, cx, cy, -80, 0);
  await sleep(60);
  const log1 = await page.evaluate(() => window.__sdLog);
  console.log('setDirection calls during LEFT drag:', JSON.stringify(log1));
  await sleep(320);
  const after = await read();
  console.log('after tick:', JSON.stringify(after));

  const reversed = after.dir && after.dir.x === -1 && after.dir.y === 0;
  console.log('\n=== RESULT: ' + (reversed ? 'BUG - reversal accepted!' : 'OK - correctly blocked'));

  await browser.close();
})();
