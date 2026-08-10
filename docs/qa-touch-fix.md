# QA Test Plan — Touch Fix (Portrait Mode)

Task: t_773b0257
Parent fix: t_0b1dc64b — tap = instant direction change on `touchStart` using real touch coords (`changedTouches`) instead of unreliable p5 `mouseX/mouseY`.

## Environment

- Runtime: Node 22 + Puppeteer 25.5 (Chromium headless)
- Viewport: 390×844 (iPhone 12 portrait), `hasTouch:true`, `isMobile:true`, `deviceScaleFactor:2`
- Target file: `index.html`
- Code under test: `touchStarted` / `touchMoved` / `touchEnded` (index.html:1009–1063), `getTapZone` (index.html:513), `applyJoystickDrag` (index.html:983), `setDirection` (index.html:154)

## Test Cases

| # | AC | Test | File | Status |
|---|-----|------|------|--------|
| 1 | Tap upper half → UP | Tap 4 zones, assert nextDirection on touchStart | `test_touch.js` | PASS |
| 2 | Tap lower half → DOWN | (same) | `test_touch.js` | PASS |
| 3 | Tap left → LEFT, right → RIGHT | (same) | `test_touch.js` | PASS |
| 4 | Tap response < 50ms | Instrument `setDirection`, measure latency across 6 taps | `test_latency.js` | PASS (max 37.6ms incl. CDP overhead; in-page handler synchronous → ~0ms game-side) |
| 5 | Joystick drag still works | touchStart + touchMove past threshold → perpendicular direction; thumb clamp; active-state lifecycle | `test_joystick.js` | PASS (5/5) |
| 6 | Desktop keyboard unaffected | Arrow-key sequence on desktop viewport (no touch) | `test_keyboard.js` | PASS (4/4) |
| 7 | Chrome DevTools TOUCH simulation | Manual: toggle device toolbar → touch, repeat cases 1–3 | See Manual section below |

### Regression coverage
- `test_touch_sequence.js` — 8 valid clockwise play-sequence taps across 2 rounds (no 180° reversals). Guards against the "direction stuck" class of bug.

## Manual test (AC-7) — requires human

Puppeteer drives Chrome via CDP, which is the same touch-simulation engine as
DevTools device mode, but the task explicitly asks for the DevTools UI path.
This cannot be automated from a headless CLI. Steps for the human reviewer:

1. Open `index.html` in Chrome desktop.
2. F12 → toggle device toolbar (Cmd+Shift+M).
3. Select "iPhone 12 Pro" (390×844), ensure **Touch** is on.
4. Click center to start, then tap each half:
   - tap top → snake goes UP
   - tap bottom → DOWN
   - tap left third → LEFT
   - tap right third → RIGHT
5. Drag from center upward/downward → snake turns (joystick fallback).
6. Expected: every tap responds within one tick (150ms); no dead taps.

Automated results (cases 1–6) make this low-risk, but the manual pass is the
final gate for real-device parity.

## Bug list

None found.

## Sign-off

Mobile portrait playable: **YES** (automated). Pending human DevTools/real-device confirmation for AC-7.
