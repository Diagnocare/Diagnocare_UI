# DiagnoCare operator-workflow tests

End-to-end tests that drive the **real Angular UI** in Chromium, one per role, through the
journey that person actually performs. They complement the Jest suite in `Diagnocare-Test`
(services and components in isolation).

| Spec | Journey |
|---|---|
| `specs/receptionist.e2e.test.js` | login → search patient → register → select tests → discount → payment → receipt |
| `specs/lab-technician.e2e.test.js` | login → work queue → urgent sample first → collect → enter results → submit (also: partial entry) |
| `specs/doctor.e2e.test.js` | login → to-verify queue → open result → send back with reason / verify → issued (also: blocked when results missing) |

## Run

```bash
cd Diagnocare-E2E
npm install                       # playwright (browsers are shared with tutorial/)
# in another terminal: cd ../Diagnocare-UI && npx ng serve     (default http://localhost:4200)
npm test                          # all three
npm run test:doctor               # one role
```

`APP_URL` points at a different dev server; `HEADED=1` shows the browser; `SLOW_MO=300` slows it.

## How it works

* `lab-api/server.js` is a **stateful** stand-in for the API (node:http, no dependencies). It
  derives worklist queues from registered bookings, saved results and sign-offs with the same
  rules as `utilities/work-queue.util.ts`, so one role's actions change what the next sees.
* The app is pointed at it through `window.RUNTIME_CONFIG` — no source changes.
* `support/seed.js` creates preconditions over the same HTTP contract the UI uses.
* Specs also assert on the mock's request log, so a screen that *looks* right but posts the
  wrong amount fails.

## Known gap (reported as `todo`)

The verification screen shows only `Order 7004 · T0001` — no patient name, age or sex — so a
doctor cannot confirm the patient or the age/sex-specific reference range where they sign off.
The test is written as the desired behaviour and will start passing when that is fixed.

## Limits

The mock is not the .NET API: it proves the UI's workflow and request shapes, not server rules
(discount-approval limits, payment holds, role enforcement). Pair with API integration tests.
