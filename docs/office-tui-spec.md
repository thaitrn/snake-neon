# Virtual Office TUI — Product Specification (PRD)

> **Spec ID:** office-tui-spec  
> **Owner:** PM  
> **Status:** Draft v1.0  
> **Date:** 2026-08-09  

---

## 1. TỔNG QUAN (Executive Summary)

**Virtual Office TUI** là một dashboard hiển thị realtime "sơ đồ văn phòng ảo" ngay trong terminal. Mỗi nhân viên (Hermes profile) xuất hiện như một desk card trong phòng ban tương ứng, cho thấy: họ đang làm gì, ở trạng thái nào (working / waiting / blocked / done / idle), và heartbeat còn sống hay không.

**Mục tiêu:** Giúp CEO/Sếp nhìn 1 cái là biết toàn bộ team đang làm gì — không cần mở browser, không cần scroll kanban board.

**Đối tượng người dùng:**
| Người dùng | Nhu cầu |
|---|---|
| CEO (Sếp) | Xem toàn bộ team realtime, biết ai đang kẹt |
| PM | Theo dõi progress, phát hiện bottleneck |
| Mỗi profile worker | (không phải user chính — họ là data) |

---

## 2. DATA SOURCE (đã khảo sát thực tế)

### 2.1 Kanban SQLite DB

Nhiều board, mỗi board 1 DB tại:
```
/Users/thaitrn/.hermes/kanban/boards/{board-name}/kanban.db
```

**Boards hiện tại:** `ai-company`, `office-tui`, `snake-neon`

### 2.2 Bảng `tasks` — cột dùng để render

| Cột | Ý nghĩa |
|---|---|
| `id` | Task ID (vd: `t_81abf5b9`) |
| `title` | Tên task (truncate cho hiển thị) |
| `assignee` | Profile nhận task — **map trực tiếp tới phòng ban** |
| `status` | `todo` / `running`(qua current_run_id) / `blocked` / `done` |
| `block_kind` | `dependency` / `needs_input` / `capability` / `transient` |
| `current_run_id` | Non-null = đang có worker chạy task này |
| `last_heartbeat_at` | Epoch — liveness signal gần nhất |
| `started_at` / `completed_at` | Timestamps |
| `priority` | Số nguyên, cao = ưu tiên |
| `consecutive_failures` | Circuit breaker counter |

### 2.3 Bảng `task_runs` — runtime detail

| Cột | Ý nghĩa |
|---|---|
| `status` | `running` / `done` / `blocked` / `crashed` / `timed_out` / `failed` |
| `outcome` | `completed` / `blocked` / `crashed` / `timed_out` / `spawn_failed` |
| `worker_pid` | PID thật của worker process |
| `last_heartbeat_at` | Heartbeat gần nhất của run |

### 2.4 Bảng `task_events` — activity log

| `kind` | Ý nghĩa |
|---|---|
| `created` | Task mới |
| `claimed` | Worker lấy lock |
| `spawned` | PID khởi chạy |
| `heartbeat` | Liveness ping |
| `blocked` / `completed` | Trạng thái thay đổi |

### 2.5 Profiles

```
hermes profile list
```

**8 profiles hiện tại:**

| Profile | Department | Role |
|---|---|---|
| `ceo` | Management | Sếp — delegate tasks |
| `pm` | PM | Product planning |
| `ba` | BA | Business analysis |
| `architect` | Architecture | Tech design |
| `frontend` | Frontend | UI implementation |
| `backend` | Backend | Server/API |
| `qa` | QA | Testing |
| `default` | (unassigned) | Fallback profile |

### 2.6 Status Mapping Logic (quan trọng)

Đây là cách map từ DB state → icon hiển thị trên office:

```
┌─────────────────────────────────────────────────────────┐
│  TASK STATE                          → DISPLAY           │
├─────────────────────────────────────────────────────────┤
│  status='done'                       → ✅ done           │
│  current_run_id != NULL              → 🟢 working        │
│    AND last_heartbeat < 120s                              │
│  current_run_id != NULL              → ⏳ waiting        │
│    AND last_heartbeat >= 120s        (có thể đã stale)   │
│  status='todo'                       → ⏳ waiting        │
│    (chưa được dispatch)                                   │
│  status='blocked'                    → 🔴 blocked        │
│    AND block_kind != 'dependency'                         │
│  status='blocked'                    → ⏳ waiting        │
│    AND block_kind='dependency'       (chờ parent xong)   │
│  profile có 0 task active             → 💤 idle          │
│    (không có task running/todo/blocked)                   │
└─────────────────────────────────────────────────────────┘
```

---

## 3. LAYOUT THIẾT KẾ (ASCII Mockup)

### 3.1 Full Screen Layout (120+ cols terminal)

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║                    🏢 HERMES VIRTUAL OFFICE — ai-company board                              ║
║                    ⏱ 14:35:22  |  🔄 refresh 5s  |  👥 7/8 active  |  📋 24 tasks            ║
╠══════════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                              ║
║  ┌─── 👔 MANAGEMENT ──────────────────┐  ┌─── 📋 PM ──────────────────────────┐             ║
║  │                                     │  │                                     │             ║
║  │  🟢 ceo                             │  │  🟢 pm                              │             ║
║  │     └ Spec Virtual Office TUI       │  │     └ Phân tích Game Retro PRD     │             ║
║  │       running 2m  ♥ 3s ago          │  │       running 5m  ♥ 1s ago         │             ║
║  │                                     │  │  ✅ pm (done: 3 tasks)              │             ║
║  └─────────────────────────────────────┘  └─────────────────────────────────────┘             ║
║                                                                                              ║
║  ┌─── 📊 BA ──────────────────────────┐  ┌─── 🏗 ARCHITECT ───────────────────┐             ║
║  │                                     │  │                                     │             ║
║  │  🔴 ba                              │  │  💤 architect                       │             ║
║  │     └ Phân tích nghiệp vụ           │  │     └ (no active task)              │             ║
║  │       BLOCKED: needs_input          │  │                                     │             ║
║  │  ✅ ba (done: 4 tasks)              │  │  ⏳ architect                       │             ║
║  │                                     │  │     └ Design Office TUI Tech Stack  │             ║
║  │                                     │  │       waiting (dependency on PM)    │             ║
║  └─────────────────────────────────────┘  └─────────────────────────────────────┘             ║
║                                                                                              ║
║  ┌─── 🎨 FRONTEND ────────────────────┐  ┌─── ⚙️  BACKEND ─────────────────────┐             ║
║  │                                     │  │                                     │             ║
║  │  🔴 frontend                        │  │  💤 backend                         │             ║
║  │     └ Prototype UI Game Retro       │  │     └ (no active task)              │             ║
║  │       BLOCKED: capability           │  │                                     │             ║
║  │                                     │  │                                     │             ║
║  └─────────────────────────────────────┘  └─────────────────────────────────────┘             ║
║                                                                                              ║
║  ┌─── 🧪 QA ──────────────────────────┐                                                      ║
║  │                                     │                                                      ║
║  │  🔴 qa                              │                                                      ║
║  │     └ Test plan Game Retro          │                                                      ║
║  │       BLOCKED: dependency            │                                                      ║
║  │                                     │                                                      ║
║  └─────────────────────────────────────┘                                                      ║
║                                                                                              ║
╠══════════════════════════════════════════════════════════════════════════════════════════════╣
║  📡 LIVE FEED                                                                               ║
║  14:35:20  ✅ ba completed: "5 entities chính trong data model"                              ║
║  14:35:15  🟢 pm started: "Phân tích Game Retro PRD"                                         ║
║  14:35:08  🔴 frontend blocked: needs_input                                                  ║
║  14:35:01  💬 pm commented on t_81abf5b9                                                     ║
║  14:34:50  🆕 ceo created: "QA: Test plan cho Game Retro"                                    ║
╠══════════════════════════════════════════════════════════════════════════════════════════════╣
║  [1-3] Switch Board  [r] Refresh  [f] Follow task  [q] Quit                                 ║
╚════════════════════════════════════════════════════════→ snake-neon / ai-company / office-tui╝
```

### 3.2 Desk Card Anatomy

Mỗi nhân viên = 1 desk card:

```
 ┌──────────────────────────────────┐
 │  🟢 pm                           │  ← Status icon + profile name
 │     └ Phân tích Game Retro PRD   │  ← Current task title (truncated)
 │       running 5m  ♥ 1s ago       │  ← Duration + heartbeat freshness
 └──────────────────────────────────┘
