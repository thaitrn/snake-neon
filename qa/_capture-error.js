// Temp diagnostic: capture the JS error when grid forced to 41x41
const puppeteer = require('puppeteer');
const path = require('path');
const HTML_PATH = 'file://' + path.resolve(__dirname, '..', 'index.html');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--autoplay-policy=no-user-gesture-required','--allow-file-access-from-files'],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  const isHeadlessAudioNoise = (e) => /Unable to load a worklet's module/i.test(e) || /AbortError/i.test(e);
  const errs = [];
  page.on('pageerror', (e) => { const m = String(e && e.message ? e.message : e); if (!isHeadlessAudioNoise(m)) errs.push('PAGEERROR: ' + m); });
  page.on('console', (msg) => { if (msg.type() === 'error') { const t = msg.text(); if (!isHeadlessAudioNoise(t)) errs.push('CONSOLE: ' + t); } });
  await page.goto(HTML_PATH, { waitUntil: 'networkidle0' });
  for (let i = 0; i < 30; i++) { await sleep(200); const r = await page.evaluate(() => typeof COLS !== 'undefined' && COLS > 0); if (r) break; }
  // Force to 41x41 like the test does (50x expandGrid)
  await page.evaluate(() => { for (let i = 0; i < 50; i++) expandGrid(); resizeCanvasToFit(); });
  await sleep(800);
  console.log('Errors captured after 41x41:', errs.length);
  errs.forEach((e, i) => console.log(`ERR[${i}]:`, e));
  await browser.close();
  process.exit(0);
})();
