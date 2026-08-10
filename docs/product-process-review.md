# Snake Neon — Product & Process Review toàn diện

> **Task:** t_8401b055 | **PM:** Goku | **Date:** 2026-08-09
> **Scope:** Sản phẩm (spec compliance, UX, feature gap) + Quy trình team (kanban data)
> **Nguồn dữ liệu:** code `index.html` (1523 dòng), 15 docs, kanban DB (28 tasks, 16 runs)

---

## TÓM TẮT CHO SẾP (TL;DR)

**Sản phẩm:** Core MVP hoạt động đúng spec, nhưng đã bị "scope creep" nghiêm trọng. PRD ban đầu là game Snake đơn giản, nhưng code đã phình lên thêm Territory Expansion (grid phình 17→41), Spike Walls, 100 variants, Virtual Joystick V1, rồi Mobile Controls V2 (tap zone + gamepad) — **tất cả xảy ra trước khi MVP gốc được ship ổn định**.

**Quy trình:** 3 vấn đề cấu trúc:
1. **Frontend crash liên tục** (8/10 runs crashed) — agent không gọi `kanban_complete`, nhiều lần silent exit.
2. **Scope creep không kiểm soát** — feature mới liên tục được add trước khi feature cũ ship ổn.
3. **2 task Frontend đang blocked** (Spike Walls, Mobile V2) — game hiện tại stuck giữa nhiều bản thiết kế chồng chéo.

**Đánh giá tổng:** Đội **chưa đạt Middle** — quy trình còn nát, nhưng thái độ tự cải thiện tốt (post-mortem, framework, escalation protocol đều tự tạo).

---

## PHẦN A: REVIEW SẢN PHẨM

### A1. Spec Compliance — Code có đúng spec không?

| Spec gốc (PRD/Mechanics) | Code thực tế | Đánh giá |
|---|---|---|
| Grid **17×17 cố định** | `INITIAL_COLS=17` nhưng `MAX_COLS=41` + `expandGrid()` phình mỗi food | ⚠️ **Sai spec** — territory expansion không có trong PRD gốc |
| Tick **150→60ms, −3ms/food** | `INITIAL_TICK=150, MIN_TICK=60, STEP_REDUCTION=3` | ✅ Đúng |
| Base points **10/food** | `BASE_POINTS=10` | ✅ Đúng |
| Combo system (P1) | **Không implement** | ✅ Đúng (P1, chưa cần) |
| Swipe controls | Đã **thay 3 lần**: swipe → joystick V1 → tap zone V2 + gamepad | ⚠️ Quá nhiễu, chưa ổn định |
| D-pad (P1 — Should Have) | Đã implement landscape gamepad D-pad | ✅ Đúng (push lên sớm) |
| Spike Walls | Đã implement `renderSpikeWalls()` | ⚠️ Thêm feature không có trong PRD |
| Neon aesthetic (glow, particles) | `drawWithGlow()`, 50 particles pool, screen flash | ✅ Đúng, đẹp |
| Audio (eat/death SFX + chiptune) | `playEatSFX()`, `playDeathSFX()`, MELODY array 16 notes | ✅ Đúng |
| High score localStorage | `snake_neon_highscore` | ✅ Đúng |
| Pause | Topbar button + Space/P/Esc + auto-pause tab blur | ✅ Đúng |

**Verdict spec compliance:** Core game loop chính xác. Nhưng **2 feature "vượt ngoài" PRD** (territory expansion + spike walls) bị thêm vào mà PRD chưa update → spec và code lệch nhau.

### A2. UX Review — Chơi có tốt không?

**Vấn đề UX đã biết (từ feedback Sếp):**
1. Mobile controls đã iterate 3 lần (swipe → joystick → tap zone + gamepad). **Vẫn chưa ổn định** — task `t_0b1dc64b` (fix touch portrait) đang running.
2. Test portrait touch (`test_touch.js`) báo **1/4 zones pass** — game không start, touch chỉ trả RIGHT (default).

**Đánh giá UX hiện tại:**
- **Desktop (keyboard):** ✅ Tốt. Arrow/WASD, Space/P/Esc, mượt.
- **Mobile Landscape (gamepad):** ✅ Layout 3 cột hợp lý, D-pad + Start button, neon style.
- **Mobile Portrait (tap zone):** 🔴 **Broken** — tap không đổi hướng rắn, game không start qua touch. Đây là bug nghiêm trọng nhất.
- **Joystick V1 (floating):** Vẫn còn code (`renderJoystick()`, `joystick` state) nhưng đã bị V2 override → **dead code** gây nhầm lẫn.

