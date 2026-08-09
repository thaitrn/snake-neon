# Mobile UX Redesign — Snake Neon Controls

> **Owner:** PM | **Date:** 2026-08-09 | **Status:** Proposed — chờ Sếp approve
> Task: t_9387fcbe
> Trả lời feedback Sếp: "UX ko friendly voi mobile" (lần 1) + "Tệ quá ko chơ dc" (lần 2)

---

## 1. Phân tích vấn đề — Tại sao controls hiện tại TỆ?

### 1.1. Hai control scheme đang XUNG ĐỘT trên cùng 1 màn hình

Code hiện tại (`index.html`) có **đồng thời** 3 cơ chế input trên mobile:

| # | Cơ chế | Vị trí code | Vấn đề |
|---|--------|------------|--------|
| A | **Swipe** — `touchStarted/touchMoved/touchEnded` | line 954-1004 | Phải vuốt liên tục bằng ngón tay trên canvas. Mỗi lần đổi hướng = 1 cú vuốt 30px. Phải **giữ tay chạm màn hình liên tục** → mỏi tay. |
| B | **Tap = pause** — `handleAction()` trong `touchEnded` | line 998-999, 1041-1044 | Khi tap nhẹ trên canvas → **pause game**. Đây là root cause #1 sự bực mình: muốn đổi hướng mà vuốt không đủ 30px → tính là tap → game PAUSE bất ngờ. |
| C | **D-pad** — `<button>` HTML 3x3 grid | line 104-110, 1057-1134 | CEO tự thêm, grid 60px×60px ×3 = **188px wide + 188px tall**. Chiếm gần 1/3 màn hình điện thoại. |

### 1.2. Root cause: Layout vỡ

```
┌──────────────────────────┐
│  topbar (30px)           │
├──────────────────────────┤
│                          │
│  CANVAS (square)         │  ← resizeCanvasToFit() line 596-598
│                          │     trừ 240px cho dpad, còn lại
│                          │     quá nhỏ trên điện thoại hẹp
│                          │
├──────────────────────────┤
│  D-PAD (188px tall)      │  ← NẰM NGOÀI canvas
└──────────────────────────┘
```

Vấn đề cụ thể trong `resizeCanvasToFit()` (line 583-608):
- Trừ cứng `availH -= 240` cho D-pad → canvas bị thu nhỏ
- Trên điện thoại portrait hẹp (vd 375×667): canvas chỉ còn ~350px, cell = 20px → rắn + food quá nhỏ, khó nhìn
- D-pad đặt **bên dưới canvas** → ngón cái phải di chuyển xa từ khu vực nhìn sang nút bấm → không tập trung vào game

### 1.3. Root cause: Input conflict (nguy hiểm nhất)

```javascript
// touchEnded() line 986-1004
if (Math.max(|dx|, |dy|) < SWIPE_THRESHOLD) {
    handleAction();  // ← TAP = PAUSE!
}
// handleAction() line 1041-1044
} else if (currentState === STATES.PLAYING) {
    transitionTo(STATES.PAUSED);  // ← Tap khi đang chơi = PAUSE
}
```

**Luồng thất bại thực tế của người chơi:**
1. Đang chơi, rắn đi phải →
2. Muốn rẽ lên, vuốt lên nhưng chưa đủ 30px
3. Vuốt bị tính là TAP → game **PAUSE bất ngờ**
4. Hoặc: D-pad nhận touch nhưng `touchStarted` cũng fire trên canvas → xung đột event
5. Kết quả: "Tệ quá ko chơ dc"

### 1.4. Tóm tắt 3 lỗi cốt lõi

| Lỗi | Mức độ | Ghi chú |
|-----|--------|---------|
| **Tap-to-pause trên canvas** cắt ngang chơi game | 🔴 Critical | Mọi touch trên canvas đều có thể pause |
| **Swipe + D-pad chồng nhau** — 2 cơ chế cùng active | 🔴 Critical | D-pad button nằm ngoài canvas nhưng touchStarted vẫn chạy trên canvas |
| **D-pad chiếm diện tích quá lớn**, đẩy canvas nhỏ | 🟡 High | 188×188px trên màn 375px = 50% chiều rộng |

