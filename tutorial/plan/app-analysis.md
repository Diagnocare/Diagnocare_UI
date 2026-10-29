# Phase 1 — Repository analysis

Findings are from reading the source, not inference. File references are relative to
`Diagnocare-UI/`.

## Stack

| Question | Answer |
|---|---|
| Framework | Angular **20.3** — standalone components, no NgModules for features |
| Package manager | **npm** (`package-lock.json`; no yarn/pnpm lockfile) |
| Entry point | `src/main.ts` → `src/index.html` (`<app-root>`) |
| Install | `npm install` |
| Dev server | `npm start` (= `ng serve`, default configuration `development`) |
| Build | `npm run build`; configurations `production`, `development`, `qa`, `uat` |
| Styling | Bootstrap 5.3 + Font Awesome 6 + per-component SCSS/CSS |
| Notifications | `ngx-toastr` |
| Charts | `chart.js` |
| Forms | Reactive Forms throughout the patient/test flows; `ngModel` on a few older screens |

## Backend

The repository is **UI only**. The API is a separate .NET service, addressed through
`getDiagnocareApiUrl()` in `src/app/shared/api-base-url.util.ts`:

1. `window.RUNTIME_CONFIG.diagnocareApiURL`, if set — injected by
   `src/assets/runtime-config.js`, which ships empty (`window.RUNTIME_CONFIG = {}`)
   and is populated per deployment.
2. otherwise `environment.diagnocareApiURL`.

`environment.ts` (development) points at `http://diagnocareDevAPI:81/` — an internal
dev hostname, not resolvable outside that network. **No backend is reachable from this
container**, which is what the mock API in this project exists to solve.

Controllers are declared in `src/app/constant/constants.ts` (`controllerEndpoints`), and
every route under them in `apiEndpoints`. List endpoints share one envelope:

```
PagedRequest<TFilter>  { paging: { pageNumber, pageSize, sortBy?, sortDirection? }, filter: {...} }
PagedResponse<T>       { item1: <total rows>, item2: <rows on this page> }
```

`PageSortRequest` carries a **single** `sortBy` — there is no secondary sort key.

## Authentication

- `authGuard` (`src/app/core/guards/auth.guard.ts`) allows the route when
  `TokenService.hasToken()` is true. A present-but-expired token still passes: expiry is
  handled by the auth interceptor's PIN gate on the first API call, not by the guard.
- The JWT lives in **`sessionStorage.authToken`** (`TokenService.TOKEN_KEY`).
- Claims the app reads: `sub` → username, `aud` → role label, `typ` → pathology id.
- Roles (`src/app/constant/enums.ts`): Receptionist(1), Lab Assistant(2), Admin(3),
  Super Admin(4), Collection Boy(5), Doctor(6).
- Login is **multi-factor by design** and always lands on an OTP step:
  `POST api/user/GetUserDetails` → `POST api/Otp/generate-otp` → `POST api/login/Verify`,
  which returns `{ token }`. `loginType` picks the channel (1 Mobile, 2 Email,
  3 Authenticator/TOTP, 4 Fingerprint/WebAuthn).
- After login, Receptionist/Lab Assistant/Admin land on `/patients`, everyone else on
  `/pathology`.

**No demo account and no mock/bypass auth mode exists in the repository.** There are no
credentials in environment files. See `recording-approach.md` for how recording gets a
session without touching any of this.

## Routes that matter (`src/app/app-routing.module.ts`)

Public: `home`, `login`, `login/callback`, `forgot-password`, `help`,
`register-pathology`, `licence-expired`.

Behind `authGuard`, inside the `LayoutComponent` shell:

- `patients` — **Patient Management System** (the main list), `patients/add`,
  `patients/stepper`, `patients/edit/:id`
- `patient-tests`, `patient-tests/view/:id`, `patient-tests/edit/:id`
- `manage-tests` — **Master Test List** (Groups → SubGroups → Tests), plus
  `manage-tests/import`, `manage-tests/addTestParameter/:id`
- `work`, `work/verify/:id` — the worklist / result verification queue
- `users` (Staff Management), `contacts` (Address Manager)
- `reports/*` — 14 reports, default `patient-register`; includes `reports/master-test-list`
- `pathology` (lab home/dashboard), `lab-setup`, `lab-profile`, `template`
- `attendance`, `salary`, `holidays`, `visit-schedule`, `my-*` (user panel)

## Main navigation

`src/app/component/layout/layout.component.html` wraps authenticated routes;
`src/app/component/header/header-menu/` holds the nav and the account menu
(Profile, Change Password, Logout). Nav sections are declared in
`src/app/constant/constants.ts` (around `pathTest`/`masterTestList` entries), each with
an `id`, `label`, `route` and Font Awesome `icon`.

## Important components for a walkthrough

| Screen | Component |
|---|---|
| Patient list | `component/patient/patients-list/` |
| Patient registration | `component/patient/add-patient/` (+ `stepper/`) |
| Patient edit | `component/patient/edit-patient/` |
| Master Test List | `component/pathTest/manage-tests/` |
| Add Group/SubGroup/Test modal | `component/pathTest/add-edit-modal/` |
| Reports shell | `component/summary-report/` |
| Profile / Change Password | `component/header/profile/`, `component/header/change-password/` |
| Shared confirm dialog | `shared/confirm-modal/` |

## Existing test / automation / media tooling

- **Unit tests:** a sibling project `Diagnocare-Test/` — **Jest** (`jest.config.js`,
  `jest.ci.config.js`, `setup-jest.ts`), specs for services, guards and a few
  components, with fixtures in `src/mocks/mock-data.ts`. The UI project's own
  `npm test` is the untouched Angular/Karma default.
- **Browser automation:** none. No Playwright, Puppeteer, Cypress, Selenium or
  WebDriver config anywhere in either project.
- **Video/media tooling:** none in the repository.

Available in this container (not in the repo): `ffmpeg` and `ffprobe` at `/usr/bin`,
and Playwright **1.63.0** with Chromium at `/opt/pw-browsers/chromium`. No offline TTS
engine — `espeak-ng`, `flite` and `festival` are all unavailable from apt here.

## What the product is

DiagnoCare is a **pathology laboratory management system**. A lab's day runs through it
end to end:

1. **Register a patient** at the front desk and book the tests they need, with
   referrer, discount and payment captured on the same form.
2. **Collect and track the sample** — the worklist moves each booking from collection
   through result entry.
3. **Enter and verify results**, which is what issues the report; verification is a
   deliberate sign-off step, and reports can be recalled.
4. **Deliver the report** as a PDF or a share link.
5. **Run the lab** — the test catalogue and its rates, staff, attendance and salary,
   referrer contacts, and 14 operational/financial reports.

The catalogue is a three-level hierarchy — **Group → SubGroup → Test** — and a price
hangs off every level. That hierarchy is the spine of the whole application: bookings,
rates and most reports are all expressed in terms of it.
