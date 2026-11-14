'use strict';

/**
 * DOCTOR — the verification round.
 *
 *   Login → reports waiting to be verified → open a result → review it
 *         → send it back, or verify → the report is issued
 *
 * Each test starts from "the bench has finished": samples collected and every result saved.
 */

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { Workbench, APP_URL } = require('../support/harness.js');
const { seedBooking, seedCollected, seedResults } = require('../support/seed.js');

let wb;
before(async () => { wb = await new Workbench().start(); });
after(async () => { await wb?.stop(); });

const tab = (page, label) => page.getByRole('tab', { name: new RegExp(label, 'i') });
const tabCount = async (page, label) =>
  Number((await tab(page, label).locator('.dc-queue__count').innerText()).trim());

/** A booking whose bench work is finished: collected, results saved, waiting for the doctor. */
async function readyForDoctor(opts, values) {
  const booking = await seedBooking(wb, opts);
  await seedCollected(wb, booking);
  for (const code of opts.tests) await seedResults(wb, booking, code, values[code]);
  return booking;
}

describe('Doctor workflow', () => {
  test('reviews a result, sends one back with a reason, verifies another and issues its report', async () => {
    const low  = await readyForDoctor({ name: 'Lata Low',  tests: ['T0001'] }, { T0001: [9.4] });
    const fine = await readyForDoctor({ name: 'Farid Fine', tests: ['T0001'] }, { T0001: [14.8] });

    const { context, page } = await wb.newOperator();
    try {
      // ── Login → the reports waiting for a signature ───────────────────────────
      await wb.login(page, 'doctor.1');
      await page.getByRole('link', { name: 'Work queue' }).first().click();
      await page.locator('.dc-queues').waitFor();
      await tab(page, 'To verify').click();
      await page.locator('tr.worklist__row').nth(1).waitFor();
      assert.equal(await tabCount(page, 'To verify'), 2);

      // ── Open the abnormal one: the problem is shown first ─────────────────────
      await page.locator('tr.worklist__row', { hasText: 'Lata Low' })
        .getByRole('button', { name: 'Verify & issue' }).click();
      await page.getByRole('heading', { name: 'Verify results' }).waitFor();
      const warning = page.locator('dc-note').first();
      assert.match(await warning.innerText(), /1 value is outside its reference range/);
      assert.match(await warning.innerText(), /Haemoglobin\s+9\.4 g\/dL\s+LOW/, 'says which value, how far, and which way');

      // ── Send it back: a reason is mandatory ───────────────────────────────────
      await page.getByRole('button', { name: 'Send back for re-entry' }).click();
      const sendBack = page.getByRole('button', { name: 'Send back to the bench' });
      assert.equal(await sendBack.isDisabled(), true, 'cannot send back without saying what to redo');
      await page.getByLabel('What needs redoing?').fill('Repeat the haemoglobin - sample looked haemolysed.');
      await sendBack.click();
      await page.waitForURL(/\/work\?queue=to-verify/);

      const body = wb.state.requests.filter(r => r.path.endsWith('/Worklist/ReturnForReentry')).at(-1).body;
      assert.equal(body.testRegId, low.testRegId);
      assert.match(body.reason, /haemolysed/);

      await page.locator('tr.worklist__row', { hasText: 'Lata Low' }).waitFor({ state: 'detached' });
      assert.equal(await tabCount(page, 'To verify'), 1, 'it leaves the doctor\'s queue');
      await tab(page, 'Returned').click();
      const returned = page.locator('tr.worklist__row', { hasText: 'Lata Low' });
      await returned.waitFor();
      assert.match(await returned.innerText(), /haemolysed/, 'the bench sees why it came back');

      // ── Verify the good one, with a note ───────────────────────────────────────
      await tab(page, 'To verify').click();
      await page.locator('tr.worklist__row', { hasText: 'Farid Fine' })
        .getByRole('button', { name: 'Verify & issue' }).click();
      await page.getByRole('heading', { name: 'Verify results' }).waitFor();
      await page.getByText('Everything is within range').waitFor();
      await page.getByLabel('Add a note (optional)').fill('Reviewed against previous CBC.');
      await page.getByRole('button', { name: /Verify & issue report/ }).click();
      await page.waitForURL(/\/work\?queue=to-verify/);

      const verify = wb.state.requests.filter(r => r.path.endsWith('/Worklist/Verify')).at(-1).body;
      assert.deepEqual(
        { testRegId: verify.testRegId, testCode: verify.testCode, comment: verify.comment },
        { testRegId: fine.testRegId, testCode: 'T0001', comment: 'Reviewed against previous CBC.' });

      // ── Issued: it is now the receptionist's to hand over ──────────────────────
      assert.equal(await tabCount(page, 'Ready to print'), 1);
      await tab(page, 'Ready to print').click();
      const issued = page.locator('tr.worklist__row', { hasText: 'Farid Fine' });
      await issued.waitFor();
      await issued.getByRole('button', { name: 'Print' }).waitFor();
      assert.equal(wb.state.verified.get(`${fine.testRegId}:T0001`).by, 'doctor.1',
        'the sign-off is attributed to the doctor who was logged in');
    } finally {
      await context.close();
    }
    assert.deepEqual(wb.pageErrors, [], 'no uncaught errors in the app during the workflow');
  });

  test('refuses to sign off a test whose results are not all in', async () => {
    const b = await seedBooking(wb, { name: 'Pina Partial', tests: ['T0005'], samplingDoneAt: 'StarLab' });
    await seedResults(wb, b, 'T0005', [0.8, '']); // second parameter left blank

    const { context, page } = await wb.newOperator();
    try {
      await wb.login(page, 'doctor.1');
      // A bookmarked or hand-typed link must not be a way around the queue.
      await page.goto(`${APP_URL}/work/verify/${b.testRegId}?testCode=T0005`);
      await page.getByRole('heading', { name: 'Verify results' }).waitFor();
      await page.getByText(/One result has not been entered yet/).waitFor();
      assert.equal(await page.getByRole('button', { name: /Verify & issue report/ }).isDisabled(), true);
    } finally {
      await context.close();
    }
  });

  // KNOWN GAP — written as the behaviour we want, flagged `todo` so it reports without failing
  // the run. The worklist row deliberately shows age/sex ("seeing them here is what catches a
  // wrong-patient entry"), but the screen where the doctor actually signs off shows only
  // "Order 7001 · T0001". Reference ranges depend on age and sex, so a doctor cannot confirm
  // the right patient or the right range from this page.
  test('shows who the patient is on the verification screen', { todo: 'verify screen has no patient name/age/sex' }, async () => {
    const b = await readyForDoctor({ name: 'Ira Identity', age: '8Y 0M 0D', gender: 'Female', tests: ['T0001'] },
      { T0001: [12.1] });
    const { context, page } = await wb.newOperator();
    try {
      await wb.login(page, 'doctor.1');
      await page.goto(`${APP_URL}/work/verify/${b.testRegId}?testCode=T0001`);
      await page.getByRole('heading', { name: 'Verify results' }).waitFor();
      const text = await page.locator('.verify').innerText();
      assert.match(text, /Ira Identity/, 'patient name');
      assert.match(text, /8Y|8 y/i, 'patient age');
      assert.match(text, /Female/, 'patient sex');
    } finally {
      await context.close();
    }
  });
});
