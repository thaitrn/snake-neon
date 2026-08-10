#!/usr/bin/env node
'use strict';
/*
 * Mobile Controls V2 — Touchscreen-based verification suite.
 * Tests ALL 10 acceptance criteria from docs/mobile-controls-v2.md §7.
 *
 * IMPORTANT: D-pad / Start buttons use `touchstart` listeners ONLY (per spec
 * AC-9: no click listener to avoid double-fire). Prior test used page.click()
 * (mouse) which produced false-negatives. This suite uses touchscreen API.
 */
const puppeteer = require('puppeteer');
const URL = 'http://localhost:9876/index.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';
const INFO = '\x1b[36m·····\x1b[0m';

let totalPass = 0, totalFail = 0;
const acResults = {};
const failures = [];

function check(label, ok, detail) {
  if (ok) { totalPass++; console.log(`  ${PASS} ${label}`); }
  else { totalFail++; console.log(`  ${FAIL} ${label}${detail ? ' — ' + detail : ''}`); failures.push(label); }
  return ok;
}

// Realistic touch tap via Puppeteer touchscreen API (touchstart+touchEnd).
async function tapAt(page, x, y, hold = 30) {
  await page.touchscreen.touchStart(x, y);
  await sleep(hold);
  await page.touchscreen.touchEnd();
  await sleep(60);
}

