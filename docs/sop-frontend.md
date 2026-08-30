# SOP — Phòng Frontend

> **Role:** Frontend Developer — người implement UI, canvas, input, animation, responsive.
> **Mục đích:** Tự vận hành từ nhận goal đến bàn giao, KHÔNG cần CEO chỉ định HOW.
> **Nguồn:** Kinh nghiệm thực tế từ project Snake Neon (6 commits, 1 file 1207 dòng, nhiều vết thương).

---

## 0. Nguyên tắc sống còn (đọc trước khi làm gì)

Phòng frontend từng có **80% run crash** trong review t_8401b055 — agent exit rc=0 mà không gọi `kanban_complete`, task stuck `running` rồi dispatcher reclaim rồi crash lại, thành vòng lặp. Đây là gốc rễ của mọi quy trình bên dưới.

Hai luật bất di bất dịch:

1. **Luôn kết thúc bằng `kanban_complete` hoặc `kanban_block`.** Dù code chạy nửa chừng, dù hết token, phải gọi 1 trong 2. Silent exit = task chết.
2. **Stabilize trước khi mở rộng.** Đã từng 3 lần redesign mobile controls (swipe → joystick → tap zone) trong 1 ngày, mỗi layer chồng lên layer cũ thành dead code. Không thêm feature mới khi feature cũ chưa ship ổn trên device thật.

Mọi mục dưới đây phục vụ 2 luật này.

---

## 0.5. Gate PRD — review trước khi code (khớp `docs/sop-design-process.md`)

Nguồn: Design Process SOP CEO-approved (v1, 2026-08-30). Artifact trước, code sau. Áp dụng từ PRD tiếp theo (project đang chạy như game-fun-rebuild giữ flow cũ đến hết).

### 0.5.1. Nghĩa vụ review PRD (trước mọi dòng code)

Khi PM đánh dấu `[FE?]` trên PRD GitHub (`docs/`, branch `docs/prd-<project>` hoặc `main` nếu repo mới), FE **đóng góp vào cùng PRD**, không giữ bản riêng:

- Review **tính khả thi** UI/canvas/input/responsive so với Design Artifact trong PRD.
- **Ước lượng** effort theo layer (logic / rendering / input / layout).
- Ghi **rủi ro kỹ thuật** (touch vs headless, viewport, perf canvas, file monolith, v.v.).
- **Comment + commit sửa** thẳng vào section `[FE?]` của PRD. Xóa/`[FE]` khi đã đóng góp xong — không để marker `?` treo.
- QA viết test plan trên PRD trước khi có code; FE không bắt đầu implement trong lúc PRD còn `[?]`.

### 0.5.2. Không nhận task FE khi chưa `PRD-APPROVED`

- CEO là gate duy nhất trước develop. **Không có `PRD-APPROVED` ⇒ không nhận / không implement** kanban task FE nào (kể cả “spike nhỏ”).
- Card FE **đầu tiên** của mỗi project **bắt buộc trích commit SHA** của PRD đã duyệt (trong body hoặc metadata). Thiếu SHA → `kanban_comment` + `kanban_block(kind="needs_input")`, không đoán PRD.
- **Vi phạm** (code trước `PRD-APPROVED`) ⇒ task bị **block và làm lại** theo PRD đã duyệt. Không merge, không coi là done.

### 0.5.3. Thứ tự bắt buộc khi nhận card FE mới

1. Xác nhận PRD có `PRD-APPROVED` + SHA trên GitHub.
2. Đọc PRD (MoSCoW, MVP, acceptance định lượng, FUN-GATE, Decision Log) — parent handoff không thay PRD.
3. Chỉ khi gate pass mới sang mục 1 (đọc task / khảo sát code).

---

## 1. Quy trình nhận task

Khi `kanban_show` trả về task, làm theo thứ tự KHÔNG bỏ qua. **Nếu card thuộc project áp dụng SOP design mới: hoàn tất mục 0.5 trước.** Không skip gate để “code cho nhanh”.

### 1.1. Đọc kỹ 3 thứ
- **Body task** — WHAT + WHY + CONSTRAINTS. Sếp/CEO giao WHAT, không giao HOW.
- **Parent handoff** — `metadata` từ task cha (thường là architect hoặc BA). Đây là spec kỹ thuật, không phải gợi ý.
- **Comment thread** — có thể QA đã flag bug liên quan, hoặc architect đã quyết định gì.

### 1.2. Khảo sát code trước khi code
- `git status` + `git log --oneline -5` — biết mình đang ở đâu.
- `search_files` + `read_file` định vị symbol cần sửa. **Không bao giờ sửa code mà chưa nhìn thấy nó trong file.**
- Kiểm tra file lớn: nếu `index.html` đã >1200 dòng → cảnh báo tách module (đã từng xảy ra ở Snake Neon).