---

## 2. Benchmark — Mobile Snake games phổ biến dùng control gì?

### 2.1. Phân tích 5 game tham chiếu

| Game | Control scheme | Cảm giác chơi | Đánh giá |
|------|---------------|--------------|----------|
| **Slither.io** (mobile) | **Virtual joystick** — chạm bất kỳ đâu, kéo ngón tay về hướng muốn đi. Joystick ảo xuất hiện tại điểm chạm. | Rất thoải mái. Không cần nhìn xuống nút. 1 ngón, chạm bất kỳ vị trí. | ⭐⭐⭐⭐⭐ Gold standard cho mobile |
| **Snake.io** | Virtual joystick (copy slither.io) + swipe tùy chọn | Tương tự slither, thoải mái | ⭐⭐⭐⭐ |
| **Snake 97** (Nokia clone) | **D-pad cố định** ở góc + swipe | D-pad nhỏ, cố định góc dưới. Đơn giản vì snake chậm. | ⭐⭐⭐ |
| **Google Snake** (browser) | Arrow keys / swipe | Không tối ưu mobile, desktop-first | ⭐⭐ |
| **Little Big Snake** | Virtual joystick + nút boost riêng | Joystick + 1 nút phụ | ⭐⭐⭐⭐ |

### 2.2. Pattern nổi bật: FLOATING VIRTUAL JOYSTICK

4/5 game snake mobile phổ biến nhất dùng **virtual joystick xuất hiện tại điểm chạm** (floating/dynamic joystick). Lý do:

1. **Chạm đâu chơi đó** — không cần tìm nút, không cần nhìn xuống
2. **1 ngón** — chỉ cần ngón cái
3. **Không mỏi** — ngón đặt tại chỗ tự nhiên, chỉ kéo nhẹ để đổi hướng
4. **Không che màn hình** — joystick ảo biến mất khi thả tay
5. **Phù hợp grid-based** —Snake chỉ có 4 hướng, joystick map 4 hướng là hoàn hảo

### 2.3. Tại sao D-pad cố định KHÔNG phù hợp Snake Neon?

- Snake là game **phản xạ nhanh** — rắn chạy liên tục, cần đổi hướng tức thì
- D-pad cố định ép người chơi **nhìn xuống** tìm nút → mất tập trung vào rắn
- D-pad 3×3 chiếm diện tích lớn trên màn hình nhỏ
- Nút rời rạc (4 nút riêng) → phải nhắm chính xác, dễ bấm trượt khi cuống

---

## 3. Đề xuất giải pháp

### Option A: Floating Virtual Joystick (RECOMMENDED ⭐)

**Concept:** Chạm ngón cái vào bất kỳ đâu trên canvas → joystick ảo xuất hiện ngay tại điểm chạm. Kéo ngón (hoặc chỉ cần hướng) → rắn đổi hướng theo góc kéo.

```
┌──────────────────────────┐
│  SCORE 040    BEST 150   │
├──────────────────────────┤
│                          │
│       ● (food)           │
│                    ┌─────┤  ← Ngón chạm → joystick ảo
│   ●●●● (snake)     │ ◉ │   │     xuất hiện tại đây
│                    └─────┤
│                          │
└──────────────────────────┘
  (KHÔNG có D-pad cố định)
```

**Cách hoạt động chi tiết:**
1. `touchStarted`: ghi điểm chạm (originX, originY), vẽ vòng tròn base + thumb
2. `touchMoved`: tính dx, dy từ origin → map sang 4 hướng:
   - |dx| > |dy| → LEFT/RIGHT
   - |dy| > |dx| → UP/DOWN
   - Threshold: 12px (nhỏ hơn swipe cũ 30px vì joystick phản hồi tinh hơn)
