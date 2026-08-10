"""Kanban reader: read-only SQLite access to kanban.db.

Per architecture doc §3 — open-close per poll with mode=ro&immutable=1,
defensive schema validation. Zero lock contention with Hermes dispatcher.
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
from typing import Optional

from config import (
    BOARDS_DIR,
    LIVE_FEED_EVENTS,
    RECENT_DONE_THRESHOLD,
)
from office_state import (
    OfficeEvent,
    OfficeSnapshot,
    TaskState,
    get_profile_display,
)


class BoardNotFoundError(FileNotFoundError):
    """Raised when a board's kanban.db does not exist."""


class SchemaError(Exception):
    """Raised when DB schema is missing required columns/tables."""


class KanbanReader:
    """Read-only accessor for one kanban board's SQLite DB."""

    REQUIRED_TASKS_COLUMNS = {
        "id", "title", "assignee", "status", "priority",
        "started_at", "completed_at", "consecutive_failures",
        "last_heartbeat_at", "current_run_id", "block_kind",
        "block_recurrences",
    }
    REQUIRED_EVENTS_COLUMNS = {"id", "kind", "created_at", "task_id"}

    def __init__(self, board: str, immutable: bool = True) -> None:
        self.board = board
        self.immutable = immutable

    @property
    def db_path(self) -> str:
        # Resolve lazily so config.BOARDS_DIR changes (tests) take effect.
        import config as _cfg
        return os.path.join(_cfg.BOARDS_DIR, self.board, "kanban.db")

    # ── Connection ────────────────────────────────────────────────
    def open_db(self) -> sqlite3.Connection:
        if not os.path.exists(self.db_path):
            raise BoardNotFoundError(self.db_path)
        if self.immutable:
            uri = f"file:{self.db_path}?mode=ro&immutable=1"
        else:
            uri = f"file:{self.db_path}?mode=ro"
        conn = sqlite3.connect(uri, uri=True, timeout=2.0)
        conn.row_factory = sqlite3.Row
        return conn

    def _validate_schema(self, conn: sqlite3.Connection) -> None:
        """Check required columns exist — guards against schema migration (Risk §9)."""
        try:
            cur = conn.execute("PRAGMA table_info(tasks)")
            cols = {row["name"] for row in cur.fetchall()}
        except sqlite3.DatabaseError as exc:
            raise SchemaError(f"cannot read tasks schema: {exc}") from exc
        missing = self.REQUIRED_TASKS_COLUMNS - cols
        if missing:
            raise SchemaError(f"tasks missing columns: {missing}")

        try:
            cur = conn.execute("PRAGMA table_info(task_events)")
            ev_cols = {row["name"] for row in cur.fetchall()}
        except sqlite3.DatabaseError as exc:
            raise SchemaError(f"cannot read task_events schema: {exc}") from exc
        missing_ev = self.REQUIRED_EVENTS_COLUMNS - ev_cols
        if missing_ev:
            raise SchemaError(f"task_events missing columns: {missing_ev}")

    # ── Snapshot ──────────────────────────────────────────────────
    def fetch_snapshot(self, all_profiles: list[str]) -> OfficeSnapshot:
        """Read a full office snapshot from the DB.

        Args:
            all_profiles: every known profile name (for idle detection).
        Returns:
            OfficeSnapshot with per-profile state + events. On board/schema
            error, returns a snapshot with .error set (AC-8 graceful degradation).
        """
        now = int(time.time())
        snapshot = OfficeSnapshot(board=self.board)

        conn: Optional[sqlite3.Connection] = None
        try:
            conn = self.open_db()
            self._validate_schema(conn)

            tasks_by_profile = self._fetch_tasks(conn, now)
            done_counts = self._fetch_done_counts(conn)
            events = self._fetch_events(conn)

            for profile in all_profiles:
                tasks = tasks_by_profile.get(profile, [])
                snap = get_profile_display(
                    profile=profile,
                    tasks=tasks,
                    done_count=done_counts.get(profile, 0),
                    now=now,
                )
                snapshot.profiles[profile] = snap

            snapshot.total_tasks = sum(
                len(t) for t in tasks_by_profile.values()
            ) + sum(done_counts.values())
            snapshot.active_profiles = sum(
                1 for p in snapshot.profiles.values()
                if p.status.value not in ("💤", "✅")
            )
            snapshot.events = events

        except BoardNotFoundError as exc:
            snapshot.error = f"Board not found: {self.board}"
        except SchemaError as exc:
            snapshot.error = f"DB schema error: {exc}"
        except sqlite3.DatabaseError as exc:
            snapshot.error = f"DB error: {exc}"
        finally:
            if conn is not None:
                conn.close()  # always close (AC-10)

        return snapshot

    def _fetch_tasks(
        self, conn: sqlite3.Connection, now: int
    ) -> dict[str, list[TaskState]]:
        """Fetch all active + recently-done tasks, grouped by assignee."""
        recent_threshold = now - RECENT_DONE_THRESHOLD
        query = """
            SELECT
                t.id, t.title, t.assignee, t.status, t.block_kind,
                t.block_recurrences, t.current_run_id, t.priority,
                t.consecutive_failures, t.last_heartbeat_at,
                t.started_at, t.completed_at,
                r.status   AS run_status,
                r.worker_pid AS run_pid,
                r.last_heartbeat_at AS run_heartbeat
            FROM tasks t
            LEFT JOIN task_runs r ON t.current_run_id = r.id
            WHERE t.status IN ('todo', 'blocked')
               OR t.current_run_id IS NOT NULL
               OR (t.status = 'done' AND t.completed_at > ?)
            ORDER BY t.assignee, t.priority DESC, t.created_at DESC
        """
        cur = conn.execute(query, (recent_threshold,))
        tasks_by_profile: dict[str, list[TaskState]] = {}
        for row in cur.fetchall():
            ts = TaskState(
                task_id=row["id"],
                title=row["title"] or "(untitled)",
                assignee=row["assignee"] or "default",
                db_status=row["status"],
                block_kind=row["block_kind"],
                current_run_id=row["current_run_id"],
                last_heartbeat_at=row["last_heartbeat_at"],
                priority=row["priority"] or 0,
                consecutive_failures=row["consecutive_failures"] or 0,
                started_at=row["started_at"],
                completed_at=row["completed_at"],
                block_recurrences=row["block_recurrences"] or 0,
                run_status=row["run_status"],
                run_pid=row["run_pid"],
                run_heartbeat=row["run_heartbeat"],
            )
            tasks_by_profile.setdefault(ts.assignee, []).append(ts)
        return tasks_by_profile

    def _fetch_done_counts(self, conn: sqlite3.Connection) -> dict[str, int]:
        cur = conn.execute(
            "SELECT assignee, COUNT(*) AS n FROM tasks "
            "WHERE status = 'done' GROUP BY assignee"
        )
        return {row["assignee"]: row["n"] for row in cur.fetchall()}

    def _fetch_events(self, conn: sqlite3.Connection) -> list[OfficeEvent]:
        query = """
            SELECT e.id, e.kind, e.created_at, e.task_id, e.payload,
                   t.title, t.assignee
            FROM task_events e
            JOIN tasks t ON e.task_id = t.id
            ORDER BY e.created_at DESC
            LIMIT ?
        """
        cur = conn.execute(query, (LIVE_FEED_EVENTS,))
        events: list[OfficeEvent] = []
        for row in cur.fetchall():
            events.append(OfficeEvent(
                event_id=row["id"],
                created_at=row["created_at"],
                kind=row["kind"],
                task_id=row["task_id"],
                task_title=row["title"] or "(untitled)",
                assignee=row["assignee"] or "?",
                payload=row["payload"],
            ))
        return events

    # ── Task detail (follow-task, §9.4) ───────────────────────────
    def fetch_task_detail(self, task_id: str) -> Optional[dict]:
        """Fetch full detail for the follow-task modal (architecture §9.4)."""
        conn: Optional[sqlite3.Connection] = None
        try:
            conn = self.open_db()
            cur = conn.execute(
                "SELECT * FROM tasks WHERE id = ?", (task_id,)
            )
            row = cur.fetchone()
            if row is None:
                return None
            detail = dict(row)

            # events timeline
            ev = conn.execute(
                "SELECT id, kind, created_at, payload FROM task_events "
                "WHERE task_id = ? ORDER BY created_at DESC LIMIT 20",
                (task_id,),
            )
            detail["events"] = [dict(r) for r in ev.fetchall()]

            # dependencies
            parents = conn.execute(
                "SELECT parent_id FROM task_links WHERE child_id = ?",
                (task_id,),
            )
            detail["parents"] = [r["parent_id"] for r in parents.fetchall()]
            children = conn.execute(
                "SELECT child_id FROM task_links WHERE parent_id = ?",
                (task_id,),
            )
            detail["children"] = [r["child_id"] for r in children.fetchall()]
            return detail
        except (BoardNotFoundError, sqlite3.DatabaseError):
            return None
        finally:
            if conn is not None:
                conn.close()


def format_event_line(ev: OfficeEvent, now: int) -> tuple[str, str]:
    """Format an event for the live feed.

    Returns (icon, description) — caller renders with Rich styling.
    """
    from config import EVENT_ICONS
    icon = EVENT_ICONS.get(ev.kind, "•")
    detail = ""
    if ev.payload:
        try:
            payload = json.loads(ev.payload)
        except (json.JSONDecodeError, TypeError):
            payload = {}
        if ev.kind == "blocked" and isinstance(payload, dict):
            k = payload.get("kind")
            if k:
                detail = f" ({k})"
        elif ev.kind == "commented" and isinstance(payload, dict):
            author = payload.get("author", "?")
            detail = f" by {author}"
        elif ev.kind == "spawned" and isinstance(payload, dict):
            pid = payload.get("pid")
            if pid:
                detail = f" (pid {pid})"
        elif ev.kind == "claimed" and isinstance(payload, dict):
            detail = " (lock)"
    return icon, f"{ev.assignee} {ev.kind}{detail}: {ev.task_title}"
