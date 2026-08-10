"""HeaderBar — title, clock, summary stats (architecture §2.1, spec M6)."""
from __future__ import annotations

import time

from textual.reactive import reactive
from textual.widgets import Static

from config import POLL_INTERVAL
from office_state import OfficeSnapshot


class HeaderBar(Static):
    """Top header: office title, clock, active profile count, task count."""

    snapshot: reactive[OfficeSnapshot | None] = reactive(None)
    clock: reactive[int] = reactive(0)

    DEFAULT_CSS = """
    HeaderBar {
        dock: top;
        height: 3;
        padding: 0 2;
        background: $primary-darken-2;
        border-bottom: thick $primary;
        text-align: center;
        content-align: center middle;
    }
    """

    def __init__(self, board: str = "", **kwargs) -> None:
        super().__init__(**kwargs)
        self._board = board

    def set_board(self, board: str) -> None:
        self._board = board

    def update_state(self, snapshot: OfficeSnapshot) -> None:
        self.snapshot = snapshot
        self._board = snapshot.board

    def tick(self) -> None:
        self.clock = int(time.time())

    def render(self) -> str:
        now = self.clock or int(time.time())
        clock_str = time.strftime("%H:%M:%S", time.localtime(now))
        board = self._board or "—"

        snap = self.snapshot
        if snap and not snap.error:
            active = snap.active_profiles
            total = len(snap.profiles)
            tasks = snap.total_tasks
            line1 = f"🏢 HERMES VIRTUAL OFFICE — {board} board"
            line2 = (f"⏱ {clock_str}  |  🔄 refresh {POLL_INTERVAL}s  |  "
                     f"👥 {active}/{total} active  |  📋 {tasks} tasks")
        elif snap and snap.error:
            line1 = f"🏢 HERMES VIRTUAL OFFICE — {board}"
            line2 = f"⚠ {snap.error}  |  ⏱ {clock_str}"
        else:
            line1 = f"🏢 HERMES VIRTUAL OFFICE — {board}"
            line2 = f"⏱ {clock_str}  |  loading…"

        return f"[bold cyan]{line1}[/]\n[dim]{line2}[/]"
