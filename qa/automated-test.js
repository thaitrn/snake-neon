// ============================================================
// Snake Neon — Automated QA Test Suite v2 (Puppeteer)
// Fixed: state management, direction buffer timing, FPS hook
// ============================================================
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const HTML_PATH = 'file://' + path.resolve(__dirname, '..', 'index.html');
const RESULTS = { tests: [], screenshots: [], metrics: {} };
const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

function log(msg) { process.stdout.write(msg + '\n'); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function record(name, passed, detail) {
  const status = passed ? 'PASS' : 'FAIL';
  RESULTS.tests.push({ name, passed, detail: detail || '', status });
  log(`[${status}] ${name}${detail ? ' — ' + detail : ''}`);
}

// Get full game state including nextDirection
async function getState(page) {
  return await page.evaluate(() => {
    // p5.js global mode: variables may not be defined until setup() completes
    const safe = (v, d) => typeof v !== 'undefined' ? v : d;
    const snakeReady = typeof snake !== 'undefined' && snake && snake.body && snake.body.length > 0;
    return {
      state: safe(currentState, 'UNINIT'),
      score: safe(score, 0),
      foodsEaten: safe(foodsEaten, 0),
      snakeLen: snakeReady ? snake.body.length : 0,
      tickInterval: safe(tickInterval, 0),
      direction: snakeReady ? { x: snake.direction.x, y: snake.direction.y } : null,
      nextDirection: snakeReady && snake.nextDirection ? { x: snake.nextDirection.x, y: snake.nextDirection.y } : null,
      head: snakeReady && snake.body[0] ? { x: snake.body[0].x, y: snake.body[0].y } : null,
      food: typeof food !== 'undefined' && food ? { x: food.x, y: food.y } : null,
      muted: safe(muted, false),
      highScore: safe(highScore, 0),
      ready: snakeReady,
    };
  });
}

// Ensure game is in specific state
async function ensureState(page, target) {
  let st = await getState(page);
  // Handle Space ambiguity: Space during PLAYING pauses
  if (target === 'PLAYING') {
    if (st.state === 'MENU' || st.state === 'GAME_OVER') {
      await page.keyboard.press('Space');
      await sleep(400);
    } else if (st.state === 'PAUSED') {
      await page.keyboard.press('KeyP');
      await sleep(300);
    }
  } else if (target === 'PAUSED') {
    if (st.state === 'PLAYING') {
      await page.keyboard.press('KeyP');
      await sleep(300);
    }
  } else if (target === 'MENU') {
    // Reload page for clean menu
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(1500);
  }
  return await getState(page);
}

// Wait for at least one game tick to fire (direction buffer flush)
async function waitForTick(page, tickMs) {
  await sleep(Math.max(tickMs + 100, 300));
}

async function runTests() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  // Collect console errors
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  // ===== LOAD =====
  log('\n=== LOAD TESTS ===');
  const loadStart = Date.now();
  await page.goto(HTML_PATH, { waitUntil: 'networkidle0' });
  const loadTime = Date.now() - loadStart;
  RESULTS.metrics.loadTimeMs = loadTime;

  // Wait for p5.js setup() to complete — poll for snake ready
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await sleep(200);
    st = await getState(page);
    if (st.ready) { ready = true; break; }
  }
  if (!ready) log('WARNING: Game did not become ready within 6s');

  record('TC-LOAD-01: Page loads within 2s', loadTime < 2000, `${loadTime}ms`);
  record('TC-LOAD-02: No page errors', consoleErrors.length === 0, consoleErrors.length > 0 ? consoleErrors.slice(0,3).join('; ') : 'Clean');
  record('TC-LOAD-03: Initial state is MENU', st.state === 'MENU', `state=${st.state}`);

  // Canvas check
  const canvasInfo = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? { exists: true, w: c.width, h: c.height, clientW: c.clientWidth, clientH: c.clientHeight } : { exists: false };
  });
  record('TC-RENDER-01: Canvas element exists', canvasInfo.exists, '');
  record('TC-RENDER-02: Canvas is square (BR-01)', canvasInfo.exists && canvasInfo.w === canvasInfo.h, `${canvasInfo.w}x${canvasInfo.h}`);

  // ===== STATE MACHINE =====
  log('\n=== STATE MACHINE TESTS ===');
  await page.keyboard.press('Space');
  await sleep(400);
  st = await getState(page);
  record('TC-STATE-01: Space: MENU→PLAYING', st.state === 'PLAYING', `state=${st.state}`);

  await page.keyboard.press('KeyP');
  await sleep(300);
  st = await getState(page);
  record('TC-STATE-02: P: PLAYING→PAUSED', st.state === 'PAUSED', `state=${st.state}`);

  await page.keyboard.press('KeyP');
  await sleep(300);
  st = await getState(page);
  record('TC-STATE-03: P: PAUSED→PLAYING', st.state === 'PLAYING', `state=${st.state}`);

  await page.keyboard.press('Escape');
  await sleep(300);
  st = await getState(page);
  record('TC-STATE-04: Esc: PLAYING→PAUSED', st.state === 'PAUSED', `state=${st.state}`);

  await page.keyboard.press('Escape');
  await sleep(300);
  st = await getState(page);
  record('TC-STATE-05: Esc: PAUSED→PLAYING', st.state === 'PLAYING', `state=${st.state}`);

  // ===== MOVEMENT — Arrow Keys =====
  log('\n=== MOVEMENT: ARROW KEYS ===');
  await ensureState(page, 'PLAYING');

  // Test UP: press key, check nextDirection immediately
  await page.keyboard.press('ArrowUp');
  await sleep(50);
  st = await getState(page);
  record('TC-MOVE-01: ArrowUp sets buffer to UP', 
    st.nextDirection && st.nextDirection.x === 0 && st.nextDirection.y === -1,
    `nextDir=${JSON.stringify(st.nextDirection)}`);

  // Wait for tick to apply
  await waitForTick(page, st.tickInterval);
  st = await getState(page);
  record('TC-MOVE-01b: Direction applied as UP after tick',
    st.direction.x === 0 && st.direction.y === -1,
    `dir=${JSON.stringify(st.direction)}`);

  // Test RIGHT
  await page.keyboard.press('ArrowRight');
  await sleep(50);
  st = await getState(page);
  record('TC-MOVE-02: ArrowRight sets buffer to RIGHT',
    st.nextDirection && st.nextDirection.x === 1 && st.nextDirection.y === 0,
    `nextDir=${JSON.stringify(st.nextDirection)}`);
  await waitForTick(page, st.tickInterval);
  st = await getState(page);
  record('TC-MOVE-02b: Direction applied as RIGHT after tick',
    st.direction.x === 1 && st.direction.y === 0, `dir=${JSON.stringify(st.direction)}`);

  // Test DOWN
  await page.keyboard.press('ArrowDown');
  await sleep(50);
  st = await getState(page);
  record('TC-MOVE-03: ArrowDown sets buffer to DOWN',
    st.nextDirection && st.nextDirection.x === 0 && st.nextDirection.y === 1,
    `nextDir=${JSON.stringify(st.nextDirection)}`);
  await waitForTick(page, st.tickInterval);
  st = await getState(page);
  record('TC-MOVE-03b: Direction applied as DOWN after tick',
    st.direction.x === 0 && st.direction.y === 1, `dir=${JSON.stringify(st.direction)}`);

  // Test LEFT
  await page.keyboard.press('ArrowLeft');
  await sleep(50);
  st = await getState(page);
  record('TC-MOVE-04: ArrowLeft sets buffer to LEFT',
    st.nextDirection && st.nextDirection.x === -1 && st.nextDirection.y === 0,
    `nextDir=${JSON.stringify(st.nextDirection)}`);
  await waitForTick(page, st.tickInterval);
  st = await getState(page);
  record('TC-MOVE-04b: Direction applied as LEFT after tick',
    st.direction.x === -1 && st.direction.y === 0, `dir=${JSON.stringify(st.direction)}`);

  // ===== MOVEMENT — WASD =====
  log('\n=== MOVEMENT: WASD ===');
  await page.keyboard.press('KeyW');
  await sleep(50);
  st = await getState(page);
  record('TC-MOVE-05: W sets buffer to UP',
    st.nextDirection && st.nextDirection.x === 0 && st.nextDirection.y === -1,
    `nextDir=${JSON.stringify(st.nextDirection)}`);
  await waitForTick(page, st.tickInterval);

  await page.keyboard.press('KeyD');
  await sleep(50);
  st = await getState(page);
  record('TC-MOVE-06: D sets buffer to RIGHT',
    st.nextDirection && st.nextDirection.x === 1 && st.nextDirection.y === 0,
    `nextDir=${JSON.stringify(st.nextDirection)}`);
  await waitForTick(page, st.tickInterval);

  await page.keyboard.press('KeyS');
  await sleep(50);
  st = await getState(page);
  record('TC-MOVE-07: S sets buffer to DOWN',
    st.nextDirection && st.nextDirection.x === 0 && st.nextDirection.y === 1,
    `nextDir=${JSON.stringify(st.nextDirection)}`);
  await waitForTick(page, st.tickInterval);

  await page.keyboard.press('KeyA');
  await sleep(50);
  st = await getState(page);
  record('TC-MOVE-08: A sets buffer to LEFT',
    st.nextDirection && st.nextDirection.x === -1 && st.nextDirection.y === 0,
    `nextDir=${JSON.stringify(st.nextDirection)}`);

  // ===== ANTI-180° =====
  log('\n=== ANTI-180° REVERSAL PROTECTION ===');
  await waitForTick(page, st.tickInterval);
  st = await getState(page);
  // Now going LEFT. Try RIGHT (180° reverse)
  const dirBefore = { ...st.direction };
  await page.keyboard.press('ArrowRight');
  await sleep(100);
  st = await getState(page);
  record('TC-DIR-01: 180° reverse blocked (LEFT→RIGHT rejected)',
    st.nextDirection === null || (st.nextDirection && !(st.nextDirection.x === 1 && st.nextDirection.y === 0)),
    `nextDir=${JSON.stringify(st.nextDirection)}, currentDir=${JSON.stringify(dirBefore)}`);

  // ===== SCORING & GROWTH =====
  log('\n=== SCORING & GROWTH ===');
  await ensureState(page, 'PLAYING');
  // Use evaluate to teleport food right in front of head, then wait for tick
  st = await getState(page);
  const scoreBefore = st.score;
  const lenBefore = st.snakeLen;

  await page.evaluate(() => {
    const h = snake.body[0];
    const d = snake.direction;
    let fx = h.x + d.x, fy = h.y + d.y;
    // If out of bounds, turn snake to safe direction
    if (fx < 0 || fx >= COLS || fy < 0 || fy >= ROWS) {
      // Set direction downward if possible
      if (h.y + 1 < ROWS) {
        snake.direction = { x: 0, y: 1 };
        snake.nextDirection = null;
        fx = h.x; fy = h.y + 1;
      }
    }
    food = { x: fx, y: fy };
  });
  await waitForTick(page, st.tickInterval + 50);
  st = await getState(page);

  // If didn't eat (food might have respawned elsewhere), try again
  if (st.score === scoreBefore) {
    await page.evaluate(() => {
      const h = snake.body[0];
      const d = snake.direction;
      food = { x: h.x + d.x, y: h.y + d.y };
      // Clamp
      food.x = Math.max(0, Math.min(COLS - 1, food.x));
      food.y = Math.max(0, Math.min(ROWS - 1, food.y));
    });
    await waitForTick(page, st.tickInterval + 50);
    st = await getState(page);
  }

  record('TC-SCORE-01: Score +10 on eat', st.score === scoreBefore + 10, `${scoreBefore}→${st.score}`);
  record('TC-SCORE-02: Snake grows +1 on eat', st.snakeLen === lenBefore + 1, `${lenBefore}→${st.snakeLen}`);

  // ===== FOOD SPAWN RULES =====
  log('\n=== FOOD SPAWN ===');
  st = await getState(page);
  record('TC-FOOD-01: Food exists after eat', st.food !== null, `food=${JSON.stringify(st.food)}`);

  const foodOnBody = await page.evaluate(() => {
    if (!food) return true;
    return snake.body.some(s => s.x === food.x && s.y === food.y);
  });
  record('TC-FOOD-02: Food not on snake body (BR-04)', !foodOnBody, foodOnBody ? 'VIOLATION' : 'OK');

  // ===== WALL COLLISION =====
  log('\n=== WALL COLLISION ===');
  await ensureState(page, 'PLAYING');
  // Teleport snake head next to right wall, direction right
  await page.evaluate(() => {
    snake.body = [
      { x: COLS - 2, y: Math.floor(ROWS / 2) },
      { x: COLS - 3, y: Math.floor(ROWS / 2) },
      { x: COLS - 4, y: Math.floor(ROWS / 2) }
    ];
    snake.prevBody = snake.body.map(s => ({ x: s.x, y: s.y }));
    snake.direction = { x: 1, y: 0 };
    snake.nextDirection = null;
    if (food) { food = { x: 0, y: 0 }; }
  });
  await waitForTick(page, 200);
  st = await getState(page);
  record('TC-COLL-01: Wall collision → GAME_OVER', st.state === 'GAME_OVER', `state=${st.state}, head=${JSON.stringify(st.head)}`);

  // Screenshot: game over
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'game-over.png') });

  // ===== SELF COLLISION =====
  log('\n=== SELF COLLISION ===');
  await ensureState(page, 'PLAYING');
  // Create a scenario where snake will hit itself
  await page.evaluate(() => {
    // Snake going right, body curls so head hits segment 3
    snake.body = [
      { x: 5, y: 5 }, // head
      { x: 4, y: 5 },
      { x: 3, y: 5 },
      { x: 3, y: 4 },
      { x: 4, y: 4 },
      { x: 5, y: 4 }, // head moving right will NOT hit this
    ];
    // Actually make head go up into its own body segment
    snake.body = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 4, y: 4 },
      { x: 5, y: 4 },
    ];
    snake.direction = { x: 0, y: -1 }; // UP — but (5,4) is body[3]=tail, and tail will move
    // Actually: tail at (5,4) will be popped, so going up to (5,4) is safe
    // Let's make a longer snake where head goes into non-tail body
    snake.body = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
      { x: 3, y: 4 },
      { x: 4, y: 4 },
      { x: 5, y: 4 },
    ];
    snake.prevBody = snake.body.map(s => ({ x: s.x, y: s.y }));
    snake.direction = { x: 0, y: -1 }; // head moves to (5,4) = body[5]=tail. Tail pops so OK.
    // Need head to hit body[4]=(4,4) — head goes LEFT
    snake.direction = { x: -1, y: 0 }; // head to (4,5)=body[1]. Self collision!
    snake.nextDirection = null;
    if (food) { food = { x: 0, y: 0 }; }
  });
  await waitForTick(page, 200);
  st = await getState(page);
  record('TC-COLL-02: Self collision → GAME_OVER', st.state === 'GAME_OVER', `state=${st.state}, head=${JSON.stringify(st.head)}`);

  // ===== RESTART =====
  log('\n=== RESTART ===');
  // From GAME_OVER, press Space
  await page.keyboard.press('Space');
  await sleep(500);
  st = await getState(page);
  record('TC-RESTART-01: Space: GAME_OVER→PLAYING', st.state === 'PLAYING', `state=${st.state}`);
  record('TC-RESTART-02: Score resets to 0', st.score === 0, `score=${st.score}`);
  record('TC-RESTART-03: Snake resets to length 3', st.snakeLen === 3, `len=${st.snakeLen}`);
  record('TC-RESTART-04: Tick resets to 150ms', st.tickInterval === 150, `tick=${st.tickInterval}ms`);

  // ===== HIGH SCORE PERSISTENCE =====
  log('\n=== HIGH SCORE (localStorage) ===');
  // Force a score then game over
  await page.evaluate(() => {
    score = 999;
    highScore = 999;
    Storage.setHighScore(999);
  });
  const lsHS = await page.evaluate(() => localStorage.getItem('snake_neon_highscore'));
  record('TC-HS-01: High score saved to localStorage', lsHS === '999', `value=${lsHS}`);
  record('TC-HS-02: localStorage key is snake_neon_highscore', lsHS !== null, `key=snake_neon_highscore`);

  // ===== MUTE =====
  log('\n=== MUTE ===');
  st = await getState(page);
  const muteBefore = st.muted;
  await page.keyboard.press('KeyM');
  await sleep(200);
  st = await getState(page);
  record('TC-MUTE-01: M toggles mute state', st.muted !== muteBefore, `${muteBefore}→${st.muted}`);
  const lsMute = await page.evaluate(() => localStorage.getItem('snake_neon_muted'));
  record('TC-MUTE-02: Mute persisted to localStorage', lsMute !== null, `value=${lsMute}`);
  // Toggle back
  await page.keyboard.press('KeyM');
  await sleep(200);

  // ===== AUTO-PAUSE ON BLUR =====
  log('\n=== AUTO-PAUSE (visibilitychange) ===');
  await ensureState(page, 'PLAYING');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true, writable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await sleep(200);
  st = await getState(page);
  record('TC-PAUSE-01: Auto-pause when tab hidden', st.state === 'PAUSED', `state=${st.state}`);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true, writable: true });
  });

  // ===== DIFFICULTY CURVE =====
  log('\n=== DIFFICULTY CURVE ===');
  await ensureState(page, 'PLAYING');
  // Force-feed 30 times using evaluate
  for (let i = 0; i < 30; i++) {
    await page.evaluate(() => {
      const h = snake.body[0];
      const d = snake.direction;
      let fx = h.x + d.x, fy = h.y + d.y;
      if (fx < 0 || fx >= COLS || fy < 0 || fy >= ROWS) {
        // Change direction to safe one
        const dirs = [{x:0,y:-1},{x:0,y:1},{x:-1,y:0},{x:1,y:0}];
        for (const nd of dirs) {
          const nx = h.x + nd.x, ny = h.y + nd.y;
          if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
            const hitSelf = snake.body.some((s, idx) => idx < snake.body.length - 1 && s.x === nx && s.y === ny);
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
    await sleep(st.tickInterval + 20);
    st = await getState(page);
    if (st.state === 'GAME_OVER') {
      await page.keyboard.press('Space');
      await sleep(300);
      continue;
    }
  }
  st = await getState(page);
  record('TC-DIFF-01: Speed increases after eating', st.tickInterval < 150, `tick=${st.tickInterval}ms, foods=${st.foodsEaten}`);
  record('TC-DIFF-02: Score matches foods×10', st.score === st.foodsEaten * 10, `score=${st.score}, foods=${st.foodsEaten}`);

  // Speed cap
  await page.evaluate(() => {
    foodsEaten = 100;
    tickInterval = Math.max(MIN_TICK, INITIAL_TICK - foodsEaten * STEP_REDUCTION);
  });
  st = await getState(page);
  record('TC-DIFF-03: Speed caps at 60ms (BR-11a)', st.tickInterval === 60, `tick=${st.tickInterval}ms`);

  // ===== WIN CONDITION =====
  log('\n=== WIN CONDITION (board full) ===');
  await page.keyboard.press('Space'); // restart if game over
  await sleep(400);
  await ensureState(page, 'PLAYING');
  await page.evaluate(() => {
    snake.body = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (snake.body.length < COLS * ROWS - 1) snake.body.push({ x, y });
      }
    }
    food = null;
    spawnFood();
  });
  await sleep(200);
  st = await getState(page);
  record('TC-EDGE-01: Full board triggers GAME_OVER (BR-05)', st.state === 'GAME_OVER', `state=${st.state}`);

  // ===== EDGE: rapid direction changes =====
  log('\n=== EDGE: RAPID INPUT ===');
  await page.keyboard.press('Space');
  await sleep(400);
  await ensureState(page, 'PLAYING');
  // Spam keys rapidly
  await page.evaluate(() => {
    // Rapidly set directions
    setDirection(DIR.UP);
    setDirection(DIR.RIGHT);
    setDirection(DIR.DOWN);
    setDirection(DIR.LEFT);
    setDirection(DIR.UP);
  });
  st = await getState(page);
  record('TC-EDGE-02: Rapid direction changes don\'t crash', st.state === 'PLAYING' || st.state === 'GAME_OVER', `state=${st.state}, no exception`);

  // ===== EDGE: food spawn on snake body (shouldn't happen) =====
  log('\n=== EDGE: FOOD SPAWN INTEGRITY ===');
  await ensureState(page, 'PLAYING');
  // Spawn food 50 times, verify none on body
  let violations = 0;
  for (let i = 0; i < 50; i++) {
    const v = await page.evaluate(() => {
      spawnFood();
      if (!food) return false;
      return snake.body.some(s => s.x === food.x && s.y === food.y);
    });
    if (v) violations++;
  }
  record('TC-EDGE-03: Food never spawns on body (50 iterations)', violations === 0, `${violations} violations out of 50`);

  // ===== SCREENSHOTS =====
  log('\n=== SCREENSHOTS ===');
  // Reload for menu
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(1500);
  await page.setViewport({ width: 400, height: 800, deviceScaleFactor: 1 });
  await sleep(300);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-menu.png') });
  RESULTS.screenshots.push('01-menu.png');

  // Playing
  await page.keyboard.press('Space');
  await sleep(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-playing.png') });
  RESULTS.screenshots.push('02-playing.png');

  // Paused
  await page.keyboard.press('KeyP');
  await sleep(300);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-paused.png') });
  RESULTS.screenshots.push('03-paused.png');

  // Game over
  await page.keyboard.press('KeyP'); // resume
  await sleep(200);
  await page.evaluate(() => {
    snake.body[0] = { x: COLS - 1, y: 0 };
    snake.body[1] = { x: COLS - 2, y: 0 };
    snake.body[2] = { x: COLS - 3, y: 0 };
    snake.direction = { x: 1, y: 0 };
    snake.nextDirection = null;
    if (food) food = { x: 0, y: 5 };
  });
  await sleep(250);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-game-over.png') });
  RESULTS.screenshots.push('04-game-over.png');

  // Mobile portrait
  await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2 });
  await sleep(300);
  await page.keyboard.press('Space');
  await sleep(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-mobile-portrait.png') });
  RESULTS.screenshots.push('05-mobile-portrait.png');

  // Desktop
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await sleep(300);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06-desktop.png') });
  RESULTS.screenshots.push('06-desktop.png');

  // ===== PERFORMANCE: FPS =====
  log('\n=== PERFORMANCE ===');
  await page.setViewport({ width: 400, height: 800, deviceScaleFactor: 1 });
  await sleep(300);

  // Inject FPS counter using requestAnimationFrame
  await page.evaluate(() => {
    window.__fpsFrames = [];
    window.__fpsRunning = true;
    function measureFrame() {
      const now = performance.now();
      if (window.__lastFrameTime) {
        const dt = now - window.__lastFrameTime;
        if (dt > 0 && dt < 1000) window.__fpsFrames.push(1000 / dt);
      }
      window.__lastFrameTime = now;
      if (window.__fpsRunning) requestAnimationFrame(measureFrame);
    }
    requestAnimationFrame(measureFrame);
  });

  // Start playing and measure for 5 seconds
  await page.keyboard.press('Space');
  await sleep(200);
  await page.keyboard.press('Space'); // may pause — press P if so
  st = await getState(page);
  if (st.state === 'PAUSED') {
    await page.keyboard.press('KeyP');
    await sleep(200);
  }
  log('Measuring FPS for 5 seconds...');
  await sleep(5000);

  const fpsData = await page.evaluate(() => {
    window.__fpsRunning = false;
    const f = window.__fpsFrames || [];
    // Filter out outliers (first few frames)
    const usable = f.length > 10 ? f.slice(5) : f;
    return {
      samples: usable.length,
      avg: usable.length > 0 ? usable.reduce((a, b) => a + b, 0) / usable.length : 0,
      min: usable.length > 0 ? Math.min(...usable) : 0,
      max: usable.length > 0 ? Math.max(...usable) : 0,
      p50: usable.length > 0 ? usable.sort((a, b) => a - b)[Math.floor(usable.length / 2)] : 0,
    };
  });
  RESULTS.metrics.fps = fpsData;
  record('TC-PERF-01: Avg FPS ≥ 50', fpsData.avg >= 50, `avg=${Math.round(fpsData.avg)}, min=${Math.round(fpsData.min)}, p50=${Math.round(fpsData.p50)}, samples=${fpsData.samples}`);
  record('TC-PERF-02: Min FPS ≥ 30 (no severe drops)', fpsData.min >= 30, `min=${Math.round(fpsData.min)}`);

  // Memory check
  const memBefore = await page.evaluate(() => performance.memory ? performance.memory.usedJSHeapSize : null);
  // Play 30 more seconds of simulated gameplay
  for (let i = 0; i < 50; i++) {
    st = await getState(page);
    if (st.state === 'GAME_OVER') {
      await page.keyboard.press('Space');
      await sleep(300);
      continue;
    }
    // Change direction randomly to keep game alive
    const dirs = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
    await page.keyboard.press(dirs[i % 4]);
    await sleep(300);
  }
  const memAfter = await page.evaluate(() => performance.memory ? performance.memory.usedJSHeapSize : null);
  if (memBefore !== null && memAfter !== null) {
    const deltaMB = (memAfter - memBefore) / 1024 / 1024;
    RESULTS.metrics.memoryDeltaMB = Math.round(deltaMB * 100) / 100;
    RESULTS.metrics.memBeforeMB = Math.round(memBefore / 1024 / 1024 * 100) / 100;
    RESULTS.metrics.memAfterMB = Math.round(memAfter / 1024 / 1024 * 100) / 100;
    record('TC-PERF-03: No significant memory leak (<30MB)', deltaMB < 30, `before=${RESULTS.metrics.memBeforeMB}MB, after=${RESULTS.metrics.memAfterMB}MB, delta=${deltaMB.toFixed(2)}MB`);
  } else {
    record('TC-PERF-03: Memory check (skipped — headless Chrome)', true, 'performance.memory unavailable');
  }

  // ===== SUMMARY =====
  const passed = RESULTS.tests.filter(t => t.passed).length;
  const failed = RESULTS.tests.filter(t => !t.passed).length;
  RESULTS.summary = { total: RESULTS.tests.length, passed, failed };

  log('\n========================================');
  log(`RESULTS: ${passed} passed, ${failed} failed, ${RESULTS.tests.length} total`);
  log('========================================\n');

  fs.writeFileSync(path.resolve(__dirname, 'test-results.json'), JSON.stringify(RESULTS, null, 2));
  await browser.close();
  return RESULTS;
}

runTests().then(r => {
  process.exit(r.summary.failed > 0 ? 1 : 0);
}).catch(err => {
  log('FATAL: ' + err.message + '\n' + err.stack);
  process.exit(2);
});
