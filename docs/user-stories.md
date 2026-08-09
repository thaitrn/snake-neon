# User Stories — Snake Neon MVP

> Version: 1.0 | Date: 2026-08-08 | Owner: PM  
> Format: US-{số} — As a {persona}, I want {action}, so that {value}  
> Priority: P0 (MVP) / P1 (Polish) / P2 (Future)

---

## Persona
- **Casual Player** — Người chơi giải trí nhanh, mobile-first
- **Desktop Player** — Chơi trên máy tính, dùng keyboard

---

## Epic 1: Core Gameplay

### US-01: Khởi động game
**As a** casual player,  
**I want** mở trang web và thấy game sẵn sàng chơi,  
**So that** tôi không phải chờ đợi hay cài đặt.  
**Priority:** P0

**Acceptance Criteria:**
- [ ] Trang load xong trong < 2 giây trên 3G
- [ ] Hiển thị title screen với logo "SNAKE NEON" glow
- [ ] Hiển thị nút "TAP TO PLAY" rõ ràng
- [ ] Hiển thị best score hiện tại (nếu có)
- [ ] Không cần đăng nhập hay bất kỳ thao tác nào trước khi chơi

---

### US-02: Điều khiển rắn bằng vuốt (swipe)
**As a** mobile player,  
**I want** vuốt ngón tay trên màn hình để đổi hướng rắn,  
**So that** tôi có thể chơi bằng 1 ngón tay thoải mái.  
**Priority:** P0

**Acceptance Criteria:**
- [ ] Vuốt lên/xuống/trái/phải đổi hướng rắn tương ứng
- [ ] Vuốt threshold tối thiểu 30px (tap nhẹ không trigger)
- [ ] Input lag < 50ms từ vuốt đến rắn đổi hướng
- [ ] Vuốt không gây scroll/drag trang (preventDefault)
- [ ] Không thể vuốt ngược 180° (đang đi phải không thể vuốt trái)

---

### US-03: Điều khiển rắn bằng keyboard
**As a** desktop player,  
**I want** dùng phím mũi tên hoặc WASD để điều khiển rắn,  
**So that** tôi có thể chơi trên máy tính.  
**Priority:** P0

**Acceptance Criteria:**
- [ ] Phím ↑↓←→ đổi hướng rắn
- [ ] Phím WASD cũng đổi hướng (tuỳ chọn)
- [ ] Phím Space bắt đầu game / chơi lại từ Game Over
- [ ] Không thể đi ngược 180°
- [ ] Key repeat không spam input (chỉ register keydown đầu tiên)

---

### US-04: Rắn ăn mồi và dài ra
**As a** player,  
**I want** rắn tự động ăn mồi khi đi qua và dài ra,  
**So that** game có tiến triển và thử thách tăng dần.  
**Priority:** P0

**Acceptance Criteria:**
- [ ] Khi đầu rắn đi vào ô có mồi → ăn tự động
- [ ] Rắn dài thêm 1 segment sau mỗi lần ăn
- [ ] Mồi mới spawn ngay tại ô trống ngẫu nhiên (không trùng thân rắn)
- [ ] Tốc độ di chuyển tăng nhẹ (theo difficulty curve)
- [ ] Particle burst 6-8 hạt neon tại vị trí mồi khi ăn
- [ ] Âm thanh "blip" phát khi ăn
- [ ] Score popup "+10" hiện rồi fade

---

### US-05: Va chạm tường
**As a** player,  
**I want** rắn chết khi đâm vào tường,  
**So that** game có rủi ro và thử thách rõ ràng.  
**Priority:** P0

**Acceptance Criteria:**
- [ ] Đầu rắn chạm biên grid → Game Over
- [ ] Chỉ đầu rắn mới trigger va chạm (thân chạm tường không tính)
- [ ] Phát hiện va chạm chính xác 100%, không có "ghost pass"

---

### US-06: Va chạm thân
**As a** player,  
**I want** rắn chết khi đâm vào chính mình,  
**So that** càng dài càng khó, tạo depth.  
**Priority:** P0

**Acceptance Criteria:**
- [ ] Đầu rắn chạm bất kỳ segment thân → Game Over
- [ ] Phát hiện chính xác trên grid (không sai số)
- [ ] Rắn dài 3 ban đầu → không tự va chạm khi spawn

---

## Epic 2: Scoring & Progression

### US-07: Hiển thị điểm real-time
**As a** player,  
**I want** thấy điểm số của mình liên tục trên màn hình,  
**So that** tôi biết mình đang làm tốt đến đâu.  
**Priority:** P0

**Acceptance Criteria:**
- [ ] Score hiển thị ở góc trên, font neon cyan
- [ ] Cập nhật ngay khi ăn mồi (+10)
- [ ] Không che khuất gameplay area
- [ ] Format số dễ đọc (không tràn trên mobile)