**UX gaps (thiếu):**
- Không có mute button UI (chỉ phím M) — spec có nhưng code không render button
- Không có visual hint cho người mới (tap zone vô hình, không biết tap vùng nào)
- Food spawn không check "3 ô phía trước head" (BR §1.3.3) — `spawnFood()` chỉ check occupied, food có thể spawn ngay trước mặt rắn

### A3. Feature Gap — Còn thiếu gì?

**P0 còn thiếu:**
- Không có

**P1 chưa làm:**
- ❌ CRT scanline overlay
- ❌ Share screenshot
- ❌ Color themes
- ❌ Combo system (cả spec + code)
- ❌ Mute button UI (chỉ keyboard)

**P2 chưa làm (đúng, không cần):**
- ❌ Power-ups, level system, PWA

### A4. Sản phẩm đang bị "Frankenstein" — quá nhiều bản thiết kế chồng nhau

**Vấn đề cấu trúc lớn nhất:** `index.html` (1523 dòng, gấp đôi ước tính architecture ~800 dòng) chứa:
- Joystick V1 logic (dead code, bị V2 override)
- Tap zone V2 logic (portrait)
- Gamepad V2 logic (landscape)
- Spike walls
- Territory expansion
- Mỗi layer thêm vào mà không clean up layer cũ

→ **Code debt cao.** Architecture doc §2 đã cảnh báo: "Khi file vượt ~1500 dòng → tách module." Đã vượt. Chưa tách.

---

## PHẦN B: REVIEW GAME MECHANICS (BA scope)

### B1. Rules Consistency

| Rule (mechanics.md) | Code | Consistent? |
|---|---|---|
| BR-02: Không quay 180° | `setDirection()` check `-compareDir` | ✅ |
| BR-03: Buffer depth 1, ghi đè | `nextDirection` single var | ✅ |
| BR-04: Food spawn ô trống | `spawnFood()` lọc occupied | ✅ |
| BR-06: Growth trong tick ăn | `snakeTick()` unshift + skip pop | ✅ |
| BR-08: Self collision loại tail (trừ khi ăn) | `checkCollision(willEat ? body : body.slice(0,-1))` | ✅ Rất đúng |
| BR-09: Combo reset >3s | **Không implement** (combo chưa làm) | ✅ (P1) |
| BR-11a: Speed cap 60ms | `MIN_TICK=60` | ✅ |
| BR-12: Combo decay đóng băng khi pause | N/A (chưa có combo) | ✅ |

**Verdict mechanics:** Logic core **chính xác và consistent**. BA spec tốt, dev implement đúng. Điểm sáng của dự án.

### B2. Territory Expansion — mechanic sai spec gốc

`expandGrid()` phình grid +1 mỗi food đến 41×41. Điều này **thay đổi game balance hoàn toàn**:
- Spec gốc: 17×17 cố định, snake dài = chật board = khó hơn
- Thực tế: board phình theo snake → game không bao giờ chật → mất difficulty curve

→ **Cần BA re-balance** hoặc revert territory expansion. Đây là scope creep phá game design.

---

## PHẦN C: REVIEW QUY TRÌNH TEAM

### C1. Data thực tế (kanban DB)

**28 tasks tổng:**
- Done: 16 | Running: 4 | Blocked: 2 | Todo: 2 | Archived: 2 | (2 trùng)

**Run outcomes theo role:**

| Role | Completed | Crashed | Other | Reliability |
|---|---|---|---|---|
| PM | 6 | 1 | 2 (running/reclaimed) | 86% |
| BA | 2 | 0 | 1 (reclaimed) | 100% |
| Architect | 2 | 1 | 0 | 67% |
| Backend | 1 | 1 | 0 | 50% |
| Frontend | 2 | 8 | 4 (blocked/running) | 20% |
| QA | 3 | 8 | 1 (running) | 27% |

**RED FLAGS:**
- 🔴 **Frontend: 80% crash** — "worker exited cleanly without calling kanban_complete"
- 🔴 **QA: 73% crash** — cùng pattern
- 🟡 Architect: 33% crash (1 lần)

### C2. Vấn đề quy trình cấu trúc

**Vấn đề 1: Agent crash = silent failure**
8/10 runs frontend exit rc=0 mà không complete → task stuck `running` → dispatcher reclaim → crash lại → loop. Nguyên nhân: agent hết context/token hoặc bug trong worker, không phải lỗi nghiệp vụ.

