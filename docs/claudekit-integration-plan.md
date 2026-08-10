# ClaudeKit Integration Plan — Tích hợp vào quy trình team Hermes

> **Owner:** PM | **Project:** Snake Neon | **Version:** 1.0 | **Date:** 2026-08-09
> **Scope:** 2 bộ ClaudeKit đã mua — Engineer v2.20.1 (33 agents, 144 skills, 10 workflows) + Marketing v1.4.0
> **Mục tiêu:** Biến ClaudeKit từ "asset cài sẵn" thành công cụ được team Hermes sử dụng có chủ đích, đúng lúc, đúng người.

---

## 0. TL;DR — Bức tranh tổng quan

ClaudeKit là hệ sinh thái **agents + skills + workflows + slash commands** chạy trên Claude Code (CLI). Sếp đã cài sẵn 2 bộ (Engineer + Marketing) vào `~/.claude/`. Hiện tại team Hermes dùng **profile riêng trên Hermes Agent** (pm, ba, architect, frontend, backend, qa, ceo) — mỗi profile là một AI worker độc lập với model, memory, skills riêng.

**Bài toán cốt lõi:** ClaudeKit assets sinh ra cho Claude Code (subagent/Task model). Hermes Agent dùng kanban board + profile model. Hai hệ thống **không tự nhiên tích hợp** — cần mapping rõ: asset nào cho profile nào, dùng khi nào, và những gì cần adapt.

**Kết luận chính (xem chi tiết §4–§6):**

| Mức độ | Số asset | Ví dụ tiêu biểu | Hành động |
|--------|----------|-----------------|-----------|
| **Xài ngay** (ready) | ~30 skills + 8 agents | project-management, git, code-review, debug, sequential-thinking, frontend-development, backend-development, web-testing | Đưa vào workflow profile ngay (§4) |
| **Cần adapt nhẹ** | ~20 skills | ck-plan (phụ thuộc ck CLI), ck-loop, ck-predict, ck-scenario | Cài `ck` CLI hoặc dùng thay thế (§5.1) |
| **Chưa phù hợp** | ~90 skills marketing + sales | campaign, funnel, email, social — toàn bộ funnel marketing | Chờ phase 2 khi Snake Neon cần growth (§7) |

**Khuyến nghị số 1:** Đừng cố dùng tất cả 144 skills. Pick **~10 skills/engineering + 5 workflows** phù hợp stack hiện tại (web game, Canvas API, JS thuần), bỏ qua phần marketing cho đến khi có nhu cầu GTM thật.

---

## 1. Inventory — ClaudeKit có gì

### 1.1 Agents (33 files trong `~/.claude/agents/`)

| Nhóm | Agents | Model mặc định |
|------|--------|----------------|
| **PM / Quản lý** | project-manager, planner, docs-manager, journal-writer | haiku / opus / haiku / haiku |
| **Nghiên cứu** | researcher, scout, scout-external, brainstormer | haiku / haiku / haiku / — |
| **Engineering** | fullstack-developer, debugger, code-reviewer, code-simplifier, database-admin | sonnet / sonnet / — / opus / sonnet |
| **QA / Test** | tester | haiku |
| **DevOps** | git-manager, mcp-manager | haiku / haiku |
| **Marketing — Content** | content-creator, copywriter, content-reviewer, seo-specialist | sonnet / sonnet / sonnet / — |
| **Marketing — Growth** | attraction-specialist, funnel-architect, lead-qualifier, sale-enabler, upsell-maximizer | sonnet / opus / haiku / sonnet / sonnet |
| **Marketing — Ops** | campaign-manager, campaign-debugger, social-media-manager, email-wizard, analytics-analyst, community-manager, continuity-specialist | sonnet / sonnet / sonnet / sonnet / haiku / sonnet / sonnet |

Mỗi agent là một file `.md` với YAML frontmatter (name, description, tools, model) + system prompt định nghĩa role, behavioral checklist, workflow.

### 1.2 Skills (144 folders trong `~/.claude/skills/`)

Mỗi skill có `SKILL.md` với frontmatter chuẩn: `name`, `description`, `when_to_use`, `category`, `keywords`, `argument-hint`. Phân nhóm chính:

**Engineering skills (cho team build):**
- Planning/Analysis: ck-plan, ck-autoresearch, ck-graphify, sequential-thinking, context-engineering, problem-solving, analyze
- Development: frontend-development, backend-development, mobile-development, react-best-practices, web-frameworks, ui-styling, ui-ux-pro-max, frontend-design
- Quality: ck-code-review, code-review, security-scan, ck-security, clean-code, test, web-testing
- Debug/Ops: ck-debug, debugging, deploy, devops, git, worktree, databases
- Meta/tooling: skill-creator, kit-builder, mcp-builder, mcp-management, repomix, docs-seeker, document-skills, mintlify, kanban, plans-kanban, journal, retro

