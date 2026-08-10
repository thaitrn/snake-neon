#!/usr/bin/env node
'use strict';
const puppeteer = require('puppeteer');
const URL = 'http://localhost:9876/index.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });
  // Landscape touch device
  await page.setViewport({ width: 844, height: 390, hasTouch: true, isMobile: true });
  await page.goto(URL, { waitUntil: 'networkidle0' });

  const orient = await page.evaluate(() => currentOrientation);
  console.log('orient:', orient);

  // Try start via page.click
  await page.click('#startBtn');
  await sleep(200);
  const s1 = await page.evaluate(() => ({ state: currentState, dir: snake.direction }));
  console.log('after page.click startBtn:', JSON.stringify(s1));

  // Try start via touch tap
  const box = await page.evaluate(() => {
    const b = document.getElementById('startBtn').getBoundingClientRect();
    return { x: b.x + b.width/2, y: b.y + b.height/2 };
  });
  await page.touchscreen.touchStart(box.x, box.y);
  await sleep(40);
  await page.touchscreen.touchEnd();
  await sleep(200);
  const s2 = await page.evaluate(() => ({ state: currentState, dir: snake.direction }));
  console.log('after touch startBtn:', JSON.stringify(s2));

  // dpad up via page.click
  await page.click('.dpad-up');
  await sleep(100);
  const s3 = await page.evaluate(() => ({ nextDir: snake.nextDirection, dir: snake.direction }));
  console.log('after page.click dpad-up:', JSON.stringify(s3));

  // dpad up via touch
  const ub = await page.evaluate(() => {
    const b = document.querySelector('.dpad-up').getBoundingClientRect();
    return { x: b.x + b.width/2, y: b.y + b.height/2 };
  });
  await page.touchscreen.touchStart(ub.x, ub.y);
  await sleep(40);
  await page.touchscreen.touchEnd();
  await sleep(100);
  const s4 = await page.evaluate(() => ({ nextDir: snake.nextDirection, dir: snake.direction }));
  console.log('after touch dpad-up:', JSON.stringify(s4));

  await browser.close();
})();
