// AC-5: Joystick drag (swipe fallback) still works in portrait PLAYING.
// After touchStart, a drag past threshold in touchMoved calls applyJoystickDrag
// → setDirection. Direction is computed from ORIGIN→current drag vector, so we
// must drag perpendicular to the current heading (the anti-reversal guard at
// index.html:156 rejects 180° turns, just like real gameplay).
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

  const dirName = (x, y) => (x === 0 && y === -1) ? 'UP' : (x === 0 && y === 1) ? 'DOWN' : (x === -1 && y === 0) ? 'LEFT' : (x === 1 && y === 0) ? 'RIGHT' : '?';

  // Start game
  await page.touchscreen.touchStart(cx, cy);
  await sleep(40);
  await page.touchscreen.touchEnd();
  await sleep(400);

  const getJoystick = () => page.evaluate(() => ({
    active: joystick.active,
    originX: joystick.originX, originY: joystick.originY,
    thumbX: joystick.thumbX, thumbY: joystick.thumbY,
  }));
  const getDir = () => page.evaluate(() => {
    const d = snake.nextDirection || snake.direction;
    return { x: d.x, y: d.y };
  });

  let results = [];

  // Snake starts RIGHT. Start touch in the RIGHT zone (cx+off) so the initial
  // tap-zone direction is RIGHT. Then drag UP (perpendicular, valid from RIGHT).
  // applyJoystickDrag computes origin→current: if we move straight up from
  // origin (cx+off, cy) the vector is (0, -large) → UP.
  // --- Test 1: drag UP from RIGHT-zone origin ---
  await page.touchscreen.touchStart(cx + off, cy);   // RIGHT zone
  await sleep(20);
  const jsActive = await getJoystick();
  const ok1a = jsActive.active === true;
  results.push(ok1a);
  console.log((ok1a ? 'PASS' : 'FAIL') + ' joystick.active=true on touchStart: ' + jsActive.active);

  await page.touchscreen.touchMove(cx + off, cy - 150);  // drag straight up
  await sleep(30);
  const dirUp = await getDir();
  await page.touchscreen.touchEnd();
  await sleep(30);
  const gotUp = dirName(dirUp.x, dirUp.y);
  const ok1 = gotUp === 'UP';
  results.push(ok1);
  console.log((ok1 ? 'PASS' : 'FAIL') + ' drag UP: expected UP got ' + gotUp);

  // --- Test 2: drag LEFT from UP ---
  // Start touch at a UP-zone point, drag left.
  await page.touchscreen.touchStart(cx, cy - off);   // UP zone
  await sleep(20);
  await page.touchscreen.touchMove(cx - 150, cy - off);  // drag left
  await sleep(30);
  const dirLeft = await getDir();
  await page.touchscreen.touchEnd();
  await sleep(30);
  const gotLeft = dirName(dirLeft.x, dirLeft.y);
  const ok2 = gotLeft === 'LEFT';
  results.push(ok2);
  console.log((ok2 ? 'PASS' : 'FAIL') + ' drag LEFT: expected LEFT got ' + gotLeft);

  // --- Test 3: thumb clamping — drag far beyond base radius ---
  await page.touchscreen.touchStart(cx, cy + off);   // DOWN zone
  await sleep(20);
  await page.touchscreen.touchMove(cx, cy + 500);    // way beyond canvas
  await sleep(30);
  const jsClamp = await getJoystick();
  await page.touchscreen.touchEnd();
  await sleep(30);
  const thumbDelta = Math.abs(jsClamp.thumbY - jsClamp.originY);
  const baseRadius = await page.evaluate(() => Math.max(8, cellSize * 1.5));
  const ok3 = thumbDelta <= baseRadius * 1.05;
  results.push(ok3);
  console.log((ok3 ? 'PASS' : 'FAIL') + ' thumb clamp: thumbDelta=' + Math.round(thumbDelta) +
    'px baseRadius=' + Math.round(baseRadius) + 'px (thumb clamped to ~baseRadius)');

  // --- Test 4: joystick.active resets to false on touchEnd ---
  const jsAfterEnd = await getJoystick();
  const ok4 = jsAfterEnd.active === false;
  results.push(ok4);
  console.log((ok4 ? 'PASS' : 'FAIL') + ' joystick.active=false after touchEnd: ' + jsAfterEnd.active);

  await browser.close();
  const p = results.filter(Boolean).length;
  console.log('\n' + p + '/' + results.length + ' joystick tests passed');
  process.exit(p === results.length ? 0 : 1);
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