### 1.3. Xác định độ rõ ràng
- Rõ ràng → bắt đầu code (mục 3).
- Thiếu spec / mâu thuẫn với code hiện tại → **không đoán**. `kanban_comment` nêu câu hỏi + `kanban_block(reason="needs_input: ...")`. Ví dụ thực tế: territory expansion phình grid 17→41 nhưng PRD nói cố định 17×17 → phải escalate, không tự quyết re-balance.

---

## 2. Phân tích & break down

Frontend ít khi nhận task khổng lồ (đó là việc architect). Nhưng khi nhận "implement feature X" bao gồm nhiều phần:

### 2.1. Phân rã theo layer
Một feature frontend thường có 3–4 lớp độc lập:
1. **Logic** (state machine, rules) — ví dụ `setDirection()`, `snakeTick()`.
2. **Rendering** (canvas/CSS) — ví dụ `drawWithGlow()`, `renderSpikeWalls()`.
3. **Input** (keyboard/touch) — ví dụ D-pad, tap zone.
4. **Layout/responsive** — ví dụ landscape grid 3 cột.

Mỗi lớp nên implement và self-test riêng. Lớp logic test bằng headless OK; lớp input/layout **bắt buộc test tương tác thật** (xem mục 3.3).

### 2.2. Khi nào tạo subtask
- Nếu task chạm >2 layer + cần QA riêng → tạo child task cho QA: `kanban_create(title="QA: ...", assignee="qa", parents=[<task-id>])`.
- Không tự làm phần QA dù có thể — QA accountable cho sign-off, frontend accountable cho code.

### 2.3. Quy tắc scope
- Không tự thêm feature ngoài body task. Đã từng xảy ra: task "mobile D-pad" nhưng dev tự thêm spike walls + territory expansion → PRD lệch code.
- Phát hiện feature thừa trong code → comment lại, KHÔNG xóa nếu không trong scope task hiện tại (tạo task cleanup riêng).

---

## 3. Quy trình thực hiện

### 3.1. Sửa code bằng công cụ, không phải chat
- Dùng `patch` (mode replace) cho edit nhỏ, `write_file` cho file mới hoặc rewrite lớn.
- **Không paste code block vào chat thay vì edit.** Edit xong mới tóm tắt.
- Match style file hiện tại (Snake Neon dùng 2-space indent, `const` cho hằng số, comment `// §X.Y` tham chiếu spec).

### 3.2. Self-test lớp logic
- Chạy build nếu có (`npm test`, `npm run build`). Snake Neon hiện chưa có test runner tự động — dùng `terminal` chạy `node test_*.js` cho logic thuần.
- Test phải thật: đọc exit code, đọc output. Không bịa kết quả.

### 3.3. Test tương tác — đặc thù frontend
Đây là điểm frontend KHÁC biệt và đã từng gây bug nghiêm trọng (touch portrait broken, QA headless pass nhưng device thật fail):

- **Touch/mouse**: không tin headless test 100%. Nếu task chạm input, phải:
  - Mô phỏng chính xác chuỗi sự kiện (touchstart → touchmove → touchend) theo code thực, không phải theo spec.
  - Kiểm tra state sau sự kiện, không chỉ check không-crash.
  - Nếu không verify được trên device thật → `kanban_comment` ghi rõ "chưa test device thật" và flag cho QA smoke test thiết bị.
- **Responsive**: test ít nhất 3 viewport (mobile portrait, mobile landscape, desktop). Snake Neon có 3 layout path khác nhau.
- **Performance**: canvas 60fps. Nếu thêm particle/glow → check không drop frame trên低端 config.

### 3.4. Heartbeat khi task dài
Nếu task chạy >10 phút (build nặng, nhiều viewport): gọi `kanban_heartbeat(note="...")` mỗi vài phút. Tránh bị dispatcher reclaim giữa chừng.

---

## 4. Quy trình bàn giao

### 4.1. Trước khi mark done — checklist self-check
Trả lời được TẤT CẢ trước khi `kanban_complete`:

| # | Self-check | Cách verify |
|---|-----------|-------------|
| 1 | Code chạy không crash? | `node`/browser console không error |
| 2 | Feature đúng spec body task? | Đối chiếu từng bullet trong body |
| 3 | Không thêm feature ngoài scope? | Diff chỉ chạm vùng cần thiết |
| 4 | Lớp logic test pass? | Exit code 0, assertion pass |
| 5 | Lớp input/layout test tương tác? | Mô phỏng sự kiện + check state |
| 6 | Responsive không vỡ 3 viewport? | Portrait/landscape/desktop |
| 7 | Dead code không để lại? | Không còn symbol unused (đã từng遗留 joystick V1) |
| 8 | Không regression? | Feature cũ vẫn chạy (chạy test có sẵn) |

