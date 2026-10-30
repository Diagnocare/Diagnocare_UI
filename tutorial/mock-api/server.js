'use strict';

/**
 * Mock DiagnoCare API for the tutorial recording.
 *
 * Zero dependencies — node:http only, so it runs with nothing installed. It implements
 * just the endpoints the recorded walkthrough touches, in the shapes the UI's own
 * mappers read. Anything unrouted returns an empty, well-formed body so a screen that
 * wanders off the script renders its empty state instead of throwing.
 *
 * Writes are kept in memory for the life of the process, which is what lets the
 * recording show a created Group appearing in the Master Test List on the next fetch —
 * the real point of that section.
 */

const http = require('node:http');
const { patients, groups, subGroups, tests, techniques, dmy } = require('./data.js');

const PORT = Number(process.env.MOCK_API_PORT || 5099);

// Mutable copies: the Add Group / SubGroup / Test flow appends to these.
const db = {
  patients: [...patients],
  groups: [...groups],
  subGroups: [...subGroups],
  tests: [...tests],
};

/** Signs the demo JWT the login flow hands back. Mirrors recorder/auth.js. */
const { mintDemoToken } = require('../recorder/auth.js');

function send(res, status, body) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    // The UI is served from a different origin (ng serve) than this mock.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Expose-Headers': '*',
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
  });
}

/** Applies the PageSortRequest envelope every list endpoint shares. */
function page(rows, paging) {
  const pageNumber = Number(paging?.pageNumber) || 1;
  const pageSize = Number(paging?.pageSize) || 10;
  const start = (pageNumber - 1) * pageSize;
  return { item1: rows.length, item2: rows.slice(start, start + pageSize) };
}

/**
 * Per-queue counts for the pipeline strip, keyed by the ids in
 * utilities/work-queue.util.ts. Chosen so the strip tells a coherent story
 * left to right — work thins out as it moves along — and so "needs attention"
 * is small but non-zero, which is what makes that banner appear.
 */
const QUEUE_COUNTS = [
  { queue: 'to-collect',       count: 6 },
  { queue: 'to-receive',       count: 4 },
  { queue: 'awaiting-results', count: 7 },
  { queue: 'partly-entered',   count: 3 },
  { queue: 'returned',         count: 1 },
  { queue: 'to-verify',        count: 5 },
  { queue: 'ready-to-print',   count: 9 },
  { queue: 'needs-attention',  count: 2 },
];

/**
 * Monday–Sunday registration counts for the week containing today.
 *
 * Days after today are flagged `future`, which the dashboard draws flat and
 * faded; today's bar must match patientsToday or the page contradicts itself.
 */
function weekRegistrations() {
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const counts = [5, 8, 6, 11, 9, 13, 7];
  const now = new Date();
  // getDay() is 0 for Sunday; this week starts on Monday.
  const indexToday = (now.getDay() + 6) % 7;
  return labels.map((label, i) => ({
    date: dmy(indexToday - i),
    label,
    count: i > indexToday ? 0 : (i === indexToday ? 4 : counts[i]),
    future: i > indexToday,
  }));
}

function sortPatients(rows, sortBy, dir) {
  const sign = dir === 'desc' ? -1 : 1;
  const key = {
    name: p => p.patientName,
    regDate: p => p.patientRegDate.split('-').reverse().join('-'),
    age: p => parseInt(p.patientAge, 10) || 0,
    status: p => p.testStatus,
    urgent: p => (p.isUrgent === 'Yes' ? 0 : 1),
  }[sortBy];
  if (!key) return rows;
  return [...rows].sort((a, b) => {
    const x = key(a), y = key(b);
    return (x < y ? -1 : x > y ? 1 : 0) * sign;
  });
}