3. `touchEnded`: ẩn joystick. **KHÔNG** trigger pause.
4. Vẽ joystick overlay trên canvas bằng p5 (không phải HTML element)

**Ưu điểm:**
- ✅ Chạm bất kỳ đâu trên canvas — không cần tìm nút
- ✅ 1 ngón cái, vị trí tự nhiên
- ✅ Không mỏi — chỉ kéo nhẹ, không cần vuốt dài
- ✅ Joystick biến mất khi thả tay → không che game
- ✅ Tap (chạm không kéo) = **không làm gì** (hoặc tùy chọn: tap = pause, nhưng tách rõ vùng)
- ✅ Đã được chứng minh bởi slither.io, snake.io — hàng triệu người chơi

**Nhược điểm:**
- ⚠️ Cần vẽ joystick overlay trên canvas (code thêm ~30 dòng render)
- ⚠️ Lần đầu chơi cần 2-3 giây để hiểu cơ chế (nhưng trực giác cao)

**Effort:** ~2-3 giờ dev

---

### Option B: D-pad nổi góc dưới (Cố định nhưng tối ưu)

**Concept:** Giữ D-pad nhưng thu nhỏ, cố định **overlay trên canvas** ở góc dưới phải (cho ngón cái phải) — không đẩy canvas nhỏ.

```
┌──────────────────────────┐
│  SCORE 040    BEST 150   │
├──────────────────────────┤
│                          │
│       ● (food)           │
│                          │
│   ●●●● (snake)           │
│                          │
│              ▲           │
│           ◀ ◎ ▶          │  ← D-pad overlay semi-transparent
│              ▼           │     trên canvas, góc dưới phải
└──────────────────────────┘
```

**Ưu điểm:**
- ✅ Quen thuộc — ai cũng biết D-pad
- ✅ Vị trí cố định → muscle memory nhanh
- ✅ Overlay trên canvas → không vỡ layout

**Nhược điểm:**
- ⚠️ Che 1 phần game ở góc (dù semi-transparent)
- ⚠️ Phải nhắm nút chính xác → dễ bấm trượt khi cuống
- ⚠️ Vẫn cần ngón cái rời khỏi vị trí tự nhiên
- ⚠️ Ít trực giác hơn joystick

**Effort:** ~1.5-2 giờ dev

---

### So sánh Trade-off

| Tiêu chí | Option A: Floating Joystick | Option B: D-pad Overlay |
|----------|---------------------------|------------------------|
| Thoải mái (không mỏi) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| Trực giác (học nhanh) | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Không che màn hình | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| Phản xạ nhanh (đổi hướng tức thì) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| Độ quen thuộc | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Effort dev | ~2-3 giờ | ~1.5-2 giờ |
| Chứng minh thị trường | Slither.io, Snake.io ⭐ | Snake 97 |

### RECOMMENDATION: Option A — Floating Virtual Joystick

