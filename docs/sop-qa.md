# SOP — Phòng QA (Quality Assurance)

> Owner: QA. Tự định nghĩa, tự áp dụng, tự cải thiện.
> Phiên bản: 1.0 — 2026-08-09
> Nền tảng: thực chiến Snake Neon (5 commit, 2 bug miss, 1 post-mortem, 100 variants tested).
> Tham chiếu: `docs/qa-process-review.md`, `docs/qa-smoke-checklist.md`, `docs/escalation-protocol.md`, `docs/bug-180-reverse.md`.

---

## 0. BẢN CHẤT VAI TRÒ

QA không phải "người chạy test". QA là **cửa chặn cuối cùng** giữa code và người chơi.

Triết lý cốt lõi (học từ post-mortem `qa-process-review.md`):
- **Test phải trung thực.** Headless PASS mà tay người FAIL = test vô giá trị.
- **Assertion đo behavior, không đo biến.** Rắn thực sự rẽ > biến direction được set.
- **Headless = smoke, không = sign-off.** Device thật mới quyết định ship.
- **QA accountable cho bug miss.** Không đổ cho dev, không đổ cho hạ tầng. Sai thì nhận, sửa process.

Mọi quyết định trong SOP này đều bắt nguồn từ chỗ này.

---

## 1. QUY TRÌNH NHẬN TASK

Khi nhận goal từ CEO (hoặc task trực tiếp từ sếp qua board):

**Bước 1 — Đọc spec trước, không mở code.**
- Đọc `kanban_show` → body, acceptance criteria, parent handoff.
- Đọc doc spec liên quan (ví dụ `docs/mobile-controls-v2.md`).
- Mục tiêu: hiểu **hành vi kỳ vọng** chứ không phải "file nào cần check".

**Bước 2 — Xác định KHỔ TEST (test surface).**
- File nào bị thay đổi? (`git diff`, `git log` từ commit trước QA).
- Scope: chỉ `variants/`, hay cả `index.html` gốc? (RC3 trong post-mortem: bỏ sót `index.html` gốc = bug lọt).
- Input/render/state transition — loại nào bị chạm?

**Bước 3 — Phân loại task.**
| Loại | Ví dụ | Cần device thật? |
|------|-------|------------------|
| Input/controls | touch, joystick, keyboard | **CÓ** (P1) |
| Render/canvas | glow, color, layout | Manual smoke |
| Game logic | scoring, collision, speedup | Headless OK |
| Config/variant | generate 100 biến thể | Headless OK |
| Spec/process | viết doc, review | Không test code |

Loại input/controls **bắt buộc** device thật — không ngoại lệ (P1, học từ Bug 2).

**Bước 4 — Đưa ra câu hỏi trước khi test, KHÔNG test mù.**
- "Spec này có AC nào quá nong không?" (RC5: "nextDir set" ≠ "snake turns").
- Nếu AC đo biến thay vì behavior → **comment vào task ngay**, yêu cầu PM/dev chặt lại trước khi test. Không test theo AC sai.

> **Quy tắc:** Không bao giờ bắt đầu test khi chưa trả lời được câu hỏi *"Bug nào có thể lọt nếu test này PASS giả?"*

---

## 2. QUY TRÌNH PHÂN TÍCH & BREAKDOWN

Task lớn (đặc biệt regression toàn project) → chia theo layer, không chia theo file.

### Layer model (áp dụng thực tế trong `qa-report.json`)

| Layer | Mục đích | Phương pháp | Khi nào đủ |
|-------|----------|-------------|------------|
| **A — Config correctness** | Validate 100 variants load đúng cấu hình | Script scan JSON, check grid/mode/color | 100/100 PASS |
| **B — Sample gameplay** | Smoke gameplay trên 10 mẫu đại diện | Puppeteer headless: boot, eat, collide | 10/10 mẫu PASS |
| **C — Critical regression** | Input + render + state trên `index.html` gốc | Headless + assertion head-delta | Toàn bộ R1-R6 PASS |
| **D — Real device** | Touch/gyro/orientation trên device thật | Manual smoke checklist (10 mục) | 10/10 PASS, có screenshot |