const routes = [
  // ── Login: the three calls the real multi-factor flow makes ───────────────
  // LoginService posts this to api/login/, not api/user/ — both are matched so the route
  // does not depend on which controller a caller happens to use.
  ['POST', /\/api\/(login|user)\/GetUserDetails$/, async (_q, body) => ({
    success: true,
    user_Id: 'USR-001',      // login reads response.user_Id and passes it to the dialog
    userId: body.userId || 'demo.admin',
    userName: body.userId || 'demo.admin',
    typeUserId: 3,
    userType: 'Admin',
    role: 'Admin',
    email: 'demo.admin@example.com',
    contactPhone: '9876543210',
    loginType: 2,            // Email OTP — the channel the walkthrough shows
    isMfaEnabled: false,
    accountLocked: false,
    password_updated: true,
    passwordChangedAt: new Date().toISOString(),
    pathologyId: 'PATH-001',
    sessionConflict: false,
  })],
  ['POST', /\/api\/Otp\/(generate-otp|resend-otp)$/, async () => ({ success: true, message: 'OTP sent' })],
  ['POST', /\/api\/Otp\/cancel-otp$/, async () => ({ success: true })],
  // Any 6-digit code is accepted: there is no real inbox behind this.
  ['POST', /\/api\/(login|Otp)\/(Verify|verify-otp)$/, async () => ({
    success: true, token: mintDemoToken(), message: 'Verified',
  })],
  ['POST', /\/api\/login\/RefreshToken$/, async () => ({ success: true, token: mintDemoToken() })],

  // ── Header / profile ──────────────────────────────────────────────────────
  ['GET', /\/api\/user\/GetUserDetails/, async () => ({
    success: true, userName: 'demo.admin', firstName: 'Demo', lastName: 'Admin',
    email: 'demo.admin@example.com', contactPhone: '9876543210',
    userType: 'Admin', typeUserId: 3, profileImage: null, profileImageFileName: null,
  })],
  ['GET', /\/api\/pathology\/GetPathologyExpiryDate/, async () => ({
    success: true, expiryDate: new Date(Date.now() + 240 * 86400000).toISOString(),
  })],
  ['GET', /\/api\/Notification\//, async () => []],

  // ── Home dashboard ────────────────────────────────────────────────────────
  // Shape is HomeSummary (models/dashboard/home-summary.ts), which is what the
  // dashboard binds field-for-field. The earlier shape here was the old hero's
  // (todayPatients / recentBookings / weekSparkline) and left every KPI on "—".
  //
  // The row has to add up — the model states testsBooked = reportsDone +
  // testsPending — so the three test counts are derived from one split rather
  // than written as three independent numbers that could drift.
  ['GET', /\/api\/Dashboard\/GetHomeSummary/, async q => {
    const reportsDone = 9;
    const testsPending = 7;
    return {
      date: q.get('date') || dmy(0),
      patientsToday: 4,
      testsBooked: reportsDone + testsPending,
      reportsDone,
      testsPending,
      revenueToday: 6400,
      // Newest first, max three — the card shows no more than that.
      recentActivity: db.patients.slice(0, 3).map(p => ({
        patientId: p.patientId,
        patientName: p.patientName,
        status: p.testStatus,
      })),
      weekRegistrations: weekRegistrations(),
    };
  }],

  // ── Patients ──────────────────────────────────────────────────────────────
  ['POST', /\/api\/patient\/SearchPatients$/, async (_q, body) => {
    const f = body.filter || {};
    const term = (f.searchTerm || '').toLowerCase();
    let rows = db.patients.filter(p => {
      if (term && !`${p.patientName} ${p.patientId} ${p.relativeName}`.toLowerCase().includes(term)) return false;
      const status = (f.status || '').toLowerCase();
      if (!status || status === 'active') return p.isActive && p.testStatus !== 'Completed';
      if (status === 'deactivated') return !p.isActive;
      return p.testStatus.toLowerCase() === status;
    });
    rows = sortPatients(rows, body.paging?.sortBy, body.paging?.sortDirection);
    return page(rows, body.paging);
  }],
  ['GET', /\/api\/patient\/GetSerialNPatientId/, async () => ({
    serialNumber: db.patients.length + 1,
    patientId: `DC-${10431 + db.patients.length - 11}`,
  })],
  ['GET', /\/api\/patient\/GetDistinctReferredBy/, async () => ['Dr. Meera Iyer', 'Dr. Sanjay Rao', 'Walk-in']],
  ['GET', /\/api\/(addressManager|doctors|collectionBoys)\//, async () => []],
  ['GET', /\/api\/pathology\/GetAllStateCityList/, async () => [
    { state: 'Maharashtra', cities: ['Pune', 'Mumbai', 'Nashik'] },
    { state: 'Karnataka', cities: ['Bengaluru', 'Mysuru'] },
  ]],
  ['POST', /\/api\/patient\/(Add|add)$/, async (_q, body) => {
    db.patients.unshift({
      serialNumber: db.patients.length + 1,
      patientId: body.patientId || `DC-${10432 + db.patients.length}`,
      patientSalutation: body.patientSalutation || 'Mr.',
      patientName: body.patientName || 'New Patient',
      patientAge: body.patientAge || '30Y 0M 0D',
      patientAgeGroup: 'Adult', patientGender: body.patientGender || 'Male',
      patientMaritalStatus: body.patientMaritalStatus || 'Single',
      patientAddress: body.patientAddress || '', relation: body.relation || '',
      relativeName: body.relativeName || '', patientContact: body.patientContact || '',
      patientEmail: body.patientEmail || '',
      patientRegDate: require('./data.js').dmy(0),
      patientDOB: '', testStatus: 'Pending', isUrgent: 'No', isActive: true,
      lstPatientTests: { urgent_Report: false },
    });
    return { success: true, message: 'Patient registered successfully', patientId: db.patients[0].patientId };
  }],

  // ── Test catalogue: Group → SubGroup → Test ───────────────────────────────
  ['GET', /\/api\/pathologyTest\/GetAllGroupList/, async () => db.groups],
  ['GET', /\/api\/pathologyTest\/GetAllSubGroupList/, async q =>
    db.subGroups.filter(s => s.parentGroupId === (q.get('testGroupId') || ''))],
  ['GET', /\/api\/pathologyTest\/GetTestList/, async q =>
    db.tests.filter(t => t.subGroupId === (q.get('subGroupId') || ''))],
  ['GET', /\/api\/pathologyTest\/GetTechniques/, async () => techniques],
  ['GET', /\/api\/pathologyTest\/GetProtocol/, async () => []],
  ['POST', /\/api\/pathologyTest\/AddGroupWithSubgroupsAndTests$/, async (_q, body) => {
    // Persisted in memory so the list refresh after Create actually shows the new row.
    if (body.Group) {
      db.groups.push({
        groupSubgroupCode: body.Group.GroupSubgroupCode,
        groupSubGroupName: body.Group.GroupSubGroupName,
        price: Number(body.Group.Price) || 0,
        parentGroupId: '0', groupRegId: db.groups.length + 100,
      });
    }
    for (const s of body.SubGroups || []) {
      db.subGroups.push({
        groupSubgroupCode: s.GroupSubgroupCode,
        groupSubGroupName: s.GroupSubGroupName,
        price: Number(s.Price) || 0,
        parentGroupId: s.ParentGroupId, groupRegId: db.subGroups.length + 200,
      });
    }
    for (const t of body.Tests || []) {
      db.tests.push({
        testCode: t.TestCode, testName: t.TestName, price: Number(t.Price) || 0,
        subGroupId: t.SubGroupId, method: t.Method || null,
      });
    }
    return { success: true, message: 'Saved successfully' };
  }],
  ['PUT', /\/api\/pathologyTest\//, async () => ({ success: true, message: 'Updated successfully' })],

  // ── Worklist & reports ────────────────────────────────────────────────────
  // GET, not POST: WorklistService.getWorklist builds HttpParams and calls
  // httpClient.get. Registered as POST, this never matched, so the pipeline
  // strip and the task-tile badges had no counts at all.
  //
  // `counts` is an array of { queue, count } — the dashboard iterates it and
  // keys by queue id — not the object of four ad-hoc names it used to return.
  ['GET', /\/api\/Worklist\/GetWorklist/, async q => {
    const items = db.patients.slice(0, Number(q.get('pageSize')) || 50).map(p => ({
      patientId: p.patientId, patientName: p.patientName,
      testName: 'Complete Blood Count', status: p.testStatus,
      bookedAt: p.patientRegDate, urgent: p.isUrgent === 'Yes',
    }));
    return { counts: QUEUE_COUNTS, items, totalRows: items.length };
  }],
  ['POST', /\/api\/summaryReport\//, async (_q, body) =>
    page(db.patients.map(p => ({
      patientId: p.patientId, patientName: p.patientName,
      regDate: p.patientRegDate, testName: 'Complete Blood Count',
      totalTestAmount: 350, totalDiscount: 0, totalAmountPaid: 350,
      totalNetCollection: 350, status: p.testStatus,
    })), body.paging)],
  ['GET', /\/api\/summaryReport\//, async () => []],
  ['GET', /\/api\/user\/GetUserList/, async () => []],
  ['GET', /\/api\/user\/Capacity/, async () => ({ used: 6, max: 25 })],
];

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204);

  const url = new URL(req.url, 'http://localhost');
  const body = req.method === 'GET' ? {} : await readBody(req);

  for (const [method, pattern, handler] of routes) {
    if (req.method === method && pattern.test(url.pathname)) {
      try {
        return send(res, 200, await handler(url.searchParams, body));
      } catch (err) {
        process.stderr.write(`mock-api handler error on ${url.pathname}: ${err.stack}\n`);
        return send(res, 500, { success: false, message: 'mock handler error' });
      }
    }
  }

  // Unrouted: answer in a shape the UI can parse rather than 404-ing into an error toast.
  if (req.method === 'GET') return send(res, 200, []);
  return send(res, 200, { success: true });
});

server.listen(PORT, () => {
  process.stdout.write(`mock-api listening on http://127.0.0.1:${PORT}\n`);
});
