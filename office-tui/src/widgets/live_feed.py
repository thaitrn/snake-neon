"""LiveFeed — 5 most recent events (spec M8, architecture §3.4/§9.2)."""
from __future__ import annotations

import json
import time

from textual.reactive import reactive
from textual.widgets import Static

from config import EVENT_ICONS
from office_state import OfficeEvent


class LiveFeed(Static):
    """Bottom panel showing the 5 most recent task events."""

    events: reactive[list[OfficeEvent]] = reactive(list)

    DEFAULT_CSS = """
    LiveFeed {
        dock: bottom;
        height: 8;
        padding: 0 2;
        background: $surface-darken-1;
        border-top: thick $primary;
        scrollbar-size: 0 0;
    }
    """

    def update_events(self, events: list[OfficeEvent]) -> None:
        self.events = events

    def render(self) -> str:
        lines: list[str] = ["[bold cyan]📡 LIVE FEED[/]"]

        if not self.events:
            lines.append("   [dim](no events)[/]")
            return "\n".join(lines)

        for ev in self.events:
            icon = EVENT_ICONS.get(ev.kind, "•")
            ts = time.strftime("%H:%M:%S", time.localtime(ev.created_at))

            detail = ""
            if ev.payload:
                try:
                    payload = json.loads(ev.payload)
                    if isinstance(payload, dict):
                        if ev.kind == "blocked":
                            k = payload.get("kind")
                            if k:
                                detail = f" ({k})"
                        elif ev.kind == "commented":
                            author = payload.get("author", "?")
                            detail = f" by {author}"
                        elif ev.kind == "spawned":
                            pid = payload.get("pid")
                            if pid:
                                detail = f" pid:{pid}"
                except (json.JSONDecodeError, TypeError):
                    pass

            # Color-code by event kind
            kind_style = {
                "completed": "green",
                "blocked": "bold red",
                "created": "cyan",
                "spawned": "yellow",
                "claimed": "blue",
                "commented": "magenta",
            }.get(ev.kind, "white")

            title = ev.task_title
            if len(title) > 45:
                title = title[:44] + "…"

            lines.append(
                f" [dim]{ts}[/]  {icon} [bold]{ev.assignee}[/] "
                f"[{kind_style}]{ev.kind}{detail}:[/] {title}"
            )

        return "\n".join(lines)
