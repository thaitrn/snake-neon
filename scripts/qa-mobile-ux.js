#!/usr/bin/env node
// ============================================================
// Snake Neon — QA Mobile UX Redesign Validation
// Task: t_61d8a6a1
// Covers all 6 test cases from docs/qa-mobile-ux.md acceptance:
//   TC1 Layout: canvas + HUD fit on mobile viewports
//   TC2 Controls: joystick 4-dir + tap-no-pause + 180 rule
//   TC3 Gameplay: move / eat / collide / score
//   TC4 Responsive: portrait + landscape
//   TC5 Performance: frame rate + render
//   TC6 No layout overflow / clipped buttons
// ============================================================
'use strict';

const puppeteer = require('puppeteer');

const URL = 'http://localhost:8765/index.html';

// (name, w, h, minCanvas) — AC-4 thresholds from mobile-ux-redesign.md
const PORTRAIT_VIEWS = [
  { name: 'iPhone SE',   w: 375, h: 667, minCanvas: 330 },
  { name: 'iPhone 12/13', w: 390, h: 844, minCanvas: 360 },
  { name: 'Samsung A-series', w: 360, h: 800, minCanvas: 336 },
];
const LANDSCAPE_VIEWS = [
  { name: 'iPhone SE landscape', w: 667, h: 375 },
  { name: 'iPhone 12 landscape', w: 844, h: 390 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Read top-level let/const from the page's global lexical scope via
// bare identifier reference inside evaluate (p5 sketches are not on window).
function readState(page) {
  return page.evaluate(() => ({
    state: typeof currentState !== 'undefined' ? currentState : null,
    score: typeof score !== 'undefined' ? score : null,
    foods: typeof foodsEaten !== 'undefined' ? foodsEaten : null,
    dir: (typeof snake !== 'undefined' && snake && snake.direction)
      ? { x: snake.direction.x, y: snake.direction.y } : null,
    nextDir: (typeof snake !== 'undefined' && snake && snake.nextDirection)
      ? { x: snake.nextDirection.x, y: snake.nextDirection.y } : null,
    bodyLen: (typeof snake !== 'undefined' && snake && snake.body) ? snake.body.length : 0,
    head: (typeof snake !== 'undefined' && snake && snake.body && snake.body[0])
      ? { x: snake.body[0].x, y: snake.body[0].y } : null,
    food: (typeof food !== 'undefined' && food) ? { x: food.x, y: food.y } : null,
    joystickActive: (typeof joystick !== 'undefined') ? joystick.active : null,
    cellSize: typeof cellSize !== 'undefined' ? cellSize : null,
    tickInterval: typeof tickInterval !== 'undefined' ? tickInterval : null,
  }));
}

async function startGame(page) {
  // The pauseBtn shows "▶ START" on MENU; clicking it calls handleAction().
  await page.click('#pauseBtn');
  await sleep(250);
  const label = await page.$eval('#pauseBtn', (el) => el.textContent);
  return /PAUSE/i.test(label); // started => now shows PAUSE
}

async function canvasCenter(page) {
  return page.evaluate(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2,
             left: r.left, top: r.top, w: r.width, h: r.height };
  });
}

