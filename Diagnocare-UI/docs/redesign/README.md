# Diagnocare UI redesign — sidebar shell

Based on the ServiceHub reference design. Goal: make the app easy for lab staff
who are not comfortable with computers.

- **Wireframes:** open `wireframes.html` in a browser (Home, Work queue,
  Register patient, Enter results, Menu before/after).
- **Screenshots of what is built:** `screenshots/` (light, dark, phone).

## What is built on this branch

| Piece | Where |
| --- | --- |
| Sidebar shell (sidebar + top bar with Find a patient / Register patient / bell / account) | `src/app/component/layout/shell/` |
| Task-first Home dashboard (task buttons with waiting counts, KPIs, sample pipeline, latest bookings, week chart) | `src/app/component/pathology/home-dashboard/` |
| Palette tokens + calmer look for existing pages inside the shell | `src/app/shared/simple/shell-tokens.css` |
| `/patients?search=` support (used by the top-bar search) | `patients-list.component.ts` |

Everything is behind one switch, `USE_SIDEBAR_SHELL` in
`src/app/shared/simple/simple-ui.flags.ts`. Set it to `false` to get the old
header and old home page back. No API changes are needed: the home page reads
the existing `Dashboard/GetHomeSummary` and `Worklist/GetWorklist` endpoints.

The sidebar is built from the same `MODULE_ACCESS` rules as the old header, so
each role sees only the screens its route guards allow.

## Next steps (from the wireframes)

1. Restyle the work-queue tabs and rows to the shell look (wireframe 2).
2. Turn patient registration into the three-step `dc-wizard` flow, phone number first (wireframe 3).
3. Result entry with normal range and live High/Low flags beside every value (wireframe 4).
4. Move the remaining list screens from the purple gradient page style to the shell panels.
