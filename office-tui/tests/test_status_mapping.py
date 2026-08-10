"""Unit tests for status mapping logic (architecture §3.5).

Covers the CRITICAL edge case: block_kind=NULL on real blocked tasks must
map to BLOCKED, only block_kind='dependency' → WAITING.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from office_state import (
    DisplayStatus,
    TaskState,
    ProfileState,
    get_profile_display,
    heartbeat_freshness,
    duration_since,
    truncate,
    HEARTBEAT_STALE_THRESHOLD,
)


def make_task(**kw) -> TaskState:
    defaults = dict(
        task_id="t_test",
        title="Test task",
        assignee="backend",
        db_status="todo",
        block_kind=None,
        current_run_id=None,
        last_heartbeat_at=None,
        priority=0,
        consecutive_failures=0,
        started_at=1000,
    )
    defaults.update(kw)
    return TaskState(**defaults)


NOW = 10000


# ── AC-2: Status mapping ──────────────────────────────────────────

class TestStatusMapping:
    def test_done(self):
        t = make_task(db_status="done")
        assert t.to_display(NOW) == DisplayStatus.DONE

    def test_working_fresh_heartbeat(self):
        t = make_task(
            db_status="running",
            current_run_id=1,
            last_heartbeat_at=NOW - 10,
        )
        assert t.to_display(NOW) == DisplayStatus.WORKING

    def test_working_stale_heartbeat_becomes_waiting(self):
        t = make_task(
            db_status="running",
            current_run_id=1,
            last_heartbeat_at=NOW - HEARTBEAT_STALE_THRESHOLD - 5,
        )
        assert t.to_display(NOW) == DisplayStatus.WAITING

    def test_working_no_heartbeat_becomes_waiting(self):
        """current_run_id non-null but no heartbeat at all → waiting."""
        t = make_task(db_status="running", current_run_id=1, last_heartbeat_at=None)
        assert t.to_display(NOW) == DisplayStatus.WAITING

    def test_blocked_with_dependency_is_waiting(self):
        """block_kind='dependency' → WAITING (chờ parent)."""
        t = make_task(db_status="blocked", block_kind="dependency")
        assert t.to_display(NOW) == DisplayStatus.WAITING

    def test_blocked_with_null_kind_is_blocked(self):
        """CRITICAL: block_kind=NULL → BLOCKED thật (not waiting)."""
        t = make_task(db_status="blocked", block_kind=None)
        assert t.to_display(NOW) == DisplayStatus.BLOCKED

    def test_blocked_with_needs_input_is_blocked(self):
        t = make_task(db_status="blocked", block_kind="needs_input")
        assert t.to_display(NOW) == DisplayStatus.BLOCKED

    def test_blocked_with_capability_is_blocked(self):
        t = make_task(db_status="blocked", block_kind="capability")
        assert t.to_display(NOW) == DisplayStatus.BLOCKED

    def test_blocked_with_transient_is_blocked(self):
        t = make_task(db_status="blocked", block_kind="transient")
        assert t.to_display(NOW) == DisplayStatus.BLOCKED

    def test_todo_is_waiting(self):
        t = make_task(db_status="todo")
        assert t.to_display(NOW) == DisplayStatus.WAITING


# ── Profile aggregation ───────────────────────────────────────────

class TestProfileDisplay:
    def test_no_tasks_is_idle(self):
        ps = get_profile_display("backend", [], done_count=0, now=NOW)
        assert ps.status == DisplayStatus.IDLE
        assert ps.active_task is None
        assert ps.done_count == 0

    def test_picks_highest_priority_active(self):
        t_low = make_task(task_id="low", priority=1, db_status="todo")
        t_high = make_task(task_id="high", priority=5, db_status="blocked",
                           block_kind="needs_input")
        ps = get_profile_display("backend", [t_low, t_high], done_count=2, now=NOW)
        assert ps.status == DisplayStatus.BLOCKED
        assert ps.active_task.task_id == "high"
        assert ps.done_count == 2

    def test_ignores_done_tasks_for_active(self):
        t_done = make_task(task_id="d", db_status="done")
        t_active = make_task(task_id="a", db_status="todo")
        ps = get_profile_display("ba", [t_done, t_active], done_count=5, now=NOW)
        assert ps.status == DisplayStatus.WAITING
        assert ps.active_task.task_id == "a"
        assert ps.done_count == 5

    def test_all_done_is_idle(self):
        t = make_task(db_status="done")
        ps = get_profile_display("pm", [t], done_count=1, now=NOW)
        assert ps.status == DisplayStatus.IDLE


# ── Formatting helpers ────────────────────────────────────────────

class TestFormatting:
    def test_heartbeat_none(self):
        assert heartbeat_freshness(None, NOW) == "♥ —"

    def test_heartbeat_recent(self):
        assert heartbeat_freshness(NOW - 10, NOW) == "♥ 10s ago"

    def test_heartbeat_minutes(self):
        assert heartbeat_freshness(NOW - 70, NOW) == "♥ 1m ago"

    def test_heartbeat_stale(self):
        assert heartbeat_freshness(NOW - 200, NOW) == "⚠ stale (3m)"

    def test_duration_seconds(self):
        assert duration_since(NOW - 30, NOW) == "30s"

    def test_duration_minutes(self):
        assert duration_since(NOW - 125, NOW) == "2m"

    def test_duration_none(self):
        assert duration_since(None, NOW) == ""

    def test_truncate_short(self):
        assert truncate("hello", 10) == "hello"

    def test_truncate_long(self):
        assert truncate("hello world", 8) == "hello w…"