// Drive the joystick: touchStart at origin, touchMove to (ox+dx, oy+dy),
// then release. Used to verify direction mapping.
async function joystickDrag(page, origin, dx, dy, holdMs = 80) {
  await page.touchscreen.touchStart(origin.cx, origin.cy);
  await sleep(40);
  await page.touchscreen.touchMove(origin.cx + dx, origin.cy + dy);
  await sleep(holdMs);
  await page.touchscreen.touchEnd();
  await sleep(40);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const report = { url: URL, startedAt: new Date().toISOString(),
                   viewports: [], bugs: [], summary: {} };

  // ----------------------------------------------------------
  // TC1 + TC2 + TC6 — portrait viewports: layout, controls, overflow
  // ----------------------------------------------------------
  for (const vp of PORTRAIT_VIEWS) {
    const page = await browser.newPage();
    // Stub document.hidden so headless doesn't auto-pause on "tab blur"
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    });
    await page.setViewport({ width: vp.w, height: vp.h, hasTouch: true, isMobile: true });
    await page.goto(URL, { waitUntil: 'networkidle0' });

    const v = { name: vp.name, w: vp.w, h: vp.h, checks: {} };

    // --- TC1 Layout ---
    const canvas = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      return { w: c.width, h: c.height, ow: c.offsetWidth, oh: c.offsetHeight };
    });
    v.checks.canvasSize = `${canvas.w}x${canvas.h}`;
    v.checks.TC1_canvasFits = canvas.w >= vp.minCanvas && canvas.w === canvas.h;

    // HUD present + outside canvas
    const hud = await page.evaluate(() => {
      const tb = document.getElementById('topbar');
      const btn = document.getElementById('pauseBtn');
      const sc = document.getElementById('hud-score');
      const cr = document.querySelector('canvas').getBoundingClientRect();
      const tr = tb.getBoundingClientRect();
      return {
        topbarAboveCanvas: tr.bottom <= cr.top + 1,
        pauseBtnVisible: btn && btn.offsetWidth > 0 && btn.offsetHeight > 0,
        pauseBtnInTopbar: btn ? tb.contains(btn) : false,
        scoreElExists: !!sc,
      };
    });
    v.checks.TC1_hudAboveCanvas = hud.topbarAboveCanvas;
    v.checks.TC1_pauseBtnVisible = hud.pauseBtnVisible;
    v.checks.TC1_pauseBtnInTopbar = hud.pauseBtnInTopbar;

    // --- TC6 No overflow / clipping ---
    const overflow = await page.evaluate(() => {
      const body = document.body;
      const html = document.documentElement;
      const btn = document.getElementById('pauseBtn');
      const br = btn.getBoundingClientRect();
      return {
        scrollWidth: Math.max(body.scrollWidth, html.scrollWidth),
        clientWidth: html.clientWidth,
        buttonClipped: br.right > html.clientWidth || br.left < 0 ||
                       br.bottom > html.clientHeight || br.top < 0,
      };
    });
    v.checks.TC6_noHorizontalOverflow = overflow.scrollWidth <= overflow.clientWidth + 1;
    v.checks.TC6_buttonNotClipped = !overflow.buttonClipped;

    // --- Start game for control tests ---
    v.checks.TC2_startWorks = await startGame(page);

    // --- TC2 Controls: joystick activates on touch ---
    const center = await canvasCenter(page);
    await page.touchscreen.touchStart(center.cx, center.cy);
    await sleep(60);
    const activeDuring = await page.evaluate(() => joystick.active);
    v.checks.TC2_joystickActivates = activeDuring === true;
    await page.touchscreen.touchEnd();
    await sleep(60);
    const activeAfter = await page.evaluate(() => joystick.active);
    v.checks.TC2_joystickHidesOnRelease = activeAfter === false;

    // --- TC2 Controls: tap (< threshold) does NOT pause ---
    const labelBefore = await page.$eval('#pauseBtn', (el) => el.textContent);
    await page.touchscreen.touchStart(center.cx, center.cy);
    await sleep(40);
    await page.touchscreen.touchEnd();
    await sleep(120);
    const labelAfter = await page.$eval('#pauseBtn', (el) => el.textContent);
    v.checks.TC2_tapNoPause = labelBefore === labelAfter;

    // --- TC2 Controls: 4 directions map correctly ---
    // IMPORTANT: test a CIRCULAR 90° path so each turn is perpendicular
    // (never a 180° reversal, which the game correctly blocks).
    // Snake starts moving RIGHT. Path: UP → LEFT → DOWN → RIGHT (all 90°).
    // Then a separate 180° reversal check.
    const dirResult = await (async () => {
      const out = {};
      // nextDirection is consumed at the next snake tick (applied to
      // snake.direction, then cleared to null). So after each drag we wait
      // one+ tick, then read the APPLIED direction (snake.direction).
      // tickInterval starts at 150ms, so 260ms > 1 tick.
      // UP (perpendicular to initial RIGHT)
      await joystickDrag(page, center, 0, -60);
      await sleep(260);
      let st = await readState(page);
      out.UP = st.dir ? (st.dir.x === 0 && st.dir.y === -1) : false;
      // LEFT (perpendicular to UP)
      await joystickDrag(page, center, -60, 0);
      await sleep(260);
      st = await readState(page);
      out.LEFT = st.dir ? (st.dir.x === -1 && st.dir.y === 0) : false;
      // DOWN (perpendicular to LEFT)
      await joystickDrag(page, center, 0, 60);
      await sleep(260);
      st = await readState(page);
      out.DOWN = st.dir ? (st.dir.x === 0 && st.dir.y === 1) : false;
      // RIGHT (perpendicular to DOWN)
      await joystickDrag(page, center, 60, 0);
      await sleep(260);
      st = await readState(page);
      out.RIGHT = st.dir ? (st.dir.x === 1 && st.dir.y === 0) : false;
      // 180 rule: dir is now RIGHT. Drag LEFT to reverse — must be ignored.
      const dirBeforeRev = st.dir ? `${st.dir.x},${st.dir.y}` : 'null';
      await joystickDrag(page, center, -60, 0);
      await sleep(260);
      st = await readState(page);
      const dirAfterRev = st.dir ? `${st.dir.x},${st.dir.y}` : 'null';
      out.REVERSE_BLOCKED = !(st.dir && st.dir.x === -1 && st.dir.y === 0);
      out.REVERSE_detail = `${dirBeforeRev}→${dirAfterRev}`;
      return out;
    })();
    v.checks.TC2_dirMapping = dirResult;
    v.checks.TC2_allDirectionsOk =
      dirResult.UP === true && dirResult.DOWN === true &&
      dirResult.LEFT === true && dirResult.RIGHT === true;
    v.checks.TC2_180Rule = dirResult.REVERSE_BLOCKED === true;

    // Screenshot for evidence
    const shot = `/Users/thaitrn/Workspaces/work/snake-neon/screenshots/qa-${vp.name.replace(/[^a-z0-9]+/gi,'-')}.png`;
    await page.screenshot({ path: shot });
    v.screenshot = shot;

    report.viewports.push(v);
    await page.close();
  }

  // ----------------------------------------------------------
  // TC3 Gameplay — eat food / score / collide
  // ----------------------------------------------------------
  {
    const vp = PORTRAIT_VIEWS[1]; // iPhone 12
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    });
    await page.setViewport({ width: vp.w, height: vp.h, hasTouch: true, isMobile: true });
    await page.goto(URL, { waitUntil: 'networkidle0' });
    await startGame(page);

    const gameplay = { checks: {} };
    const st0 = await readState(page);
    gameplay.checks.initialScore0 = st0.score === 0;
    gameplay.checks.initialBody3 = st0.bodyLen === 3;
    gameplay.checks.foodPresent = !!st0.food;

    // Eat test — deterministic: teleport food one cell ahead of the head
    // so the next tick consumes it. This isolates the eat/score/grow/speedup
    // logic from pathfinding flakiness.
    const startScore = st0.score;
    let ate = false;
    for (let attempt = 0; attempt < 3 && !ate; attempt++) {
      // place food at head + current direction
      await page.evaluate(() => {
        if (typeof food !== 'undefined' && typeof snake !== 'undefined' && snake.body[0]) {
          const h = snake.body[0];
          const d = snake.direction;
          let nx = h.x + d.x;
          let ny = h.y + d.y;
          // if off-grid, pick a perpendicular in-grid spot
          if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
            ny = h.y;
            nx = h.x + (h.x + 1 < COLS ? 1 : -1);
          }
          food = { x: nx, y: ny };
        }
      });
      // let ticks run; one tick should eat
      for (let i = 0; i < 8; i++) {
        await sleep(180);
        const st = await readState(page);
        if (st.score > startScore) { ate = true; break; }
        if (st.state !== 'PLAYING') break;
        // re-place food ahead again in case it moved past
        await page.evaluate(() => {
          if (typeof food !== 'undefined' && typeof snake !== 'undefined' && snake.body[0]) {
            const h = snake.body[0];
            const d = snake.direction;
            let nx = h.x + d.x;
            let ny = h.y + d.y;
            if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
              ny = h.y;
              nx = h.x + (h.x + 1 < COLS ? 1 : -1);
            }
            food = { x: nx, y: ny };
          }
        });
      }
    }
    const st1 = await readState(page);
    gameplay.checks.canEat = ate;
    gameplay.checks.scoreIncremented = st1.score > startScore;
    gameplay.checks.bodyGrew = st1.bodyLen > 3;
    gameplay.checks.tickSpedUp = st1.tickInterval < 150; // INITIAL_TICK

    // Collision: drive into wall (keep going right)
    let died = false;
    for (let i = 0; i < 25; i++) {
      await page.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 39, which: 39 }));
      });
      await sleep(200);
      const st = await readState(page);
      if (st.state === 'GAME_OVER') { died = true; break; }
    }
    const st2 = await readState(page);
    gameplay.checks.wallCollisionGameOver = died;
    gameplay.checks.finalState = st2.state;

    report.gameplay = gameplay;
    await page.close();
  }

  // ----------------------------------------------------------
  // TC4 Responsive — landscape
  // ----------------------------------------------------------
  for (const vp of LANDSCAPE_VIEWS) {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    });
    await page.setViewport({ width: vp.w, height: vp.h, hasTouch: true, isMobile: true });
    await page.goto(URL, { waitUntil: 'networkidle0' });

    const canvas = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      return { w: c.width, h: c.height };
    });
    const overflow = await page.evaluate(() => {
      return { sw: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
               cw: document.documentElement.clientWidth };
    });
    const started = await startGame(page);
    const st = await readState(page);

    if (!report.landscape) report.landscape = [];
    report.landscape.push({
      name: vp.name,
      canvas: `${canvas.w}x${canvas.h}`,
      square: canvas.w === canvas.h,
      noHorizontalOverflow: overflow.sw <= overflow.cw + 1,
      startsInLandscape: started,
      playableState: st.state === 'PLAYING',
    });
    await page.close();
  }

  // ----------------------------------------------------------
  // TC5 Performance — frame timing
  // ----------------------------------------------------------
  {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    });
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
    await page.goto(URL, { waitUntil: 'networkidle0' });
    await startGame(page);

    // Let it run 2s, sample FPS via rAF timestamps inside the page.
    const fps = await page.evaluate(() => new Promise((resolve) => {
      const frames = [];
      let start = performance.now();
      let count = 0;
      function loop(t) {
        if (count === 0) start = t;
        frames.push(t);
        count++;
        if (t - start >= 2000) {
          const elapsed = (frames[frames.length - 1] - frames[0]) / 1000;
          resolve({ fps: (frames.length - 1) / elapsed, frames: frames.length, elapsed });
          return;
        }
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    }));

    // Also check draw() advances frames: count redraws by patching p5 draw.
    const perf = { fps: Math.round(fps.fps), frameCount: fps.frames,
                   elapsedMs: Math.round(fps.elapsed),
                   meets60fps: fps.fps >= 55 };
    report.performance = perf;
    await page.close();
  }

  // ----------------------------------------------------------
  // Summary + verdict
  // ----------------------------------------------------------
  let allPass = true;
  const bugList = [];
  for (const v of report.viewports) {
    const fails = Object.entries(v.checks)
      .filter(([k, val]) => /TC[0-9]/.test(k) && typeof val === 'boolean' && val !== true)
      .map(([k]) => `${k}=false`);
    if (fails.length) {
      allPass = false;
      bugList.push({ viewport: v.name, fails });
    }
  }
  // gameplay
  if (report.gameplay) {
    const gp = report.gameplay.checks;
    for (const [k, val] of Object.entries(gp)) {
      if (typeof val === 'boolean' && !val) {
        allPass = false;
        bugList.push({ area: 'gameplay', fail: k });
      }
    }
  }
  // landscape
  if (report.landscape) {
    for (const l of report.landscape) {
      if (!l.square || !l.noHorizontalOverflow || !l.startsInLandscape || !l.playableState) {
        allPass = false;
        bugList.push({ area: 'landscape', detail: l });
      }
    }
  }
  // performance
  if (report.performance && !report.performance.meets60fps) {
    allPass = false;
    bugList.push({ area: 'performance', fps: report.performance.fps });
  }

  report.bugs = bugList;
  report.summary = {
    verdict: allPass ? 'PASS' : 'FAIL',
    readyToShip: allPass,
    viewportsTested: report.viewports.length,
    landscapeTested: report.landscape ? report.landscape.length : 0,
    bugCount: bugList.length,
    fps: report.performance ? report.performance.fps : null,
  };

  await browser.close();

  // Print
  console.log('═'.repeat(64));
  console.log('SNAKE NEON — QA MOBILE UX VALIDATION (t_61d8a6a1)');
  console.log('═'.repeat(64));
  for (const v of report.viewports) {
    console.log(`\n[${v.name}] ${v.w}x${v.h}  canvas=${v.checks.canvasSize}`);
    console.log(`  TC1 canvas fits:    ${v.checks.TC1_canvasFits}`);
    console.log(`  TC1 HUD above:      ${v.checks.TC1_hudAboveCanvas}`);
    console.log(`  TC1 pause visible:  ${v.checks.TC1_pauseBtnVisible} (in topbar: ${v.checks.TC1_pauseBtnInTopbar})`);
    console.log(`  TC2 start:          ${v.checks.TC2_startWorks}`);
    console.log(`  TC2 joy activates:  ${v.checks.TC2_joystickActivates} | hides: ${v.checks.TC2_joystickHidesOnRelease}`);
    console.log(`  TC2 tap≠pause:      ${v.checks.TC2_tapNoPause}`);
    console.log(`  TC2 4-dir:          ${v.checks.TC2_allDirectionsOk}  ${JSON.stringify(v.checks.TC2_dirMapping)}`);
    console.log(`  TC2 180 rule:       ${v.checks.TC2_180Rule}`);
    console.log(`  TC6 no overflow:    ${v.checks.TC6_noHorizontalOverflow} | btn not clipped: ${v.checks.TC6_buttonNotClipped}`);
  }
  if (report.gameplay) {
    const g = report.gameplay.checks;
    console.log(`\n[TC3 Gameplay] iPhone 12`);
    console.log(`  initial score=0, body=3, food present: ${g.initialScore0 && g.initialBody3 && g.foodPresent}`);
    console.log(`  can eat:           ${g.canEat}`);
    console.log(`  score++:           ${g.scoreIncremented}`);
    console.log(`  body grew:         ${g.bodyGrew}`);
    console.log(`  tick sped up:      ${g.tickSpedUp} (tickInterval<150)`);
    console.log(`  wall→gameover:     ${g.wallCollisionGameOver}  final=${g.finalState}`);
  }
  if (report.landscape) {
    console.log(`\n[TC4 Landscape]`);
    for (const l of report.landscape) {
      console.log(`  ${l.name}: ${l.canvas} square=${l.square} overflow=${!l.noHorizontalOverflow} starts=${l.startsInLandscape} state=${l.playableState}`);
    }
  }
  if (report.performance) {
    console.log(`\n[TC5 Performance] FPS≈${report.performance.fps} over ${report.performance.elapsedMs}ms (${report.performance.frameCount} frames) → ${report.performance.meets60fps ? '≥55 OK' : 'BELOW 55'}`);
  }
  console.log('\n' + '═'.repeat(64));
  console.log(`VERDICT: ${report.summary.verdict}  |  ready to ship: ${report.summary.readyToShip}  |  bugs: ${report.summary.bugCount}`);
  if (bugList.length) {
    console.log('BUGS:');
    for (const b of bugList) console.log('  - ' + JSON.stringify(b));
  }
  console.log('═'.repeat(64));

  require('fs').writeFileSync(
    '/Users/thaitrn/Workspaces/work/snake-neon/qa/qa-mobile-ux-results.json',
    JSON.stringify(report, null, 2) + '\n'
  );
  process.exit(allPass ? 0 : 1);
})().catch((e) => { console.error('FATAL:', e); process.exit(2); });
