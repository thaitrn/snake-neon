// Quick probe: capture all 404/failed resources on a variant page.
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const fails = [];
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (!/data:|blob:/.test(u)) fails.push('REQFAIL ' + u + ' :: ' + r.failure().errorText);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) fails.push('HTTP ' + r.status() + ' ' + r.url());
  });
  await page.goto('http://127.0.0.1:8766/variants/001.html', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise((res) => setTimeout(res, 1500));
  console.log('404/FAIL resources:');
  console.log(fails.length ? fails.join('\n') : '(none)');
  await browser.close();
})();
