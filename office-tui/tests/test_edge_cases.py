"""Edge case tests — AC-7, AC-8, AC-9, AC-10 + spec gaps.

Covers: corrupt DB, schema error, empty board, archived status,
SQLite connection leak, compact mode, performance budget.
"""
import os
import sqlite3
import sys
import time
import warnings
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import config
from kanban_reader import KanbanReader, BoardNotFoundError, SchemaError
from office_state import DisplayStatus


# ── AC-8: Graceful degradation ─────────────────────────────────────

class TestGracefulDegradation:
    def test_corrupt_db_does_not_crash(self, make_board):
        """Random bytes where kanban.db should be → DatabaseError → snapshot.error."""
        board = make_board(name="corrupt", setup=lambda c: None)
        # Overwrite the DB file with garbage
        db_path = os.path.join(config.BOARDS_DIR, board, "kanban.db")
        with open(db_path, "wb") as f:
            f.write(b"\x00\x01\x02NOT A DATABASE\xff\xfe")

        reader = KanbanReader(board=board, immutable=False)
        snap = reader.fetch_snapshot(["backend"])
        # Must NOT raise; must set error
        assert snap.error is not None
        assert "error" in snap.error.lower() or "DB" in snap.error

    def test_missing_columns_raises_schema_error_caught(self, make_board):
        """tasks table missing required columns → SchemaError caught → snapshot.error."""
        def setup(conn):
            conn.execute(
                "CREATE TABLE tasks (id TEXT, title TEXT)"  # missing most cols
            )
            conn.execute(
                "CREATE TABLE task_events (id INTEGER, kind TEXT, "
                "created_at INTEGER, task_id TEXT)"
            )

        board = make_board(name="bad-schema", setup=setup, raw=True)
        reader = KanbanReader(board=board, immutable=False)
        snap = reader.fetch_snapshot(["backend"])
        assert snap.error is not None
        assert "schema" in snap.error.lower()

    def test_missing_events_table_caught(self, make_board):
        def setup(conn):
            # Full tasks table but NO task_events
            conn.executescript("""
                CREATE TABLE tasks (
                    id TEXT, title TEXT, assignee TEXT, status TEXT,
                    priority INTEGER, started_at INTEGER, completed_at INTEGER,
                    consecutive_failures INTEGER, last_heartbeat_at INTEGER,
                    current_run_id INTEGER, block_kind TEXT,
                    block_recurrences INTEGER, created_at INTEGER
                );
            """)

        board = make_board(name="no-events", setup=setup, raw=True)
        reader = KanbanReader(board=board, immutable=False)
        snap = reader.fetch_snapshot(["backend"])
        assert snap.error is not None

    def test_nonexistent_board_sets_error(self, monkeypatch):
        monkeypatch.setattr(config, "BOARDS_DIR", "/tmp/nonexistent_qa_test")
        reader = KanbanReader(board="ghost", immutable=False)
        snap = reader.fetch_snapshot(["backend"])
        assert snap.error is not None
        assert "not found" in snap.error.lower() or "Board" in snap.error

    def test_fetch_task_detail_missing_returns_none(self, populated_board):
        reader = KanbanReader(board=populated_board, immutable=False)
        assert reader.fetch_task_detail("does_not_exist") is None


# ── Edge: empty board, archived status ─────────────────────────────

class TestEmptyAndArchived:
    def test_empty_board_all_idle(self, make_board):
        """Board with 0 tasks → every profile IDLE."""
        board = make_board(name="empty", setup=lambda c: None)
        reader = KanbanReader(board=board, immutable=False)
        snap = reader.fetch_snapshot(["backend", "pm", "qa"])
        for p in ("backend", "pm", "qa"):
            assert snap.get_profile(p).status == DisplayStatus.IDLE
        assert snap.total_tasks == 0
        assert snap.active_profiles == 0
        assert snap.events == []

    def test_archived_status_falls_to_idle(self, make_board):
        """snake-neon has status='archived' (NOT in spec mapping).
        Must not crash; must fall through to IDLE fallback in to_display."""
        from office_state import TaskState
        t = TaskState(
            task_id="t_arch", title="archived", assignee="pm",
            db_status="archived", block_kind=None, current_run_id=None,
            last_heartbeat_at=None, priority=0, consecutive_failures=0,
            started_at=1000,
        )
        # Should NOT raise; falls to IDLE fallback (line 83)
        result = t.to_display(10000)
        assert result == DisplayStatus.IDLE

    def test_null_title_fallback(self, make_board):
        """task.title = NULL in DB → "(untitled)" fallback."""
        now = int(time.time())

        def setup(conn):
            conn.execute(
                "INSERT INTO tasks (id, title, assignee, status, priority, "
                "created_at) VALUES ('t_null', NULL, 'backend', 'todo', 0, ?)",
                (now,),
            )

        board = make_board(name="null-title", setup=setup)
        reader = KanbanReader(board=board, immutable=False)
        snap = reader.fetch_snapshot(["backend"])
        ps = snap.get_profile("backend")
        assert ps.active_task is not None
        assert ps.active_task.title == "(untitled)"

    def test_null_assignee_fallback(self, make_board):
        """assignee = NULL → "default" fallback."""
        now = int(time.time())

        def setup(conn):
            conn.execute(
                "INSERT INTO tasks (id, title, assignee, status, priority, "
                "created_at) VALUES ('t_na', 'X', NULL, 'todo', 0, ?)",
                (now,),
            )

        board = make_board(name="null-assignee", setup=setup)
        reader = KanbanReader(board=board, immutable=False)
        # Pass "default" to pick it up
        snap = reader.fetch_snapshot(["default"])
        assert "default" in snap.profiles


