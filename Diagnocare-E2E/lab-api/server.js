'use strict';

/**
 * A small, STATEFUL stand-in for the DiagnoCare API, used by the operator-workflow tests.
 *
 * Unlike the tutorial's mock (which replays a fixed story), this one keeps patients,
 * bookings, results, receipts and sign-offs in memory and derives the worklist queue from
 * them with the same rules as utilities/work-queue.util.ts deriveQueue(). That is the point:
 * what the receptionist registers is what the technician finds in a queue, and what the
 * technician saves is what the doctor is asked to verify. Nothing in a spec has to be seeded
 * to make the next role's screen show the right thing.
 *
 * Zero dependencies — node:http only. Start it in-process (see support/harness.js) so a spec
 * can read `state` to assert on what the UI actually sent, not just on what the UI displays.
 */

const http = require('node:http');
const crypto = require('node:crypto');
const { groups, subGroups, tests, parametersFor } = require('./catalogue.js');

/** Users the login flow accepts. `role` is the label the JWT `role` claim carries. */
const USERS = {
  'reception.1': { role: 'Receptionist',   typeUserId: 1, name: 'Rita Receptionist' },
  'tech.1':      { role: 'Lab Assistant',  typeUserId: 2, name: 'Tarun Technician' },
  'doctor.1':    { role: 'Doctor',         typeUserId: 6, name: 'Dr. Dev Doctor' },
};

const QUEUES = ['to-collect', 'to-receive', 'awaiting-results', 'partly-entered',
  'returned', 'to-verify', 'ready-to-print', 'needs-attention'];

function b64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Structurally valid JWT. The frontend never verifies the signature; only the API does. */
function mintToken(userId) {
  const user = USERS[userId] || USERS['reception.1'];
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({
    role: user.role, sub: userId, aud: user.role, typ: 'PATH-001', name: user.name,
    iss: 'diagnocare-e2e-mock', iat: now, nbf: now, exp: now + 8 * 3600,
  }));
  const sig = crypto.createHmac('sha256', 'e2e-only-not-a-real-key').update(`${head}.${body}`)
    .digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${head}.${body}.${sig}`;
}

function dmy(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dMmmYyyy(d = new Date()) {
  return `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