---

### US-08: Lưu high score
**As a** player,  
**I want** best score của tôi được lưu lại,  
**So that** tôi có mục tiêu phá kỷ lục.  
**Priority:** P0

**Acceptance Criteria:**
- [ ] High score lưu trong localStorage (key: `snake_neon_best`)
- [ ] Hiển thị trên title screen
- [ ] Hiển thị trên game over screen
- [ ] Nếu score mới > best → cập nhật best + thông báo "NEW BEST!"
- [ ] Persist khi tắt và mở lại browser

---

### US-09: Tốc độ tăng dần (difficulty ramp)
**As a** player,  
**I want** game nhanh dần khi tôi ăn được nhiều mồi,  
**So that** game không bị nhàm chán khi rắn dài.  
**Priority:** P0

**Acceptance Criteria:**
- [ ] Tốc độ ban đầu: ~150ms/tick (6.7 moves/sec)
- [ ] Mỗi mồi: tick giảm 2ms
- [ ] Tốc độ tối thiểu (floor): 70ms (14.3 moves/sec)
- [ ] Không tăng đột ngột (curve tuyến tính)
- [ ] Tốc độ hiện tại không hiển thị (player cảm nhận)

---

## Epic 3: Game States & Flow

### US-10: Title screen
**As a** player,  
**I want** một màn hình chào đẹp mắt,  
**So that** tôi có ấn tượng đầu tiên tốt về game.  
**Priority:** P0

**Acceptance Criteria:**
- [ ] Hiển thị logo "SNAKE NEON" với neon glow
- [ ] Nút "TAP TO PLAY" (hoặc "PRESS ENTER" trên desktop)
- [ ] Hiển thị best score
- [ ] Nút mute/unmute (icon 🔊/🔇)
- [ ] Tap/Enter → transition sang gameplay (< 0.5s)

---

### US-11: Game Over screen
**As a** player,  
**I want** thấy kết quả khi chết,  
**So that** tôi biết điểm số và quyết định chơi lại.  
**Priority:** P0

**Acceptance Criteria:**
- [ ] Hiển thị "GAME OVER" rõ ràng
- [ ] Hiển thị score vừa đạt
- [ ] Hiển thị best score
- [ ] Nếu phá kỷ lục → "★ NEW BEST! ★" glow
- [ ] Nút "TAP TO RETRY" (1 tap → chơi lại ngay)
- [ ] Transition vào game over có animation (snake flash đỏ + screen shake)
- [ ] (P1) Nút Share

---

### US-12: Pause game
**As a** player,  
**I want** tạm dừng game khi cần,  
**So that** tôi có thể xử lý việc khác rồi quay lại.  
**Priority:** P1

**Acceptance Criteria:**
- [ ] Phím Space/P hoặc tap 2 ngón → pause
- [ ] Overlay "PAUSED" hiển thị trên canvas
- [ ] Tap/phím lại → resume
- [ ] Tự động pause khi tab browser mất focus (visibilitychange)
- [ ] Game state khi pause không thay đổi (rắn đứng yên, score giữ nguyên)

---

### US-13: Restart nhanh
**As a** player,  
**I want** chơi lại ngay lập tức sau khi chết,  
**So that** tôi duy trì được "flow" và không bị ngắt.  
**Priority:** P0

**Acceptance Criteria:**
- [ ] Game Over → tap/Space → new game bắt đầu trong < 0.5 giây
- [ ] Rắn reset về trạng thái ban đầu (3 segments, giữa grid)
- [ ] Score reset = 0
- [ ] Mồi spawn mới
- [ ] Tốc độ reset về ban đầu

---

## Epic 4: Visual & Audio

### US-14: Neon visual style
**As a** player,  
**I want** game có phong cách neon glow đẹp mắt,  
**So that** trải nghiệm có cảm giác retro-modern ấn tượng.  
**Priority:** P0

