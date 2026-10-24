# Performance audit — what the UI side carries, and what it does not

Companion to the October 2026 application performance audit (PERF-001 … PERF-036).
This file records only the items whose fix lives in **this** repository, so nobody
re-litigates a deferral or waits on a change that was never ours to make.

## Fixed here

| ID | Change |
|---|---|
| PERF-009 | `/api` routed through the SPA origin (`vercel.json`), plus an early preconnect while any environment is still cross-origin — see `SAME_ORIGIN_API.md` |
| PERF-014 | `licenceGuard` no longer blocks the first navigation on an endpoint whose p90 is 6.25 s |
| PERF-020 | `trackBy` on the lists that are rebuilt from HTTP responses: the attendance grid, the salary grid and payment history, the test catalogue, the notification bell |
| PERF-021 | Badge poll 60 s → 5 min; the tab-focus refresh is debounced and rate-capped |
| PERF-022 | `onSameUrlNavigation: 'reload'` removed, so a repeat click no longer re-runs the whole guard chain |
| PERF-030 | `@okta/okta-angular`, `@okta/okta-auth-js`, `angular-oauth2-oidc`, `@ng-select/ng-select`, `@popperjs/core` removed (0 imports each, verified) |
| PERF-031 | Stray `import { get } from "@okta/okta-auth-js"` deleted from `constants.ts`, which 48 files import |
| PERF-032 | `defaultPic.jpg` 701 KB → 5 KB (it was a 6000×6000 JPEG behind a 150 px avatar) |
| PERF-033 | `app.module.ts` deleted; `HttpClientModule` dropped from `AppComponent` |
| PERF-036 | `gzip on` and the content-hashed-bundle cache rule added to the Docker `nginx.conf` |

Also fixed, though it is not an audit item: the two modals called
`new (window as any).bootstrap.Modal(...)`, which the PERF-006 removal of the
Bootstrap CDN `<script>` left undefined — the confirm modal and the PIN modal
(which sits in the token-refresh path) would have thrown on open. They now import
Bootstrap's `Modal` from the local package.

## Deferred, deliberately

**PERF-019 — `OnPush` / zoneless change detection.** The audit calls this
structural rather than measured and says so explicitly: *"Measure first … Do not
attempt a blanket conversion."* A blanket `OnPush` pass over 122 components that
mutate arrays in place is a correctness risk, not a performance change. The next
step is a Chrome DevTools profile taken while scrolling `patient-test-list`, then
`OnPush` plus signal inputs on whichever components the profile actually names.

**PERF-026 — Font Awesome (307 KB of webfonts).** Dropping `v4-shims.min.css` means
renaming **940** v4-syntax icon classes (`fa fa-times` → `fas fa-times`), and v4→v5
also renamed icons (`fa-clock-o` → `fa-clock`, and others), so a mis-mapped name
renders as a blank box with nothing failing loudly. Worth doing as its own change,
generated from the shim stylesheet's own mapping table rather than by hand, and
reviewed screen by screen. Note that the unused families cost nothing at runtime: a
browser downloads a webfont only when a glyph from it is painted, so the live bill
on the login screen is `fa-solid-900` (158 KB) + `fa-v4compatibility` (4.8 KB).
Subsetting the solid family is the real win and needs a committed font artifact plus
a CI step that regenerates it, or every new icon silently disappears.

**PERF-020, the rest of it.** The audit counts 178 `*ngFor` without `trackBy`. The
remaining ones are `<option>` and menu loops over static constants and enum config
(`statusList`, `relations`, `countries`, `paymentModeOptions`, the header menus) —
stable array references that the differ never re-walks, so a key buys nothing there.
Migrating everything to `@for`, where `track` is compiler-enforced, stays the right
long-term move.

**PERF-035 — budgets.** Already tightened to 1.35 MB warning / 1.5 MB error against
an initial bundle of 1.31 MB. The audit's 600 KB / 1 MB target needs the bundle to
shrink first (PERF-026 and the lazy-loading work), not the budget to be lowered onto
a failing build.

## Not in this repository

These need the API or the hosting, and no UI change substitutes for them:

- **PERF-010** Redis round trip on every authenticated request (`OnTokenValidated`) — in-process cache with a short TTL in front of `IActiveSessionCache`.
- **PERF-011** Verbose synchronous Serilog file sink, ~30 lines per request — raise to Information, wrap in the async sink.
- **PERF-012** `LoginRepository` wraps indexed columns in `LOWER()` (p90 3.26 s, max 23.4 s).
- **PERF-013 / PERF-023 / PERF-024 / PERF-034** Summary reports aggregating in memory, missing `AsNoTracking`, three `SaveChangesAsync` per patient insert, a join that reads nothing.
- **PERF-016 / PERF-017 / PERF-018** Missing indexes; leading-wildcard patient search; unindexable sort keys.
- **PERF-025** Cache `GetPathologyExpiryDate` server side (`IMemoryCache` + `Cache-Control: private, max-age=300`). The UI already de-duplicates concurrent callers, and PERF-022 removes the double guard run, but the endpoint itself is the cost.
- **PERF-027 / PERF-028** Startup blocking on Key Vault and a synchronous Redis connect; middleware authenticating twice per request.
- **PERF-029** Profile image returns no `ETag` / `Last-Modified` / `Cache-Control` (max 11.2 s observed).
- **PERF-008 / PERF-009 items 2–3 / PERF-015** Response compression; HTTP/2 on the API host; a host without idle shutdown; the UAT CORS allow-list.
- **PERF-021, the other half** Collapsing the three badge calls into one `GET /api/Notification/badges`, or pushing counts over the existing `NotificationHub` (which needs a Redis backplane first — the previous hub was removed for lacking one).
