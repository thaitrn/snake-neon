# Virtual Office TUI — Technical Architecture

> **Doc ID:** office-tui-architecture  
> **Owner:** Architect  
> **Status:** Draft v1.0  
> **Date:** 2026-08-09  
> **Spec ref:** `docs/office-tui-spec.md` (PRD v1.0)

---

## 0. TÓM TẮT KIẾN TRÚC (Executive Summary)

**Virtual Office TUI** là một read-only terminal dashboard hiển thị realtime "sơ đồ văn phòng ảo" cho Hermes multi-agent system. Mỗi profile (ceo/pm/ba/architect/frontend/backend/qa) xuất hiện như một desk card trong phòng ban tương ứng, cho thấy trạng thái working/waiting/blocked/done/idle và heartbeat freshness.

**Kiến trúc cốt lõi:**

```
┌──────────────────────────────────────────────────────────────┐
│                    Textual App (asyncio loop)                 │
│                                                               │
│  ┌──────────────┐    ┌───────────────────┐                   │
│  │  PollWorker   │───▶│   OfficeState      │  ← reactive      │
│  │ (5s interval) │    │  (snapshot model)  │     triggers      │
│  └──────────────┘    └────────┬──────────┘     re-render      │
│         │                      │                               │
│         │ read-only            │ watch                         │
│         ▼                      ▼                               │
│  kanban.db ◄──────── KabanReader                              │
│  (mode=ro)                                                    │
│                                                               │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                    Render Layer                           │ │
│  │  HeaderBar  |  DeptGrid  |  LiveFeed  |  FooterBar       │ │
│  │              (desk cards)  (events)                        │ │
│  │  TaskDetailPanel (modal overlay)                          │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**Một câu:** Python + Textual, polling SQLite read-only mỗi 5 giây, reactive state → dirty-region re-render.

---

## 1. TECH STACK — QUYẾT ĐỊNH

### 1.1 Stack đã chọn

| Layer | Công nghệ | Lý do |
|---|---|---|
| **Language** | Python 3.11+ | Hermes core là Python; sqlite3 stdlib built-in |
| **TUI Framework** | Textual ≥0.47 | Async-native, CSS styling, reactive widgets, composable — mature nhất cho Python TUI |
| **Terminal rendering** | Rich (Textual dep) | Panel, Table, Box-drawing, truecolor, emoji |
| **DB access** | sqlite3 (stdlib) | Zero-dependency, `mode=ro` read-only safety |
| **Packaging** | Standalone script + optional pip | Single-file `office_tui.py` cho MVP, `pyproject.toml` cho P1+ |

### 1.2 Lý do chọn Textual (vì sao KHÔNG chọn alternatives)

**Blessed (Node.js) — loại vì:**
- Cần Node runtime riêng — friction cài đặt trên macOS
- `better-sqlite3` = native addon, phải compile bằng `node-gyp` (pain trên Apple Silicon)
- Unicode/emoji rendering không ổn định bằng Python

**Bubbletea (Go) — loại vì:**
- Single binary đẹp nhưng cần Go toolchain để dev
- Feedback loop chậm hơn (compile step)
- Ecosystem xa Hermes Python core

**Rich thuần (không Textual) — loại vì:**
- Chỉ render snapshot, không có event loop / reactive / async
- Không hỗ trợ layout composition (panels lồng nhau)
- Mỗi refresh = full-screen clear → flicker, vi phạm AC-3

**Textual thắng vì:** asyncio-native (polling tự nhiên), reactive properties (state → auto re-render), CSS separation (Textual CSS), async timers built-in, và deep integration với Rich rendering engine.

### 1.3 Phụ thuộc (dependencies)

```toml
# pyproject.toml [project.dependencies]
dependencies = [
    "textual>=0.47",   # pulls rich automatically
]
# sqlite3 = stdlib, không cần install
# Python ≥3.11 (đã có trên máy: 3.11.4)
```

**Không cần:** requests, aiosqlite, SQLAlchemy, click. Mọi thứ khác là stdlib (asyncio, sqlite3, os, time, dataclasses, pathlib).

---

## 2. ARCHITECTURE DIAGRAM

### 2.1 Component Architecture

```
                    ┌─────────────────┐
                    │   OfficeTUI     │  ← Textual App (entry point)
                    │   (App class)   │
                    └───────┬─────────┘
                            │ compose()
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
     ┌──────────────┐ ┌──────────┐ ┌──────────────┐
     │  HeaderBar   │ │ DeptGrid │ │  FooterBar   │
     │  (Widget)    │ │ (Widget) │ │  (Widget)    │
     └──────────────┘ └────┬─────┘ └──────────────┘
                           │ children
              ┌────────────┼────────────┐
              ▼            ▼            ▼
     ┌──────────────┐ ┌──────────┐ ┌──────────────┐
     │ DeptSection  │ │DeptSection│ │ DeptSection  │
     │ (Management) │ │   (PM)   │ │ (Architect)  │
     └──────┬───────┘ └────┬─────┘ └──────┬───────┘
            │ children      │              │
            ▼               ▼              ▼
     ┌──────────────┐ ┌──────────┐ ┌──────────────┐
     │  DeskCard    │ │ DeskCard │ │  DeskCard    │
     │  (Widget)    │ │          │ │              │
     └──────────────┘ └──────────┘ └──────────────┘

     ┌──────────────┐                      ┌──────────────────┐
     │  LiveFeed    │  ◄── events          │  TaskDetailPanel │
     │  (Widget)    │                      │  (Modal Screen)  │
     └──────────────┘                      └──────────────────┘

