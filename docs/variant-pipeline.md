# Snake Neon — Variant Pipeline Design

> **Tài liệu:** Kiến trúc pipeline tạo 100 biến thể game
> **Tác giả:** Architect
> **Ngày:** 2026-08-09
> **Nguyên tắc:** KISS — config-driven, template injection, không rewrite game

---

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Config Schema](#2-config-schema)
3. [100 Variant Presets](#3-100-variant-presets)
4. [Generation Pipeline](#4-generation-pipeline)
5. [Template Injection — điểm chèn](#5-template-injection--điểm-chèn)
6. [Game Mode: Wall vs Wrap](#6-game-mode-wall-vs-wrap)
7. [Test Approach](#7-test-approach)
8. [Cấu trúc thư mục](#8-cấu-trúc-thư-mục)
9. [Caveats](#9-caveats)

---

## 1. Tổng quan

Mỗi variant = 1 file JSON config → 1 file HTML độc lập trong `variants/`.

```
configs/001.json ─┐
configs/002.json ─┤  generate.py ──► variants/001.html
   ...            ─┤  (inject)     variants/002.html
configs/100.json ─┘                  ...variants/100.html
                                         │
                                    test_all.py (puppeteer)
                                         │
                                    test-report.json
```

**Không rewrite game.** Script chỉ thay các giá trị const trong `index.html` và inject
game-mode logic. Toàn bộ gameplay giữ nguyên.

---

## 2. Config Schema

```json
{
  "id": "001",
  "name": "Neon Green — 17×17 — Wall",
  "description": "Classic neon green snake, standard grid, wall collision",
  "theme": {
    "bg":        "#0a0a0f",
    "snake":     "#00ff88",
    "snakeHead": "#33ffaa",
    "food":      "#ff006e",
    "grid":      "#1a1a2e",
    "scoreText": "#00d9ff",
    "accent":    "#ffee00"
  },
  "grid": {
    "cols": 17,
    "rows": 17
  },
  "speed": {
    "initialTick":   150,
    "minTick":       60,
    "stepReduction": 3
  },
  "scoring": {
    "basePoints": 10
  },
  "gameMode": "wall",
  "startLength": 3
}
```

### Trường schema

| Nhóm | Trường | Kiểu | Mặc định | Ghi chú |
|---|---|---|---|---|
| id | `id` | string | — | "001"–"100", zero-padded |
| | `name` | string | — | Hiển thị trong report |
| | `description` | string | — | Mô tả ngắn |
| theme | `bg` | hex | #0a0a0f | Màu nền canvas |
| | `snake` | hex | #00ff88 | Thân rắn |
| | `snakeHead` | hex | #33ffaa | Đầu rắn |
| | `food` | hex | #ff006e | Thức ăn |
| | `grid` | hex | #1a1a2e | Đường lưới |
| | `scoreText` | hex | #00d9ff | Text score HUD |
| | `accent` | hex | #ffee00 | Best score / highlight |
| grid | `cols` | int | 17 | Cột (13/15/17/19/21) |
| | `rows` | int | 17 | Hàng (13/15/17/19/21) |
| speed | `initialTick` | int (ms) | 150 | Tick ban đầu |
| | `minTick` | int (ms) | 60 | Tick tối thiểu (max speed) |
| | `stepReduction` | int (ms) | 3 | Giảm mỗi lần ăn |
| scoring | `basePoints` | int | 10 | Điểm mỗi lần ăn |
| gameplay | `gameMode` | enum | "wall" | "wall" hoặc "wrap" |
| | `startLength` | int | 3 | Chiều dài rắn ban đầu |

> Lưu ý: `snakeHead`, `grid`, `scoreText` có thể được tự sinh từ `snake`/`bg`
> nếu muốn đơn giản hơn, nhưng để trong schema cho kiểm soát đầy đủ.

---

## 3. 100 Variant Presets

Tổ hợp: **10 themes × 5 grid sizes × 2 game modes = 100 variants**.

### 3.1 — 10 Color Themes

| # | Theme | snake | food | bg | accent |
|---|---|---|---|---|---|
| 1 | Neon Green | #00ff88 | #ff006e | #0a0a0f | #ffee00 |
| 2 | Hot Pink | #ff10f0 | #00ff88 | #0d0011 | #00d9ff |
| 3 | Electric Blue | #00d9ff | #ff5500 | #050518 | #ff006e |
| 4 | Sunset Orange | #ff6b00 | #ffe600 | #1a0a00 | #00ff88 |
| 5 | Deep Purple | #b026ff | #ffeb3b | #0d0015 | #00e5ff |
| 6 | Ice White | #e0f7ff | #ff1744 | #000814 | #4fc3f7 |
| 7 | Blood Red | #ff003c | #ffffff | #0a0000 | #ff8800 |
| 8 | Toxic Yellow | #d4ff00 | #ff00ff | #0f1100 | #00ffaa |
| 9 | Matrix Green | #00ff41 | #008f11 | #000000 | #00ff41 |
| 10 | Ocean Teal | #00e5cc | #ff4081 | #001a1a | #80deea |

> `snakeHead` = lighten `snake` ~10%, `grid` = darken `bg` ~10%, `scoreText` = `accent`.
> Backend có thể tính tự động hoặc để giá trị cố định trong preset JSON.

### 3.2 — 5 Grid Sizes

`13×13, 15×15, 17×17, 19×19, 21×21` (lẻ để có ô trung tâm, đảm bảo START_X/Y nguyên).

### 3.3 — 2 Game Modes

- **wall** — chạm tường = chết (mặc định, như hiện tại)
- **wrap** — đi xuyên tường (toroidal, hiện ra phía đối diện)

### 3.4 — Quy tắc đánh số

```
variant index = (themeIndex × 5 + gridIndex) × 2 + modeIndex
```

Tức là nhóm theo theme trước, rồi grid, rồi mode:

```
001 = Neon Green, 13×13, wall
002 = Neon Green, 13×13, wrap
003 = Neon Green, 15×15, wall
...
010 = Neon Green, 21×21, wrap
011 = Hot Pink, 13×13, wall
...
100 = Ocean Teal, 21×21, wrap
```

Naming convention: `"{ThemeName} {Grid} {Mode}"` → `"Neon Green 17×17 Wall"`.

---

## 4. Generation Pipeline

### 4.1 — generate.py (Python, 0 dependency)

```python
# Pseudocode / spec — Backend implement chi tiết
import json, re, os

TEMPLATE = "index.html"
CONFIG_DIR = "configs"
OUT_DIR = "variants"

def generate_variant(config_path):
    cfg = json.load(open(config_path))
    html = open(TEMPLATE).read()
    html = inject_config(html, cfg)
    out = f"{OUT_DIR}/{cfg['id']}.html"
    open(out, "w").write(html)

def inject_config(html, cfg):
    # Xem §5 cho danh sách điểm chèn chính xác
    ...
```

**Các bước:**
1. Đọc `index.html` làm template.
2. Với mỗi `configs/NNN.json`:
   - Thay các dòng `const COLS`, `const ROWS`, `const START_LENGTH`,
     `const INITIAL_TICK`, `const MIN_TICK`, `const STEP_REDUCTION`,
     `const BASE_POINTS` bằng giá trị từ config.
   - Thay toàn bộ block `const PALETTE = {...}` bằng theme từ config.
   - Inject `const GAME_MODE = "wall"|"wrap"` và patch `checkCollision`
     (xem §6).
3. Ghi `variants/NNN.html`.

**Output:** 100 file HTML, mỗi file self-contained (kèm p5.js CDN), mở trực tiếp
chơi được.

### 4.2 — ID generation helper

Backend tự sinh 100 file `configs/001.json`...`configs/100.json` từ 3 bảng
trên (themes × grids × modes). Có thể hardcode hoặc generate bằng loop.

---

## 5. Template Injection — điểm chèn

Dựa trên `index.html` hiện tại (lines 71–113), đây là các điểm cần thay:

### 5.1 — Grid & speed consts (lines 71–81)

```
TRƯỚC:
const COLS = 17;
const ROWS = 17;
const START_LENGTH = 3;
...
const INITIAL_TICK   = 150;
const MIN_TICK       = 60;
const STEP_REDUCTION = 3;
const BASE_POINTS = 10;

SAU (ví dụ config 001):
const COLS = 13;
const ROWS = 13;
const START_LENGTH = 3;
...
const INITIAL_TICK   = 150;
const MIN_TICK       = 60;
const STEP_REDUCTION = 3;
const BASE_POINTS = 10;
```

> Giữ `const START_X`/`START_Y` nguyên — chúng tự tính từ COLS/ROWS.

### 5.2 — Palette block (lines 104–113)

Thay nguyên block `const PALETTE = { ... };` bằng JSON theme đã convert sang JS literal.

### 5.3 — Game mode injection

Thêm dòng mới sau block CONFIG (sau line 81):
```js
const GAME_MODE = "wrap";  // "wall" hoặc "wrap"
```

Và patch `checkCollision` (xem §6).

---

## 6. Game Mode: Wall vs Wrap

### Trạng thái hiện tại

`checkCollision` (lines 212–220) luôn return `'WALL'` khi head ra ngoài biên —
chưa có chế độ wrap. Đây là điểm duy nhất cần thêm logic, không phải "rewrite game".

### Thiết kế patch

Inject hàm `checkCollision` mới vào template, override bản gốc. Logic wrap:

```js
function checkCollision(newHead, willEat) {
  if (GAME_MODE === "wrap") {
    // Wrap around — không bao giờ wall-collision
    newHead.x = (newHead.x + COLS) % COLS;
    newHead.y = (newHead.y + ROWS) % ROWS;
  } else {
    const { x, y } = newHead;
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return 'WALL';
  }
  const checkBody = willEat ? snake.body : snake.body.slice(0, -1);
  for (let i = 0; i < checkBody.length; i++) {
    if (checkBody[i].x === newHead.x && checkBody[i].y === newHead.y) return 'SELF';
  }
  return null;
}
```

> Lưu ý cho Backend: trong `snakeTick`, `newHead` được tạo rồi mới gọi
> `checkCollision`, nên mutate `newHead` trực tiếp (wrap) là an toàn —
> `snake.body.unshift(newHead)` ngay sau đó dùng cùng object.

### Cách inject

Script thay toàn bộ function body `checkCollision` bằng regex khớp từ
`function checkCollision(` đến `}` đóng khớp đầu tiên. Hoặc đơn giản hơn:
chèn override sau khi p5 script chạy — **không**, vì `checkCollision` được gọi
trong `snakeTick`. Phải patch tại chỗ.

**Khuyến nghị:** regex multiline thay block từ
`function checkCollision(newHead, willEat) {` đến `return null;\n}` tiếp theo.

---

## 7. Test Approach

### 7.1 — Công cụ

Puppeteer (đã có trong `package.json`, v25.5.0). Headless Chrome.

### 7.2 — test_all.py (hoặc test_all.js)

Cho mỗi `variants/NNN.html`:
1. Mở file bằng `file://` URL.
2. Đợi p5 canvas render (poll `document.querySelector('canvas')`).
3. Kiểm tra:
   - **Load OK** — không có `pageerror` event.
   - **Canvas renders** — `canvas` element tồn tại, `width > 0 && height > 0`.
   - **No JS errors** — thu thập console errors + pageerror.
4. Ghi kết quả vào `test-report.json`.

### 7.3 — test-report.json schema

```json
{
  "generated_at": "2026-08-09T...",
  "total": 100,
  "passed": 98,
  "failed": 2,
  "results": [
    {
      "variant_id": "001",
      "name": "Neon Green 13×13 Wall",
      "status": "pass",
      "errors": []
    },
    {
      "variant_id": "042",
      "name": "Electric Blue 19×19 Wrap",
      "status": "fail",
      "errors": ["ReferenceError: SWIPE_THRESHOLD is not defined"]
    }
  ]
}
```

---

## 8. Cấu trúc thư mục

```
snake-neon/
├── index.html              ← template gốc (không sửa)
├── package.json            ← đã có puppeteer
├── scripts/
│   ├── generate.py         ← tạo configs + variants
│   └── test_all.py         ← puppeteer test
├── configs/
│   ├── 001.json
│   ├── ...
│   └── 100.json
├── variants/               ← generated, .gitignore
│   ├── 001.html
│   ├── ...
│   └── 100.html
└── test-report.json        ← generated
```

> `variants/` nên thêm vào `.gitignore` (output sinh ra, không commit).

---

## 9. Caveats

### 9.1 — SWIPE_THRESHOLD (pre-existing bug)

`SWIPE_THRESHOLD` được dùng ở lines 955, 978, 996 nhưng **không được define** ở
bất kỳ đâu trong file. Đây là bug tiềm ẩn trong code hiện tại — chỉ không nổ vì
logic D-pad (mouse/touch buttons) chạy trước và trả về sớm trong nhiều luồng.

**Không phải việc của pipeline này**, nhưng test Puppeteer có thể bắt được nếu
variant nào trigger swipe path. Khuyến nghị Backend thêm `const SWIPE_THRESHOLD = 30;`
vào CONFIG block khi generate (giá trị hợp lý ~30px), hoặc flag riêng.

### 9.2 — D-pad element không tồn tại

HTML hiện tại không có `<div id="dpad">` — `initDPad()` (line 1037) return sớm.
Pipeline không ảnh hưởng, chỉ lưu ý khi test mobile controls.

### 9.3 — CDN dependency

Mỗi variant load p5.js từ CDN (`cdn.jsdelivr.net`). Test Puppeteer cần network.
Nếu chạy offline, copy p5.min.js local và đổi src trong template.
