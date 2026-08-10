# Team Performance Evaluation Framework

> Version 1.0 — 2026-08-09
> Owner: PM. Tự quyết định tiêu chí, trọng số, format report.

---

## 1. MỤC ĐÍCH

Đo lường năng lực thực tế của mỗi role (PM, BA, Architect, Frontend, Backend, QA)
dựa trên **data kanban khách quan** — không cảm tính, không ngồi tự đánh giá.

Mục tiêu: sếp xem 1 cái là biết ai mạnh/yếu ở đâu, cần cải thiện gì.

---

## 2. RATING SCALE

4 cấp, theo đường cong phát triển kỹ năng (không phải thâm niên):

| Cấp     | Định nghĩa                                                         | Điểm |
|---------|--------------------------------------------------------------------|------|
| Junior  | Làm được khi có spec rõ, cần hướng dẫn, hay miss bug              | 1.0  |
| Middle  | Tự làm đúng spec, tự test cơ bản, ít bug miss                      | 2.0  |
| Senior  | Tự chủ toàn cycle, proactively raise issues, output chất lượng cao | 3.0  |
| Lead    | Senior + nâng tầm team: mentor, định hướng kỹ thuật/sản phẩm       | 4.0  |

Quy tắc đánh giá: **dựa trên evidence trong kanban**, không dựa trên cảm nhận.
Mỗi cấp cần threshold score (xem mục 5).

---

## 3. KPI FRAMEWORK — 5 DIMENSIONS

Mỗi dimension có trọng số khác nhau tùy role, nhưng **5 dimensions chung cho tất cả**:

### 3.1 Throughput (Năng suất) — Trọng số: 25%
Đo lường: số task hoàn thành / số task nhận trong kỳ.

```
Throughput Score = (done_tasks / assigned_tasks) × 100%
```

| Điểm | Benchmark                          |
|------|------------------------------------|
| 100% | Hoàn thành mọi task nhận           |
| ≥75% | Đạt                                 |
| <50% | Cần attention — kẹt hoặc slow      |

Data source: `tasks WHERE assignee=X AND status='done'` / total assigned.

### 3.2 Reliability (Độ tin cậy) — Trọng số: 25%
Đo lường: tỷ lệ run thất bại (crash, timeout, protocol violation) trên tổng run.

```
Reliability Score = (successful_runs / total_runs) × 100%
```

Crash = outcome IN ('crashed','timed_out','spawn_failed','gave_up').
Reclaimed KHÔNG tính crash (đó là hệ thống reclaim, không phải lỗi worker).

| Điểm  | Ý nghĩa                              |
|-------|--------------------------------------|
| ≥85%  | Ổn định, ít fail                     |
| 70-85%| Khá, đôi khi fail nhưng recover được |
| <70%  | Hay crash — cần debug root cause     |

### 3.3 Quality (Chất lượng) — Trọng số: 25%
Đo lường: bug miss rate + rework cần thiết sau khi QA sign-off.

```
Quality Score = 100% - (bug_misses / total_completed_tasks × 100%)
```

Bug miss = bug sếp/user báo sau khi QA đã pass.
Rework = task bị reopen hoặc cần fix bổ sung sau complete.

| Điểm  | Benchmark                            |
|-------|--------------------------------------|
| ≥90%  | Sạch — ít bug lọt                     |
| 75-90%| Acceptable                            |
| <75%  | Cần cải thiện QA hoặc dev discipline |

### 3.4 Initiative (Chủ động) — Trọng số: 15%
Đo lường: self-improvement signals trong kanban.

Signals:
- Run có summary chất lượng (post-mortem, root cause, lesson learned)
- Comment có substance (technical findings, suggestions)
- Tự tạo task follow-up (không đợi CEO assign)
- Metadata có findings/decisions

```
Initiative Score = min(100%, (quality_summaries + substantive_comments + self_created_tasks) / baseline × 100%)
```

Baseline = 2 signals/tuần cho Middle, 4 cho Senior.

### 3.5 Cycle Efficiency (Tốc độ) — Trọng số: 10%
Đo lường: cycle time trung bình (started → completed).

```
Cycle Score = benchmark_time / avg_cycle_time × 100%
```

Benchmark per role (phút):
- PM, BA, Architect: ≤10 phút (doc/analysis task)
- Backend, Frontend: ≤30 phút (implement task)
- QA: ≤20 phút (test task)

Capped at 100% (không bonus quá nhanh nếu chất lượng kém).

---

## 4. TRỌNG SỐ THEO ROLE

Mỗi role ưu tiên dimension khác nhau:

| Dimension    | PM  | BA  | Architect | Frontend | Backend | QA  |
|--------------|-----|-----|----------|----------|---------|-----|
| Throughput   | 20% | 20% | 15%      | 20%      | 20%     | 25% |
| Reliability  | 25% | 25% | 25%      | 25%      | 25%     | 25% |
| Quality      | 25% | 25% | 30%      | 30%      | 30%     | 30% |
| Initiative   | 20% | 20% | 20%      | 15%      | 15%     | 10% |
| Cycle Eff.   | 10% | 10% | 10%      | 10%      | 10%     | 10% |
| **Total**    |100% |100% |100%      |100%      |100%     |100% |