────────────────────────────────────────────────────────────────
                    DATA LAYER (below render)
────────────────────────────────────────────────────────────────

     ┌──────────────────┐     poll()     ┌─────────────────┐
     │   PollWorker      │ ────────────▶ │  KanbanReader    │
     │  (asyncio task)   │               │  (DB access)     │
     │  interval: 5s     │ ◄─────────── │  mode=ro         │
     └────────┬─────────┘   OfficeState  └────────┬────────┘
              │                                     │
              ▼                                     ▼
     ┌──────────────────┐               ┌─────────────────┐
     │   OfficeState     │               │  kanban.db       │
     │  (reactive model) │               │  (SQLite, local) │
     └──────────────────┘               └─────────────────┘
```

### 2.2 Data Flow

```
   ┌─────────┐     ┌──────────────┐     ┌───────────────┐     ┌───────────┐
   │ Timer   │────▶│ PollWorker   │────▶│ KanbanReader  │────▶│ OfficeState│
   │ (5s)    │     │ async task   │     │ SQL queries   │     │ reactive   │
   └─────────┘     └──────────────┘     └───────────────┘     └─────┬─────┘
                                                                    │
                                              ┌─────────────────────┤
                                              │  watch_office_state │
                                              │  (reactive trigger)  │
                                              ▼                     ▼
                                    ┌──────────────┐     ┌──────────────┐
                                    │  DeptGrid    │     │  LiveFeed    │
                                    │  + DeskCards │     │  re-render   │
                                    │  re-render   │     └──────────────┘
                                    └──────────────┘