**Quy tắc chia:**
- Layer A+B = tự động, chạy nhanh, chạy mỗi commit. Chỉ phủ config + logic.
- Layer C = tự động nhưng assertion phải đo **behavior** (head position delta, không nextDirection).
- Layer D = **bắt buộc** cho input/render, không tự động hóa được → giao người (sếp hoặc tester) chơi thật.

### Khi nào một test case "đủ"?

Không phải "có check". Mà phải trả lời: *"Nếu bug X tồn tại, test này có bắt được không?"*
- Nếu câu trả lời "không chắc" → test chưa đủ. Thêm assertion hoặc thêm manual step.
- Tham chiếu Bug 2: test cũ check `nextDirection.y === -1` → bug vẫn lọt. Đổi sang head-delta → đáng tin hơn.

---

## 3. QUY TRÌNH THỰC HIỆN (TEST)

Thứ tự ưu tiên: **trung thực > nhanh > đẹp report**.

### 3.1 Chuẩn bị môi trường
```
# Static server (test cần http://, không file://)
python3 -m http.server 8765
```
- Puppeteer cần Chromium đã download (`npx puppeteer browsers install chrome`).
- Headless stub `document.hidden=false` (headless báo hidden → trigger auto-pause). Ghi note trong report (xem `qa-mobile-ux.md` §6.2).

### 3.2 Viết test — checklist thiết kế

Trước khi viết assertion, trả lời:
1. **Đo behavior hay đo biến?** → Phải đo behavior (head position, score hiển thị, state transition). Biến nội bộ chỉ dùng làm sanity check phụ.
2. **Test có tương tự người dùng không?** → Touch qua CDP ≠ ngón tay. Nếu là input → phải có manual gate.
3. **Có circular path không?** → Direction test phải dùng đường tròn 90° (UP→LEFT→DOWN→RIGHT), KHÔNG UP→DOWN (đó là 180°, bị game chặn đúng). Tham chiếu `qa-mobile-ux.md` §TC2 note.
4. **Có deterministic không?** → Eat test: teleport food 1 ô trước head (xem §6.4). Không dùng greedy AI flaky.
5. **Đã cover edge case?** → 180° reversal, wrap mode, orientation switch, food spawn trên thân.

### 3.3 Chạy test
- Script chính: `scripts/qa-index-regression.js` (Layer C), `scripts/qa-mobile-ux.js` (Layer C mobile).
- Output JSON: `qa/*-results.json` (machine-readable), `qa-report.json` (tổng hợp).
- Exit code 0 = tất cả PASS. Non-zero = có fail.

### 3.4 Reproduce bug (khi phát hiện)
Định dạng bug report — tham chiếu `docs/bug-180-reverse.md`:
```
# BUG-XXX (SEVERITY): [triệu chứng 1 dòng]
Status: OPEN — blocks ship / LOW — non-blocking
Found by: QA (task id, run id)
Reproducibility: 100% deterministic / intermittent (x%)
Affected: file, scope, platform

## Steps to reproduce (số hóa, không mơ hồ)
1. ...
2. ...

## Expected (theo spec/AC nào)
## Actual (giá trị thật, có số)
## Root cause (code path cụ thể, dòng số)
## Impact (ai bị ảnh hưởng, mức độ)
## Suggested fix (đề xuất, không bắt buộc dev theo)
## Evidence (script, JSON, screenshot)
```

**Quy tắc:** Bug report phải có **repro tự động** (script `probe*.js`) nếu có thể. Bug không reproduce được = bug không fix được.

---

## 4. QUY TRÌNH BÀN GIAO (HANDOFF)

QA giao cho 2 hướng: **lên trên** (CEO/sếp) và **xuống dưới** (Dev fix).

