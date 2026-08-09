#!/usr/bin/env node
// ============================================================
// Snake Neon — 100-Variant Generator
// Reads index.html as template, injects per-variant config,
// writes configs/NNN.json + variants/NNN.html.
//
// Design ref: docs/variant-pipeline.md
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_PATH = path.join(ROOT, 'index.html');
const CONFIG_DIR = path.join(ROOT, 'configs');
const OUT_DIR = path.join(ROOT, 'variants');

// ------------------------------------------------------------
// THEME / GRID / MODE presets (docs/variant-pipeline.md §3)
// ------------------------------------------------------------
const THEMES = [
  { name: 'Neon Green',    snake: '#00ff88', food: '#ff006e', bg: '#0a0a0f', accent: '#ffee00' },
  { name: 'Hot Pink',      snake: '#ff10f0', food: '#00ff88', bg: '#0d0011', accent: '#00d9ff' },
  { name: 'Electric Blue', snake: '#00d9ff', food: '#ff5500', bg: '#050518', accent: '#ff006e' },
  { name: 'Sunset Orange', snake: '#ff6b00', food: '#ffe600', bg: '#1a0a00', accent: '#00ff88' },
  { name: 'Deep Purple',   snake: '#b026ff', food: '#ffeb3b', bg: '#0d0015', accent: '#00e5ff' },
  { name: 'Ice White',     snake: '#e0f7ff', food: '#ff1744', bg: '#000814', accent: '#4fc3f7' },
  { name: 'Blood Red',     snake: '#ff003c', food: '#ffffff', bg: '#0a0000', accent: '#ff8800' },
  { name: 'Toxic Yellow',  snake: '#d4ff00', food: '#ff00ff', bg: '#0f1100', accent: '#00ffaa' },
  { name: 'Matrix Green',  snake: '#00ff41', food: '#008f11', bg: '#000000', accent: '#00ff41' },
  { name: 'Ocean Teal',    snake: '#00e5cc', food: '#ff4081', bg: '#001a1a', accent: '#80deea' }
];

const GRID_SIZES = [13, 15, 17, 19, 21];
const MODES = ['wall', 'wrap'];

// ------------------------------------------------------------
// Color helpers — lighten/darken hex (docs §3.1 derivation rules)
// ------------------------------------------------------------
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const to2 = (v) => clamp(v).toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

// amount 0..1: 0 = unchanged, 1 = pure white
function lighten(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex({ r: r + (255 - r) * amount, g: g + (255 - g) * amount, b: b + (255 - b) * amount });
}

// amount 0..1: 0 = unchanged, 1 = pure black
function darken(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex({ r: r * (1 - amount), g: g * (1 - amount), b: b * (1 - amount) });
}

// ------------------------------------------------------------
// Build the 100-config preset matrix
// Index rule (docs §3.4): (themeIndex*5 + gridIndex)*2 + modeIndex
// ------------------------------------------------------------
function buildConfigs() {
  const configs = [];
  for (let ti = 0; ti < THEMES.length; ti++) {
    for (let gi = 0; gi < GRID_SIZES.length; gi++) {
      for (let mi = 0; mi < MODES.length; mi++) {
        const idx = (ti * GRID_SIZES.length + gi) * MODES.length + mi;
        const id = String(idx + 1).padStart(3, '0');
        const theme = THEMES[ti];
        const grid = GRID_SIZES[gi];
        const mode = MODES[mi];
        const modeLabel = mode === 'wall' ? 'Wall' : 'Wrap';

        configs.push({
          id,
          name: `${theme.name} ${grid}×${grid} ${modeLabel}`,
          description: `${theme.name} snake, ${grid}×${grid} grid, ${mode} mode`,
          theme: {
            bg: theme.bg,
            snake: theme.snake,
            snakeHead: lighten(theme.snake, 0.10),
            food: theme.food,
            grid: darken(theme.bg, 0.10),
            scoreText: theme.accent,
            accent: theme.accent
          },
          grid: { cols: grid, rows: grid },
          speed: { initialTick: 150, minTick: 60, stepReduction: 3 },
          scoring: { basePoints: 10 },
          gameMode: mode,
          startLength: 3
        });
      }
    }
  }
  return configs;
}