**Lý do:**
1. **Sếp feedback rõ ràng:** "giữ tay chạm màn hình liên tục" = mỏi → joystick giải quyết triệt để (chạm 1 chỗ, kéo nhẹ)
2. **Chỉ 1 ngón, chạm bất kỳ đâu** = đúng nguyên tắc Mobile-first của PRD
3. **Slither.io + Snake.io** = top 2 snake game mobile phổ biến nhất, cả hai đều dùng joystick → đã validate với hàng triệu user
4. **Không che màn hình** = giữ aesthetic neon đẹp, screenshot-worthy (Design Pillar #3)
5. **Grid-based 4 hướng** map hoàn hảo với joystick 4 hướng

---

## 4. Spec chi tiết — Option A: Floating Virtual Joystick

### 4.1. Layout Mobile

```
┌─────────────────────────────┐
│  SCORE 040     BEST 150  ⏸  │  ← HUD: score + best + pause btn (top-right)
│                             │     Pause button nhỏ, tách khỏi canvas
├─────────────────────────────┤
│                             │
│                             │
│        CANVAS (square)      │  ← Toàn bộ diện tích = canvas
│        17×17 grid           │     Joystick xuất hiện tại điểm chạm
│                             │     (overlay, semi-transparent)
│        ●  food              │
│        ▓▓▓ snake            │
│                             │
│  ◉ ← joystick hiện tại       │  ← Chỉ hiện khi đang chạm
│                             │
├─────────────────────────────┤
│  Mute 🔇   (nút nhỏ góc)    │  ← Optional: 1 nút mute nhỏ
└─────────────────────────────┘
```

**Thay đổi so với hiện tại:**
- ❌ Bỏ D-pad HTML 3×3 grid (188×188px) → canvas lấy lại toàn bộ không gian
- ❌ Bỏ tap-to-pause trên canvas → tap không làm gì (chỉ joystick điều khiển)
- ✅ Pause button tách ra HTML button nhỏ ở góc trên phải HUD
- ✅ Canvas full available height (không trừ 240px)

### 4.2. Interaction Design

#### Joystick mechanics

| Trạng thái | Hành động | Kết quả |
|-----------|----------|---------|
| **Idle** (không chạm) | — | Joystick ẩn, rắn đi theo hướng hiện tại |
| **Touch start** | Ngón chạm canvas | Joystick ảo xuất hiện tại điểm chạm: vòng base (r) + thumb (nhỏ hơn) |
| **Touch move** | Kéo ngón | Thumb di chuyển theo ngón, giới hạn trong base radius. Tính direction từ vector kéo. |
| **Direction threshold** | Kéo ≥ 12px từ center | Trigger `setDirection()` theo 4 hướng (up/down/left/right dựa trên góc lớn nhất) |
| **Touch end** | Nhấc ngón | Joystick biến mất. Rắn giữ hướng cuối cùng. |

#### Direction mapping (4 hướng, grid-based)

```
        UP (dy < -threshold)
              |
LEFT ←────── ◎ ──────→ RIGHT
(dx < -t)   |    (dx > +t)
              |
           DOWN (dy > +threshold)
```

- Tính dx, dy từ origin
- Nếu |dx| > |dy| → LEFT/RIGHT (dựa vào dấu dx)
- Nếu |dy| > |dx| → UP/DOWN (dựa vào dấu dy)
- Threshold = **12px** (nhỏ hơn swipe cũ 30px — joystick phản hồi tinh hơn vì origin cố định)

#### Joystick visual design

```
     ┌─────────┐
     │  ╭───╮  │   ← Base: vòng tròn, stroke neon green
     │  │ ◉ │  │       radius ~35px, semi-transparent fill
     │  ╰───╯  │       strokeWeight 2px
     └─────────┘
         ↑
      Thumb: vòng tròn đặc, neon green
      radius ~18px, có glow
      Di chuyển theo ngón, clamp trong base
```

- **Base ring:** `stroke #00ff88`, alpha 30%, radius 35px
- **Thumb:** `fill #00ff88`, glow shadowBlur 10, radius 18px
- **Chỉ vẽ khi đang chạm** — `touchStarted` → hiện, `touchEnded` → ẩn

#### Pause mechanism (tách khỏi canvas)

- **Pause button:** HTML `<button>` nhỏ ở góc trên phải HUD (ngoài canvas)
- **Tap trên canvas:** KHÔNG pause (chỉ điều khiển joystick)
- **Auto-pause:** giữ nguyên `visibilitychange` (tab switch → pause) — line 873-877
- **Desktop:** giữ nguyên phím P/Space/Escape

#### Tap behavior clarification

| Vùng tap | Hành động |
|---------|----------|
| **Trên canvas** (joystick area) | Tap nhẹ (< 12px kéo) = **KHÔNG làm gì**. Chỉ kéo mới đổi hướng. |
| **Pause button** (HUD góc phải) | Toggle pause/resume |
| **Menu/Game Over overlay** | Tap = play/retry (giữ nguyên) |

> **Lý do tap trên canvas không làm gì:** Tránh trigger pause vô tình. Joystick cần `touchStarted` để bắt đầu — tap ngắn tự nhiên không đủ trigger direction, và ta KHÔNG muốn nó pause.

### 4.3. Responsive Breakpoints

| Breakpoint | Chiều rộng | Canvas size | Behavior |
|-----------|-----------|-------------|----------|
| **Mobile portrait** | ≤ 600px | `min(vw - 24, vh - hudHeight - 24)` | Joystick full active. HUD compact. |
| **Tablet** | 601–1024px | `min(vw - 40, 600)` | Joystick active. HUD full. |
| **Desktop** | > 1024px | `min(vh - 80, 600)` | Joystick ẩn (dùng keyboard). HUD full. Pause/mute bằng click. |

**Joystick sizing (responsive):**
- Base radius: `cellSize × 1.5` (vd cell 30px → base 45px)
- Thumb radius: `cellSize × 0.8`
- Threshold: `cellSize × 0.4` (tự scale theo grid)

**Canvas resize logic (thay đổi từ hiện tại):**
```javascript
function resizeCanvasToFit() {
  const margin = 12;
  const maxCanvas = 600;
  const vw = windowWidth;
  const vh = windowHeight;
  // KHÔNG trừ 240px cho D-pad nữa
  // Chỉ trừ HUD height (~40px) + gaps
  const hudHeight = 44; // topbar
  let availW = vw - margin * 2;
  let availH = vh - hudHeight - margin * 2;
  let size = Math.min(availW, availH, maxCanvas);
  cellSize = Math.floor(size / COLS);
  canvasW = cellSize * COLS;
  canvasH = cellSize * ROWS;
  resizeCanvas(canvasW, canvasH);
}
```

### 4.4. Desktop behavior (không đổi)

- Joystick chỉ active trên touch devices: `@media (hover: none) and (pointer: coarse)`
- Desktop tiếp tục dùng arrow keys / WASD
- Pause button HTML hiển thị trên mọi device (click được)

---

## 5. Acceptance Criteria

### AC-1: Joystick điều khiển rắn chính xác
- [ ] Chạm ngón vào canvas → joystick ảo hiện tại điểm chạm (vòng base + thumb)
- [ ] Kéo ngón lên → rắn đi UP (nếu đang không đi DOWN)
- [ ] Kéo ngón xuống → rắn đi DOWN (nếu đang không đi UP)
- [ ] Kéo ngón trái → rắn đi LEFT (nếu đang không đi RIGHT)
- [ ] Kéo ngón phải → rắn đi RIGHT (nếu đang không đi LEFT)
- [ ] Quy tắc 180° vẫn áp dụng: không thể quay ngược hướng hiện tại

### AC-2: Joystick không che game
- [ ] Joystick chỉ hiện khi đang chạm (touch active)
- [ ] Nhấc ngón → joystick biến mất hoàn toàn
- [ ] Joystick semi-transparent (alpha ≤ 40% base) → vẫn nhìn thấy game bên dưới

### AC-3: Tap trên canvas KHÔNG pause
- [ ] Tap nhẹ (< 12px kéo) trên canvas → **không có phản ứng** (không pause, không đổi hướng)
- [ ] Game chỉ pause qua: nút Pause button, phím P/Space, hoặc tab switch
- [ ] KHÔNG còn logic `handleAction()` trong `touchEnded` khi đang PLAYING

### AC-4: Layout không vỡ trên mobile
- [ ] Canvas chiếm maximum available space (không bị D-pad đẩy nhỏ)
- [ ] Trên iPhone SE (375×667): canvas ≥ 330px (cell ≥ 19px)
- [ ] Trên iPhone 14 (390×844): canvas ≥ 360px
- [ ] Trên Android phổ thông (360×800): canvas ≥ 336px
- [ ] HUD (score + pause) nằm ngoài canvas, không overlap

### AC-5: Pause button tách biệt
- [ ] Pause button là HTML element ở góc trên phải, ngoài canvas
- [ ] Tap pause button → toggle PLAYING ↔ PAUSED
- [ ] Khi PAUSED → overlay "PAUSED" + "tap resume button để chơi tiếp"
- [ ] Resume chỉ qua pause button hoặc phím Space (không qua tap canvas)

### AC-6: D-pad cũ được gỡ bỏ
- [ ] Xóa `#dpad` HTML element (line 104-110)
- [ ] Xóa `#dpad` CSS (line 34-96)
- [ ] Xóa `initDPad()` IIFE (line 1057-1134)
- [ ] Xóa logic `dpadVisible` / `availH -= 240` trong `resizeCanvasToFit()`

### AC-7: Desktop không bị ảnh hưởng
- [ ] Trên desktop (hover: hover, pointer: fine): joystick không hiện
- [ ] Arrow keys / WASD vẫn hoạt động bình thường
- [ ] Pause button hiển thị và click được

### AC-8: Joystick responsive
- [ ] Joystick size tự scale theo cellSize (base = 1.5× cellSize)
- [ ] Threshold direction tự scale (0.4× cellSize)
- [ ] Hoạt động trên cả portrait và landscape mobile

---

## 6. Implementation Notes cho Frontend/Dev

### 6.1. Files cần thay đổi
- `index.html` — duy nhất (single-file app)

### 6.2. Code changes tổng quan

| Khu vực | Thay đổi |
|---------|---------|
| **HTML** | Xóa `#dpad` div + nút. Giữ `#topbar` với score + pause button |
| **CSS** | Xóa `.dpad-*` styles. Pause button style nhỏ gọn ở topbar |
| **JS — touch handlers** | Rewrite `touchStarted/touchMoved/touchEnded` thành joystick logic. Bỏ `handleAction()` call trong touchEnded khi PLAYING |
| **JS — render** | Thêm `renderJoystick()` — vẽ base + thumb khi `joystickActive = true` |
| **JS — canvas resize** | Bỏ `dpadVisible` check, bỏ `availH -= 240` |

### 6.3. State mới cần thêm

```javascript
let joystick = {
  active: false,
  originX: 0, originY: 0,    // điểm chạm ban đầu
  thumbX: 0, thumbY: 0,       // vị trí thumb hiện tại
  baseRadius: 0,              // tự tính theo cellSize
};
```

### 6.4. Touch flow mới (pseudo-code)

```
touchStarted:
  if (currentState !== PLAYING) → handleAction() (menu/gameover)
  else:
    joystick.active = true
    joystick.origin = touch position
    joystick.thumb = touch position

touchMoved:
  if joystick.active:
    dx = touch.x - joystick.originX
    dy = touch.y - joystick.originY
    clamp thumb trong baseRadius
    if max(|dx|,|dy|) >= threshold:
      map to 4 directions → setDirection()
    // KHÔNG reset origin (khác swipe cũ)

touchEnded:
  joystick.active = false
  // KHÔNG gọi handleAction() — tap = nothing when playing
```

---

## 7. Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Joystick overlay giảm FPS khi vẽ glow | Trung bình | Giới hạn shadowBlur joystick ≤ 10, hoặc vẽ không glow khi perform |
| Người chơi mới không hiểu joystick | Thấp | Trên Menu overlay: hint "Chạm và kéo để điều khiển" (2 giây first play) |
| Touch conflict giữa canvas joystick và pause button | Thấp | Pause button nằm ngoài canvas, event riêng, `stopPropagation` |
| iOS Safari touch handling khác Android | Trung bình | Test trên cả 2, dùng `touches[]` array từ p5 (đã cross-platform) |

---

## 8. Success Criteria (định tính, cho Sếp)

- ✅ Sếp chơi liên tục ≥ 2 phút trên điện thoại mà không mỏi tay
- ✅ Không bị pause bất ngờ giữa lúc đang chơi
- ✅ Rắn đổi hướng tức thì, chính xác 4 hướng
- ✅ Màn hình game chiếm full, đẹp, không bị nút che
- ✅ "One more try" — muốn chơi lại ngay sau khi chết

---

_End of Mobile UX Redesign_
