# Mobile Controls V2 — Portrait Tap + Landscape Gamepad

> **Owner:** PM | **Date:** 2026-08-09 | **Status:** Proposed — chờ Sếp approve
> Task: t_9ce67b69
> Phản hồi V1 (floating joystick): Sếp muốn TÁCH rõ 2 trải nghiệm — Portrait = tap nhẹ casual, Landscape = gamepad handheld console feel
> Frontend task: t_bb7ae6a0 (đọc doc này trước khi implement)

---

## 0. TL;DR — Thay đổi so với V1

| | V1 (mobile-ux-redesign.md) | **V2 (doc này)** |
|---|---|---|
| Cơ chế | Floating joystick cho MỌI màn hình | **2 mode tách biệt theo orientation** |
| Portrait | Floating joystick | **Tap zone 4 vùng trên canvas** (tap nhẹ, 1 ngón, không giữ tay) |
| Landscape | Floating joystick | **Gamepad handheld** — screen giữa, D-pad trái, Start/Pause phải |
| Tap-to-pause | Cấm (tap = nothing) | Portrait: tap = steer. Pause qua nút riêng. Landscape: qua nút Start/Pause |

**Nguyên tắc cốt lõi (giữ nguyên):** Mobile-first, KHÔNG che canvas, 1 ngón, không mỏi tay.

---

## 1. Vấn đề V1 cần giải

V1 floating joystick tốt nhưng Sếp feedback muốn rõ hơn:
- **Portrait:** Joystick "kéo" vẫn có cảm giác "giữ tay". Sếp muốn tap nhẹ thật nhanh, casual, không phải kéo.
- **Landscape:** Màn hình rộng hơn, sếp muốn tận dụng = cảm giác cầm máy game tay cầm (Game Boy / Switch). Joystick 1 điểm không tận dụng được không gian 2 bên.

→ V2 tách 2 trải nghiệm theo orientation, mỗi mode tối ưu cho ngữ cảnh sử dụng riêng.

---

## 2. Mode 1: PORTRAIT (dọc) — Tap Zone

### 2.1. Wireframe

```
┌─────────────────────────┐
│  SCORE 040   BEST 150 ⏸ │  ← HUD topbar (score + best + pause btn)
├─────────────────────────┤
│                         │
│                         │
│         ▲               │  ← TAP ZONE: canvas chia 4 vùng
│      (UP)               │     Tap vào vùng nào → rắn đi hướng đó
│                         │
│   ◀       ▶             │
│ (LEFT)  (RIGHT)         │
│         ▼               │
│      (DOWN)             │
│                         │
└─────────────────────────┘
```

### 2.2. Tap Zone Spec — 4 vùng map sang 4 hướng

Canvas (17×17 grid) chia làm **4 vùng tam giác** bằng 2 đường chéo. Tap vào vùng nào → rắn đi hướng vùng đó.

```
         (0, 0)
          ╱╲
         ╱  ╲
        ╱UP  ╲
       ╱      ╲
      ╱        ╲
   LT ╱──────────╲ RT
      ╲          ╱
       ╲        ╱
        ╲ DOWN ╱
         ╲    ╱
          ╲  ╱
           ╲╱
         (W, H)
```

**Cách tính vùng (algorithm):**

```javascript
// tx, ty = touch position tương đối trong canvas
// canvasW, canvasH = kích thước canvas
function getTapZone(tx, ty) {
  const cx = canvasW / 2;  // center x
  const cy = canvasH / 2;  // center y
  // Dịch về gốc tọa độ tâm
  const dx = tx - cx;
  const dy = ty - cy;
  // 2 đường chéo chia 4 tam giác: so sánh |dx| vs |dy|
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy < 0 ? DIR.UP : DIR.DOWN;     // nửa trên = UP, nửa dưới = DOWN
  } else {
    return dx < 0 ? DIR.LEFT : DIR.RIGHT;  // nửa trái = LEFT, nửa phải = RIGHT
  }
}
```

