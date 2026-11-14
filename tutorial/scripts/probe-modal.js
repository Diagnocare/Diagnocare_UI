'use strict';
// Diagnostic only: opens the Master Test List Add dialog and dumps its first two steps.
const { chromium } = require('playwright');
const { mintDemoToken } = require('../recorder/auth.js');
const APP = process.env.APP_URL || 'http://127.0.0.1:4299';
const MOCK = process.env.MOCK_API_URL || 'http://127.0.0.1:5099/';

const dump = async (page, label) => {
  console.log(`\n===== ${label} =====`);
  const info = await page.evaluate(() => {
    const scope = document.querySelector('app-add-edit-modal') || document.body;
    return {
      inputs: [...scope.querySelectorAll('input,select,textarea')].map(i =>
        `<${i.tagName.toLowerCase()} ngmodel="${i.getAttribute('ng-reflect-name') || i.getAttribute('name') || ''}" ph="${i.placeholder || ''}" id="${i.id || ''}" type="${i.type || ''}" readonly=${i.readOnly} val="${(i.value || '').slice(0, 24)}">`),
      buttons: [...scope.querySelectorAll('button')].map(b =>
        `<button class="${b.className}" ${b.disabled ? 'DISABLED' : ''}>${(b.innerText || '').trim().slice(0, 40)}`),
      text: scope.innerText.slice(0, 900),
    };
  });
  console.log('INPUTS:'); info.inputs.forEach(x => console.log('  ' + x));
  console.log('BUTTONS:'); info.buttons.forEach(x => console.log('  ' + x));
  console.log('TEXT:', JSON.stringify(info.text));
};

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.addInitScript(u => { window.RUNTIME_CONFIG = { diagnocareApiURL: u }; }, MOCK);
  await ctx.addInitScript(t => { sessionStorage.setItem('authToken', t); }, mintDemoToken());
  const page = await ctx.newPage();

  await page.goto(`${APP}/manage-tests`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);
  await page.locator('.action-bar').getByRole('button', { name: /Add$/ }).first().click();
  await page.waitForTimeout(1500);
  await dump(page, 'Add dialog — step 0 (type chooser)');

  // The type chooser is three radio cards labelled "New Group" / "New SubGroup" / "New Test".
  await page.locator('app-add-edit-modal').getByText('New Group', { exact: true }).click();
  await page.waitForTimeout(800);
  await dump(page, 'after choosing New Group');

  await page.locator('app-add-edit-modal').getByRole('button', { name: 'Next' }).click();
  await page.waitForTimeout(1600);
  await dump(page, 'Group — step 1 (the form)');

  // Fill it the way the recording will, then look at the footer.
  const modal = page.locator('app-add-edit-modal');
  const name = modal.locator('input[type="text"]:not([readonly])').first();
  await name.fill('Microbiology');
  const price = modal.locator('input[type="number"]').first();
  await price.fill('500');
  await page.waitForTimeout(600);
  await dump(page, 'Group — step 1 filled');

  await browser.close();
})();