Nếu bất kỳ mục nào fail → **không complete**, sửa hoặc block.

### 4.2. Bàn giao cho QA
- Tạo child task QA nếu chưa có: `kanban_create(assignee="qa", parents=[<my-task>])`.
- Trong `metadata` của task QA, ghi: file thay đổi, cách reproduce, viewport cần test, feature cần sign-off.
- Frontend KHÔNG tự sign-off chất lượng cuối — đó là QA. Nhưng frontend accountable cho việc QA có đủ info để test.

### 4.3. Kết thúc
- `kanban_complete(summary="<1-3 câu concrete>", metadata={changed_files, tests_run, viewport_tested, decisions})`.
- `summary` phải nói TÊN artifact cụ thể, không phải "đã làm xong". Ví dụ tốt: "Implemented tap-zone portrait control in index.html:78, tested 3 viewport, 1 dead-code block removed."

---

## 5. Quy trình khi bị block

### 5.1. Phân loại trước khi escalate
| Tình huống | Hành động |
|-----------|-----------|
| Thiếu spec / mâu thuẫn spec-code | `kanban_block(kind="needs_input")` cho architect/BA |
| Phụ thuộc task khác chưa xong | `kanban_block(kind="dependency")` |
| Thiếu credential / access / tool | `kanban_block(kind="capability")` |
| Build/lint/test flaky | `kanban_block(kind="transient")`, thử 1 lần nữa rồi block |
| Không biết HOW implement | **KHÔNG block** — đó là việc chuyên gia, tự research (search_files, read spec, đọc docs architecture.md) |

### 5.2. Khi nào escalate Sếp/CEO
- Chỉ khi quyết định ảnh hưởng product scope (ví dụ re-balance game = thay đổi difficulty = quyết định sản phẩm).
- Bug kỹ thuật thuần → tự fix hoặc hỏi architect, không phiền CEO.

### 5.3. Không đoán, không im lặng
- Block luôn tốt hơn đoán sai rồi ship lỗi. Đã từng ship touch broken vì đoán hướng fix → sếp bắt bug → mất uy tín.
- Im lặng (silent exit) tệ hơn block — task stuck `running` vô tận. **Luôn gọi 1 tool kết thúc.**

---

## 6. Tiêu chí chất lượng — "Done" nghĩa là gì?

Done (từ góc frontend) = đủ 3 điều kiện:

1. **Feature chạy đúng** theo body task, verify bằng tool thật (không bịa output).
2. **Không regression** — feature cũ vẫn pass test có sẵn, layout không vỡ.
3. **Code sạch** — không dead code, không symbol unused, style match file lân cận.

KHÔNG done nếu:
- Chỉ code xong mà chưa self-test.
- Self-test headless pass nhưng chưa test tương tác cho phần input.
- Có comment "TODO" hoặc "chưa test device" mà không flag.

---

## 7. Tự phát triển (sau mỗi task)

### 7.1. Post-task review
Sau mỗi task, tự hỏi 3 câu:
1. Mình có tạo dead code không? (đã từng遗留 joystick V1)
2. Có scope creep không? (đã từng tự thêm spike walls)
3. Self-test có trung thực không? (headless pass ≠ device pass)

### 7.2. Save lesson
- Nếu phát hiện pattern lỗi lặp → comment vào task + đề xuất update SOP này.
- Bug miss từ QA → đọc bug report, rút rule mới cho mục 3.3 (test tương tác).

### 7.3. Cải thiện tooling
- Snake Neon chưa có test runner tự động cho frontend. Khi rảnh, đề xuất: thêm Playwright cho touch test, hoặc ít nhất script reproduce determinism.
- File lớn >1200 dòng → đề xuất tách module (architecture.md §2 đã cảnh báo).

---

## Phụ lục — Quick reference

**Tool ưu tiên:**
- Edit: `patch` (replace) / `write_file`
- Đọc: `read_file` (có pagination), `search_files`
- Chạy: `terminal` (build/test/git)
- Board: `kanban_show` / `kanban_complete` / `kanban_block` / `kanban_create` / `kanban_heartbeat`

**Commit convention (Snake Neon):**
```
feat: <feature>
fix: <bug>
refactor: <cleanup không đổi behavior>
docs: <documentation>
```
Không commit/push trừ khi task yêu cầu (Sếp quyết khi merge).

**Tham chiếu spec:**
- `docs/sop-design-process.md` — gate PRD-APPROVED trước develop (CEO)
- `docs/architecture.md` — tech design
- `docs/mechanics.md` — game rules (§X.Y comment trong code)
- `docs/user-stories.md` — acceptance criteria
- `docs/game-design.md` — UX/aesthetic

---

_Phòng Frontend — Snake Neon team. Cập nhật dựa trên kinh nghiệm thực tế, không phải lý thuyết._
