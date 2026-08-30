#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const failures = [];

function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const indexPath = join(root, 'index.html');
assert(existsSync(indexPath), 'index.html missing');
const html = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : '';
assert(html.includes('<title>Snake Neon</title>'), 'title Snake Neon missing');
assert(html.includes('new p5()'), 'p5 bootstrap missing');
assert(!/src=["']vendor\//.test(html), 'index.html must not reference local vendor/ at runtime');
assert(!/href=["']style\.css["']/.test(html), 'index.html must not depend on style.css at runtime');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
assert(pkg.engines?.node === '22.x', 'engines.node must be 22.x');
assert(pkg.scripts?.build === 'node scripts/build.mjs', 'build script mismatch');
assert(pkg.scripts?.test === 'node scripts/ci-test.mjs', 'test script mismatch');

const build = spawnSync(process.execPath, [join(root, 'scripts/build.mjs')], {
  cwd: root,
  encoding: 'utf8',
});
assert(build.status === 0, `build failed: ${build.stderr || build.stdout}`);

const dist = join(root, 'dist');
assert(existsSync(join(dist, 'index.html')), 'dist/index.html missing after build');

function walkNames(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkNames(p, acc);
    else acc.push(name);
  }
  return acc;
}
const distFiles = walkNames(dist);
assert(
  distFiles.every((n) => n === 'index.html'),
  `dist allowlist violation: ${distFiles.join(', ')}`,
);
assert(!distFiles.includes('package.json'), 'dist must not contain package.json');

if (failures.length) {
  console.error('ci-test FAIL:');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}
console.log('ci-test PASS: allowlist runtime + engines + dist');