// ------------------------------------------------------------
// Template injection
// ------------------------------------------------------------
function injectConfig(html, cfg) {
  // 1. Grid + start length consts (lines 71-73)
  html = html.replace(
    /const COLS = \d+;\nconst ROWS = \d+;\nconst START_LENGTH = \d+;/,
    `const COLS = ${cfg.grid.cols};\nconst ROWS = ${cfg.grid.rows};\nconst START_LENGTH = ${cfg.startLength};`
  );

  // 2. Speed + scoring consts (lines 77-81), then append GAME_MODE
  html = html.replace(
    /const INITIAL_TICK\s*=\s*\d+;\nconst MIN_TICK\s*=\s*\d+;\nconst STEP_REDUCTION\s*=\s*\d+;\n\nconst BASE_POINTS = \d+;/,
    `const INITIAL_TICK   = ${cfg.speed.initialTick};\n` +
    `const MIN_TICK       = ${cfg.speed.minTick};\n` +
    `const STEP_REDUCTION = ${cfg.speed.stepReduction};\n\n` +
    `const BASE_POINTS = ${cfg.scoring.basePoints};\n\n` +
    `const GAME_MODE = ${JSON.stringify(cfg.gameMode)};  // "wall" or "wrap"`
  );

  // 3. PALETTE block (lines 104-113) — replace whole object literal
  const paletteLines = [
    'const PALETTE = {',
    `  bg:        ${JSON.stringify(cfg.theme.bg)},`,
    `  snake:     ${JSON.stringify(cfg.theme.snake)},`,
    `  snakeHead: ${JSON.stringify(cfg.theme.snakeHead)},`,
    `  food:      ${JSON.stringify(cfg.theme.food)},`,
    `  grid:      ${JSON.stringify(cfg.theme.grid)},`,
    `  scoreText: ${JSON.stringify(cfg.theme.scoreText)},`,
    `  accent:    ${JSON.stringify(cfg.theme.accent)},`,
    `  white:     '#ffffff'`,
    '};'
  ].join('\n');
  html = html.replace(
    /const PALETTE = \{[\s\S]*?\};/,
    paletteLines
  );

  // 4. Wrap-mode logic — inject between newHead creation and willEat.
  //    Wrapping here (before willEat) is the correct root-cause fix:
  //    mutating newHead inside checkCollision would leave willEat stale
  //    (snake wraps onto food but doesn't eat + wrongly pops tail).
  //    With this, checkCollision's bounds check naturally never fires in
  //    wrap mode, so no checkCollision patch is needed.
  html = html.replace(
    /(const newHead = \{[\s\S]*?\};\n)(\n  const willEat =)/,
    `$1\n  if (GAME_MODE === "wrap") {\n    newHead.x = (newHead.x + COLS) % COLS;\n    newHead.y = (newHead.y + ROWS) % ROWS;\n  }\n$2`
  );

  // 5. Update <title> for variant identity
  html = html.replace(/<title>Snake Neon<\/title>/, `<title>Snake Neon — ${cfg.name}</title>`);

  // 5b. Drop the `p5.disableFriendlyErrors = true;` inline script that runs
  //     BEFORE p5.min.js loads — it throws a hard "p5 is not defined"
  //     ReferenceError on every load (pre-existing index.html bug). It's only
  //     a perf hint to suppress verbose friendly-error messages, not load-
  //     bearing, and p5 isn't defined at that point in the document order.
  //     p5 loads fine after this line; the game works regardless — but the
  //     thrown error is a genuine JS error that correctly fails headless tests.
  html = html.replace(/<script>p5\.disableFriendlyErrors = true;<\/script>\n/, '');

  // 6. Vendor p5.js locally so variants are self-contained / offline-testable.
  //    Headless file:// pages cannot reliably fetch the CDN (docs caveat 9.3),
  //    and vendoring removes the network dependency entirely. Variants live in
  //    variants/, so vendor scripts are referenced as ../vendor/.
  html = html.replace(
    /https:\/\/cdn\.jsdelivr\.net\/npm\/p5@1\.11\.5\/lib\/addons\/p5\.sound\.min\.js/,
    '../vendor/p5.sound.min.js'
  ).replace(
    /https:\/\/cdn\.jsdelivr\.net\/npm\/p5@1\.11\.5\/lib\/p5\.min\.js/,
    '../vendor/p5.min.js'
  );

  return html;
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------
function main() {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const configs = buildConfigs();
  if (configs.length !== 100) {
    throw new Error(`Expected 100 configs, got ${configs.length}`);
  }

  let generated = 0;
  const failures = [];

  for (const cfg of configs) {
    // write config JSON
    fs.writeFileSync(
      path.join(CONFIG_DIR, `${cfg.id}.json`),
      JSON.stringify(cfg, null, 2) + '\n'
    );

    // inject + write variant HTML
    try {
      let html = template;
      const before = html;
      html = injectConfig(html, cfg);
      if (html === before) {
        throw new Error('injection made no changes');
      }
      fs.writeFileSync(path.join(OUT_DIR, `${cfg.id}.html`), html);
      generated++;
    } catch (err) {
      failures.push({ id: cfg.id, error: err.message });
    }
  }

  console.log(`Generated ${generated}/100 variants into ${path.relative(ROOT, OUT_DIR)}/`);
  console.log(`Wrote ${configs.length} config files into ${path.relative(ROOT, CONFIG_DIR)}/`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} injection failures:`);
    for (const f of failures) console.error(`  ${f.id}: ${f.error}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { buildConfigs, injectConfig, lighten, darken };
