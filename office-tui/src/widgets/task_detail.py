"""TaskDetailPanel — modal follow-task view (spec S6, architecture §9.4)."""
from __future__ import annotations

import json
import time

from textual.app import ComposeResult
from textual.containers import VerticalScroll
from textual.screen import ModalScreen
from textual.widgets import Static

from config import EVENT_ICONS


class TaskDetailPanel(ModalScreen):
    """Modal overlay showing full detail for a single task."""

    DEFAULT_CSS = """
    TaskDetailPanel {
        align: center middle;
    }
    TaskDetailPanel > VerticalScroll {
        width: 82;
        max-width: 90%;
        height: auto;
        max-height: 80%;
        border: thick $accent;
        background: $surface;
        padding: 1 2;
    }
    """

    BINDINGS = [("escape", "dismiss", "Close")]

    def __init__(self, detail: dict) -> None:
        super().__init__()
        self._detail = detail

    def compose(self) -> ComposeResult:
        with VerticalScroll():
            yield Static(self._build_detail_text(), id="detail-content")

    def _build_detail_text(self) -> str:
        d = self._detail
        now = int(time.time())
        lines: list[str] = []

        lines.append(f"📋 {d.get('title', '(untitled)')}")
        lines.append("")

        # Meta block — plain text key/value
        def meta(label: str, value: object) -> None:
            lines.append(f"  {label:12s} {value}")

        meta("Task ID", d.get("id", "?"))
        meta("Assignee", d.get("assignee", "?"))
        meta("Status", d.get("status", "?"))
        meta("Priority", d.get("priority", 0))
        meta("Run #", d.get("current_run_id") or "—")
        if d.get("block_kind"):
            meta("Block", d["block_kind"])
        if d.get("consecutive_failures", 0) > 0:
            meta("Failures", d["consecutive_failures"])

        sa = d.get("started_at")
        if sa:
            meta("Started", time.strftime("%Y-%m-%d %H:%M:%S",
                                          time.localtime(sa)))
        ca = d.get("completed_at")
        if ca:
            meta("Completed", time.strftime("%Y-%m-%d %H:%M:%S",
                                            time.localtime(ca)))

        hb = d.get("last_heartbeat_at")
        if hb:
            meta("Heartbeat", f"{now - hb}s ago")

        # Events timeline
        lines.append("")
        lines.append("  📊 Events Timeline")
        for ev in d.get("events", [])[:15]:
            icon = EVENT_ICONS.get(ev.get("kind", ""), "•")
            ts = time.strftime("%H:%M:%S",
                               time.localtime(ev.get("created_at", 0)))
            ev_id = ev.get("id", "?")
            kind = ev.get("kind", "?")
            detail = ""
            payload = ev.get("payload")
            if payload:
                try:
                    p = json.loads(payload)
                    if isinstance(p, dict) and "author" in p:
                        detail = f" by {p['author']}"
                except (json.JSONDecodeError, TypeError):
                    pass
            lines.append(f"    [{ev_id}] {ts}  {icon} {kind}{detail}")

        # Dependencies
        parents = d.get("parents", [])
        children = d.get("children", [])
        if parents or children:
            lines.append("")
            lines.append("  🔗 Dependencies")
            if parents:
                lines.append(f"    Parents: {', '.join(parents)}")
            if children:
                lines.append(f"    Children: {', '.join(children)}")

        lines.append("")
        lines.append("  [ESC] Close")

        return "\n".join(lines)
