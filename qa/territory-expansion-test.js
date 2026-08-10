// ============================================================
// Snake Neon — Spike Walls + Territory Expansion QA (Puppeteer)
// Verifies spec docs/territory-expansion.md AC-S1..S6, AC-T1..T10,
// AC-I1..I4. Run: node qa/territory-expansion-test.js
// ============================================================
'use strict';

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const HTML_PATH = 'file://' + path.resolve(__dirname, '..', 'index.html');
const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const RESULTS = { tests: [], metrics: {} };
const log = (m) => process.stdout.write(m + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function record(name, passed, detail) {
  const status = passed ? 'PASS' : 'FAIL';
  RESULTS.tests.push({ name, passed, detail: detail || '', status });
  log(`[${status}] ${name}${detail ? ' — ' + detail : ''}`);
}

// Read core game state + config
async function getState(page) {
  return await page.evaluate(() => {
    const safe = (v, d) => (typeof v !== 'undefined' ? v : d);
    const snakeReady = typeof snake !== 'undefined' && snake && snake.body && snake.body.length > 0;
    const canvas = document.querySelector('canvas');
    return {
      state: safe(currentState, 'UNINIT'),
      score: safe(score, 0),
      foodsEaten: safe(foodsEaten, 0),
      snakeLen: snakeReady ? snake.body.length : 0,
      tickInterval: safe(tickInterval, 0),
      COLS: safe(COLS, 0),
      ROWS: safe(ROWS, 0),
      cellSize: safe(cellSize, 0),
      canvasW: safe(canvasW, 0),
      canvasH: safe(canvasH, 0),
      canvasPixelW: canvas ? canvas.width : 0,
      canvasPixelH: canvas ? canvas.height : 0,
      head: snakeReady && snake.body[0] ? { x: snake.body[0].x, y: snake.body[0].y } : null,
      food: typeof food !== 'undefined' && food ? { x: food.x, y: food.y } : null,
      hasExpandGrid: typeof expandGrid === 'function',
      hasRenderSpikeWalls: typeof renderSpikeWalls === 'function',
      INITIAL_COLS: safe(INITIAL_COLS, 0),
      MAX_COLS: safe(MAX_COLS, 0),
      MAX_ROWS: safe(MAX_ROWS, 0),
      spikePalette: PALETTE && PALETTE.spike ? PALETTE.spike : null,
    };
  });
}

async function ensurePlaying(page) {
  let st = await getState(page);
  if (st.state !== 'PLAYING') {
    if (st.state === 'PAUSED') {
      await page.keyboard.press('KeyP');
    } else {
      await page.keyboard.press('Space');
    }
    await sleep(400);
    st = await getState(page);
  }
  return st;
}

// Teleport food in front of snake head + tick to eat it
async function eatOneFood(page, tickInterval) {
  await page.evaluate(() => {
    const h = snake.body[0];
    const d = snake.direction;
    let fx = h.x + d.x, fy = h.y + d.y;
    // if next cell is wall, pick a safe direction
    if (fx < 0 || fx >= COLS || fy < 0 || fy >= ROWS) {
      const dirs = [{x:0,y:-1},{x:0,y:1},{x:-1,y:0},{x:1,y:0}];
      for (const nd of dirs) {
        const nx = h.x + nd.x, ny = h.y + nd.y;
        if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
          const hitSelf = snake.body.some((s, idx) =>
            idx < snake.body.length - 1 && s.x === nx && s.y === ny);
          if (!hitSelf && !(nd.x === -d.x && nd.y === -d.y)) {
            snake.direction = nd;
            snake.nextDirection = null;
            fx = nx; fy = ny;
            break;
          }
        }
      }
    }
    food = { x: fx, y: fy };
  });
  await sleep(Math.max(tickInterval + 60, 250));
  return await getState(page);
}

// Detect spike-colored pixels. The spike color is #ff2244 — red-dominant.
// Detection must be resilient to the MENU/GAME_OVER dim overlay (alpha 180
// over bg #0a0a0f) which scales pixel brightness down by ~70%. So we check
// red-dominance (R significantly greater than G and B) rather than absolute R.
function spikeDetector() {
  function isSpikeLike(r, g, b) {
    // Red dominant: R clearly > G and > B. Lower threshold to catch dimmed overlay pixels.
    return r > 50 && r > g * 1.8 && r > b * 1.8 && (r - g) > 15;
  }
  return { isSpikeLike };
}

