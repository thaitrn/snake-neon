"""Integration tests for KanbanReader against a temp SQLite DB (AC-8)."""
import os
import sys
import tempfile
import time
from pathlib import Path

import pytest
import sqlite3

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import config
from kanban_reader import KanbanReader, BoardNotFoundError, SchemaError
from office_state import DisplayStatus


@pytest.fixture
def temp_board(monkeypatch):
    """Create a temp kanban DB with the real schema + sample data."""
    tmpdir = tempfile.mkdtemp()
    board_dir = os.path.join(tmpdir, "test-board")
    os.makedirs(board_dir)
    db_path = os.path.join(board_dir, "kanban.db")

    # Monkeypatch BOARDS_DIR to point at our temp dir
    monkeypatch.setattr(config, "BOARDS_DIR", tmpdir)

    conn = sqlite3.connect(db_path)
    # Create the real schema (subset of columns we use)
    conn.executescript("""
        CREATE TABLE tasks (
            id TEXT PRIMARY KEY,
            title TEXT,
            body TEXT,
            assignee TEXT,
            status TEXT,
            priority INTEGER DEFAULT 0,
            created_by TEXT,
            created_at INTEGER,
            started_at INTEGER,
            completed_at INTEGER,
            workspace_kind TEXT DEFAULT 'scratch',
            workspace_path TEXT,
            branch_name TEXT,
            project_id TEXT,
            claim_lock TEXT,
            claim_expires INTEGER,
            tenant TEXT,
            result TEXT,
            idempotency_key TEXT,
            consecutive_failures INTEGER DEFAULT 0,
            worker_pid INTEGER,
            last_failure_error TEXT,
            max_runtime_seconds INTEGER,
            last_heartbeat_at INTEGER,
            current_run_id INTEGER,
            workflow_template_id TEXT,
            current_step_key TEXT,
            skills TEXT,
            model_override TEXT,
            provider_override TEXT,
            max_retries INTEGER,
            goal_mode INTEGER DEFAULT 0,
            goal_max_turns INTEGER,
            session_id TEXT,
            block_kind TEXT,
            block_recurrences INTEGER DEFAULT 0
        );
        CREATE TABLE task_runs (
            id INTEGER PRIMARY KEY,
            task_id TEXT,
            profile TEXT,
            step_key TEXT,
            status TEXT,
            claim_lock TEXT,
            claim_expires INTEGER,
            worker_pid INTEGER,
            max_runtime_seconds INTEGER,
            last_heartbeat_at INTEGER,
            started_at INTEGER,
            ended_at INTEGER,
            outcome TEXT,
            summary TEXT,
            metadata TEXT,
            error TEXT
        );
        CREATE TABLE task_events (
            id INTEGER PRIMARY KEY,
            task_id TEXT,
            run_id INTEGER,
            kind TEXT,
            payload TEXT,
            created_at INTEGER
        );
        CREATE TABLE task_links (
            parent_id TEXT,
            child_id TEXT,
            PRIMARY KEY (parent_id, child_id)
        );
    """)

    now = int(time.time())
    # Sample data: one task per status
    conn.execute(
        "INSERT INTO tasks (id, title, assignee, status, priority, created_at, "
        "started_at, last_heartbeat_at, current_run_id, block_kind) "
        "VALUES ('t_working', 'Working task', 'backend', 'running', 3, ?, ?, ?, 1, NULL)",
        (now - 300, now - 60, now - 5),
    )
    conn.execute(
        "INSERT INTO task_runs (id, task_id, profile, status, last_heartbeat_at, "
        "started_at, worker_pid) VALUES (1, 't_working', 'backend', 'running', ?, ?, 12345)",
        (now - 5, now - 60),
    )
    conn.execute(
        "INSERT INTO tasks (id, title, assignee, status, priority, created_at, "
        "started_at, block_kind) "
        "VALUES ('t_blocked', 'Blocked task', 'frontend', 'blocked', 1, ?, ?, NULL)",
        (now - 200, now - 100),
    )
    conn.execute(
        "INSERT INTO tasks (id, title, assignee, status, priority, created_at, "
        "started_at, block_kind) "
        "VALUES ('t_waiting', 'Waiting dep', 'qa', 'blocked', 2, ?, ?, 'dependency')",
        (now - 200, now - 100),
    )
    conn.execute(
        "INSERT INTO tasks (id, title, assignee, status, priority, created_at) "
        "VALUES ('t_todo', 'Todo task', 'pm', 'todo', 0, ?)",
        (now - 50,),
    )
    conn.execute(
        "INSERT INTO tasks (id, title, assignee, status, priority, created_at, "
        "completed_at) "
        "VALUES ('t_done', 'Done task', 'ba', 'done', 0, ?, ?)",
        (now - 500, now - 100),
    )
    # Events
    conn.execute(
        "INSERT INTO task_events (id, task_id, kind, created_at, payload) "
        "VALUES (1, 't_working', 'created', ?, '{\"assignee\":\"backend\"}')",
        (now - 300,),
    )
    conn.execute(
        "INSERT INTO task_events (id, task_id, kind, created_at, payload) "
        "VALUES (2, 't_working', 'claimed', ?, NULL)",
        (now - 60,),
    )
    conn.commit()
    conn.close()

    yield "test-board"


