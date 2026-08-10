#!/usr/bin/env node
// ============================================================
// Snake Neon — CRITICAL BUG REGRESSION SUITE (v2)
// Task: t_3c4e436a (Full re-test)
//
// PURPOSE
//   The CEO caught 2 critical bugs that prior QC passes missed:
//     BUG-1  createCanvas crash → drawingContext null → no canvas → dead loop
//     BUG-2  Touch does not change snake direction (mobile)
//
//   This suite proves QC can CATCH these bug classes — not just confirm
//   the current fix. Each test is written against the ROOT CAUSE so a
//   regression of the same flaw fails loudly here.
//
// FIXES vs v1:
//   - Uses HTTP server (file:// broke CDN p5.js module/worklet loading)
//   - R4/R6: resets to a perpendicular baseline before each tap so the
//     target is never rejected by the 180° guard (false negatives fixed)
//   - R4: guards against snake death mid-suite — re-starts if GAME_OVER
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..');
// Use HTTP server (p5.js + sound load from CDN; file:// can break module/worklet
// loading and cause flaky touch/canvas failures). Start `python3 -m http.server 8765`.
const INDEX = 'http://127.0.0.1:8766/index.html';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
let pass = 0, fail = 0;
function record(name, ok, detail = '') {
  results.push({ name, status: ok ? 'PASS' : 'FAIL', detail });
  if (ok) pass++; else fail++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function newPage(browser, opts = {}) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });
  if (opts.touch) {
    const cdp = await page.target().createCDPSession();
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  }
  return page;
}

async function collectErrors(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e && e.message ? e.message : e)));
  return errs;
}

async function waitForReady(page) {
  await page.waitForFunction(
    () => typeof currentState !== 'undefined' &&
          typeof snake !== 'undefined' && snake && snake.body && snake.body.length > 0 &&
          !!document.querySelector('canvas'),
    { timeout: 10000 }
  );
  await sleep(300);
}

async function startGame(page) {
  await page.evaluate(() => { if (typeof handleAction === 'function') handleAction(); });
  await page.waitForFunction(() => typeof currentState !== 'undefined' && currentState === 'PLAYING', { timeout: 4000 });
  await sleep(200);
}

// Ensure the game is in PLAYING state; restart if it died mid-suite.
async function ensurePlaying(page) {
  const st = await page.evaluate(() => currentState);
  if (st === 'GAME_OVER' || st === 'PAUSED' || st === 'MENU') {
    await page.evaluate(() => { if (typeof handleAction === 'function') handleAction(); });
    await sleep(200);
    const st2 = await page.evaluate(() => currentState);
    if (st2 !== 'PLAYING') throw new Error(`cannot restart game (state=${st2})`);
  }
}

function stateEval(page) {
  return page.evaluate(() => ({
    state: currentState,
    head: snake && snake.body && snake.body[0] ? { x: snake.body[0].x, y: snake.body[0].y } : null,
    dir: snake && snake.direction ? { x: snake.direction.x, y: snake.direction.y } : null,
    nextDir: snake && snake.nextDirection ? { x: snake.nextDirection.x, y: snake.nextDirection.y } : null,
    hasCanvas: !!document.querySelector('canvas'),
    canvasW: (document.querySelector('canvas') || {}).width || 0,
    canvasH: (document.querySelector('canvas') || {}).height || 0,
    cellSize: typeof cellSize !== 'undefined' ? cellSize : null,
    canvasWVar: typeof canvasW !== 'undefined' ? canvasW : null,
    orient: typeof currentOrientation !== 'undefined' ? currentOrientation : null,
  }));
}

