"""DeptGrid — responsive container holding all DeptSections (architecture §9.1)."""
from __future__ import annotations

from rich.text import Text
from textual.containers import Vertical
from textual.widgets import Static

from config import DEPARTMENTS
from office_state import OfficeSnapshot
from widgets.dept_section import DeptSection


class DeptGrid(Vertical):
    """Grid of department sections. Responsive to terminal width."""

    DEFAULT_CSS = """
    DeptGrid {
        layout: grid;
        grid-size: 3;          /* 3 columns wide (full mode) */
        grid-gutter: 1;
        padding: 0 1;
        height: auto;
    }
    /* Compact mode: single column when terminal < 100 cols (AC-7) */
    DeptGrid.compact {
        grid-size: 1;
    }
    """

    def compose(self):
        for dept in DEPARTMENTS:
            yield DeptSection(
                name=dept["name"],
                icon=dept["icon"],
                profiles=dept["profiles"],
            )

    def update_state(self, snapshot: OfficeSnapshot) -> None:
        if snapshot.error:
            self.add_class("error-mode")
            # On error, show error message but keep structure (AC-8)
            return
        self.remove_class("error-mode")
        for section in self.query(DeptSection):
            section.update_state(snapshot)

    def set_compact(self, compact: bool) -> None:
        """Switch between full grid and compact single-column (AC-7)."""
        if compact:
            self.add_class("compact")
        else:
            self.remove_class("compact")
