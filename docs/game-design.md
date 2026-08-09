# Game Design Document — Snake Neon

> **GDD** | Version: 1.0 | Owner: PM | Date: 2026-08-08
> Status: Approved for MVP

---

## 1. Game Overview

**Tên:** Snake Neon
**Thể loại:** Arcade / Casual
**Platform:** Web browser (mobile-first)
**Độ dài phiên chơi:** 30 giây – 5 phút (session-based, short burst)
**Mục tiêu:** Ăn nhiều food nhất có thể trước khi chết → high score

### Design Pillars (3 trụ cột)
1. **INSTANT** — Vào chơi trong 2 giây. Không loading, không tutorial.
2. **JUICY** — Mỗi lần ăn điểm phải thấy + nghe cảm giác thỏa mãn (glow, particle, sound).
3. **SHAREABLE** — Màn hình game đẹp đủ để muốn screenshot khoe bạn bè.

---

## 2. Core Gameplay Loop

```
┌─────────────────────────────────────────────────┐
│                                                 │
│   ┌──────────┐     ┌───────────┐               │
│   │  MENU    │────▶│  PLAYING  │               │
│   │ (tap to  │     │           │               │
│   │  play)   │     │  swipe to │               │
│   └──────────┘     │  steer    │               │
│        ▲           └─────┬─────┘               │
│        │                 │                     │
│        │           (collision:                 │
│        │            wall / self)               │
│        │                 │                     │
│        │                 ▼                     │
│        │           ┌───────────┐               │
│        │           │ GAME OVER │               │
│        │           │           │               │
│        │           │ Score: XX │               │
│        └───────────│ Best: XX  │               │
│            (retry) │           │               │
│                    └───────────┘               │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Chi tiết Core Loop (từng vòng nhỏ)
1. Snake di chuyển liên tục theo hướng hiện tại
2. Người chơi vuốt/phím để đổi hướng (không thể quay 180° ngược chiều)
3. Snake chạm food → dài ra +1 segment → điểm +10 → particle burst + SFX → tốc độ tăng nhẹ
4. Snake chạm wall hoặc chính mình → chết → Game Over
5. Game Over → hiển thị score + best → tap để chơi lại (về MENU hoặc PLAYING ngay)

### Game Feel ("Juice")
- **Screen flash** nhẹ khi ăn (0.1s white pulse)
- **Particle burst** 6–8 hạt neon tại vị trí food khi ăn
- **Snake glow** pulse nhẹ (breathing effect)
- **Food** xoay/pulse để thu hút sự chú ý
- **Death animation**: snake flash đỏ, screen shake nhẹ, particle scatter
- **Combo flash text** (P1): "+10!", "COMBO x2!" bay lên rồi fade

---

## 3. Win / Lose Conditions

### Win Condition
- **Không có win condition cố định** — đây là endless arcade game
- "Thắng" = phá kỷ lục cá nhân (beat high score)
- Màn hình Game Over hiển thị "NEW BEST!" nếu phá kỷ lục

### Lose Condition
- Snake va vào **tường (wall)** → chết
- Snake va vào **chính mình (self)** → chết
- Không có time limit, không có health bar

### Scoring
- **+10 điểm** mỗi lần ăn food (MVP)
- **High score** lưu bằng localStorage, persist giữa các phiên
- (P1) Combo multiplier: ăn liên tiếp trong X giây → ×2, ×3...

---

## 4. Controls

### Mobile (primary)
| Action | Input | Mô tả |
|---|---|---|
| Đổi hướng | **Swipe** (vuốt) | Vuốt lên/xuống/trái/phải để đổi hướng rắn. Threshold ~30px để tránh trigger nhầm. |
| Pause | (P1) Tap 2 ngón | 2 ngón chạm màn hình → pause |

### Desktop (secondary)
| Action | Input |
|---|---|
| Đổi hướng | Phím mũi tên ↑ ↓ ← → hoặc WASD |
| Pause | Phím Space hoặc P (P1) |
| Restart | Phím R hoặc Space trên Game Over |

### Quy tắc input
- **Không thể quay 180°**: Nếu đang đi phải, không thể vuốt trái ngay (tránh self-kill tức thì)
- **Input buffering**: Nếu vuốt 2 lần nhanh trước khi snake render frame tiếp, chỉ lấy hướng cuối cùng
- **Deadzone**: Tap nhẹ < 15px không trigger đổi hướng

---

## 5. Feature List (MoSCoW)

### P0 — MUST HAVE (MVP)

| # | Feature | Mô tả | Priority |
|---|---|---|---|
| P0-1 | **Snake movement** | Grid-based, 4 hướng, di chuyển liên tục | Must |
| P0-2 | **Food spawning** | Random ô trống trên grid, 1 food tại một thời điểm | Must |
| P0-3 | **Growth** | Snake dài +1 segment khi ăn food | Must |
| P0-4 | **Collision detection** | Wall + self collision → death | Must |
| P0-5 | **Scoring** | +10/food, hiển thị real-time trên HUD | Must |
| P0-6 | **High score** | Lưu localStorage, hiển thị trên Menu + Game Over | Must |
| P0-7 | **Game states** | MENU → PLAYING → GAMEOVER, transition mượt | Must |
| P0-8 | **Swipe controls** | Vuốt 4 hướng trên mobile, threshold tuning | Must |
| P0-9 | **Keyboard controls** | Arrow keys/WASD trên desktop | Must |
| P0-10 | **Neon glow aesthetic** | Dark bg, snake + food glow, grid subtle | Must |
| P0-11 | **Eat SFX** | Âm thanh "blip" khi ăn food | Must |
| P0-12 | **Death SFX** | Âm thanh chết | Must |
| P0-13 | **Background music** | Chiptune melody loop, mutable (mute button) | Must |
| P0-14 | **Particle effects** | Burst khi ăn food + khi chết | Must |
| P0-15 | **Responsive canvas** | Fit mobile portrait + desktop landscape | Must |
| P0-16 | **Restart** | Tap/space để chơi lại từ Game Over | Must |

### P1 — SHOULD HAVE (Polish)

| # | Feature | Mô tả |
|---|---|---|
| P1-1 | **CRT scanline overlay** | Hiệu ứng scanline mờ trên toàn màn hình |
| P1-2 | **On-screen D-pad** | Nút 4 hướng ảo cho mobile (tùy chọn, có thể tắt) |
| P1-3 | **Pause** | Pause game, resume lại |
| P1-4 | **Share screenshot** | Chụp canvas → share/download |
| P1-5 | **Color themes** | Unlock theme mới theo milestone điểm (50, 100, 200...) |
| P1-6 | **Combo system** | Ăn nhanh liên tiếp → multiplier ×2, ×3 |
| P1-7 | **Death screen shake** | Screen shake nhẹ khi chết |
| P1-8 | **Food variety** | Đôi khi xuất hiện food đặc biệt (điểm x2, giá trị khác) |

### P2 — COULD HAVE (Enhancement)

| # | Feature | Mô tả |
|---|---|---|
| P2-1 | **Power-ups** | Speed boost, ghost mode (phase through self), score multiplier |
| P2-2 | **Level/wave system** | Mỗi 10 food = level up, đổi background color |
| P2-3 | **PWA** | Installable, offline, app icon |
| P2-4 | **Multiple game modes** | Classic / Wrap (wall = teleport) / Timed |
| P2-5 | **Settings menu** | Mute toggle, theme select, grid size |

---

## 6. Difficulty Curve

### Nguyên tắc
- **Bắt đầu chậm** để player làm quen (tick rate vừa phải)
- **Tăng dần** theo thời gian / số food đã ăn
- **Có ceiling** — không tăng vô hạn (tránh impossible state)

### Speed Progression (MVP)
```
Base tick interval: 150ms (≈6.67 moves/sec)
Mỗi food ăn: tick giảm 2ms
Tick floor (tối thiểu): 70ms (≈14.3 moves/sec)
→ Đạt max speed sau (150-70)/2 = 40 food
```

Công thức:
```
tick = max(70, 150 - foodEaten * 2)
```

| Food eaten | Tick (ms) | Moves/sec | Cảm giác |
|---|---|---|---|
| 0 | 150 | 6.7 | Chill, làm quen |
| 10 | 130 | 7.7 | Hơi nhanh |
| 20 | 110 | 9.1 | Nhanh |
| 30 | 90 | 11.1 | Rất nhanh |
| 40+ | 70 | 14.3 | Max speed — intense |

> _BA sẽ refine chi tiết formula trong docs/mechanics.md. Đây là baseline để thỏa thuận._

---

## 7. Viral Hooks

### Chiến lược: "Make it screenshot-worthy"

Game phải đẹp + có cảm xúc đủ mạnh để player tự nhiên muốn share.

### Hook 1: High Score Challenge (P0)
- Mỗi Game Over hiển thị **score + best score** nổi bật
- Khi phá kỷ lục: hiệu ứng **"NEW BEST!"** glow + SFX đặc biệt
- Player khoe bạn bè: "Tui được 230 điểm, hơn tui thử xem"
- **MVP đã có** (localStorage high score)

### Hook 2: Share Screenshot (P1)
- Nút **"Share"** trên màn Game Over
- Chụp canvas hiện tại (toCanvas → toDataURL) → Web Share API (mobile) hoặc download PNG
- Screenshot include: game logo, score, best, "Can you beat me?"
- Watermark nhỏ "snake-neon" ở góc

### Hook 3: Aesthetic Flex (P0)
- Neon glow + particle effects nhìn đẹp trong screenshot
- Background dark → contrast cao → screenshot nổi bật khi share
- Color themes (P1) tạo FOMO: "Theo tui đến level X để unlock theme Cyan"

### Hook 4: "One More Try" Loop (P0)
- Game Over → tap → chơi lại ngay (≤ 0.5s transition)
- Không loading, không menu phức tạp
- Mỗi phiên ngắn (30s–2min) → dễ nói "thêm 1 lần nữa"

---

## 8. Art Direction

### Color Palette
| Element | Color | Hex |
|---|---|---|
| Background | Near-black | `#0a0a0f` |
| Snake | Neon green | `#00ff88` |
| Snake head (slightly brighter) | Electric green | `#33ffaa` |
| Food | Neon pink | `#ff006e` |
| Grid lines (subtle) | Dark slate | `#1a1a2e` |
| Score text | Cyan | `#00d9ff` |
| Accent (UI highlights) | Yellow | `#ffee00` |