**Vì sao chia 4 tam giác (chứ không 4 hình chữ nhật)?**
- Cảm giác tự nhiên hơn: tap gần mép trên = lên, gần mép dưới = xuống. Tam giác chia theo đường chéo phản ánh "gần hướng nào nhất".
- Không có vùng chết (dead zone) ở giữa — toàn bộ canvas đều điều khiển được.
- Đây chính là pattern mà Google Snake mobile và nhiều mobile arcade dùng.

### 2.3. Interaction — Portrait

| Trạng thái | Hành động | Kết quả |
|-----------|----------|---------|
| PLAYING | **Tap** (chạm < 150ms, di chuyển < 12px) vào vùng UP | Rắn đi UP (nếu không đang đi DOWN) |
| PLAYING | Tap vào vùng DOWN | Rắn đi DOWN (nếu không đang đi UP) |
| PLAYING | Tap vào vùng LEFT | Rắn đi LEFT (nếu không đang đi RIGHT) |
| PLAYING | Tap vào vùng RIGHT | Rắn đi RIGHT (nếu không đang đi LEFT) |
| PLAYING | **Swipe** (kéo > 12px) | Không cần — tap zone đủ. Nhưng VẪN giữ swipe làm fallback: vuốt lên/xuống/trái/phải → đổi hướng (dự phòng cho người quen vuốt). |
| Tap **nút Pause** (HUD) | Toggle PLAYING ↔ PAUSED |
| MENU / GAME_OVER / PAUSED | Tap = handleAction (start/retry/resume) — giữ nguyên |

**Quy tắc:**
- ✅ Tap nhẹ 1 ngón, không cần giữ tay — chính xác như sếp yêu cầu ("tap nhẹ, không giữ tay")
- ✅ Quy tắc 180° vẫn áp dụng (không quay ngược hướng hiện tại)
- ✅ Tap trên canvas khi PLAYING = **steer, KHÔNG pause** (pause qua nút riêng)

### 2.4. Swipe fallback (tùy chọn, giữ cho quen tay)

Swipe vẫn hoạt động song song tap zone — cùng `touchMoved`:
- `touchStarted` ghi origin
- `touchMoved`: nếu drag > threshold (12px) → map direction theo trục lớn hơn → setDirection
- `touchEnded`: nếu drag < 12px → **coi như tap** → getTapZone → setDirection

→ Cả tap và swipe đều đổi hướng. Người chơi chọn kiểu nào cũng được.

### 2.5. Visual feedback (Portrait)

Không cần vẽ overlay nào. Tap zone vô hình (không che canvas). Chỉ cần:
- (Tùy chọn) Hiển thị hint text ở Menu: "Tap vùng trên/dưới/trái/phải để rẽ"

---

## 3. Mode 2: LANDSCAPE (ngang) — Gamepad Handheld

### 3.1. Wireframe — Handheld Console Layout

```
┌──────────────────────────────────────────────────┐
│  SCORE 040          BEST 150                     │  ← HUD topbar mỏng
├───────┬──────────────────────────────┬───────────┤
│       │                              │           │
│       │                              │           │
│       │                              │   START   │
│  ╭─╮  │       CANVAS (game)          │   ⏸       │  ← Nút Start/Pause
│  ◀▶  │        (ở GIỮA)               │  (phải)   │
│  ╰─╯  │                              │           │
│       │                              │           │
│ D-PAD │                              │           │
│ (trái)│                              │           │
│       │                              │           │
└───────┴──────────────────────────────┴───────────┘
   ~30%           ~50% (center)            ~20%
```

### 3.2. Gamepad Layout Spec — Kích thước & vị trí

**Bố cục 3 cột (flexbox):**