```

---

## 3. DATA MODEL — KẾT NỐI KANBAN DB

### 3.1 DB Discovery (đã khảo sát thực tế)

**Path resolution:**

```python
KANBAN_HOME = os.path.expanduser("~/.hermes/kanban")
BOARDS_DIR = f"{KANBAN_HOME}/boards"
# Mỗi board: {BOARDS_DIR}/{board_name}/kanban.db
```

**Boards phát hiện (2026-08-09):**
- `ai-company` (151 KB, 10 tasks, 50 events)
- `snake-neon` (364 KB)
- `office-tui` (118 KB)

Auto-discovery: quét thư mục `boards/*/kanban.db`.

### 3.2 Connection Strategy

**QUYẾT ĐỊNH: Polling 5s + open-close per poll (KHÔNG dùng WAL push)**

Lý do:
1. **Journal mode = `delete`** (đã verify, không phải WAL). Hermes dispatcher dùng rollback journal, nên `update_hook`/WAL notification không khả dụng.
2. **`immutable=1`** bypass page-cache invalidation overhead — an toàn vì TUI chỉ read.
3. **Open-close per poll** tránh giữ connection → zero lock contention với dispatcher.
4. Polling 5s đáp ứng AC-3 (refresh < 5s latency).

**Connection string:**

```python
def open_db(board: str) -> sqlite3.Connection:
    path = f"{BOARDS_DIR}/{board}/kanban.db"
    if not os.path.exists(path):
        raise BoardNotFoundError(board)
    uri = f"file:{path}?mode=ro&immutable=1"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    return conn
```

**Lưu ý `immutable=1`:** Vì DB đang ở journal_mode=delete, file trên disk không thay đổi giữa snapshot của Hermes. `immutable=1` nói với SQLite "đừng invalidate cache, file không đổi" — an toàn vì dispatcher ghi bản mới atomic (SQLite default). Nếu board được ghi trong khi TUI đang đọc snapshot cũ, poll tiếp theo (5s sau) sẽ thấy bản mới. Không có data corruption vì SQLite dùng WAL-internal hoặc rollback journal atomic writes.

**Fallback nếu `immutable=1` gây stale:** Chuyển sang `mode=ro` (không immutable), chấp nhận overhead page-cache check nhẹ. Cấu hình qua flag `--no-immutable`.

### 3.3 Schema (đã verify)

```
tasks (35 columns, sử dụng chính)
├── id TEXT PK                    -- "t_bbefbc37"
├── title TEXT                    -- tên task
├── assignee TEXT                 -- profile → map phòng ban
├── status TEXT                   -- todo|running|blocked|done
├── block_kind TEXT               -- dependency|needs_input|capability|transient|NULL
├── block_recurrences INTEGER     -- số lần block liên tiếp
├── current_run_id INTEGER        -- non-NULL = đang chạy
├── last_heartbeat_at INTEGER     -- epoch seconds
├── started_at INTEGER            -- epoch
├── completed_at INTEGER          -- epoch
├── priority INTEGER              -- cao = ưu tiên
├── consecutive_failures INTEGER  -- circuit breaker
└── ... (25 cột khác không dùng)

task_runs (15 columns, runtime detail)
├── id INTEGER PK
├── task_id TEXT FK
├── profile TEXT
├── status TEXT                   -- running|done|blocked|crashed|timed_out|failed
├── worker_pid INTEGER            -- PID thật
├── last_heartbeat_at INTEGER     -- heartbeat của run cụ thể
└── outcome TEXT                  -- completed|blocked|crashed|timed_out|spawn_failed

task_events (6 columns, activity log)
├── id INTEGER PK
├── task_id TEXT
├── kind TEXT                     -- created|claimed|spawned|heartbeat|blocked|completed|commented
├── payload TEXT (JSON)           -- metadata của event
└── created_at INTEGER

task_links (2 columns, dependency graph)
├── parent_id TEXT
└── child_id TEXT
```

### 3.4 SQL Queries

**Get office snapshot (all active tasks per board):**

```sql
SELECT
    t.id, t.title, t.assignee, t.status, t.block_kind,
    t.block_recurrences, t.current_run_id, t.priority,
    t.consecutive_failures, t.last_heartbeat_at,
    t.started_at, t.completed_at,
    r.status   AS run_status,
    r.worker_pid AS run_pid,
    r.last_heartbeat_at AS run_heartbeat
FROM tasks t
LEFT JOIN task_runs r ON t.current_run_id = r.id
WHERE t.status IN ('todo', 'blocked')
   OR t.current_run_id IS NOT NULL
   OR t.status = 'done' AND t.completed_at > :recent_threshold
ORDER BY t.assignee, t.priority DESC, t.created_at DESC;
```

`recent_threshold = now - 3600` — hiển thị task done trong 1 giờ gần nhất cho badge "done: N".

**Count done tasks per profile (badge):**

```sql
SELECT assignee, COUNT(*) AS done_count
FROM tasks
WHERE status = 'done'
GROUP BY assignee;
```

**Get recent events (live feed):**

```sql
SELECT e.id, e.kind, e.created_at, e.task_id, t.title, t.assignee, e.payload
FROM task_events e
JOIN tasks t ON e.task_id = t.id
ORDER BY e.created_at DESC
LIMIT 5;
```

**Get parent tasks (cho follow-task dependency display):**

```sql
SELECT parent_id FROM task_links WHERE child_id = :task_id;
SELECT child_id  FROM task_links WHERE parent_id = :task_id;
```

### 3.5 Status Mapping Logic (đã verify với dữ liệu thực tế)

**PHÁT HIỆN QUAN TRỌNG:** Trên dữ liệu thực tế, `block_kind = NULL` cho mọi task blocked (không chỉ dependency). Logic phải xử lý NULL:

```python
from dataclasses import dataclass
from enum import Enum
import time

class DisplayStatus(Enum):
    WORKING = "🟢"
    WAITING = "⏳"
    BLOCKED = "🔴"
    DONE    = "✅"
    IDLE    = "💤"

HEARTBEAT_STALE_THRESHOLD = 120  # seconds
STALE_WARNING_THRESHOLD   = 120  # seconds (AC-5)

@dataclass
class TaskState:
    task_id: str
    title: str
    assignee: str
    db_status: str          # raw status from DB
    block_kind: str | None
    current_run_id: int | None
    last_heartbeat_at: int | None
    priority: int
    consecutive_failures: int
    started_at: int | None

    def to_display(self, now: int) -> DisplayStatus:
        # 1. Done
        if self.db_status == 'done':
            return DisplayStatus.DONE

        # 2. Working — current_run_id non-null + heartbeat fresh
        if self.current_run_id is not None:
            if self.last_heartbeat_at and (now - self.last_heartbeat_at) < HEARTBEAT_STALE_THRESHOLD:
                return DisplayStatus.WORKING
            else:
                return DisplayStatus.WAITING  # stale run

        # 3. Blocked
        if self.db_status == 'blocked':
            # block_kind='dependency' → waiting (chờ parent)
            # block_kind=NULL hoặc khác → blocked thật
            if self.block_kind == 'dependency':
                return DisplayStatus.WAITING
            return DisplayStatus.BLOCKED

        # 4. Todo (chưa dispatch)
        if self.db_status == 'todo':
            return DisplayStatus.WAITING

        # 5. Fallback
        return DisplayStatus.IDLE


def get_profile_display(profile: str, tasks: list[TaskState], now: int) -> tuple[DisplayStatus, TaskState | None]:
    """Trả về display status + task nổi bật nhất cho 1 profile."""
    active = [t for t in tasks if t.db_status != 'done']
    if not active:
        return DisplayStatus.IDLE, None

    # Priority cao nhất, rồi mới recency
    best = max(active, key=lambda t: (t.priority, t.started_at or 0))
    return best.to_display(now), best
```

**Edge cases đã xử lý:**
- `block_kind = NULL` (phổ biến trên dữ liệu thật) → treated as blocked thật
- `current_run_id` non-null nhưng heartbeat stale → WAITING (có thể worker đã chết)
- Profile có nhiều task active → hiển thị task priority cao nhất
- `consecutive_failures > 0` → badge "⚠ N fails" (C4, P2)

---

## 4. RENDER LOOP DESIGN

### 4.1 Polling Loop

```python
class OfficeTUI(App):
    POLL_INTERVAL = 5  # seconds (AC-3)

    async def on_mount(self) -> None:
        self.office_state = OfficeState(board=self.current_board)
        await self.poll_once()           # initial load
        self.poll_timer = self.set_interval(
            self.POLL_INTERVAL,
            self.poll_once,
        )

    async def poll_once(self) -> None:
        """Fetch snapshot from DB → update reactive state → auto re-render."""
        try:
            snapshot = self.reader.fetch_snapshot()
            self.office_state = snapshot  # reactive trigger
        except sqlite3.OperationalError as e:
            # SQLITE_BUSY: dispatcher đang ghi → retry next tick
            self.notify(f"⚠ DB busy, retrying... ({e})", severity="warning")
        except BoardNotFoundError:
            self.notify(f"⚠ Board not found: {self.current_board}", severity="error")
```

### 4.2 Reactive Re-render

Textual's reactive properties tự động trigger `watch_*` methods → chỉ re-render widget bị ảnh hưởng (dirty region), không full-screen clear. Điều này thoả AC-3 ("không flicker toàn màn").

```python
class OfficeTUI(App):
    office_state: reactive[OfficeState] = reactive(OfficeState(), recompose=True)

    def watch_office_state(self, new_state: OfficeState) -> None:
        """Triggered khi office_state thay đổi → update child widgets."""
        self.query_one(HeaderBar).update_state(new_state)
        self.query_one(DeptGrid).update_state(new_state)
        self.query_one(LiveFeed).update_events(new_state.events)
```

### 4.3 Heartbeat Sub-second Freshness

Heartbeat freshness ("♥ 3s ago") cần cập nhật mượt hơn 5s poll. Dùng 1 timer riêng 1s:

```python
    async def on_mount(self) -> None:
        ...
        self.heartbeat_timer = self.set_interval(1, self._tick_heartbeat)

    def _tick_heartbeat(self) -> None:
        """Re-render chỉ desk cards (cheap) để update 'N seconds ago'."""
        for card in self.query(DeskCard):
            card.refresh_heartbeat()
```

### 4.4 Performance Budget (AC-9)

| Operation | Budget | Actual (est.) |
|---|---|---|
| SQL query (10-100 tasks) | < 5ms | ~1-3ms (local SQLite) |
| Status mapping | < 1ms | < 0.5ms |
| Widget re-render (dirty region) | < 50ms | ~10-30ms |
| Total per poll cycle | < 200ms | ~15-35ms |
| CPU idle (between polls) | < 5% | ~0% (sleep) |
| Memory RSS | < 50MB | ~25-35MB |

---

## 5. MODULE STRUCTURE

```
office-tui/
├── office_tui.py              # Entry point (≤50 lines): arg parsing, App launch
├── src/
│   ├── __init__.py
│   ├── app.py                 # OfficeTUI(App) — compose, timers, bindings
│   ├── kanban_reader.py       # KanbanReader — DB access, SQL, snapshot builder
│   ├── office_state.py        # OfficeState dataclass + status mapping logic
│   ├── widgets/
│   │   ├── __init__.py
│   │   ├── header_bar.py      # HeaderBar — title, clock, summary stats
│   │   ├── dept_grid.py       # DeptGrid — responsive layout container
│   │   ├── dept_section.py    # DeptSection — 1 phòng ban (Management, PM, ...)
│   │   ├── desk_card.py       # DeskCard — 1 profile card (core widget)
│   │   ├── live_feed.py       # LiveFeed — 5 events mới nhất
│   │   ├── footer_bar.py      # FooterBar — keybindings help, board switcher
│   │   └── task_detail.py     # TaskDetailPanel — modal follow-task view
│   └── config.py              # DEPARTMENTS, constants, CLI args
├── office.tcss                # Textual CSS (styling)
├── tests/
│   ├── test_status_mapping.py # Unit tests for Section 3.5 logic
│   ├── test_kanban_reader.py  # Unit tests with temp SQLite DB
│   └── test_snapshot.py       # Integration: reader + state
└── pyproject.toml
```

### 5.1 Lý do tách module

| Module | Trách nhiệm | Lý do tách |
|---|---|---|
| `kanban_reader.py` | Đọc DB, SQL, parse Row → dataclass | Tách DB access khỏi UI → testable độc lập (testable với temp DB) |
| `office_state.py` | Business logic: status mapping, profile aggregation | Pure logic, unit test nhanh, không cần Textual/DB |
| `widgets/` | Rendering | Mỗi widget tự-contained, composable, reusable |
| `office.tcss` | Styling | CSS tách file — câu trả lời open-question #2 (xem §7) |

### 5.2 Entry Point

```python
#!/usr/bin/env python3
"""Virtual Office TUI — Hermes multi-agent dashboard."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from app import OfficeTUI  # noqa: E402

if __name__ == "__main__":
    app = OfficeTUI()
    app.run()
```

---

## 6. KEY DESIGN DECISIONS

### 6.1 Polling 5s (không push-based)

**Quyết định:** Polling 5s với open-close per poll.

**Bác bỏ push-based vì:**
1. journal_mode=delete → SQLite update_hook chỉ hoạt động trong cùng connection → không khả dụng cross-process
2. File watcher (watchdog/FSEvents) thêm dependency + phức tạp, overkill cho N=10 tasks
3. 5s latency thoả AC-3 ("trong vòng 5 giây")
4. Open-close per poll = zero lock contention, zero leaked connections (AC-10)

### 6.2 Read-only connection (`mode=ro&immutable=1`)

- `mode=ro` — SQLite từ chối mọi write attempt, physical safety
- `immutable=1` — skip page-cache check, faster + zero lock (AC-9 performance)
- Open per poll, close sau query — không giữ connection (AC-10: no leak)

### 6.3 Textual CSS tách file

**Quyết định:** File `office.tcss` riêng (không inline).

Lý do:
- Styling (màu, border, padding) thay đổi thường trong polish phase
- Textual CSS tách file cho phép hot-reload trong dev mode (`--dev` flag)
- Giữ widget code tập trung vào logic, không lẫn styling
- Dễ theme (dark/light/retro) — swap CSS file

### 6.4 Department → Profile Mapping

**Quyết định:** Hardcode trong `config.py` cho MVP (Section 13A của spec).

```python
DEPARTMENTS = {
    "Management": {"icon": "👔", "profiles": ["ceo"]},
    "PM":         {"icon": "📋", "profiles": ["pm"]},
    "BA":         {"icon": "📊", "profiles": ["ba"]},
    "Architect":  {"icon": "🏗", "profiles": ["architect"]},
    "Frontend":   {"icon": "🎨", "profiles": ["frontend"]},
    "Backend":    {"icon": "⚙",  "profiles": ["backend"]},
    "QA":         {"icon": "🧪", "profiles": ["qa"]},
}
```

P2: đọc từ `~/.hermes/config` nếu có `departments` key, fallback hardcode. Đặt key vào config là YAGNI cho MVP — hiện chỉ 8 profiles cố định.

### 6.5 Distribution: Standalone script cho MVP

**Quyết định:** `pip install textual && python office_tui.py` cho MVP (AC: setup < 30s).

P1: full `pyproject.toml` + `pip install hermes-office` từ PyPI hoặc local.

Lý do: KISS — Sếp chỉ cần 2 lệnh để chạy. P1 packaging là nice-to-have.

---

## 7. GIẢI ĐÁP OPEN QUESTIONS (từ spec §12)

| # | Question | Answer |
|---|---|---|
| 1 | Polling 5s vs WAL push? | **Polling 5s.** journal_mode=delete → push không khả thi. Open-close per poll tránh lock contention. |
| 2 | Textual CSS file hay inline? | **File riêng** (`office.tcss`). Hot-reload dev, themable, tách concern. |
| 3 | pip-installable hay standalone? | **Standalone cho MVP**, pip-installable P1. KISS — 2 lệnh setup. |
| 4 | Department mapping hardcode hay config? | **Hardcode** cho MVP (8 profiles cố định). Config file P2 nếu team mở rộng. |

---

## 8. ACCEPTANCE CRITERIA TRACEABILITY

| AC | Requirement | Architecture element |
|---|---|---|
| AC-1 | Office grid, 7 phòng ban, desk cards | §2.1 DeptGrid → DeptSection → DeskCard |
| AC-2 | Status mapping chính xác | §3.5 `TaskState.to_display()` + `get_profile_display()` |
| AC-3 | Realtime refresh < 5s, no flicker | §4.1 PollWorker 5s + §4.2 reactive dirty-region |
| AC-4 | Multi-board switching | §3.1 board auto-discovery + footer keybindings |
| AC-5 | Heartbeat freshness "♥ Ns ago" | §4.3 1s heartbeat timer + DeskCard.refresh_heartbeat() |
| AC-6 | Live feed 5 events | §3.4 events SQL + LiveFeed widget |
| AC-7 | Compact mode < 100 cols | §9.1 responsive layout (Textual responsive grid) |
| AC-8 | Graceful degradation (corrupt DB) | §3.2 BoardNotFoundError + try/except in poll_once |
| AC-9 | Perf: < 200ms, < 5% CPU, < 50MB | §4.4 performance budget |
| AC-10 | Quit clean, restore terminal | Textual handles terminal restore on exit + close conn per poll |

---

## 9. ADDITIONAL TECHNICAL DETAILS

### 9.1 Responsive Layout (Compact Mode)

Textual hỗ trợ responsive layout qua CSS media-like queries:

```css
/* office.tcss */
DeptGrid {
    layout: grid;
    grid-size: 3 3;          /* 3 cols x 3 rows (full mode) */
    grid-gutter: 1;
}