**Acceptance Criteria:**
- [ ] Background: dark near-black (#0a0a0f)
- [ ] Snake: neon green với glow effect (shadowBlur)
- [ ] Food: neon pink với pulse animation
- [ ] Grid lines: subtle, dark slate, không distract
- [ ] Score text: neon cyan
- [ ] Mọi element render mượt ở 60fps

---

### US-15: Particle effects
**As a** player,  
**I want** thấy particle khi ăn mồi và khi chết,  
**So that** game có cảm giác "juicy" và thỏa mãn.  
**Priority:** P0

**Acceptance Criteria:**
- [ ] Ăn mồi: 6-8 particle tỏa ra từ vị trí mồi, fade out trong 300ms
- [ ] Game over: particle scatter từ toàn thân rắn
- [ ] Particles dùng cùng palette neon (không random màu lệch tone)
- [ ] Particles không lag game (efficient rendering)

---

### US-16: Sound effects
**As a** player,  
**I want** nghe âm thanh khi ăn mồi và khi chết,  
**So that** phản hồi đa giác giác quan tăng immersion.  
**Priority:** P0

**Acceptance Criteria:**
- [ ] Ăn mồi: square wave "blip" (~800Hz, 50ms)
- [ ] Death: descending sweep (~400Hz → 100Hz, 300ms)
- [ ] Âm thanh generate runtime qua WebAudio (không file tải thêm)
- [ ] Nút mute toggle rõ ràng
- [ ] Trạng thái mute lưu trong localStorage

---

### US-17: Background music
**As a** player,  
**I want** có nhạc nền chiptune,  
**So that** game có không khí retro arcade.  
**Priority:** P0

**Acceptance Criteria:**
- [ ] Chiptune melody loop, 15-30 giây, loop vô hạn
- [ ] Square/triangle wave, BPM ~120
- [ ] Volume thấp (~30%), không che SFX
- [ ] Mute cùng với SFX (1 nút toggle all)
- [ ] Chỉ bắt đầu play sau user interaction (browser autoplay policy)

---

### US-18: Responsive mobile layout
**As a** mobile player,  
**I want** game hiển thị đẹp trên điện thoại,  
**So that** tôi có thể chơi mọi lúc mọi nơi.  
**Priority:** P0

**Acceptance Criteria:**
- [ ] Canvas fit full viewport trên mobile portrait
- [ ] Grid cell tự scale theo kích thước màn hình
- [ ] Touch area = toàn bộ canvas (không deadzone)
- [ ] Không zoom/scroll/vibrate page khi vuốt
- [ ] Hỗ trợ landscape (canvas rotate hoặc scale)
- [ ] Meta viewport tag đúng (`width=device-width, initial-scale=1`)

---

## Epic 5: Viral & Social (P1)

### US-19: Share screenshot
**As a** player,  
**I want** chia sẻ điểm số của mình lên social,  
**So that** tôi khoe với bạn bè và thách đấu.  
**Priority:** P1

**Acceptance Criteria:**
- [ ] Nút "Share" trên Game Over screen
- [ ] Tạo image chứa: logo, score, best score, "Can you beat me?"
- [ ] Mobile: Web Share API (share image trực tiếp)
- [ ] Desktop: download PNG
- [ ] Image có branding "Snake Neon" + watermark

---

### US-20: Score milestone messages
**As a** player,  
**I want** thấy lời khen/hài hước khi đạt mốc điểm,  
**So that** tôi có động lực chơi tiếp.  
**Priority:** P1

**Acceptance Criteria:**
- [ ] 50 điểm → "Not bad!"
- [ ] 100 điểm → "Getting warm 🔥"
- [ ] 200 điểm → "Snake Master!"
- [ ] 500 điểm → "LEGENDARY 🏆"
- [ ] Message hiện giữa màn hình, fade out sau 1.5 giây
- [ ] Không che gameplay quá lâu

---

## Traceability Matrix

| Story | Epic | Priority | Maps to GDD Feature |
|---|---|---|---|
| US-01 | Core | P0 | P0-7, P0-10 |
| US-02 | Core | P0 | P0-8 |
| US-03 | Core | P0 | P0-9 |
| US-04 | Core | P0 | P0-1 ~ P0-4 |
| US-05 | Core | P0 | P0-4 |
| US-06 | Core | P0 | P0-4 |
| US-07 | Scoring | P0 | P0-5 |
| US-08 | Scoring | P0 | P0-6 |
| US-09 | Scoring | P0 | (difficulty curve) |
| US-10 | States | P0 | P0-7, P0-10 |
| US-11 | States | P0 | P0-7, P0-16 |
| US-12 | States | P1 | P1-3 |
| US-13 | States | P0 | P0-16 |
| US-14 | Visual | P0 | P0-10 |
| US-15 | Visual | P0 | P0-14 |
| US-16 | Visual | P0 | P0-11, P0-12 |
| US-17 | Visual | P0 | P0-13 |
| US-18 | Visual | P0 | P0-15 |
| US-19 | Viral | P1 | P1-4 |
| US-20 | Viral | P1 | (milestone) |

---

## Definition of Done (per story)

- [ ] Code implement đầy đủ theo AC
- [ ] Test trên Chrome mobile + desktop
- [ ] Test trên Safari iOS (nếu có device)
- [ ] Không regression feature khác
- [ ] Performance ≥ 60fps trên device tầm trung
- [ ] Code review pass

---

_User Stories này là baseline cho sprint planning. BA có thể refine thêm._