| Cột | Chiều rộng | Nội dung |
|-----|-----------|----------|
| Trái | ~28-30% viewport width | D-pad (4 nút hình thập +) |
| Giữa | ~48-52% viewport width | Canvas (game screen) |
| Phải | ~20-24% viewport width | Nút Start/Pause (+ Mute optional) |

**D-pad (trái) — 4 nút dạng thập chữ (cross):**

```
        ┌─────┐
        │  ▲  │   UP
        └─────┘
   ┌─────┐ ┌─────┐
   │  ◀  │ │  ▶  │  LEFT / RIGHT
   └─────┘ └─────┘
        ┌─────┐
        │  ▼  │   DOWN
        └─────┘
```

- Mỗi nút: **56×56px** (touch target tối thiểu Apple HIG = 44px, mình dùng 56px cho thoải mái)
- Khoảng cách giữa các nút: **4px** gap
- Tổng D-pad footprint: ~116×116px
- Căn giữa dọc (vertical center) trong cột trái
- Căn giữa ngang trong cột trái

**Nút Start/Pause (phải):**

- **1 nút tròn**, diameter **72px**
- Label: "⏸" khi PLAYING, "▶" khi PAUSED
- Căn giữa dọc trong cột phải
- Touch target đủ lớn cho ngón cái phải

**Visual style (giữ neon aesthetic):**
- D-pad nút: `background #12121f`, `border 2px solid #1a1a2e`, `border-radius 10px`
- Active state: `box-shadow 0 0 12px #00ff88` (neon glow khi bấm)
- Start button: `border-radius 50%`, màu accent `#00d9ff` glow khi active

### 3.3. Interaction — Landscape Gamepad

| Trạng thái | Hành động | Kết quả |
|-----------|----------|---------|
| PLAYING | Tap nút D-pad ▲ | Rắn đi UP (nếu không đang DOWN) |
| PLAYING | Tap nút D-pad ▼ | Rắn đi DOWN (nếu không đang UP) |
| PLAYING | Tap nút D-pad ◀ | Rắn đi LEFT (nếu không đang RIGHT) |
| PLAYING | Tap nút D-pad ▶ | Rắn đi RIGHT (nếu không đang LEFT) |
| PLAYING | Tap nút **Start/Pause** | Toggle PLAYING ↔ PAUSED |
| MENU / GAME_OVER | Tap nút Start/Pause | Start game (handleAction) |
| PAUSED | Tap nút Start/Pause | Resume |

**Quy tắc:**
- ✅ Canvas ở giữa KHÔNG nhận touch điều khiển (touch trên canvas khi PLAYING = không làm gì, tránh nhầm)
- ✅ Tất cả điều khiển qua D-pad + nút vật lý (HTML buttons)
- ✅ D-pad và Start button dùng `touchstart` + `preventDefault` để tránh double-fire và 300ms delay
- ✅ Buttons có `stopPropagation` để không trigger canvas touch handlers

### 3.4. Tại sao KHÔNG cho tap zone trên canvas khi landscape?

- Landscape = "cầm máy game", canvas là **screen** — trong máy game thật, chạm màn hình không điều khiển gì.
- Tách rõ: canvas = xem, D-pad = chơi. Giống Game Boy / Switch / GBA.
- Tránh nhầm lẫn khi 2 tay cầm 2 bên: tay trái ở D-pad, tay phải ở Start. Chạm canvas giữa không có chủ đích.

---

## 4. Auto-Detect Orientation

### 4.1. Detection logic

```javascript
function getOrientation() {
  // windowWidth/windowHeight từ p5 đã phản ánh viewport hiện tại
  // Portrait = cao > rộng, Landscape = rộng > cao
  return windowWidth < windowHeight ? 'portrait' : 'landscape';
}
```

**Tại sao dùng `windowWidth < windowHeight` thay vì `window.orientation` / `screen.orientation`?**
- `window.orientation` đã deprecated (MDN).
- `screen.orientation.type` hỗ trợ tốt nhưng một số old Android lag.
- So sánh width/height đơn giản nhất, chính xác ngay khi resize event fire (khi xoay máy, browser resize → p5 `windowResized()` trigger).
- Edge case: tablet vuông hoặc desktop ratio ~1:1 → mặc định xử lý như portrait (tap zone) vì an toàn.

