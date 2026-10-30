# DiagnoCare — automated product tutorial

Records a narrated, bilingual (English + हिन्दी) product walkthrough of the DiagnoCare UI
by driving the real application in a browser, and post-processes it into a 1080p MP4 with
chapter markers and selectable subtitle tracks.

The finished video is then **played inside the application itself** — *Watch tutorial
video* on the home dashboard. See [Playing it in the app](#playing-it-in-the-app).

```
tutorial/
├── plan/
│   ├── app-analysis.md       Phase 1 — what the app is, how it is built, how it runs
│   ├── recording-approach.md Phase 2 — how it is run for recording, and what was rejected
│   └── storyboard.md         Phase 3 — GENERATED from the recorder; never edit by hand
├── mock-api/                 zero-dependency stand-in for the .NET API
├── recorder/                 Playwright driver, overlay, bilingual script
├── post/                     subtitles, voice-over, final encode, install into the app
├── assets/                   embedded Devanagari webfont
└── out/                      artifacts (video, subtitles, timeline)
```

## Quick start

```bash
cd tutorial
npm install              # playwright + ffmpeg-static
npx playwright install chromium
npm run all              # record → build the MP4 → copy it into the app
```

Expect roughly fifteen minutes: a cold Angular dev-server build (skipped if one is
already running), then a ten-minute recording in real time, then the encode.

Individual steps:

```bash
npm run record        # mock API + ng serve + record  → out/*.webm, out/timeline.json
npm run build:video   # subtitles + voice-over + encode → out/DiagnoCare-Tutorial.mp4
npm run install:app   # copy the MP4 + .vtt into Diagnocare-UI/src/assets/tutorial/
npm run storyboard    # regenerate plan/storyboard.md from recorder/steps.js
```

Useful environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `ONLY` | all | Record only some chapters: `ONLY=login,catalogue` |
| `SPEED` | `1` | Playback multiplier. `SPEED=6` is for iterating on selectors, not for a deliverable |
| `APP_PORT` | `4299` | Port to start `ng serve` on, when one is not already running |
| `REUSE_PORT` | `4200` | Port checked for an existing dev server before starting one |
| `MOCK_API_PORT` | `5099` | Port for the mock API |
| `SAPI_VOICE` | `Zira` | Windows narration voice (a name or any substring of one) |
| `SAPI_RATE` | `-1` | Windows narration rate, `-10`…`10` |
| `FFMPEG` | — | Path to an ffmpeg binary, overriding `ffmpeg-static` |
| `VERBOSE` | unset | Stream the child processes' output |

### It reuses a dev server you already have

If something is already answering on `localhost:4200` (or on `APP_PORT`), the recorder
uses it instead of starting a second one. Which dev server it is does not matter: the app
is pointed at the mock API from *inside the browser*, through `window.RUNTIME_CONFIG`, so
any `ng serve` of this project will do. This saves a cold Angular build on every run.

## Requirements

| Need | How it is met |
|---|---|
| Node | 18+ |
| Chromium | `npx playwright install chromium` |
| ffmpeg | the `ffmpeg-static` npm package — **no system install**, and `ffprobe` is not used at all |
| TTS | Windows SAPI, built into the OS (see [Voice-over](#voice-over)) |

Verified on Windows 10 with Node 24, Playwright 1.56 and ffmpeg 6.0. The pipeline is
plain Node throughout — the shell scripts it used to carry were replaced because they
could not run here.

## Output

| File | What it is |
|---|---|
| `out/DiagnoCare-Tutorial.mp4` | The deliverable: 1920×1080, 16:9, H.264/AAC, chapters, two audio tracks, two subtitle tracks |
| `out/tutorial.en.srt` / `.vtt` | English subtitles |
| `out/tutorial.hi.srt` / `.vtt` | Hindi subtitles |
| `out/tutorial.bilingual.srt` | Both languages in one cue, for a single burned-in track |
| `out/timeline.json` | Every narration beat with the interval it occupied, plus chapters, console errors and any chapter that failed |

## Playing it in the app

`npm run install:app` copies the MP4 and the two `.vtt` files into
`Diagnocare-UI/src/assets/tutorial/`, where the in-app player reads them from:

- **`shared/tutorial-video/`** — a standalone component: one `<video>` in a full-screen
  overlay, with both caption tracks attached. It is a plain HTML5 player rather than a
  YouTube embed on purpose — the file ships with the application, so the tutorial works
  on a lab's LAN with no internet, and nothing about the signed-in session is handed to a
  third party.
- **Public home** (`login/home.component.*`, route `/home`) — the *Product walkthrough*
  section, between the stats bar and the features. This is the **only** entry point: it
  sits before sign-in, because the people who need it — someone evaluating the product,
  or a new member of lab staff on their first morning — do not have an account yet.

Nothing behind the login carries it. To offer it after sign-in as well, add
`<app-tutorial-video [open]="tutorialOpen" (closed)="tutorialOpen = false">` plus a
button to `pathology/home-dashboard/` — that is all it takes; the component is
self-contained and the caller owns the open/closed state.

The media is **not committed** (see `.gitignore` in the UI project): it is tens of
megabytes and is rebuilt from the recorder. When it is absent the player says so in a
sentence instead of showing a black rectangle, so a fresh checkout is a normal state
rather than a broken page.

Subtitles are attached as `<track>` elements because **no browser renders subtitles muxed
into an MP4** — the `mov_text` tracks in the file are for desktop players like VLC.

## How the two languages are handled

Each narration beat is written once, as `d.say(english, hindi)`, and held for the longer
of the two reading times. That single interval drives:

- the **on-screen caption bar**, which shows English above and Hindi below, so the video
  is bilingual as a picture, with no player support needed;
- both **subtitle tracks**, which therefore share identical timings and are
  interchangeable.

The host has no Devanagari system font, so `assets/noto-deva-400.woff2` is embedded into
the page as base64 at record time rather than being left to the browser's fallback.

## Voice-over

`post/make-voiceover.js` picks the best local engine it can find:

| Platform | Engine | Result |
|---|---|---|
| Windows, English | **SAPI** (`System.Speech`) | A real narration track. Part of the OS — nothing to install. |
| Windows, Hindi | — | Silent track; a default install has no `hi-IN` voice. |
| Linux/macOS | `piper`, else `espeak-ng`/`espeak` | `piper` with a `hi_IN` voice is the one worth using for Hindi; the formant synthesisers handle Devanagari badly. |
| Nothing found | — | A silent track of exactly the right length. |

SAPI is a concatenative engine and sounds like one. It is a real voice track, not a
stand-in, but swap in a neural engine for anything customer-facing — set `FFMPEG`-style
env vars or install `piper` and re-run `npm run build:video`; nothing else changes.

Either way the **mux downstream is identical**, because a silent track is still written
at the full recorded length. One clip is synthesised per narration beat and laid onto a
silent bed at that beat's own recorded start time, so speech stays aligned with the
picture however long each clip turns out to be.

## Writing or changing a chapter

Chapters live in `recorder/steps.js`, one object each, with a `meta` block that feeds the
generated storyboard and a `run(d, page)` that does the work. `d` is the driver from
`recorder/driver.js`: `say`, `click`, `type`, `select`, `navigate`, `focusOn`,
`clearFocus`, `scrollBy`, `titleCard`. It moves the pointer along an eased path before
every click and types at a human cadence, which is what keeps the output from looking
like a test run.

Selector rules this codebase forces — all learned by having them fail:

1. **The app runs the sidebar shell, not the old header.** `USE_SIDEBAR_SHELL` is `true`
   in `shared/simple/simple-ui.flags.ts`, so `app-header` and `.dc-nav` never render and
   `/pathology` serves `home-dashboard`, not `pathology-home`. `d.navigate(section, label)`
   drives the sidebar: it opens the section only if the link is not already showing,
   because the headings are toggles and pressing an open one closes it.
2. **Match a nav label exactly.** "Patients" is also inside "Patient Register", "Patient
   History Wise" and four other report names.
3. **Never match a button's accessible name exactly.** Font Awesome renders its glyph via
   `::before`, and accessible-name computation includes pseudo content, so the Add
   button's name is `"+ Add"` and Next's is `"Next ➜"`. Playwright's default substring
   match is correct; `exact: true` and anchored regexes find nothing. Scope to a
   container where a substring would be ambiguous (`.header-actions`).
4. **Use placeholders inside the Add dialog.** Its fields are wrapped in `dc-field`, which
   generates the `name` attribute (`dc-field-ge18tt3`), so there is no stable name or id.

Also worth knowing: **Register patient is in the top bar** (`.sh-topbar`), not on the
patient list. `<app-add-edit-modal>` has no box of its own and never reports as visible —
wait on something inside it. The gender radios are visually hidden behind styled
`label.radio-pill` elements, with `[value]` bound as a property, so an attribute selector
on the input matches nothing; click the label.

A failed chapter is not silent: the recorder prints it, records it in
`timeline.json.failures`, and exits non-zero.

## Scope and limits

- The walkthrough runs against `mock-api/`, not a live DiagnoCare backend. The demo
  patients and catalogue are invented; no real lab or patient data is involved.
- The mock implements only the endpoints the recorded chapters touch, **in the shapes the
  current components read** — `GetHomeSummary` returns `HomeSummary`, and `GetWorklist` is
  a GET whose `counts` is an array of `{ queue, count }`. Anything else answers with an
  empty, well-formed body so a stray screen renders its empty state rather than throwing.
- `scripts/probe.js` and `scripts/probe-modal.js` are diagnostics for writing selectors
  against the running app. They are not part of the build.
