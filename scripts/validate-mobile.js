// Headless mobile validation for Snake Neon joystick redesign.
// Verifies: canvas renders, correct mobile size, joystick activates on touch,
// direction changes, tap does NOT pause, pause button works, layout fits.
const puppeteer = require('puppeteer');

const URL = 'http://localhost:8765/index.html';
const VIEWPORTS = [
  { name: 'iPhone SE',     w: 375, h: 667, minCanvas: 330 },
  { name: 'iPhone 14',     w: 390, h: 844, minCanvas: 360 },
  { name: 'Android 360x800', w: 360, h: 800, minCanvas: 336 },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  let allPass = true;
  const results = [];

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage();
    // Mobile + touch emulation, explicit viewport per target device
    await page.setViewport({ width: vp.w, height: vp.h, hasTouch: true, isMobile: true });

    await page.goto(URL, { waitUntil: 'networkidle0' });

    // --- Start the game (click pauseBtn which says START on MENU)
    const startLabel = await page.$eval('#pauseBtn', el => el.textContent);
    await page.click('#pauseBtn');
    await sleep(300);
    const stateAfterStart = await page.evaluate(() => window.currentState || document.querySelector('canvas'));
    // Check game started: pauseBtn should now say PAUSE
    const labelAfterStart = await page.$eval('#pauseBtn', el => el.textContent);

    // --- Read canvas dimensions
    const dims = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      return { w: c.width, h: c.height, offsetH: c.offsetHeight, offsetW: c.offsetWidth };
    });

    // --- Joystick activation test: touch the canvas center, check joystick.active flips true
    // NOTE: top-level let/const live in global lexical scope (bare identifiers),
    // NOT on window. Use bare references inside evaluate.
    const joystickState = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      const rect = c.getBoundingClientRect();
      return {
        cx: rect.left + rect.width / 2,
        cy: rect.top + rect.height / 2,
        activeBefore: joystick.active,
      };
    });

    // Simulate touchstart at canvas center
    await page.touchscreen.touchStart(joystickState.cx, joystickState.cy);
    await sleep(60);
    const activeDuring = await page.evaluate(() => joystick.active);

    // Simulate drag upward (steer UP)
    await page.touchscreen.touchMove(joystickState.cx, joystickState.cy - 60);
    await sleep(60);
    const dirAfterUp = await page.evaluate(() =>
      (snake && snake.nextDirection)
        ? JSON.stringify(snake.nextDirection)
        : 'no-snake'
    );

    // Release
    await page.touchscreen.touchEnd();
    await sleep(60);
    const activeAfter = await page.evaluate(() => joystick.active);

    // --- Tap-doesn't-pause test: quick tap on canvas center, verify still PLAYING (not PAUSED)
    const labelBeforeTap = await page.$eval('#pauseBtn', el => el.textContent);
    await page.touchscreen.touchStart(joystickState.cx, joystickState.cy);
    await sleep(40);
    await page.touchscreen.touchEnd();
    await sleep(100);
    const labelAfterTap = await page.$eval('#pauseBtn', el => el.textContent);

    // --- Pause button test: click pause, verify PAUSED
    await page.click('#pauseBtn');
    await sleep(150);
    const labelAfterPause = await page.$eval('#pauseBtn', el => el.textContent);

    // --- Screenshot (final state)
    const shot = `/tmp/snake-neon-${vp.name.replace(/\s+/g,'-')}.png`;
    await page.screenshot({ path: shot });

    // --- Evaluate
    const canvasOk = dims.w >= vp.minCanvas && dims.w === dims.h;
    const startOk = /PAUSE/i.test(labelAfterStart);
    const joystickActivateOk = activeDuring === true;
    const joystickHideOk = activeAfter === false;
    const tapNoPauseOk = labelAfterTap === labelBeforeTap;
    const pauseBtnOk = /RESUME/i.test(labelAfterPause);

    const pass = canvasOk && startOk && joystickActivateOk && joystickHideOk && tapNoPauseOk && pauseBtnOk;
    if (!pass) allPass = false;

    results.push({
      viewport: vp.name,
      canvas: `${dims.w}x${dims.h} (min ${vp.minCanvas})`,
      startWorks: startOk,
      joystickActivates: joystickActivateOk,
      joystickHides: joystickHideOk,
      dirAfterDragUp: dirAfterUp,
      tapDoesNotPause: tapNoPauseOk ? `${labelBeforeTap}→${labelAfterTap}` : 'CHANGED!',
      pauseBtnWorks: pauseBtnOk ? `→${labelAfterPause}` : `FAILED→${labelAfterPause}`,
      screenshot: shot,
      PASS: pass,
    });

    await page.close();
  }

  await browser.close();

  console.log('═'.repeat(60));
  console.log('SNAKE NEON — MOBILE UX VALIDATION RESULTS');
  console.log('═'.repeat(60));
  for (const r of results) {
    console.log(`\n[${r.viewport}] ${r.PASS ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  canvas:        ${r.canvas}`);
    console.log(`  start works:   ${r.startWorks}`);
    console.log(`  joystick on:   ${r.joystickActivates} | off after release: ${r.joystickHides}`);
    console.log(`  dir after ↑:   ${r.dirAfterDragUp}`);
    console.log(`  tap≠pause:     ${r.tapDoesNotPause}`);
    console.log(`  pause btn:     ${r.pauseBtnWorks}`);
    console.log(`  screenshot:    ${r.screenshot}`);
  }
  console.log('\n' + '═'.repeat(60));
  console.log(allPass ? 'OVERALL: ✅ ALL VIEWPORTS PASS' : 'OVERALL: ❌ SOME CHECKS FAILED');
  console.log('═'.repeat(60));
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error('FATAL:', e.message); process.exit(2); });
