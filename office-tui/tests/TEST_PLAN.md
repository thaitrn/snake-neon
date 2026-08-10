# QA Test Plan — Virtual Office TUI

> **Owner:** QA (Goku 🐉)
> **Spec ref:** `docs/office-tui-spec.md` AC-1..AC-10
> **Date:** 2026-08-09
> **Build under test:** backend run-4 deliverable (Python 3.11 + Textual 8.2.8, 13 modules)

## 1. Test strategy

| Layer | Approach | Files |
|---|---|---|
| Unit — pure logic | dataclass status mapping (no DB, no TUI) | `test_status_mapping.py` |
| Integration — DB reader | KanbanReader vs temp SQLite with real schema | `test_kanban_reader.py` |
| Widget — render | DeskCard/HeaderBar/LiveFeed/FooterBar/TaskDetailPanel render strings | `test_widgets.py` |
| E2E — Textual Pilot | mount → poll → refresh → switch → follow → quit, headless | `test_e2e_pilot.py` |
| Edge cases | corrupt DB, schema error, empty board, archived status, conn leak, compact mode | `test_edge_cases.py` |

## 2. Acceptance criteria → test mapping

| AC | Description | Coverage |
|---|---|---|
| AC-1 | 7 dept sections + desk cards render, no wrap | E2E mount + widget render |
| AC-2 | status mapping 🟢⏳🔴✅💤 | unit (10) + reader (4) |
| AC-3 | realtime refresh < 5s, no full-screen flicker | E2E poll + refresh binding |
| AC-4 | multi-board switching | E2E switch_board binding |
| AC-5 | heartbeat freshness ♥ Ns ago / ⚠ stale | widget render + formatting unit |
| AC-6 | live feed 5 events, DESC sort | widget render + reader events |
| AC-7 | compact mode < 100 cols | edge case compact toggle |
| AC-8 | graceful degradation (missing/corrupt board) | edge cases corrupt + not-found + schema-error |
| AC-9 | perf < 200ms per poll, < 50MB RAM | edge case perf bench |
| AC-10 | quit clean, no SQLite leak | E2E quit + edge case conn-leak |

## 3. Edge cases identified

1. `block_kind = NULL` on blocked tasks (CRITICAL — real data) → BLOCKED ✓
2. `status = 'archived'` (found in snake-neon, NOT in spec) → falls to IDLE fallback → must NOT crash
3. `last_heartbeat_at = NULL` while current_run_id set → WAITING (dead worker)
4. Profile with only done tasks → IDLE + done_count badge
5. Corrupt DB (random bytes) → DatabaseError → snapshot.error, no crash
6. Schema missing columns → SchemaError → snapshot.error, no crash
7. Empty board (0 tasks) → all profiles IDLE
8. SQLite connection leak across polls → AC-10 regression
9. Task title NULL in DB → "(untitled)" fallback
10. Empty event payload / malformed JSON → no crash, plain icon

## 4. Sign-off gates

- ALL tests green (0 fail)
- 0 RuntimeWarning under `-W error::RuntimeWarning`
- Real DB read smoke test (ai-company, office-tui, snake-neon) → no crash, correct status
- E2E Pilot lifecycle clean (mount→quit, no exception)
