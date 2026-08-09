# PRD — Snake Neon

> **Product Requirements Document**
> Version: 1.0 | Owner: PM | Date: 2026-08-08
> Status: Approved for MVP

---

## 1. Tóm tắt sản phẩm (Executive Summary)

**Snake Neon** là game arcade retro-modern tái hiện kinh điển Snake (đỉnh cao 2000s) với
bộ mỹ học neon glow, chiptune remix, và particle effects — tất cả chạy trên web browser,
chơi được ngay bằng 1 ngón tay trên mobile.

Mục tiêu: **Prototype chơi được nhanh nhất có thể**, đẹp mắt ngay từ giây đầu tiên, đủ
viral để người chơi muốn share screenshot/high score cho bạn bè.

---

## 2. Vấn đề & Cơ hội

### Bối cảnh
- Game Snake cổ điển vẫn có sức hút (Nokia nostalgia, Google Snake, .io snake games)
- Tuy nhiên đa số clone hiện tại: xấu, chậm, không mobile-friendly, hoặc quá phức tạp
- Khoảng trống: **một game Snake ĐẸP, NHANH, 1-cú-chạm, có âm thanh thỏa mãn**

### Target audience
- **Casual gamers** 15–40 tuổi, chơi game trên điện thoại lúc rảnh
- **Retro enthusiasts** thích pixel art + chiptune
- **Social sharers** thích khoe điểm cao

### Value proposition
> "Cảm giác Snake năm 2000 — nhìn như 2026, chơi bằng 1 ngón."

---

## 3. Nguyên tắc thiết kế

| Nguyên tắc | Ý nghĩa thực tế |
|---|---|
| **YAGNI** | Chỉ build đúng feature cần cho core loop. Không accounts, không backend, không settings menu phức tạp. |
| **KISS** | 1 cú vuốt để chơi. Không tutorial dài. Learn trong 3 giây. |
| **DRY** | Code đơn giản, tái dụng. Không over-engineer pattern. |
| **Mobile-first** | Thiết kế cho điện thoại trước, desktop là bonus. |
| **Aesthetic-first** | Neon glow + particles + sound = cảm giác thỏa mãn khi ăn điểm. Đây là USP. |

---

## 4. MVP Scope (P0)

### Trong scope (MUST HAVE)
1. **Core gameplay**: Snake di chuyển 4 hướng trên grid, ăn food, dài ra, chết khi va wall/self
2. **Controls**: Vuốt (swipe) trên mobile + phím mũi tên trên desktop
3. **Scoring**: Điểm đếm khi ăn food, high score lưu bằng localStorage
4. **Game states**: Menu → Playing → Game Over (→ Restart)
5. **Neon aesthetic**: Dark background, snake neon glow, food glow, particle burst khi ăn
6. **Audio**: SFX khi ăn / chết + chiptune background melody (mutable)
7. **Responsive**: Chơi được trên mobile portrait + desktop landscape

### Ngoài scope (WON'T HAVE — MVP)
- ❌ Backend server / database
- ❌ User accounts / login
- ❌ Multiplayer
- ❌ Leaderboard online
- ❌ Ads / monetization
- ❌ Power-ups / items
- ❌ Multiple game modes (classic only)
- ❌ Achievements / badges

### Sau MVP (P1 — Should Have)
- CRT scanline overlay effect
- On-screen D-pad (cho mobile users không quen swipe)
- Pause functionality
- Share high score screenshot
- Multiple color themes (unlock theo điểm cao)

### Tương lai (P2 — Could Have)
- Power-ups (speed boost, ghost mode, score multiplier)
- Level/wave system
- Sound on/off toggle improvements
- PWA (installable, offline)

---

## 5. Success Metrics (MVP)

### Mục tiêu định lượng
| Metric | Target | Đo lường |
|---|---|---|
| **First playable build** | ≤ 1 dev-day | Từ khi dev bắt đầu code đến khi có demo chạy |
| **Load time** | < 1 giây | Lighthouse / manual check |
| **Frame rate** | 60fps ổn định | Trên mobile browser phổ thông |
| **First-game-start** | ≤ 2 cú chạm từ load page | Load → tap Play → chơi |
| **"Wow" moment** | Particle + sound + glow khi ăn food đầu tiên | Nhận xét chủ quan, demo cho 3 người |

### Mục tiêu định tính
- Nhìn vào màn hình → muốn chạm ngay (visual appeal)
- Ăn food → nghe + thấy → muốn ăn tiếp (juice/feedback loop)
- Chết → "one more try" (addictive loop)
- Share screenshot high score tự nhiên

---

## 6. Ràng buộc & Giả định

### Ràng buộc
- **Tech**: Pure HTML/CSS/JS + p5.js, không build step, không backend
- **Hosting**: Static hosting (GitHub Pages / Netlify / Vercel)
- **Platform**: Web browser, tối ưu mobile (iOS Safari, Android Chrome)
- **Performance**: 60fps trên thiết bị tầm trung

### Giả định
- Người chơi có internet để load p5.js (CDN)
- localStorage hoạt động (fallback: không lưu high score)
- Không cần hỗ trợ legacy browser (IE/old Edge)

---

## 7. Stakeholders & Dependencies

| Role | Trách nhiệm | Task ID |
|---|---|---|
| **PM** (tôi) | PRD, Game Design, User Stories | t_db81f581 |
| **BA** | Game Mechanics, Difficulty, Scoring | t_615edd56 |
| **Architect** | Tech Design, File structure, Performance | t_c7822c75 |
| **Dev** | Implement game code | (chờ Architect) |

### Dependencies
- Architect cần đọc output của PM + BA trước khi thiết kế
- Dev cần đọc tất cả docs trước khi code

---

## 8. Roadmap (High-level)

| Phase | Nội dung | Thời gian |
|---|---|---|
| **Phase 0 — Design** | PRD + Game Design + Mechanics + Architecture | Hiện tại |
| **Phase 1 — MVP (P0)** | Core loop, neon aesthetic, audio, responsive | 1–2 ngày dev |
| **Phase 2 — Polish (P1)** | Scanlines, share, themes, D-pad | Sau MVP |
| **Phase 3 — Enhance (P2)** | Power-ups, levels, PWA | Nâng cấp |

---

## 9. Risks & Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| Performance trên mobile kém | Cao | pixelDensity(1), disable FES, tối ưu particle count |
| p5.js glow shadowBlur đắt (CPU) | Trung bình | Giới hạn shadowBlur, cache canvas nếu cần |
| Audio không auto-play (browser policy) | Thấp | Yêu cầu user tap Play trước (đã là flow tự nhiên) |
| Swipe detection không mượt | Cao | Threshold tuning, test trên nhiều thiết bị |

---

## 10. Open Questions (gợi ý cho Sếp)

1. **Game name**: "Snake Neon" là tên chính thức, hay cần brainstorm thêm?
2. **Color scheme**: Default neon green snake, hay muốn theme khác (cyan/pink)?
3. **Wrapping mode**: Classic (va wall = chết) hay modern (wall = wraparound)?
   - MVP recommendation: Classic (va wall = chết) — đúng tinh thần retro
4. **Grid size**: Cố định (vd 20×20) hay responsive theo viewport?

> _Các câu hỏi này không block MVP. Nếu không có input, default sẽ áp dụng như đã note._

---

_End of PRD_
