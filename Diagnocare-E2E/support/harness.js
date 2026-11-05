'use strict';

/**
 * Shared setup for the operator-workflow specs.
 *
 * One Workbench = one in-process mock API + one headless Chromium. Each spec file builds its
 * own, so the three roles never share state by accident; specs that DO build on one another
 * (the doctor verifies what the technician entered) say so explicitly by seeding through the
 * UI, never by reaching into the mock.
 *
 * The app under test is whatever dev server answers on APP_URL (default http://localhost:4200).
 * It is pointed at the mock through window.RUNTIME_CONFIG — the same hook a real deployment
 * uses — so no source file is touched and no build flag is needed.
 */

const http = require('node:http');
const { chromium } = require('playwright');
const { createLabApi } = require('../lab-api/server.js');

const APP_URL = (process.env.APP_URL || 'http://localhost:4200').replace(/\/$/, '');
const HEADED = process.env.HEADED === '1';
const SLOW_MO = Number(process.env.SLOW_MO || 0);

function probe(url) {
  return new Promise(resolve => {
    const req = http.get(url, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', () => resolve(null));
    req.setTimeout(20000, () => { req.destroy(); resolve(null); });
  });
}

class Workbench {
  async start() {
    const status = await probe(APP_URL);
    if (typeof status !== 'number' || status >= 500) {
      throw new Error(
        `Nothing is serving the app at ${APP_URL}. Start it first (cd Diagnocare-UI && npx ng serve) ` +
        `or point APP_URL at a running instance.`);
    }
    this.api = createLabApi();
    const port = await this.api.listen(0);
    this.apiUrl = `http://127.0.0.1:${port}/`;
    this.browser = await chromium.launch({ headless: !HEADED, slowMo: SLOW_MO, args: ['--no-sandbox'] });
    this.state = this.api.state;
    this.pageErrors = [];
    return this;
  }

  /** A fresh browser context (own storage, so own session) already pointed at the mock API. */
  async newOperator() {
    const context = await this.browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(apiUrl => {
      window.RUNTIME_CONFIG = window.RUNTIME_CONFIG || {};
      window.RUNTIME_CONFIG.diagnocareApiURL = apiUrl;
      // Opening the print dialog from a label or report would block a headless run forever.
      window.print = () => {};
    }, this.apiUrl);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    // An uncaught exception in the app is a workflow failure even if the screen still looks right.
    page.on('pageerror', err => this.pageErrors.push(err.message));
    page.on('popup', p => p.close().catch(() => {}));
    return { context, page };
  }

  /**
   * Signs in through the real login screen: user name, password, then the one-time code.
   * This is step one of every workflow, so it is exercised rather than short-circuited.
   */
  async login(page, userId) {
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[formControlName="userId"]').fill(userId);
    await page.locator('input[formControlName="password"]').fill('Demo@12345');
    await page.getByRole('button', { name: 'Generate OTP' }).first().click();

    const boxes = page.locator('input.otp-box');
    await boxes.first().waitFor({ state: 'visible' });
    const code = '482913';
    for (let i = 0; i < code.length; i++) {
      await boxes.nth(i).click();
      await boxes.nth(i).type(code[i], { delay: 30 });
    }
    // The dialog submits itself on the sixth digit; press Verify only if it is still waiting.
    const verify = page.getByRole('button', { name: 'Verify Code' });
    if (await verify.count() && await verify.first().isVisible().catch(() => false)) {
      await verify.first().click().catch(() => {});
    }
    await page.waitForURL(url => !/\/login/.test(new URL(url).pathname), { timeout: 30000 });
    await page.locator('.dc-nav, .sh-sidebar, .sh-topbar').first().waitFor({ state: 'visible' });
  }

  async stop() {
    await this.browser?.close();
    await this.api?.close();
  }
}

module.exports = { Workbench, APP_URL };
