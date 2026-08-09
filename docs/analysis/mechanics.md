# Snake Neon — Phân tích Game Mechanics & Difficulty Design

> **Tài liệu:** Business Analysis / Gameplay Mechanics  
> **Phiên bản:** 1.0  
> **Ngày:** 2026-08-08  
> **Người viết:** BA (Goku)  
> **Trạng thái:** Draft — sẵn sàng bàn giao team dev

---

## Mục lục

1. [Tổng quan thiết kế](#1-tổng-quan-thiết-kế)
2. [Core Mechanics](#2-core-mechanics)
3. [Scoring System](#3-scoring-system)
4. [Difficulty Curve](#4-difficulty-curve)
5. [Game States](#5-game-states)
6. [Control Schemes](#6-control-schemes)
7. [Power-ups (P1)](#7-power-ups-p1)
8. [Business Rules tổng hợp](#8-business-rules-tổng-hợp)
9. [Entities & Data Model](#9-entities--data-model)
10. [Open questions / Gợi ý P2](#10-open-questions--gợi-ý-p2)

---

## 1. Tổng quan thiết kế

**Triết lý:** Easy to learn, hard to master — 1 ngón tay chơi được ngay, nhưng điểm cao cần kỹ năng phản xạ + quyết định chiến lược.

**Mobile-first:** Mọi thiết kế tối ưu cho touch trước, keyboard/mouse là tầng bổ sung. Kích thước màn hình mục tiêu: 360px–1440px chiều ngang.

**Grid logic:** Toàn bộ gameplay chạy trên lưới ô vuông (grid-based), không dùng tọa độ pixel tự do. Điều này giúp:
- Collision detection chính xác, rẻ chi phí CPU
- Food spawning xác định được ngay ô trống
- Rendering đơn giản, dễ neon-style

| Thông số | Giá trị mặc định | Ghi chú |
|---|---|---|
| Grid size (mobile) | 17 × 17 ô | vừa tay cầm, đủ thử thách |
| Grid size (desktop) | 25 × 25 ô | diện tích lớn hơn |
| Cell size | 16–24px (responsive) | tự scale theo viewport |
| Tick rate ban đầu | 150ms / tick | ~6.7 ô/giây |
| Tick rate tối đa | 60ms / tick | ~16.7 ô/giây (cap) |

---

## 2. Core Mechanics

### 2.1 Movement (Di chuyển)

**Cơ chế:** Grid-based, rắn di chuyển liên tục theo hướng hiện tại, mỗi "tick" tiến thêm 1 ô.

| Quy tắc | Mô tả |
|---|---|
| Hướng | 4 hướng: UP, DOWN, LEFT, RIGHT |
| Không quay đầu 180° | Không cho phép rẽ ngược hướng hiện tại (tránh tự sát vô ý) |
| Input buffering | Chỉ nhận 1 lệnh rẽ mỗi tick; lệnh tiếp theo queue cho tick sau |
| Direction queue | Tối đa 2 lệnh rẽ xếp hàng, ngăn "lost input" khi người chơi bấm nhanh |
| Auto-move | Nếu không có input mới, rắn tiếp tục đi thẳng theo hướng cũ |

**Input → Action mapping:**

```
[swipe UP]    / [↑] / [tap top-half]    → direction = UP
[swipe DOWN]  / [↓] / [tap bottom-half]  → direction = DOWN
[swipe LEFT]  / [←] / [tap left-half]    → direction = LEFT
[swipe RIGHT] / [→] / [tap right-half]   → direction = RIGHT
```

> **Business rule:** Lệnh rẽ chỉ được apply ở đầu tick tiếp theo, không apply ngay giữa tick. Việc này giữ logic sync với render loop và tránh bug "rắn tự cắn đuôi" do 2 lệnh rẽ cùng frame.

### 2.2 Food Spawning (Sinh thức ăn)

**Mục tiêu:** Đảm bảo food luôn xuất hiện ở ô trống, người chơi luôn có target để đuổi theo.

| Thuộc tính | Giá trị |
|---|---|
| Số lượng food trên grid | 1 (classic), có thể mở rộng P1 |
| Vị trí | Ngẫu nhiên trong tập hợp cell trống (không trùng thân rắn) |
| Thuật toán | Thu thập danh sách empty cells → random pick 1 ô |
| Fallback | Nếu không còn ô trống → **WIN condition** (rắn chiếm trọn grid) |

**Công thức spawn:**

```
empty_cells = all_cells - snake_body_cells
if len(empty_cells) == 0:
    trigger_event(WIN)
else:
    food.position = random.choice(empty_cells)
```

**Edge case xử lý:**

- Food không spawn ngay cạnh đầu rắn quá gần (< 2 ô) — tránh tình huống "ăn miễn phí" giảm tính thử thách. (Rule này optional, có thể bật/tắt theo difficulty.)
- Khi rắn dài gần đầy grid, thuật toán random pick vẫn hoạt động bình thường, performance vẫn O(n) với n = grid cells.

### 2.3 Growth & Speed (Lớn & Tăng tốc)

**Growth (Lớn):**

- Rắn dài thêm 1 segment mỗi lần ăn food.
- Segment mới thêm vào đuôi (tail), không thay đổi vị trí đầu (head).
- Nếu ăn nhiều food liên tiếp (combo), rắn vẫn chỉ dài 1 segment/food — combo ảnh hưởng đến **điểm**, không ảnh hưởng đến **kích thước**.

**Speed progression:**

| Milestone | Tốc độ (ms/tick) | Tăng |
|---|---|---|
| Start | 150ms | — |
| Mỗi 5 food | −5ms | giảm dần |
| Floor (cap) | 60ms | không nhanh hơn |

> Xem chi tiết [§4 Difficulty Curve](#4-difficulty-curve).

### 2.4 Collision (Va chạm)

| Loại | Điều kiện | Kết quả |
|---|---|---|
| Wall collision | Head chạm border grid | **DEATH** → game over |
| Self collision | Head trùng segment thân (trừ segment đuôi sẽ rời đi) | **DEATH** → game over |
| Food collision | Head trùng vị trí food | **EAT** → grow + score + spawn food mới |
| Win condition | Không còn ô trống để spawn food | **WIN** → game over (win screen) |

**Classic mode (default):** Wall = death.  
**Modern/Wrap mode (P1 tùy chọn):** Wall = wrap-around (đầu rắn xuất hiện ở mép đối diện). Khi wrap, self-collision vẫn = death.

---

## 3. Scoring System

### 3.1 Cấu trúc điểm

Điểm cuối = **Base points** × **Combo multiplier** + **Distance bonus**

| Thành phần | Công thức | Ghi chú |
|---|---|---|
| Base points | 10 × (current_level + 1) | Level càng cao, base càng lớn |
| Combo multiplier | 1.0 → 2.0x | Tăng khi ăn liên tiếp nhanh |
| Distance bonus | floor(distance / 5) | Khuyến khích di chuyển hiệu quả |

### 3.2 Combo Multiplier

Combo là phần cốt lõi tạo chiều sâu "hard to master":

| Điều kiện | Multiplier |
|---|---|
| Ăn food đầu tiên | 1.0× |
| Ăn food tiếp theo trong ≤ 3s | +0.2× (cap 2.0×) |
| Quá 3s không ăn | Reset về 1.0× |
| Va chạm / Game over | Reset về 1.0× |

**Ví dụ:**

- Ăn food #1: combo = 1.0×, điểm = 10 × 1.0 = 10
- Ăn food #2 trong 2s: combo = 1.2×, điểm = 10 × 1.2 = 12
- Ăn food #3 trong 1s: combo = 1.4×, điểm = 10 × 1.4 = 14
- ...

### 3.3 High Score Tracking

| Thuộc tính | Giá trị |
|---|---|
| Lưu trữ | `localStorage` (browser) — không cần backend |
| Key | `snake_neon_highscore` |
| Giá trị | Số nguyên (integer) |
| Hiển thị | Màn hình Menu + Game Over |
| Cập nhật | Khi `current_score > high_score` → ghi đè |
| Reset | Có nút "Reset high score" trong Settings (P1) |

**localStorage schema:**

```json
{
  "snake_neon_highscore": 0,
  "snake_neon_games_played": 0,
  "snake_neon_last_score": 0,
  "snake_neon_total_food_eaten": 0
}
```

### 3.4 Level / Wave System (P1 — optional)

Mỗi level = 10 food. Tăng level → tăng tốc độ + tăng base points.

| Level | Food cần | Tốc độ (ms/tick) | Base points |
|---|---|---|---|
| 1 | 0–9 | 150ms | 10 |
| 2 | 10–19 | 145ms | 20 |
| 3 | 20–29 | 130ms | 30 |
| ... | ... | ... | ... |
| 10 | 90–99 | 105ms | 100 |
| 11+ | 100+ | 100ms (cap) | 110+ |

> P0 (MVP) có thể bỏ Level system, chỉ dùng speed progression tuyến tính. Level UI hiển thị trong P1.

---

## 4. Difficulty Curve

### 4.1 Triết lý

- **Early game (0–20 food):** Dễ, cho người chơi làm quen. Tốc độ chậm, rắn ngắn, dễ tránh self-collision.
- **Mid game (20–50 food):** Tăng dần thử thách. Tốc độ nhanh hơn, rắn dài hơn, không gian hẹp hơn.
- **Late game (50+ food):** Khó. Tốc độ gần cap, rắn rất dài, self-collision là nguy cơ chính.

### 4.2 Speed Progression Formula

**Công thức tuyến tính (P0):**

```
tick_interval = MAX(60, 150 - (food_eaten * 2))
```

| Food eaten | Tick (ms) | Tốc độ (ô/giây) |
|---|---|---|
| 0 | 150 | 6.7 |
| 5 | 140 | 7.1 |
| 10 | 130 | 7.7 |
| 20 | 110 | 9.1 |
| 30 | 90 | 11.1 |
| 45 | 60 (cap) | 16.7 |
| 45+ | 60 | 16.7 |

**Công thức exponential (P1 — khó hơn):**

```
tick_interval = MAX(60, 150 * (0.98 ^ food_eaten))
```

> Công thức exponential tạo cảm giác "bùng nổ" tốc độ sau mid-game, phù hợp mode Hardcore.

### 4.3 Difficulty Modes (P1)

| Mode | Tốc độ start | Cap | Growth |
|---||---|---|
| Casual | 180ms | 100ms | Linear, nhẹ |
| Normal (default) | 150ms | 60ms | Linear |
| Hardcore | 120ms | 50ms | Exponential |

---

## 5. Game States

### 5.1 State Machine

```
                    ┌──────────┐
            ┌──────▶│   MENU   │◀───────┐
            │       └────┬─────┘        │
            │            │ [Start]      │ [Main Menu]
            │            ▼              │
            │       ┌──────────┐        │
            │   ┌───│ PLAYING  │───┐    │
            │   │   └────┬─────┘   │    │
            │   │ [ESC]  │ [Death] │    │
            │   │        ▼         │    │
            │   │  ┌──────────┐   │    │
            │   └──│  PAUSED  │   │    │
            │      └──────────┘   │    │
            │                     ▼    │
            │                ┌──────────┐
            └────────────────│GAME OVER │
                             └──────────┘
```

### 5.2 Chi tiết các state

| State | Mô tả | Entry | Exit |
|---|---|--- |---|
| **MENU** | Màn hình tiêu đề, logo neon, high score, nút Play/Settings. Rắn AI demo chạy nền. | App load, hoặc [Main Menu] từ Game Over / Pause | [Play] → PLAYING |
| **PLAYING** | Gameplay chính. Game loop active, input enabled, render active. | [Play] từ MENU, [Resume] từ PAUSED | [ESC]/[Pause] → PAUSED; death/win → GAME OVER |
| **PAUSED** | Game loop frozen, overlay "Paused", nút Resume/Restart/Menu. | [ESC] / [Pause button] trong PLAYING | [Resume] → PLAYING; [Restart] → PLAYING (reset); [Menu] → MENU |
| **GAME OVER** | Hiển thị final score, high score (có badge "NEW!"), nút Restart/Menu. Confetti neon khi phá kỷ lục. | Collision/Win trong PLAYING | [Restart] → PLAYING (reset); [Menu] → MENU |

### 5.3 Game Loop (trong PLAYING)

```
game_loop():
    while state == PLAYING:
        process_input()       # đọc direction queue
        update_logic():       # move snake, check collision, spawn food
        render()              # vẽ grid, snake, food, HUD
        sleep(tick_interval)  # wait theo speed hiện tại
```

**Tick-based, không delta-time:** Vì Snake là game grid-based, logic update theo tick cố định (không theo delta time như platformer). Render có thể interpolate giữa các tick để trông mượt (P1).

---

## 5.4 Game Over Conditions

| Điều kiện | Loại | Animation |
|---|---|---|
| Wall collision | DEATH | Head flash đỏ → fade out |
| Self collision | DEATH | Head flash đỏ → fade out |
| Grid full (win) | WIN | Toàn bộ rắn pulse neon xanh → fade to gold |

---

## 6. Control Schemes

### 6.1 Mobile (primary)

**Swipe gesture (mặc định):**

- Vuốt (swipe) theo 4 hướng trên toàn màn hình.
- Ngưỡng (threshold): tối thiểu 20px di chuyển để tính swipe.
- Vùng active: toàn bộ canvas, không cần vùng cố định.

**Tap-to-steer (thay thế):**

- Tap vào nửa trên/dưới/trái/phải màn hình để rẽ.
- Phù hợp thiết bị có case dày, hoặc người chơi thích tap nhanh.

**On-screen D-pad (P1):**

- Bảng điều khiển 4 nút ở góc dưới.
- Dành cho người chơi muốn precision control.
- Có thể bật/tắt trong Settings.

### 6.2 Desktop

**Arrow keys / WASD:**

| Phím | Hành động |
|---|---|
| ↑ / W | UP |
| ↓ / S | DOWN |
| ← / A | LEFT |
| → / D | RIGHT |
| Space / Esc | Pause / Resume |
| Enter | Start / Restart |

### 6.3 Cross-platform notes

- **Phát hiện thiết bị:** `navigator.maxTouchPoints > 0` → ưu tiên swipe; ngược lại → arrow keys.
- **Touch vs mouse:** Sự kiện touch + click cùng được lắng nghe, nhưng chỉ 1 trong 2 active (tránh double-trigger).
- **Prevent default:** Ngăn scroll trang khi swipe trên mobile (`touch-action: none` CSS + `preventDefault`).

---

## 7. Power-ups (P1)

Power-up là mục tiêu P1, mở rộng chiều sâu gameplay mà không phá vỡ tính "arcade đơn giản".

### 7.1 Danh sách Power-ups

| Power-up | Icon | Hiệu ứng | Thời lượng | Hiếm |
|---|---|---|---|---|
| **Speed Boost** | ⚡ | Tăng tốc độ rắn ×1.5 trong 5s (over-cap) | 5 giây | Common |
| **Ghost Mode** | 👻 | Rắn xuyên tường (wrap) + xuyên thân (no self-collision) trong 4s | 4 giây | Rare |
| **Score Multiplier** | ×2 | Nhân đôi điểm earned trong 8s | 8 giây | Uncommon |
| **Shrink** | ✂️ | Rút ngắn rắn đi 3 segment (instant) | Instant | Uncommon |

### 7.2 Spawn rules

- Power-up spawn ngẫu nhiên cùng lúc với food (xác suất 20% mỗi lần spawn food).
- Vị trí: ô trống, khác vị trí food.
- Thời gian tồn tại: 8 giây. Nếu không nhặt → biến mất.
- Chỉ 1 power-up tồn tại trên grid tại 1 thời điểm.
- Khi active, power-up icon hiện trên HUD với countdown ring.

### 7.2 Power-up stacking rules

- Các power-up KHÔNG stack (chồng hiệu ứng). Nhặt power-up mới khi đang active → reset timer, không cộng dồn.
- Ngoại lệ: Score Multiplier stack với bất kỳ power-up nào khác (vì khác loại hiệu ứng).

### 7.3 Visual (Neon Vibe)

Mỗi power-up có màu neon đặc trưng để dễ nhận biết:

- ⚡ Speed Boost — vàng neon
- 👻 Ghost Mode — tím neon
- ×2 Score Multiplier — cam neon
- ✂️ Shrink — xanh lá neon

---

## 8. Business Rules tổng hợp

Danh sách tập hợp tất cả business rules, phục vụ team dev kiểm tra logic:

| ID | Rule | Ưu tiên |
|---|---|---|
| BR-001 | Rắn chỉ di chuyển 4 hướng, không cho phép quay 180° | P0 |
| BR-002 | Input direction queue tối đa 2 lệnh | P0 |
| BR-003 | Food luôn spawn ở ô trống, đảm bảo ăn được | P0 |
| BR-004 | Combo multiplier increases 0.2× per combo, cap 2.0×, reset sau 3s không ăn | P0 |
| BR-005 | Wall collision = death (classic mode) | P0 |
| BR-006 | Self collision = death (trừ wrap mode khi không active) | P0 |
| BR-007 | High score lưu trong localStorage, cập nhật khi vượt | P0 |
| BR-008 | Tốc độ tăng dần theo food eaten, cap 60ms/tick | P0 |
| BR-009 | Game loop tick-based, không delta-time | P0 |
| BR-010 | Game over → hiển thị score + high score + nút Restart/Menu | P0 |
| BR-011 | Win condition: grid đầy, không còn ô trống | P0 |
| BR-012 | Tap-to-steer có thể thay thế swipe trên mobile | P0 |
| BR-013 | Power-up không stack hiệu ứng cùng loại | P1 |
| BR-014 | Power-up spawn 20% chance khi spawn food | P1 |
| BR-015 | Score Multiplier stack với power-up khác loại | P1 |
| BR-016 | Wrap mode (wall = wrap) là tùy chọn, không default | P1 |
| BR-017 | Game có thể pause/resume bất kỳ lúc nào trong PLAYING | P0 |
| BR-018 | Combo multiplier tăng 0.2×, cap 2.0×, reset 3s không ăn | P0 |

---

## 9. Entities & Data Model

### 9.1 Core Entities

```
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│    Snake      │     │     Food      │     │  PowerUp (P1) │
├───────────────┤     ├───────────────┤     ├───────────────┤
│ body: Cell[]  │     │ position: Cell│     │ type: Enum    │
│ direction: Dir│     │               │     │ position: Cell│
│ length: int   │     └───────────────┘     │ ttl: int (ms) │
│ alive: bool   │                           └───────────────┘
└───────────────┘
```

### 9.2 Cell

```
Cell { x: int, y: int }
```

### 9.2.2 Game State (runtime)

```
GameState {
    state: MENU | PLAYING | PAUSED | GAME_OVER
    snake: Snake
    food: Food
    powerups: PowerUp[]         // P1
    score: int
    high_score: int             // from localStorage
    combo: float                // current combo multiplier
    combo_timer: int (ms)       // time since last food
    food_eaten: int
    level: int                  // P1
    tick_interval: int (ms)     // current speed
}
```

### 9.3 Persisted Data (localStorage)

```json
{
  "snake_neon_highscore": 0,
  "snake_neon_games_played": 0,
  "snake_neon_last_score": 0,
  "snake_neon_total_food_eaten": 0
}
```

---

---

---

## 10. Open Questions / Gợi ý P2

| # | Question | Context |
|---|---|---|
| Q1 | Có cần leaderboard trực tuyến không? | Cần backend + auth. Đề xuất P2 nếu có user base. |
| Q2 | Wrap mode có tích hợp vào classic mode không? | Hiện P1. Có thể default wrap cho level cao. |
| Q3 | Có cần skin customization cho rắn không? | Cosmetics → engagement. Đề xuất P1/P2. |
| Q4 | Có cần sound effects + music không? | Mặc định có (eat, death, combo). Music là P1. |
| Q5 | Grid size có responsive theo thiết bị không? | Có, xem §1 bảng thông số. |
| Q6 | Có cần dark/light theme toggle? | Snake Neon = dark-only theo concept. |
| Q7 | Có cần daily challenge / challenge mode không? | Đề xuất P2. |
| Q8 | Có cần achievements system không? | Đề xuất P2, gắn với localStorage. |

---

## Phụ lục A: Công thức tổng hợp (cheatsheet)

```
# Tốc độ
tick_interval = MAX(60, 150 - (food_eaten * 2))   # P0 linear

# Điểm (per food)
score_gained = 10 * (level + 1) * combo_multiplier + floor(distance / 5)

# Combo
combo = MIN(2.0, combo + 0.2)  if eat within 3s
combo = 1.0                     if 3s no eat

# Level (P1)
level = floor(food_eaten / 10) + 1

# Grid
grid_cells = grid_width * grid_height
empty_cells = grid_cells - len(snake_body)
```

---

## Phụ lục B: Traceability Matrix

| Deliverable (từ task) | Section trong doc | Status |
|---|---|---| 
| Core mechanics: movement, food, growth, collision | §2 | ✅ |
| Scoring: points, combo, high score | §3 | ✅ |
| Difficulty curve: speed formula, level system | §4 | ✅ |
| Game states | §5 | ✅ |
| Control schemes | §6 | ✅ |
| Power-ups (P1) | §7 | ✅ |
| Easy to learn, hard to master | §1, §3.2, §4 | ✅ |
| Mobile-first design | §6 | ✅ |
---

**Hết tài liệu.**

_Goku — Business Analyst_
_2026-08-08_
