"""Office state: dataclasses + status mapping logic.

Per architecture doc §3.5 — verified against real data on ai-company and
office-tui boards. Critical finding: block_kind = NULL on all real blocked
tasks → must treat NULL as BLOCKED, only 'dependency' → WAITING.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from config import HEARTBEAT_STALE_THRESHOLD, STALE_WARNING_THRESHOLD


# ── Display statuses ────────────────────────────────────────────────
class DisplayStatus(Enum):
    WORKING = "🟢"
    WAITING = "⏳"
    BLOCKED = "🔴"
    DONE = "✅"
    IDLE = "💤"


# Rich style name for each status (must be valid Rich styles, not Textual CSS classes)
STATUS_STYLE = {
    DisplayStatus.WORKING: "bold green",
    DisplayStatus.WAITING: "yellow",
    DisplayStatus.BLOCKED: "bold red",
    DisplayStatus.DONE:    "cyan",
    DisplayStatus.IDLE:    "dim",
}


@dataclass
class TaskState:
    """One task row from the DB, with enough fields to compute display status."""
    task_id: str
    title: str
    assignee: str
    db_status: str           # raw status from DB: todo|running|blocked|done
    block_kind: Optional[str]
    current_run_id: Optional[int]
    last_heartbeat_at: Optional[int]
    priority: int
    consecutive_failures: int
    started_at: Optional[int]
    completed_at: Optional[int] = None
    block_recurrences: int = 0
    # joined from task_runs
    run_status: Optional[str] = None
    run_pid: Optional[int] = None
    run_heartbeat: Optional[int] = None

    def to_display(self, now: int) -> DisplayStatus:
        """Compute the display status for this single task (architecture §3.5)."""
        # 1. Done
        if self.db_status == "done":
            return DisplayStatus.DONE

        # 2. Working — current_run_id non-null + heartbeat fresh
        if self.current_run_id is not None:
            hb = self.last_heartbeat_at or self.run_heartbeat
            if hb is not None and (now - hb) < HEARTBEAT_STALE_THRESHOLD:
                return DisplayStatus.WORKING
            # run active but heartbeat stale → may be dead
            return DisplayStatus.WAITING

        # 3. Blocked
        if self.db_status == "blocked":
            # block_kind='dependency' → waiting (chờ parent)
            # block_kind=NULL hoặc khác → blocked thật
            if self.block_kind == "dependency":
                return DisplayStatus.WAITING
            return DisplayStatus.BLOCKED

        # 4. Todo (chưa dispatch)
        if self.db_status == "todo":
            return DisplayStatus.WAITING

        # 5. Fallback
        return DisplayStatus.IDLE


@dataclass
class ProfileState:
    """Aggregated display state for one profile across its tasks."""
    profile: str
    status: DisplayStatus
    active_task: Optional[TaskState] = None
    done_count: int = 0

    @property
    def task_title(self) -> str:
        if self.active_task is None:
            return "(no active task)"
        return self.active_task.title

    @property
    def task_id(self) -> Optional[str]:
        return self.active_task.task_id if self.active_task else None


@dataclass
class OfficeSnapshot:
    """Full snapshot of the office at a point in time."""
    board: str
    profiles: dict[str, ProfileState] = field(default_factory=dict)
    total_tasks: int = 0
    active_profiles: int = 0
    events: list["OfficeEvent"] = field(default_factory=list)
    error: Optional[str] = None  # set if DB/board error (AC-8)

    def get_profile(self, name: str) -> ProfileState:
        if name not in self.profiles:
            self.profiles[name] = ProfileState(
                profile=name, status=DisplayStatus.IDLE
            )
        return self.profiles[name]


@dataclass
class OfficeEvent:
    """One event from task_events, formatted for the live feed."""
    event_id: int
    created_at: int
    kind: str
    task_id: str
    task_title: str
    assignee: str
    payload: Optional[str] = None  # raw JSON


# ── Aggregation logic ───────────────────────────────────────────────

def get_profile_display(
    profile: str,
    tasks: list[TaskState],
    done_count: int,
    now: int,
) -> ProfileState:
    """Aggregate a profile's tasks into a single display state.

    Picks the highest-priority active task to display; falls back to IDLE
    if no active tasks.
    """
    active = [t for t in tasks if t.db_status != "done"]
    if not active:
        return ProfileState(
            profile=profile,
            status=DisplayStatus.IDLE,
            done_count=done_count,
        )

    # Priority cao nhất, rồi recency (started_at)
    best = max(active, key=lambda t: (t.priority, t.started_at or 0))
    return ProfileState(
        profile=profile,
        status=best.to_display(now),
        active_task=best,
        done_count=done_count,
    )


# ── Formatting helpers ──────────────────────────────────────────────

def heartbeat_freshness(last_hb: Optional[int], now: int) -> str:
    """Format heartbeat freshness (architecture §9.3)."""
    if last_hb is None:
        return "♥ —"
    age = now - last_hb
    if age < 0:
        age = 0
    if age < 60:
        return f"♥ {age}s ago"
    elif age < STALE_WARNING_THRESHOLD:
        return f"♥ {age // 60}m ago"
    else:
        return f"⚠ stale ({age // 60}m)"


def is_stale(last_hb: Optional[int], now: int) -> bool:
    """Check if heartbeat is stale (>threshold seconds)."""
    if last_hb is None:
        return False
    return (now - last_hb) > STALE_WARNING_THRESHOLD


def duration_since(started_at: Optional[int], now: int) -> str:
    """Human-readable duration since a timestamp."""
    if started_at is None:
        return ""
    delta = now - started_at
    if delta < 0:
        delta = 0
    if delta < 60:
        return f"{delta}s"
    elif delta < 3600:
        return f"{delta // 60}m"
    else:
        return f"{delta // 3600}h{(delta % 3600) // 60:02d}m"


def truncate(text: str, max_len: int) -> str:
    if len(text) <= max_len:
        return text
    return text[: max_len - 1] + "…"