### 4.2. Trigger switching

```javascript
function windowResized() {
  const newOrient = getOrientation();
  if (newOrient !== currentOrientation) {
    currentOrientation = newOrient;
    switchControlMode(currentOrientation);
  }
  resizeCanvasToFit();  // recalculate canvas size cho mode mới
}
```

`switchControlMode()`:
- `'portrait'` → ẩn D-pad + Start button (HTML), hiện tap zone logic (JS)
- `'landscape'` → hiện D-pad + Start button (HTML), tắt tap zone (canvas touch = nothing khi PLAYING)

### 4.3. Desktop behavior

Desktop (pointer: fine, hover: hover):
- D-pad + Start button ẩn (dùng keyboard)
- Tap zone trên canvas cũng ẩn (desktop dùng arrow keys / WASD)
- Pause = phím P / Space / Esc, hoặc click nút Pause trong topbar

---

## 5. Responsive Layout — Cả 2 mode

### 5.1. Portrait canvas sizing

```javascript
function resizeCanvasToFit() {
  const margin = 8;
  const hudHeight = 44;
  let availW = windowWidth - margin * 2;
  let availH = windowHeight - hudHeight - margin * 2;
  let size = Math.min(availW, availH, 600);
  size = Math.max(size, 200);
  cellSize = Math.floor(size / COLS);
  canvasW = cellSize * COLS;
  canvasH = cellSize * ROWS;
  resizeCanvas(canvasW, canvasH);
}
```

(Không trừ gì cho D-pad — D-pad chỉ hiện ở landscape, khi đó layout đổi sang 3 cột)

### 5.2. Landscape canvas sizing

Landscape: canvas ở cột giữa, chiếm ~50% chiều rộng. Cần tính lại:

```javascript
function resizeCanvasToFit() {
  if (getOrientation() === 'landscape') {
    const dpadCol = windowWidth * 0.30;   // cột trái
    const btnCol  = windowWidth * 0.24;   // cột phải
    const hudHeight = 44;
    let availW = windowWidth - dpadCol - btnCol - 24;  // còn lại cho canvas + gap
    let availH = windowHeight - hudHeight - 16;
    let size = Math.min(availW, availH, 600);
    size = Math.max(size, 200);
    cellSize = Math.floor(size / COLS);
    canvasW = cellSize * COLS;
    canvasH = cellSize * ROWS;
    resizeCanvas(canvasW, canvasH);
  } else {
    // portrait logic (5.1)
  }
}
```

### 5.3. Breakpoint summary

| Thiết bị | Orientation | Canvas size (ước tính) | Control |
|----------|------------|----------------------|---------|
| iPhone SE (375×667) | Portrait | ~330px | Tap zone 4 vùng |
| iPhone 14 (390×844) | Portrait | ~360px | Tap zone |
| iPhone 14 landscape (844×390) | Landscape | ~340px | Gamepad |
| Android phổ thông (360×800) | Portrait | ~320px | Tap zone |
| Tablet (768×1024) | Portrait | ~560px | Tap zone |
| Desktop (>1024) | — | ~520px (max 600) | Keyboard |

---

## 6. HUD — Score & FPS cho mỗi mode

### 6.1. Portrait

```
┌─────────────────────────┐
│  SCORE 040   BEST 150 ⏸ │  ← topbar: score | best | pause btn
├─────────────────────────┤
│      [ CANVAS ]         │
```

- **Score + Best:** topbar (giữ nguyên V1)
- **Pause button:** topbar góc phải (HTML button, nhỏ)
- **FPS HUD:** (tùy chọn) vẽ nhỏ góc trên-trái *trên* canvas: `fill #00d9ff alpha 40%`, font 10px. Chỉ hiện khi debug flag bật (`?debug=1` URL param). Mặc định ẩn.

