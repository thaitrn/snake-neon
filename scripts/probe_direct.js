// Direct logic test: call the REAL setDirection in page context (bypassing any
// wrapper the probe may install) to verify the 180° guard against committed dir.
const puppeteer = require('puppeteer');
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

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
  await page.evaluate(() => { if (typeof handleAction === 'function') handleAction(); });
  await sleep(400);

  // Snapshot the REAL setDirection source (as the page sees it) before any wrap.
  const srcBefore = await page.evaluate(() => window.setDirection.toString());

  // DIRECT logic test, no wrappers. Force state, call bare setDirection.
  const result = await page.evaluate(() => {
    // force committed RIGHT, clear queue
    snake.direction = { x: 1, y: 0 };
    snake.nextDirection = null;
    setDirection({ x: 0, y: 1 });          // DOWN: perpendicular to RIGHT -> allowed
    const afterDown = { x: snake.nextDirection.x, y: snake.nextDirection.y };
    setDirection({ x: -1, y: 0 });         // LEFT: 180 of committed RIGHT -> must block
    const afterLeft = snake.nextDirection ? { x: snake.nextDirection.x, y: snake.nextDirection.y } : null;
    return { committed: { x: snake.direction.x, y: snake.direction.y }, afterDown, afterLeft,
             leftBlocked: afterLeft === null || (afterLeft.x !== -1) };
  });

  console.log('setDirection source (served):');
  console.log(srcBefore);
  console.log('\nDirect logic result:', JSON.stringify(result));
  console.log('=== LOGIC: ' + (result.leftBlocked ? 'OK - LEFT correctly blocked vs committed RIGHT' : 'BUG - LEFT accepted (reversal)'));

  await browser.close();
})();