function createLabApi() {
  /** Everything a spec might want to assert on. Reset per server instance. */
  const state = {
    patients: [],        // { patientId, name, age, gender, contact, regDate, ... }
    bookings: [],        // { testRegId, patientId, codes[], urgent, samplingDoneAt, receiptId, ... }
    results: new Map(),  // `${testRegId}:${code}` -> Map(parameterId -> { id, value })
    verified: new Map(), // `${testRegId}:${code}` -> { by, at, comment }
    returned: new Map(), // `${testRegId}:${code}` -> { reason, by, at }
    receipts: [],
    requests: [],        // [{ method, path, body }] — every call the UI made, in order
    receiptPdfRequests: [],
    nextPatientNo: 20001,
    nextTestRegId: 7001,
    nextReceiptId: 9001,
    nextResultId: 1,
    lastLoginUser: 'reception.1',
  };

  const testByCode = code => tests.find(t => t.testCode === code);
  const paramsOf = code => parametersFor(code);

  // ── Derived views ──────────────────────────────────────────────────────────
  const savedCount = (testRegId, code) => {
    const m = state.results.get(`${testRegId}:${code}`);
    return m ? [...m.values()].filter(r => String(r.value).trim() !== '').length : 0;
  };

  /** Mirrors deriveQueue() in utilities/work-queue.util.ts — the order of checks is the spec. */
  function queueOf(booking, code) {
    const key = `${booking.testRegId}:${code}`;
    if (booking.status === 'Cancelled') return 'needs-attention';
    if (state.verified.has(key)) return 'ready-to-print';
    if (!booking.samplingDoneAt) return 'to-collect';
    const total = paramsOf(code).length;
    if (total === 0) return 'needs-attention';
    // Sent back by a verifier: the bench redoes it before it can be verified again.
    if (state.returned.has(key)) return 'returned';
    const saved = savedCount(booking.testRegId, code);
    if (saved === 0) return 'awaiting-results';
    if (saved < total) return 'partly-entered';
    return 'to-verify';
  }

  function worklistItems() {
    const items = [];
    for (const b of state.bookings) {
      const patient = state.patients.find(p => p.patientId === b.patientId);
      for (const code of b.codes) {
        const key = `${b.testRegId}:${code}`;
        const t = testByCode(code);
        const ret = state.returned.get(key);
        const ver = state.verified.get(key);
        items.push({
          testRegId: b.testRegId, testCode: code, testName: t?.testName ?? code,
          patientId: b.patientId, patientName: patient?.name ?? '',
          patientAge: patient?.age ?? '', patientGender: patient?.gender ?? '',
          queue: queueOf(b, code),
          blockedReason: null,
          parameterCount: paramsOf(code).length,
          savedResultCount: savedCount(b.testRegId, code),
          urgent: !!b.urgent,
          bookedAt: b.bookedAt, samplingDoneAt: b.samplingDoneAt || null,
          verifiedAt: ver?.at ?? null, verifiedBy: ver?.by ?? null,
          returnedReason: ret?.reason ?? null, returnedBy: ret?.by ?? null, returnedAt: ret?.at ?? null,
          referredBy: b.referredBy, bookingStatus: b.status,
          paymentStatus: receiptStatus(b),
          collectionAssignedTo: null, collectionAssignedToName: null,
          sampleCollectedAt: b.samplingDoneAt || null, sampleReceivedAt: null, sampleReceivedBy: null,
        });
      }
    }
    return items;
  }

  function receiptStatus(booking) {
    const r = state.receipts.find(x => x.patientTestId === booking.testRegId);
    if (!r) return 'Pending';
    return r.amountPending <= 0 ? 'Paid' : (r.amountPaid > 0 ? 'Partial' : 'Pending');
  }

  /** Urgent first, then oldest first — what a bench actually wants to work down. */
  const byUrgency = (a, b) => (b.urgent - a.urgent) || String(a.bookedAt).localeCompare(String(b.bookedAt));

  function patientTestDto(b) {
    const r = state.receipts.find(x => x.patientTestId === b.testRegId);
    const done = b.codes.length > 0 && b.codes.every(c => {
      const total = paramsOf(c).length;
      return total > 0 && savedCount(b.testRegId, c) >= total;
    });
    const any = b.codes.some(c => savedCount(b.testRegId, c) > 0);
    return {
      patient_Test_Id: String(b.testRegId), patient_Id: b.patientId,
      test_id: b.codes, test_Ids: b.codes.join(','), test_Id: b.codes.join(','),
      test_Name: b.codes.map(c => testByCode(c)?.testName ?? c).join(', '),
      test_count: b.codes.length, urgent_Report: !!b.urgent, report_On_WhatsApp: false, whatsApp_Number: null,
      amount_Tobe_Paid: r ? r.netAmount : 0, referred_By: b.referredBy || '', remark: b.remark || '',
      collected_Outside: false, collected_At: '', collected_By: '', area: '',
      sampling_Done: b.samplingDoneAt || '', sampling_Done_At: b.samplingDoneAt || '',
      registration_Date: dMmmYyyy(new Date(b.bookedAt)),
      is_Report_Generated: done ? 'Completed' : (any ? 'Partial' : 'Pending'),
      booking_Status: b.status, cancelled_At: null, cancellation_Reason: null,
      bill_Reciept: r ? {
        receipt_Id: r.receiptId, test_Amount: r.testAmount, discount: r.discount, net_Amount: r.netAmount,
        payment_Type: r.paymentType, amount_Paid: r.amountPaid, amount_Pending: r.amountPending,
        payment_Mode: r.paymentMode, payment_Status: receiptStatus(b),
        discount_Approval_Status: 'NotRequired', requested_Discount: null, discount_Review_Remark: null,
        is_Refunded: false, refund_Amount: null, refunded_At: null, refund_Reason: null,
      } : null,
    };
  }

  function patientRow(p) {
    const bs = state.bookings.filter(b => b.patientId === p.patientId);
    const allDone = bs.length > 0 && bs.every(b => patientTestDto(b).is_Report_Generated === 'Completed');
    const any = bs.some(b => patientTestDto(b).is_Report_Generated !== 'Pending');
    return {
      serialNumber: p.serial, patientId: p.patientId, patientSalutation: p.salutation,
      patientName: p.name, patientAge: p.age, patientAgeGroup: p.ageGroup, patientGender: p.gender,
      patientMaritalStatus: p.marital || '', patientAddress: p.address || '', relation: p.relation || '',
      relativeName: p.relativeName || '', patientContact: p.contact || '', patientEmail: p.email || '',
      patientRegDate: p.regDate, patientDOB: p.dob || '',
      testStatus: allDone ? 'Completed' : (any ? 'Partial' : 'Pending'),
      isUrgent: bs.some(b => b.urgent) ? 'Yes' : 'No', isActive: true,
      lstPatientTests: { urgent_Report: bs.some(b => b.urgent) },
    };
  }

  // ── Routes ─────────────────────────────────────────────────────────────────
  const routes = [];
  const route = (method, pattern, handler) => routes.push([method, pattern, handler]);

  // Login — the three-call multi-factor flow.
  route('POST', /\/api\/(login|user)\/GetUserDetails$/, async (_q, body) => {
    const id = body.userId || 'reception.1';
    state.lastLoginUser = id;
    const u = USERS[id];
    if (!u) return { success: false, message: 'User not found' };
    return {
      success: true, user_Id: 'USR-' + u.typeUserId, userId: id, userName: id,
      typeUserId: u.typeUserId, userType: u.role, role: u.role,
      email: `${id}@example.com`, contactPhone: '9876543210',
      loginType: 2, isMfaEnabled: false, accountLocked: false, password_updated: true,
      passwordChangedAt: new Date().toISOString(), pathologyId: 'PATH-001', sessionConflict: false,
    };
  });
  route('POST', /\/api\/Otp\/(generate-otp|resend-otp|cancel-otp)$/, async () => ({ success: true, message: 'OTP sent' }));
  route('POST', /\/api\/(login|Otp)\/(Verify|verify-otp)$/, async (_q, body) => {
    const id = body.userId || state.lastLoginUser;
    // Any six digits is accepted; a wrong-length code would never reach here (the UI blocks it).
    return { success: true, token: mintToken(id), message: 'Verified' };
  });
  route('POST', /\/api\/login\/RefreshToken$/, async () => ({ success: true, token: mintToken(state.lastLoginUser) }));

  // Header / licence
  route('GET', /\/api\/user\/GetUserDetails/, async () => {
    const u = USERS[state.lastLoginUser];
    return { success: true, userName: state.lastLoginUser, firstName: u.name.split(' ')[0], lastName: u.name.split(' ')[1],
      email: `${state.lastLoginUser}@example.com`, contactPhone: '9876543210', userType: u.role,
      typeUserId: u.typeUserId, profileImage: null, profileImageFileName: null };
  });
  route('GET', /\/api\/pathology\/GetPathologyExpiryDate/, async () => ({
    success: true, expiryDate: new Date(Date.now() + 240 * 86400000).toISOString() }));
  route('GET', /\/api\/Notification\//, async () => []);

  // Home dashboard
  route('GET', /\/api\/Dashboard\/GetHomeSummary/, async () => ({
    date: dmy(), patientsToday: state.patients.length, testsBooked: state.bookings.length,
    reportsDone: 0, testsPending: state.bookings.length, revenueToday: 0, recentActivity: [], weekRegistrations: [] }));

  // Patients
  route('GET', /\/api\/patient\/GetSerialNPatientId/, async () => ({
    key: state.patients.length + 1, value: `DC-${state.nextPatientNo}` }));
  route('GET', /\/api\/patient\/GetDistinctReferredBy/, async () => ['Self', 'Walk-in']);
  route('GET', /\/api\/(addressManager|doctors|collectionBoys)\//, async () => []);
  route('GET', /\/api\/patient\/GetById/, async q => {
    const p = state.patients.find(x => x.patientId === q.get('patientId'));
    return p ? { ...patientRow(p) } : {};
  });
  route('POST', /\/api\/patient\/SearchPatients$/, async (_q, body) => {
    const f = body.filter || {};
    const term = (f.searchTerm || '').toLowerCase();
    let rows = state.patients.map(patientRow).filter(r =>
      !term || `${r.patientName} ${r.patientId} ${r.relativeName} ${r.patientContact}`.toLowerCase().includes(term));
    const status = (f.status || '').toLowerCase();
    if (!status || status === 'active') rows = rows.filter(r => r.testStatus !== 'Completed');
    else if (status !== 'deactivated') rows = rows.filter(r => r.testStatus.toLowerCase() === status);
    else rows = [];
    // Urgent patients first, then newest — the ordering the list screen promises.
    rows.sort((a, b) => (a.isUrgent === 'Yes' ? 0 : 1) - (b.isUrgent === 'Yes' ? 0 : 1));
    const size = Number(body.paging?.pageSize) || 10;
    const page = Number(body.paging?.pageNumber) || 1;
    return { item1: rows.length, item2: rows.slice((page - 1) * size, page * size) };
  });
  route('POST', /\/api\/patient\/(Add|add)$/, async (_q, body) => {
    const t = body.test || {};
    const rc = body.receipt || {};
    const codes = String(t.test_Id || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!body.patient_Name || codes.length === 0) {
      return { success: false, message: 'A patient name and at least one test are required.' };
    }
    const patientId = body.patient_Id || `DC-${state.nextPatientNo}`;
    state.nextPatientNo += 1;

    const [salutation, ...rest] = String(body.patient_Name).split(' ');
    state.patients.unshift({
      serial: body.serial_Number, patientId, salutation, name: rest.join(' '),
      age: body.patient_Age, ageGroup: body.patient_Age_Group, gender: body.patient_Gender,
      contact: body.patient_Contact, email: body.patient_Email, address: body.patient_Address,
      relation: body.relation, relativeName: body.relative_Name, dob: body.patient_DOB,
      marital: body.patient_Marital_Status, regDate: body.patient_Reg_Date || dmy(),
    });

    const testRegId = state.nextTestRegId++;
    const booking = {
      testRegId, patientId, codes, urgent: !!t.urgent_Report, status: 'Active',
      samplingDoneAt: (t.sampling_Done_At || '').trim() || null,
      referredBy: t.referred_By, remark: t.remark, bookedAt: new Date().toISOString(),
    };
    state.bookings.push(booking);

    const receipt = {
      receiptId: state.nextReceiptId++, patientTestId: testRegId,
      testAmount: rc.testAmount, discount: rc.discount, netAmount: rc.netAmount,
      paymentType: rc.paymentType, amountPaid: rc.amountPaid, amountPending: rc.amountPending,
      paymentMode: rc.paymentMode, createdDate: new Date().toISOString(),
      isRefunded: false, refundAmount: null, refundedAt: null, refundReason: null,
      bookingStatus: 'Active', tpaName: null, tpaPolicyNumber: null, tpaClaimNumber: null,
      tpaApprovalCode: null, tpaPolicyValidFrom: null, tpaPolicyValidTo: null,
      tpaPaymentStatus: null, tpaSettledDate: null, discountApprovalStatus: 'NotRequired',
    };
    state.receipts.push(receipt);

    return {
      success: true, message: 'Patient registered successfully', patientId, testRegId,
      // Sample labels print only once a sampling location is chosen; the UI reads both fields.
      labels: booking.samplingDoneAt ? codes.map(c => ({ testCode: c, barcodeValue: `${testRegId}-${c}` })) : [],
      labelUrl: '', samplingDoneAt: booking.samplingDoneAt || undefined,
      labelsReady: !!booking.samplingDoneAt,
    };
  });
  route('PUT', /\/api\/patient\/UpdateSamplingLocation$/, async (_q, body) => {
    const b = state.bookings.find(x => x.testRegId === Number(body.patientTestId));
    if (!b) return { success: false, message: 'Booking not found' };
    b.samplingDoneAt = body.samplingDoneAt;
    return { success: true, message: 'Saved', patientId: b.patientId, testRegId: b.testRegId, labels: [], labelUrl: '', samplingDoneAt: b.samplingDoneAt, labelsReady: true };
  });

  // Catalogue
  route('GET', /\/api\/pathologyTest\/GetAllGroupList/, async () => groups);
  route('GET', /\/api\/pathologyTest\/GetAllSubGroupList/, async q =>
    subGroups.filter(s => s.parentGroupId === (q.get('testGroupId') || '')));
  route('GET', /\/api\/pathologyTest\/GetTestList/, async q =>
    tests.filter(t => t.subGroupId === (q.get('subGroupId') || ''))
      .map(t => ({ ...t, parameterCount: paramsOf(t.testCode).length })));
  route('GET', /\/api\/pathologyTest\/GetTestProtocol/, async () => []);

  // Worklist
  route('GET', /\/api\/Worklist\/GetWorklist/, async q => {
    const queue = q.get('queue');
    const term = (q.get('searchTerm') || '').toLowerCase();
    const size = Number(q.get('pageSize')) || 50;
    const pageNo = Number(q.get('pageNumber')) || 1;
    const all = worklistItems().filter(i =>
      !term || `${i.patientName} ${i.patientId} ${i.testRegId} ${i.referredBy}`.toLowerCase().includes(term));
    const counts = QUEUES.map(name => ({ queue: name, count: all.filter(i => i.queue === name).length }));
    const inQueue = (queue ? all.filter(i => i.queue === queue) : all).sort(byUrgency);
    return { items: inQueue.slice((pageNo - 1) * size, pageNo * size), counts,
      totalItems: inQueue.length, pageNumber: pageNo, pageSize: size };
  });
  route('POST', /\/api\/Worklist\/MarkSampleCollected$/, async (_q, body) => {
    const b = state.bookings.find(x => x.testRegId === Number(body.testRegId));
    if (!b) return { collected: false };
    b.samplingDoneAt = body.samplingDoneAt;
    return { collected: true, samplingDoneAt: b.samplingDoneAt };
  });
  route('POST', /\/api\/Worklist\/Verify$/, async (_q, body) => {
    const key = `${body.testRegId}:${body.testCode}`;
    const b = state.bookings.find(x => x.testRegId === Number(body.testRegId));
    const total = paramsOf(body.testCode).length;
    // The server refuses to sign off a test that still has blanks — the UI also disables the button.
    if (!b || savedCount(b.testRegId, body.testCode) < total) {
      return { verified: false, verifiedBy: null, verifiedAt: null };
    }
    const at = new Date().toISOString();
    state.verified.set(key, { by: state.lastLoginUser, at, comment: body.comment ?? null });
    state.returned.delete(key);
    return { verified: true, verifiedBy: state.lastLoginUser, verifiedAt: at };
  });
  route('POST', /\/api\/Worklist\/ReturnForReentry$/, async (_q, body) => {
    const key = `${body.testRegId}:${body.testCode}`;
    state.verified.delete(key);
    state.returned.set(key, { reason: body.reason, by: state.lastLoginUser, at: new Date().toISOString() });
    // Sent back to the bench: results stay on file, but the verifier must see them redone.
    return { returned: true };
  });
  route('GET', /\/api\/Worklist\/IsVerified/, async q =>
    ({ verified: state.verified.has(`${q.get('testRegId')}:${q.get('testCode')}`) }));

  // Patient tests & results
  route('GET', /\/api\/PatientReport\/GetAllList/, async q =>
    state.bookings.filter(b => b.patientId === q.get('patientId')).map(patientTestDto));
  route('GET', /\/api\/PatientReport\/GetById/, async q => {
    const codes = String(q.get('patientTestId') || '').split(',').map(s => s.trim()).filter(Boolean);
    return { tests: codes.map(code => {
      const t = testByCode(code);
      return { testRegId: t?.testRegId ?? 0, pathologyId: 'PATH-001', testCode: code, testName: t?.testName ?? code,
        price: t?.price ?? 0, method: t?.method };
    }) };
  });
  route('GET', /\/api\/PatientReport\/GetSavedTestReport/, async q => {
    const testRegId = Number(q.get('patientTestId'));
    const code = q.get('testCode');
    const saved = state.results.get(`${testRegId}:${code}`) || new Map();
    return paramsOf(code).map(p => ({
      parameterId: p.parameterId, testRegId, parameterName: p.parameterName,
      parameterUnit: p.parameterUnit, parameterRange: p.parameterRange,
      obtainedValue: saved.get(p.parameterId)?.value ?? null,
    }));
  });
  const saveResults = async (_q, body) => {
    for (const r of Array.isArray(body) ? body : []) {
      const key = `${Number(r.testRegId)}:${r.testCode}`;
      if (!state.results.has(key)) state.results.set(key, new Map());
      state.results.get(key).set(r.parameterId, { id: state.nextResultId++, value: r.obtainedValue });
      state.returned.delete(key); // re-entering results answers the verifier's note
      state.returned.delete(key); // re-entering results answers the verifier's note
    }
    return { success: true, message: 'Saved' };
  };
  route('POST', /\/api\/PatientReport\/Add$/, saveResults);
  route('PUT', /\/api\/PatientReport\/Update$/, saveResults);
  route('GET', /\/api\/PatientReport\/GetPrintStatuses/, async () => []);
  route('GET', /\/api\/TestRun\/GetBookingCounts/, async () => []);

  // Receipts
  route('GET', /\/api\/receipt\/GetAllList/, async q => {
    const v = q.get('searchValue');
    const ids = new Set(state.bookings.filter(b => String(b.testRegId) === v || b.patientId === v).map(b => b.testRegId));
    return state.receipts.filter(r => ids.has(r.patientTestId));
  });
  route('GET', /\/api\/receipt\/GetReceiptCount/, async q => ({ searchTerm: q.get('searchValue'), receiptCount: state.receipts.length }));
  route('GET', /\/api\/receipt\/GenerateReceiptPdf/, async q => {
    state.receiptPdfRequests.push(Number(q.get('receiptId')));
    return { __raw: '%PDF-1.4\n% e2e receipt\n', contentType: 'application/pdf' };
  });

  // ── Server ──────────────────────────────────────────────────────────────────
  function send(res, status, body) {
    const raw = body && body.__raw !== undefined;
    const payload = raw ? body.__raw : (body === undefined ? '' : JSON.stringify(body));
    res.writeHead(status, {
      'Content-Type': raw ? body.contentType : 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
      'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'Access-Control-Expose-Headers': '*',
    });
    res.end(payload);
  }
  const readBody = req => new Promise(resolve => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
  });

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204);
    const url = new URL(req.url, 'http://localhost');
    const body = req.method === 'GET' ? {} : await readBody(req);
    state.requests.push({ method: req.method, path: url.pathname, query: url.search, body });
    for (const [method, pattern, handler] of routes) {
      if (req.method === method && pattern.test(url.pathname)) {
        try { return send(res, 200, await handler(url.searchParams, body)); }
        catch (err) {
          process.stderr.write(`lab-api handler error on ${url.pathname}: ${err.stack}\n`);
          return send(res, 500, { success: false, message: 'mock handler error' });
        }
      }
    }
    // Unrouted: a well-formed empty answer, so a screen we do not exercise renders its empty state.
    return send(res, 200, req.method === 'GET' ? [] : { success: true });
  });

  return {
    state, server,
    listen: (port = 0) => new Promise(resolve =>
      server.listen(port, '127.0.0.1', () => resolve(server.address().port))),
    close: () => new Promise(resolve => server.close(() => resolve())),
  };
}

module.exports = { createLabApi, USERS };