### 6.2. Landscape

```
┌──────────────────────────────────────────────────┐
│  SCORE 040          BEST 150                     │  ← topbar (mỏng)
├───────┬──────────────────────────────┬───────────┤
│ D-PAD │       [ CANVAS ]             │  START⏸   │
```

- **Score + Best:** topbar (giữ nguyên, full width)
- **Pause:** KHÔNG ở topbar (đã có nút Start/Pause riêng bên phải) → ẩn pause btn topbar khi landscape để gọn
- **FPS HUD:** (tùy chọn) góc trên-trái canvas, cùng logic portrait (debug only)

### 6.3. Menu / Game Over overlay

- Khi MENU / GAME_OVER / PAUSED: overlay vẽ trên canvas (giữ nguyên V1) — score, best, "TAP TO START" / "TAP TO RETRY"
- Overlay text tự scale theo cellSize (giữ nguyên)

---

## 7. Acceptance Criteria

### AC-1: Portrait — Tap zone điều khiển chính xác
- [ ] Khi xoay máy dọc → tự chuyển sang tap zone mode, D-pad ẩn
- [ ] Tap vùng nửa trên canvas → rắn đi UP (nếu không đang DOWN)
- [ ] Tap vùng nửa dưới canvas → rắn đi DOWN (nếu không đang UP)
- [ ] Tap vùng nửa trái canvas → rắn đi LEFT (nếu không đang RIGHT)
- [ ] Tap vùng nửa phải canvas → rắn đi RIGHT (nếu không đang LEFT)
- [ ] Tap khi rắn đang đi ngược hướng → bỏ qua (quy tắc 180°)
- [ ] Tap nhẹ (< 12px drag) = steer (KHÔNG pause)

### AC-2: Portrait — Tap không pause
- [ ] Tap bất kỳ đâu trên canvas khi PLAYING → KHÔNG trigger pause
- [ ] Pause chỉ qua: nút Pause (topbar), phím P/Space (desktop), tab switch
- [ ] `handleAction()` trong `touchEnded` KHÔNG gọi khi PLAYING

### AC-3: Landscape — Gamepad layout đúng
- [ ] Khi xoay máy ngang → tự chuyển sang gamepad mode, tap zone tắt
- [ ] Layout 3 cột: D-pad trái (~30%), canvas giữa (~50%), nút Start phải (~20%)
- [ ] Canvas nằm ở GIỮA, không bị che bởi D-pad hay nút
- [ ] D-pad: 4 nút ▲▼◀▶ dạng thập, mỗi nút ≥ 56×56px
- [ ] Nút Start/Pause: tròn, diameter ≥ 72px, góc phải
- [ ] Neon style nhất quán (border + glow khi active)

### AC-4: Landscape — D-pad điều khiển chính xác
- [ ] Tap nút ▲ → rắn đi UP (nếu không đang DOWN)
- [ ] Tap nút ▼ → rắn đi DOWN (nếu không đang UP)
- [ ] Tap nút ◀ → rắn đi LEFT (nếu không đang RIGHT)
- [ ] Tap nút ▶ → rắn đi RIGHT (nếu không đang LEFT)
- [ ] Tap trên canvas giữa khi PLAYING → KHÔNG làm gì (không steer, không pause)
- [ ] Nút Start/Pause → toggle PLAYING ↔ PAUSED

### AC-5: Auto-switch orientation
- [ ] Xoay máy từ dọc → ngang → gamepad xuất hiện, tap zone tắt, canvas re-size
- [ ] Xoay máy từ ngang → dọc → tap zone hoạt động, gamepad ẩn, canvas re-size
- [ ] Chuyển mode KHÔNG reset game (score, rắn, trạng thái giữ nguyên)
- [ ] Chuyển mode KHÔNG lag > 200ms (mượt khi xoay)