**Marketing skills (cho growth — Phase 2):**
- Strategy: marketing-planning, marketing-research, marketing-psychology, pricing-strategy, launch-strategy, competitor, brand, free-tool-strategy, referral-program-building, gamification-marketing
- Content/SEO: content-marketing, seo, copywriting, analytics, youtube, youtube-thumbnail-design, banner-design, logo-design
- CRO/Funnel: funnel, onboarding-cro, form-cro, ab-test-setup
- Paid/Channels: paid-ads, ads-management, affiliate-marketing, social, email

**CLI dependency (ck family):** 9 skills có prefix `ck-` (plan, code-review, debug, security, loop, predict, scenario, graphify, autoresearch) — phần lớn yêu cầu `ck` CLI (`npm install -g claudekit`) để chạy đầy đủ tính năng.

### 1.3 Workflows (10 files trong `~/.claude/workflows/`)

| Workflow | Mục đích | Agents tham gia |
|----------|----------|-----------------|
| **primary-workflow** | Dev loop: plan → implement → test → review → integrate → debug | planner, fullstack-dev, tester, code-reviewer, debugger, docs-manager |
| **orchestration-protocol** | Quy tắc chain subagents (sequential) + parallel execution | — (meta) |
| **development-rules** | Coding standards (YAGNI/KISS/DRY, file <200 dòng, kebab-case, try-catch) | — (meta) |
| **documentation-management** | Roadmap, changelog, architecture docs sync | docs-manager, project-manager |
| **content-workflow** | Content pipeline: draft → review → edit → audit → publish | content-creator, content-reviewer, seo-specialist |
| **campaign-workflow** | Campaign lifecycle: brief → creative → launch → measure | campaign-manager, content-creator, funnel-architect |
| **marketing-workflow** | E2E marketing: research → strategy → content → distribute → measure | researcher, planner, content-creator, social-media, analytics |
| **seo-workflow** | SEO audit → keyword → content → monitor | seo-specialist, attraction-specialist |
| **sales-workflow** | Lead gen → qualify → nurture → close → expand | attraction, lead-qualifier, email-wizard, sale-enabler |
| **analytics-workflow** | Data collection → analysis → reporting | analytics-analyst, campaign-debugger |

### 1.4 Commands (slash commands trong `~/.claude/commands/ckm/`)

34 commands: `analyze`, `ask`, `plan`, `play`, `test`, `seo`, `social`, `email`, `campaign`, `funnel`, `competitor`, `brand`, `dashboard`, `docs`, `journal`, `kanban`, `persona`, `slides`, `video`, `youtube`, `write`, `worktree`, `use-mcp`, `hub`, `init`, `preview`, `storage`, `watzup`. Chỉ dùng được trong Claude Code CLI, không dùng được trực tiếp trong Hermes Agent.

---

## 2. Context — Team Hermes hiện tại

### 2.1 Profiles Hermes (7 profiles active)

```
default  → glm-5-turbo (legacy)
ceo      → glm-5.2 (gateway running)
pm       → glm-5.2  ← (bạn đang ở đây)
ba       → glm-5.2
architect→ glm-5.2
frontend → glm-5.2
backend  → glm-5.2
qa       → glm-5.2
```

Mỗi profile là một worker độc lập trên Hermes Agent platform — có model, memory, skills riêng. Phối hợp qua **kanban board** (`~/.hermes/kanban.db`): CEO tạo task → PM break down → assign cho specialist profiles → feedback loop qua comments.

### 2.2 Project Snake Neon

Web game (Snake) bằng Canvas API + JS thuần. Đã có: mobile controls, virtual joystick, 100 game variants, territory expansion. Tech stack đơn giản — **không có React/Next.js/Node backend/database**.

→ Điều này ảnh hưởng chọn skill: nhiều skills ClaudeKit tối ưu cho React/Next.js stack sẽ **overkill hoặc không apply**. Cần filter kỹ.

---

## 3. Khác biệt ClaudeKit vs Hermes — Cần hiểu trước khi tích hợp

