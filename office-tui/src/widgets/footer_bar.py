"""FooterBar — keybindings help + board switcher (spec M5, architecture §2.1)."""
from __future__ import annotations

from textual.widgets import Static


class FooterBar(Static):
    """Bottom help bar showing available keybindings."""

    DEFAULT_CSS = """
    FooterBar {
        dock: bottom;
        height: 1;
        padding: 0 2;
        background: $primary-darken-2;
    }
    """

    def __init__(self, boards: list[str], current_board: str = "", **kwargs) -> None:
        super().__init__(**kwargs)
        self._boards = boards
        self._current = current_board

    def set_boards(self, boards: list[str]) -> None:
        self._boards = boards
        self.refresh()

    def set_current(self, board: str) -> None:
        self._current = board
        self.refresh()

    def render(self) -> str:
        parts: list[str] = []
        # Board switcher keys
        for i, board in enumerate(self._boards[:9], 1):
            if board == self._current:
                parts.append(f"[bold] [»{i}][/] [bold cyan]{board}[/]   ")
            else:
                parts.append(f"[dim] [ {i}][/] {board}   ")

        # Command keys
        parts.append("   ")
        parts.append("[bold][r][/] [dim]Refresh[/] ")
        parts.append("[bold][f][/] [dim]Follow[/] ")
        parts.append("[bold][q][/] [dim]Quit[/]")

        return "".join(parts)
