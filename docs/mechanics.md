# Snake Neon — Game Mechanics & Difficulty Design

> **Tài liệu:** Phân tích nghiệp vụ gameplay (Business Analysis)
> **Phiên bản:** 1.0
> **Tác giả:** BA (Business Analyst)
> **Ngày:** 2026-08-08
> **Nguyên tắc thiết kế:** Easy to learn (1 ngón chơi được), hard to master. Mobile-first.

---

## Mục lục

1. [Core Mechanics](#1-core-mechanics)
2. [Scoring System](#2-scoring-system)
3. [Difficulty Curve](#3-difficulty-curve)
4. [Game States](#4-game-states)
5. [Control Schemes](#5-control-schemes)
6. [Power-Ups (P1)](#6-power-ups-p1)
7. [Business Rules Tổng hợp](#7-business-rules-tổng-hợp)
8. [Edge Cases & Constraint Matrix](#8-edge-cases--constraint-matrix)

---

## 1. Core Mechanics

### 1.1 Grid & Board

| Thông số | Giá trị P0 (MVP) | Ghi chú |
|---|---|---|
| Grid type | Ô vuông (square cell) | Đảm bảo di chuyển 4 hướng cân đối |
| Cols × Rows | 17 × 17 | Đậm chất arcade; lẻ để có ô trung tâm |
| Cell size | Tự co giãn fit viewport | p5.js tính pixel theo canvas |
| Coordinate | (0,0) = góc trên trái | X tăng→phải, Y tăng→xuống |

**Business rule:** Lưới phải luôn **vuong** (cells = ô vuông). Canvas resize không được làm méo cell.

---

### 1.2 Snake Movement

#### 1.2.1 Đặc tả

| Thuộc tính | Giá trị |
|---|---|
| Kiểu di chuyển | Grid-based, step (rời rạc theo ô) |
| Hướng | 4 hướng: UP, DOWN, LEFT, RIGHT |
| Không thể quay 180° | Không cho phép đi ngược hướng hiện tại |
| Tick rate | Mỗi N ms, snake tiến 1 ô. N giảm dần = tăng tốc. |
| Smooth rendering | Snake **nhảy** 1 ô/tick (classic). P1: interpolate cho mượt. |

#### 1.2.2 Input direction buffer

**Vấn đề nghiệp vụ:** Player bấm nhanh 2 phím trong 1 tick → snake có thể tự sát do second input là 180°.

**Giải pháp — Direction Queue (depth 1):**

```
Khi nhận input direction D:
  - Nếu D != hướng_ngược_hướng_hiện_tại AND D != hướng_hiện_tại:
      → Lưu D vào nextDirection (buffer)
  - Bỏ qua nếu D == hướng ngược hoặc trùng

Cuối mỗi tick (trước khi move):
  - direction = nextDirection (nếu có)
  - clear nextDirection
```

**Business rule:** Buffer chỉ lưu **1** direction duy nhất. Input mới hơn ghi đè input cũ hơn nếu chưa được xử lý. Điều này ngăn self-kill do spam phím.

#### 1.2.3 Snake body representation

```
snake = {
  body: [{x, y}, {x, y}, ...],  // [0] = head, last = tail
  direction: {x: 1, y: 0},       // đang đi phải
  nextDirection: null             // buffer
}
```

**Move algorithm (mỗi tick):**
1. newHead = head + direction
2. body.unshift(newHead)
3. Nếu ăn food → KHÔNG pop tail (snake dài thêm 1)
4. Nếu chưa ăn → body.pop() (giữ nguyên độ dài)

---

### 1.3 Food Spawning

#### 1.3.1 Quy tắc spawn

**Business rule:** Food **phải** spawn trên ô trống — không trùng snake body, không trùng tail-cell tiếp theo (tránh spawn ngay trước mặt snake).

**Algorithm:**
1. Tập hợp tất cả cell trống = gridCells − snake.body
2. Nếu emptyCells rỗng → **WIN** (board đầy, snake chiếm hết — cực hiếm nhưng phải xử lý)
3. Random chọn 1 cell từ emptyCells
4. Đặt food tại cell đó

#### 1.3.2 Food types (P1)

| Loại | Màu | Hiệu ứng | Xác suất spawn | Thời gian tồn tại |
|---|---|---|---|---|
| Normal | Neon xanh (#00ff88) | +điểm, +dài | 85% | Vĩnh viễn |
| Golden | Vàng (#ffee00) | +3x điểm, +dài | 10% | 5 giây rồi biến mất |
| Power-up | Hồng (#ff006e) | Random power-up | 5% | 7 giây rồi biến mất |

**P0:** Chỉ food Normal.

#### 1.3.3 Đảm bảo playability

**Business rule:** Sau khi spawn, food không nằm trong 3 ô phía trước head theo hướng hiện tại (tránh "quả food tự lao vào miệng" quá dễ). Nếu không thể, chấp nhận vị trí bất kỳ trống.

---

### 1.4 Growth

| Sự kiện | Hành vi |
|---|---|
| Ăn Normal food | Snake dài +1 (không pop tail tick đó). Điểm +base. |
| Ăn Golden food (P1) | Snake dài +1. Điểm +3×base. |
| Spawn food mới | Ngay lập tức sau khi ăn (cùng frame nếu muốn, hoặc next tick) |

**Business rule:** Growth xảy ra **trong đúng tick ăn food** — head mới được thêm vào, tail không bị xóa. Tick kế tiếp snake đã dài hơn.

---

### 1.5 Collision

#### 1.5.1 Collision types

| Loại | Điều kiện | Kết quả (Classic mode) | Kết quả (Wrap mode — P1) |
|---|---|---|---|
| Wall | head.x < 0, head.x ≥ cols, head.y < 0, head.y ≥ rows | 💀 Death | Wrap sang phía đối diện |
| Self | head trùng body[i] với i > 0 | 💀 Death | 💀 Death |

#### 1.5.2 Collision detection algorithm

```
Sau khi tính newHead:
  1. Wall check:
     if (newHead.x < 0 || newHead.x >= COLS ||
         newHead.y < 0 || newHead.y >= ROWS):
       → game over (classic) / wrap (P1)

  2. Self check:
     // Chỉ check body[0..n-2], bỏ tail vì tail sẽ bị pop (trừ khi vừa ăn)
     willEat = (newHead == food)
     checkRange = willEat ? body : body[0..length-2]
     if newHead in checkRange:
       → game over
```

**Business rule quan trọng:** Khi kiểm tra self-collision, **phải loại tail khỏi tập kiểm tra** (vì tail sẽ di chuyển/ biến mất sau khi head tới vị trí mới) — TRỪ khi snake vừa ăn food (lúc đó tail không bị xóa).

#### 1.5.3 Edge case: Reverse buffer abuse

Player bấm 2 lần nhanh để snake quay 180° (UP→DOWN) trước khi tick xử lý → suicide bất ngờ.

**Giải pháp:** Buffer chỉ nhận **1** direction, và direction đó bị validate chống 180° so với **hướng hiện tại**. Không thể chain 2 input thành 180°.

---

### 1.6 Speed System

| Thông số | Giá trị P0 |
|---|---|
| Tick khởi tạo | 150ms/step |
| Tick tối thiểu (speed cap) | 60ms/step |
| Giảm tick mỗi food | −3ms |
| FPS render | 60fps (cố định, độc lập với tick) |

**Decoupling rule:** Render loop chạy 60fps, game-logic tick chạy theo interval riêng. Snake **render ở vị trí cũ** giữa các tick (classic jitter), hoặc **interpolate** (P1) cho mượt.

---

## 2. Scoring System

### 2.1 Công thức điểm

```
scoreGain = basePoints × comboMultiplier + distanceBonus

Trong đó:
  basePoints       = 10  (mỗi food normal)
  comboMultiplier  = 1 + (comboCount × 0.5), cap tại 3.0
  distanceBonus    = floor(snakeLength / 5) × 2
```

| Food count liên tiếp (combo) | comboMultiplier |
|---|---|
| 0 (vừa ăn xong, chưa có combo) | 1.0× |
| 1–2 food liên tiếp | 1.5× |
| 3–4 | 2.0× |
| 5–6 | 2.5× |
| 7+ | 3.0× (cap) |

**Business rule:** Combo là số food ăn trong khoảng thời gian **≤ 3 giây** giữa 2 food liên tiếp. Quá 3 giây → combo reset về 0.

### 2.2 Combo decay

```
lastEatTime = timestamp khi ăn food
// Mỗi tick kiểm tra:
if (now - lastEatTime > 3000ms):
  comboCount = 0
```

**UX rule:** Hiển thị combo counter + timer bar trên HUD khi comboCount ≥ 2. Mắt player thấy được "sắp mất combo".

### 2.3 Golden food bonus (P1)

```
if (foodType == GOLDEN):
  scoreGain × 3   // nhân thêm 3 lần toàn bộ
```

### 2.4 High Score Tracking

| Thông số | Giá trị |
|---|---|
| Lưu trữ | localStorage key `snake_neon_highscore` |
| Cập nhật | Khi game over, nếu score > highScore → ghi đè |
| Hiển thị | Menu screen + Game Over screen + HUD (nhỏ, góc trên) |
| Format | Số nguyên, không âm |

**Business rule:** High score là **giá trị cao nhất từng đạt**. Không lưu danh sách top 10 ở P0 (YAGNI). P1: top 5 với initials (arcade vibe).

### 2.5 Score display

| Vị trí | Nội dung |
|---|---|
| HUD góc trên-trái | `SCORE: 1230` (neon cyan) |
| HUD góc trên-phải | `HI: 4567` (neon yellow, nhỏ hơn) |
| Center (khi combo ≥ 2) | `COMBO ×2.5` (neon pink, pulse animation) |


## 3. Difficulty Curve

### 3.1 Speed Progression Formula

```
tickInterval = max(MIN_TICK, INITIAL_TICK − foodsEaten × STEP_REDUCTION)

Với:
  INITIAL_TICK    = 150  (ms)
  MIN_TICK        = 60   (ms)  — speed cap, không nhanh hơn được nữa
  STEP_REDUCTION  = 3    (ms/food)
```

**Tính toán minh họa:**

| Food đã ăn | tickInterval | Tốc độ (steps/sec) | Cảm nhận |
|---|---|---|---|
| 0 | 150ms | 6.7/s | Chậm, dễ |
| 5 | 135ms | 7.4/s | Bình thường |
| 10 | 120ms | 8.3/s | Nhanh |
| 20 | 90ms | 11.1/s | Rất nhanh |
| 30+ | 60ms | 16.7/s | Cap — cực nhanh |

**Business rule:** Cap 60ms đảm bảo game vẫn **choi duoc** (không quá nhanh để mắt theo kịp). Tăng độ khó = tăng tốc + diện tích board giảm (snake dài chiếm nhiều ô).

### 3.2 Level / Wave System (P1 — Optional)

> P0: Không có level. Chỉ speed tăng. P1 thêm level milestones.

| Level | Foods để đạt | tickInterval | Mô tả |
|---|---|---|---|
| 1 | 0–4 | 150→138ms | Khởi động |
| 2 | 5–9 | 135→123ms | Nóng dần |
| 3 | 10–14 | 120→108ms | Thử thách |
| 4 | 15–24 | 105→90ms | Nhanh |
| 5 | 25–39 | 87→69ms | Rất nhanh |
| 6+ | 40+ | 60ms (cap) | Đỉnh cao |

**Mỗi lên level:**
- Flash màn hình (neon pulse) + chiptune sting
- Có thể thay đổi màu nền nhẹ (sáng dần)

**Business rule (P1):** Level chỉ là **cách hiển thị**, không thay đổi gameplay ngoài speed. Giữ KISS.

### 3.3 Difficulty Balance Principles

1. **Early game (0–5 food):** Tha lỗi. Tốc độ chậm, board rộng, player làm quen.
2. **Mid game (5–20):** Combo khuyến khích risk. Tốc độ tăng đều.
3. **Late game (20+):** Board chật (snake dài). Tốc độ cao. Chỉ pro sống sót.
4. **No rubber-banding:** Không giảm khó nếu player giỏi. Không tăng khó nếu player kém. Khó = hàm tuyến tính của food đã ăn.

**Business rule:** Difficulty **deterministic** — cùng số food thì cùng tốc độ. Không random difficulty spike.


## 4. Game States

### 4.1 State Machine

```
                    ┌──────────┐
                    │   MENU   │ ←─────────────┐
                    └────┬─────┘               │
                  Start │                     │ Restart
                    ↓   │                     │
              ┌─────────┴──┐    Pause    ┌────┴──────┐
              │  PLAYING   │────────────→│  PAUSED   │
              └─────┬──────┘←───────────└───────────┘
                    │ Death          Resume (P/Esc/tap)
                    ↓
              ┌──────────────┐
              │  GAME_OVER   │─── Tap/Space ──→ MENU
              └──────────────┘
```

### 4.2 State Definitions

#### MENU
- **Hiển thị:** Title "SNAKE NEON" (neon glow), high score, nút "TAP TO START" / "PRESS SPACE"
- **Background:** Snake AI tự chơi ở nền (décor) hoặc grid tĩnh với glow pulse
- **Input:** Tap anywhere / Space / Enter → PLAYING
- ** Âm thanh:** Background chiptune melody (loop)

#### PLAYING
- **Hiển thị:** Snake, food, HUD (score, high score, combo), grid faint
- **Input:** Di chuyển (swipe/arrow/D-pad), Pause (P/Esc/back-swipe)
- **Âm thanh:** Eat SFX, combo SFX
- **Game logic:** Tick loop chạy

#### PAUSED
- **Hiển thị:** Overlay mờ, text "PAUSED", score hiện tại, "TAP TO RESUME"
- **Input:** Tap / P / Esc → PLAYING
- **Game logic:** Tick loop **đóng băng** (không move, không decay combo)
- **Business rule:** Combo decay timer **cũng đóng băng** khi pause.

#### GAME_OVER
- **Hiển thị:** "GAME OVER", final score, high score (highlight nếu break record), "TAP TO RESTART"
- **Input:** Tap / Space → MENU (hoặc thẳng PLAYING với quick-restart P1)
- **Âm thanh:** Death SFX
- **Business rule:** Nếu score > highScore → hiển thị "NEW HIGH SCORE!" với animation. Cập nhật localStorage tại frame này.

### 4.3 Transition Rules

| Từ → Đến | Trigger | Điều kiện |
|---|---|---|
| MENU → PLAYING | Start input | Luôn cho phép |
| PLAYING → PAUSED | Pause input | Luôn cho phép |
| PAUSED → PLAYING | Resume input | Luôn cho phép |
| PLAYING → GAME_OVER | Collision (wall/self) | Collision = death |
| GAME_OVER → MENU | Restart input | Reset tất cả state |
| PLAYING → PLAYING (reset) | Restart from game over | Reset snake, score, food, tick |

**Business rule:** Không thể pause khi GAME_OVER. Không thể start khi đang PLAYING. State machine **nghiem ngặt** — mỗi transition có đúng 1 trigger.

### 4.4 Reset Logic (new game)

Khi chuyển MENU/GAME_OVER → PLAYING:
```
snake.body       = [{midX, midY}, {midX−1, midY}, {midX−2, midY}]
snake.direction  = RIGHT
score            = 0
comboCount       = 0
foodsEaten       = 0
tickInterval     = INITIAL_TICK (150ms)
spawnFood()
state            = PLAYING
```


## 5. Control Schemes

### 5.1 Input Priority & Multi-platform

**Business rule:** Tất cả 3 control scheme **cùng hoạt động** (enabled đồng thời). Player dùng cái nào cũng được, không cần toggle. Input đầu tiên được nhận trong 1 tick sẽ được xử lý.

### 5.2 Swipe Control (Mobile — Primary)

| Thao tác | Hướng |
|---|---|
| Vuốt lên (↑) | UP |
| Vuốt xuống (↓) | DOWN |
| Vuốt trái (←) | LEFT |
| Vuốt phải (→) | RIGHT |

**Detection algorithm:**
```
touchStart: ghi {x0, y0, t0}
touchMove:  cập nhật {x, y}
touchEnd:
  dx = x − x0
  dy = y − y0
  if max(|dx|, |dy|) < SWIPE_THRESHOLD (30px):
    → tap (không phải swipe) → xử lý theo context (start/pause/resume)
  else if |dx| > |dy|:
    direction = dx > 0 ? RIGHT : LEFT
  else:
    direction = dy > 0 ? DOWN : UP
  → setDirection(direction)  // đi qua direction buffer
```

**UX rule:**
- SWIPE_THRESHOLD = 30px (đủ lớn để không nhầm với tap, đủ nhỏ để responsive)
- Swipe **không cần hoàn thành** gesture — touchMove đủ xa là trigger (responsive feel)
- Cho phép swipe liên tục không cần lift finger

### 5.3 Arrow Keys (Desktop)

| Phím | Hành động |
|---|---|
| ↑ / W | UP |
| ↓ / S | DOWN |
| ← / A | LEFT |
| → / D | RIGHT |
| Space / Enter | Start / Restart |
| P / Esc | Pause / Resume |

**Business rule:** WASD và Arrow keys **cùng map** đến cùng direction handler. Chỉ cần 1 bộ logic.

### 5.4 On-screen D-pad (Mobile — Optional)

> P0: Bỏ qua. P1: Thêm D-pad ảo nếu swipe gây nhầm lẫn cho user mới.

**Layout:** 4 nút chạm ở góc dưới-trái hoặc dưới-phải. Mỗi nút ~48×48px touch target.

**Business rule:** D-pad chỉ **visible trên mobile** (touch device detection). Desktop không hiển thị.

### 5.5 Direction Input Validation (chung cho mọi scheme)

```
function setDirection(dir):
  // Chống 180°
  if (dir.x == -currentDirection.x && dir.y == -currentDirection.y):
    return  // bỏ qua
  if (dir.x == currentDirection.x && dir.y == currentDirection.y):
    return  // trùng hướng, bỏ qua
  nextDirection = dir  // ghi vào buffer
```

**Business rule áp dụng cho mọi platform:** Không bao giờ cho phép snake đi ngược 180°. Buffer depth = 1.


## 6. Power-Ups (P1)

> P1 scope. P0 không có power-ups. Thiết kế sẵn để Architect có context.

### 6.1 Power-up Types

| Power-up | Icon/Màu | Hiệu ứng | Thời lượng | Spawn rate |
|---|---|---|---|---|
| **Speed Boost** | ⚡ Cyan (#00d9ff) | Tăng tick rate +30% (nhanh hơn) trong 5s. Điểm ×2 trong thời gian active. | 5 giây | 3% / food eaten |
| **Ghost Mode** | 👻 Trắng (#ffffff) | Snake đi xuyên wall (wrap) + xuyên thân mình trong 4s. Không chết khi va chạm. | 4 giây | 2% / food eaten |
| **Score Multiplier** | ★ Vàng (#ffee00) | Mọi điểm ×3 trong 8 giây. Stack với combo. | 8 giây | 4% / food eaten |

### 6.2 Activation

- Power-up spawn như food (trên cell trống, có timer hết hạn 7s)
- Player ăn power-up = chạm head vào cell power-up
- Hiệu ứng active ngay lập tức, timer đếm ngược
- **Stack rule:** Cùng loại không stack (refresh timer). Khác loại stack được.

### 6.3 Visual feedback

| Trạng thái | Hiển thị |
|---|---|
| Power-up trên board | Pulsing glow, icon rõ |
| Active trên snake | Snake body đổi màu theo power-up + aura glow |
| Timer | Icon power-up + progress bar góc HUD |

**Business rule:** Player **phải nhìn thấy ngay** power-up đang active và sắp hết. Không "silent effect".


## 7. Business Rules Tổng hợp

Tổng hợp tất cả business rules quan trọng (priority cho dev):

| # | Rule | Source section |
|---|---|---|
| BR-01 | Grid luôn ô vuông, resize không được méo cell | §1.1 |
| BR-02 | Snake không thể quay 180° (chống self-kill) | §1.2 |
| BR-03 | Direction buffer depth = 1, input mới ghi đè input cũ chưa xử lý | §1.2 |
| BR-04 | Food phải spawn trên cell trống (không trùng snake body) | §1.3 |
| BR-05 | Nếu board đầy (snake chiếm hết) → WIN condition | §1.3 |
| BR-06 | Growth xảy ra trong tick ăn food (không pop tail tick đó) | §1.4 |
| BR-07 | Wall collision = death (classic), wrap (P1 mode) | §1.5 |
| BR-08 | Self collision = death, nhưng phải loại tail khi check (trừ khi vừa ăn) | §1.5 |
| BR-09 | Combo reset nếu >3s giữa 2 food liên tiếp | §2.2 |
| BR-10 | High score lưu trong localStorage, cập nhật khi game over | §2.4 |
| BR-11 | Difficulty = hàm tuyến tính của food đã ăn, deterministic | §3.3 |
| BR-11a | Speed cap: không nhanh hơn 60ms/tick | §3.1 |
| BR-12 | Combo decay timer đóng băng khi pause | §4.2 |
| BR-13 | State machine nghiêm ngặt, mỗi transition đúng 1 trigger | §4.3 |
| BR-14 | Reset game = reset toàn bộ snake, score, combo, tick | §4.4 |
| BR-15 | Cả 3 control scheme cùng active, không cần toggle | §5.1 |
| BR-16 | Swipe threshold = 30px, dưới = tap | §5.2 |
| BR-17 | Power-up cùng loại không stack (refresh), khác loại stack được | §6.2 |

---

## 8. Edge Cases & Constraint Matrix

### 8.1 Edge Cases

| Case | Xử lý |
|---|---|
| Snake đầy board (chiếm 100% cells) | WIN — hiển thị "PERFECT!" screen,_record score |
| Food spawn nhưng không còn cell trống | Fallback: WIN condition (snake quá dài) |
| Player bấm nhiều phím cùng lúc | Input đầu tiên (theo timestamp) được nhận |
| Touch + keyboard cùng lúc | Cả hai valid, direction cuối cùng ghi vào buffer thắng |
| Tab inactive (blur) | Auto-pause, resume khi focus lại |
| localStorage không available (private mode) | High score = 0, không crash, show warning nhẹ |
| Food spawn ngay trước head | Tránh 3 ô phía trước head (BR từ §1.3.3) |
| Resize window giữa game | Grid co giãn, snake/food tỉ lệ theo, không reset |
| Player pause ngay lúc ăn food | Tick đó vẫn hoàn tất, pause áp dụng từ tick sau |

### 8.2 Constraints (non-functional)

| Constraint | Giá trị | Ghi chú |
|---|---|---|
| Target FPS | 60 | p5.js frameRate(60) |
| Tick range | 60–150ms | Speed range |
| Board size | 17×17 (P0) | Có thể config |
| Snake start length | 3 | Classic feel |
| Max combo multiplier | 3.0× | Cap |
| Swipe threshold | 30px | Mobile UX |
| localStorage key | `snake_neon_highscore` | Versioned namespace |
| Max snake length | rows × cols − 1 | Đạt = WIN |
| Power-up max active | 3 (mỗi loại 1) | P1 |

---

## Phụ lục: Tham chiếu chéo

| Tài liệu này | Tài liệu liên quan | Liên kết |
|---|---|---|
| Core mechanics | PRD (docs/prd.md) — MVP scope | P0 = core loop |
| Control schemes | Architecture (docs/architecture.md) — Input system | p5.js touch/keyboard events |
| Game states | Architecture — State machine impl | Enum + switch |
| Scoring | Game Design (docs/game-design.md) — Win/lose | Score = success metric |
| Difficulty | PRD — Success metrics | Retention via difficulty curve |
| Power-ups (P1) | Game Design — Feature list P1 | Scoped out of MVP |

---

> **Handoff cho Architect (t_c7822c75):** Tài liệu này là input cho thiết kế kỹ thuật. Các điểm cần Architect lưu ý:
> - Direction buffer (§1.2.2) và collision algorithm (§1.5.2) là logic phức tạp nhất
> - Decouple render loop (60fps) khỏi game tick (60–150ms) — quan trọng cho performance
> - localStorage error handling (§8.1) cần graceful degradation
> - State machine (§4) cần enum + transition guard
> - P5.js touch events cần custom swipe detection layer
