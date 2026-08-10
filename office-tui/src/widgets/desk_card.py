"""DeskCard — one profile's desk card (core widget, architecture §2.1).

Shows: status icon + profile name, current task title, heartbeat freshness.
"""
from __future__ import annotations

import time

from textual.reactive import reactive
from textual.widgets import Static

from office_state import (
    DisplayStatus,
    ProfileState,
    STATUS_STYLE,
    duration_since,
    heartbeat_freshness,
    truncate,
)


class DeskCard(Static):
    """A single employee's desk card."""

    profile_state: reactive[ProfileState | None] = reactive(None)
    now: reactive[int] = reactive(0)

    DEFAULT_CSS = """
    DeskCard {
        border: round $primary;
        border-title-align: left;
        padding: 0 1;
        height: auto;
        min-height: 4;
        background: $surface;
    }
    DeskCard:focus {
        border: double $accent;
    }
    """

    def __init__(self, profile: str, **kwargs) -> None:
        super().__init__(**kwargs)
        self._profile_name = profile
        self.profile_state = ProfileState(
            profile=profile, status=DisplayStatus.IDLE
        )

    def update_state(self, state: ProfileState) -> None:
        self.profile_state = state

    def refresh_heartbeat(self) -> None:
        """Cheap re-render for sub-second heartbeat freshness."""
        self.now = int(time.time())

    def render(self) -> str:
        """Return Textual markup string for the desk card."""
        ps = self.profile_state
        if ps is None:
            return "(no data)"
        now = self.now or int(time.time())

        status_icon = ps.status.value
        style = STATUS_STYLE.get(ps.status, "")

        lines: list[str] = []

        # Line 1: status icon + profile name
        lines.append(f"[{style}]{status_icon}[/] [bold]{ps.profile}[/]")

        # Line 2: task title (truncated)
        title = truncate(ps.task_title, 42)
        lines.append(f"   [dim]└ {title}[/]")

        # Line 3: status detail + heartbeat
        detail_parts: list[str] = []
        if ps.status == DisplayStatus.WORKING and ps.active_task:
            dur = duration_since(ps.active_task.started_at, now)
            detail_parts.append(f"[{style}]running {dur}[/]")
            hb = (ps.active_task.last_heartbeat_at
                  or ps.active_task.run_heartbeat)
            detail_parts.append(f"[dim]{heartbeat_freshness(hb, now)}[/]")
        elif ps.status == DisplayStatus.BLOCKED and ps.active_task:
            reason = ps.active_task.block_kind or "blocked"
            detail_parts.append(f"[{style}]BLOCKED: {reason}[/]")
        elif ps.status == DisplayStatus.WAITING and ps.active_task:
            if ps.active_task.db_status == "todo":
                detail_parts.append(f"[{style}]waiting (todo)[/]")
            else:
                detail_parts.append(f"[{style}]waiting[/]")
        elif ps.status == DisplayStatus.IDLE:
            if ps.done_count > 0:
                detail_parts.append(f"[dim]done: {ps.done_count}[/]")
            detail_parts.append(f"[{style}]idle[/]")

        # Failure counter badge (C4, P2)
        if ps.active_task and ps.active_task.consecutive_failures > 0:
            detail_parts.append(
                f"[bold red]⚠ {ps.active_task.consecutive_failures} fails[/]"
            )

        lines.append("   " + "   ".join(detail_parts))

        # Done badge for non-idle profiles
        if ps.done_count > 0 and ps.status != DisplayStatus.IDLE:
            lines.append(f"   [dim cyan]✅ done: {ps.done_count}[/]")

        return "\n".join(lines)