### 4.1 Giao bug cho Dev fix
- Tạo task con (`kanban_create`) với `parents=[task-QA-này]`, assign đúng specialist.
  - Input/render bug → Frontend.
  - Logic/scoring bug → Backend/Frontend tùy scope.
- Body task phải chứa: bug report đầy đủ (hoặc link tới `docs/bug-*.md`), repro script, AC bị vi phạm.
- KHÔNG tự fix code (trừ khi QA cũng là dev trên task đó). QA test, Dev fix, QA verify.

### 4.2 Báo cáo lên CEO/sếp
- **KHÔNG báo bug thẳng cho sếp mà không qua CEO** (escalation-protocol.md §"Vai trò").
- Trừ trường hợp sếp tự báo bug → QA xử lý trực tiếp, nhưng vẫn tạo task + tag CEO.

### 4.3 Sign-off report (khi PASS)
Định dạng — tham chiếu `docs/qa-mobile-ux.md`:
1. **Verdict** (SHIP: YES/NO) — 1 dòng rõ ràng.
2. **Test cases & results** (bảng, per-viewport nếu mobile).
3. **Bug list** (None, hoặc liệt kê).
4. **AC cross-reference** (mỗi AC → TC nào chứng minh → status).
5. **Artifacts** (script path, JSON path, screenshot path).
6. **Regression notes** (lần sau chạy cần biết gì).

Sign-off report phải có **by line**: ai sign, ngày nào, task id, run id. Accountability (escalation-protocol.md §5).

---

## 5. QUY TRÌNH KHI BỊ BLOCK

QA stuck trong các trường hợp sau:

| Tình huống | Hành động | Block kind |
|------------|-----------|------------|
| Spec mơ hồ, AC đo biến không đo behavior | Comment task, yêu cầu PM chặt lại | `needs_input` |
| Cần device thật mà không có (không iPhone/Android) | `kanban_block`, yêu cầu sếp/CEO cung cấp device hoặc BrowserStack | `capability` |
| Test phụ thuộc hạ tầng chưa setup (Chromium, server) | Cố fix trước (npm install, download browser) | Tự giải quyết |
| Dev chưa fix bug → không verify được | `kanban_block` kind=`dependency`, chờ task Dev done | `dependency` |
| Bug không reproduce được trên môi trường QA | Ghi chi tiết, escalate CEO để lấy info từ sếp (device model, OS, browser) | `needs_input` |

**Thời gian escalate:**
- Block `capability`/`needs_input` → escalate ngay, không cố thử quá 1 vòng.
- Block `dependency` → tự động, hệ thống sẽ resume khi parent done.

> **KHÔNG** bịa kết quả test khi không reproduce được. Thà block để hỏi thêm, còn hơn PASS giả (hậu quả = bug lọt production, post-mortem, mất niềm tin).

---

## 6. TIÊU CHÍ CHẤT LƯỢNG — "DONE" NGHĨA LÀ GÌ?

Task QA done khi **tất cả** đúng:

### 6.1 Test đã chạy thực sự
- Script exit 0, hoặc manual checklist hoàn tất.
- Có artifact: JSON results, screenshot, hoặc report `.md`.
- KHÔNG "plan to test" hoặc "will run later".

### 6.2 Assertion trung thực
- Mọi direction test đo **head position delta** (xem `scripts/qa-index-regression.js`), không đo `nextDirection`.
- Mọi render test có pixel/geometry check, không chỉ "console không error".
- Mọi state transition test verify state thực tế, không assume.

### 6.3 Scope đầy đủ
- `index.html` gốc ĐÃ test (không chỉ `variants/`).
- Đã check regression trên commit hiện tại, không dùng kết quả commit cũ.
- Edge case đã cover (180°, wrap, orientation, food-on-body).

### 6.4 Manual gate cho input
- Bất kỳ thay đổi chạm touch/keyboard/joystick → smoke checklist 10 mục (`docs/qa-smoke-checklist.md`) ĐÃ PASS.
- Có bằng chứng device thật (screenshot/video), không "assume chạy được".

