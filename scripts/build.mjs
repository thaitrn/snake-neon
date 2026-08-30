#!/usr/bin/env node
/**
 * Deterministic static build: copy runtime allowlist only into dist/.
 * Do not publish QA scripts, reports, or node_modules.
 */
import { cpSync, mkdirSync, rmSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const dist = join(root, 'dist');

const ALLOWLIST = ['index.html'];

const FORBIDDEN = new Set([
  'node_modules',
  'scripts',
  'qa',
  'docs',
  'office-tui',
  'screenshots',
  'variants',
  'configs',
  'vendor',
  '.git',
  '.github',
  '.vercel',
]);

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (FORBIDDEN.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else acc.push(relative(dist, p));
  }
  return acc;
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const file of ALLOWLIST) {
  const src = join(root, file);
  if (!existsSync(src)) {
    console.error(`build: missing allowlist file ${file}`);
    process.exit(1);
  }
  cpSync(src, join(dist, file));
}

const published = walk(dist).sort();
const unexpected = published.filter((f) => !ALLOWLIST.includes(f));
if (unexpected.length) {
  console.error('build: unexpected files in dist:', unexpected.join(', '));
  process.exit(1);
}

console.log('build: wrote dist/', published.join(', '));