@media (max-width: 100) {
    DeptGrid {
        grid-size: 1;        /* single column (compact mode) */
    }
    DeskCard {
        height: 3;           /* condensed card */
    }
}
```

Auto-switch full ↔ compact khi resize terminal — Textual reactive layout.

### 9.2 Event Payload Parsing

```python
import json

EVENT_ICONS = {
    "created":   "🆕",
    "claimed":   "🔒",
    "spawned":   "🚀",
    "heartbeat": "💗",
    "blocked":   "⛔",
    "completed": "✅",
    "commented": "💬",
}

def format_event(row: sqlite3.Row) -> str:
    icon = EVENT_ICONS.get(row["kind"], "•")
    ts = format_time(row["created_at"])
    title = truncate(row["title"], 40)
    payload = json.loads(row["payload"]) if row["payload"] else {}
    detail = ""
    if row["kind"] == "blocked":
        detail = f" ({payload.get('kind', 'unknown')})"
    elif row["kind"] == "commented":
        detail = f" by {payload.get('author', '?')}"
    return f"{ts}  {icon} {row['assignee']}{detail}: {title}"
```

### 9.3 Stale Detection (S5)

```python
def heartbeat_freshness(last_hb: int | None, now: int) -> str:
    if last_hb is None:
        return "♥ —"
    age = now - last_hb
    if age < 60:
        return f"♥ {age}s ago"
    elif age < STALE_WARNING_THRESHOLD:
        return f"♥ {age // 60}m ago"
    else:
        return f"⚠ stale ({age // 60}m)"
