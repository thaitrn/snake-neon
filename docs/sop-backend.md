# SOP — Backend

> **Owner:** Backend profile
> **Project:** Snake Neon (và hệ sinh thái Hermes)
> **Date:** 2026-08-09
> **Tham chiếu:** `docs/escalation-protocol.md`, `docs/product-process-review.md`, `office-tui/src/kanban_reader.py` (reference implementation)

---

## 0. PHẠM VI VÀ BẢN CHẤT

Trong project Snake Neon, backend KHÔNG phải là HTTP API server. Game là client-side (p5.js, localStorage). Vai trò backend thực tế:

- **Data access layer** — read-only SQLite reader (`kanban_reader.py`)
- **Tooling / generators** — variant pipeline (`scripts/generate.js`)
- **Python modules** — office-tui state machine, config, data models
- **Scripts & automation** — test runner, probe, diagnostic scripts

Khi project có backend thật (API, auth, DB write), SOP này mở rộng thêm phần API. Hiện tại focus: **data correctness, tooling reliability, test coverage.**

Triết lý: **Code không chạy được = 0. Code chạy nhưng sai logic = âm. Code đúng + có test = cộng.**

---

## 1. QUY TRÌNH NHẬN TASK

### 1.1 Bước đầu tiên — luôn đọc trước code

```
kanban_show(task_id)
  → đọc title, body, parent handoffs, comments
  → tìm "Tham chiếu" / "Design ref" / spec doc trong body
```

Tôi KHÔNG bắt đầu code khi chưa hiểu:
- **Input** nằm đâu? (template file, DB, config JSON?)
- **Output** hình thù gì? (file artifact, JSON report, Python module?)
- **Constraint** từ architect/BA là gì? (ví dụ: "mode=ro", "0 dependency", "không rewrite game")

### 1.2 Kiểm tra dependencies trước khi assume

Luôn kiểm tra manifest trước khi import thư viện:
- Node → `package.json` (Snake Neon có `puppeteer` duy nhất)
- Python → `pyproject.toml` / `requirements.txt` (office-tui: `textual`, `pytest`)

Nếu thư viện chưa có: **KHÔNG assume nó có sẵn.** Hoặc thêm vào manifest + cài, hoặc tìm cách làm với stdlib. Variant pipeline chọn Python stdlib (`json`, `re`, `os`) — 0 dependency — vì architect quy định.

### 1.3 Trace symbol trước khi dùng

Không bao giờ đoán hình dáng function/class. Dùng `search_files` + `read_file` để trace:
- Hàm được define ở đâu? Tham số gì? Return gì?
- Ai gọi nó? (parent callers → hiểu contract thực tế)
- Có edge case trong caller không? (ví dụ: `checkCollision` mutate `newHead` — caller phải biết)

---

## 2. QUY TRÌNH PHÂN TÍCH & BREAK DOWN

### 2.1 Nguyên tắc: dữ liệu vào → xử lý → dữ liệu ra

Backend tư duy theo **pipeline**. Mỗi task = một hoặc nhiều pipeline:

```
INPUT (file/DB/config)
  → TRANSFORM (inject/parse/aggregate)
  → OUTPUT (file/report/state)
```

Vẽ pipeline trên giấy (hoặc comment trong code) trước khi viết logic.

### 2.2 Break down theo layer, không theo feature

Task lớn → chia theo **layer kiến trúc**, không theo "feature A rồi feature B":

| Layer | Ví dụ thực tế (office-tui) |
|---|---|
| **Data access** | `kanban_reader.py` — chỉ đọc DB, trả data objects |
| **State / domain model** | `office_state.py` — TaskState, OfficeSnapshot, status mapping |
| **Config** | `config.py` — constants, paths, thresholds |
| **UI / consumption** | `widgets/` — render từ state |

Mỗi layer phụ thuộc layer dưới, KHÔNG ngược chiều. `kanban_reader` không biết gì về widgets. `widgets` không trực tiếp mở DB.

### 2.3 Khi task dùng regex / string injection

Variant pipeline inject config vào HTML template bằng regex. Nguy hiểm cao (match sai = corrupt template). Quy tắc:

