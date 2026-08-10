"""Widget render tests — verify markup strings for DeskCard, HeaderBar,
LiveFeed, FooterBar, TaskDetailPanel (AC-1, AC-5, AC-6).

These call render() directly (returns the markup string) without mounting
a full Textual app — fast and deterministic.
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from office_state import (
    DisplayStatus,
    OfficeEvent,
    OfficeSnapshot,
    ProfileState,
    TaskState,
)


def _task(**kw):
    defaults = dict(
        task_id="t_x", title="X task", assignee="backend",
        db_status="todo", block_kind=None, current_run_id=None,
        last_heartbeat_at=None, priority=0, consecutive_failures=0,
        started_at=1000,
    )
    defaults.update(kw)
    return TaskState(**defaults)


# ── DeskCard (AC-1, AC-5) ──────────────────────────────────────────

class TestDeskCard:
    def test_idle_render(self):
        from widgets.desk_card import DeskCard
        c = DeskCard(profile="backend")
        c.update_state(ProfileState("backend", DisplayStatus.IDLE))
        out = c.render()
        assert "💤" in out
        assert "backend" in out
        assert "(no active task)" in out

    def test_working_render_shows_heartbeat(self):
        from widgets.desk_card import DeskCard
        now = int(time.time())
        t = _task(db_status="running", current_run_id=1,
                  last_heartbeat_at=now - 5, started_at=now - 60)
        c = DeskCard(profile="backend")
        c.now = now
        c.update_state(ProfileState("backend", DisplayStatus.WORKING,
                                    active_task=t))
        out = c.render()
        assert "🟢" in out
        assert "running" in out
        assert "♥ 5s ago" in out

    def test_blocked_render_shows_reason(self):
        from widgets.desk_card import DeskCard
        t = _task(db_status="blocked", block_kind="needs_input")
        c = DeskCard(profile="frontend")
        c.update_state(ProfileState("frontend", DisplayStatus.BLOCKED,
                                    active_task=t))
        out = c.render()
        assert "🔴" in out
        assert "needs_input" in out

    def test_blocked_null_kind_shows_blocked_word(self):
        from widgets.desk_card import DeskCard
        t = _task(db_status="blocked", block_kind=None)
        c = DeskCard(profile="frontend")
        c.update_state(ProfileState("frontend", DisplayStatus.BLOCKED,
                                    active_task=t))
        out = c.render()
        assert "🔴" in out
        assert "BLOCKED" in out

    def test_waiting_todo_shows_todo_hint(self):
        from widgets.desk_card import DeskCard
        t = _task(db_status="todo")
        c = DeskCard(profile="pm")
        c.update_state(ProfileState("pm", DisplayStatus.WAITING,
                                    active_task=t))
        out = c.render()
        assert "⏳" in out
        assert "todo" in out

    def test_failure_counter_badge(self):
        """consecutive_failures > 0 → ⚠ N fails badge (C4)."""
        from widgets.desk_card import DeskCard
        t = _task(db_status="running", current_run_id=1,
                  last_heartbeat_at=int(time.time()) - 3,
                  consecutive_failures=2)
        c = DeskCard(profile="backend")
        c.update_state(ProfileState("backend", DisplayStatus.WORKING,
                                    active_task=t))
        out = c.render()
        assert "⚠ 2 fails" in out

    def test_done_badge_for_non_idle(self):
        from widgets.desk_card import DeskCard
        t = _task(db_status="todo")
        c = DeskCard(profile="pm")
        c.update_state(ProfileState("pm", DisplayStatus.WAITING,
                                    active_task=t, done_count=3))
        out = c.render()
        assert "done: 3" in out

    def test_title_truncated_in_render(self):
        from widgets.desk_card import DeskCard
        long_title = "A" * 60
        t = _task(title=long_title, db_status="todo")
        c = DeskCard(profile="pm")
        c.update_state(ProfileState("pm", DisplayStatus.WAITING,
                                    active_task=t))
        out = c.render()
        assert "…" in out


# ── HeaderBar (AC-1, AC-6) ─────────────────────────────────────────

class TestHeaderBar:
    def test_loading_state(self):
        from widgets.header_bar import HeaderBar
        h = HeaderBar(board="ai-company")
        out = h.render()
        assert "HERMES VIRTUAL OFFICE" in out
        assert "loading" in out

    def test_loaded_state_shows_stats(self):
        from widgets.header_bar import HeaderBar
        snap = OfficeSnapshot(board="ai-company")
        snap.active_profiles = 3
        snap.profiles = {"a": 1, "b": 2, "c": 3, "d": 4}
        snap.total_tasks = 10
        h = HeaderBar(board="ai-company")
        h.update_state(snap)
        out = h.render()
        assert "ai-company" in out
        assert "3/4 active" in out
        assert "10 tasks" in out

    def test_error_state_shows_warning(self):
        from widgets.header_bar import HeaderBar
        snap = OfficeSnapshot(board="bad")
        snap.error = "Board not found"
        h = HeaderBar(board="bad")
        h.update_state(snap)
        out = h.render()
        assert "⚠" in out
        assert "Board not found" in out

    def test_set_board_updates_title(self):
        from widgets.header_bar import HeaderBar
        h = HeaderBar(board="old")
        h.set_board("snake-neon")
        out = h.render()
        assert "snake-neon" in out


# ── LiveFeed (AC-6) ────────────────────────────────────────────────

class TestLiveFeed:
    def test_empty_feed(self):
        from widgets.live_feed import LiveFeed
        lf = LiveFeed()
        out = lf.render()
        assert "LIVE FEED" in out
        assert "no events" in out

    def test_feed_shows_events_desc(self):
        from widgets.live_feed import LiveFeed
        now = int(time.time())
        events = [
            OfficeEvent(3, now - 10, "completed", "t1", "Newest", "ba"),
            OfficeEvent(2, now - 60, "claimed", "t2", "Middle", "pm"),
            OfficeEvent(1, now - 300, "created", "t3", "Oldest", "ceo"),
        ]
        lf = LiveFeed()
        lf.update_events(events)
        out = lf.render()
        assert "Newest" in out
        assert "Middle" in out
        assert "Oldest" in out
        # Newest appears before oldest (DESC order = line order)
        assert out.index("Newest") < out.index("Oldest")

    def test_feed_blocked_event_shows_kind(self):
        from widgets.live_feed import LiveFeed
        now = int(time.time())
        events = [
            OfficeEvent(1, now, "blocked", "t1", "B task", "frontend",
                        payload='{"kind":"needs_input"}'),
        ]
        lf = LiveFeed()
        lf.update_events(events)
        out = lf.render()
        assert "needs_input" in out

    def test_feed_long_title_truncated(self):
        from widgets.live_feed import LiveFeed
        now = int(time.time())
        long_title = "Z" * 60
        events = [OfficeEvent(1, now, "created", "t1", long_title, "pm")]
        lf = LiveFeed()
        lf.update_events(events)
        out = lf.render()
        assert "…" in out


# ── FooterBar (AC-4) ───────────────────────────────────────────────

class TestFooterBar:
    def test_shows_board_list(self):
        from widgets.footer_bar import FooterBar
        fb = FooterBar(boards=["ai-company", "snake-neon", "office-tui"],
                       current_board="ai-company")
        out = fb.render()
        assert "ai-company" in out
        assert "snake-neon" in out
        assert "office-tui" in out

    def test_highlights_current_board(self):
        from widgets.footer_bar import FooterBar
        fb = FooterBar(boards=["a", "b", "c"], current_board="b")
        out = fb.render()
        assert "b" in out
        # The current board carries the "»" marker and bold cyan style
        assert "[bold cyan]b[/]" in out
        assert "[»2]" in out

    def test_shows_keybindings(self):
        from widgets.footer_bar import FooterBar
        fb = FooterBar(boards=["a"], current_board="a")
        out = fb.render()
        assert "Refresh" in out
        assert "Follow" in out
        assert "Quit" in out

    def test_set_current_updates(self):
        from widgets.footer_bar import FooterBar
        fb = FooterBar(boards=["a", "b"], current_board="a")
        fb.set_current("b")
        out = fb.render()
        # After switching to "b", it should be highlighted (bold cyan)
        # and carry the "»" current marker
        assert "[bold cyan]b[/]" in out
        assert "[»2]" in out


# ── TaskDetailPanel (AC follow-task modal) ─────────────────────────

class TestTaskDetailPanel:
    def test_build_detail_text_basic(self):
        from widgets.task_detail import TaskDetailPanel
        detail = {
            "id": "t_abc", "title": "My Task", "assignee": "backend",
            "status": "running", "priority": 2, "current_run_id": 5,
            "events": [], "parents": [], "children": [],
        }
        panel = TaskDetailPanel(detail)
        text = panel._build_detail_text()
        assert "My Task" in text
        assert "backend" in text
        assert "running" in text
        assert "[ESC]" in text

    def test_build_detail_with_events_and_deps(self):
        from widgets.task_detail import TaskDetailPanel
        now = int(time.time())
        detail = {
            "id": "t_x", "title": "X", "assignee": "qa", "status": "blocked",
            "priority": 1, "events": [
                {"id": 1, "kind": "created", "created_at": now - 100,
                 "payload": None},
                {"id": 2, "kind": "commented", "created_at": now - 50,
                 "payload": '{"author":"ceo"}'},
            ],
            "parents": ["t_parent"], "children": ["t_child"],
            "block_kind": "needs_input",
        }
        panel = TaskDetailPanel(detail)
        text = panel._build_detail_text()
        assert "Events Timeline" in text
        assert "created" in text
        assert "commented" in text
        assert "ceo" in text
        assert "Dependencies" in text
        assert "t_parent" in text
        assert "t_child" in text
        assert "needs_input" in text