| Khía cạnh | ClaudeKit (Claude Code) | Hermes Agent |
|-----------|------------------------|--------------|
| **Orchestration** | Subagent/Task (spawn trong 1 session) | Kanban board (cross-session, cross-profile) |
| **Agent ↔ Profile** | Agent = role prompt, spawn ad-hoc | Profile = worker cố định, có memory dày |
| **Skill activation** | Tự activate theo description match | Inject qua `skills` param khi tạo task |
| **Memory** | Per-agent memory (project/user) | Per-profile memory + task handoff |
| **Slash commands** | `/ckm:plan`, `/ckm:test`... | Không có (CLI-only) |
| **Model** | Gán per-agent (haiku/sonnet/opus) | Gán per-profile (glm-5.2) |

**Hệ quả:** Không thể "copy agent ClaudeKit vào profile Hermes" trực tiếp. Cách tích hợp đúng là **chuyển hóa knowledge từ agent/skill prompt → behavioral guideline cho profile Hermes**, hoặc **chạy ClaudeKit song song như tool bên ngoài** khi cần sức mạnh chuyên sâu.

---

## 4. Mapping ClaudeKit → Profiles Hermes (Khuyến nghị chính)

### 4.1 PM (bạn)

| Loại | Asset ClaudeKit | Cách dùng | Ưu tiên |
|------|-----------------|-----------|---------|
| Agent | `project-manager` | Tham khảo behavioral checklist (progress vs plan, blocker tracking, risk register) → áp vào SOP đã viết (`docs/sop-pm.md`) | **Now** |
| Agent | `planner` | Tham khảo verification discipline (re-grep, cite file:line, trace control flow) khi review plan của architect | **Now** |
| Skill | `project-management` | Framework track progress, status report, handoff | **Now** |
| Skill | `sequential-thinking` | Decompose epic phức tạp, verify hypothesis trước khi break down | **Now** |
| Workflow | `primary-workflow` | Tham khảo để định hình dev loop cho team | **Now** |
| Workflow | `documentation-management` | Áp trigger update roadmap/changelog khi milestone | **Now** |

### 4.2 BA (Business Analyst)

ClaudeKit không có agent "business analyst" cụ thể — role gần nhất là `researcher` + `docs-manager`.

| Loại | Asset | Cách dùng | Ưu tiên |
|------|-------|-----------|---------|
| Agent | `researcher` | Behavioral checklist: multi-source, credibility, trade-off matrix, ranked recommendation — áp cho requirement research | **Now** |
| Skill | `research`, `docs-seeker`, `document-skills` | Đọc/giải析 tài liệu nghiệp vụ, requirement docs | **Now** |
| Skill | `marketing-research`, `competitor` | Khi cần competitor/market analysis cho PRD | **Phase 2** |

### 4.3 Architect

| Loại | Asset | Cách dùng | Ưu tiên |
|------|-------|-----------|---------|
| Agent | `planner` | **Gold standard** — behavioral checklist (data flow, dependency graph, risk per phase, test matrix, rollback, file ownership) chính là checklist architect | **Now** |
| Agent | `researcher` | Research tech options với trade-off matrix | **Now** |
| Skill | `ck-plan` | Plan architecture với phases, --parallel, --tdd (cần `ck` CLI) | **Adapt** |
| Skill | `ck-graphify` | Codebase knowledge graph → hiểu architecture hiện tại | **Adapt** |
| Skill | `ck-predict` | 5 expert personas debate trước change lớn | **Adapt** |
| Skill | `context-engineering` | Quản lý context cho task phức tạp | **Now** |
| Workflow | `orchestration-protocol` | Quy tắc chain/parallel agents khi plan | **Now** |

### 4.4 Frontend

| Loại | Asset | Cách dùng | Ưu tiên |
|------|-------|-----------|---------|
| Agent | `fullstack-developer` | Behavioral checklist (error handling, input validation, no TODO, type safety) | **Now** |
| Agent | `ui-ux-designer` | Design intelligence (Dribbble/Awwwards-level), skill activation order | **Now** |
| Skill | `frontend-development` | React/TS patterns — **caveat: Snake Neon dùng JS thuần, cherry-pick pattern không phải framework** | **Adapt** |
| Skill | `ui-ux-pro-max` | Design intelligence DB (color, typography, layout) | **Now** |
| Skill | `frontend-design` | Replicate UI từ design/screenshot | **Now** |
| Skill | `web-design-guidelines` | Accessibility + UX review | **Now** |
| Skill | `ui-styling` | shadcn/ui + Tailwind — **không apply Snake Neon (không React), dùng cho project khác** | **Skip** (project này) |

### 4.5 Backend

