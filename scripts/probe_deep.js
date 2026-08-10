// Deep trace of 180° reversal on the dead-center touchstart path.
const puppeteer = require('puppeteer');
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });
  await page.goto('http://127.0.0.1:8766/index.html', { waitUntil: 'networkidle2', timeout: 20000 });
  await sleep(500);
  await page.evaluate(() => { if (typeof handleAction === 'function') handleAction(); });
  await sleep(400);
  // instrument setDirection
  await page.evaluate(() => {
    window.__sdLog = [];
    const orig = window.setDirection;
    window.setDirection = function (nd) {
      const nd2 = window.snake && window.snake.nextDirection;
      const d = window.snake && window.snake.direction;
      window.__sdLog.push({
        nd: { x: nd.x, y: nd.y },
        nextDir: nd2 ? { x: nd2.x, y: nd2.y } : null,
        dir: d ? { x: d.x, y: d.y } : null,
      });
      return orig.call(this, nd);
    };
  });
  const box = await page.evaluate(() => {
    const c = document.querySelector('canvas'); const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
  const cs = await page.evaluate(() => cellSize);
  console.log('canvas cx,cy=', cx, cy, 'cellSize=', cs);
  // touchstart at dead center
  await page.touchscreen.touchStart(cx, cy);
  await sleep(20);
  const afterStart = await page.evaluate(() => ({ sdLog: window.__sdLog.slice(), dir: snake.direction, nextDir: snake.nextDirection, getTapZone: typeof getTapZone }));
  console.log('after touchStart (dead center):', JSON.stringify(afterStart));
  // drag LEFT
  await page.touchscreen.touchMove(cx - 80, cy);
  await sleep(60);
  const afterMove = await page.evaluate(() => window.__sdLog.slice());
  console.log('after touchMove LEFT (full log):', JSON.stringify(afterMove));
  await page.touchscreen.touchEnd();
  await browser.close();
})();