```

**State khi nhiều task:** Profile có nhiều task active → chỉ hiển thị task có priority cao nhất / gần nhất. Badge `(done: 3)` cho completed tasks.

**State idle:**
```
 ┌──────────────────────────────────┐
 │  💤 backend                      │
 │     └ (no active task)           │
 └──────────────────────────────────┘
```

### 3.3 Compact Mode (terminal < 100 cols)

Khi terminal hẹp, chuyển sang single-column vertical scroll:

```
╔════════════════════════════════════╗
║  🏢 HERMES OFFICE                  ║
║  ⏱ 14:35  👥 7/8  📋 24           ║
╠════════════════════════════════════╣
║ 👔 MANAGEMENT                      ║
║  🟢 ceo — Spec Office TUI (2m)    ║
╠════════════════════════════════════╣
║ 📋 PM                              ║
║  🟢 pm — Game Retro PRD (5m)      ║
╠════════════════════════════════════╣
║ 📊 BA                              ║
║  🔴 ba — BLOCKED: needs_input     ║
╠════════════════════════════════════╣
║ ...                                ║
╚════════════════════════════════════╝
```

---

## 4. FEATURE LIST (MoSCoW Prioritization)

### 4.1 MVP — Must Have (phải có để ship)

| # | Feature | Mô tả |
|---|---|---|
| M1 | **Office grid layout** | Hiển thị 6 phòng ban (PM/BA/Architect/Frontend/Backend/QA) + Management |
| M2 | **Desk card per profile** | Mỗi profile = 1 card: tên, status icon, task đang làm |
| M3 | **Status mapping** | 🟢working / ⏳waiting / 🔴blocked / ✅done / 💤idle |
| M4 | **Realtime refresh** | Auto-polling DB mỗi 5 giây, re-render |
| M5 | **Multi-board selector** | Chuyển giữa các board (ai-company, snake-neon, office-tui) |
| M6 | **Summary bar** | Header: thời gian, số profile active, tổng task, refresh rate |
| M7 | **Heartbeat freshness** | Hiển thị "♥ Ns ago" cho worker đang chạy |
| M8 | **Live feed tail** | 5 event mới nhất từ task_events (created/blocked/completed) |

### 4.2 P1 — Should Have (quan trọng, làm ngay sau MVP)

| # | Feature | Mô tả |
|---|---|---|
| S1 | **Block reason tooltip** | Hiển thị block_kind khi hover/expand (needs_input/capability/dependency) |
| S2 | **Task count badge** | Số task done/active per profile |
| S3 | **Color coding** | Màu cho mỗi status (green=working, red=blocked, gray=idle, cyan=done) |
| S4 | **Compact mode** | Auto-switch layout khi terminal < 100 cols |
| S5 | **Stale detection** | Cảnh báo "⚠ stale" nếu heartbeat > 120s |
| S6 | **Follow task** | Nhấn `f` → zoom vào 1 task, xem events timeline |

### 4.3 P2 — Could Have (nice-to-have)

| # | Feature | Mô tả |
|---|---|---|
| C1 | **Animated desk** | Icon nhấp nháy khi đang working (spinner) |
| C2 | **Sound alert** | Beep khi task mới block hoặc complete |
| C3 | **Task dependency graph** | Mini-graph hiển thị parent→child relations |
| C4 | **Failure counter** | Hiển thị consecutive_failures khi > 0 |
| C5 | **Search/filter** | Lọc theo profile hoặc status |

### 4.4 Won't Have (Out of scope v1)

| Feature | Lý do |
|---|---|
| Browser/web version | Task yêu cầu terminal-only |
| Write/modify tasks | TUI chỉ read-only — không thay đổi DB |
| Authentication | Chạy local, không cần auth |
| Cloud/remote sync | Local SQLite trực tiếp |
| Config file | Hardcode + CLI flags đủ cho MVP |

---

## 5. TECH APPROACH RECOMMENDATION

### 5.1 So sánh

| Tiêu chí | Python `rich`/`textual` | Node `blessed` | Go `bubbletea` |
|---|---|---|---|
| **Hermes ecosystem fit** | ✅ Hermes core = Python | ⚠️ Cần Node runtime | ⚠️ Cần Go toolchain |
| **Unicode/emoji support** | ✅ Native, excellent | ⚠️ Patchy | ✅ Good |
| **Color rendering** | ✅ 256/truecolor | ✅ 256-color | ✅ Truecolor |
| **SQLite access** | ✅ `sqlite3` built-in | ⚠️ `better-sqlite3` (native addon) | ✅ `mattn/go-sqlite3` |
| **Layout/panels** | ✅ `textual` = full TUI framework | ✅ Box drawing built-in | ✅ `lipgloss` + `bubbletea` |
| **Dev speed** | ✅ Nhanh nhất | ✅ Nhanh | ⚠️ Compile step |
| **Distribution** | ⚠️ `pip install` | ⚠️ `npm` | ✅ Single binary |
| **Async/polling** | ✅ `asyncio` | ✅ Event loop | ✅ Goroutines |
| **Maintainability** | ✅ Khó cho team JS | ✅ Familiar | ✅ Strong types |

### 5.2 Recommendation: **Python + Textual**

**Lý do chọn:**

1. **Hermes core là Python** — TUI dùng cùng ecosystem, dễ tích hợp, import trực tiếp Hermes internals nếu cần (vd: kanban DB path resolution).
2. **Textual là framework TUI mature nhất hiện tại** — CSS-like styling, reactive widgets, composable app architecture, async-native. `rich` đã là standard cho terminal output đẹp.
3. **SQLite zero-dependency** — `sqlite3` module built-in Python, không cần compile native addon (tránh pain của `better-sqlite3` trên macOS).
4. **Unicode/emoji** — Python xử lý emoji box-drawing tốt nhất, đặc biệt trên macOS Terminal/iTerm2.
5. **Dev velocity** — Không cần compile, iterate nhanh, prototype trong vài giờ.

**Stack cụ thể:**

```
Python 3.11+
├── textual     — TUI framework (app, widgets, CSS styling)
├── rich        — Text styling, panels, tables (textual dependency)
└── sqlite3     — Built-in, read-only access to kanban.db
```

**Không cần:** pip packages ngoài textual. sqlite3 là stdlib.

### 5.3 Architecture Gợi ý (cho Architect)

```
┌─────────────────────────────────────────────┐
│                  Textual App                 │
│  ┌─────────────┐    ┌──────────────────┐   │
│  │  Poller     │───▶│  OfficeModel      │   │
│  │  (5s timer) │    │  (snapshot dict)  │   │
│  └─────────────┘    └────────┬──────────┘   │
│                              │ reactive      │
│  ┌───────────────────────────▼───────────┐  │
│  │         Render Layer (widgets)        │  │
│  │  HeaderBar | DeptGrid | LiveFeed      │  │
│  │  FooterBar | TaskDetail (modal)       │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
         │ read-only
         ▼
  ~/.hermes/kanban/boards/{board}/kanban.db
