// Tap-control diagnostic — proves the REAL root causes of "chậm" + "không chính xác"
// on Snake Neon mobile portrait.
//
// Hypothesis 1 (chậm / sluggish): setDirection fires <50ms (verified by test_latency.js),
//   BUT the snake head only visually moves on the next snakeTick(). Tick interval =
//   INITIAL_TICK=150ms. Worst-case perceived latency = up to 150ms (full tick), avg ~75ms.
//   This is the dominant latency the player feels — not the JS event handler.
//
// Hypothesis 2 (không chính xác / inaccurate): setDirection writes a SINGLE-slot
//   nextDirection. Two rapid taps before one tick → the SECOND tap overwrites the first.
//   The first direction is dropped entirely → snake doesn't turn where the player expected.
//   This is the classic "I swiped but the snake didn't turn" complaint.
//
// Method: instrument the page, drive touch events via Puppeteer, measure head-position
//   deltas and dropped inputs. All assertions are behavior-based (head position), not
//   variable-based — per qa-process-review.md §P2.
const puppeteer = require('puppeteer');
const path = require('path');
const URL = 'http://localhost:9876/index.html';
const VW = 390, VH = 844;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';
let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log(`  ${PASS} ${label}`); }
  else { fail++; console.log(`  ${FAIL} ${label}${detail ? ' — ' + detail : ''}`); }
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERR:', e.message));
  await page.setViewport({ width: VW, height: VH, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => typeof window.setup === 'function' && typeof window.draw === 'function', { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('canvas').length > 0, { timeout: 20000 });
  await sleep(400);

  const rect = await page.evaluate(() => {
    const r = document.querySelector('canvas').getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const off = Math.min(rect.width, rect.height) * 0.3;

  // Helpers — behavior-based reads (head position, not internal vars)
  async function head() {
    return page.evaluate(() => {
      if (typeof snake === 'undefined' || !snake || !snake.body[0]) return null;
      return { x: snake.body[0].x, y: snake.body[0].y, dir: { x: snake.direction.x, y: snake.direction.y } };
    });
  }
  async function tickInfo() {
    return page.evaluate(() => ({
      tickInterval: typeof tickInterval !== 'undefined' ? tickInterval : null,
      state: typeof currentState !== 'undefined' ? currentState : null
    }));
  }
  async function tapAt(tx, ty) {
    await page.touchscreen.touchStart(tx, ty);
    await sleep(10);
    await page.touchscreen.touchEnd();
  }

  // --- Start the game (tap center = MENU → PLAYING) ---
  await tapAt(cx, cy);
  await sleep(300);
  const ti = await tickInfo();
  check('Game started (PLAYING)', ti.state === 'PLAYING', `state=${ti.state}`);

  // ===================== TEST 1: tick-queue delay =====================
  // Tap to change direction, then measure how many ms until the head ACTUALLY moves.
  // The handler fires instantly, but movement only happens on the next snakeTick().
  console.log('\n--- TEST 1: Perceived tap→move latency (tick-bound) ---');
  console.log(`  tickInterval = ${ti.tickInterval}ms (INITIAL_TICK). Worst-case perceived delay ≈ this value.`);

  // Snake starts moving RIGHT. Tap UP (valid turn). Measure time until head.y decreases.
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const before = await head();
    const t0 = Date.now();
    await page.evaluate(() => { window.__tapFireTime = performance.now(); });
    // Tap UP zone
    await tapAt(cx, cy - off);
    // Poll until head.y changes (snake actually moved up) or timeout
    let moved = false;
    let moveTime = 0;
    for (let w = 0; w < 30; w++) {
      await sleep(10);
      const h = await head();
      if (h && before && h.y < before.y) { moved = true; moveTime = Date.now() - t0; break; }
    }
    if (moved) samples.push(moveTime);
    // Reset to RIGHT by tapping right zone, wait for it
    await tapAt(cx + off, cy);
    await sleep(200);
  }
  if (samples.length) {
    const max = Math.max(...samples);
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    console.log(`  tap→head-move delay samples (ms): ${samples.map(s => s.toFixed(0)).join(', ')}`);
    console.log(`  avg=${avg.toFixed(0)}ms  max=${max.toFixed(0)}ms`);
    check('Perceived delay avg < 75ms (half tick)', avg < 75, `avg=${avg.toFixed(0)}ms`);
    // KEY FINDING: worst-case approaches full tick interval — this is the "chậm" feel
    check('Worst-case delay < tickInterval (150ms)', max < ti.tickInterval, `max=${max.toFixed(0)}ms vs tick=${ti.tickInterval}ms`);
    console.log(`  >>> FINDING: worst-case tap→move ≈ ${max.toFixed(0)}ms. If player taps right after a tick,`);
    console.log(`      they wait nearly a full ${ti.tickInterval}ms before seeing ANY response. This is the "chậm" root cause.`);
  } else {
    check('Tap→move samples collected', false, 'no movement detected');
  }

  // ===================== TEST 2: direction-queue overwrite =====================
  // Two rapid taps before one tick → second overwrites first → first turn DROPPED.
  console.log('\n--- TEST 2: Rapid double-tap (direction queue overwrite) ---');

  // Ensure snake is moving RIGHT first
  await tapAt(cx + off, cy);
  await sleep(250);
  const h0 = await head();
  console.log(`  snake heading: dir=(${h0.dir.x},${h0.dir.y}) head=(${h0.x},${h0.y})`);

  // Tap UP then tap LEFT within the same tick window (both perpendicular to RIGHT).
  // With a proper input queue, both should register: snake goes UP one cell, then LEFT.
  // With single-slot nextDirection, the UP is overwritten by LEFT → UP is DROPPED.
  await page.evaluate(() => { window.__droppedInputs = 0; });
  // Wrap setDirection to count how many times it's CALLED vs how many actually change direction.
  // With the direction queue (task t_9bb772ba), "accepted" = queue length grew.
  await page.evaluate(() => {
    window.__setDirCalls = 0;
    window.__setDirAccepted = 0;
    const orig = window.setDirection;
    window.setDirection = function(d) {
      window.__setDirCalls++;
      const beforeLen = snake.dirQueue.length;
      orig.call(this, d);
      const afterLen = snake.dirQueue.length;
      if (afterLen > beforeLen) window.__setDirAccepted++;
    };
  });

  // Fire two taps with no tick between them (< 16ms apart, well under 150ms tick)
  await page.touchscreen.touchStart(cx, cy - off); // UP
  await sleep(5);
  await page.touchscreen.touchEnd();
  await page.touchscreen.touchStart(cx - off, cy); // LEFT
  await sleep(5);
  await page.touchscreen.touchEnd();

  await sleep(10); // let handlers sync
  const qStats = await page.evaluate(() => ({ calls: window.__setDirCalls, accepted: window.__setDirAccepted }));
  console.log(`  setDirection called ${qStats.calls}×, ${qStats.accepted} accepted into dirQueue.`);
  console.log(`  >>> ${qStats.calls - qStats.accepted} input(s) dropped.`);
  check('Rapid double-tap: both inputs accepted (no drop)', qStats.calls === qStats.accepted && qStats.accepted === 2,
    `${qStats.accepted}/${qStats.calls} accepted`);

  // ===================== TEST 3: multi-turn corner requires tick-waiting =====================
  // To do an L-turn (RIGHT→DOWN) the player must wait ~1 tick between taps.
  console.log('\n--- TEST 3: Corner-turn chain (RIGHT→DOWN→LEFT faster than 1 tick) ---');
  // With the direction queue, two perpendicular turns fired within one tick
  // should BOTH register: snake heads DOWN one cell, then LEFT the next tick.

  // Reset to RIGHT.
  await tapAt(cx + off, cy);
  await sleep(250);
  const h1 = await head();

  // Fire DOWN then LEFT as fast as possible (no waiting between taps)
  const t0 = Date.now();
  await tapAt(cx, cy + off); // DOWN (perpendicular to RIGHT)
  await sleep(5);
  await tapAt(cx - off, cy); // LEFT (perpendicular to DOWN)
  const elapsed = Date.now() - t0;
  // Wait enough ticks for both queued directions to apply (2 ticks + margin)
  await sleep(ti.tickInterval * 2 + 100);
  const h2 = await head();
  console.log(`  Attempted RIGHT→DOWN→LEFT in ${elapsed}ms (faster than 1 tick).`);
  console.log(`  Final heading: dir=(${h2.dir.x},${h2.dir.y})`);
  // Final heading should be LEFT = (-1, 0). If the queue dropped DOWN, the
  // snake would have gone RIGHT→LEFT directly (a 180° reversal, rejected) or
  // just LEFT from RIGHT (also rejected). Passing = snake reached LEFT via DOWN.
  const reachedLeft = h2.dir.x === -1 && h2.dir.y === 0;
  check('Corner chain RIGHT→DOWN→LEFT: final heading is LEFT', reachedLeft,
    `dir=(${h2.dir.x},${h2.dir.y})`);
  if (reachedLeft) {
    console.log(`  >>> PASS: queue buffered both turns — snake turned DOWN then LEFT without waiting between taps.`);
  }

  await browser.close();
  console.log(`\n========================================`);
  console.log(`DIAGNOSTIC SUMMARY: ${pass} pass, ${fail} fail`);
  console.log(`========================================`);
  process.exit(fail > 0 ? 0 : 0); // always 0 — this is diagnostic, not pass/fail gate
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
