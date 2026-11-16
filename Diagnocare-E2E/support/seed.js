'use strict';

/**
 * Preconditions for a workflow, created over the same HTTP contract the UI uses.
 *
 * A technician spec should start at "a sample is waiting", not re-run registration; a doctor
 * spec should start at "results are in". These helpers make that state by calling the mock's
 * public endpoints with the real payload shapes — they never write to `state` directly, so a
 * mismatch between what the UI sends and what the API expects still surfaces in the specs
 * that drive the UI.
 */

async function post(wb, path, body, method = 'POST') {
  const res = await fetch(new URL(path, wb.apiUrl), {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return res.json();
}

let counter = 0;

/**
 * Registers a patient with one booking, exactly as the wizard would submit it.
 * `samplingDoneAt: ''` leaves the sample uncollected (the "to collect" queue).
 */
async function seedBooking(wb, {
  name = 'Seeded Patient', gender = 'Female', age = '34Y 0M 0D', tests = ['T0001'],
  urgent = false, samplingDoneAt = '', netAmount, paid = true,
} = {}) {
  counter += 1;
  const price = { T0001: 120, T0002: 110, T0005: 210, T0099: 500 };
  const testAmount = tests.reduce((s, c) => s + (price[c] ?? 0), 0);
  const net = netAmount ?? testAmount;
  const patientId = `DC-${30000 + counter}`;
  const res = await post(wb, 'api/patient/Add', {
    serial_Number: counter, patient_Id: patientId, patient_Name: `Mr. ${name}`,
    patient_DOB: '', patient_Age: age, patient_Age_Group: 'Adult', patient_Gender: gender,
    patient_Marital_Status: '', patient_Address: '12 Test Lane', relation: '', relative_Name: '',
    patient_Contact: '9876500000', patient_Email: '', patient_Reg_Date: new Date().toISOString().slice(0, 10),
    test: {
      test_Id: tests.join(','), test_Name: tests.join(', '), urgent_Report: urgent,
      report_On_WhatsApp: false, whatsApp_Number: null, test_Amount: testAmount,
      referred_By_Type: 'Self', referred_By: 'Self', remark: '', collected_Outside: false, area: '',
      collected_By: '', collection_Assigned_To: null, sampling_Done_At: samplingDoneAt,
    },
    receipt: {
      patientTestId: 0, testAmount, discount: 0, netAmount: net, paymentType: paid ? 'Full' : 'No Payment',
      amountPaid: paid ? net : 0, amountPending: paid ? 0 : net, paymentMode: paid ? 'Cash' : '',
    },
  });
  if (!res.success) throw new Error(`seedBooking failed: ${res.message}`);
  return { patientId: res.patientId, testRegId: res.testRegId, name, tests };
}

/** Records the sample as collected, the way the worklist's "Mark sample collected" dialog does. */
function seedCollected(wb, booking, location = 'StarLab') {
  return post(wb, 'api/Worklist/MarkSampleCollected', { testRegId: booking.testRegId, samplingDoneAt: location });
}

/** Saves a value for every parameter of one test, the way "Save results" does. */
async function seedResults(wb, booking, testCode, values) {
  const { parametersFor } = require('../lab-api/catalogue.js');
  const rows = parametersFor(testCode).map((p, i) => ({
    pathologyId: 'PATH-001', testCode, testRegId: String(booking.testRegId),
    parameterId: p.parameterId, obtainedValue: String(values[i]),
  }));
  return post(wb, 'api/PatientReport/Add', rows);
}

module.exports = { seedBooking, seedCollected, seedResults };