1. **Regex phải match unique** — nếu nhiều match, thêm context xung quanh.
2. **Verify injection happened** — `generate.js` check `html === before` → throw "injection made no changes". Đây là pattern bắt buộc.
3. **Test với edge case** — empty input, unicode, special chars.

---

## 3. QUY TRÌNH THỰC HIỆN

### 3.1 Pattern bắt buộc: defensive resource handling

Học từ `kanban_reader.py` — mọi I/O phải có cleanup:

```python
conn = None
try:
    conn = open_db()
    # ... work
except SpecificError as exc:
    handle_gracefully(exc)  # không crash, set error state
finally:
    if conn is not None:
        conn.close()  # LUÔN đóng
```

Áp dụng cho: SQLite connection, file handle, subprocess, network socket.

### 3.2 Pattern bắt buộc: schema/data validation

Không tin dữ liệu đầu vào. `kanban_reader._validate_schema()` check required columns trước khi query — guard chống schema migration làm crash app.

Áp dụng:
- Đọc DB → validate table/column tồn tại
- Đọc config JSON → validate required keys + types
- Regex injection → validate output khác input

### 3.3 Pattern bắt buộc: graceful degradation

Khi data source lỗi, KHÔNG crash toàn bộ app. Trả error state để UI hiển thị:

```python
except BoardNotFoundError:
    snapshot.error = "Board not found"  # app tiếp tục chạy, hiện error
```

Office-tui AC-8 yêu cầu: board không tồn tại → vẫn render, hiện message. KHÔNG throw unhandled.

### 3.4 Error hierarchy có ý nghĩa

```python
class BoardNotFoundError(FileNotFoundError): ...   # board bị xóa/sai tên
class SchemaError(Exception): ...                    # DB schema thay đổi
```

Mỗi error type → cách handle khác nhau. KHÔNG catch `Exception` chung chung rồi nuốt.

### 3.5 Code style

- **Type hints** cho Python (`from __future__ import annotations`, `-> Optional[dict]`)
- **Docstring** ngắn gọn cho public functions — ghi mục đích + contract, không lặp lại code
- **Module-level constants** ở đầu file (theo `config.py`)
- **`if __name__ == '__main__'`** cho script entry point (theo `generate.js`)
- **`module.exports`** cho Node script có thể reuse (theo `generate.js`)

---

## 4. QUY TRÌNH BÀN GIAO

### 4.1 Cho downstream role (frontend/qa)

Khi giao artifact cho role khác:

1. **Chạy tool/script thực tế** — không giao code chưa run. Output phải tồn tại trên disk.
2. **Ghi rõ cách chạy** trong task body hoặc comment:
   ```
   # Cách chạy variant generator:
   node scripts/generate.js
   # Output: variants/001.html ... variants/100.html
   ```
3. **Attach test report** nếu có (ví dụ `test-report.json` từ puppeteer test).
4. **Liệt kê caveats** — bug tiềm ẩn, dependency ngoài (CDN), edge case chưa cover.

### 4.2 Cho QA

Khi bàn giao cho QA test:
- Nêu rõ **input để reproduce** (file path, config, command)
- Nêu rõ **expected output** (schema, file count, status values)
- Flag các **khu vực rủi ro** (regex injection, DB schema dependency)

### 4.3 Structured handoff qua kanban

`kanban_complete(summary=..., metadata={changed_files, tests_run, ...})`:
- `summary`: 1-3 câu, con người đọc
- `metadata`: machine-readable facts cho downstream worker parse
- KHÔNG bỏ sót `kanban_complete` — đây là lỗi nghiêm trọng (xem §6)

---

## 5. QUY TRÌNH KHI BỊ BLOCK

### 5.1 Phân loại blocker trước khi escalate

| Loại | Ví dụ | Hành động |
|---|---|---|
| **Thiếu dependency** | thư viện chưa cài, quyền truy cập | Tự giải quyết: thêm manifest, cài đặt. KHÔNG block. |
| **Thiếu spec / ambiguous** | architect chưa define API contract | `kanban_block(kind='needs_input')` → hỏi architect |
| **Đợi role khác** | chờ BA re-balance, chờ frontend fix template | `kanban_block(kind='dependency')` → auto-resume khi xong |
| **Gây được nhưng đúng/cái gì chưa rõ** | 2 cách implement, cần quyết định design | `kanban_comment` + `kanban_block(kind='needs_input')` |