| Loại | Asset | Cách dùng | Ưu tiên |
|------|-------|-----------|---------|
| Agent | `fullstack-developer` | Same checklist như frontend | **Now** |
| Agent | `debugger` | SRE-style root cause analysis (evidence first, 2-3 hypotheses, elimination) | **Now** |
| Agent | `database-admin` | Query optimization, index, backup — **Snake Neon chưa có DB, dùng khi thêm backend** | **Phase 2** |
| Skill | `backend-development` | Node/Python/Go API patterns — **cherry-pick, Snake Neon là frontend-only** | **Phase 2** |
| Skill | `ck-debug`, `debugging` | Systematic debug framework (4-phase, backward trace) | **Now** |
| Skill | `databases` | Khi cần | **Phase 2** |

### 4.6 QA

| Loại | Asset | Cách dùng | Ưu tiên |
|------|-------|-----------|---------|
| Agent | `tester` | **Gold standard** — QA Lead role, diff-aware mode (run only affected tests), coverage analysis, flaky test detection | **Now** |
| Agent | `code-reviewer` | Staff Engineer review posture (hunt bugs pass CI but break prod), 9-point behavioral checklist | **Now** |
| Skill | `test`, `web-testing` | Unit/integration/e2e, Playwright/Vitest/k6 | **Now** |
| Skill | `ck-code-review`, `code-review` | Evidence-based review, receiving feedback framework | **Now** |
| Skill | `ck-scenario` | Edge case generation (12 dimensions) — **rất giá trị cho game có nhiều variant** | **Now** |
| Skill | `security-scan`, `ck-security` | Secrets/dependency/OWASP scan trước release | **Now** |
| Skill | `web-testing` | Visual regression, a11y, Core Web Vitals cho web game | **Now** |

---

## 5. Phân tích Ready vs Adapt vs Skip

### 5.1 Skills cần adapt (cài thêm hoặc sửa)

| Skill | Vấn đề | Cách adapt |
|-------|--------|------------|
| `ck-plan` | Yêu cầu `ck` CLI (`npm install -g claudekit`) | Cài CLI, hoặc dùng `planner` agent prompt làm template cho profile architect |
| `ck-code-review` | Tích hợp `scout` skill + checklist files | Copy checklist vào Hermes skill QA, chạy thủ công |
| `ck-debug` | Cần `ck` CLI cho một số sub-command | Dùng `debugging` skill (không cần CLI) thay thế |
| `ck-loop` / `ck-predict` / `ck-scenario` / `ck-security` | Autoresearch pattern, cần CLI | Chạy trong Claude Code session riêng khi cần, không qua Hermes |
| `frontend-development` / `react-best-practices` / `web-frameworks` | Tối ưu React/Next.js | Snake Neon = JS thuần → cherry-pick concept, bỏ framework cụ thể |
| `ui-styling` (shadcn/Tailwind) | Phụ thuộc React ecosystem | Skip cho Snake Neon, dùng cho project React khác |

### 5.2 Skills xài ngay (không cần adapt)

Engineering: `git`, `test`, `web-testing`, `code-review`, `debugging`, `sequential-thinking`, `context-engineering`, `problem-solving`, `security-scan`, `clean-code`, `deploy`, `devops`, `worktree`, `repomix`, `docs-seeker`, `document-skills`, `mintlify`, `journal`, `retro`, `ui-ux-pro-max`, `frontend-design`, `web-design-guidelines`, `design-system`, `skill-creator`, `kit-builder`, `mcp-builder`, `mcp-management`.

### 5.3 Skills skip (chưa phù hợp project hiện tại)

Toàn bộ **marketing + sales skills** (~90 skills): campaign, funnel, email, social, seo, paid-ads, analytics-marketing, copywriting, content-marketing, attraction, lead-qualifier, sale-enabler, upsell-maximizer, continuity, community, pricing-strategy, launch-strategy, brand, competitor, referral, gamification-marketing, ab-test-setup, form-cro, onboarding-cro, free-tool-strategy, youtube, banner-design, logo-design, affiliate...

**Lý do skip:** Snake Neon chưa có GTM/marketing phase. Khi cần (Phase 2), quay lại doc này và activate theo §7.

---

## 6. Quy trình tích hợp đề xuất

### Phase 0 — Ngay (Tuần này, 0 cost)

**Không cài thêm gì.** Chỉ extract knowledge từ ClaudeKit agent prompts → đưa vào behavioral guideline của profiles Hermes:

1. **PM** → cập nhật `docs/sop-pm.md` thêm "Behavioral checklist" từ `project-manager` agent (progress vs plan, blocker, risk register, next action có owner).
2. **Architect** → thêm "Verification discipline" từ `planner` agent (re-grep, cite file:line, trace control flow, enumerate callers) vào workflow plan.
3. **QA** → thêm "9-point behavioral checklist" từ `code-reviewer` agent + "diff-aware test mode" từ `tester` agent vào QA SOP.
4. **Frontend/Backend** → thêm "8-point completion checklist" từ `fullstack-developer` agent (error handling, input validation, no TODO, type safety, file ownership, tests added).

