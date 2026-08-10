#!/usr/bin/env python3
"""Virtual Office TUI — Hermes multi-agent dashboard.

Usage:
    python office_tui.py [--board ai-company] [--interval 5] [--no-immutable] [--dev]

Quick start:
    cd office-tui
    source .venv/bin/activate
    python office_tui.py
"""
from __future__ import annotations

import sys
from pathlib import Path

# Ensure src/ is importable when run as a script
_SRC = Path(__file__).resolve().parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from config import build_arg_parser  # noqa: E402
from app import main  # noqa: E402


if __name__ == "__main__":
    parser = build_arg_parser()
    args = parser.parse_args()
    main(
        board=args.board,
        interval=args.interval,
        immutable=not args.no_immutable,
        dev=args.dev,
    )