### AC-6: Canvas không bị che
- [ ] Portrait: canvas chiếm max available (không bị D-pad đẩy nhỏ)
- [ ] Landscape: canvas ở giữa, D-pad và nút ở 2 bên, KHÔNG overlap canvas
- [ ] iPhone SE portrait (375×667): canvas ≥ 330px
- [ ] iPhone 14 landscape (844×390): canvas ≥ 320px

### AC-7: HUD hiển thị đúng
- [ ] Portrait: topbar có SCORE + BEST + Pause button
- [ ] Landscape: topbar có SCORE + BEST; Pause button topbar ẨN (có nút Start riêng)
- [ ] Menu/Game Over overlay vẫn hiện score, best, instruction text
- [ ] FPS HUD (nếu bật debug): góc trên-trái canvas, nhỏ, alpha thấp

### AC-8: Desktop không bị ảnh hưởng
- [ ] Desktop: D-pad + Start button ẩn
- [ ] Arrow keys / WASD vẫn hoạt động
- [ ] Pause = phím P/Space/Esc hoặc click nút Pause topbar
- [ ] Tap zone trên canvas cũng ẩn (desktop dùng keyboard)

### AC-9: Touch conflict không xảy ra
- [ ] Landscape: D-pad button tap KHÔNG trigger canvas touchStarted (stopPropagation)
- [ ] Nút Start tap KHÔNG trigger canvas handlers
- [ ] Không double-fire (touchstart + click) — dùng `touchstart` + `preventDefault`

### AC-10: Joystick V1 được thay thế
- [ ] Xóa floating joystick logic (V1) — không còn `joystick.active` render
- [ ] Hoặc giữ joystick làm swipe fallback trong portrait (tap + swipe song song) — tùy dev, nhưng tap zone là chính
- [ ] Không còn `renderJoystick()` khi tap zone mode active

---

## 8. Implementation Notes cho Frontend

### 8.1. File thay đổi
- `index.html` — duy nhất (single-file app)

### 8.2. HTML changes

**Thêm (landscape gamepad):**
```html
<div id="gamepad" class="gamepad-hidden">
  <div id="dpad">
    <button class="dpad-btn dpad-up" data-dir="UP">▲</button>
    <button class="dpad-btn dpad-left" data-dir="LEFT">◀</button>
    <button class="dpad-btn dpad-right" data-dir="RIGHT">▶</button>
    <button class="dpad-btn dpad-down" data-dir="DOWN">▼</button>
  </div>
</div>
<button id="startBtn" class="start-hidden">⏸</button>
```

**Body layout (3 cột khi landscape):**
- Khi portrait: body flex column (topbar → canvas) — giữ V1
- Khi landscape: body flex row (gamepad-trái → canvas → nút-phải), topbar absolute trên cùng

### 8.3. CSS — 2 class điều khiển mode

```css
/* Portrait: gamepad ẩn */
.gamepad-hidden { display: none; }
.start-hidden { display: none; }

/* Landscape: hiện gamepad */
@media (orientation: landscape) and (max-width: 1024px) {
  #gamepad { display: flex; ... }
  #startBtn { display: block; ... }
}
```

> Lưu ý: Dùng `@media (orientation: landscape)` **kết hợp** JS detection (§4) vì CSS media query đôi khi không trigger ngay trên iOS Safari khi fullscreen.

### 8.4. JS — State mới

```javascript
let currentOrientation = 'portrait';  // 'portrait' | 'landscape'
```

### 8.5. JS — Touch handler logic theo mode

