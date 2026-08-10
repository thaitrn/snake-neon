"""Shared pytest fixtures for Office TUI tests."""
import os
import sys
import tempfile
import sqlite3
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import config


SCHEMA_SQL = """
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
"""


def _insert_task(conn, *, id, title, assignee, status, priority=0,
                 block_kind=None, current_run_id=None,
                 last_heartbeat_at=None, started_at=None,
                 completed_at=None, created_at=None, consecutive_failures=0):
    now = int(time.time())
    conn.execute(
        "INSERT INTO tasks (id, title, assignee, status, priority, created_at, "
        "started_at, completed_at, last_heartbeat_at, current_run_id, "
        "block_kind, consecutive_failures) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        (id, title, assignee, status, priority,
         created_at or now, started_at, completed_at,
         last_heartbeat_at, current_run_id, block_kind, consecutive_failures),
    )


def _insert_run(conn, *, id, task_id, profile, status="running",
                last_heartbeat_at=None, started_at=None, worker_pid=9999):
    now = int(time.time())
    conn.execute(
        "INSERT INTO task_runs (id, task_id, profile, status, "
        "last_heartbeat_at, started_at, worker_pid) VALUES (?,?,?,?,?,?,?)",
        (id, task_id, profile, status,
         last_heartbeat_at, started_at or now, worker_pid),
    )


def _insert_event(conn, *, id, task_id, kind, created_at=None, payload=None):
    now = int(time.time())
    conn.execute(
        "INSERT INTO task_events (id, task_id, kind, created_at, payload) "
        "VALUES (?,?,?,?,?)",
        (id, task_id, kind, created_at or now, payload),
    )


def _insert_link(conn, parent_id, child_id):
    conn.execute(
        "INSERT INTO task_links (parent_id, child_id) VALUES (?,?)",
        (parent_id, child_id),
    )


@pytest.fixture
def make_board(monkeypatch):
    """Factory: create a temp board DB with custom data, patch BOARDS_DIR.

    Usage:
        board = make_board(name="b1", setup=lambda conn: [inserts...])
    """
    tmpdir = tempfile.mkdtemp()
    monkeypatch.setattr(config, "BOARDS_DIR", tmpdir)

    created = []

    def _factory(name="test-board", setup=None, immutable_safe=True,
                 raw=False):
        board_dir = os.path.join(tmpdir, name)
        os.makedirs(board_dir)
        db_path = os.path.join(board_dir, "kanban.db")
        conn = sqlite3.connect(db_path)
        if not raw:
            # Default: full valid schema, then optional custom data inserts
            conn.executescript(SCHEMA_SQL)
        if setup:
            setup(conn)
        conn.commit()
        conn.close()
        created.append(name)
        return name

    yield _factory


@pytest.fixture
def populated_board(make_board):
    """A board with one task per known status (todo/blocked/running/done)."""
    now = int(time.time())

    def setup(conn):
        _insert_task(conn, id="t_working", title="Working task",
                     assignee="backend", status="running", priority=3,
                     current_run_id=1, started_at=now - 60,
                     last_heartbeat_at=now - 5)
        _insert_run(conn, id=1, task_id="t_working", profile="backend",
                    status="running", last_heartbeat_at=now - 5,
                    started_at=now - 60)
        _insert_task(conn, id="t_blocked", title="Blocked task",
                     assignee="frontend", status="blocked", priority=1,
                     started_at=now - 100, block_kind=None)
        _insert_task(conn, id="t_dep", title="Waiting on dep",
                     assignee="qa", status="blocked", priority=2,
                     started_at=now - 100, block_kind="dependency")
        _insert_task(conn, id="t_todo", title="Todo task",
                     assignee="pm", status="todo", priority=0)
        _insert_task(conn, id="t_done", title="Done task",
                     assignee="ba", status="done", priority=0,
                     completed_at=now - 100, started_at=now - 500,
                     created_at=now - 500)
        _insert_event(conn, id=1, task_id="t_working", kind="created",
                      created_at=now - 300)
        _insert_event(conn, id=2, task_id="t_working", kind="claimed",
                      created_at=now - 60)
        _insert_event(conn, id=3, task_id="t_done", kind="completed",
                      created_at=now - 100)
        _insert_link(conn, "t_dep_parent", "t_dep")
        _insert_task(conn, id="t_dep_parent", title="Parent task",
                     assignee="architect", status="done", priority=0,
                     completed_at=now - 200)

    return make_board(name="populated", setup=setup)