Logic:
- **QA/Dev**: Quality nặng nhất (30%) — bug miss là lỗi nghiêm trọng nhất
- **PM/BA**: Initiative cao (20%) — phải proactively propose, không đợi hỏi
- **Architect**: Quality 30% — design sai = hậu quả lớn

---

## 5. RUBRIC ĐÁNH GIÁ — THRESHOLD THEO CẤP

Composite score = tổng có trọng số của 5 dimensions (0-100).

| Cấp    | Composite | Ý nghĩa                                    |
|--------|-----------|--------------------------------------------|
| Lead   | ≥90       | Top performer, đáng tin cậy toàn diện       |
| Senior | 80-89     | Tự chủ, chất lượng cao, ít cần giám sát     |
| Middle | 65-79     | Đạt yêu cầu, cần cải thiện 1-2 dimension     |
| Junior | 50-64     | Cần hướng dẫn, có gap rõ ràng                |
| <Junior| <50       | Cần intervention: retrain hoặc reassign      |

Quy tắc "hard gate": **Reliability <60% → caps total at Middle** dù các dimension khác cao.
Lý do: agent hay crash không thể trust làm task phức tạp.

---

## 6. SAMPLE WEEKLY REPORT FORMAT

Report tự động generate, format cho sếp xem nhanh:

```
TEAM PERFORMANCE — WEEK ENDING [DATE]
═══════════════════════════════════════════════

RANKING (by composite score):
  1. [Role]    ████████████░░  87  Senior  ⬆
  2. [Role]    ██████████░░░░  72  Middle  
  ...

SCORECARD:
┌──────────┬──────┬──────┬─────────┬──────────┬──────────┬──────────┬─────────┐
│ Role     │ Comp │ Cấp  │Through. │Reliab.   │ Quality  │Initiative│Cycle Eff│
├──────────┼──────┼──────┼─────────┼──────────┼──────────┼──────────┼─────────┤
│ PM       │  87  │Senior│ 100%    │  94%     │  100%    │  85%     │  92%    │
│ ...      │      │      │         │          │          │          │         │
└──────────┴──────┴──────┴─────────┴──────────┴──────────┴──────────┴─────────┘

RED FLAGS:
  ⚠ Frontend — Reliability 43% (7 crashes on 16 runs)
  ⚠ QA — Reliability 42% (8 crashes on 19 runs)

HIGHLIGHTS:
  ✓ PM — highest throughput (5/5 tasks completed)
  ✓ Architect — zero quality issues, clean designs

RECOMMENDATIONS:
  → Frontend: debug crash root cause (protocol violations)
  → QA: stabilize worker before next test cycle
```

---

## 7. DATA SOURCES (AUTO-EXTRACTION)

Toàn bộ metrics extract từ kanban DB, không cần input thủ công:

| Metric         | Table         | Query Logic                                          |
|----------------|---------------|------------------------------------------------------|
| Throughput     | tasks         | COUNT(status='done') / COUNT(*) GROUP BY assignee     |
| Reliability    | task_runs     | COUNT(outcome='completed') / COUNT(*) GROUP BY profile|
| Quality        | tasks + bugs  | bugs_reported_after_qa / completed_tasks             |
| Initiative     | task_runs + comments | quality_summaries + substantive_comments       |
| Cycle Time     | tasks         | AVG(completed_at - started_at) GROUP BY assignee      |

Script: `scripts/perf-report.js` — đọc kanban DB, generate report.

---

## 8. ROLLOUT — ÁP DỤNG NGAY

### Tuần 1 (hiện tại): Baseline
- Chạy `scripts/perf-report.js` để có baseline score cho toàn team
- KHÔNG dùng để phạt — dùng để identify gaps
- Share report với team, để mỗi profile biết mình ở đâu

### Tuần 2-4: Stabilize
- Focus vào RED FLAGS (Reliability <70%)
- Mỗi profile tự improve dimension yếu nhất của mình
- Track trend qua các tuần

### Tháng 2: Evaluate
- So sánh baseline vs current
- Promote ai đạt Senior threshold 2 tuần liên tiếp
- Coach/Reassign ai stuck ở Junior

### Cơ chế auto-report
- Manual: `node scripts/perf-report.js`
- Auto (optional): tạo cron chạy mỗi Chủ nhật 23:00, deliver report cho CEO/sếp

---

## 9. NGUYÊN TẮC

1. **Data-driven**: mọi đánh giá có query SQL đằng sau, không cảm tính
2. **Transparent**: rubric công khai, mỗi profile biết mình bị đánh giá thế nào
3. **Growth-oriented**: mục tiêu là improve, không phải phạt
4. **Role-specific**: không so sánh PM với Frontend — so sánh với benchmark role đó
5. **Anti-gaming**: Quality có hard gate — không thể farm throughput mà bug miss
