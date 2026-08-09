# Snake Neon — Technical Architecture

> **Tài liệu:** Kiến trúc kỹ thuật (Solution Architect)
> Version: 1.0 | Date: 2026-08-08
> Status: Approved for Dev
> Input: PRD (docs/prd.md), Game Design (docs/game-design.md), Mechanics (docs/mechanics.md), User Stories (docs/user-stories.md)

---

## Mục lục

1. [Tech Stack](#1-tech-stack)
2. [File Structure](#2-file-structure)
3. [Game Loop & Architecture](#3-game-loop--architecture)
4. [Core Systems Design](#4-core-systems-design)
5. [Input System](#5-input-system)
6. [Rendering Pipeline](#6-rendering-pipeline)
7. [Audio System](#7-audio-system)
8. [Performance Strategy](#8-performance-strategy)
9. [Responsive Design](#9-responsive-design)
10. [Neon Aesthetic Tech Specs](#10-neon-aesthetic-tech-specs)
11. [Deployment](#11-deployment)
12. [Conflict Resolutions (PM vs BA)](#12-conflict-resolutions-pm-vs-ba)
13. [Module API Contracts](#13-module-api-contracts)
14. [Risk Mitigation Checklist](#14-risk-mitigation-checklist)

---

## 1. Tech Stack

| Layer | Công nghệ | Phiên bản | Lý do |
|---|---|---|---|
| **Rendering** | p5.js | 1.11.x (latest stable) | Canvas API wrapper, giản lặp setup code, đủ API cho neon glow (shadowBlur) |
| **Audio** | p5.sound.js | bundled với p5.js 1.11 | WebAudio oscillator — generate SFX runtime, 0 file tải thêm |
| **Persistence** | localStorage (native browser API) | — | High score + mute state, không cần backend |
| **HTML/CSS/JS** | Vanilla, no framework | ES6+ | KISS, YAGNI — game nhỏ, không cần React/Vue |
| **Build** | **KHÔNG build step** | — | Dev mở `index.html` chạy được ngay |
| **p5.js CDN** | jsDelivr | `https://cdn.jsdelivr.net/npm/p5@1.11.5/lib/p5.min.js` | Stable CDN, fast global |

### Tại sao KHÔNG dùng build tool?

- Game là 1 HTML file + vài JS module. Không cần bundling, minify, transpile.
- Dev experience: mở file = chạy. Không cần `npm install`, không `node_modules`.
- Deploy: copy file lên static host, xong.
- Nếu sau này cần modular hóa nhiều, có thể thêm ES modules (`<script type="module">`) — browser support native, vẫn không cần bundler.

---

## 2. File Structure

### Quyết định: Single HTML file cho MVP (P0)

Lý do: Game Snake Neon đủ nhỏ (ước tính ~800-1200 dòng JS) để fit trong 1 file. Single file = dễ share, dễ deploy, không lo path.relative. Dev chỉ mở 1 file.

```
snake-neon/
├── index.html          ← Toàn bộ game (HTML + CSS + JS inline)
├── docs/
│   ├── prd.md
│   ├── game-design.md
│   ├── mechanics.md
│   ├── user-stories.md
│   └── architecture.md  ← file này
└── README.md            ← Setup guide, deploy guide
```

### Khi nào tách module?

Khi file vượt ~1500 dòng HOẶC thêm P1 features (D-pad, share, themes). Khi đó tách:

```
snake-neon/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── game.js          (main loop + state machine)
│   ├── snake.js          (snake logic)
│   ├── food.js           (food spawn)
│   ├── particles.js      (particle system)
│   ├── audio.js          (SFX + music)
│   ├── input.js          (swipe + keyboard)
│   ├── render.js         (drawing pipeline)
│   └── config.js         (constants, palette, tuning)
└── ...
```

Dùng ES modules (`<script type="module" src="js/game.js">`). Vẫn không cần bundler — browser native support.

---

## 3. Game Loop & Architecture

### 3.1 Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                    index.html                         │
│                                                       │
│  ┌─────────────┐   ┌──────────────┐   ┌───────────┐  │
│  │  State      │   │  Game Loop   │   │  Input    │  │
│  │  Machine    │◄──│  (p5.js)     │──►│  Handler  │  │
│  │  (4 states) │   │  draw()      │   │  (swipe/  │  │
│  └──────┬──────┘   │  60fps       │   │   keyboard)│  │
│         │          └──────┬───────┘   └─────┬─────┘  │
│         │                 │                  │        │
│         ▼                 ▼                  ▼        │
│  ┌─────────────┐   ┌──────────────┐   ┌───────────┐  │
│  │  Game       │   │  Render      │   │  Audio    │  │
│  │  Logic      │   │  Pipeline    │   │  Engine   │  │
│  │  (tick-based)│   │  (layers)    │   │  (p5.sound)│  │
│  └─────────────┘   └──────────────┘   └───────────┘  │
│         │                                              │
│         ▼                                              │
│  ┌─────────────┐                                      │
│  │  Storage    │   localStorage: highscore, mute      │
│  │  (wrapper)  │                                      │
│  └─────────────┘                                      │
└──────────────────────────────────────────────────────┘
```

### 3.2 Game Loop — Render / Logic Decoupling

**Nguyên tắc cốt lõi:** Render loop chạy 60fps, game logic tick chạy theo interval riêng (60-150ms). Hai loop độc lập.

```
┌─ draw() (mỗi frame, ~16.67ms) ──────────────────────────┐
│                                                         │
│  1. Tính deltaTime từ frame trước                        │
│  2. Accumulator += deltaTime                             │
│  3. WHILE accumulator >= tickInterval:                   │
│       └─ updateGameLogic()  // 1 tick                    │
│          accumulator -= tickInterval                     │
│  4. render()  // vẽ tất cả layers                        │
│                                                         │
│  → Game logic update đúng tickInterval dù FPS波动        │
│  → Render luôn 60fps mượt mà                             │
└─────────────────────────────────────────────────────────┘
```

**Tại sao fixed-step tick?**
- Snake movement là grid-based (rời rạc). Nếu gắn logic vào frameRate, snake sẽ nhảy không đều khi FPS drop.
- Fixed accumulator pattern đảm bảo snake luôn move đúng tickInterval, không phụ thuộc FPS.
- Pattern chuẩn cho game (Glenn Fiedler's "Fix Your Timestep").

### 3.3 State Machine

```
const STATES = {
  MENU:      'MENU',
  PLAYING:   'PLAYING',
  PAUSED:    'PAUSED',
  GAME_OVER: 'GAME_OVER'
};
```

```
            ┌──────────┐
     ┌──────│  MENU    │──────┐
     │      └────┬─────┘      │
     │    Start  │            │
     │   (tap/   │            │ (initial load)
     │   space)  ▼            │
     │    ┌───────────┐       │
     │    │  PLAYING  │       │
     │    └──┬────┬───┘       │
     │  Pause │    │ Death    │
     │ (P/Esc)│    │(collide) │
     │       ▼    ▼          │
     │  ┌───────┐ ┌──────────┐│
     │  │PAUSED │ │GAME_OVER ││
     │  └───┬───┘ └────┬─────┘│
     │Resume│    Retry│       │
     └──────┘        └────────┘
```

**Transition guard:**

```javascript
const TRANSITIONS = {
  MENU:     { PLAYING: true },
  PLAYING:  { PAUSED: true, GAME_OVER: true },
  PAUSED:   { PLAYING: true },
  GAME_OVER:{ MENU: true }
};

function transitionTo(newState) {
  if (TRANSITIONS[currentState][newState]) {
    onExit(currentState);
    currentState = newState;
    onEnter(newState);
  }
  // Invalid transition = silently ignored (BR-13)
}
```

**P0 scope:** MENU → PLAYING → GAME_OVER → MENU. (PAUSED = P1 nhưng thiết kế sẵn trong state machine.)

---

## 4. Core Systems Design

### 4.1 Snake

```javascript
const snake = {
  body: [
    { x: 8, y: 8 },   // [0] = head
    { x: 7, y: 8 },
    { x: 6, y: 8 }    // last = tail
  ],
  direction:     { x: 1, y: 0 },  // đang đi phải
  nextDirection: null              // buffer (depth 1)
};
```

**Move algorithm (mỗi tick):**
```javascript
function snakeTick() {
  // Áp dụng direction buffer
  if (snake.nextDirection) {
    snake.direction = snake.nextDirection;
    snake.nextDirection = null;
  }

  const head = snake.body[0];
  const newHead = {
    x: head.x + snake.direction.x,
    y: head.y + snake.direction.y
  };

  // Collision check (xem §4.3)
  // ...

  snake.body.unshift(newHead);

  if (newHead.x === food.x && newHead.y === food.y) {
    // Ăn food → KHÔNG pop tail (snake dài +1)
    onEatFood();
  } else {
    snake.body.pop();  // Giữ nguyên độ dài
  }
}
```

### 4.2 Food Spawn

```javascript
function spawnFood() {
  const occupied = new Set(
    snake.body.map(seg => `${seg.x},${seg.y}`)
  );

  const emptyCells = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!occupied.has(`${x},${y}`)) {
        emptyCells.push({ x, y });
      }
    }
  }

  if (emptyCells.length === 0) {
    // WIN condition — snake chiếm hết board (BR-05)
    transitionTo(GAME_OVER);
    return;
  }

  food = emptyCells[Math.floor(Math.random() * emptyCells.length)];
}
```

**P0 note:** Skip rule "không spawn 3 ô trước head" (BA §1.3.3). Grid 17×17 đủ nhỏ, random là đủ. Implement nếu feedback playability có vấn đề.

### 4.3 Collision Detection

```javascript
function checkCollision(newHead, willEat) {
  const { x, y } = newHead;

  // Wall collision (classic mode)
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) {
    return 'WALL';
  }

  // Self collision
  // Loại tail khỏi tập kiểm tra VÌ tail sẽ bị pop (BR-08)
  // TRỪ khi vừa ăn food (tail không bị xóa)
  const checkBody = willEat
    ? snake.body                    // check toàn bộ
    : snake.body.slice(0, -1);     // bỏ tail cuối

  for (let i = 0; i < checkBody.length; i++) {
    if (checkBody[i].x === x && checkBody[i].y === y) {
      return 'SELF';
    }
  }

  return null;  // no collision
}
```

**Edge case quan trọng (BR-08):** Khi snake CHƯA ăn food, tail sẽ bị `pop()` sau tick → ô tail hiện tại sẽ trống. Nên check self-collision phải **bỏ tail**. Nhưng nếu newHead == food → willEat=true → tail không bị xóa → phải check toàn bộ body kể cả tail.

### 4.4 Scoring

```javascript
// P0: combo đơn giản (chỉ +10/food)
function onEatFood() {
  score += BASE_POINTS;  // 10
  foodsEaten++;
  tickInterval = Math.max(MIN_TICK, INITIAL_TICK - foodsEaten * STEP_REDUCTION);
  spawnFood();
  triggerEatEffects();  // particles + SFX + screen flash
}

// P1: combo system (tham khảo, chưa implement P0)
function onEatFoodCombo() {
  const now = millis();
  if (now - lastEatTime <= COMBO_DECAY_MS) {
    comboCount++;
  } else {
    comboCount = 0;
  }
  lastEatTime = now;
  const multiplier = Math.min(3.0, 1 + comboCount * 0.5);
  score += Math.floor(BASE_POINTS * multiplier);
  // ...
}
```

### 4.5 Difficulty Curve (Speed)

```javascript
const INITIAL_TICK    = 150;  // ms
const MIN_TICK        = 60;   // ms (speed cap)
const STEP_REDUCTION  = 3;    // ms per food

function updateTickInterval() {
  tickInterval = Math.max(MIN_TICK, INITIAL_TICK - foodsEaten * STEP_REDUCTION);
}
```

| Foods eaten | Tick (ms) | Steps/sec |
|---|---|---|
| 0 | 150 | 6.7 |
| 10 | 120 | 8.3 |
| 20 | 90 | 11.1 |
| 30 | 60 | 16.7 (cap) |

### 4.6 High Score (localStorage Wrapper)

```javascript
const HS_KEY = 'snake_neon_highscore';

const Storage = {
  getHighScore() {
    try {
      const val = localStorage.getItem(HS_KEY);
      return val ? parseInt(val, 10) || 0 : 0;
    } catch (e) {
      // Private mode, storage full, etc.
      console.warn('localStorage unavailable, high score disabled');
      return 0;
    }
  },

  setHighScore(score) {
    try {
      localStorage.setItem(HS_KEY, String(score));
    } catch (e) {
      console.warn('Cannot save high score');
    }
  },

  getMute() {
    try {
      return localStorage.getItem('snake_neon_muted') === 'true';
    } catch (e) { return false; }
  },

  setMute(muted) {
    try {
      localStorage.setItem('snake_neon_muted', String(muted));
    } catch (e) {}
  }
};
```

**Graceful degradation:** Nếu localStorage throw (private mode, quota), game vẫn chạy bình thường — high score = 0 mỗi session, không crash. (Edge case từ BA §8.1)

---

## 5. Input System

### 5.1 Three Control Schemes (cùng active)

```
┌──────────────────────────────────┐
│         Input Handler            │
│                                  │
│  ┌─────────┐ ┌────────┐ ┌──────┐│
│  │ Swipe   │ │Keyboard│ │D-pad ││  ← P1
│  │ (touch) │ │(arrows)│ │(P1)  ││
│  └────┬────┘ └───┬────┘ └──┬───┘│
│       │          │          │    │
│       └────┬─────┘          │    │
│            ▼                ▼    │
│     setDirection(dir)            │
│     (validate + buffer)          │
└──────────────────────────────────┘
```

Tất cả input đều đi qua `setDirection()` — 1 hàm duy nhất, validate chống 180°, ghi vào buffer depth-1.

### 5.2 Direction Buffer (Anti Self-Kill)

```javascript
const DIR = {
  UP:    { x:  0, y: -1 },
  DOWN:  { x:  0, y:  1 },
  LEFT:  { x: -1, y:  0 },
  RIGHT: { x:  1, y:  0 }
};

function setDirection(newDir) {
  // Chống 180° (so với hướng HIỆN TẠI, không phải buffer)
  if (newDir.x === -snake.direction.x &&
      newDir.y === -snake.direction.y) {
    return;  // bỏ qua
  }
  // Trùng hướng hiện tại → bỏ qua
  if (newDir.x === snake.direction.x &&
      newDir.y === snake.direction.y) {
    return;
  }
  // OK, ghi vào buffer (depth 1, ghi đè nếu có)
  snake.nextDirection = newDir;
}
```

**Tại sao validate so với `snake.direction` chứ không phải `snake.nextDirection`?**
Nếu validate so với buffer, player có thể: đang đi PHẢI → vuốt LÊN (OK, buffer=UP) → vuốt TRÁI (LEFT != -UP → OK?) → tick: direction=UP, rồi next tick direction=LEFT. Nhưng từ UP sang LEFT là hợp lệ. Vấn đề là nếu player vuốt UP rồi DOWN nhanh: UP (OK), DOWN (= -UP hiện tại direction=RIGHT, RIGHT != -DOWN... wait).

Cần validate so với **hướng sẽ áp dụng** = nếu buffer có giá trị, validate so với buffer:

```javascript
function setDirection(newDir) {
  const compareDir = snake.nextDirection || snake.direction;

  if (newDir.x === -compareDir.x && newDir.y === -compareDir.y) {
    return;  // 180° → bỏ qua
  }
  snake.nextDirection = newDir;
}
```

**Final:** Validate so với `nextDirection` nếu có, ngược lại so với `direction`. Như vậy không thể chain 2 input thành 180°. (BR-03, BA §1.5.3)

### 5.3 Swipe Detection (Custom Layer)

p5.js có `touchStarted()`, `touchMoved()`, `touchEnded()` nhưng KHÔNG có swipe detection built-in. Cần custom:

```javascript
let touchStart = null;
const SWIPE_THRESHOLD = 30;  // px

function touchStarted() {
  if (touches.length > 0) {
    touchStart = { x: touches[0].x, y: touches[0].y };
  }
  return false;  // preventDefault — chặn scroll/zoom
}

function touchMoved() {
  if (!touchStart || touches.length === 0) return false;

  const dx = touches[0].x - touchStart.x;
  const dy = touches[0].y - touchStart.y;

  if (Math.max(Math.abs(dx), Math.abs(dy)) >= SWIPE_THRESHOLD) {
    if (Math.abs(dx) > Math.abs(dy)) {
      setDirection(dx > 0 ? DIR.RIGHT : DIR.LEFT);
    } else {
      setDirection(dy > 0 ? DIR.DOWN : DIR.UP);
    }
    // Reset để cho phép swipe tiếp liên tục
    touchStart = { x: touches[0].x, y: touches[0].y };
  }

  return false;  // preventDefault
}

function touchEnded() {
  if (touchStart) {
    // Nếu touchMoved không trigger swipe → đây là tap
    handleTap();
  }
  touchStart = null;
  return false;
}
```

**Key points:**
- `return false` từ touch handlers → chặn browser default (scroll, zoom, double-tap)
- Swipe trigger ngay khi vượt threshold trong `touchMoved` — không cần lift finger (responsive)
- Reset `touchStart` sau mỗi swipe để cho phép continuous swipe
- Tap (dưới threshold) xử lý theo context (start/pause/retry)

### 5.4 Keyboard

```javascript
function keyPressed() {
  const key = keyCode;

  // Direction keys
  if (key === UP_ARROW    || key === 87) setDirection(DIR.UP);     // W
  if (key === DOWN_ARROW  || key === 83) setDirection(DIR.DOWN);   // S
  if (key === LEFT_ARROW  || key === 65) setDirection(DIR.LEFT);   // A
  if (key === RIGHT_ARROW || key === 68) setDirection(DIR.RIGHT);  // D

  // State keys
  if (key === 32 || key === ENTER) {   // Space / Enter
    if (state === STATES.MENU)      transitionTo(STATES.PLAYING);
    if (state === STATES.GAME_OVER) { resetGame(); transitionTo(STATES.PLAYING); }
  }
  if (key === 80 || key === ESCAPE) {  // P / Esc
    if (state === STATES.PLAYING) transitionTo(STATES.PAUSED);
    else if (state === STATES.PAUSED) transitionTo(STATES.PLAYING);
  }
}
```

**Note:** `keyPressed()` chỉ fire 1 lần per keydown (không repeat). p5.js xử lý điều này — không cần custom debounce. (US-03 AC: "Key repeat không spam")

### 5.5 Auto-Pause on Tab Blur

```javascript
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === STATES.PLAYING) {
    transitionTo(STATES.PAUSED);
  }
});
```

---

## 6. Rendering Pipeline

Mỗi `draw()` frame, render theo thứ tự layer (back → front):

```
┌─────────────────────────────────────────────┐
│  Layer 1: BACKGROUND                         │
│  - Solid dark fill (#0a0a0f)                 │
│  - (P1: subtle gradient)                     │
├─────────────────────────────────────────────┤
│  Layer 2: GRID                               │
│  - Subtle grid lines (#1a1a2e)               │
│  - strokeWeight(1), low alpha                │
├─────────────────────────────────────────────┤
│  Layer 3: FOOD                               │
│  - Pulsing scale animation                   │
│  - Glow (shadowBlur=20, shadowColor=pink)    │
├─────────────────────────────────────────────┤
│  Layer 4: SNAKE                              │
│  - Body segments (green, glow)               │
│  - Head (slightly brighter)                  │
│  - Glow (shadowBlur=15, shadowColor=green)   │
├─────────────────────────────────────────────┤
│  Layer 5: PARTICLES                          │
│  - Active particles (eat burst, death)       │
│  - Fade out over ~300ms                      │
├─────────────────────────────────────────────┤
│  Layer 6: HUD                                │
│  - Score (cyan), Best (yellow)               │
│  - (P1: Combo counter, timer bar)           │
├─────────────────────────────────────────────┤
│  Layer 7: OVERLAY (state-dependent)          │
│  - MENU: title, best, "tap to play"          │
│  - PAUSED: "PAUSED" overlay                  │
│  - GAME_OVER: score, "tap to retry"          │
│  - (P1: CRT scanlines)                       │
└─────────────────────────────────────────────┘
```

### Render Code Pattern

```javascript
function draw() {
  // --- Game logic (fixed timestep) ---
  const now = millis();
  const dt = now - lastFrameTime;
  lastFrameTime = now;

  if (state === STATES.PLAYING) {
    tickAccumulator += dt;
    while (tickAccumulator >= tickInterval) {
      snakeTick();
      tickAccumulator -= tickInterval;
    }
  }

  // --- Render ---
  renderBackground();
  renderGrid();
  renderFood();
  renderSnake();
  renderParticles();
  renderHUD();
  renderStateOverlay();
}
```

---

## 7. Audio System

### 7.1 SFX (Square Wave Oscillator)

p5.sound `p5.Oscillator` — generate runtime, 0 file tải thêm:

```javascript
let audioReady = false;

function initAudio() {
  // Phải khởi tạo sau user gesture (browser autoplay policy)
  if (typeof getAudioContext === 'function') {
    userStartAudio();  // p5.js helper — resume AudioContext
  }
  audioReady = true;
}

function playEatSFX() {
  if (Storage.getMute() || !audioReady) return;

  const osc = new p5.Oscillator('square');
  const env = new p5.Envelope();
  env.setADSR(0.005, 0.04, 0.0, 0.01);  // attack, decay, sustain, release
  env.setRange(0.3, 0);                   // volume range

  osc.freq(800);  // ~800Hz
  osc.start();
  env.play(osc, 0, 0.05);  // play với 50ms duration
  setTimeout(() => osc.stop(), 60);
}

function playDeathSFX() {
  if (Storage.getMute() || !audioReady) return;

  const osc = new p5.Oscillator('square');
  osc.start();
  // Descending sweep: 400Hz → 100Hz over 300ms
  osc.freq(400);
  osc.freq(100, 0.3);  // ramp to 100Hz in 0.3s
  setTimeout(() => osc.stop(), 320);
}
```

### 7.2 Background Music (Chiptune Loop)

```javascript
// Melody = array of notes → sequenced oscillators
const MELODY = [
  { note: 'C4', dur: 0.15 },
  { note: 'E4', dur: 0.15 },
  { note: 'G4', dur: 0.15 },
  { note: 'C5', dur: 0.15 },
  { note: 'G4', dur: 0.15 },
  { note: 'E4', dur: 0.15 },
  // ... ~15-30 giây loop
];

let melodyOsc, melodyEnv;
let melodyIndex = 0;
let nextNoteTime = 0;

function updateMusic() {
  if (Storage.getMute() || !audioReady || state !== STATES.PLAYING) return;

  const now = millis();
  if (now >= nextNoteTime) {
    const note = MELODY[melodyIndex];
    melodyOsc.freq(midiToFreq(getMidi(note.note)));
    melodyEnv.play(melodyOsc);
    nextNoteTime = now + note.dur * 1000;
    melodyIndex = (melodyIndex + 1) % MELODY.length;
  }
}
```

### 7.3 Audio Init Timing

```
Page load → MENU
  ↓
User tap "PLAY" (hoặc bất kỳ tap)
  ↓
initAudio() → userStartAudio()  ← giải quyết autoplay policy
  ↓
Music + SFX ready
```

**Quan trọng:** Audio KHÔNG auto-play khi page load. Chỉ init sau user gesture (tap/keypress). Đây là constraint của browser, không phải design choice. Flow tự nhiên: player phải tap Play → audio unlock.

---

## 8. Performance Strategy

### 8.1 Target: 60fps trên mobile tầm trung

| Technique | Cách | Impact |
|---|---|---|
| `pixelDensity(1)` | Disable HiDPI rendering (retina = 2x pixel count) | Giảm 50-75% pixel workload |
| Disable FES | `drawingContext.imageSmoothingEnabled = false` | Faster image ops |
| Particle cap | Max 50 particles active cùng lúc | Tránh particle explosion lag |
| ShadowBlur limit | Glow chỉ apply cho snake + food, KHÔNG cho grid/particles | shadowBlur = expensive GPU op |
| Object pooling | Reuse particle objects thay vì new/garbage collect | Tránh GC stutter |
| Fixed timestep | Logic tick độc lập FPS | Consistent gameplay |

### 8.2 p5.js setup

```javascript
function setup() {
  const canvas = createCanvas(canvasW, canvasH);
  pixelDensity(1);                           // force 1x (mobile perf)
  frameRate(60);
  drawingContext.imageSmoothingEnabled = false;
  // ...
}
```

### 8.3 Particle System (Object Pooling)

```javascript
const MAX_PARTICLES = 50;
const particles = [];

// Pre-allocate pool
for (let i = 0; i < MAX_PARTICLES; i++) {
  particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, color: null });
}

function spawnParticle(x, y, color) {
  for (let i = 0; i < particles.length; i++) {
    if (!particles[i].active) {
      particles[i].active = true;
      particles[i].x = x;
      particles[i].y = y;
      particles[i].vx = random(-3, 3);
      particles[i].vy = random(-3, 3);
      particles[i].life = 1.0;      // 0 → 1, fade out
      particles[i].color = color;
      return;
    }
  }
  // Pool đầy → skip (không crash, không lag)
}

function updateParticles(dt) {
  for (let i = 0; i < particles.length; i++) {
    if (!particles[i].active) continue;
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= dt / 300;  // ~300ms lifetime
    if (p.life <= 0) p.active = false;
  }
}
```

---

## 9. Responsive Design

### 9.1 Canvas Sizing

```
Viewport detection → canvas size → cell size

Mobile portrait (375×667):
  canvas = min(width, height) - margin  → ~340×340
  cellSize = 340 / 17 = 20px

Desktop (1920×1080):
  canvas = 600×600 (capped, centered)
  cellSize = 600 / 17 = ~35px
```

```javascript
function resizeCanvasToFit() {
  const margin = 20;  // px padding từ viewport edge
  const maxCanvas = 600;  // desktop cap

  const vw = windowWidth;
  const vh = windowHeight;

  // Canvas = square, fit trong viewport (giữ grid vuông — BR-01)
  let size = Math.min(vw, vh) - margin * 2;
  size = Math.min(size, maxCanvas);

  cellSize = Math.floor(size / COLS);  // floor để tránh sub-pixel
  const canvasSize = cellSize * COLS;   // exact fit

  resizeCanvas(canvasSize, canvasSize);
}
```

```javascript
function windowResized() {
  resizeCanvasToFit();
}
```

### 9.2 Mobile Adaptation

| Orientation | Layout |
|---|---|
| **Portrait** (primary) | Canvas chiếm full width, HUD ở top, touch zone = toàn canvas |
| **Landscape** | Canvas centered, HUD overlay on top, touch zone = canvas area |

**CSS để chặn mobile browser behavior:**

```css
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  overflow: hidden;            /* chặn scroll */
  overscroll-behavior: none;   /* chặn pull-to-refresh */
  touch-action: none;          /* chặn pinch-zoom, double-tap zoom */
  -webkit-user-select: none;   /* chặn text select */
  user-select: none;
  background: #0a0a0f;
}
canvas { display: block; margin: 0 auto; }
```

```html
<meta name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
```

### 9.3 Touch Zone

Toàn bộ canvas = touch zone. Không deadzone. Swipe ở bất kỳ đâu trên canvas đều register.

---

## 10. Neon Aesthetic Tech Specs

### 10.1 Color Palette (p5.js Color Objects)

```javascript
const PALETTE = {
  bg:        '#0a0a0f',
  snake:     '#00ff88',
  snakeHead: '#33ffaa',
  food:      '#ff006e',
  grid:      '#1a1a2e',
  scoreText: '#00d9ff',
  accent:    '#ffee00',
  white:     '#ffffff'
};
```

### 10.2 Glow Effect

```javascript
function drawWithGlow(drawFn, glowColor, blurRadius) {
  drawingContext.save();
  drawingContext.shadowBlur = blurRadius;
  drawingContext.shadowColor = glowColor;
  drawFn();
  drawingContext.restore();  // MUST restore — không leak glow state
}

// Usage:
drawWithGlow(() => {
  fill(PALETTE.snake);
  noStroke();
  rect(head.x * cellSize, head.y * cellSize, cellSize, cellSize);
}, PALETTE.snake, 15);
```

**Quan trọng:** `drawingContext.save()` / `restore()` để glow không leak sang layer khác. Nếu quên restore, toàn bộ canvas sẽ có glow → performance tank.

### 10.3 Snake Glow (Breathing Pulse)

```javascript
function getSnakeGlow() {
  // Pulse: 10 → 20 theo sin wave
  const pulse = (Math.sin(millis() / 500) + 1) / 2;  // 0 → 1
  return 10 + pulse * 10;  // 10px → 20px
}
```

### 10.4 Food Pulse Animation

```javascript
function drawFood() {
  const pulse = (Math.sin(millis() / 200) + 1) / 2;  // 0 → 1, faster
  const scale = 0.8 + pulse * 0.4;  // 0.8x → 1.2x

  const cx = food.x * cellSize + cellSize / 2;
  const cy = food.y * cellSize + cellSize / 2;
  const r = (cellSize / 2 - 2) * scale;

  drawWithGlow(() => {
    fill(PALETTE.food);
    noStroke();
    circle(cx, cy, r * 2);
  }, PALETTE.food, 20);
}
```

### 10.5 CRT Scanline Overlay (P1)

```javascript
function drawScanlines() {
  drawingContext.save();
  drawingContext.globalAlpha = 0.05;
  stroke(255);
  strokeWeight(1);
  for (let y = 0; y < height; y += 3) {
    line(0, y, width, y);
  }
  drawingContext.restore();
}
```

Draw sau tất cả layers khác, globalAlpha thấp (5%) để không che gameplay.

### 10.6 Death Effects

```javascript
function triggerDeathEffects() {
  // Screen shake
  shakeAmount = 8;  // pixels
  shakeDuration = 300;  // ms

  // Snake flash đỏ
  snakeFlashColor = PALETTE.food;  // pink/red flash
  snakeFlashTime = millis();

  // Particle scatter từ toàn thân
  for (const seg of snake.body) {
    for (let i = 0; i < 3; i++) {
      spawnParticle(
        seg.x * cellSize + cellSize / 2,
        seg.y * cellSize + cellSize / 2,
        PALETTE.snake
      );
    }
  }
}

// Trong render:
function applyScreenShake() {
  if (shakeAmount > 0) {
    translate(random(-shakeAmount, shakeAmount), random(-shakeAmount, shakeAmount));
    shakeAmount *= 0.9;  // decay
  }
}
```

---

## 11. Deployment

### 11.1 Static Hosting Options

| Platform | Pros | Cons | Recommendation |
|---|---|---|---|
| **GitHub Pages** | Free, git-based, custom domain | Public repo (free tier) | Default choice |
| **Netlify** | Drag-drop deploy, instant previews, form handling | Overkill cho 1 file | Backup |
| **Vercel** | Fast CDN, zero config | Overkill | Backup |

### 11.2 Deploy via GitHub Pages

```bash
# 1. Push code lên GitHub repo
git init && git add . && git commit -m "Snake Neon MVP"
git remote add origin <repo-url>
git push -u origin main

# 2. Settings → Pages → Source: main branch / root
# 3. Game live tại: https://<username>.github.io/snake-neon/
```

### 11.3 CDN for p5.js

```html
<!-- Trong index.html -->
<script src="https://cdn.jsdelivr.net/npm/p5@1.11.5/lib/p5.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/p5@1.11.5/lib/addons/p5.sound.min.js"></script>
```

**Fallback:** Nếu CDN chặn, bundle p5.js local (download file, reference relative path). Không phụ thuộc network sau first load.

---

## 12. Conflict Resolutions (PM vs BA)

Trong quá trình đọc input, phát hiện một số xung đột giữa PM docs và BA docs. Architect quyết định final:

| # | Vấn đề | PM nói | BA nói | **Architect quyết định** | Lý do |
|---|---|---|---|---|---|
| 1 | **Grid size** | 20×20 | 17×17 | **17×17** | BA có lý do tốt hơn (lẻ = có ô trung tâm). PM chưa test, BA đã analyze. Grid nhỏ hơn = session ngắn hơn = phù hợp casual arcade. |
| 2 | **Speed formula** | `max(70, 150 - food*2)` | `max(60, 150 - food*3)` | **`max(60, 150 - food*3)`** (BA version) | Cap 60ms (16.7/s) chơi được trên mobile. Step -3ms nhanh hơn, đạt max speed ở 30 food (vs 40 food PM). Arcade feel nhanh hơn. |
| 3 | **localStorage key** | `snake_neon_best` | `snake_neon_highscore` | **`snake_neon_highscore`** (BA version) | Descriptive hơn. Đặt 1 lần, không đổi. |
| 4 | **Combo system scope** | P1 (Game Design §3) | P0 (Mechanics §2 — có formula chi tiết) | **P0 basic combo, P1 full combo** | P0: chỉ +10/food, KHÔNG combo multiplier. Combo formula của BA = P1. Lý do: combo thêm complexity, MVP cần nhanh ship. Dev có thể implement combo nếu còn thời gian. |
| 5 | **Base points** | +10 | +10 (× combo) | **+10** | Đồng thuận. |

> **Dev note:** Nếu có thắc mắc về thông số, dùng giá trị trong bảng trên. Đây là final decision cho MVP.

---

## 13. Module API Contracts

Định nghĩa interface giữa các module (dù trong 1 file, vẫn cần rõ ràng để maintainable):

### 13.1 Config (Constants)

```javascript
// === GRID ===
const COLS = 17;
const ROWS = 17;

// === SNAKE ===
const START_LENGTH = 3;
const START_X = Math.floor(COLS / 2);  // 8
const START_Y = Math.floor(ROWS / 2);  // 8

// === SPEED ===
const INITIAL_TICK   = 150;  // ms
const MIN_TICK       = 60;   // ms
const STEP_REDUCTION = 3;    // ms/food

// === SCORING ===
const BASE_POINTS    = 10;

// === INPUT ===
const SWIPE_THRESHOLD = 30;  // px

// === COMBO (P1) ===
const COMBO_DECAY_MS = 3000;
const COMBO_CAP      = 3.0;

// === PARTICLES ===
const MAX_PARTICLES = 50;
const PARTICLE_LIFE = 300;  // ms

// === STORAGE KEYS ===
const HS_KEY   = 'snake_neon_highscore';
const MUTE_KEY = 'snake_neon_muted';
```

### 13.2 Public Functions (Contract cho Dev)

```
// Game lifecycle
setup()                      — p5.js init
draw()                       — main loop (60fps)
windowResized()              — responsive resize

// State machine
transitionTo(newState)       — guarded state change
resetGame()                  — full reset (snake, score, food, tick)

// Snake
snakeTick()                  — move 1 step (called from tick loop)
setDirection(dir)            — input entry point (all schemes)

// Food
spawnFood()                  — random empty cell

// Collision
checkCollision(newHead, willEat) → 'WALL' | 'SELF' | null

// Scoring
onEatFood()                  — score++, speed++, effects

// Storage
Storage.getHighScore() → number
Storage.setHighScore(score)
Storage.getMute() → boolean
Storage.setMute(muted)

// Audio
initAudio()                  — call after user gesture
playEatSFX()
playDeathSFX()
updateMusic()                — call in draw loop

// Render
renderBackground()
renderGrid()
renderFood()
renderSnake()
renderParticles()
renderHUD()
renderStateOverlay()

// Particles
spawnParticle(x, y, color)
updateParticles(dt)
```

---

## 14. Risk Mitigation Checklist

| Risk | Mitigation | Status |
|---|---|---|
| Mobile performance < 60fps | pixelDensity(1), particle cap 50, shadowBlur limited | Designed |
| shadowBlur expensive | Only snake + food have glow, save/restore context | Designed |
| Audio autoplay blocked | Init audio after first user tap | Designed |
| Swipe not smooth | Trigger in touchMoved (not touchEnded), 30px threshold | Designed |
| localStorage unavailable | try/catch wrapper, graceful degradation | Designed |
| FPS drop breaks gameplay | Fixed timestep accumulator (logic independent of FPS) | Designed |
| Self-collision false positive | Exclude tail from check (except when eating) | Designed |
| 180° reverse self-kill | Direction buffer depth-1, validate vs current/buffered dir | Designed |
| Glow state leak | drawingContext.save()/restore() around every glow draw | Designed |
| Window resize mid-game | windowResized() recalculates cellSize, snake/food scale | Designed |

---

## Appendix A: p5.js Lifecycle Hooks → Game Mapping

| p5.js Hook | Khi nào fire | Dùng cho |
|---|---|---|
| `preload()` | Trước setup | (P0: trống — không asset tải) |
| `setup()` | 1 lần khi load | Init canvas, pixelDensity, constants, state=MENU |
| `draw()` | Mỗi frame (~60fps) | Game loop: logic tick + render |
| `keyPressed()` | Key down (1 lần) | Keyboard input |
| `touchStarted()` | Finger down | Touch start tracking |
| `touchMoved()` | Finger move | Swipe detection |
| `touchEnded()` | Finger up | Tap detection |
| `windowResized()` | Viewport change | Canvas resize |

## Appendix B: Recommended Dev Order

```
Phase 1 — Core loop (playable):
  1. setup() + canvas + grid render
  2. Snake movement (keyboard only, no collision)
  3. Food spawn + eat + growth
  4. Wall + self collision → game over
  5. Score + high score (localStorage)

Phase 2 — Juice:
  6. Neon glow (shadowBlur)
  7. Particle system
  8. SFX (eat, death)
  9. Background music

Phase 3 — Mobile:
  10. Swipe detection
  11. Responsive canvas
  12. CSS (prevent scroll/zoom)

Phase 4 — Polish:
  13. Menu screen
  14. Game Over screen
  15. Mute button
  16. Auto-pause on tab blur
```

---

_End of Technical Architecture_
