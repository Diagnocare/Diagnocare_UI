'use strict';
// Diagnostic only: dumps what is actually on a page so selectors can be written against it.
const { chromium } = require('playwright');
const { mintDemoToken } = require('../recorder/auth.js');
const APP = process.env.APP_URL || 'http://127.0.0.1:4299';
const MOCK = process.env.MOCK_API_URL || 'http://127.0.0.1:5099/';

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.addInitScript(u => { window.RUNTIME_CONFIG = { diagnocareApiURL: u }; }, MOCK);
  await ctx.addInitScript(t => {
    sessionStorage.setItem('authToken', t);
    sessionStorage.removeItem('sessionTerminated');
  }, mintDemoToken());
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => m.type() === 'error' && errs.push(m.text()));
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));

  for (const route of (process.env.ROUTES || 'login,patients').split(',')) {
    await page.goto(`${APP}/${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    console.log(`\n========== /${route}  (url now: ${page.url()}) ==========`);
    const info = await page.evaluate(() => ({
      buttons: [...document.querySelectorAll('button')].slice(0, 25)
        .map(b => `<button class="${b.className}" ${b.disabled ? 'DISABLED' : ''}>${(b.innerText || '').trim().slice(0, 50)}`),
      inputs: [...document.querySelectorAll('input,select')].slice(0, 25)
        .map(i => `<${i.tagName.toLowerCase()} fcn="${i.getAttribute('formcontrolname') || ''}" name="${i.name || ''}" ph="${i.placeholder || ''}" id="${i.id || ''}" type="${i.type || ''}">`),
      tables: [...document.querySelectorAll('table')].map(t => `table.${t.className} rows=${t.rows.length}`),
      h: [...document.querySelectorAll('h1,h2,h3')].map(x => `${x.tagName}: ${x.innerText.trim().slice(0, 60)}`),
      bodyStart: document.body.innerText.slice(0, 700),
    }));
    console.log('HEADINGS:', info.h);
    console.log('TABLES:', info.tables);
    console.log('INPUTS:'); info.inputs.forEach(x => console.log('  ' + x));
    console.log('BUTTONS:'); info.buttons.forEach(x => console.log('  ' + x));
    console.log('TEXT:', JSON.stringify(info.bodyStart));
  }
  if (errs.length) { console.log('\nCONSOLE ERRORS:'); [...new Set(errs)].slice(0, 15).forEach(e => console.log('  • ' + e)); }
  await browser.close();
})();
