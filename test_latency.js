// AC-4: Tap response < 50ms.
// The fix resolves direction on touchStart (instant), not touchEnd.
// We measure the wall-clock time from touchStart to the moment nextDirection
// changes. We poll via CDP for sub-millisecond precision and take the best of
// several samples to represent a real device. The 50ms budget is generous —
// the JS event fires synchronously inside touchStarted().
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
  await page.waitForFunction(() => document.querySelectorAll('canvas').length > 0, { timeout: 20000 });
  await sleep(500);

  const rect = await page.evaluate(() => {
    const r = document.querySelector('canvas').getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const off = Math.min(rect.width, rect.height) * 0.3;

  // Start game
  await page.touchscreen.touchStart(cx, cy);
  await sleep(40);
  await page.touchscreen.touchEnd();
  await sleep(400);

  // Instrument touchStarted in-page to capture a high-res timestamp the instant
  // nextDirection is assigned. We wrap setDirection to record performance.now().
  await page.evaluate(() => {
    window.__tapLatencies = [];
    const origSet = setDirection;
    window.setDirection = function (d) {
      const before = window.__tapAt;
      origSet(d);
      if (before) {
        window.__tapLatencies.push(performance.now() - before);
        window.__tapAt = null;
      }
    };
  });

  // Each sample: record send-time, fire touchStart, CDP dispatches it
  // synchronously into the page, setDirection records latency.
  async function measureTap(tx, ty) {
    await page.evaluate(() => { window.__tapAt = performance.now(); });
    await page.touchscreen.touchStart(tx, ty);
    await sleep(15);
    await page.touchscreen.touchEnd();
    await sleep(30);
  }

  const samples = [];
  // Valid clockwise sequence: RIGHT(start) → UP → RIGHT → DOWN → LEFT → RIGHT ...
  const taps = [
    [cx, cy - off],      // UP
    [cx + off, cy],      // RIGHT
    [cx, cy + off],      // DOWN
    [cx - off, cy],      // LEFT
    [cx, cy - off],      // UP
    [cx + off, cy],      // RIGHT
  ];
  for (const [tx, ty] of taps) {
    await measureTap(tx, ty);
  }
  await sleep(50);
  const latencies = await page.evaluate(() => window.__tapLatencies);
  console.log('Raw latencies (ms):', latencies.map(l => l.toFixed(2)).join(', '));

  // Puppeteer CDP round-trip adds IPC overhead (~5-15ms) on top of the true
  // in-page latency. The true game-side latency is what matters: setDirection
  // runs synchronously inside the touchStarted handler, so the page-side cost
  // is ~0. The measured number is dominated by CDP dispatch. We report both.
  const max = Math.max(...latencies);
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const min = Math.min(...latencies);

  console.log('min=' + min.toFixed(2) + 'ms  avg=' + avg.toFixed(2) + 'ms  max=' + max.toFixed(2) + 'ms');

  // Verdict: the in-page handler is synchronous (no setTimeout/raf), so the
  // game-side latency is effectively the event dispatch cost. Even the
  // puppeteer-measured max (which includes CDP IPC) should be well under the
  // 150ms tick interval. AC says < 50ms.
  const pass = max < 50;
  console.log('\n' + (pass ? 'PASS' : 'FAIL') + ' AC-4 tap response < 50ms (max measured ' + max.toFixed(1) + 'ms, includes CDP overhead)');

  await browser.close();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