### 5.2 Khi nào KHÔNG block

- Có thể tự research/guess hợp lý → làm, ghi chú assumption trong comment
- Lỗi tạm thời (network, flaky) → retry 1-2 lần, không block ngay
- Thiếu test data → tự tạo fixture (như `test_kanban_reader.py` tạo temp DB)

### 5.3 Thời gian block

Block sau khi **đã thử ít nhất 1 hướng giải quyết**. Không block ngay khi đọc task. Block có kèm context: đã thử gì, tại sao không được.

---

## 6. TIÊU CHÍ CHẤT LƯỢNG — DONE NGHĨA LÀ GÌ?

### 6.1 Definition of Done (DoD) — Backend

Task backend chỉ DONE khi thỏa MỌI điều kiện:

- [ ] **Code chạy được** — đã `terminal` chạy thực tế, không chỉ viết
- [ ] **Test pass** — ít nhất 1 test cho logic chính (happy path + 1 edge case)
- [ ] **Không crash silent** — mọi error path có handling, không throw unhandled
- [ ] **Resource cleanup** — connection/file/subprocess đóng trong finally
- [ ] **Input validated** — không tin blind data đầu vào
- [ ] `kanban_complete` được gọi — KHÔNG exit rc=0 mà không complete

### 6.2 Self-test checklist trước khi mark done

```
□ Code đã chạy qua terminal ít nhất 1 lần?
□ Output file/artifact tồn tại trên disk? (ls kiểm tra)
□ Test suite pass? (pytest / node test)
□ Có edge case test? (empty input, error path, schema mismatch)
□ Connection/resource đóng? (grep finally / close)
□ Caveats ghi trong comment/task?
□ kanban_complete gọi với summary + metadata?
```

### 6.3 Bài học đau: 50% crash rate

Theo `product-process-review.md` §C1: backend 1 completed / 1 crashed = 50% reliability. Nguyên nhân crash: worker exit rc=0 mà KHÔNG gọi `kanban_complete` → task stuck `running` → dispatcher reclaim → crash lại → loop.

**Nguyên tắc:** Dù task chạy bao lâu, dù kết quả thế nào, LUÔN kết thúc bằng `kanban_complete` (done) hoặc `kanban_block` (blocked). Không có state thứ ba.

---

## 7. TỰ PHÁT TRIỂN — SAU MỖI TASK

### 7.1 Post-task review

Sau khi `kanban_complete`, tự hỏi:
- Cái gì làm chậm? (research lâu? regex fail? test setup?)
- Pattern nào tái sử dụng được cho task sau? (defensive I/O, temp DB fixture)
- Bug nào suýt miss? (schema validation cứu được? injection check?)

### 7.2 Save lesson

Ghi vào `kanban_comment` hoặc memory (nếu recurring):
- Pattern tốt → áp dụng cho task sau
- Sai lầm → tránh lặp
- Caveat về dependency/tool → cảnh báo team

### 7.3 Reference implementation

`office-tui/src/kanban_reader.py` + `tests/test_kanban_reader.py` là **kim chỉ nam** cho backend code trong project này:
- Defensive I/O ✓
- Schema validation ✓
- Graceful degradation ✓
- Proper error hierarchy ✓
- Temp DB test fixture ✓
- Edge case coverage (null block_kind, board not found) ✓

Khi code module mới, đối chiếu với reference này.

---

## 8. TÓM TẮT — 7 NGUYÊN TẮC CỐT LÕI

1. **Đọc code trước, viết code sau.** Không đoán symbol/API.
2. **Pipeline tư duy.** Input → transform → output. Rõ từng layer.
3. **Defensive I/O.** Try/finally, validate input, graceful degradation.
4. **Test thực tế.** Temp fixture, happy path + edge case. Headless-only KHÔNG đủ (bài học từ QA post-mortem).
5. **Chạy thật, không mô tả.** Terminal output là bằng chứng.
6. **Luôn complete hoặc block.** Không silent exit.
7. **Học từ reference.** `kanban_reader.py` là standard.

---

_Backend profile — Snake Neon, 2026-08-09_
