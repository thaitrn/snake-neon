const puppeteer = require('puppeteer');
const path = require('path');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await sleep(3000);

  const probe = await page.evaluate(() => {
    return {
      hasSetup: typeof window.setup === 'function',
      hasDraw: typeof window.draw === 'function',
      hasKeyPressed: typeof window.keyPressed === 'function',
      p5InstCount: typeof p5 !== 'undefined' ? (p5.instance ? 1 : 0) : -1,
      canvasExists: !!document.querySelector('canvas'),
      // try calling setup manually
      manualSetupWorks: (() => {
        try { if (typeof window.setup === 'function') return 'setup-is-function'; return 'no-setup'; }
        catch(e){ return 'ERR:'+e.message; }
      })(),
    };
  });
  console.log('PROBE2:', JSON.stringify(probe, null, 2));
  console.log('ERRORS:', errors);
  await browser.close();
})();
