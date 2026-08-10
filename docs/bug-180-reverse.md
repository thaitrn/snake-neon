# BUG-001 (CRITICAL): 180° instant reversal via touch on portrait mobile

**Status:** OPEN — blocks ship
**Severity:** Critical (gameplay-breaking, instant death)
**Found by:** QA full re-test (task t_3c4e436a, run 62)
**Reproducibility:** 100% (deterministic)
**Affected:** index.html, portrait orientation, touch input

## Summary
On portrait mobile, a single touch gesture can force the snake to reverse 180°
(RIGHT → LEFT, UP → DOWN, etc.), causing instant self/wall collision death.
The 180° reversal guard in `setDirection()` is defeated by a two-step direction
queue within one tick.

## Steps to reproduce
1. Open http://127.0.0.1:8766/index.html on a portrait mobile viewport
   (iPhone 12 390×844, Samsung A-series 360×800, etc.). HasTouch=true.
2. Start the game. Snake moves RIGHT.
3. Touch down at dead-center of canvas, then drag left past the joystick
   threshold, all within one tick (<150ms).

**Automated repro:** `node scripts/probe180.js`

## Expected
Snake direction stays RIGHT or turns perpendicular (UP/DOWN). 180° reversal
to LEFT is blocked.

## Actual
Snake instantly reverses to LEFT (direction.x: 1 → -1). Instant 180°.

## Root cause
`setDirection()` (index.html:154-159) guards against reversal using:
```
const compareDir = snake.nextDirection || snake.direction;
```
This compares the NEW direction against the *last queued* nextDirection, NOT
against the *committed* snake.direction. A touch gesture queues two
perpendicular directions within one tick:

1. `touchStarted` at dead-center → `getTapZone()` resolves to DOWN →
   `setDirection(DOWN)`: compareDir=RIGHT (perpendicular) → queues
   `nextDirection=DOWN`.
2. `touchMoved` left → `setDirection(LEFT)`: compareDir=nextDirection=DOWN
   (perpendicular) → overwrites `nextDirection=LEFT`.
3. Next `snakeTick()`: `snake.direction = LEFT`. The snake was moving RIGHT →
   reversed 180° in a single tick. Guard never saw RIGHT vs LEFT.

## Impact
- Any fast swipe that passes through center triggers tap-zone instant direction,
  then drag direction. Two perpendicular inputs in one tick = reverse.
- Players die instantly from normal flick gestures.
- This is why the mobile UX suite flagged `REVERSE_BLOCKED: false` on iPhone
  12/13 and Samsung A-series (iPhone SE passed only by timing luck).

## Suggested fix
`setDirection()` must reject a new direction if it reverses the *committed*
`snake.direction`, regardless of what's queued:

```js
function setDirection(newDir) {
  // Reject 180° reversal against BOTH the committed direction and the queue.
  const d = snake.direction;
  if (newDir.x === -d.x && newDir.y === -d.y) return;   // vs committed
  const q = snake.nextDirection || d;
  if (newDir.x === -q.x && newDir.y === -q.y) return;    // vs last queued
  if (newDir.x === q.x && newDir.y === q.y) return;      // no-op
  snake.nextDirection = newDir;
}
```

## Evidence
- `qa/qa-mobile-ux-results.json`: TC2_180Rule=false on iPhone 12/13 + Samsung.
- `scripts/probe180.js` instrumented run:
  `setDirection calls: [DOWN, LEFT]` → `after tick: dir{-1,0}` = reversed.
- Critical regression suite R6 (180 keyboard guard) passes because keyboard
  cannot fire two perpendicular inputs in one frame — touch can.
