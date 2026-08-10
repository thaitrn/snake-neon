"""OfficeTUI — Textual App entry point.

Architecture §4 — polling 5s, reactive OfficeState, dirty-region re-render.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

from textual import work
from textual.app import App, ComposeResult
from textual.binding import Binding

from config import (
    ALL_PROFILES,
    DEPARTMENTS,
    HEARTBEAT_TICK_INTERVAL,
    discover_boards,
)
from kanban_reader import KanbanReader
from office_state import OfficeSnapshot
from widgets.dept_grid import DeptGrid
from widgets.desk_card import DeskCard
from widgets.footer_bar import FooterBar
from widgets.header_bar import HeaderBar
from widgets.live_feed import LiveFeed
from widgets.task_detail import TaskDetailPanel


# Load external CSS if present (architecture §6.3 — separate file)
_CSS_PATH = Path(__file__).parent / "office.tcss"


class OfficeTUI(App):
    """Hermes Virtual Office — realtime multi-agent TUI dashboard."""

    CSS = _CSS_PATH.read_text(encoding="utf-8") if _CSS_PATH.exists() else ""

    TITLE = "Hermes Virtual Office"
    SUB_TITLE = "multi-agent dashboard"

    BINDINGS = [
        Binding("q", "quit", "Quit"),
        Binding("r", "refresh", "Refresh"),
        Binding("f", "follow_task", "Follow"),
        Binding("1", "switch_board_1", "Board 1", show=False),
        Binding("2", "switch_board_2", "Board 2", show=False),
        Binding("3", "switch_board_3", "Board 3", show=False),
        Binding("4", "switch_board_4", "Board 4", show=False),
        Binding("5", "switch_board_5", "Board 5", show=False),
    ]

    def __init__(
        self,
        board: str | None = None,
        interval: int = 5,
        immutable: bool = True,
        **kwargs,
    ) -> None:
        super().__init__(**kwargs)
        self.boards = discover_boards()
        if not self.boards:
            self.boards = ["ai-company"]
        if board and board in self.boards:
            self.board_index = self.boards.index(board)
        elif board:
            # user-requested board not found — still try it (AC-8 will show error)
            self.boards.insert(0, board)
            self.board_index = 0
        else:
            self.board_index = 0
        self.interval = interval
        self.immutable = immutable
        self._reader: KanbanReader | None = None
        self._snapshot: OfficeSnapshot | None = None

    # ── Composition ───────────────────────────────────────────────
    def compose(self) -> ComposeResult:
        yield HeaderBar(board=self.current_board)
        yield DeptGrid()
        yield FooterBar(boards=self.boards, current_board=self.current_board)
        yield LiveFeed()

    def on_mount(self) -> None:
        # Compact mode detection (AC-7)
        self._update_compact_mode()
        # Initial poll
        self._make_reader()
        self.call_after_refresh(self._poll_once)
        # Polling timer
        self.set_interval(self.interval, self._poll_once)
        # Heartbeat freshness tick (1s — architecture §4.3)
        self.set_interval(HEARTBEAT_TICK_INTERVAL, self._tick_heartbeat)
        # Clock tick
        self.set_interval(1, self._tick_clock)

    # ── Properties ────────────────────────────────────────────────
    @property
    def current_board(self) -> str:
        if self.boards and 0 <= self.board_index < len(self.boards):
            return self.boards[self.board_index]
        return "ai-company"

    def _make_reader(self) -> None:
        self._reader = KanbanReader(
            board=self.current_board, immutable=self.immutable
        )

    # ── Polling ───────────────────────────────────────────────────
    async def _poll_once(self) -> None:
        """Fetch snapshot from DB → update widgets (architecture §4.1).

        SQLite reads are ~1-3ms on local disk, well under the 16ms frame
        budget, so we call the sync DB read directly. This avoids thread-
        worker overhead and keeps the code simple. open-close per poll
        means zero lock contention with the Hermes dispatcher.
        """
        if self._reader is None:
            return
        try:
            snapshot = self._reader.fetch_snapshot(ALL_PROFILES)
            self._snapshot = snapshot
            self._apply_snapshot(snapshot)
        except Exception as exc:  # defensive — never crash the loop (AC-8)
            snapshot = OfficeSnapshot(board=self.current_board)
            snapshot.error = f"Poll error: {exc}"
            self._apply_snapshot(snapshot)

    def _apply_snapshot(self, snapshot: OfficeSnapshot) -> None:
        """Push snapshot to all widgets (reactive dirty-region re-render)."""
        try:
            self.query_one(HeaderBar).update_state(snapshot)
            if snapshot.error:
                self.notify(f"⚠ {snapshot.error}", severity="warning", timeout=5)
            else:
                self.query_one(DeptGrid).update_state(snapshot)
                self.query_one(LiveFeed).update_events(snapshot.events)
        except Exception:
            # widgets not yet mounted — ignore, next poll will catch up
            pass

    def _tick_heartbeat(self) -> None:
        """Cheap re-render of desk cards for sub-second freshness (§4.3)."""
        try:
            for card in self.query(DeskCard):
                card.refresh_heartbeat()
        except Exception:
            pass

    def _tick_clock(self) -> None:
        try:
            self.query_one(HeaderBar).tick()
        except Exception:
            pass

    # ── Bindings ──────────────────────────────────────────────────
    def action_refresh(self) -> None:
        # _poll_once is async — schedule it on the loop (not a bare call,
        # which would return a never-awaited coroutine).
        self.call_after_refresh(self._poll_once)
        self.notify(f"🔄 Refreshed ({self.current_board})", timeout=2)

    def _switch_board(self, index: int) -> None:
        if 0 <= index < len(self.boards):
            self.board_index = index
            self._make_reader()
            self.query_one(HeaderBar).set_board(self.current_board)
            self.query_one(FooterBar).set_current(self.current_board)
            self.call_after_refresh(self._poll_once)
            self.notify(f"📋 Switched to board: {self.current_board}", timeout=2)

    def action_switch_board_1(self) -> None:
        self._switch_board(0)

    def action_switch_board_2(self) -> None:
        self._switch_board(1)

    def action_switch_board_3(self) -> None:
        self._switch_board(2)

    def action_switch_board_4(self) -> None:
        self._switch_board(3)

    def action_switch_board_5(self) -> None:
        self._switch_board(4)

    def action_follow_task(self) -> None:
        """Open task detail modal for the first active working/blocked task."""
        if self._snapshot is None:
            self.notify("No data yet — wait for first poll", timeout=3)
            return
        # Find the most interesting active task
        candidates = [
            ps.active_task
            for ps in self._snapshot.profiles.values()
            if ps.active_task is not None
        ]
        if not candidates:
            self.notify("No active tasks to follow", timeout=3)
            return
        # Prefer working → blocked → waiting
        priority_order = {"done": 0}
        best = max(
            candidates,
            key=lambda t: (t.priority, t.started_at or 0),
        )
        if self._reader is None:
            return
        detail = self._reader.fetch_task_detail(best.task_id)
        if detail is None:
            self.notify(f"Cannot load task {best.task_id}", severity="warning")
            return
        self.push_screen(TaskDetailPanel(detail))

    # ── Responsive layout (AC-7) ─────────────────────────────────
    def on_resize(self, event) -> None:
        self._update_compact_mode(event.size.width)

    def _update_compact_mode(self, width: int | None = None) -> None:
        try:
            grid = self.query_one(DeptGrid)
            if width is None:
                width = self.size.width
            compact = bool(width) and width < 100
            grid.set_compact(compact)
        except Exception:
            pass


def main(
    board: str | None = None,
    interval: int = 5,
    immutable: bool = True,
    dev: bool = False,
) -> None:
    """Launch the Office TUI."""
    app = OfficeTUI(board=board, interval=interval, immutable=immutable)
    if dev:
        app.devtools = True
    app.run()