→ Đây là cách **lợi nhuận cao nhất, cost thấp nhất**: knowledge của ClaudeKit (đắt tiền) được chuyển thành checklist cho team, chạy trên platform Hermes (đã quen).

### Phase 1 — Short term (2–4 tuần)

**Đường dẫn kép:** Dùng Hermes cho orchestration (kanban, profile coordination) + dùng Claude Code CLI cho tác vụ chuyên sâu cần ClaudeKit skills.

Cụ thể:
- Khi architect cần plan phức tạp → chạy `/ckm:plan --parallel` trong Claude Code, output plan file → attach vào kanban task.
- Khi QA cần security scan → chạy `ck:security` trong Claude Code → report attach vào task.
- Khi frontend cần replicate design → chạy `ui-ux-pro-max` search trong Claude Code.

**Yêu cầu:** Cài `ck` CLI: `npm install -g claudekit`. Verify: `ck --version`.

### Phase 2 — Khi Snake Neon cần growth/marketing

Activate marketing assets theo thứ tự:
1. `marketing-research` + `competitor` → hiểu thị trường game casual
2. `launch-strategy` → plan go-to-market
3. `seo` + `content-marketing` → organic growth
4. `analytics` + `gamification-marketing` → retention
5. (Tùy) `paid-ads` nếu chạy ads

Lúc này tạo profile `marketing` trên Hermes, map ClaudeKit marketing agents (campaign-manager, content-creator, seo-specialist...) theo cùng pattern §4.

---

## 7. Risk & Lưu ý

| Risk | Mức | Giảm thiểu |
|------|-----|------------|
| **Skill overload** — 144 skills gây choice paralysis | Cao | Chỉ activate ~15 skills engineering. Bỏ qua marketing đến Phase 2. |
| **Model mismatch** — ClaudeKit tối ưu cho Claude (haiku/sonnet/opus), team dùng GLM-5.2 | Trung bình | GLM-5.2 đủ capability cho most skills. Complex reasoning (ck-predict 5-persona debate) có thể kém hơn — test trước khi rely. |
| **CLI dependency** — ck family cần `ck` CLI riêng | Thấp | Cài 1 lần `npm install -g claudekit`. Fallback: dùng agent prompt làm template. |
| **Context bloat** — activate nhiều skill cùng lúc tốn token | Trung bình | Rule: 1 task → max 2-3 skills active. Sequential-thinking quyết định activate cái nào. |
| **Duplicate effort** — Hermes kanban vs ClaudeKit plan/tasks | Cao | **Kanban = single source of truth.** ClaudeKit plan output → attach vào kanban task, không track song song. |
| **Snake Neon stack mismatch** — nhiều skill cho React/Next.js | Trung bình | Filter kỹ §5. Cherry-pick concept, bỏ framework cụ thể. |

---

## 8. Kết luận & Recommendation cho CEO

1. **Giá trị lớn nhất của ClaudeKit không nằm ở việc "chạy agent" mà ở knowledge trong agent prompts.** Extract behavioral checklist → đưa vào profile Hermes là ROI cao nhất ngay lập tức.
2. **Phase 0 (0 cost, tuần này):** PM cập nhật SOP các profile với checklist từ ClaudeKit. Đây là action item cụ thể.
3. **Phase 1 (2-4 tuần):** Cài `ck` CLI, dùng Claude Code song song cho plan/security/design chuyên sâu. Kanban Hermes vẫn là coordination hub.
4. **Phase 2 (khi cần):** Activate marketing assets khi Snake Neon ready cho GTM.
5. **Không cố dùng hết 144 skills.** Snake Neon là web game JS thuần — ~15 engineering skills là đủ. Phần marketing chờ đúng thời điểm.

**Action items cho PM (follow-up tasks):**
- [ ] Tạo task cho PM: cập nhật `docs/sop-pm.md` với behavioral checklist từ `project-manager` agent
- [ ] Tạo task cho Architect: thêm verification discipline từ `planner` agent vào workflow
- [ ] Tạo task cho QA: thêm code-reviewer checklist + tester diff-aware mode vào QA SOP
- [ ] Tạo task cho Frontend/Backend: thêm completion checklist từ fullstack-developer agent

---

*Doc này là living document. Cập nhật khi team bắt đầu dùng ClaudeKit thực tế và có feedback.*
