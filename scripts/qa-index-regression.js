#!/usr/bin/env node
// ============================================================
// Snake Neon — index.html Regression Test
// Task: t_e993c8dd
// 
// Regression test cho index.html GỐC (không phải variants/).
// Dựa trên qa-process-review.md §3 P2: assertion đo HEAD POSITION
// DELTA, không đo internal state (nextDirection var).
//
// Test cases:
//   TC1. Load index.html → 0 JS error
//   TC2. Canvas render (element tồn tại + có pixel)
//   TC3. Game start → state = PLAYING
//   TC4. Direction change (keyboard) → head position delta đúng
//   TC5. Snake tick → head actually moves (behavior, not var)
//   TC6. Wall collision → GAME_OVER transition
//
// Chạy: node scripts/qa-index-regression.js
// Cần: puppeteer (đã trong package.json)
// ============================================================
'use strict';

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(PROJECT_ROOT, 'index.html');
// Prefer HTTP server (avoids file:// CORS/worklet issues). Fall back to file://.
const FILE_URL = process.env.QA_URL || 'http://127.0.0.1:8766/index.html';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ============================================================
// Result tracking
// ============================================================
const results = [];
let passed = 0, failed = 0;

function record(name, ok, detail) {
  const status = ok ? 'PASS' : 'FAIL';
  results.push({ name, status, detail: detail || '' });
  if (ok) passed++;
  else failed++;
  const tag = ok ? '\x1b[32m' : '\x1b[31m';
  console.log(`${tag}${status}\x1b[0m ${name}${detail ? ' — ' + detail : ''}`);
}

// ============================================================
// Helpers
// ============================================================

// Read top-level let/const from the page's global lexical scope via
// bare identifier reference inside evaluate (p5 sketches are not on window).
function readState(page) {
  return page.evaluate(() => {
    try {
      const s = (typeof snake !== 'undefined') ? snake : null;
      return {
        state:   typeof currentState !== 'undefined' ? currentState : null,
        score:   typeof score !== 'undefined' ? score : null,
        foods:   typeof foodsEaten !== 'undefined' ? foodsEaten : null,
        tickInterval: typeof tickInterval !== 'undefined' ? tickInterval : null,
        dir:     (s && s.direction) ? { x: s.direction.x, y: s.direction.y } : null,
        nextDir: (s && s.nextDirection) ? { x: s.nextDirection.x, y: s.nextDirection.y } : null,
        head:    (s && s.body && s.body[0]) ? { x: s.body[0].x, y: s.body[0].y } : null,
        bodyLen: (s && s.body) ? s.body.length : 0,
        food:    (typeof food !== 'undefined' && food) ? { x: food.x, y: food.y } : null,
        canvasW: typeof canvasW !== 'undefined' ? canvasW : null,
        canvasH: typeof canvasH !== 'undefined' ? canvasH : null,
      };
    } catch (e) {
      return { error: e.message };
    }
  });
}

async function startGame(page) {
  // #pauseBtn shows "▶ START" on MENU; clicking calls handleAction()
  await page.click('#pauseBtn');
  await sleep(300); // let tick accumulator ramp up
  const st = await readState(page);
  return st.state === 'PLAYING';
}

// Read canvas pixel data to verify rendering (not just element existence)
async function canvasHasContent(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { exists: false, hasPixels: false };
    try {
      const ctx = canvas.getContext('2d');
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      // Check if there are any non-background pixels (background is #0a0a0f ≈ dark)
      let nonBgCount = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i+1], b = data[i+2];
        // Non-background: any channel significantly above the dark bg
        if (r > 20 || g > 20 || b > 20) {
          nonBgCount++;
        }
      }
      return {
        exists: true,
        width: canvas.width,
        height: canvas.height,
        hasPixels: nonBgCount > 100, // at least some rendered content
        nonBgCount,
      };
    } catch (e) {
      return { exists: true, hasPixels: false, error: e.message };
    }
  });
}

