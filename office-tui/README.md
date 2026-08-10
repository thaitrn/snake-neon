# Hermes Virtual Office TUI

A read-only realtime terminal dashboard for the Hermes multi-agent system. Each
profile (ceo / pm / ba / architect / frontend / backend / qa) shows up as a desk
card inside its department, with live status pulled from the kanban SQLite DB.

## Quick start

```bash
cd office-tui
source .venv/bin/activate        # textual 8.x already installed
python office_tui.py             # auto-detects boards, polls every 5s
```

Or pick a board directly:

```bash
python office_tui.py --board ai-company
python office_tui.py --board snake-neon --interval 3
python office_tui.py --no-immutable   # if ro+immutable reads stale data
```

## Keybindings

| Key   | Action                                  |
|-------|-----------------------------------------|
| `1-5` | Switch board (by index in footer)       |
| `r`   | Force refresh (re-poll now)             |
| `f`   | Follow the most active task (modal)     |
| `ESC` | Close the task-detail modal             |
| `q`   | Quit                                    |

## Status icons

```
🟢 working   — current_run_id set, heartbeat < 120s old
⏳ waiting   — todo, stale run, or blocked with block_kind=dependency
🔴 blocked   — status=blocked, block_kind is NOT 'dependency'
✅ done      — status=done
💤 idle      — profile has no active task
```

## Layout

- **Header** — board name, clock, active-profile count, total tasks, refresh rate.
- **Department grid** — 7 sections (Management, PM, BA, Architect, Frontend,
  Backend, QA). Each profile is a desk card with status icon, task title,
  duration, and heartbeat freshness (`♥ Ns ago`).
- **Live feed** — 5 most recent events (created / blocked / completed / heartbeat).
- **Footer** — available boards + keybinding hints.
- **Compact mode** — below 100 columns the grid collapses to single-column.

## Architecture

```
Textual App (asyncio)
  └─ PollWorker (5s timer)
       └─ KanbanReader  ──read-only──▶  ~/.hermes/kanban/boards/{board}/kanban.db
            └─ OfficeSnapshot (reactive) ──▶ widgets re-render
```

DB access uses `mode=ro&immutable=1` with open-close per poll — zero lock
contention with the Hermes dispatcher. See
`docs/office-tui-architecture.md` for the full design.

## Project layout

```
office-tui/
├── office_tui.py            # entry point
├── office.tcss              # Textual CSS
├── src/
│   ├── app.py               # OfficeTUI(App) — compose, timers, bindings
│   ├── config.py            # departments, profiles, CLI args, board discovery
│   ├── kanban_reader.py     # DB access + snapshot builder
│   ├── office_state.py      # status mapping logic (spec §2.6)
│   └── widgets/             # header, grid, section, desk_card, feed, footer, modal
└── tests/                   # 31 tests: status mapping + kanban reader
```

## Tests

```bash
source .venv/bin/activate
python -m pytest tests/ -v
```
