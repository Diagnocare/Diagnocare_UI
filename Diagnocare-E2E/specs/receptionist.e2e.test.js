'use strict';

/**
 * RECEPTIONIST — the front-desk day, end to end.
 *
 *   Login → search for the patient → register → select tests → apply discount
 *         → take payment → receipt
 *
 * Every step is done the way the operator does it: by clicking and typing in the real UI.
 * What each test asserts is the OUTCOME an operator relies on (the figure on the bill, what
 * was recorded, what the next screen shows), plus — via the mock's request log — what was
 * actually sent to the API, so a screen that looks right but posts the wrong amount fails.
 */

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { Workbench } = require('../support/harness.js');
const { seedBooking } = require('../support/seed.js');

let wb;
before(async () => { wb = await new Workbench().start(); });
after(async () => { await wb?.stop(); });

/** Picks tests in the catalogue by searching for each one, then confirms the basket. */
async function pickTests(page, names) {
  await page.locator('#add-patient-test_Name').click();
  const search = page.getByLabel('Search every test by name or code');
  await search.waitFor({ state: 'visible' });
  for (const name of names) {
    await search.fill(name);
    await page.locator('.dcp__row', { hasText: name }).first().click();
  }
  return page.locator('.dcp__sumline').innerText();
}

describe('Receptionist workflow', () => {
  test('registers a new patient, discounts and takes payment, then finds the receipt', async () => {
    // A patient already on the books, so "search first" has something to find (and to not find).
    await seedBooking(wb, { name: 'Meena Iyer', gender: 'Female', tests: ['T0001'] });

    const { context, page } = await wb.newOperator();
    try {
      // ── Login ────────────────────────────────────────────────────────────────
      await wb.login(page, 'reception.1');
      assert.match(page.url(), /\/pathology$/, 'a receptionist lands on the lab home');

      // ── Search before registering: is this person already in the system? ───────
      await page.getByRole('link', { name: 'Patients' }).first().click();
      await page.locator('table.patients-table').waitFor();
      const searchBox = page.getByPlaceholder(/name or id/i);

      await searchBox.fill('Kavita');
      await page.getByRole('button', { name: 'Search' }).first().click();
      await page.locator('table.patients-table tbody tr').first().waitFor({ state: 'detached' }).catch(() => {});
      assert.equal(await page.locator('table.patients-table tbody tr').count(), 0,
        'a patient who has never been registered is not found');

      await searchBox.fill('Meena');
      await page.getByRole('button', { name: 'Search' }).first().click();
      await page.locator('table.patients-table tbody tr', { hasText: 'Meena Iyer' }).waitFor();

      // ── Register: step 1, the patient ───────────────────────────────────────────
      await page.getByRole('link', { name: 'Register patient' }).first().click();
      const patientId = page.locator('input[formControlName="patient_Id"]');
      await patientId.waitFor();
      await page.waitForFunction(() => document.querySelector('input[formControlName="patient_Id"]')?.value);
      const issuedId = await patientId.inputValue();
      assert.match(issuedId, /^DC-\d+$/, 'the system issues the patient id; the operator does not type it');

      await page.locator('input[formControlName="patient_Name"]').fill('kavita sharma');
      await page.locator('input[formControlName="patient_Age_Years"]').fill('34');
      await page.locator('label.radio-pill').filter({ hasText: /^Female$/ }).click();
      await page.locator('input[formControlName="patient_Contact"]').fill('9876501234');
      await page.getByRole('button', { name: 'Next' }).click();

      // ── Step 2: select tests ───────────────────────────────────────────────────
      const basket = await pickTests(page, ['Haemoglobin', 'Total Leucocyte Count']);
      assert.match(basket, /2 tests/, 'the basket counts the chosen tests');
      assert.match(basket, /₹230/, 'and totals them: 120 + 110');
      await page.getByRole('button', { name: 'Confirm' }).or(page.locator('.dcp__buttons .dc-btn--save')).first().click();

      assert.equal(await page.locator('#add-patient-test_Amount').inputValue(), '230',
        'the test amount is filled from the selection and cannot be typed over');
      // A walk-in has no referrer, but the field is required and the type list has no "Self":
      // the desk records it as Other / "Self".
      await page.locator('select[formControlName="referred_By_Type"]').selectOption('Other');
      await page.locator('input[formControlName="referred_By"]').fill('Self');
      await page.getByRole('button', { name: 'Next' }).click();

      // ── Step 3: collection (the defaults are right for a walk-in) ───────────────
      await page.locator('#add-patient-sampling_Done').waitFor();
      await page.getByRole('button', { name: 'Next' }).click();

      // ── Step 4: apply discount, take payment ────────────────────────────────────
      await page.locator('#add-patient-discount').fill('10');
      await page.waitForFunction(() => document.querySelector('#add-patient-net_Amount')?.value === '207');
      assert.equal(await page.locator('#add-patient-net_Amount').inputValue(), '207',
        '10% off 230 is 207 — the net amount follows the discount');

      await page.locator('select[formControlName="payment_Mode"]').selectOption('Cash');
      assert.equal(await page.locator('#add-patient-amount_Paid').inputValue(), '207',
        'paying in full means the amount paid is the net amount');
      assert.equal(await page.locator('#add-patient-amount_Pending').inputValue(), '0');

      await page.getByRole('button', { name: 'Register Patient' }).click();

      // ── Outcome: back on the list, and the API got the right bill ───────────────
      await page.waitForURL(/\/patients$/);
      const sent = wb.state.requests.filter(r => r.method === 'POST' && r.path.endsWith('/api/patient/Add')).at(-1).body;
      assert.equal(sent.patient_Name, 'Mr. Kavita Sharma', 'name is trimmed and capitalised before it is saved');
      assert.equal(sent.test.test_Id, 'T0001,T0002');
      assert.deepEqual(
        { testAmount: sent.receipt.testAmount, discount: sent.receipt.discount, netAmount: sent.receipt.netAmount,
          paymentType: sent.receipt.paymentType, amountPaid: sent.receipt.amountPaid,
          amountPending: sent.receipt.amountPending, paymentMode: sent.receipt.paymentMode },
        { testAmount: 230, discount: 10, netAmount: 207, paymentType: 'Full', amountPaid: 207,
          amountPending: 0, paymentMode: 'Cash' },
        'the receipt that was posted matches what was on screen');

      // ── Search again: now the patient is there ──────────────────────────────────
      await page.getByPlaceholder(/name or id/i).fill('Kavita');
      await page.getByRole('button', { name: 'Search' }).first().click();
      const row = page.locator('table.patients-table tbody tr', { hasText: 'Kavita' });
      await row.waitFor();
      assert.match(await row.innerText(), new RegExp(issuedId), 'the row shows the id that was issued');

      // ── Receipt: Patients → View tests → View receipts ───────────────────────────
      await row.locator('button[title="View Tests"]').click();
      await page.getByRole('button', { name: 'More' }).first().click();
      await page.getByRole('menuitem', { name: /View receipts/ }).click();

      await page.getByText('Payment Receipts').waitFor();
      await page.locator('.br-summary-status').getByText('Fully Settled').waitFor();
      const card = page.locator('.test-card.active');
      assert.match(await card.innerText(), /Paid/, 'the booking is marked Paid');
      assert.match(await card.innerText(), /207\.00/, 'at the discounted amount, not the list price');

      const [download] = await Promise.all([
        page.waitForResponse(r => r.url().includes('/api/receipt/GenerateReceiptPdf')),
        page.getByRole('button', { name: /Download payment receipt/ }).first().click(),
      ]);
      assert.equal(download.status(), 200, 'the receipt PDF is produced');
      assert.equal(wb.state.receiptPdfRequests.length, 1);
    } finally {
      await context.close();
    }
    assert.deepEqual(wb.pageErrors, [], 'no uncaught errors in the app during the workflow');
  });
});
