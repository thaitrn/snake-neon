# QA Sign-off — Mobile UX Redesign (Snake Neon)

> **Task:** t_61d8a6a1 | **Tester:** QA (Goku) | **Date:** 2026-08-09
> **Target:** `index.html` — Floating Virtual Joystick redesign
> **Spec:** `docs/mobile-ux-redesign.md` §5 (Acceptance Criteria AC-1..AC-8)
> **Method:** Puppeteer headless Chrome, real touch/keyboard simulation + canvas pixel/geometry analysis

---

## 1. Verdict

**SHIP: YES ✅** — MVP ready to ship cho mobile.

- Test cases run: **6 / 6** categories, **3 portrait + 2 landscape** viewports
- Automated checks: **all PASS, 0 bugs** (exit code 0)
- Performance: **75 FPS** measured (target ≥ 55)
- Re-run command: `node scripts/qa-mobile-ux.js` (requires `python3 -m http.server 8765`)

---

## 2. Test Cases & Results

| TC | Area | Result |
|----|------|--------|
| TC1 | Layout: canvas + HUD fits, no D-pad | ✅ PASS (3 viewports) |
| TC2 | Controls: joystick 4-dir, tap≠pause, 180° rule | ✅ PASS (3 viewports) |
| TC3 | Gameplay: move / eat / collide / score / speedup | ✅ PASS |
| TC4 | Responsive: portrait + landscape | ✅ PASS (2 landscape) |
| TC5 | Performance: ≥ 55 FPS | ✅ PASS (75 FPS) |
| TC6 | No layout overflow / clipped buttons | ✅ PASS |

### TC1 — Layout (AC-4, AC-5, AC-6)

Canvas is square, fills available height, ≥ spec minimum, HUD sits above canvas, pause button visible inside topbar. D-pad gone.

| Viewport | Canvas | ≥ min? | Square | HUD above | Pause in topbar |
|----------|--------|--------|--------|-----------|-----------------|
| iPhone SE (375×667) | 357×357 | ✅ (≥330) | ✅ | ✅ | ✅ |
| iPhone 12/13 (390×844) | 374×374 | ✅ (≥360) | ✅ | ✅ | ✅ |
| Samsung A-series (360×800) | 340×340 | ✅ (≥336) | ✅ | ✅ | ✅ |

### TC2 — Controls (AC-1, AC-2, AC-3, AC-7)

Joystick activates on touch (1 finger, anywhere on canvas), hides on release, maps all 4 directions correctly, tap does NOT pause, 180° reversal correctly blocked.

Per-viewport result (identical across all 3):

- Joystick activates on touchStart: ✅
- Joystick hides on touchEnd: ✅
- Tap (< threshold) does NOT pause: ✅ (pause label unchanged before/after tap)
- Direction UP: ✅  | LEFT: ✅  | DOWN: ✅  | RIGHT: ✅
- 180° reversal blocked: ✅ (dir stayed `1,0` after LEFT drag while moving RIGHT — `REVERSE_detail: 1,0→1,0`)
- Game starts via START button: ✅

> **Note on test design:** directions were verified via a circular 90° path
> (UP→LEFT→DOWN→RIGHT) rather than UP→DOWN, because UP→DOWN *is* a 180°
> reversal and is correctly rejected by the game. This is the expected
> behavior per AC-1, not a defect.

### TC3 — Gameplay (happy + collision)

- Initial state: score=0, body=3, food present ✅
- Eat food: ✅ (food teleported ahead of head; next tick consumes it)
- Score increments (+10 per food): ✅
- Body grows (length > 3 after eat): ✅
- Tick speeds up (tickInterval < 150ms INITIAL_TICK): ✅
- Wall collision → GAME_OVER: ✅ (drove into wall, state transitioned to GAME_OVER)

### TC4 — Responsive (AC-8)

| Orientation | Viewport | Canvas | Square | Overflow | Starts | Playable |
|-------------|----------|--------|--------|----------|--------|----------|
| Landscape | iPhone SE (667×375) | 306×306 | ✅ | none | ✅ | ✅ |
| Landscape | iPhone 12 (844×390) | 323×323 | ✅ | none | ✅ | ✅ |

### TC5 — Performance

- Method: sample `requestAnimationFrame` timestamps over a 2-second window during active gameplay
- Result: **75 FPS** (151 frames / 2.0s) on iPhone 12 viewport emulated
- Threshold (≥ 55) met with headroom. Glow/shadowBlur rendering did not degrade frame rate.

### TC6 — Layout overflow

- Horizontal scroll width ≤ client width (no horizontal scrollbar): ✅ on all 5 viewports
- Pause button not clipped (fully inside viewport): ✅ on all 5 viewports

---

## 3. Bug List

**None.** 0 critical, 0 high, 0 medium, 0 low.

The parent task (t_61a05544, Frontend) already found and fixed one real bug during implementation — the pause-button double-fire (p5 global `mousePressed`/`mouseReleased` catching button clicks → instant pause). That fix is verified working in this run (TC2 tap≠pause passes; pause button toggles cleanly).

---

## 4. AC Cross-reference

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC-1 | Joystick steers 4 dirs accurately | ✅ | TC2 dirMapping all true |
| AC-2 | Joystick doesn't block game | ✅ | TC2 activates/hides + canvas visible |
| AC-3 | Tap on canvas ≠ pause | ✅ | TC2 tapNoPause true (3 viewports) |
| AC-4 | Layout fits mobile | ✅ | TC1 all canvas ≥ min, square |
| AC-5 | Pause button separate | ✅ | TC1 pauseBtnInTopbar true |
| AC-6 | D-pad removed | ✅ | no `#dpad` in DOM, no 240px subtraction |
| AC-7 | Desktop unaffected | ✅ (verified by parent) | keyboard arrows/WASD intact |
| AC-8 | Responsive portrait+landscape | ✅ | TC4 both landscape playable |

---

## 5. Artifacts

- Test script: `scripts/qa-mobile-ux.js`
- Machine-readable results: `qa/qa-mobile-ux-results.json`
- Screenshots: `screenshots/qa-iPhone-SE.png`, `screenshots/qa-iPhone-12-13.png`, `screenshots/qa-Samsung-A-series.png`

---

## 6. Regression notes for future runs

1. Start a static server first: `python3 -m http.server 8765` (test hits `http://localhost:8765/index.html`).
2. The harness stubs `document.hidden=false` on new documents because headless Chrome reports the tab as hidden, which would trigger the game's auto-pause-on-blur. This only affects the headless harness; it does not mask any game logic.
3. Direction assertions must use a circular 90° path (never sequential UP→DOWN or LEFT→RIGHT), since the 180° rule is a real game constraint.
4. The eat test teleports food one cell ahead of the head for determinism; a greedy steering AI is flaky in headless and was removed.

_Signed off by QA (Goku) — 2026-08-09_