```

### 9.4 Follow Task (S6) — Modal Detail

Nhấn `f` → mở `TaskDetailPanel` (modal Screen overlay):

```
┌─ Task Detail: t_bbefbc37 ─────────────────────────┐
│                                                    │
│  📋 Architect: Design Office TUI Tech Stack       │
│  Assignee: architect   Status: running             │
│  Priority: 0          Run: #2                     │
│                                                    │
│  📊 Events Timeline:                               │
│    [50] 15:32:08  created                          │
│    [49] 15:31:27  commented (by pm, 1386 chars)    │
│    [48] 15:31:35  promoted                         │
│    [47] 15:32:05  claimed (lock expires 15:47)     │
│    [46] 15:32:05  spawned (pid 15504)              │
│    [45] 15:32:08  heartbeat                        │
│                                                    │
│  🔗 Dependencies:                                  │
│    Parents: t_81abf5b9 (PM: spec)                  │
│    Children: t_63313d0a (Frontend: implement)      │
│                                                    │
│  [ESC] Close                                       │
└────────────────────────────────────────────────────┘
```

### 9.5 Error Handling & Defensive Schema

```python
class KanbanReader:
    REQUIRED_COLUMNS = {
        'tasks': ['id', 'title', 'assignee', 'status', 'current_run_id', ...],
        'task_events': ['id', 'kind', 'created_at', 'task_id'],
    }

    def fetch_snapshot(self) -> OfficeState:
        conn = self.open_db()           # may raise BoardNotFoundError
        try:
            self._validate_schema(conn) # PRAGMA table_info check
            # ... queries
        finally:
            conn.close()                # always close (AC-10)
