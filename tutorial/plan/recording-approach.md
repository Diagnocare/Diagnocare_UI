# Phase 2 — Running the app for recording

## The problem

`npm start` serves the UI fine, but the UI is a client for a .NET API that is not part of
this repository and is not reachable from this container (`http://diagnocareDevAPI:81/`).
Pointed at nothing, every screen renders its empty state: no patients, no catalogue, no
reports. There is also no demo account, no seeded credentials and no mock auth mode in
the repository.

## What was rejected

- **Changing `environment.ts`** — a tracked production config file.
- **Weakening `authGuard` or `TokenService`** — this is the session-security model
  (the PIN gate on token expiry hangs off it). The brief says not to modify production
  authentication to make the tutorial work, and it isn't necessary.
- **Committing a recording-only `runtime-config.js`** — `src/assets/runtime-config.js` is
  shipped and populated per deployment; overwriting it would leak into real builds.

## What is done instead

Everything lives in this `tutorial/` directory. **No file under `Diagnocare-UI/` is
modified.** Two seams the application already has are used, both from inside the
Playwright browser context at recording time:

1. **`window.RUNTIME_CONFIG.diagnocareApiURL`** — the runtime-config hook the app reads
   first in `getDiagnocareApiUrl()`. `page.addInitScript` sets it to the local mock API
   before Angular bootstraps. This is exactly the mechanism a real deployment uses.
2. **`sessionStorage.authToken`** — where `TokenService` keeps the JWT. The recorder
   signs a demo JWT locally (`recorder/auth.js`) with the claims the app reads
   (`sub`, `aud`, `typ`) so the layout and role-gated nav render.

The signature is not verified anywhere in the frontend — only the API verifies JWTs, and
the API here is the mock. Nothing about the real auth path changes: the guard, the token
service and the interceptors all run exactly as shipped.

## Login in the tutorial is real

The login section is **not** faked past the UI. `mock-api/server.js` implements the three
endpoints the real flow uses, so the recorded login is the application's own code path:

```
POST api/user/GetUserDetails  → { userId, loginType: 2, isMfaEnabled: false, email, … }
POST api/Otp/generate-otp     → { success: true }
POST api/login/Verify         → { success: true, token: <demo JWT> }
```

The OTP step is part of the product, so the walkthrough shows it. The mock accepts any
6-digit code; the narration says so rather than implying a real code was received.

## Running it

```bash
cd tutorial && npm run record
```

That script starts the mock API, **reuses an `ng serve` that is already running** (it
checks `localhost:4200`, then `APP_PORT`) or starts one, waits for both to answer,
records, and shuts down whatever it started. `npm run build:video` then post-processes,
and `npm run install:app` copies the result into the application. `npm run all` does all
three.

Reuse is safe precisely because of the seam above: the app is pointed at the mock API
from inside the browser, so *which* dev server is serving the bundle does not matter, and
a developer's own server is never killed.

## The mock had drifted from the app

Two endpoints were written against the **old hero home page** and no longer matched what
the shipping components read. Both were corrected here, in `mock-api/`, not in the app:

| Endpoint | Was | Is |
|---|---|---|
| `GET api/Dashboard/GetHomeSummary` | `todayPatients`, `recentBookings`, `weekSparkline` | the `HomeSummary` shape — `patientsToday`, `testsBooked`, `recentActivity`, `weekRegistrations` |
| `api/Worklist/GetWorklist` | registered as **POST**, `counts` an object | **GET** (what `WorklistService` issues), `counts` an array of `{ queue, count }` |

Left as they were, every KPI on the dashboard rendered a dash and the pipeline strip had
no counts at all — the home page would have been recorded empty.

## Recording on Windows

The pipeline was originally written for a Linux container and assumed `ffmpeg` on `PATH`,
a POSIX shell, and `npx` as an executable. On Windows none of those hold, so:

- the two `post/*.sh` scripts are now `post/*.js`, run by `node`;
- ffmpeg comes from the **`ffmpeg-static`** package rather than the system, and `ffprobe`
  is no longer used anywhere — the one duration the build reports is parsed out of
  ffmpeg's own output;
- `scripts/run.js` spawns through a shell on `win32` (there is no bare `npx`) and tears
  children down with `taskkill /T`, because `SIGTERM` there kills only the wrapper and
  leaves `ng serve` holding the port.

Phase 7 also improves here rather than degrading: Windows ships **SAPI**, so the English
narration is now really synthesised instead of falling back to silence. Hindi has no
voice on a default install and stays captions-only.
