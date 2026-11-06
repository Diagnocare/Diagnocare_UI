'use strict';

/**
 * LAB TECHNICIAN — one shift at the bench.
 *
 *   Login → open the work queue → find the urgent sample → collect it
 *         → enter results → submit (it reaches the doctor's queue)
 *
 * Two samples are waiting, one urgent and booked LATER than the routine one, so the test only
 * passes if urgency — not booking order — decides what the technician sees first.
 */

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { Workbench } = require('../support/harness.js');
const { seedBooking } = require('../support/seed.js');

let wb;
before(async () => { wb = await new Workbench().start(); });
after(async () => { await wb?.stop(); });

const tab = (page, label) => page.getByRole('tab', { name: new RegExp(label, 'i') });
const tabCount = async (page, label) =>
  Number((await tab(page, label).locator('.dc-queue__count').innerText()).trim());

/** Opens the patient's visit from the worklist row and the test's result sheet. */
async function openResultSheet(page, testName) {
  await page.locator('.ptl-actions').getByRole('button', { name: /Enter results|Finish results/ }).first().click();
  const row = page.locator('.ptl-table tbody tr', { hasText: testName });
  await row.getByRole('button', { name: /Enter results|Finish results/ }).click();
  await page.getByRole('heading', { name: 'Enter results' }).waitFor();
}

/** Saving returns the technician to the visit screen; closing it gets back to the page behind. */
async function saveAndLeaveVisit(page) {
  await page.getByRole('button', { name: 'Save results' }).click();
  await page.getByRole('heading', { name: 'Enter results' }).waitFor({ state: 'detached' });
  await page.locator('.detail-container .overlay-close-btn').click();
  await page.locator('.detail-container').waitFor({ state: 'detached' });
}

describe('Lab technician workflow', () => {
  test('finds the urgent sample first, collects it, enters results and submits for verification', async () => {
    const routine = await seedBooking(wb, { name: 'Ramesh Routine', tests: ['T0005'] });
    const urgent  = await seedBooking(wb, { name: 'Uma Urgent', tests: ['T0001'], urgent: true });

    const { context, page } = await wb.newOperator();
    try {
      // ── Login, open the work queue ───────────────────────────────────────────
      await wb.login(page, 'tech.1');
      await page.getByRole('link', { name: 'Work queue' }).first().click();
      await page.locator('.dc-queues').waitFor();

      // ── Find the urgent sample ───────────────────────────────────────────────
      await tab(page, 'To collect').click();
      await page.locator('tr.worklist__row').nth(1).waitFor();
      assert.equal(await tabCount(page, 'To collect'), 2, 'both samples are waiting to be collected');

      const first = page.locator('tr.worklist__row').first();
      assert.match(await first.innerText(), /Uma Urgent/, 'the urgent patient is at the top, though booked last');
      await first.locator('.urgent-flag').waitFor();

      // ── Collect it ───────────────────────────────────────────────────────────
      await first.getByRole('button', { name: 'Mark sample collected' }).click();
      const dialog = page.getByRole('dialog');
      assert.match(await dialog.innerText(), /Uma Urgent/, 'the dialog restates whose sample this is');
      assert.equal(await dialog.getByRole('button', { name: 'Save' }).isDisabled(), true,
        'Save stays off until a collection place is chosen');
      await dialog.locator('#mc-location').selectOption('StarLab');
      await dialog.getByRole('button', { name: 'Save' }).click();
      await dialog.waitFor({ state: 'detached' });

      await page.locator('tr.worklist__row', { hasText: 'Uma Urgent' }).waitFor({ state: 'detached' });
      assert.equal(await tabCount(page, 'To collect'), 1, 'the collected sample leaves the queue');
      assert.equal(await tabCount(page, 'Awaiting results'), 1, 'and shows up as work to do at the bench');
      assert.equal(wb.state.bookings.find(b => b.testRegId === urgent.testRegId).samplingDoneAt, 'StarLab');

      // ── Enter results ────────────────────────────────────────────────────────
      await tab(page, 'Awaiting results').click();
      const work = page.locator('tr.worklist__row', { hasText: 'Uma Urgent' });
      await work.waitFor();
      await work.getByRole('button', { name: 'Enter results' }).click();

      await page.waitForURL(/\/patient-tests\?/);
      await openResultSheet(page, 'Haemoglobin');
      await page.getByLabel('Haemoglobin result').fill('14.2');
      assert.equal(await page.getByRole('button', { name: /View Report/ }).isDisabled(), true,
        'a report cannot be opened before every result is saved');

      // ── Submit ───────────────────────────────────────────────────────────────
      await saveAndLeaveVisit(page);
      const saved = wb.state.results.get(`${urgent.testRegId}:T0001`);
      assert.equal(saved.get(1).value, '14.2', 'the value the technician typed is what was stored');

      // The doctor's queue now holds it; the bench's does not.
      await page.getByRole('link', { name: 'Work queue' }).first().click();
      await page.locator('.dc-queues').waitFor();
      await page.waitForFunction(() =>
        [...document.querySelectorAll('.dc-queue')].some(t => /To verify/i.test(t.textContent) &&
          t.querySelector('.dc-queue__count')?.textContent.trim() === '1'));
      assert.equal(await tabCount(page, 'Awaiting results'), 0);
      assert.equal(wb.state.requests.some(r => r.path.endsWith('/Worklist/Verify')), false,
        'a technician submitting results does not sign them off');
    } finally {
      await context.close();
    }
    assert.ok(routine.testRegId, 'the routine sample was untouched');
    assert.deepEqual(wb.pageErrors, [], 'no uncaught errors in the app during the workflow');
  });

  test('a half-entered test stays with the bench as "Partly entered" until the rest is saved', async () => {
    const b = await seedBooking(wb, { name: 'Pooja Partial', tests: ['T0005'], samplingDoneAt: 'StarLab' });
    const { context, page } = await wb.newOperator();
    try {
      await wb.login(page, 'tech.1');
      await page.goto(`${require('../support/harness.js').APP_URL}/patient-tests?patientId=${b.patientId}`);
      await openResultSheet(page, 'Serum Bilirubin');

      await page.getByLabel('Bilirubin Total result').fill('0.8');
      await saveAndLeaveVisit(page);

      await page.getByRole('link', { name: 'Work queue' }).first().click();
      await tab(page, 'Partly entered').click();
      const row = page.locator('tr.worklist__row', { hasText: 'Pooja Partial' });
      await row.waitFor();
      assert.match(await row.innerText(), /1 of 2 entered/, 'the row says how far along it is');

      await row.getByRole('button', { name: 'Finish results' }).click();
      await page.waitForURL(/\/patient-tests\?/);
      await openResultSheet(page, 'Serum Bilirubin');
      assert.equal(await page.getByLabel('Bilirubin Total result').inputValue(), '0.8',
        'what was already saved is still there when the technician comes back');
      await page.getByLabel('Bilirubin Direct result').fill('0.2');
      await saveAndLeaveVisit(page);

      assert.equal(wb.state.results.get(`${b.testRegId}:T0005`).size, 2);
    } finally {
      await context.close();
    }
  });
});
