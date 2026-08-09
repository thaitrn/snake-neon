# Snake Neon — Spec: Spike Walls + Territory Expansion

> **Tài liệu:** Business Analysis — spec 2 feature gameplay mới
> **Phiên bản:** 1.0
> **Tác giả:** BA (Business Analyst)
> **Ngày:** 2026-08-09
> **Input từ Sếp:** (1) Tường có gai rõ ràng — chạm là chết. (2) Mỗi lần ăn mồi → lãnh thổ lớn hơn.
> **Tài liệu liên quan:** `docs/mechanics.md` (core mechanics), `index.html` (code hiện tại)

---

## Mục lục

1. [Hiện trạng (Baseline)](#1-hiện-trạng-baseline)
2. [Feature 1 — Spike Walls (Tường gai)](#2-feature-1--spike-walls-tường-gai)
3. [Feature 2 — Territory Expansion (Mở rộng lãnh thổ)](#3-feature-2--territory-expansion-mở-rộng-lãnh-thổ)
4. [Business Rules cập nhật](#4-business-rules-cập-nhật)
5. [Edge Cases](#5-edge-cases)
6. [Acceptance Criteria cho Frontend](#6-acceptance-criteria-cho-frontend)
7. [Phụ lục: Tham số cấu hình](#7-phụ-lục-tham-số-cấu-hình)

---

## 1. Hiện trạng (Baseline)

Phân tích code `index.html` hiện tại để spec chính xác:

| Thông số | Giá trị hiện tại | Vị trí code |
|---|---|---|
| Grid | `const COLS = 17; const ROWS = 17;` (bất biến) | line 71–72 |
| Wall collision | `if (x < 0 \|\| x >= COLS \|\| y < 0 \|\| y >= ROWS) return 'WALL'` → death | line 214 |
| Border render | **KHÔNG CÓ** — chỉ vẽ grid lines (`renderGrid`), không vẽ viền tường | line 582–594 |
| Canvas size | `cellSize = Math.floor(size / COLS)`, canvas = cellSize × COLS | line 558–560 |
| Food spawn | Quét toàn bộ grid, loại snake body, random 1 ô trống | line 193–207 |
| Speed | `tickInterval = max(MIN_TICK, INITIAL_TICK - foodsEaten * STEP_REDUCTION)` | line 268 |

**Vấn đề nghiệp vụ Sếp nêu:**
1. Tường hiện tại chỉ là "lằn ranh vô hình" — player mới không biết chạm vào là chết. Cần visual gai cảnh báo.
2. Grid 17×17 cố định → board chật dần khi snake dài, không có cảm giác "phát triển". Cần board phình to theo tiến trình.

---

## 2. Feature 1 — Spike Walls (Tường gai)

### 2.1 Mục tiêu

Tường border không còn vô hình. Player **nhìn thấy ngay** rằng biên = nguy hiểm = chết. Tăng độ "arcade" và clarity.

### 2.2 Visual Spec

| Yếu tố | Spec |
|---|---|
| Vị trí | 4 cạnh của canvas (trên, dưới, trái, phải) |
| Hình dạng | **Gai nhọn tam giác** chỉ vào trong board (mũi tên hướng tâm) |
| Màu | Đỏ neon / hồng cảnh báo — `#ff2244` (đỏ) hoặc `#ff006e` (hồng, trùng palette food hiện tại). Khuyến nghị `#ff2244` để phân biệt với food hồng. |
| Glow | `drawingContext.shadowBlur` neon glow, cùng kỹ thuật `drawWithGlow` đang dùng cho snake/food |
| Mật độ gai | 1 gai mỗi **cell** dọc theo biên (tức `COLS` gai trên/dưới, `ROWS` gai trái/phải). Đảm bảo gai đều, không dồn. |
| Kích thước gai | Chiều dài ≈ `cellSize × 0.35`, rộng đáy ≈ `cellSize × 0.4`. Tỉ lệ theo cellSize để scale mọi viewport. |
| Animation (tùy chọn P1) | Gai nhấp nháy/pulse nhẹ (sin wave) để tăng cảm giác "sống". P0: tĩnh. |

**Render order:** Vẽ spike walls **sau** `renderGrid()`, **trước** `renderFood()` / `renderSnake()` để gai nằm dưới gameplay layer nhưng trên grid. (Xem `draw()` tại line 885–887.)

**Business rule — VIS-01:** Gai phải hiển thị ở **mọi state** (MENU, PLAYING, PAUSED, GAME_OVER) vì tường là ranh giới vật lý của board, không phải gameplay element ẩn.

**Business rule — VIS-02:** Gai **không** che cell playable. Gai vẽ **bên ngoài** vùng ô lưới (tràn ra biên canvas), hoặc vẽ lên viền nhưng phần nhọn < 50% cellSize để không che snake/food. Mỗi gai ăn vào vùng playable tối đa `cellSize × 0.35`.

### 2.3 Collision Spec

Collision logic **không đổi**. Tường gai chỉ là visual, vùng chết vẫn là "head ra ngoài [0, COLS) × [0, ROWS)".

```
// Giữ nguyên checkCollision() hiện tại — line 212-220
if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return 'WALL';  // → death
```

**Business rule — COL-01:** Gai là **representation**, không phải hitbox riêng. Hitbox = biên logic grid. Không thêm layer collision mới. Đơn giản hóa.

**Business rule — COL-02:** Khi snake chết do wall collision, hiệu ứng death (particles, shake) hiện tại đủ. P1: có thể thêm animation "gai xuyên thân" nhưng P0 giữ death effect chuẩn.

### 2.4 Thay đổi code dự kiến (cho Frontend)

| File | Hàm | Thay đổi |
|---|---|---|
| `index.html` | Thêm `renderSpikeWalls()` mới | Vẽ 4 dải gai tam giác neon |
| `index.html` | `draw()` (line ~885) | Thêm `renderSpikeWalls()` sau `renderGrid()` |
| `index.html` | `PALETTE` (line 104) | Thêm `spike: '#ff2244'` |

---

## 3. Feature 2 — Territory Expansion (Mở rộng lãnh thổ)

### 3.1 Mục tiêu

Mỗi lần ăn mồi → board phình to → cảm giác "chinh phục lãnh thổ". Đảo ngược difficulty curve hiện tại (board chật dần) thành board **căng nhưng rộng dần**.

### 3.2 Mechanic — Công thức mở rộng grid

**Quyết định BA:**

```
Mỗi lần ăn mồi → grid mở rộng theo cả 2 chiều:
  cols += 1   (thêm 1 cột)
  rows += 1   (thêm 1 hàng)
```

| Thông số | Giá trị | Ghi chú |
|---|---|---|
| Grid khởi tạo | 17 × 17 | Giữ nguyên P0 |
| Tăng mỗi food | +1 col, +1 row | Board mở rộng **đều** 2 chiều |
| **Cap tối đa** | **41 × 41** | Nút trên: 24 lần mở rộng (foodsEaten 0→24) |
| Hướng mở rộng | Mở rộng **đối xứng** quanh tâm (center-expand) | Snake ở giữa không bị đẩy lệch |

**Tại sao +1/+1 mỗi food?**
- Tỉ lệ 1:1 giữ grid **vuông** (BR-01 từ mechanics.md).
- Board +2 cell mỗi lần = tăng diện tích đáng kể nhưng không quá đột ngột.
- Đồng bộ với speed tăng: snake vừa nhanh hơn vừa có không gian mới → cân bằng.

**Tại sao cap 41×41?**
- 41×41 = 1681 cells. Tại `cellSize` tối thiểu, vẫn render vừa viewport mobile.
- Qua 41, cellSize quá nhỏ → không nhìn thấy snake/food. Xem §3.5 edge cases.
- 24 lần mở rộng = milestone rõ ràng (đạt cap = "lãnh thổ tối đại").

### 3.3 Snake position khi mở rộng (Center-expand)

**Vấn đề nghiệp vụ:** Nếu chỉ tăng COLS/ROWS thì snake (tọa độ gốc góc trên-trái) sẽ bị "đẩy" về góc trái-trái khi board phình ra bên phải/dưới. Trải nghiệm xấu.

**Giải pháp — Center-expand:**

```
Khi mở rộng (cols++, rows++):
  1. Tính offset: thêm cell mới chia đều 2 phía
     leftShift  = Math.floor(newCols / 2) - Math.floor(oldCols / 2)   // thường = 1 mỗi lần
     topShift   = Math.floor(newRows / 2) - Math.floor(oldRows / 2)
  2. Dịch toàn bộ snake.body:  body[i].x += leftShift, body[i].y += topShift
  3. Dịch food:                food.x += leftShift, food.y += topShift
  4. Cập nhật COLS = newCols, ROWS = newRows
```

**Business rule — EXP-01:** Mở rộng **đối xứng** — snake giữ vị trí tương đối gần tâm board. Player không bị mất phương hướng.

**Business rule — EXP-02:** Snake **không reset length**. Snake giữ nguyên độ dài hiện tại. Mở rộng grid = thêm không gian, không phải new game.

### 3.4 Food respawn khi grid lớn hơn

Logic `spawnFood()` hiện tại (line 193–207) **tự động thích ứng** vì nó quét `[0,ROWS) × [0,COLS)` và loại snake body. Không cần đổi thuật toán.

**Nhưng** cần cập nhật thứ tự trong `onEatFood()`:

```
onEatFood(eatenPos):
  score += BASE_POINTS
  foodsEaten++
  tickInterval = max(MIN_TICK, INITIAL_TICK - foodsEaten * STEP_REDUCTION)

  // === MỚI: Territory expansion ===
  if (COLS < MAX_COLS):
    expandGrid()         // tăng cols/rows, dịch snake + food, re-spawn food ở grid mới
    // food đã bị dịch, nhưng eatenPos cũ giờ không hợp lệ → spawn lại
    spawnFood()
  else:
    spawnFood()          //已达 cap, grid cố định, spawn bình thường

  spawnEatParticles(...)
  playEatSFX()
  screenFlash = 1.0
```

**Business rule — EXP-03:** Food **luôn** spawn lại sau khi mở rộng, đảm bảo nằm trong vùng playable mới và không trùng snake.

### 3.5 Canvas resize khi grid lớn hơn

`resizeCanvasToFit()` (line 544) hiện chia viewport cho COLS cố định. Khi COLS tăng, cellSize tự **giảm** để fit. Cần đảm bảo:

```
cellSize = Math.floor(size / max(COLS, ROWS))
canvasW  = cellSize * COLS
canvasH  = cellSize * ROWS
```

**Business rule — RES-01:** Sau mỗi lần mở rộng grid, **phải gọi `resizeCanvasToFit()`** để cellSize và canvas cập nhật theo COLS/ROWS mới.

**Business rule — RES-02:** cellSize tối thiểu = đảm bảo snake/food vẫn nhìn thấy. Tại 41×41 trên viewport 600px: cellSize = floor(600/41) = **14px** — đủ nhìn. Trên viewport nhỏ 320px (mobile hẹp): cellSize = floor(320/41) = **7px** — nhỏ nhưng vẫn chơi được. Cap 41 đảm bảo không quá nhỏ.

### 3.6 Difficulty curve cập nhật

Mechanic mở rộng **thay đổi cân bằng difficulty**:

| Giai đoạn | Grid | Board feel | Speed |
|---|---|---|---|
| Food 0–4 | 17×17 → 21×21 | Board vừa, dễ | 150→138ms (chậm) |
| Food 5–14 | 22×22 → 31×31 | Board rộng dần, thoải mái | 135→108ms |
| Food 15–24 | 32×32 → 41×41 | Board tối đa, cực rộng | 105→60ms (rất nhanh) |
| Food 25+ | 41×41 (cap) | Board cố định, snake dài chiếm chỗ | 60ms (cap) |

**Business rule — DIF-01:** Mở rộng grid **bù trừ** việc snake dài — thay vì board chật dần (cũ), board rộng ra (mới). Difficulty giờ đến từ **tốc độ** chứ không phải thiếu chỗ. Cuối game (sau cap) snake mới bắt đầu chật.

**Business rule — DIF-02:** Difficulty vẫn **deterministic** — cùng foodsEaten thì cùng grid + speed. Không random.

### 3.7 Thay đổi code dự kiến (cho Frontend)

| File | Biến/hàm | Thay đổi |
|---|---|---|
| `index.html` line 71–72 | `const COLS/ROWS` | Đổi `const` → `let` (mutable). Thêm `const INITIAL_COLS = 17; const MAX_COLS = 41;` |
| `index.html` | Thêm `expandGrid()` mới | Tăng cols/rows, dịch snake+food center-expand |
| `index.html` line 265 | `onEatFood()` | Thêm gọi `expandGrid()` + `resizeCanvasToFit()` |
| `index.html` line 282 | `resetGame()` | Reset `COLS = INITIAL_COLS; ROWS = INITIAL_ROWS;` |
| `index.html` line 214 | `checkCollision()` | Không đổi logic, tự dùng COLS/ROWS động |
| `index.html` line 558 | `resizeCanvasToFit()` | Dùng `max(COLS,ROWS)` cho cellSize |

---

## 4. Business Rules cập nhật

Business rules mới (mở rộng bảng BR-xx trong mechanics.md §7):

| # | Rule | Section |
|---|---|---|
| BR-18 | Tường gai vẽ 4 biên canvas, gai tam giác nhọn hướng tâm, neon đỏ `#ff2244`, glow | §2.2 |
| BR-19 | Gai hiển thị ở mọi state (MENU/PLAYING/PAUSED/GAME_OVER) | §2.2 VIS-01 |
| BR-20 | Gai không che quá 35% cellSize vào vùng playable | §2.2 VIS-02 |
| BR-21 | Collision tường = biên logic grid, gai chỉ là visual, không thêm hitbox | §2.3 COL-01 |
| BR-22 | Mỗi food ăn → grid +1 col +1 row, cap 41×41 | §3.2 |
| BR-23 | Mở rộng đối xứng tâm (center-expand), snake giữ vị trí tương đối | §3.3 EXP-01 |
| BR-24 | Snake KHÔNG reset length khi mở rộng | §3.3 EXP-02 |
| BR-25 | Food luôn re-spawn sau mở rộng | §3.4 EXP-03 |
| BR-26 | Phải gọi resizeCanvasToFit() sau mở rộng | §3.5 RES-01 |
| BR-27 | cellSize tối thiểu 7px (41×41 @ 320px viewport) | §3.5 RES-02 |
| BR-28 | Difficulty: board rộng bù trừ snake dài; sau cap 41 mới chật | §3.6 DIF-01 |
| BR-29 | Difficulty vẫn deterministic | §3.6 DIF-02 |

**BR cũ bị sửa:**
- **BR-05** (board đầy → WIN): grid động nên "đầy" khó đạt hơn. Vẫn giữ — nếu snake chiếm hết 41×41 = WIN huyền thoại.
- **BR-07** (wall collision = death): giữ nguyên, giờ có visual gai minh họa.

---

## 5. Edge Cases

| Case | Xử lý |
|---|---|
| Đạt cap 41×41 rồi vẫn ăn | Grid không tăng nữa, chỉ spawnFood + tăng speed. CellSize giữ 7–14px. |
| Mở rộng khi food vừa bị ăn | food cũ không hợp lệ sau dịch → spawnFood() tạo food mới trong grid lớn hơn |
| Snake dài gần bằng grid khi mở rộng | Mở rộng thêm 2 cell → snake có thêm không gian. Không crash. spawnFood đảm bảo cell trống. |
| Mở rộng làm cellSize < 7px | Cap 41×41 ngăn trường hợp này. Nếu viewport < 320px thì cellSize có thể < 7px nhưng mobile tối thiểu 320px (iPhone SE). |
| Reset game sau khi đã mở rộng | resetGame() phải trả COLS/ROWS về 17×17, cellSize cập nhật lại |
| Snake nằm sát biên khi mở rộng | Center-expand dịch snake vào trong, không bị đẩy ra ngoài biên mới |
| Spike walls render sau resize | renderSpikeWalls() dùng COLS/ROWS động → tự vẽ đúng số gai |
| Tab inactive giữa lúc mở rộng | Auto-pause (hiện tại), resume tiếp tục bình thường |

---

## 6. Acceptance Criteria cho Frontend

Task downstream: `t_6b434f6d` (Frontend: Spike Walls + Territory Expansion).

### AC — Spike Walls

- [ ] **AC-S1:** Hàm `renderSpikeWalls()` vẽ 4 dải gai tam giác neon đỏ, gai nhọn hướng vào tâm board
- [ ] **AC-S2:** Gai hiển thị ở cả 4 state (MENU, PLAYING, PAUSED, GAME_OVER)
- [ ] **AC-S3:** Gai có glow (`drawingContext.shadowBlur`) nhất quán với style neon hiện tại
- [ ] **AC-S4:** Gai không che quá 35% cellSize vào vùng playable — snake/food không bị khuất
- [ ] **AC-S5:** Chạm biên vẫn = death (logic collision không đổi)
- [ ] **AC-S6:** Gai scale đúng theo cellSize khi resize viewport

### AC — Territory Expansion

- [ ] **AC-T1:** `COLS`, `ROWS` đổi từ `const` → `let`, mutable
- [ ] **AC-T2:** Mỗi food ăn → `expandGrid()` tăng cols+1, rows+1 (cho đến 41×41)
- [ ] **AC-T3:** Cap 41×41 — vượt thì không tăng nữa
- [ ] **AC-T4:** Mở rộng center-expand: snake giữ vị trí tương đối gần tâm (dịch body + food)
- [ ] **AC-T5:** Snake KHÔNG reset length khi mở rộng
- [ ] **AC-T6:** Food re-spawn sau mở rộng, nằm trong grid mới
- [ ] **AC-T7:** `resizeCanvasToFit()` được gọi sau mở rộng → cellSize + canvas cập nhật
- [ ] **AC-T8:** `resetGame()` trả grid về 17×17
- [ ] **AC-T9:** Difficulty: speed vẫn tăng theo foodsEaten (giữ công thức cũ)
- [ ] **AC-T10:** Game chơi được từ 17×17 đến 41×41 không crash, không render lỗi

### AC — Integration

- [ ] **AC-I1:** Spike walls render đúng số gai khi grid = 17, 25, 33, 41
- [ ] **AC-I2:** Puppeteer test: chơi tự động (eat 5 food) → verify grid tăng, canvas resize, không exception
- [ ] **AC-I3:** Puppeteer test: verify spike walls visible ở state MENU và PLAYING
- [ ] **AC-I4:** Mobile viewport (375×667): cellSize tối thiểu khi grid 41 vẫn playable

---

## 7. Phụ lục: Tham số cấu hình

| Hằng số | Giá trị | Mục đích |
|---|---|---|
| `INITIAL_COLS` / `INITIAL_ROWS` | 17 | Grid khởi tạo |
| `MAX_COLS` / `MAX_ROWS` | 41 | Cap mở rộng |
| `EXPAND_PER_FOOD` | 1 | Cell tăng mỗi food (mỗi chiều) |
| `PALETTE.spike` | `#ff2244` | Màu tường gai |
| `SPIKE_LENGTH_RATIO` | 0.35 | Chiều dài gai / cellSize |
| `SPIKE_BASE_RATIO` | 0.4 | Rộng đáy gai / cellSize |

---

> **Handoff cho Frontend (`t_6b434f6d`):** Spec này là input implement. Điểm cần lưu ý:
> - Spike walls = **visual only**, collision giữ nguyên (§2.3)
> - Territory expansion cần đổi `const`→`let` cho COLS/ROWS + thêm `expandGrid()` (§3.7)
> - Center-expand để snake không bị lệch (§3.3)
> - Test Puppeteer bắt buộc verify AC-I1 đến AC-I4