class TestKanbanReader:
    def test_fetch_snapshot_working(self, temp_board):
        reader = KanbanReader(board=temp_board, immutable=False)
        snap = reader.fetch_snapshot(["backend", "frontend", "qa", "pm", "ba"])
        ps = snap.get_profile("backend")
        assert ps.status == DisplayStatus.WORKING
        assert ps.active_task is not None
        assert ps.active_task.task_id == "t_working"

    def test_fetch_snapshot_blocked_null_kind(self, temp_board):
        """CRITICAL: block_kind=NULL → BLOCKED."""
        reader = KanbanReader(board=temp_board, immutable=False)
        snap = reader.fetch_snapshot(["frontend"])
        ps = snap.get_profile("frontend")
        assert ps.status == DisplayStatus.BLOCKED

    def test_fetch_snapshot_dependency_is_waiting(self, temp_board):
        reader = KanbanReader(board=temp_board, immutable=False)
        snap = reader.fetch_snapshot(["qa"])
        ps = snap.get_profile("qa")
        assert ps.status == DisplayStatus.WAITING

    def test_fetch_snapshot_todo_is_waiting(self, temp_board):
        reader = KanbanReader(board=temp_board, immutable=False)
        snap = reader.fetch_snapshot(["pm"])
        ps = snap.get_profile("pm")
        assert ps.status == DisplayStatus.WAITING

    def test_fetch_snapshot_done_badge(self, temp_board):
        reader = KanbanReader(board=temp_board, immutable=False)
        snap = reader.fetch_snapshot(["ba"])
        ps = snap.get_profile("ba")
        # ba has only a done task → idle with done_count
        assert ps.status == DisplayStatus.IDLE
        assert ps.done_count >= 1

    def test_fetch_events(self, temp_board):
        reader = KanbanReader(board=temp_board, immutable=False)
        snap = reader.fetch_snapshot(["backend"])
        assert len(snap.events) >= 2
        assert snap.events[0].created_at >= snap.events[-1].created_at  # DESC order

    def test_board_not_found(self, monkeypatch):
        monkeypatch.setattr(config, "BOARDS_DIR", "/nonexistent/path")
        reader = KanbanReader(board="nope", immutable=False)
        snap = reader.fetch_snapshot(["backend"])
        assert snap.error is not None
        assert "not found" in snap.error.lower() or "Board" in snap.error

    def test_task_detail(self, temp_board):
        reader = KanbanReader(board=temp_board, immutable=False)
        detail = reader.fetch_task_detail("t_working")
        assert detail is not None
        assert detail["id"] == "t_working"
        assert detail["title"] == "Working task"
        assert len(detail["events"]) >= 2