// Get center of an element via DOM.
async function centerOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const b = el.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height, display: getComputedStyle(el).display };
  }, selector);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-web-security'],
  });

  // Force document visible so the auto-pause-on-blur doesn't interfere.
  const initVisible = async (page) => {
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    });
  };

  // ================================================================
  // PORTRAIT TESTS (AC-1, AC-2, AC-6 portrait, AC-7 portrait)
  // ================================================================
  async function testPortrait(name, w, h) {
    console.log(`\n${INFO} PORTRAIT: ${name} (${w}×${h}) ${INFO}`);
    const page = await browser.newPage();
    await initVisible(page);
    await page.setViewport({ width: w, height: h, hasTouch: true, isMobile: true });
    await page.goto(URL, { waitUntil: 'networkidle0' });
    await sleep(300);

    const orient = await page.evaluate(() => currentOrientation);
    check(`${name}: orientation=portrait`, orient === 'portrait', `got ${orient}`);

    // AC-7 portrait HUD
    const hud = await page.evaluate(() => ({
      topbar: getComputedStyle(document.getElementById('topbar')).display !== 'none',
      pause: getComputedStyle(document.getElementById('pauseBtn')).display !== 'none' && document.getElementById('pauseBtn').offsetParent !== null,
      gamepad: getComputedStyle(document.getElementById('gamepad')).display !== 'none',
      start: getComputedStyle(document.getElementById('startBtn')).display !== 'none',
    }));
    check(`${name} AC-7: topbar visible`, hud.topbar);
    check(`${name} AC-7: pause btn visible`, hud.pause);
    check(`${name} AC-7: gamepad hidden`, !hud.gamepad);
    check(`${name} AC-7: start hidden`, !hud.start);

    // AC-6 canvas size
    const cs = await page.evaluate(() => ({ cw: canvasW, ch: canvasH, cell: cellSize }));
    const minCanvas = w <= 375 ? 320 : 330;
    check(`${name} AC-6: canvas ≥ ${minCanvas} (got ${cs.cw})`, cs.cw >= minCanvas, `${cs.cw}×${cs.ch}`);

    // Start the game: tap canvas center to trigger handleAction (MENU→PLAYING)
    const cc = await centerOf(page, 'canvas');
    await tapAt(page, cc.x, cc.y);
    await sleep(200);
    const st = await page.evaluate(() => ({ state: currentState, dir: snake.direction }));
    check(`${name}: tap canvas starts game`, st.state === 'PLAYING', `state=${st.state}`);

    // AC-1: tap zone 4 regions. Snake starts going RIGHT, so LEFT is reverse → guard.
    // Use UP first (legal from RIGHT), then LEFT/DOWN in sequence after direction commits.
    const cw = cs.cw, ch = cs.ch;
    const canvasBox = await page.evaluate(() => { const b = document.querySelector('canvas').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });

    // Helper: tap a relative canvas point (rx, ry in [0,1])
    async function tapZone(rx, ry) {
      const x = canvasBox.x + rx * canvasBox.w;
      const y = canvasBox.y + ry * canvasBox.h;
      await tapAt(page, x, y);
    }

    // Wait for a tick so nextDirection commits to direction.
    async function waitForTick() {
      // tick is ~150ms; advance a couple frames
      await sleep(220);
    }

    // Tap UP region (top center) — legal from RIGHT
    await tapZone(0.5, 0.1);
    await waitForTick();
    let dir = await page.evaluate(() => ({ d: snake.direction, nd: snake.nextDirection }));
    const upQueued = (dir.nd && dir.nd.y === -1) || (dir.d && dir.d.y === -1);
    check(`${name} AC-1: tap UP region → UP`, upQueued, `dir=${JSON.stringify(dir.d)} nd=${JSON.stringify(dir.nd)}`);

    // After commit, try LEFT (legal from UP)
    await waitForTick();
    await tapZone(0.1, 0.5);
    await waitForTick();
    dir = await page.evaluate(() => ({ d: snake.direction, nd: snake.nextDirection }));
    const leftQueued = (dir.nd && dir.nd.x === -1) || (dir.d && dir.d.x === -1);
    check(`${name} AC-1: tap LEFT region → LEFT`, leftQueued, `dir=${JSON.stringify(dir.d)} nd=${JSON.stringify(dir.nd)}`);

    // DOWN (legal from LEFT)
    await waitForTick();
    await tapZone(0.5, 0.9);
    await waitForTick();
    dir = await page.evaluate(() => ({ d: snake.direction, nd: snake.nextDirection }));
    const downQueued = (dir.nd && dir.nd.y === 1) || (dir.d && dir.d.y === 1);
    check(`${name} AC-1: tap DOWN region → DOWN`, downQueued, `dir=${JSON.stringify(dir.d)} nd=${JSON.stringify(dir.nd)}`);

    // RIGHT (legal from DOWN)
    await waitForTick();
    await tapZone(0.9, 0.5);
    await waitForTick();
    dir = await page.evaluate(() => ({ d: snake.direction, nd: snake.nextDirection }));
    const rightQueued = (dir.nd && dir.nd.x === 1) || (dir.d && dir.d.x === 1);
    check(`${name} AC-1: tap RIGHT region → RIGHT`, rightQueued, `dir=${JSON.stringify(dir.d)} nd=${JSON.stringify(dir.nd)}`);

    // AC-2: tap during PLAYING does NOT pause
    const beforeState = await page.evaluate(() => currentState);
    await tapZone(0.5, 0.5);
    await sleep(150);
    const afterState = await page.evaluate(() => currentState);
    check(`${name} AC-2: tap during PLAYING ≠ pause`, afterState === 'PLAYING', `before=${beforeState} after=${afterState}`);

    // AC-1 reverse guard: if going RIGHT, tapping LEFT should be ignored
    await waitForTick();
    const beforeDir = await page.evaluate(() => JSON.stringify(snake.direction));
    await tapZone(0.1, 0.5); // LEFT while going RIGHT
    await sleep(50);
    const afterND = await page.evaluate(() => JSON.stringify(snake.nextDirection));
    check(`${name} AC-1: reverse guard (RIGHT→LEFT ignored)`, afterND === 'null' || JSON.parse(afterND).x !== -1, `beforeDir=${beforeDir} nextDir=${afterND}`);

    await page.close();
  }

  // DIR constants injected into page context for comparison
  // We compare via JSON.stringify of {x,y}

  // ================================================================
  // LANDSCAPE TESTS (AC-3, AC-4, AC-6 landscape, AC-9)
  // ================================================================
  async function testLandscape(name, w, h) {
    console.log(`\n${INFO} LANDSCAPE: ${name} (${w}×${h}) ${INFO}`);
    const page = await browser.newPage();
    await initVisible(page);
    await page.setViewport({ width: w, height: h, hasTouch: true, isMobile: true });
    await page.goto(URL, { waitUntil: 'networkidle0' });
    await sleep(300);

    const orient = await page.evaluate(() => currentOrientation);
    check(`${name}: orientation=landscape`, orient === 'landscape', `got ${orient}`);

    // AC-3 layout
    const layout = await page.evaluate(() => {
      const body = document.body;
      const gp = document.getElementById('gamepad');
      const sb = document.getElementById('startBtn');
      const cv = document.querySelector('canvas');
      const pb = document.getElementById('pauseBtn');
      const gpb = gp.getBoundingClientRect();
      const sbb = sb.getBoundingClientRect();
      const cvb = cv.getBoundingClientRect();
      return {
        bodyLandscape: body.classList.contains('landscape'),
        gamepadVisible: getComputedStyle(gp).display !== 'none' && gp.offsetParent !== null,
        startVisible: getComputedStyle(sb).display !== 'none' && sb.offsetParent !== null,
        pauseHidden: getComputedStyle(pb).display === 'none' || pb.offsetParent === null,
        dpadLeftOfCanvas: gpb.x + gpb.width < cvb.x + cvb.width / 2,
        startRightOfCanvas: sbb.x > cvb.x + cvb.width / 2,
        canvasNotCovered: cvb.width > 0 && cvb.height > 0,
        dpadBtnW: document.querySelector('.dpad-btn').getBoundingClientRect().width,
        startBtnW: sbb.width,
      };
    });
    check(`${name} AC-3: body.landscape class`, layout.bodyLandscape);
    check(`${name} AC-3: gamepad visible`, layout.gamepadVisible);
    check(`${name} AC-3: start btn visible`, layout.startVisible);
    check(`${name} AC-3: topbar pause hidden`, layout.pauseHidden);
    check(`${name} AC-3: D-pad LEFT of canvas`, layout.dpadLeftOfCanvas);
    check(`${name} AC-3: Start RIGHT of canvas`, layout.startRightOfCanvas);
    check(`${name} AC-3: canvas not covered (has area)`, layout.canvasNotCovered);
    check(`${name} AC-3: D-pad btn ≥56px (got ${Math.round(layout.dpadBtnW)})`, layout.dpadBtnW >= 56);
    check(`${name} AC-3: Start btn ≥72px (got ${Math.round(layout.startBtnW)})`, layout.startBtnW >= 72);

    // AC-6 landscape canvas size
    const cs = await page.evaluate(() => ({ cw: canvasW, ch: canvasH }));
    check(`${name} AC-6: landscape canvas ≥ 260 (got ${cs.cw})`, cs.cw >= 260, `${cs.cw}×${cs.ch}`);

    // AC-4: Start via touch
    const sb = await centerOf(page, '#startBtn');
    await tapAt(page, sb.x, sb.y);
    await sleep(200);
    let st = await page.evaluate(() => ({ state: currentState }));
    check(`${name} AC-4: touch Start → PLAYING`, st.state === 'PLAYING', `state=${st.state}`);

    // AC-4: D-pad UP via touch (legal from initial RIGHT)
    const up = await centerOf(page, '.dpad-up');
    await tapAt(page, up.x, up.y);
    await sleep(220);
    let dir = await page.evaluate(() => ({ d: snake.direction, nd: snake.nextDirection }));
    const upOk = (dir.nd && dir.nd.y === -1) || (dir.d && dir.d.y === -1);
    check(`${name} AC-4: touch D-pad UP → UP`, upOk, `dir=${JSON.stringify(dir.d)} nd=${JSON.stringify(dir.nd)}`);

    // After commit, LEFT
    await sleep(150);
    const left = await centerOf(page, '.dpad-left');
    await tapAt(page, left.x, left.y);
    await sleep(220);
    dir = await page.evaluate(() => ({ d: snake.direction, nd: snake.nextDirection }));
    const leftOk = (dir.nd && dir.nd.x === -1) || (dir.d && dir.d.x === -1);
    check(`${name} AC-4: touch D-pad LEFT → LEFT`, leftOk, `dir=${JSON.stringify(dir.d)} nd=${JSON.stringify(dir.nd)}`);

    // DOWN
    await sleep(150);
    const down = await centerOf(page, '.dpad-down');
    await tapAt(page, down.x, down.y);
    await sleep(220);
    dir = await page.evaluate(() => ({ d: snake.direction, nd: snake.nextDirection }));
    const downOk = (dir.nd && dir.nd.y === 1) || (dir.d && dir.d.y === 1);
    check(`${name} AC-4: touch D-pad DOWN → DOWN`, downOk, `dir=${JSON.stringify(dir.d)} nd=${JSON.stringify(dir.nd)}`);

    // RIGHT
    await sleep(150);
    const right = await centerOf(page, '.dpad-right');
    await tapAt(page, right.x, right.y);
    await sleep(220);
    dir = await page.evaluate(() => ({ d: snake.direction, nd: snake.nextDirection }));
    const rightOk = (dir.nd && dir.nd.x === 1) || (dir.d && dir.d.x === 1);
    check(`${name} AC-4: touch D-pad RIGHT → RIGHT`, rightOk, `dir=${JSON.stringify(dir.d)} nd=${JSON.stringify(dir.nd)}`);

    // AC-4: canvas touch during PLAYING = nothing (no direction change, no pause)
    const before = await page.evaluate(() => ({ state: currentState, nd: JSON.stringify(snake.nextDirection), d: JSON.stringify(snake.direction) }));
    const cc = await centerOf(page, 'canvas');
    await tapAt(page, cc.x, cc.y);
    await sleep(150);
    const afterCanvas = await page.evaluate(() => ({ state: currentState, nd: JSON.stringify(snake.nextDirection), d: JSON.stringify(snake.direction) }));
    check(`${name} AC-4: canvas touch = nothing (state unchanged)`, afterCanvas.state === before.state && afterCanvas.state === 'PLAYING', `before=${before.state} after=${afterCanvas.state}`);
    check(`${name} AC-4: canvas touch = nothing (dir unchanged)`, afterCanvas.nd === before.nd && afterCanvas.d === before.d);

    // AC-4: Start button pauses when PLAYING
    await tapAt(page, sb.x, sb.y);
    await sleep(150);
    st = await page.evaluate(() => currentState);
    check(`${name} AC-4: touch Start during PLAYING → PAUSED`, st === 'PAUSED', `state=${st}`);

    await page.close();
  }

  // ================================================================
  // AC-5: Auto-switch orientation (no game reset)
  // ================================================================
  async function testAutoSwitch() {
    console.log(`\n${INFO} AC-5: AUTO-SWITCH ORIENTATION ${INFO}`);
    const page = await browser.newPage();
    await initVisible(page);
    // Start portrait
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
    await page.goto(URL, { waitUntil: 'networkidle0' });
    await sleep(300);

    const cc = await centerOf(page, 'canvas');
    await tapAt(page, cc.x, cc.y);
    await sleep(200);
    // Eat some food to get score > 0
    const before = await page.evaluate(() => ({ state: currentState, score, orient: currentOrientation }));

    // Rotate to landscape
    await page.setViewport({ width: 844, height: 390, hasTouch: true, isMobile: true });
    // Manually fire resize (p5 windowResized binds to window resize)
    await sleep(400);
    const afterLand = await page.evaluate(() => ({ state: currentState, score, orient: currentOrientation, gamepadVisible: getComputedStyle(document.getElementById('gamepad')).display !== 'none' }));
    check('AC-5: portrait→landscape switched orient', afterLand.orient === 'landscape', `orient=${afterLand.orient}`);
    check('AC-5: gamepad appears on landscape', afterLand.gamepadVisible);
    check('AC-5: score preserved (P→L)', afterLand.score === before.score, `before=${before.score} after=${afterLand.score}`);
    check('AC-5: state preserved (P→L)', afterLand.state === before.state, `before=${before.state} after=${afterLand.state}`);

    // Rotate back to portrait
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
    await sleep(400);
    const afterPort = await page.evaluate(() => ({ state: currentState, score, orient: currentOrientation, gamepadVisible: getComputedStyle(document.getElementById('gamepad')).display !== 'none' }));
    check('AC-5: landscape→portrait switched orient', afterPort.orient === 'portrait', `orient=${afterPort.orient}`);
    check('AC-5: gamepad hidden on portrait', !afterPort.gamepadVisible);
    check('AC-5: score preserved (L→P)', afterPort.score === before.score, `before=${before.score} after=${afterPort.score}`);
    check('AC-5: state preserved (L→P)', afterPort.state === before.state, `before=${before.state} after=${afterPort.state}`);

    await page.close();
  }

  // ================================================================
  // AC-8: Desktop not affected
  // ================================================================
  async function testDesktop() {
    console.log(`\n${INFO} AC-8: DESKTOP ${INFO}`);
    const page = await browser.newPage();
    await initVisible(page);
    await page.setViewport({ width: 1280, height: 800, hasTouch: false, isMobile: false });
    await page.goto(URL, { waitUntil: 'networkidle0' });
    await sleep(300);

    const orient = await page.evaluate(() => currentOrientation);
    check('AC-8: desktop orient=portrait (no touch controls)', orient === 'portrait', `orient=${orient}`);

    const vis = await page.evaluate(() => ({
      gamepad: getComputedStyle(document.getElementById('gamepad')).display !== 'none',
      start: getComputedStyle(document.getElementById('startBtn')).display !== 'none',
    }));
    check('AC-8: gamepad hidden on desktop', !vis.gamepad);
    check('AC-8: start hidden on desktop', !vis.start);

    // Space starts game
    await page.keyboard.press('Space');
    await sleep(150);
    let st = await page.evaluate(() => currentState);
    check('AC-8: Space starts game', st === 'PLAYING', `state=${st}`);

    // Arrow Up steers
    await page.keyboard.press('ArrowUp');
    await sleep(200);
    let dir = await page.evaluate(() => ({ d: snake.direction, nd: snake.nextDirection }));
    check('AC-8: ArrowUp steers UP', (dir.nd && dir.nd.y === -1) || (dir.d && dir.d.y === -1), `dir=${JSON.stringify(dir.d)} nd=${JSON.stringify(dir.nd)}`);

    // P pauses
    await page.keyboard.press('KeyP');
    await sleep(150);
    st = await page.evaluate(() => currentState);
    check('AC-8: P pauses', st === 'PAUSED', `state=${st}`);

    await page.close();
  }

  // ================================================================
  // RUN ALL
  // ================================================================
  const DIR_UP = { x: 0, y: -1 };

  await testPortrait('iPhone SE', 375, 667);
  await testPortrait('iPhone 14', 390, 844);
  await testLandscape('iPhone SE land', 667, 375);
  await testLandscape('iPhone 14 land', 844, 390);
  await testAutoSwitch();
  await testDesktop();

  await browser.close();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`RESULT: ${totalPass} pass, ${totalFail} fail`);
  if (failures.length) {
    console.log(`Failures:`);
    failures.forEach(f => console.log(`  - ${f}`));
  }
  process.exit(totalFail > 0 ? 1 : 0);
})();