```

**Polling approach:** `sqlite3` connection per poll (open → query → close). Tránh lock contention với Hermes dispatcher (đang ghi DB liên tục). Connection string: `file:...?mode=ro&immutable=1` cho read-only safety.

---

## 6. ACCEPTANCE CRITERIA

### AC-1: Office grid hiển thị đúng
```
GIVEN terminal width >= 120 cols
WHEN user launches `office-tui`
THEN  7 phòng ban hiển thị trong grid layout
AND   mỗi profile active có desk card với: tên, status icon, task title
AND   layout không bị wrap/tràn dòng
```

### AC-2: Status mapping chính xác
```
GIVEN task T có status='done'
WHEN office-tui render profile assigned to T
THEN  desk card hiển thị ✅ icon

GIVEN task T có current_run_id IS NOT NULL
AND   last_heartbeat_at < 120 giây trước
WHEN office-tui render
THEN  desk card hiển thị 🟢 working

GIVEN task T có status='blocked' AND block_kind='needs_input'
WHEN office-tui render
THEN  desk card hiển thị 🔴 blocked
AND   tooltip/note hiển thị "needs_input"
```

### AC-3: Realtime refresh
```
GIVEN office-tui đang chạy
WHEN một task trong DB chuyển từ 'todo' → 'running'
THEN  trong vòng 5 giây, desk card cập nhật status icon
AND   live feed thêm event mới ở đầu danh sách
AND   không có flicker toàn màn (chỉ dirty region re-render)
```

### AC-4: Multi-board switching
```
GIVEN 3 boards: ai-company, snake-neon, office-tui
WHEN user nhấn [2]
THEN  office-tui switch sang board snake-neon
AND   tất cả desk cards re-render với data từ board mới
AND   header hiển thị tên board hiện tại
```

### AC-5: Heartbeat freshness
```
GIVEN profile P đang chạy task với last_heartbeat_at = T
WHEN office-tui render
THEN  desk card hiển thị "♥ Ns ago" nơi N = now - T
AND   nếu N > 120s, hiển thị "⚠ stale" thay vì heartbeat
```

### AC-6: Live feed
```
GIVEN task_events table có events
WHEN office-tui render
THEN  5 events mới nhất hiển thị ở bottom panel
AND   mỗi event có: timestamp, icon, description
AND   events sort DESC by created_at
```

### AC-7: Compact mode
```
GIVEN terminal width < 100 cols
WHEN office-tui launch
THEN  layout switch sang single-column vertical
AND   mỗi phòng ban là 1 row, mỗi profile 1 dòng
AND   không bị truncate thông tin quan trọng (tên + status)
```

### AC-8: Graceful degradation
```
GIVEN một board DB không tồn tại hoặc corrupt
WHEN user select board đó
THEN  office-tui hiển thị error message trong grid area
AND   không crash app
AND   user có thể switch sang board khác
```

### AC-9: Performance
```
GIVEN board có 100+ tasks
WHEN office-tui refresh
THEN  render hoàn thành < 200ms
AND   CPU usage < 5% khi idle (giữa 2 lần poll)
AND   memory < 50MB
```

### AC-10: Quit clean
```
WHEN user nhấn [q]
THEN  office-tui thoát ngay
AND   restore terminal state
AND   không leak SQLite connections
```

---

## 7. USER STORIES

### US-1: CEO giám sát team
> Là CEO, tôi muốn mở terminal gõ 1 lệnh và thấy toàn bộ team đang làm gì, để không cần mở nhiều tab kanban.

### US-2: PM phát hiện bottleneck
> Là PM, tôi muốn thấy ngay ai đang 🔴 blocked, để unblock kịp thời trước khi chậm tiến độ.

### US-3: Developer check dependency
> Là Developer, tôi muốn follow task của dependency, để biết khi nào task của mình ready.

### US-4: Sếp xem đa board
> Là Sếp, tôi muốn chuyển giữa các project board nhanh, để theo dõi nhiều workflow song song.

---

## 8. SCOPE & NON-GOALS

### In Scope (v1)
- Read-only TUI dashboard
- 6 phòng ban + Management
- Realtime polling từ SQLite
- Multi-board support
- Live event feed

### Non-Goals (v1)
- Không modify/create tasks (read-only)
- Không web/browser version
- Không remote/cloud sync
- Không auth/permissions
- Không notification system (chỉ visual)
- Không historical analytics/trends

---

## 9. RISKS & MITIGATIONS

| Risk | Impact | Probability | Mitigation |
|---|---|---|---|
| SQLite lock contention với Hermes dispatcher | Data stale/crash | Medium | Read-only connection (`mode=ro`), open-close per poll, retry on `SQLITE_BUSY` |
| Emoji render sai trên terminal cũ | Layout broken | Low | Detect terminal capability, fallback to ASCII icons |
| Terminal quá hẹp | UX tệ | Medium | Auto-detect width, compact mode < 100 cols |
| Heartbeat timeout không đồng bộ với dispatcher config | Status sai | Medium | Đọc `kanban.dispatch_stale_timeout_seconds` từ config hoặc hardcode 120s |
| Board structure thay đổi (schema migration) | TUI crash | Low | Defensive column detection, query `PRAGMA table_info` |

---

## 10. METRICS (Success Criteria)

| Metric | Target | Measurement |
|---|---|---|
| Time-to-information | < 2s từ launch đến thấy full office | Manual test |
| Refresh latency | < 200ms per poll cycle | Built-in timer |
| CPU idle | < 5% | `top` monitoring |
| Memory | < 50MB RSS | `ps aux` |
| Setup time | < 30s (`pip install textual && python office_tui.py`) | Manual test |

---

## 11. RELEASE PLAN

| Phase | Scope | Deliverable |
|---|---|---|
| **Phase 1 — MVP** | M1-M8 | Working TUI, single board, auto-refresh |
| **Phase 2 — Polish** | S1-S6 | Block reasons, color coding, compact mode, follow task |
| **Phase 3 — Nice-to-have** | C1-C5 | Animation, sound, dependency graph |

**Definition of Done (Phase 1):**
- [ ] AC-1 through AC-8 pass
- [ ] `python office_tui.py` chạy trên macOS Terminal + iTerm2
- [ ] 3 boards switchable
- [ ] Documentation: README + usage

---

## 12. OPEN QUESTIONS

> Các câu hỏi để thảo luận với Architect (child task t_bbefbc37):

1. **Polling vs SQLite WAL notification?** — Polling 5s đơn giản nhưng có độ trễ. Có nên dùng SQLite update_hook hoặc file watcher cho push-based?
2. **Textual CSS file hay inline?** — Tách `app.tcss` hay style trong code?
3. **Package as pip-installable hay standalone script?** — `pip install hermes-office` hay copy 1 file `.py`?
4. **Profile→Department mapping config?** — Hardcode 6 phòng ban hay đọc từ somewhere?

---

## 13. APPENDIX

### A. Department → Profile Mapping (hardcode cho MVP)

```python
DEPARTMENTS = {
    "Management":  ["ceo"],
    "PM":          ["pm"],
    "BA":          ["ba"],
    "Architect":   ["architect"],
    "Frontend":    ["frontend"],
    "Backend":     ["backend"],
    "QA":          ["qa"],
}
```

### B. Status Icon Set

```python
STATUS_ICONS = {
    "working":  "🟢",
    "waiting":  "⏳",
    "blocked":  "🔴",
    "done":     "✅",
    "idle":     "💤",
}
```

### C. SQL Queries (reference)

**Get all active tasks per board:**
```sql
SELECT t.id, t.title, t.assignee, t.status, t.block_kind,
       t.current_run_id, t.last_heartbeat_at,
       t.started_at, t.priority, t.consecutive_failures,
       r.status AS run_status, r.worker_pid
FROM tasks t
LEFT JOIN task_runs r ON t.current_run_id = r.id
WHERE t.status IN ('todo', 'blocked')
   OR t.current_run_id IS NOT NULL;
```

**Get recent events:**
```sql
SELECT e.kind, e.created_at, e.task_id, t.title
FROM task_events e
JOIN tasks t ON e.task_id = t.id
ORDER BY e.created_at DESC
LIMIT 5;
```

---

*Spec by PM. Tech architecture delegate to Architect (t_bbefbc37). Implementation TBD after architecture approved.*
