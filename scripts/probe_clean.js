// Verify: is the 180 reversal accepted WITHOUT any instrumentation wrapper?
// Use a clean page, real touchscreen sequence, read only snake.direction/nextDirection.
const puppeteer = require('puppeteer');
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run(viewport, label) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });
  await page.goto('http://127.0.0.1:8766/index.html', { waitUntil: 'networkidle2', timeout: 20000 });
  await sleep(500);
  await page.evaluate(() => { if (typeof handleAction === 'function') handleAction(); });
  await sleep(400);
  const box = await page.evaluate(() => {
    const c = document.querySelector('canvas'); const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
  const read = () => page.evaluate(() => ({
    dir: snake.direction, nextDir: snake.nextDirection,
    body0: snake.body[0] ? { x: snake.body[0].x, y: snake.body[0].y } : null,
  }));
  console.log(`\n=== ${label} (${viewport.width}x${viewport.height}) cx=${cx} cy=${cy} ===`);

  // STEP 1: drive to RIGHT — origin ABOVE center (UP tap zone), drag right
  await page.touchscreen.touchStart(cx, cy - 30);
  await sleep(40);
  await page.touchscreen.touchMove(cx + 80, cy - 30);
  await sleep(80);
  await page.touchscreen.touchEnd();
  await sleep(300);
  let st = await read();
  console.log('after RIGHT drive:', JSON.stringify(st));

  // STEP 2: 180 reversal RIGHT->LEFT — origin dead center, drag left
  await page.touchscreen.touchStart(cx, cy);
  await sleep(20);
  const st2 = await read();
  console.log('  after touchstart center:', JSON.stringify(st2));
  await page.touchscreen.touchMove(cx - 80, cy);
  await sleep(80);
  const st3 = await read();
  console.log('  after touchmove LEFT:', JSON.stringify(st3));
  await page.touchscreen.touchEnd();
  await sleep(300);
  const st4 = await read();
  console.log('  after touchend+tick:', JSON.stringify(st4));
  const reversed = st4.dir && st4.dir.x === -1 && st4.dir.y === 0;
  console.log('  RESULT:', reversed ? 'BUG - reversal accepted' : 'OK - blocked');

  await browser.close();
}

(async () => {
  await run({ width: 375, height: 667, hasTouch: true, isMobile: true }, 'iPhone SE');
  await run({ width: 390, height: 844, hasTouch: true, isMobile: true }, 'iPhone 12');
})();