// ============================================================
// MAIN
// ============================================================
(async () => {
  console.log('===========================================');
  console.log('Snake Neon — index.html Regression Test');
  console.log('===========================================\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 600, height: 700, hasTouch: true });

  // --- Collect JS console errors ---
  // Filter out non-bugs: favicon 404 (browser auto-request), CDN worklet
  // load issues on file:// (environment, not code bug).
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // favicon 404 is a browser auto-request, not a code bug
    if (/favicon/i.test(text)) return;
    // 404 resource errors that aren't JS/code are noise for this test
    if (/404/i.test(text) && !/\.js/i.test(text)) return;
    consoleErrors.push(text);
  });
  page.on('pageerror', (err) => {
    // Ignore AbortError from worklets on file:// (environment issue)
    if (/AbortError.*worklet/i.test(err.message)) return;
    consoleErrors.push('PAGE ERROR: ' + err.message);
  });

  try {

    // ============================================================
    // TC1. LOAD — index.html loads without JS error
    // ============================================================
    console.log('\n--- TC1: Load index.html (no JS error) ---\n');

    await page.goto(FILE_URL, { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(1500); // let p5 setup() run

    const noJSError = consoleErrors.length === 0;
    const errorDetail = consoleErrors.length > 0
      ? `${consoleErrors.length} error(s): ${consoleErrors.slice(0,3).join(' | ')}`
      : '0 console errors';
    
    record('TC1.1 No JS console error on load', noJSError, errorDetail);

    // ============================================================
    // TC2. CANVAS RENDER — canvas element + actual pixels
    // ============================================================
    console.log('\n--- TC2: Canvas render ---\n');

    const canvasInfo = await canvasHasContent(page);

    record('TC2.1 Canvas element exists', canvasInfo.exists,
      canvasInfo.exists ? `${canvasInfo.width}x${canvasInfo.height}` : 'no <canvas> found');

    if (canvasInfo.exists) {
      record('TC2.2 Canvas has rendered content (pixels)', canvasInfo.hasPixels,
        canvasInfo.nonBgCount != null
          ? `${canvasInfo.nonBgCount} non-background pixels`
          : canvasInfo.error || 'could not read pixels');
    }

    // ============================================================
    // TC3. GAME START — state transitions to PLAYING
    // ============================================================
    console.log('\n--- TC3: Game start ---\n');

    const stateBefore = await readState(page);
    record('TC3.1 Initial state is MENU',
      stateBefore.state === 'MENU' || stateBefore.state === 0,
      `currentState = ${stateBefore.state}`);

    const started = await startGame(page);
    const stateAfter = await readState(page);

    record('TC3.2 State transitions to PLAYING after start',
      stateAfter.state === 'PLAYING' || stateAfter.state === 1,
      `currentState = ${stateAfter.state}`);

    // ============================================================
    // TC4. DIRECTION CHANGE — KEYBOARD, HEAD POSITION DELTA
    // (Post-mortem P2: assert head delta, not nextDirection var)
    // ============================================================
    console.log('\n--- TC4: Direction change via keyboard (HEAD POSITION DELTA) ---\n');

    // Snake starts moving RIGHT (direction.x=1, y=0).
    // We'll send DOWN arrow and verify head.y INCREASES over ticks.
    //
    // CRITICAL: We do NOT check snake.nextDirection or snake.direction vars.
    // We measure the actual head position before and after, then compare delta.

    const tickInterval = stateAfter.tickInterval || 150;

    // --- 4a: Measure baseline movement (RIGHT) over 2 ticks ---
    const headBefore = stateAfter.head;
    await sleep(tickInterval * 2 + 50);
    const headAfterRight = await readState(page);

    if (!headAfterRight.head || !headBefore) {
      record('TC4.0 Head position readable', false, 'head is null');
    } else {
      record('TC4.0 Head position readable', true,
        `head = (${headBefore.x},${headBefore.y}) → (${headAfterRight.head.x},${headAfterRight.head.y})`);

      const deltaX0 = headAfterRight.head.x - headBefore.x;
      const deltaY0 = headAfterRight.head.y - headBefore.y;

      record('TC4.1 Snake moving RIGHT initially (head.x increases)',
        deltaX0 > 0 && deltaY0 === 0,
        `delta = (${deltaX0},${deltaY0})`);

      // --- 4b: Press DOWN arrow → head.y should increase ---
      // Snake default dir = RIGHT. Pressing DOWN sets nextDir=DOWN.
      // After tick: direction=DOWN, head.y += 1 per tick.
      const headBeforeDown = (await readState(page)).head;
      await page.keyboard.press('ArrowDown');
      await sleep(tickInterval * 3 + 100); // wait 3 ticks for it to take effect
      const headAfterDown = await readState(page);

      if (headAfterDown.head && headBeforeDown) {
        const deltaY = headAfterDown.head.y - headBeforeDown.y;
        const deltaX = headAfterDown.head.x - headBeforeDown.x;

        // After pressing DOWN, head.y should increase (y grows downward in grid).
        // deltaX should be 0 or small (snake turning). deltaY must be > 0.
        record('TC4.2 DOWN arrow → head.y increases (head position delta)',
          deltaY > 0,
          `delta = (x:${deltaX}, y:${deltaY}) — expected y > 0`);

        // Also verify: head moved at all (behavior, not just var set)
        const moved = Math.abs(deltaX) + Math.abs(deltaY) > 0;
        record('TC4.3 Head actually moved (behavior verified, not just var)',
          moved,
          moved ? `total displacement = ${Math.abs(deltaX) + Math.abs(deltaY)} cells` : 'head did NOT move');

      } else {
        record('TC4.2 DOWN arrow → head.y increases', false, 'head is null after keypress');
        record('TC4.3 Head actually moved', false, 'head is null');
      }

      // --- 4c: Press LEFT arrow → head.x should decrease ---
      const headBeforeLeft = (await readState(page)).head;
      await page.keyboard.press('ArrowLeft');
      await sleep(tickInterval * 3 + 100);
      const headAfterLeft = await readState(page);

      if (headAfterLeft.head && headBeforeLeft) {
        const deltaX = headAfterLeft.head.x - headBeforeLeft.x;
        const deltaY = headAfterLeft.head.y - headBeforeLeft.y;

        record('TC4.4 LEFT arrow → head.x decreases (head position delta)',
          deltaX < 0,
          `delta = (x:${deltaX}, y:${deltaY}) — expected x < 0`);
      } else {
        record('TC4.4 LEFT arrow → head.x decreases', false, 'head is null');
      }
    }

    // ============================================================
    // TC5. SCORE INCREASE ON EAT (behavior)
    // ============================================================
    console.log('\n--- TC5: Score behavior (optional, best-effort) ---\n');

    // We can't easily force the snake to eat food in headless, but we can
    // verify the score variable is accessible and the food exists.
    const st5 = await readState(page);
    record('TC5.1 Game state accessible (score, food, snake)',
      st5.score != null && st5.food != null && st5.head != null,
      `score=${st5.score}, food=(${st5.food ? st5.food.x + ',' + st5.food.y : 'null'}), head=(${st5.head ? st5.head.x + ',' + st5.head.y : 'null'})`);

    // ============================================================
    // TC6. WALL COLLISION → GAME_OVER (behavior)
    // ============================================================
    console.log('\n--- TC6: Wall collision → GAME_OVER ---\n');

    // Strategy: force snake toward a wall by spamming one direction.
    // If already near a wall, just wait. Otherwise press toward nearest wall.
    const st6 = await readState(page);
    if (st6.state !== 'PLAYING') {
      // Restart if needed
      await page.click('#pauseBtn');
      await sleep(300);
    }

    // Spam LEFT to drive snake into the left wall (x=0)
    let attempts = 0;
    let gameOver = false;
    const st6b = await readState(page);
    const startX = st6b.head ? st6b.head.x : 8;

    // Press LEFT repeatedly to reach wall
    while (attempts < 40 && !gameOver) {
      await page.keyboard.press('ArrowLeft');
      await sleep(tickInterval + 30);
      const st = await readState(page);
      if (st.state === 'GAME_OVER' || st.state === 3) {
        gameOver = true;
      }
      attempts++;
    }

    record('TC6.1 Wall collision → state transitions to GAME_OVER',
      gameOver,
      gameOver ? `hit wall after ${attempts} LEFT presses` : `did not hit wall in ${attempts} attempts (snake may have turned)`);

    // ============================================================
    // SUMMARY
    // ============================================================
    console.log('\n===========================================');
    console.log('SUMMARY');
    console.log('===========================================');
    console.log(`Total: ${results.length}  |  PASS: ${passed}  |  FAIL: ${failed}`);
    console.log('===========================================\n');

    // Write JSON report
    const reportPath = path.join(PROJECT_ROOT, 'qa-index-regression-report.json');
    const report = {
      test: 'index.html regression',
      task: 't_e993c8dd',
      timestamp: new Date().toISOString(),
      file: FILE_URL,
      total: results.length,
      passed,
      failed,
      results,
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`Report: ${reportPath}\n`);

  } catch (err) {
    console.error('\nFATAL ERROR:', err.message);
    console.error(err.stack);
    failed++;
  } finally {
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }

})();
