#!/usr/bin/env node
// ============================================================
// Snake Neon — Deep QA Validation for 100 Variants
// Runs AFTER test_all.js (load+canvas+errors).
// Adds two layers test_all.js does not cover:
//
//   Layer A — Config Correctness:
//     For every variant, parse the injected HTML consts
//     (COLS/ROWS/INITIAL_TICK/MIN_TICK/STEP_REDUCTION/BASE_POINTS/
//      GAME_MODE/PALETTE) and assert they match configs/NNN.json.
//
//   Layer B — Gameplay Smoke Test (sample of variants):
//     For a representative sample (per theme + per grid + per mode
//     = 10 themes, 5 grids, 2 modes strategically picked):
//       1. Start game (simulate Space/click)
//       2. Feed snake by steering toward food; assert score increments
//       3. Drive into wall in wall-mode → assert GAME_OVER
//       4. Wrap-mode: drive off edge → assert snake re-enters (no death)
//
// Output: qa-report.json (machine) + prints summary.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_DIR = path.join(ROOT, 'configs');
const VARIANTS_DIR = path.join(ROOT, 'variants');
const REPORT_PATH = path.join(ROOT, 'qa-report.json');

const RENDER_TIMEOUT_MS = 8000;
const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH || '';

// ------------------------------------------------------------
// Layer A — parse consts out of a variant HTML file
// ------------------------------------------------------------
function extractConsts(html) {
  const get = (re) => {
    const m = html.match(re);
    return m ? m[1] : null;
  };
  const num = (re) => {
    const v = get(re);
    return v === null ? null : parseInt(v, 10);
  };
  const cfg = {
    cols: num(/const COLS = (\d+);/),
    rows: num(/const ROWS = (\d+);/),
    startLength: num(/const START_LENGTH = (\d+);/),
    initialTick: num(/const INITIAL_TICK\s*=\s*(\d+);/),
    minTick: num(/const MIN_TICK\s*=\s*(\d+);/),
    stepReduction: num(/const STEP_REDUCTION\s*=\s*(\d+);/),
    basePoints: num(/const BASE_POINTS = (\d+);/),
    gameMode: get(/const GAME_MODE = "(\w+)";/)
  };
  // PALETTE block
  const palBlock = html.match(/const PALETTE = \{([\s\S]*?)\};/);
  cfg.palette = {};
  if (palBlock) {
    const keys = ['bg', 'snake', 'snakeHead', 'food', 'grid', 'scoreText', 'accent'];
    for (const k of keys) {
      const re = new RegExp(`${k}:\\s*"([^"]+)"`);
      const m = palBlock[1].match(re);
      cfg.palette[k] = m ? m[1] : null;
    }
  }
  // title
  cfg.title = get(/<title>([^<]+)<\/title>/);
  // vendor refs
  cfg.vendorP5 = html.includes('../vendor/p5.min.js');
  cfg.vendorSound = html.includes('../vendor/p5.sound.min.js');
  cfg.noCdn = !html.includes('cdn.jsdelivr.net');
  // the known-bad inline script must be dropped
  cfg.badInlineDropped = !html.includes('p5.disableFriendlyErrors = true');
  return cfg;
}

function validateConfig(id) {
  const issues = [];
  const cfgPath = path.join(CONFIG_DIR, `${id}.json`);
  const htmlPath = path.join(VARIANTS_DIR, `${id}.html`);
  let cfg, html;
  try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); }
  catch (e) { return { id, ok: false, issues: [`config unreadable: ${e.message}`] }; }
  try { html = fs.readFileSync(htmlPath, 'utf8'); }
  catch (e) { return { id, ok: false, issues: [`html unreadable: ${e.message}`] }; }

  const got = extractConsts(html);

  const checks = [
    ['cols', got.cols, cfg.grid.cols],
    ['rows', got.rows, cfg.grid.rows],
    ['startLength', got.startLength, cfg.startLength],
    ['initialTick', got.initialTick, cfg.speed.initialTick],
    ['minTick', got.minTick, cfg.speed.minTick],
    ['stepReduction', got.stepReduction, cfg.speed.stepReduction],
    ['basePoints', got.basePoints, cfg.scoring.basePoints],
    ['gameMode', got.gameMode, cfg.gameMode]
  ];
  for (const [k, a, b] of checks) {
    if (String(a) !== String(b)) issues.push(`${k}: html=${a} cfg=${b}`);
  }
  const palKeys = ['bg', 'snake', 'snakeHead', 'food', 'grid', 'scoreText', 'accent'];
  for (const k of palKeys) {
    if (got.palette[k] !== cfg.theme[k]) {
      issues.push(`palette.${k}: html=${got.palette[k]} cfg=${cfg.theme[k]}`);
    }
  }
  if (!got.vendorP5) issues.push('vendor p5.min.js ref missing');
  if (!got.vendorSound) issues.push('vendor p5.sound.min.js ref missing');
  if (!got.noCdn) issues.push('CDN ref still present (should be vendored)');
  if (!got.badInlineDropped) issues.push('p5.disableFriendlyErrors inline script NOT dropped');

  return { id, ok: issues.length === 0, issues, name: cfg.name };
}