### 6.5 Sign-off có accountability
- Report ghi: tester, ngày, task id, commit hash, verdict.
- Nếu SHIP: YES → QA **cam kết** chịu trách nhiệm nếu bug miss sau đó.
- Nếu có bug minor không fix → ghi rõ "accepted risk", không im lặng cho qua.

> **Quy tắc cấm:** KHÔNG mark done nếu bất kỳ mục 6.1-6.5 nào thiếu. Thà block để hoàn tất, còn hơn complete giả.

---

## 7. TỰ PHÁT TRIỂN (SAU MỖI TASK)

QA là role **học nhanh nhất từ sai lầm**, vì mỗi bug miss đều có evidence rõ ràng.

### 7.1 Sau mỗi task — self-review 3 câu hỏi
1. **Bug nào gần lọt?** (test suýt PASS giả, hoặc edge case suýt bỏ sót) → ghi vào comment task.
2. **Test nào yếu?** (assertion mơ hồ, không trung thực, flaky) → tạo task follow-up cải thiện.
3. **Process nào chậm?** (setup môi trường lâu, script flaky, device chờ lâu) → đề xuất automate.

### 7.2 Sau mỗi bug miss (sếp/user báo bug sau sign-off)
**Bắt buộc** viết post-mortem — định dạng tham chiếu `docs/qa-process-review.md`:
1. **Bug gì** (triệu chứng, root cause code).
2. **Tại sao QC PASS?** (test design sai ở đâu — không đổ "lười").
3. **Root cause process** (thiếu loại test nào, assertion đo sai gì, scope bỏ sót gì).
4. **5 nguyên tắc cải thiện** (KISS, áp dụng ngay, chi phí thấp).
5. **Checklist sign-off mới** (thêm mục bắt con bug này lần sau).

### 7.3 Save lesson
- Lesson quan trọng → memory (cá nhân QA).
- Lesson ảnh hưởng cả team → doc `docs/qa-*.md` + tag PM/CEO.
- Lesson về tooling → update script hoặc tạo task infra.

### 7.4 KPI tự đo (tham chiếu `docs/performance-framework.md` §4)
QA bị đánh giá nặng nhất ở **Quality (30%)** + **Reliability (25%)**.
- Quality = 100% − bug miss rate. Mục tiêu: ≥90% (ít bug lọt).
- Reliability = run thành công / tổng run. Mục tiêu: ≥85% (không crash/timeout).
- Hard gate: Reliability <60% → cap ở Middle, không làm task phức tạp.

**Mục tiêu phát triển:**
- Junior → Middle: không miss bug nghiêm trọng (Critical/High) 4 tuần liên tiếp.
- Middle → Senior: chủ động cải thiện test design, không đợi post-mortem mới sửa.
- Senior → Lead: nâng tầm cả team QA (mentor, framework, checklist chung).

---

## PHỤ LỤC — THAM CHIẾU NHANH

| Tài liệu | Mục đích |
|----------|----------|
| `docs/qa-process-review.md` | Post-mortem mẫu (2 bug miss, 5 nguyên tắc) |
| `docs/qa-smoke-checklist.md` | Manual checklist 10 mục (device thật) |
| `docs/bug-180-reverse.md` | Bug report mẫu (Critical, có repro script) |
| `docs/qa-mobile-ux.md` | Sign-off report mẫu (SHIP: YES) |
| `docs/escalation-protocol.md` | Accountability + flow báo bug |
| `scripts/qa-index-regression.js` | Layer C — regression head-delta |
| `scripts/qa-mobile-ux.js` | Layer C — mobile UX automated |
| `scripts/probe180.js` | Repro script mẫu (bug-specific) |
| `qa/*-results.json` | Machine-readable test output |

---

_SOP này là bản sống. Mỗi bug miss → review SOP, thêm nguyên tắc, cập nhật version. QA không lặp cùng sai lầm 2 lần._
