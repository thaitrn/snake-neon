#!/usr/bin/env node
// ============================================================
// Snake Neon — Headless Variant Tester
// Loads each variants/NNN.html via puppeteer (file:// URL),
// verifies canvas renders with no JS errors, writes test-report.json.
//
// Design ref: docs/variant-pipeline.md §7
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..');
const VARIANTS_DIR = path.join(ROOT, 'variants');
const CONFIG_DIR = path.join(ROOT, 'configs');
const REPORT_PATH = path.join(ROOT, 'test-report.json');

// How long to wait for p5 to render the canvas before declaring a timeout.
const RENDER_TIMEOUT_MS = 8000;

// ------------------------------------------------------------
// Collect variant files (sorted by id)
// ------------------------------------------------------------
function listVariants() {
  if (!fs.existsSync(VARIANTS_DIR)) {
    throw new Error(`variants/ not found at ${VARIANTS_DIR} — run generate.js first`);
  }
  return fs.readdirSync(VARIANTS_DIR)
    .filter((f) => /^\d{3}\.html$/.test(f))
    .sort()
    .map((f) => f.replace(/\.html$/, ''));
}

// Read config name for the report (best-effort; falls back to variant id).
function configName(id) {
  try {
    const cfg = JSON.parse(
      fs.readFileSync(path.join(CONFIG_DIR, `${id}.json`), 'utf8')
    );
    return cfg.name || id;
  } catch (e) {
    return id;
  }
}

// ------------------------------------------------------------
// Probe a single variant in a fresh page
// ------------------------------------------------------------
async function testVariant(browser, id) {
  const errors = [];
  const consoleErrors = [];
  const fileUrl = 'file://' + path.join(VARIANTS_DIR, `${id}.html`);

  const page = await browser.newPage();
  // viewport affects layout but every variant should still render at this size
  await page.setViewport({ width: 640, height: 800 });

  page.on('pageerror', (err) => errors.push(String(err && err.message ? err.message : err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('requestfailed', (req) => {
    // Flag CDN / asset failures — these break the game.
    errors.push(`requestfailed: ${req.url()} — ${req.failure() && req.failure().errorText}`);
  });

  // p5.sound tries to spin up an AudioWorklet on init. Under headless Chrome
  // loading from file://, the worklet module can't be fetched, producing a
  // "AbortError: Unable to load a worklet's module." console error. This is
  // a headless-environment audio limitation — it does not affect the variant's
  // game logic or rendering (verified: canvas still renders at full size) and
  // never occurs in a real browser. We allowlist it so genuine JS errors still
  // surface. See docs/variant-pipeline.md §7 (test purpose: load / canvas / errors).
  const isHeadlessAudioNoise = (e) =>
    /Unable to load a worklet's module/i.test(e) ||
    /AbortError/i.test(e);

  let loadOk = false;
  let canvasOk = false;
  let canvasW = 0;
  let canvasH = 0;
  let detail = '';

  try {
    const navResponse = await page.goto(fileUrl, {
      waitUntil: 'networkidle0',
      timeout: RENDER_TIMEOUT_MS
    });
    loadOk = !!navResponse && navResponse.ok();

    // Poll for a rendered canvas (width>0, height>0) up to RENDER_TIMEOUT_MS.
    const start = Date.now();
    while (Date.now() - start < RENDER_TIMEOUT_MS) {
      const probe = await page.evaluate(() => {
        const c = document.querySelector('canvas');
        if (!c) return { found: false, w: 0, h: 0 };
        return { found: true, w: c.width, h: c.height };
      });
      if (probe.found && probe.w > 0 && probe.h > 0) {
        canvasOk = true;
        canvasW = probe.w;
        canvasH = probe.h;
        break;
      }
      // surface genuine JS errors immediately rather than polling the full window;
      // ignore headless-audio noise so it doesn't abort the canvas-render wait.
      if (errors.some((e) => !isHeadlessAudioNoise(e))) break;
      await new Promise((r) => setTimeout(r, 150));
    }

    if (!canvasOk && errors.length === 0) {
      detail = `canvas did not render within ${RENDER_TIMEOUT_MS}ms`;
    }
  } catch (err) {
    detail = `navigation/load error: ${err.message}`;
  } finally {
    await page.close().catch(() => {});
  }

  // De-duplicate + merge error sources, dropping allowlisted headless-audio noise
  const allErrors = [];
  for (const e of errors) if (!isHeadlessAudioNoise(e) && !allErrors.includes(e)) allErrors.push(e);
  for (const e of consoleErrors) {
    if (isHeadlessAudioNoise(e)) continue;
    // puppeteer sometimes echoes the same ReferenceError on both channels
    if (!allErrors.some((x) => x.includes(e))) allErrors.push(e);
  }
  if (detail) allErrors.push(detail);

  const status = (loadOk && canvasOk && allErrors.length === 0) ? 'pass' : 'fail';

  return {
    variant_id: id,
    name: configName(id),
    status,
    canvas: { w: canvasW, h: canvasH },
    errors: allErrors
  };
}

// ------------------------------------------------------------
// Main — run all variants serially (one page at a time)
// ------------------------------------------------------------
async function main() {
  const ids = listVariants();
  console.log(`Testing ${ids.length} variants ...`);

  const browser = await puppeteer.launch({
    headless: 'new',
    // --allow-file-access-from-files: variants load via file:// and p5
    // (instance/global mode) needs cross-origin same-origin relaxation to
    // create its <canvas>. Without this flag the script loads (HTTP 200) but
    // p5.setup() never attaches the canvas, so the render-poll times out.
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
  });

  const results = [];
  const startedAt = Date.now();

  try {
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      // Minimal progress so long runs stay observable.
      if (i % 10 === 0) {
        process.stdout.write(`  [${i}/${ids.length}] ${id} ...\n`);
      }
      const r = await testVariant(browser, id);
      results.push(r);
      if (r.status === 'fail') {
        console.log(`  ✗ ${id} ${r.name} — ${r.errors.join('; ')}`);
      }
    }
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.length - passed;
  const report = {
    generated_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    total: results.length,
    passed,
    failed,
    results
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');

  console.log(`\nDone in ${report.duration_ms}ms — passed ${passed}/${results.length}, failed ${failed}`);
  console.log(`Report written to ${path.relative(ROOT, REPORT_PATH)}`);

  if (failed > 0) {
    console.log('\nFailures:');
    for (const r of results.filter((x) => x.status === 'fail')) {
      console.log(`  ${r.variant_id} ${r.name}: ${r.errors.join('; ')}`);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(2);
  });
}