```

`_validate_schema` chạy `PRAGMA table_info(tasks)` và check required columns tồn tại — xử lý schema migration (Risk trong spec §9).

---

## 10. RISKS & MITIGATIONS (architecture-specific)

| Risk | Impact | Mitigation |
|---|---|---|
| `immutable=1` đọc stale data nếu dispatcher ghi giữa polls | Status sai trong ≤5s | Acceptable latency; poll tiếp theo tự sửa. Fallback `--no-immutable`. |
| Textual version incompatible (API break) | App crash | Pin `textual>=0.47,<1.0` in pyproject; test on install |
| Terminal không support truecolor/emoji | Layout broken | Textual auto-detect capability; Rich fallback to 16-color |
| DB schema migration (Hermes update) | Query fail | `_validate_schema` + defensive column detection (§9.5) |
| Polling during heavy dispatcher write → SQLITE_BUSY | Missing 1 poll cycle | Catch `OperationalError`, retry next tick (§4.1) |

---

## 11. BUILD & RUN

### MVP setup

```bash
pip install textual
python office_tui.py
```

### CLI flags

```bash
python office_tui.py [--board ai-company] [--interval 5] [--no-immutable] [--dev]
```

| Flag | Default | Description |
|---|---|---|
| `--board` | auto (first found) | Board name to display |
| `--interval` | 5 | Poll interval in seconds |
| `--no-immutable` | false | Use `mode=ro` without `immutable=1` |
| `--dev` | false | Enable Textual dev mode (CSS hot-reload) |

---

## 12. SUMMARY TABLE

| Khía cạnh | Quyết định |
|---|---|
| Language | Python 3.11+ |
| TUI Framework | Textual ≥0.47 |
| Rendering | Rich (Textual dep) |
| DB | sqlite3 stdlib, `mode=ro&immutable=1` |
| Polling | 5s interval, open-close per poll |
| State | Reactive dataclass (`OfficeState`) |
| Styling | Textual CSS file (`office.tcss`) |
| Layout | Responsive grid (full/compact auto-switch) |
| Distribution | Standalone script MVP → pip P1 |
| Dependencies | `textual` only (rich auto-installed) |
| Module count | 9 Python modules + 1 CSS + 1 entry |

---

*Architecture by Architect. Implementation handoff: child task t_63313d0a (Frontend).*
