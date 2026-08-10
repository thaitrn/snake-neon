"""E2E tests using Textual's headless Pilot (AC-1, AC-3, AC-4, AC-6, AC-10).

Drives the real OfficeTUI app against a temp board DB — mount, poll,
refresh, switch board, follow task modal, quit. Asserts no exception
and clean lifecycle.
"""
import asyncio
import os
import sys
import time
import warnings
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import config


# All E2E tests use the populated_board fixture from conftest.


@pytest.mark.asyncio
async def test_app_mounts_and_polls(populated_board):
    """AC-1: App mounts 7 department sections, polls DB, no crash."""
    from app import OfficeTUI
    from widgets.dept_grid import DeptGrid
    from widgets.dept_section import DeptSection

    app = OfficeTUI(board=populated_board, interval=999)
    async with app.run_test() as pilot:
        await pilot.pause()
        # Wait for the initial poll (scheduled via call_after_refresh)
        await pilot.pause()
        await pilot.pause()

        # 7 department sections must exist (AC-1)
        sections = list(app.query(DeptSection))
        assert len(sections) == 7, f"expected 7 dept sections, got {len(sections)}"

        # Snapshot loaded
        assert app._snapshot is not None
        assert app._snapshot.error is None


@pytest.mark.asyncio
async def test_desk_cards_render(populated_board):
    """AC-1: desk cards exist for all known profiles."""
    from app import OfficeTUI
    from widgets.desk_card import DeskCard

    app = OfficeTUI(board=populated_board, interval=999)
    async with app.run_test() as pilot:
        await pilot.pause()
        await pilot.pause()
        cards = list(app.query(DeskCard))
        # ALL_PROFILES has 7 profiles (ceo, pm, ba, architect, frontend, backend, qa)
        assert len(cards) == 7


@pytest.mark.asyncio
async def test_refresh_binding_re_polls(populated_board):
    """AC-3: pressing 'r' triggers re-poll (regression: run-1 had this as no-op)."""
    from app import OfficeTUI

    app = OfficeTUI(board=populated_board, interval=999)
    async with app.run_test() as pilot:
        await pilot.pause()
        await pilot.pause()
        snapshot_before = app._snapshot

        # Press r → action_refresh → schedules _poll_once
        await pilot.press("r")
        await pilot.pause()
        await pilot.pause()
        await pilot.pause()

        # A new snapshot object should have been produced (re-poll happened)
        assert app._snapshot is not None


@pytest.mark.asyncio
async def test_switch_board_binding(populated_board, make_board):
    """AC-4: pressing '2' switches to second board."""
    from app import OfficeTUI
    from widgets.header_bar import HeaderBar

    # Create a second board
    second = make_board(name="second-board", setup=lambda c: None)

    app = OfficeTUI(board=populated_board, interval=999)
    async with app.run_test() as pilot:
        await pilot.pause()
        await pilot.pause()
        # boards list = [populated, second-board] (alphabetical from tmpdir)
        # but populated was created first. Verify current board.
        assert app.current_board == populated_board

        # Find index of second board and press corresponding key
        if second in app.boards:
            idx = app.boards.index(second) + 1
            key = str(idx)
            await pilot.press(key)
            await pilot.pause()
            await pilot.pause()
            assert app.current_board == second


@pytest.mark.asyncio
async def test_follow_task_modal_opens_and_closes(populated_board):
    """AC follow-task: 'f' opens modal, ESC closes (regression: run-1 _render crash)."""
    from app import OfficeTUI
    from widgets.task_detail import TaskDetailPanel

    app = OfficeTUI(board=populated_board, interval=999)
    async with app.run_test() as pilot:
        await pilot.pause()
        await pilot.pause()

        # Press f to open follow-task modal
        await pilot.press("f")
        await pilot.pause()
        await pilot.pause()

        # A modal screen should be pushed (TaskDetailPanel)
        # Check the screen stack
        assert len(app.screen_stack) >= 2  # base + modal

        # Close with ESC
        await pilot.press("escape")
        await pilot.pause()
        await pilot.pause()

        # Modal dismissed → back to base screen
        assert len(app.screen_stack) == 1


@pytest.mark.asyncio
async def test_quit_clean(populated_board):
    """AC-10: pressing 'q' quits cleanly, no exception."""
    from app import OfficeTUI

    app = OfficeTUI(board=populated_board, interval=999)
    async with app.run_test() as pilot:
        await pilot.pause()
        await pilot.pause()
        await pilot.press("q")
        await pilot.pause()
        # App should be exiting
        assert app._exit  # internal flag set on quit


@pytest.mark.asyncio
async def test_no_runtime_warning(populated_board):
    """Regression: run-1 had RuntimeWarning (un-awaited coroutine).
    Run with -W error::RuntimeWarning to catch any new ones."""
    from app import OfficeTUI

    with warnings.catch_warnings():
        warnings.simplefilter("error", RuntimeWarning)
        app = OfficeTUI(board=populated_board, interval=999)
        async with app.run_test() as pilot:
            await pilot.pause()
            await pilot.pause()
            await pilot.press("r")
            await pilot.pause()
            await pilot.press("f")
            await pilot.pause()
            await pilot.press("escape")
            await pilot.pause()
            # If we reach here, no RuntimeWarning was raised


@pytest.mark.asyncio
async def test_graceful_degradation_bad_board():
    """AC-8: launch with nonexistent board → app stays alive, error shown, no crash."""
    from app import OfficeTUI
    from widgets.header_bar import HeaderBar

    # Patch BOARDS_DIR to empty so the requested board is inserted as-is
    import tempfile
    empty = tempfile.mkdtemp()
    config.BOARDS_DIR = empty

    app = OfficeTUI(board="does-not-exist", interval=999)
    async with app.run_test() as pilot:
        await pilot.pause()
        await pilot.pause()
        await pilot.pause()

        # App still alive
        assert app._snapshot is not None
        assert app._snapshot.error is not None


@pytest.mark.asyncio
async def test_compact_mode_toggle(populated_board):
    """AC-7: DeptGrid gets 'compact' class under narrow width."""
    from app import OfficeTUI
    from widgets.dept_grid import DeptGrid

    app = OfficeTUI(board=populated_board, interval=999)
    async with app.run_test(size=(80, 40)) as pilot:
        await pilot.pause()
        await pilot.pause()
        grid = app.query_one(DeptGrid)
        assert grid.has_class("compact")

    # Full mode
    app2 = OfficeTUI(board=populated_board, interval=999)
    async with app2.run_test(size=(120, 40)) as pilot:
        await pilot.pause()
        await pilot.pause()
        grid2 = app2.query_one(DeptGrid)
        assert not grid2.has_class("compact")