### Visual Style
- **Pixel art meets neon glow**: Snake là block rectangles (pixel feel) nhưng có glow radius
- **Glow**: `drawingContext.shadowBlur = 15; shadowColor = snakeColor`
- **Food**: nhỏ hơn snake segment một chút, pulse animation (scale 0.8 → 1.2)
- **Grid**: visible nhưng mờ, tạo retro feel mà không distract
- **Background**: solid dark, có thể có subtle gradient (P1)

---

## 9. Audio Design

### SFX (P0)
| Event | Sound | Vibe |
|---|---|---|
| Eat food | Square wave "blip" (~800Hz, 50ms) | Retro 8-bit |
| Death | Descending square wave sweep (~400Hz → 100Hz, 300ms) | Game over feel |
| New high score (P1) | Ascending arpeggio | Victory |

### Background Music (P0)
- Chiptune melody loop, ~15–30 giây, loop vô hạn
- Square/triangle wave, BPM ~120
- Mutable (mute button ở góc)
- Volume thấp (~30%) để không che SFX

### Audio Tech
- p5.sound oscillator (square wave) cho SFX — generate runtime, không cần file
- Background melody: array of notes → sequenced oscillators
- Hoặc embed small chiptune file (mp3/ogg) nếu melody phức tạp

---

## 10. UI / UX Flow