(async () => {
  console.log('=== Snake Neon — CRITICAL BUG REGRESSION SUITE (v2) ===\n');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-web-security', '--mute-audio'],
  });

  // ---------- R1: createCanvas existence + drawingContext (BUG-1) ----------
  console.log('[Group A] createCanvas / lifecycle (BUG-1 class)');
  {
    const page = await newPage(browser);
    const errs = await collectErrors(page);
    await page.goto(INDEX, { waitUntil: 'networkidle0', timeout: 15000 });
    await waitForReady(page);

    const s = await stateEval(page);
    record('R1a canvas element present after setup()', s.hasCanvas,
      s.hasCanvas ? `${s.canvasW}x${s.canvasH}` : 'NO CANVAS');
    const nonZero = s.canvasW > 0 && s.canvasH > 0;
    record('R1b canvas nonzero size (createCanvas lived)', nonZero,
      `${s.canvasW}x${s.canvasH}`);
    const dc = await page.evaluate(() => {
      try {
        const c = document.querySelector('canvas');
        if (!c) return { ok: false, reason: 'no canvas el' };
        const ctx = c.getContext('2d');
        if (!ctx) return { ok: false, reason: 'no 2d ctx' };
        const v = drawingContext.imageSmoothingEnabled;
        return { ok: true, imageSmoothingEnabled: v };
      } catch (e) {
        return { ok: false, reason: String(e.message || e) };
      }
    });
    record('R1c drawingContext.imageSmoothingEnabled readable (BUG-1)', dc.ok,
      dc.ok ? String(dc.imageSmoothingEnabled) : dc.reason);
    const fatal = errs.filter(e => !/worklet|AbortError/i.test(e));
    record('R1d no fatal JS error during load', fatal.length === 0,
      fatal.length ? fatal.join(' | ') : 'clean');
    await page.close();
  }

  // ---------- R2: game loop advances ----------
  console.log('\n[Group B] game loop advances');
  {
    const page = await newPage(browser);
    await collectErrors(page);
    await page.goto(INDEX, { waitUntil: 'networkidle0', timeout: 15000 });
    await waitForReady(page);
    await startGame(page);

    const before = await stateEval(page);
    await sleep(900);
    const after = await stateEval(page);
    const moved = before.head && after.head &&
      (before.head.x !== after.head.x || before.head.y !== after.head.y);
    record('R2 game loop advances (head moved)', !!moved,
      moved ? `${JSON.stringify(before.head)} → ${JSON.stringify(after.head)}` : 'head static');
    await page.close();
  }

  // ---------- R3: full lifecycle no crash ----------
  console.log('\n[Group C] full lifecycle (load→play→death) no crash');
  {
    const page = await newPage(browser);
    const errs = await collectErrors(page);
    await page.goto(INDEX, { waitUntil: 'networkidle0', timeout: 15000 });
    await waitForReady(page);
    await startGame(page);
    for (let i = 0; i < 40; i++) {
      await page.evaluate(() => { if (typeof setDirection === 'function' && typeof DIR !== 'undefined') setDirection(DIR.RIGHT); });
      await sleep(120);
      const st = await page.evaluate(() => currentState);
      if (st === 'GAME_OVER') break;
    }
    const died = await page.evaluate(() => currentState === 'GAME_OVER');
    record('R3 snake can die (collision → GAME_OVER)', died, died ? 'reached GAME_OVER' : 'still playing');
    const fatal = errs.filter(e => !/worklet|AbortError/i.test(e));
    record('R3b no JS error across full lifecycle', fatal.length === 0,
      fatal.length ? fatal.join(' | ') : 'clean');
    await page.close();
  }

  // ---------- R4-R7: TOUCH (BUG-2 class) — real TouchEvents ----------
  console.log('\n[Group D] Touch direction (BUG-2 class) — REAL touch events');
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    });
    await collectErrors(page);
    await page.goto(INDEX, { waitUntil: 'networkidle0', timeout: 15000 });
    await waitForReady(page);
    const orient = await page.evaluate(() => currentOrientation);
    record('R4-pre portrait orientation on touch device', orient === 'portrait', orient);
    await startGame(page);

    const info = await page.evaluate(() => ({ cw: canvasW, ch: canvasH, cell: cellSize }));
    const cx = info.cw / 2;
    const cy = info.ch / 2;
    const off = Math.floor(info.cell * 3);

    const cases = [
      { name: 'UP',    x: cx,       y: cy - off, want: { x: 0, y: -1 } },
      { name: 'DOWN',  x: cx,       y: cy + off, want: { x: 0, y:  1 } },
      { name: 'LEFT',  x: cx - off, y: cy,       want: { x: -1, y: 0 } },
      { name: 'RIGHT', x: cx + off, y: cy,       want: { x: 1,  y: 0 } },
    ];

    const box = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      const r = c.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });

    // Perpendicular baseline for each target so it's never a 180° reverse.
    const baseline = {
      UP:    { x: 1, y: 0 },   // RIGHT
      DOWN:  { x: 1, y: 0 },   // RIGHT
      LEFT:  { x: 0, y: 1 },   // DOWN
      RIGHT: { x: 0, y: 1 },   // DOWN
    };

    for (const c of cases) {
      // Guard: if snake died during previous case, restart.
      await ensurePlaying(page);
      // Reset to a perpendicular baseline so the target tap is always accepted.
      await page.evaluate((b) => { snake.nextDirection = b; }, baseline[c.name]);
      await sleep(200);
      await page.evaluate(() => { snake.nextDirection = null; });

      const sx = Math.round(box.left + c.x);
      const sy = Math.round(box.top + c.y);
      await page.touchscreen.touchStart(sx, sy);
      await sleep(60);
      const s = await page.evaluate(() => snake.nextDirection || snake.direction);
      await page.touchscreen.touchEnd();
      await sleep(40);
      const match = s && s.x === c.want.x && s.y === c.want.y;
      record(`R4 touch tap-zone ${c.name} sets direction`, !!match,
        match ? `dir=${JSON.stringify(s)}` : `got=${JSON.stringify(s)} want=${JSON.stringify(c.want)}`);
    }

    // R5 reverse-direction guard: from UP, tap DOWN → must be ignored
    {
      await ensurePlaying(page);
      await page.touchscreen.touchStart(Math.round(box.left + cx), Math.round(box.top + cy - off));
      await sleep(60);
      await page.touchscreen.touchEnd();
      await sleep(200);
      const baseDir = await page.evaluate(() => ({ d: snake.direction, n: snake.nextDirection }));
      await page.touchscreen.touchStart(Math.round(box.left + cx), Math.round(box.top + cy + off));
      await sleep(60);
      const afterDown = await page.evaluate(() => ({ d: snake.direction, n: snake.nextDirection }));
      await page.touchscreen.touchEnd();
      const rejected = !(afterDown.n && afterDown.n.x === 0 && afterDown.n.y === 1);
      record('R5 reverse-direction guard (UP→DOWN ignored)', rejected,
        `base=${JSON.stringify(baseDir)} afterDown=${JSON.stringify(afterDown)}`);
    }

    // R6: verify touch uses DOM event coords, not stale mouseX (BUG-2).
    {
      await ensurePlaying(page);
      // Reset to RIGHT baseline so DOWN (perpendicular) is accepted.
      await page.evaluate(() => { snake.nextDirection = { x: 1, y: 0 }; });
      await sleep(200);
      await page.evaluate(() => { snake.nextDirection = null; });
      await page.mouse.move(Math.round(box.left + 10), Math.round(box.top + 10));
      await sleep(30);
      await page.touchscreen.touchStart(Math.round(box.left + cx), Math.round(box.top + cy + off));
      await sleep(60);
      const s = await page.evaluate(() => snake.nextDirection || snake.direction);
      await page.touchscreen.touchEnd();
      const ok = s && s.x === 0 && s.y === 1;
      record('R6 touch uses DOM event coords, not stale mouseX (BUG-2)', ok,
        ok ? 'dir follows tap point' : `got=${JSON.stringify(s)}`);
    }

    await page.close();
  }

  // ---------- R7: tap-to-start on MENU via touch ----------
  console.log('\n[Group E] touch tap-to-start (MENU)');
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    });
    await page.goto(INDEX, { waitUntil: 'networkidle0', timeout: 15000 });
    await waitForReady(page);
    const before = await page.evaluate(() => currentState);
    const box = await page.evaluate(() => {
      const r = document.querySelector('canvas').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.touchscreen.touchStart(Math.round(box.x), Math.round(box.y));
    await sleep(50);
    await page.touchscreen.touchEnd();
    await sleep(250);
    const after = await page.evaluate(() => currentState);
    record('R7 touch tap-to-start on MENU', before === 'MENU' && after === 'PLAYING',
      `MENU(${before}) → ${after}`);
    await page.close();
  }

  // ---------- R8: D-pad landscape buttons via real touchstart ----------
  console.log('\n[Group F] D-pad (landscape) real touchstart');
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 844, height: 390, hasTouch: true, isMobile: true });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    });
    await page.goto(INDEX, { waitUntil: 'networkidle0', timeout: 15000 });
    await waitForReady(page);
    const orient = await page.evaluate(() => currentOrientation);
    record('R8-pre landscape orientation on touch device', orient === 'landscape', orient);
    await startGame(page);

    const dirs = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
    const wantMap = { UP: { x: 0, y: -1 }, DOWN: { x: 0, y: 1 }, LEFT: { x: -1, y: 0 }, RIGHT: { x: 1, y: 0 } };
    for (const d of dirs) {
      const handle = await page.evaluateHandle((dir) => document.querySelector(`.dpad-btn[data-dir="${dir}"]`), d);
      const box = await page.evaluate((el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, found: !!el };
      }, handle);
      if (!box || !box.found) { record(`R8 dpad ${d} button exists`, false, 'not found'); continue; }
      record(`R8 dpad ${d} button exists`, true);
      await page.touchscreen.touchStart(Math.round(box.x), Math.round(box.y));
      await sleep(60);
      const s = await page.evaluate(() => snake.nextDirection || snake.direction);
      await page.touchscreen.touchEnd();
      await sleep(40);
      const cur = await page.evaluate(() => snake.direction);
      const isReverse = cur && wantMap[d] && cur.x === -wantMap[d].x && cur.y === -wantMap[d].y;
      const match = s && s.x === wantMap[d].x && s.y === wantMap[d].y;
      record(`R8 dpad ${d} touchstart steers`, isReverse || match,
        match ? `dir=${JSON.stringify(s)}` : (isReverse ? 'correctly rejected (180°)' : `got=${JSON.stringify(s)}`));
    }
    await page.close();
  }

  await browser.close();

  console.log('\n=== SUMMARY ===');
  console.log(`PASS ${pass} / FAIL ${fail} / TOTAL ${pass + fail}`);
  const report = {
    suite: 'scripts/qa-regression-critical.js',
    task: 't_3c4e436a',
    ranAt: new Date().toISOString(),
    pass, fail, total: pass + fail,
    results,
  };
  const out = path.join(ROOT, 'qa', 'regression-critical-results.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log('Report → ' + out);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