```javascript
function touchStarted() {
  initAudio();
  const pos = getTouchPos();

  if (currentState !== STATES.PLAYING) {
    // Menu/GameOver/Paused — tap = action (cả 2 mode)
    touchStart = { x: pos.x, y: pos.y };
    return false;
  }

  // PLAYING
  if (currentOrientation === 'portrait') {
    // Tap zone: ghi origin, chờ touchEnded tính zone
    touchStart = { x: pos.x, y: pos.y };
  }
  // Landscape: canvas touch khi playing = KHÔNG làm gì (D-pad xử lý riêng)
  return false;
}

function touchEnded() {
  if (currentState === STATES.PLAYING && currentOrientation === 'portrait' && touchStart) {
    const dx = mouseX - touchStart.x;
    const dy = mouseY - touchStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) {
      // Tap (không drag) → tap zone
      const dir = getTapZone(mouseX, mouseY);
      setDirection(dir);
    }
    // else: swipe đã xử lý trong touchMoved
  }
  touchStart = null;
  return false;
}
```

### 8.6. JS — D-pad button handler (landscape)

```javascript
document.querySelectorAll('.dpad-btn').forEach(btn => {
  btn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const dir = DIR[btn.dataset.dir];
    setDirection(dir);
  }, { passive: false });
});

// Start/Pause button
document.getElementById('startBtn').addEventListener('touchstart', (e) => {
  e.preventDefault();
  e.stopPropagation();
  handleAction();  // toggle play/pause/start
}, { passive: false });
```

### 8.7. Migration từ V1

| V1 | V2 |
|----|-----|
| `joystick` object + `renderJoystick()` | Xóa (portrait) / giữ optional swipe fallback |
| `applyJoystickDrag()` | Thay bằng `getTapZone()` (portrait) + D-pad handlers (landscape) |
| `touchStarted` luôn active joystick | `touchStarted` phân nhánh theo `currentOrientation` |
| `resizeCanvasToFit()` 1 logic | 2 logic (portrait vs landscape sizing) |

---

## 9. Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| iOS Safari không fire `windowResized()` khi xoay nếu fullscreen | Cao | Dùng cả `windowResized()` + `screen.orientation.addEventListener('change', ...)` + setInterval fallback check 500ms |
| Tap zone 4 tam giác khó hiểu người mới | Trung bình | Hint text ở Menu overlay "Tap vùng trên/dưới/trái/phải để rẽ" (2 giây first play) |
| Landscape layout vỡ trên tablet lớn | Thấp | Table → vẫn landscape nhưng D-pad/nút to hơn, canvas centered. Test 768×1024 |
| D-pad button double-fire (touch + click) | Trung bình | `touchstart` + `e.preventDefault()`, KHÔNG thêm click listener |
| Rắn đổi hướng sai khi tap nhanh liên tục | Thấp | `setDirection()` đã có guard 180° + queue (giữ nguyên V1) |
| Tap zone overlap với topbar HUD | Thấp | Topbar nằm NGOÀI canvas, tap trên topbar không tính |

---

## 10. Success Criteria (định tính, cho Sếp)

- ✅ **Portrait:** Sếp tap nhẹ 1 ngón, rắn rẽ chính xác, không mỏi tay, chơi ≥ 2 phút thoải mái
- ✅ **Landscape:** Sếp xoay ngang, thấy gamepad 2 bên như máy game thật, canvas ở giữa rõ ràng
- ✅ Chuyển orientation mượt, không reset game
- ✅ KHÔNG bao giờ pause bất ngờ khi đang chơi
- ✅ Canvas luôn rõ, không bị nút che
- ✅ "Cảm giác cầm máy game" ở landscape = khác biệt rõ so với portrait

---

## 11. Roadmap / Phase

| Phase | Scope | Status |
|-------|-------|--------|
| **V2.0 (doc này)** | Portrait tap zone + Landscape gamepad, auto-switch | 🟡 Spec done, chờ dev (t_bb7ae6a0) |
| V2.1 (sau) | Haptic feedback (vibration khi ăn food / chết) | Backlog |
| V2.2 (sau) | "Tilt to steer" mode (cong biến trở) — tùy chọn | Backlog |

---

_End of Mobile Controls V2_