**Vấn đề 2: Scope creep không kiểm soát**
Timeline tasks:
```
MVP build (t_4f5d9b4e) → done
Mobile UX Redesign V1 (t_9387fcbe) → done
Mobile UX Implement V1 (t_61a05544) → done (146 phút!)
QA V1 (t_61d8a6a1) → done
Spike Walls + Territory spec (t_3ab1b90f) → done
Spike Walls Implement (t_6b434f6d) → BLOCKED
Mobile V2 spec (t_9ce67b69) → done
Mobile V2 Implement (t_bb7ae6a0) → BLOCKED
Touch fix (t_0b1dc64b) → RUNNING
```
→ **3 lần redesign controls trong 1 ngày.** Chưa xong V1 đã spec V2. Chưa xong V2 đã fix bug V2. Không có giai đoạn "stabilize".

**Vấn đề 3: 2 task blocked, không unblock**
`t_6b434f6d` (Spike Walls) và `t_bb7ae6a0` (Mobile V2) đều blocked. QA đã report pass (headless) nhưng sếp test thật thấy bug → blocked chờ fix. Đây chính là root cause post-mortem `t_c14d3020`: **headless test không trung thực**.

**Vấn đề 4: Cycle time bất thường**
- QA `t_f1cc1b91`: 455 phút (7.5 giờ!) — quá lâu cho 1 test task
- Frontend `t_61a05544`: 146 phút — có thể do crash + reclaim
- BA/PM: 0.6–6.5 phút — bình thường

### C3. Điểm tích cực

- ✅ BA spec chất lượng cao (mechanics.md 545 dòng, consistent, traceable)
- ✅ PM tự tạo escalation-protocol.md, performance-framework.md, qa-process-review.md — **initiative tốt**
- ✅ Post-mortem bug miss được làm nghiêm túc (root cause + action items)
- ✅ Task chain dependencies đúng (parent → child link rõ ràng)
- ✅ Core game code đúng spec, architecture hợp lý

### C4. Đánh giá từng role

| Role | Điểm mạnh | Điểm yếu | Cấp (đề xuất) |
|---|---|---|---|
| PM | Initiative cao, viết doc tốt, tự post-mortem | Spec drift (không update PRD khi thêm feature) | Middle (70) |
| BA | Spec chính xác, consistent, đúng scope | Territory expansion chưa re-balance | Senior (82) |
| Architect | Design gọn, đúng tech choice | 1 crash, không enforce module split | Middle (72) |
| Backend | Variant generator xong | 1 crash, ít task | Middle (68) |
| Frontend | Code đúng spec khi chạy | 80% crash, không stabilize, scope creep | Junior (45) |
| QA | Viết test kỹ, report chi tiết | Headless-only, không trung thực, 73% crash | Junior (48) |

---

## PHẦN D: ĐỀ XUẤT CẢI THIỆN

### D1. Ưu tiên khẩn cấp (Must — tuần này)

1. **Stabilize mobile controls** — Chọn 1 control scheme (V2 tap zone + gamepad), fix bug touch portrait, **ngừng thêm feature mới** cho đến khi V2 ship ổn trên device thật.

2. **Frontend crash investigation** — Agent exit rc=0 không complete = context overflow hoặc worker bug. Cần check: max token, model config, hoặc chunk task nhỏ hơn.

3. **Manual smoke test bắt buộc** — Theo post-mortem §5, không ship feature chạm input/controls mà không có người chơi 30s trên device thật.

### D2. Ưu tiên cao (Should — tuần sau)

4. **Update PRD** — Sync PRD với code thực tế (thêm territory expansion, spike walls vào scope, hoặc revert).

5. **Code cleanup** — Xóa joystick V1 dead code, tách module khi >1500 dòng.

6. **BA re-balance territory expansion** — Grid phình 17→41 phá difficulty curve. Cần re-tune hoặc giới hạn.

### D3. Ưu tiên thấp (Could — khi rảnh)

7. Mute button UI
8. Combo system (P1)
9. Food spawn anti-frustration (3 ô phía trước head)

---

## PHẦN E: TASK CẢI THIỆN ĐỀ XUẤT TẠO

Tôi sẽ tạo các task sau (giao đúng specialist):

1. **QA: Smoke checklist + regression index.html** —固化 post-mortem action items
2. **BA: Re-balance territory expansion** — fix game balance
3. **Frontend: Stabilize V2 controls + cleanup dead code** — trước khi thêm gì mới

(Không tạo task cho crash investigation vì đó là infra problem, cần CEO/Sếp quyết.)

---

_Goku (PM) — 2026-08-09_