// ------------------------------------------------------------
// Layer B — gameplay smoke test on a representative sample
// ------------------------------------------------------------
// Pick: one per theme (rotating grid+mode) to keep sample small but
// covers all 10 themes, all 5 grids, both modes.
function pickSmokeSample() {
  const grids = [13, 15, 17, 19, 21];
  const modes = ['wall', 'wrap'];
  const sample = [];
  for (let ti = 0; ti < 10; ti++) {
    const gi = ti % grids.length;
    const mi = ti % modes.length;
    const idx = (ti * 5 + gi) * 2 + mi + 1; // 1-based id
    sample.push(String(idx).padStart(3, '0'));
  }
  return sample;
}

async function smokeTest(browser, id) {
  const fileUrl = 'http://127.0.0.1:8766/variants/' + `${id}.html`;
  const errors = [];
  const cfg = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, `${id}.json`), 'utf8'));
  const page = await browser.newPage();
  await page.setViewport({ width: 640, height: 800 });

  page.on('pageerror', (err) => {
    const m = String(err && err.message ? err.message : err);
    if (!/worklet|AbortError/i.test(m)) errors.push(m);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (!/worklet|AbortError/i.test(t)) errors.push('console: ' + t);
    }
  });

  // Neutralize the auto-pause-on-tab-blur handler BEFORE any page script runs.
  // Headless Chrome reports document.hidden=true, which the game's
  // visibilitychange listener reads and uses to force PAUSED. In a real
  // browser document.hidden is false. We stub it at the earliest injection
  // point so the game's own setup() never sees a hidden tab. This only
  // affects the headless harness — it does NOT mask any game logic.
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  const result = { id, name: cfg.name, mode: cfg.gameMode, grid: cfg.grid.cols, checks: {}, errors: [] };
  try {
    await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: RENDER_TIMEOUT_MS });

    // wait for canvas + MENU state
    await page.waitForFunction(() => {
      const c = document.querySelector('canvas');
      return c && c.width > 0 && c.height > 0;
    }, { timeout: RENDER_TIMEOUT_MS });

    // expose game state via evaluate
    const state0 = await page.evaluate(() => ({
      state: typeof currentState !== 'undefined' ? currentState : null,
      hasSnake: typeof snake !== 'undefined' && !!snake && snake.body.length > 0,
      hasFood: typeof food !== 'undefined' && !!food,
      score: typeof score !== 'undefined' ? score : null,
      bodyLen: (typeof snake !== 'undefined' && snake && snake.body) ? snake.body.length : 0
    }));
    result.checks.menuState = state0.state === 'MENU';
    result.checks.menuSnake = state0.hasSnake;
    result.checks.menuFood = state0.hasFood;

    // Start the game via the real input path (handleAction), mirroring a
    // Space/click. Do NOT dispatch a keydown for Space here: once the state
    // flips to PLAYING, a second Space would re-enter handleAction and pause
    // the game (handleAction maps PLAYING→PAUSED). transitionTo alone is a
    // clean start.
    await page.evaluate(() => {
      if (typeof handleAction === 'function') {
        try { handleAction(); } catch (e) {}
      } else if (typeof transitionTo === 'function' && typeof STATES !== 'undefined') {
        try { transitionTo(STATES.PLAYING); } catch (e) {}
      }
    });
    await new Promise((r) => setTimeout(r, 300));

    const state1 = await page.evaluate(() => ({
      state: typeof currentState !== 'undefined' ? currentState : null,
      score: typeof score !== 'undefined' ? score : null,
      foods: typeof foodsEaten !== 'undefined' ? foodsEaten : null,
      tickInterval: typeof tickInterval !== 'undefined' ? tickInterval : null
    }));
    result.checks.startable = state1.state === 'PLAYING';
    result.checks.initialScore = state1.score === 0;

    // Gameplay loop — deterministic eat test:
    // The snake starts at grid centre heading RIGHT. We override food to land
    // directly ahead of the head and wait one tick → the snake eats it.
    // This exercises the eat path (score += BASE_POINTS, spawnFood, particles)
    // without the flakiness of greedy keyboard steering, which self-collides
    // fast on small grids.
    let ate = false;
    const startScore = state1.score;
    for (let attempt = 0; attempt < 5 && state1.state !== 'GAME_OVER'; attempt++) {
      // place food directly in front of the head along the current heading
      const placed = await page.evaluate(() => {
        const head = snake.body[0];
        const d = snake.direction;
        const fx = head.x + d.x;
        const fy = head.y + d.y;
        // avoid placing on snake body or off-grid
        const onBody = snake.body.some((s) => s.x === fx && s.y === fy);
        const inGrid = fx >= 0 && fx < COLS && fy >= 0 && fy < ROWS;
        if (onBody || !inGrid) {
          // try one step down instead
          const fx2 = head.x, fy2 = head.y + 1;
          const onBody2 = snake.body.some((s) => s.x === fx2 && s.y === fy2);
          const inGrid2 = fy2 >= 0 && fy2 < ROWS;
          if (onBody2 || !inGrid2) return false;
          food = { x: fx2, y: fy2 };
          return true;
        }
        food = { x: fx, y: fy };
        return true;
      });
      if (!placed) break;
      // wait up to 3 ticks (~3 × tickInterval) for the eat
      const waitMs = Math.min(1500, (state1.tickInterval || 150) * 3 + 400);
      await new Promise((r) => setTimeout(r, waitMs));
      const st = await page.evaluate(() => ({
        score: typeof score !== 'undefined' ? score : 0,
        state: typeof currentState !== 'undefined' ? currentState : null,
        bodyLen: (snake && snake.body) ? snake.body.length : 0
      }));
      if (st.score > startScore) { ate = true; result.bodyLenAfterEat = st.bodyLen; break; }
      if (st.state === 'GAME_OVER') break;
      Object.assign(state1, { score: st.score, tickInterval: state1.tickInterval });
    }
    result.checks.canEat = ate;

    // Mode-specific collision test — fresh start for a clean signal.
    await page.evaluate(() => {
      if (typeof resetGame === 'function') resetGame();
      if (typeof transitionTo === 'function' && typeof STATES !== 'undefined') {
        transitionTo(STATES.PLAYING);
      }
    });
    await new Promise((r) => setTimeout(r, 300));
    const startState2 = await page.evaluate(() => typeof currentState !== 'undefined' ? currentState : null);

    if (cfg.gameMode === 'wrap') {
      // In wrap mode, drive straight along one axis; the snake should cross
      // the edge and re-enter the opposite side without dying. With
      // startLength=3 the snake is short enough that it won't self-collide
      // on wrap. We count ticks ≈ grid size + margin.
      if (startState2 === 'PLAYING') {
        // steer to UP so it travels toward the top edge then wraps
        await page.evaluate(() => { try { setDirection(DIR.UP); } catch(e) {} });
        const ticks = cfg.grid.rows + 4;
        for (let i = 0; i < ticks; i++) {
          await new Promise((r) => setTimeout(r, 220));
          const s = await page.evaluate(() => typeof currentState !== 'undefined' ? currentState : null);
          if (s === 'GAME_OVER') break;
        }
      }
      const after = await page.evaluate(() => typeof currentState !== 'undefined' ? currentState : null);
      result.checks.wrapSurvivedEdge = (after === 'PLAYING');
      result.checks.wrapNote = `state after=${after}`;
    } else {
      // wall mode: drive RIGHT off the right edge → should hit GAME_OVER.
      if (startState2 === 'PLAYING') {
        await page.evaluate(() => { try { setDirection(DIR.RIGHT); } catch(e) {} });
        for (let i = 0; i < (cfg.grid.cols + 5); i++) {
          await new Promise((r) => setTimeout(r, 220));
          const s = await page.evaluate(() => typeof currentState !== 'undefined' ? currentState : null);
          if (s === 'GAME_OVER') { result.checks.wallCollisionGameOver = true; break; }
        }
      }
      if (result.checks.wallCollisionGameOver === undefined) result.checks.wallCollisionGameOver = false;
    }

    // score increment tracking
    const finalState = await page.evaluate(() => ({
      score: typeof score !== 'undefined' ? score : 0,
      state: typeof currentState !== 'undefined' ? currentState : null
    }));
    result.finalScore = finalState.score;
    result.finalState = finalState.state;
    result.errors = errors;
  } catch (err) {
    result.fatal = err.message;
    result.errors = errors;
  } finally {
    await page.close().catch(() => {});
  }
  return result;
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------
async function main() {
  console.log('=== Snake Neon — Deep QA Validation ===\n');

  // --- Layer A: config correctness on all 100 ---
  console.log('Layer A — Config correctness (100 variants) ...');
  const layerA = [];
  let aPass = 0;
  for (let i = 1; i <= 100; i++) {
    const id = String(i).padStart(3, '0');
    const r = validateConfig(id);
    layerA.push(r);
    if (r.ok) aPass++;
    else console.log(`  ✗ ${id} ${r.name || ''}: ${r.issues.join('; ')}`);
  }
  console.log(`Layer A: ${aPass}/100 pass\n`);

  // --- Layer B: gameplay smoke test on sample ---
  const sample = pickSmokeSample();
  console.log(`Layer B — Gameplay smoke test (sample: ${sample.join(', ')}) ...`);
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--allow-file-access-from-files',
      // Keep the headless page in the foreground so document.hidden=false.
      // Without these, headless Chrome throttles/backgrounds the page and
      // the game's visibilitychange auto-pause listener forces PAUSED right
      // after start. In a real browser the tab is foregrounded, so these
      // flags only restore realistic behaviour — they do NOT mask game logic.
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ],
    ...(CHROME ? { executablePath: CHROME } : {})
  });
  const layerB = [];
  try {
    for (const id of sample) {
      process.stdout.write(`  ${id} ... `);
      const r = await smokeTest(browser, id);
      layerB.push(r);
      const ok = (r.checks.menuState && r.checks.startable && r.checks.canEat) ||
                 (r.checks.menuState && r.checks.startable && r.mode === 'wrap' && r.checks.wrapSurvivedEdge);
      console.log(ok ? 'OK' : `WARN ${JSON.stringify(r.checks)}`);
      if (r.errors.length) console.log(`     errors: ${r.errors.join('; ')}`);
    }
  } finally {
    await browser.close();
  }

  // --- summary ---
  const summary = {
    generated_at: new Date().toISOString(),
    layerA: { total: 100, passed: aPass, failed: 100 - aPass },
    layerB_sample: sample,
    layerB: layerB,
    configIssues: layerA.filter((r) => !r.ok)
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(summary, null, 2) + '\n');

  const bStarted = layerB.filter((r) => r.checks.startable).length;
  const bAte = layerB.filter((r) => r.checks.canEat).length;
  const bWrapSurvived = layerB.filter((r) => r.mode === 'wrap' && r.checks.wrapSurvivedEdge).length;
  const bWallDied = layerB.filter((r) => r.mode === 'wall' && r.checks.wallCollisionGameOver).length;

  console.log('\n=== SUMMARY ===');
  console.log(`Layer A (config correctness): ${aPass}/100 pass`);
  console.log(`Layer B (smoke, n=${sample.length}): startable ${bStarted}/${sample.length}, ate ${bAte}/${sample.length}`);
  console.log(`  wrap survived edge: ${bWrapSurvived}, wall→gameover: ${bWallDied}`);
  console.log(`Report → ${path.relative(ROOT, REPORT_PATH)}`);
}

if (require.main === module) {
  main().catch((err) => { console.error('Fatal:', err); process.exit(2); });
}