### Menu Screen
```
┌─────────────────────────────┐
│                             │
│        S N A K E            │
│          NEON               │
│      (neon glow title)      │
│                             │
│      ▶ TAP TO PLAY          │
│                             │
│      Best: 150              │
│                             │
│   [♪ music on/off]          │
│                             │
└─────────────────────────────┘
```

### Playing Screen
```
┌─────────────────────────────┐
│ Score: 040      Best: 150   │
├─────────────────────────────┤
│                             │
│   • • •                     │
│   • • •     ●               │
│   • • • •                   │
│         •                   │
│                             │
├─────────────────────────────┤
│  (swipe area — no UI)       │
└─────────────────────────────┘
```

### Game Over Screen
```
┌─────────────────────────────┐
│                             │
│       G A M E   O V E R     │
│                             │
│        Score: 230           │
│        Best:  150           │
│                             │
│     ★ NEW BEST! ★           │
│                             │
│      ▶ TAP TO RETRY         │
│                             │
│      [📤 Share]             │
│                             │
└─────────────────────┘
```

---

## 11. Game Balance Notes

### Grid Size (MVP recommendation)
- **20×20** grid trên mobile portrait (cell ~16–20px)
- Responsive: scale grid cell to fit viewport, keep grid count constant
- Lý do: đủ lớn để chiến lược, đủ nhỏ để session ngắn

### Starting conditions
- Snake dài 3 segments ở giữa grid
- Hướng ban đầu: phải (→)
- Food spawn: random cell không trùng snake body, ưu tiên xa snake

### Anti-frustration
- **Không** spawn food ở ô mà snake không thể đến (MVP: random là đủ, grid nhỏ)
- **Không** tăng speed đột ngột (curve tuyến tính, không step function)
- First food eat luôn dễ tiếp cận (spawn không quá xa)

---

## 12. Accessibility

- **Colorblind**: Neon green + pink on dark = high contrast, phân biệt được đa số type
- **Audio cues**: SFX bổ trợ visual, không bắt buộc (mute vẫn chơi được)
- **One-finger**: Toàn bộ game playable với 1 ngón (swipe)
- **No flashing**: Không flash nhanh hơn 3Hz (photosensitivity safe)

---

_End of Game Design Document_