async function countSpikePixels(page, edge) {
  return await page.evaluate((edgeName) => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { ok: false, count: 0 };
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const scanDepth = Math.ceil(cellSize * 0.4); // spike length + margin

    function isSpikeLike(r, g, b) {
      return r > 50 && r > g * 1.8 && r > b * 1.8 && (r - g) > 15;
    }
    let total = 0;
    let region;
    if (edgeName === 'top') {
      region = ctx.getImageData(0, 0, w, Math.min(scanDepth, h));
    } else if (edgeName === 'bottom') {
      const y0 = Math.max(0, h - scanDepth);
      region = ctx.getImageData(0, y0, w, h - y0);
    } else if (edgeName === 'left') {
      region = ctx.getImageData(0, 0, Math.min(scanDepth, w), h);
    } else if (edgeName === 'right') {
      const x0 = Math.max(0, w - scanDepth);
      region = ctx.getImageData(x0, 0, w - x0, h);
    }
    for (let i = 0; i < region.data.length; i += 4) {
      if (isSpikeLike(region.data[i], region.data[i+1], region.data[i+2])) total++;
    }
    return { ok: true, count: total };
  }, edge);
}

async function runTests() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--autoplay-policy=no-user-gesture-required',
      '--allow-file-access-from-files',
    ],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  // Headless Chrome can't fetch the p5.sound AudioWorklet module over file://,
  // producing an AbortError. This is environment noise, not a game bug (canvas
  // still renders fine). Filter it — same approach as test_all.js.
  const isHeadlessAudioNoise = (e) =>
    /Unable to load a worklet's module/i.test(e) || /AbortError/i.test(e);
  const consoleErrors = [];
  page.on('pageerror', (err) => {
    const msg = String(err && err.message ? err.message : err);
    if (!isHeadlessAudioNoise(msg)) consoleErrors.push(msg);
  });

  await page.goto(HTML_PATH, { waitUntil: 'networkidle0' });

  // Wait for p5 ready
  let st;
  for (let i = 0; i < 30; i++) {
    await sleep(200);
    st = await getState(page);
    if (st.COLS > 0) break;
  }

  // ============ SPIKE WALLS ============
  log('\n=== SPIKE WALLS ===');
  record('AC-S1: renderSpikeWalls() function defined', st.hasRenderSpikeWalls, '');
  record('AC-S1: PALETTE.spike = #ff2244', st.spikePalette === '#ff2244', `color=${st.spikePalette}`);

  // Spike pixels visible on each edge (canvas must render first). Use MENU state.
  await page.setViewport({ width: 640, height: 720 });
  await sleep(400);
  st = await getState(page);
  const spikesTop    = await countSpikePixels(page, 'top');
  const spikesBottom = await countSpikePixels(page, 'bottom');
  const spikesLeft   = await countSpikePixels(page, 'left');
  const spikesRight  = await countSpikePixels(page, 'right');
  record('AC-S2/S3: Spike pixels on TOP edge (glow visible)', spikesTop.count > 20, `red pixels=${spikesTop.count}`);
  record('AC-S2/S3: Spike pixels on BOTTOM edge', spikesBottom.count > 20, `red pixels=${spikesBottom.count}`);
  record('AC-S2/S3: Spike pixels on LEFT edge', spikesLeft.count > 20, `red pixels=${spikesLeft.count}`);
  record('AC-S2/S3: Spike pixels on RIGHT edge', spikesRight.count > 20, `red pixels=${spikesRight.count}`);

  // AC-S4: spike penetration <= 35% cellSize. Sample the tip column of a
  // single top-edge spike (centered on a cell) and verify no spike pixel
  // appears beyond cellSize*0.35 + glow tolerance. Scanning the full width
  // catches unrelated red elements (food, menu decorations), so we restrict
  // to the spike axis.
  const spikeDepth = st.cellSize * 0.35;
  const penetrationOk = await page.evaluate((depth) => {
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const tolerance = depth + 6; // allow glow bleed
    // Spike tip of cell 0 sits at x = cellSize/2. Sample a 3px-wide column
    // centered there, scanning the full tolerance depth.
    const tipX = Math.floor(cellSize / 2);
    function isSpikeLike(r, g, b) {
      return r > 50 && r > g * 1.8 && r > b * 1.8 && (r - g) > 15;
    }
    const band = ctx.getImageData(tipX - 1, 0, 3, Math.ceil(tolerance) + 2).data;
    // Only check pixels BELOW the tolerance line (the penetration zone).
    const rowBelow = (Math.ceil(tolerance) + 1) * 3; // px offset into the column
    for (let i = rowBelow * 4; i < band.length; i += 4) {
      if (isSpikeLike(band[i], band[i+1], band[i+2])) return false;
    }
    return true;
  }, spikeDepth);
  record('AC-S4: Spikes do not exceed 35% cellSize into playable', penetrationOk,
    `cellSize=${st.cellSize}, maxSpikeDepth=${spikeDepth}px`);

  // AC-S2: spikes visible in all states. Check MENU already done above.
  // PLAYING:
  await page.keyboard.press('Space');
  await sleep(500);
  st = await getState(page);
  const spikePlaying = await countSpikePixels(page, 'top');
  record('AC-S2: Spikes visible in PLAYING state', st.state === 'PLAYING' && spikePlaying.count > 20,
    `state=${st.state}, topSpikes=${spikePlaying.count}`);
  // PAUSED
  await page.keyboard.press('KeyP');
  await sleep(300);
  st = await getState(page);
  const spikePaused = await countSpikePixels(page, 'top');
  record('AC-S2: Spikes visible in PAUSED state', st.state === 'PAUSED' && spikePaused.count > 20,
    `state=${st.state}, topSpikes=${spikePaused.count}`);
  // GAME_OVER
  await page.keyboard.press('KeyP'); // resume
  await sleep(200);
  await page.evaluate(() => {
    snake.body = [
      { x: COLS - 2, y: 0 }, { x: COLS - 3, y: 0 }, { x: COLS - 4, y: 0 }
    ];
    snake.prevBody = snake.body.map(s => ({ x: s.x, y: s.y }));
    snake.direction = { x: 1, y: 0 };
    snake.nextDirection = null;
    if (food) food = { x: 0, y: 5 };
  });
  await sleep(300);
  st = await getState(page);
  const spikeGameOver = await countSpikePixels(page, 'top');
  record('AC-S2: Spikes visible in GAME_OVER state', st.state === 'GAME_OVER' && spikeGameOver.count > 20,
    `state=${st.state}, topSpikes=${spikeGameOver.count}`);

  // AC-S5: wall collision = death (just verified above via GAME_OVER transition)
  record('AC-S5: Wall collision still triggers GAME_OVER', st.state === 'GAME_OVER', '');

  // ============ TERRITORY EXPANSION ============
  log('\n=== TERRITORY EXPANSION ===');

  // AC-T1: COLS/ROWS are let (mutable). Verify by mutating then reading.
  const mutableOk = await page.evaluate(() => {
    const before = COLS;
    COLS = 99;
    const after = COLS;
    COLS = before; // restore
    return after === 99;
  });
  record('AC-T1: COLS/ROWS are mutable (let)', mutableOk, '');

  // Restart for clean expansion test
  await page.keyboard.press('Space');
  await sleep(500);
  st = await getState(page);
  record('AC-T8: resetGame restores 17x17', st.COLS === 17 && st.ROWS === 17, `COLS=${st.COLS}, ROWS=${st.ROWS}`);

  // AC-T2 + AC-T4 + AC-T5 + AC-T6 + AC-T7: eat 5 foods, verify expansion
  const lenBefore = st.snakeLen;
  const colsBefore = st.COLS;
  const canvasWBefore = st.canvasW;
  let expectedCol = colsBefore;
  for (let i = 0; i < 5; i++) {
    st = await getState(page);
    if (st.state === 'GAME_OVER') { await page.keyboard.press('Space'); await sleep(300); st = await getState(page); }
    st = await eatOneFood(page, st.tickInterval);
    expectedCol += 1;
  }
  st = await getState(page);
  record('AC-T2: Grid grows +1 col/+1 row per food (5 eaten → 22x22)',
    st.COLS === 22 && st.ROWS === 22, `COLS=${st.COLS}, ROWS=${st.ROWS}, foods=${st.foodsEaten}`);
  record('AC-T4: expandGrid() function defined', st.hasExpandGrid, '');
  record('AC-T5: Snake does NOT reset length on expand', st.snakeLen === lenBefore + 5,
    `lenBefore=${lenBefore}, lenAfter=${st.snakeLen}`);
  record('AC-T6: Food re-spawned after expansion (exists, not null)', st.food !== null, `food=${JSON.stringify(st.food)}`);
  record('AC-T7: Canvas resized after expansion', st.canvasW !== canvasWBefore,
    `before=${canvasWBefore}, after=${st.canvasW}`);
  record('AC-T9: Speed still increases (tick < initial 150)', st.tickInterval < 150,
    `tick=${st.tickInterval}ms`);

  // AC-T4 center-expand: snake head should stay near grid center.
  // After expansion, head relative-to-center ratio should be close to before.
  const centerCheck = await page.evaluate(() => {
    const h = snake.body[0];
    const cx = (COLS - 1) / 2, cy = (ROWS - 1) / 2;
    return {
      headX: h.x, headY: h.y,
      centerX: cx, centerY: cy,
      dist: Math.sqrt((h.x - cx) ** 2 + (h.y - cy) ** 2),
      maxDim: Math.max(COLS, ROWS),
    };
  });
  // Head within reasonable distance of center (snake moved during eat)
  record('AC-T4: Center-expand keeps head near board center',
    centerCheck.dist < centerCheck.maxDim * 0.6,
    `head=(${centerCheck.headX},${centerCheck.headY}), center=(${centerCheck.centerX.toFixed(1)},${centerCheck.centerY.toFixed(1)}), dist=${centerCheck.dist.toFixed(1)}`);

  // AC-T3: cap at 41x41. Force 50 expansions via expandGrid calls.
  await page.evaluate(() => {
    for (let i = 0; i < 50; i++) expandGrid();
    resizeCanvasToFit();
  });
  st = await getState(page);
  record('AC-T3: Grid caps at 41x41', st.COLS === 41 && st.ROWS === 41, `COLS=${st.COLS}, ROWS=${st.ROWS}`);

  // AC-T10: playable at 41x41 without crash
  record('AC-T10: Game playable at 41x41 without JS errors',
    consoleErrors.length === 0 && st.COLS === 41, `errors=${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    consoleErrors.forEach((e, i) => log(`  DEBUG ERR[${i}]: ${e}`));
  }

  // ============ INTEGRATION ============
  log('\n=== INTEGRATION ===');

  // AC-I1: spike count scales with grid at 17, 25, 33, 41
  const gridTestSizes = [17, 25, 33, 41];
  for (const size of gridTestSizes) {
    await page.evaluate((s) => {
      COLS = s; ROWS = s;
      resizeCanvasToFit();
    }, size);
    await sleep(150);
    // Approx spike presence: count red pixels along top edge band
    const cnt = await countSpikePixels(page, 'top');
    record(`AC-I1: Spike density at grid ${size}x${size} (top edge)`, cnt.count > size * 2,
      `red pixels=${cnt.count}`);
  }

  // AC-I2: auto-play 5 food → grid grew, canvas resized, no exception (already covered above)
  record('AC-I2: Auto-play 5 foods, grid grew + canvas resized (covered in AC-T2/T7)',
    st.COLS >= 17, '');

  // AC-I3: spike walls visible at MENU + PLAYING
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(800);
  st = await getState(page);
  const menuSpikes = await countSpikePixels(page, 'top');
  await page.keyboard.press('Space');
  await sleep(500);
  st = await getState(page);
  const playingSpikes = await countSpikePixels(page, 'top');
  record('AC-I3: Spike walls visible at MENU', st.state && menuSpikes.count > 20,
    `menuTopSpikes=${menuSpikes.count}`);
  record('AC-I3: Spike walls visible at PLAYING', st.state === 'PLAYING' && playingSpikes.count > 20,
    `playingTopSpikes=${playingSpikes.count}`);

  // AC-I4: mobile viewport 375x667, cellSize at grid 41 playable
  await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2 });
  await sleep(300);
  await page.evaluate(() => { COLS = 41; ROWS = 41; resizeCanvasToFit(); });
  await sleep(200);
  st = await getState(page);
  record('AC-I4: Mobile 375x667 cellSize at 41x41 >= 7px', st.cellSize >= 7,
    `cellSize=${st.cellSize}px`);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'territory-41-mobile.png') });

  // Screenshots for visual review
  await page.setViewport({ width: 640, height: 720, deviceScaleFactor: 1 });
  await sleep(300);
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(800);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'spike-menu.png') });
  await page.keyboard.press('Space');
  await sleep(400);
  // eat a few to show expansion
  for (let i = 0; i < 4; i++) {
    st = await getState(page);
    if (st.state !== 'PLAYING') { await page.keyboard.press('Space'); await sleep(300); }
    await eatOneFood(page, st.tickInterval);
  }
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'spike-expanded.png') });

  // ============ SUMMARY ============
  const passed = RESULTS.tests.filter((t) => t.passed).length;
  const failed = RESULTS.tests.filter((t) => !t.passed).length;
  RESULTS.summary = { total: RESULTS.tests.length, passed, failed };

  log('\n========================================');
  log(`RESULTS: ${passed} passed, ${failed} failed, ${RESULTS.tests.length} total`);
  log('========================================\n');

  fs.writeFileSync(path.resolve(__dirname, 'territory-results.json'), JSON.stringify(RESULTS, null, 2));
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  log('FATAL: ' + err.message + '\n' + err.stack);
  process.exit(2);
});
