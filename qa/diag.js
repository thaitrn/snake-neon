// Diagnostic: does p5 load and game initialize?
const puppeteer = require('puppeteer');
const path = require('path');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();

  const errors = [];
  const consoleMsgs = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleMsgs.push('[' + msg.type() + '] ' + msg.text());
    }
  });
  page.on('requestfailed', (req) => {
    errors.push('REQFAIL: ' + req.url() + ' — ' + req.failure().errorText);
  });

  const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });
  await sleep(2000);

  const probe = await page.evaluate(() => {
    return {
      p5Defined: typeof p5 !== 'undefined',
      p5Type: typeof p5,
      currentState: typeof currentState !== 'undefined' ? currentState : 'UNDEFINED',
      snakeDefined: typeof snake !== 'undefined',
      snakeReady: typeof snake !== 'undefined' && snake && snake.body && snake.body.length,
      foodDefined: typeof food !== 'undefined',
      canvasExists: !!document.querySelector('canvas'),
      canvasSize: (() => {
        const c = document.querySelector('canvas');
        return c ? `${c.width}x${c.height}` : 'none';
      })(),
      scriptCount: document.querySelectorAll('script').length,
    };
  });

  console.log('PROBE:', JSON.stringify(probe, null, 2));
  console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none');
  console.log('CONSOLE:', consoleMsgs.length ? consoleMsgs.join('\n') : 'none');

  await browser.close();
})();
