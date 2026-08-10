"""Configuration: constants, department mapping, CLI argument parsing.

Per architecture doc §6.4 — hardcode department→profile mapping for MVP.
"""

from __future__ import annotations

import argparse
import os

# ── Paths ────────────────────────────────────────────────────────────
KANBAN_HOME = os.path.expanduser("~/.hermes/kanban")
BOARDS_DIR = os.path.join(KANBAN_HOME, "boards")

# ── Timing ───────────────────────────────────────────────────────────
POLL_INTERVAL = 5  # seconds (AC-3)
HEARTBEAT_TICK_INTERVAL = 1  # sub-second freshness update (§4.3)
RECENT_DONE_THRESHOLD = 3600  # show tasks done within last 1h for badge

# ── Stale detection ─────────────────────────────────────────────────
HEARTBEAT_STALE_THRESHOLD = 120  # seconds — heartbeat older → stale (AC-5)
STALE_WARNING_THRESHOLD = 120  # seconds — show "⚠ stale" warning

# ── Live feed ───────────────────────────────────────────────────────
LIVE_FEED_EVENTS = 5  # number of recent events to show

# ── Department → Profile mapping (architecture §6.4) ────────────────
# Order matters: this is the display order on the grid.
DEPARTMENTS: list[dict] = [
    {"name": "Management", "icon": "👔", "profiles": ["ceo"]},
    {"name": "PM",         "icon": "📋", "profiles": ["pm"]},
    {"name": "BA",         "icon": "📊", "profiles": ["ba"]},
    {"name": "Architect",  "icon": "🏗️", "profiles": ["architect"]},
    {"name": "Frontend",   "icon": "🎨", "profiles": ["frontend"]},
    {"name": "Backend",    "icon": "⚙️", "profiles": ["backend"]},
    {"name": "QA",         "icon": "🧪", "profiles": ["qa"]},
]

# All known profiles (for idle detection even when no tasks exist)
ALL_PROFILES = [p for dept in DEPARTMENTS for p in dept["profiles"]]

# ── Event display ───────────────────────────────────────────────────
EVENT_ICONS = {
    "created":         "🆕",
    "claimed":         "🔒",
    "spawned":         "🚀",
    "heartbeat":       "💗",
    "blocked":         "⛔",
    "completed":       "✅",
    "commented":       "💬",
    "attached":        "📎",
    "linked":          "🔗",
    "promoted_manual": "⬆️",
    "claim_rejected":  "↩️",
}


def discover_boards() -> list[str]:
    """Auto-discover board names by scanning BOARDS_DIR/*/kanban.db."""
    boards: list[str] = []
    if not os.path.isdir(BOARDS_DIR):
        return boards
    for entry in sorted(os.listdir(BOARDS_DIR)):
        db_path = os.path.join(BOARDS_DIR, entry, "kanban.db")
        if os.path.isfile(db_path):
            boards.append(entry)
    return boards


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="office_tui",
        description="🏢 Hermes Virtual Office — realtime multi-agent TUI dashboard",
    )
    parser.add_argument(
        "--board", "-b",
        default=None,
        help="Board name to display (default: first discovered)",
    )
    parser.add_argument(
        "--interval", "-i",
        type=int,
        default=POLL_INTERVAL,
        help=f"Poll interval in seconds (default: {POLL_INTERVAL})",
    )
    parser.add_argument(
        "--no-immutable",
        action="store_true",
        default=False,
        help="Use mode=ro without immutable=1 (re-check page cache each poll)",
    )
    parser.add_argument(
        "--dev",
        action="store_true",
        default=False,
        help="Enable Textual dev mode (CSS hot-reload)",
    )
    return parser
