'use strict';

/**
 * Records the tutorial.
 *
 * Produces, in out/:
 *   raw-<n>.webm    one Playwright video per run
 *   timeline.json   every narration line with the millisecond interval it occupied,
 *                   which is what post/ turns into subtitles and chapters
 *
 * Nothing under Diagnocare-UI/ is touched. The app is configured for recording through
 * the two seams it already has — window.RUNTIME_CONFIG and sessionStorage.authToken —
 * from inside the browser context, via addInitScript.
 */

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const { installTutorialOverlay, overlayOptions } = require('./overlay.js');
const { Driver } = require('./driver.js');
const { mintDemoToken } = require('./auth.js');
const { sections, APP } = require('./steps.js');

const OUT = path.join(__dirname, '..', 'out');
const MOCK_API = process.env.MOCK_API_URL || 'http://127.0.0.1:5099/';
const WIDTH = 1920, HEIGHT = 1080;

/** Record only some chapters: ONLY=login,patients */
const only = (process.env.ONLY || '').split(',').map(s => s.trim()).filter(Boolean);

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({
    args: [
      '--no-sandbox',
      `--window-size=${WIDTH},${HEIGHT}`,
      '--force-device-scale-factor=1',
      '--hide-scrollbars',
      '--disable-gpu',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: { width: WIDTH, height: HEIGHT } },
    // A tutorial is watched, not interacted with; this keeps CSS animations honest.
    reducedMotion: 'no-preference',
  });

  // Point the app at the mock API before Angular bootstraps. This is the same
  // runtime-config hook a real deployment uses — see getDiagnocareApiUrl().
  await context.addInitScript(apiUrl => {
    window.RUNTIME_CONFIG = window.RUNTIME_CONFIG || {};
    window.RUNTIME_CONFIG.diagnocareApiURL = apiUrl;
  }, MOCK_API);

  // The Devanagari face travels with the script so Hindi captions render identically
  // regardless of what fonts the host happens to have.
  await context.addInitScript(installTutorialOverlay, overlayOptions());

  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(`pageerror: ${err.message}`));

  const timeline = { t0: Date.now(), lines: [], sections: [] };
  const driver = new Driver(page, timeline, { speed: Number(process.env.SPEED || 1) });

  const run = only.length ? sections.filter(s => only.includes(s.id)) : sections;
  const failures = [];

  for (const section of run) {
    const startedAt = Date.now() - timeline.t0;
    driver.startSection(section.id, section.title);
    process.stdout.write(`\n▶ ${section.id} — ${section.title}\n`);

    try {
      // Chapters after login need a session. The login chapter establishes a real one;
      // when it is skipped (ONLY=...), seed one so the chapter can still be recorded.
      if (section.id !== 'intro' && section.id !== 'login') {
        await ensureSession(page);
      }
      await section.run(driver, page);
    } catch (err) {
      process.stdout.write(`  ✗ ${section.id}: ${err.message}\n`);
      failures.push({ section: section.id, error: err.message });
      await driver.clearFocus().catch(() => {});
      await driver.clearCaption().catch(() => {});
    }

    await driver.clearCaption().catch(() => {});
    timeline.sections.push({
      id: section.id, title: section.title,
      startMs: startedAt, endMs: Date.now() - timeline.t0,
    });
  }

  await driver.clearCaption().catch(() => {});
  await page.waitForTimeout(900);

  const video = page.video();
  await context.close();           // finalises the video file
  const videoPath = video ? await video.path() : null;
  await browser.close();

  timeline.durationMs = timeline.sections.at(-1)?.endMs ?? 0;
  timeline.video = videoPath ? path.basename(videoPath) : null;
  timeline.consoleErrors = consoleErrors;
  timeline.failures = failures;

  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(timeline, null, 2));

  const mins = (timeline.durationMs / 60000).toFixed(1);
  process.stdout.write(`\n── recorded ──\nvideo:    ${timeline.video}\nduration: ${mins} min\nlines:    ${timeline.lines.length}\n`);
  if (failures.length) {
    process.stdout.write(`failed:   ${failures.map(f => f.section).join(', ')}\n`);
  }
  if (consoleErrors.length) {
    process.stdout.write(`console errors (${consoleErrors.length}):\n`);
    for (const e of [...new Set(consoleErrors)].slice(0, 12)) process.stdout.write(`  • ${e}\n`);
  }

  // A failed chapter means the video is incomplete — make that a non-zero exit.
  process.exitCode = failures.length ? 1 : 0;
}

/**
 * Makes sure the chapter starts signed in and inside the authenticated shell.
 *
 * In a full run the login chapter has already done both. In a partial run (ONLY=…) it
 * has not, and a chapter that reaches for the nav bar would be looking at the login
 * page — so the token is seeded and the browser is moved onto an in-app route.
 */
async function ensureSession(page) {
  if (!page.url().startsWith('http')) {
    await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded' });
  }

  const hasToken = await page.evaluate(() => !!sessionStorage.getItem('authToken')).catch(() => false);
  if (!hasToken) {
    await page.evaluate(token => {
      sessionStorage.setItem('authToken', token);
      sessionStorage.removeItem('sessionTerminated');
    }, mintDemoToken());
  }

  // The header nav only exists inside LayoutComponent, so a chapter cannot start on
  // /login even with a valid token.
  if (/\/(login|forgot-password|home)?$/.test(new URL(page.url()).pathname)) {
    await page.goto(`${APP}/pathology`, { waitUntil: 'domcontentloaded' });
    await page.locator('.dc-nav').first().waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
  }
}

main().catch(err => {
  process.stderr.write(`${err.stack}\n`);
  process.exit(1);
});
