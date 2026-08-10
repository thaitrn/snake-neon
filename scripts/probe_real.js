// Direct instrument test: patch setDirection inside page scope to log calls.
const puppeteer = require('puppeteer');
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
  await p.evaluateOnNewDocument(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await p.goto('http://127.0.0.1:8766/index.html', { waitUntil: 'networkidle2', timeout: 20000 });
  await sleep(500);
  await p.evaluate(() => { if (typeof handleAction === 'function') handleAction(); });
  await sleep(400);

  // Patch setDirection to log — it IS a global in p5 global mode, so window.setDirection is the
  // same reference the touch handlers call.
  await p.evaluate(() => {
    window.__log = [];
    const o = window.setDirection;
    window.setDirection = function (nd) {
      window.__log.push({
        nd: { x: nd.x, y: nd.y },
        dir: { x: snake.direction.x, y: snake.direction.y },
        next: snake.nextDirection ? { x: snake.nextDirection.x, y: snake.nextDirection.y } : null,
      });
      return o.call(this, nd);
    };
  });

  const box = await p.evaluate(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const cx = box.left + box.width / 2, cy = box.top + box.height / 2;

  // Reproduce: tap dead center (DOWN), then drag left (LEFT) within one tick.
  await p.touchscreen.touchStart(cx, cy);
  await sleep(80);
  await p.touchscreen.touchMove(cx - 80, cy);
  await sleep(60);
  await p.touchscreen.touchEnd();
  await sleep(60);

  const log = await p.evaluate(() => window.__log);
  const st = await p.evaluate(() => ({
    dir: { x: snake.direction.x, y: snake.direction.y },
    next: snake.nextDirection ? { x: snake.nextDirection.x, y: snake.nextDirection.y } : null,
  }));
  console.log('setDirection log:', JSON.stringify(log));
  console.log('after:', JSON.stringify(st));
  console.log('RESULT:', (st.dir.x === -1 && st.dir.y === 0) ? 'BUG - reversed' : 'OK - blocked');
  await b.close();
})();