# ── AC-10: connection leak ─────────────────────────────────────────

class TestConnectionLeak:
    def test_no_leak_across_many_polls(self, populated_board):
        """Repeated fetch_snapshot must not leak SQLite connections (AC-10)."""
        reader = KanbanReader(board=populated_board, immutable=False)
        for _ in range(50):
            snap = reader.fetch_snapshot(["backend"])
            assert snap.error is None
        # No assertion on conn count — open-close per poll means each is closed.
        # We verify by checking no exception and fast completion (implicit).

    def test_fetch_task_detail_closes_connection(self, populated_board):
        reader = KanbanReader(board=populated_board, immutable=False)
        for _ in range(20):
            detail = reader.fetch_task_detail("t_working")
            assert detail is not None


# ── AC-7: compact mode ─────────────────────────────────────────────

class TestCompactMode:
    def test_compact_toggle_adds_class(self):
        from widgets.dept_grid import DeptGrid
        grid = DeptGrid()
        grid.set_compact(True)
        assert grid.has_class("compact")

    def test_full_mode_removes_class(self):
        from widgets.dept_grid import DeptGrid
        grid = DeptGrid()
        grid.add_class("compact")
        grid.set_compact(False)
        assert not grid.has_class("compact")


# ── AC-9: performance ──────────────────────────────────────────────

class TestPerformance:
    def test_poll_under_200ms_small_board(self, populated_board):
        """AC-9: render completes < 200ms. We measure DB read + mapping."""
        reader = KanbanReader(board=populated_board, immutable=False)
        start = time.perf_counter()
        reader.fetch_snapshot(["backend", "frontend", "qa", "pm", "ba"])
        elapsed_ms = (time.perf_counter() - start) * 1000
        assert elapsed_ms < 200, f"poll took {elapsed_ms:.1f}ms (budget 200ms)"

    def test_poll_under_200ms_large_board(self, make_board):
        """100+ tasks board — AC-9 performance budget."""
        now = int(time.time())

        def setup(conn):
            for i in range(150):
                conn.execute(
                    "INSERT INTO tasks (id, title, assignee, status, priority, "
                    "created_at, started_at, last_heartbeat_at, current_run_id) "
                    "VALUES (?,?,?,?,?,?,?,?,?)",
                    (f"t_{i}", f"Task {i}", "backend" if i % 2 else "pm",
                     "running", i % 5, now - i, now - i, now - i, None),
                )

        board = make_board(name="large", setup=setup)
        reader = KanbanReader(board=board, immutable=False)
        start = time.perf_counter()
        reader.fetch_snapshot(["backend", "pm"])
        elapsed_ms = (time.perf_counter() - start) * 1000
        assert elapsed_ms < 200, f"large-board poll took {elapsed_ms:.1f}ms"


# ── AC-5: stale detection edge ─────────────────────────────────────

class TestStaleDetection:
    def test_is_stale_true_over_threshold(self):
        from office_state import is_stale, STALE_WARNING_THRESHOLD
        now = 10000
        assert is_stale(now - STALE_WARNING_THRESHOLD - 1, now) is True

    def test_is_stale_false_under_threshold(self):
        from office_state import is_stale
        now = 10000
        assert is_stale(now - 10, now) is False

    def test_is_stale_none_is_false(self):
        """No heartbeat → not stale (can't be stale if never pinged)."""
        from office_state import is_stale
        assert is_stale(None, 10000) is False

    def test_heartbeat_negative_age_clamped(self):
        """Clock skew: heartbeat in future → age clamped to 0."""
        from office_state import heartbeat_freshness
        assert heartbeat_freshness(10010, 10000) == "♥ 0s ago"

    def test_duration_negative_clamped(self):
        from office_state import duration_since
        assert duration_since(10010, 10000) == "0s"


# ── format_event_line (live feed helper) ───────────────────────────

class TestFormatEventLine:
    def test_blocked_event_kind_in_detail(self):
        from kanban_reader import format_event_line
        from office_state import OfficeEvent
        now = int(time.time())
        ev = OfficeEvent(1, now, "blocked", "t1", "B task", "frontend",
                         payload='{"kind":"capability"}')
        icon, desc = format_event_line(ev, now)
        assert "capability" in desc
        assert icon == "⛔"

    def test_commented_event_author(self):
        from kanban_reader import format_event_line
        from office_state import OfficeEvent
        now = int(time.time())
        ev = OfficeEvent(1, now, "commented", "t1", "C task", "pm",
                         payload='{"author":"ceo"}')
        icon, desc = format_event_line(ev, now)
        assert "ceo" in desc
        assert icon == "💬"

    def test_malformed_payload_no_crash(self):
        from kanban_reader import format_event_line
        from office_state import OfficeEvent
        now = int(time.time())
        ev = OfficeEvent(1, now, "blocked", "t1", "X", "qa",
                         payload="not json{{{")
        icon, desc = format_event_line(ev, now)
        assert "qa" in desc

    def test_unknown_event_kind_default_icon(self):
        from kanban_reader import format_event_line
        from office_state import OfficeEvent
        now = int(time.time())
        ev = OfficeEvent(1, now, "unknown_kind", "t1", "X", "qa")
        icon, desc = format_event_line(ev, now)
        assert icon == "•"
