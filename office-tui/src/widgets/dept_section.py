"""DeptSection — one department panel containing desk cards."""
from __future__ import annotations

from textual.containers import Vertical
from textual.widgets import Static

from office_state import OfficeSnapshot


class DeptSection(Vertical):
    """A department panel: header + one DeskCard per profile."""

    DEFAULT_CSS = """
    DeptSection {
        border: round $panel;
        border-title-align: center;
        padding: 0 1;
        width: 1fr;
        height: auto;
        background: $boost;
    }
    """

    def __init__(self, name: str, icon: str, profiles: list[str], **kwargs) -> None:
        super().__init__(**kwargs)
        self.dept_name = name
        self.dept_icon = icon
        self._profiles = profiles
        self.border_title = f"{icon} {name.upper()}"

    def compose(self):
        # Import here to avoid circular at module load
        from widgets.desk_card import DeskCard
        for profile in self._profiles:
            yield DeskCard(profile=profile)

    def update_state(self, snapshot: OfficeSnapshot) -> None:
        from widgets.desk_card import DeskCard
        for card in self.query(DeskCard):
            name = card._profile_name
            ps = snapshot.get_profile(name)
            card.update_state(ps)
