#!/usr/bin/env node
/**
 * Team Performance Report Generator
 * — Reads kanban DB via sqlite3 CLI, computes 5-dimension score per role,
 *   outputs weekly report. Zero npm dependencies.
 *
 * Usage:
 *   node scripts/perf-report.js
 *   node scripts/perf-report.js > docs/reports/perf-2026-08-09.md
 *
 * Framework: docs/performance-framework.md
 * Data source: kanban DB (tasks, task_runs, task_comments tables)
 */

const { execSync } = require('child_process');
const path = require('path');

const DB_PATH = process.env.KANBAN_DB ||
  path.join(process.env.HOME, '.hermes/kanban/boards/snake-neon/kanban.db');

const SQLITE = 'sqlite3';

// ─── Helpers ───
function sql(query) {
  return execSync(`${SQLITE} "${DB_PATH}" "${query.replace(/"/g, '""')}"`, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
}

// ─── Weights per role (framework §4) ───
const WEIGHTS = {
  pm:        { throughput: 0.20, reliability: 0.25, quality: 0.25, initiative: 0.20, cycle: 0.10 },
  ba:        { throughput: 0.20, reliability: 0.25, quality: 0.25, initiative: 0.20, cycle: 0.10 },
  architect: { throughput: 0.15, reliability: 0.25, quality: 0.30, initiative: 0.20, cycle: 0.10 },
  frontend:  { throughput: 0.20, reliability: 0.25, quality: 0.30, initiative: 0.15, cycle: 0.10 },
  backend:   { throughput: 0.20, reliability: 0.25, quality: 0.30, initiative: 0.15, cycle: 0.10 },
  qa:        { throughput: 0.25, reliability: 0.25, quality: 0.30, initiative: 0.10, cycle: 0.10 },
};

const CYCLE_BENCHMARK = { pm: 10, ba: 10, architect: 10, frontend: 30, backend: 30, qa: 20 };

function ratingLabel(score, reliability) {
  if (reliability < 60 && score >= 80) return { label: 'Middle*', capped: true };
  if (score >= 90) return { label: 'Lead' };
  if (score >= 80) return { label: 'Senior' };
  if (score >= 65) return { label: 'Middle' };
  if (score >= 50) return { label: 'Junior' };
  return { label: '<Junior' };
}

function bar(score, width = 14) {
  const filled = Math.round((score / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function pad(str, len, align = 'left') {
  str = String(str);
  if (str.length >= len) return str.slice(0, len);
  const spaces = ' '.repeat(len - str.length);
  return align === 'right' ? spaces + str : str + spaces;
}

// ─── Extract metrics ───
function getMetrics() {
  const roles = {};

  // Task counts
  const tasks = sql(`SELECT assignee, COUNT(*), SUM(CASE WHEN status='done' THEN 1 ELSE 0 END), SUM(CASE WHEN status='blocked' THEN 1 ELSE 0 END) FROM tasks WHERE assignee IS NOT NULL GROUP BY assignee;`).trim().split('\n').filter(Boolean);
  for (const line of tasks) {
    const [role, total, done, blocked] = line.split('|');
    roles[role] = { role, total: +total, done: +done, blocked: +blocked || 0 };
  }

  // Run outcomes
  const runs = sql(`SELECT t.assignee, COUNT(*), SUM(CASE WHEN r.outcome='completed' THEN 1 ELSE 0 END), SUM(CASE WHEN r.outcome IN ('crashed','timed_out','spawn_failed','gave_up') THEN 1 ELSE 0 END) FROM task_runs r JOIN tasks t ON r.task_id=t.id WHERE t.assignee IS NOT NULL GROUP BY t.assignee;`).trim().split('\n').filter(Boolean);
  for (const line of runs) {
    const [role, totalRuns, completed, crashes] = line.split('|');
    if (!roles[role]) roles[role] = { role, total: 0, done: 0 };
    roles[role].totalRuns = +totalRuns;
    roles[role].completed = +completed;
    roles[role].crashes = +crashes;
  }

  // Cycle times
  const cycles = sql(`SELECT t.assignee, AVG((completed_at-started_at)/60.0), COUNT(*) FROM tasks t WHERE t.status='done' AND t.started_at IS NOT NULL AND t.completed_at IS NOT NULL GROUP BY t.assignee;`).trim().split('\n').filter(Boolean);
  for (const line of cycles) {
    const [role, avgCycle, samples] = line.split('|');
    if (!roles[role]) roles[role] = { role, total: 0, done: 0 };
    roles[role].avgCycle = +avgCycle;
    roles[role].cycleSamples = +samples;
  }

  // Initiative: quality summaries + comments
  const summaries = sql(`SELECT t.assignee, COUNT(*) FROM task_runs r JOIN tasks t ON r.task_id=t.id WHERE r.summary IS NOT NULL AND length(r.summary) > 50 AND t.assignee IS NOT NULL GROUP BY t.assignee;`).trim().split('\n').filter(Boolean);
  for (const line of summaries) {
    const [role, count] = line.split('|');
    if (!roles[role]) roles[role] = { role, total: 0, done: 0 };
    roles[role].qualitySummaries = +count;
  }
  const comments = sql(`SELECT t.assignee, COUNT(*) FROM task_comments c JOIN tasks t ON c.task_id=t.id WHERE t.assignee IS NOT NULL GROUP BY t.assignee;`).trim().split('\n').filter(Boolean);
  for (const line of comments) {
    const [role, count] = line.split('|');
    if (!roles[role]) roles[role] = { role, total: 0, done: 0 };
    roles[role].comments = +count;
  }

  return Object.values(roles);
}

// ─── Compute scores ───
function computeScores(metrics) {
  return metrics.map(m => {
    const w = WEIGHTS[m.role] || WEIGHTS.frontend;

    const throughput = m.total > 0 ? (m.done / m.total) * 100 : 0;
    const totalRuns = m.totalRuns || 0;
    const reliability = totalRuns > 0 ? (m.completed / totalRuns) * 100 : 100;
    // Quality proxy: crash-adjusted (no separate bug-miss table yet)
    const quality = totalRuns > 0 ? Math.max(0, 100 - (m.crashes / totalRuns) * 200) : 100;
    const signals = (m.qualitySummaries || 0) + (m.comments || 0);
    const initiative = Math.min(100, (signals / 4) * 100);
    const benchmark = CYCLE_BENCHMARK[m.role] || 20;
    const cycle = m.avgCycle ? Math.min(100, (benchmark / m.avgCycle) * 100) : 0;

    const composite = Math.round(
      throughput * w.throughput + reliability * w.reliability +
      quality * w.quality + initiative * w.initiative + cycle * w.cycle
    );

    const rating = ratingLabel(composite, reliability);

    return {
      ...m,
      throughput: Math.round(throughput),
      reliability: Math.round(reliability),
      quality: Math.round(quality),
      initiative: Math.round(initiative),
      cycle: Math.round(cycle),
      composite, rating: rating.label, capped: rating.capped || false,
    };
  });
}

// ─── Render report ───
function renderReport(scores) {
  const ranked = [...scores].sort((a, b) => b.composite - a.composite);
  const date = new Date().toISOString().slice(0, 10);
  const L = [];

  L.push('# Team Performance Report — Snake Neon');
  L.push(`**Week ending:** ${date}`);
  L.push(`**Generated:** ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' })}`);
  L.push(`**Data:** ${scores.reduce((a, s) => a + (s.totalRuns || 0), 0)} runs across ${scores.length} roles`);
  L.push('');
  L.push('---');
  L.push('');
  L.push('## RANKING (by composite score)');
  L.push('');
  L.push('```');
  ranked.forEach((s, i) => {
    const arrow = s.composite >= 80 ? ' ⬆' : (s.composite < 65 ? ' ⚠' : '');
    L.push(`  ${i + 1}. ${pad(s.role.toUpperCase(), 10)} ${bar(s.composite)} ${pad(s.composite, 3, 'right')}  ${pad(s.rating, 10)}${arrow}`);
  });
  L.push('```');
  L.push('');
  L.push('## SCORECARD');
  L.push('');
  L.push('| Role       | Comp | Rating   | Thrput | Reliab | Qual.  | Init.  | Cycle  |');
  L.push('|------------|-----:|----------|-------:|-------:|-------:|-------:|-------:|');
  for (const s of scores) {
    L.push(`| ${pad(s.role.toUpperCase(), 10)} | ${pad(s.composite, 4, 'right')} | ${pad(s.rating, 8)} | ${pad(s.throughput + '%', 6, 'right')} | ${pad(s.reliability + '%', 6, 'right')} | ${pad(s.quality + '%', 6, 'right')} | ${pad(s.initiative + '%', 6, 'right')} | ${pad(s.cycle + '%', 6, 'right')} |`);
  }
  L.push('');
  L.push('## DETAILED METRICS');
  L.push('');
  L.push('| Role       | Tasks | Done | Runs | Completed | Crashes | Avg Cycle | Blocked |');
  L.push('|------------|------:|-----:|-----:|----------:|--------:|----------:|--------:|');
  for (const s of scores) {
    const cyc = s.avgCycle ? s.avgCycle.toFixed(1) + 'm' : '—';
    L.push(`| ${pad(s.role.toUpperCase(), 10)} | ${pad(s.total || 0, 5, 'right')} | ${pad(s.done || 0, 4, 'right')} | ${pad(s.totalRuns || 0, 4, 'right')} | ${pad(s.completed || 0, 8, 'right')} | ${pad(s.crashes || 0, 6, 'right')} | ${pad(cyc, 9, 'right')} | ${pad(s.blocked || 0, 6, 'right')} |`);
  }
  L.push('');

  // Red flags
  L.push('## RED FLAGS');
  L.push('');
  const flags = scores.filter(s => s.reliability < 70 || s.throughput < 50 || s.composite < 65);
  if (flags.length === 0) {
    L.push('✓ No critical issues.');
  } else {
    for (const f of flags) {
      if (f.reliability < 70) L.push(`⚠ **${f.role.toUpperCase()}** — Reliability ${f.reliability}% (${f.crashes} crashes on ${f.totalRuns} runs)`);
      if (f.throughput < 50) L.push(`⚠ **${f.role.toUpperCase()}** — Throughput ${f.throughput}% (${f.done}/${f.total} tasks done)`);
      if (f.composite < 65) L.push(`⚠ **${f.role.toUpperCase()}** — Composite ${f.composite} below Middle threshold (65)`);
    }
  }
  L.push('');

  // Highlights
  L.push('## HIGHLIGHTS');
  L.push('');
  const top = scores.filter(s => s.composite >= 75);
  if (top.length === 0) { L.push('— No standout performers yet.'); }
  else {
    for (const t of top) {
      const reasons = [];
      if (t.reliability >= 85) reasons.push(`reliability ${t.reliability}%`);
      if (t.throughput >= 90) reasons.push(`throughput ${t.throughput}%`);
      if (t.quality >= 85) reasons.push(`quality ${t.quality}%`);
      L.push(`✓ **${t.role.toUpperCase()}** — ${reasons.join(', ') || 'solid overall'}`);
    }
  }
  L.push('');

  // Recommendations
  L.push('## RECOMMENDATIONS');
  L.push('');
  const recs = [];
  for (const s of scores) {
    if (s.reliability < 70 && s.crashes > 0) recs.push(`→ **${s.role.toUpperCase()}**: debug crash root cause (${s.crashes} crashes on ${s.totalRuns} runs — check protocol violations: "exited without kanban_complete")`);
    if (s.throughput < 60 && s.total > 2) recs.push(`→ **${s.role.toUpperCase()}**: ${s.total - s.done} tasks incomplete — check for blockers`);
    if (s.initiative < 40) recs.push(`→ **${s.role.toUpperCase()}**: low initiative — add post-mortems and technical comments`);
    if (s.avgCycle > (CYCLE_BENCHMARK[s.role] || 20) * 3) recs.push(`→ **${s.role.toUpperCase()}**: cycle time ${Math.round(s.avgCycle)}m exceeds 3× benchmark`);
  }
  if (recs.length === 0) L.push('— No action needed. Team performing within benchmarks.');
  else recs.forEach(r => L.push(r));
  L.push('');
  L.push('---');
  L.push('');
  L.push('_Auto-generated by `scripts/perf-report.js`. Framework: `docs/performance-framework.md`._');

  return L.join('\n');
}

// ─── Main ───
const metrics = getMetrics();
const scores = computeScores(metrics);
const report = renderReport(scores);
console.log(report);
