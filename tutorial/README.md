# DiagnoCare — automated product tutorial

Records a narrated, bilingual (English + हिन्दी) product walkthrough of the DiagnoCare UI
by driving the real application in a browser, and post-processes it into a 1080p MP4 with
chapter markers and selectable subtitle tracks.

**Nothing under `Diagnocare-UI/` is modified.** Everything here is additive.

```
tutorial/
├── plan/
│   ├── app-analysis.md       Phase 1 — what the app is, how it is built, how it runs
│   ├── recording-approach.md Phase 2 — how it is run for recording, and what was rejected
│   └── storyboard.md         Phase 3 — GENERATED from the recorder; never edit by hand
├── mock-api/                 zero-dependency stand-in for the .NET API
├── recorder/                 Playwright driver, overlay, bilingual script
├── post/                     subtitles, voice-over, final encode
├── assets/                   embedded Devanagari webfont
└── out/                      artifacts (video, subtitles, timeline)
```

## Quick start

```bash
cd tutorial && npm run all
```

That starts the mock API and `ng serve`, records the walkthrough, and builds the MP4.
Expect roughly fifteen minutes: a cold Angular dev-server build, then a ten-minute
recording in real time, then the encode.

Individual steps:

```bash
npm run record        # mock API + ng serve + record  → out/*.webm, out/timeline.json
```

```bash
npm run build:video   # subtitles + voice-over + encode → out/DiagnoCare-Tutorial.mp4
```

```bash
npm run storyboard    # regenerate plan/storyboard.md from recorder/steps.js
```

Useful environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `ONLY` | all | Record only some chapters: `ONLY=login,catalogue` |
| `SPEED` | `1` | Playback multiplier. `SPEED=4` is for iterating on selectors, not for a deliverable |
| `APP_PORT` | `4299` | Port for `ng serve` |
| `MOCK_API_PORT` | `5099` | Port for the mock API |
| `VERBOSE` | unset | Stream the child processes' output |

## Output

| File | What it is |
|---|---|
| `out/DiagnoCare-Tutorial.mp4` | The deliverable: 1920×1080, 16:9, H.264/AAC, chapters, two subtitle tracks |
| `out/tutorial.en.srt` / `.vtt` | English subtitles |
| `out/tutorial.hi.srt` / `.vtt` | Hindi subtitles |
| `out/tutorial.bilingual.srt` | Both languages in one cue, for a single burned-in track |
| `out/timeline.json` | Every narration beat with the interval it occupied, plus chapters, console errors and any chapter that failed |

## How the two languages are handled

Each narration beat is written once, as `d.say(english, hindi)`, and held for the longer
of the two reading times. That single interval drives:

- the **on-screen caption bar**, which shows English above and Hindi below, so the video
  is bilingual as a picture, with no player support needed;
- both **subtitle tracks**, which therefore share identical timings and are
  interchangeable.

This container has no Devanagari system font, so `assets/noto-deva-400.woff2` is embedded
into the page as base64 at record time rather than being left to the browser's fallback.

## Voice-over

`post/make-voiceover.sh` looks for `piper`, `espeak-ng`, `espeak` or `flite`. **None of
them is available in this container**, and none is installable from the package sources
here, so the build currently produces a silent audio track of exactly the right length
and the narration ships as text (subtitles, on-screen captions, storyboard).

The pipeline is shaped so adding a voice later is a drop-in, not a rebuild: install an
engine (for Hindi, `piper` with a `hi_IN` voice is the one worth using — the formant
synthesisers handle Devanagari badly) and re-run `npm run build:video`. The script
synthesises one clip per beat and lays each onto a silent bed at its own recorded start
time, so speech stays aligned with the picture however long each clip turns out to be.

## Writing or changing a chapter

Chapters live in `recorder/steps.js`, one object each, with a `meta` block that feeds the
generated storyboard and a `run(d, page)` that does the work. `d` is the driver from
`recorder/driver.js`: `say`, `click`, `type`, `select`, `navigate`, `focusOn`,
`clearFocus`, `scrollBy`, `titleCard`. It moves the pointer along an eased path before
every click and types at a human cadence, which is what keeps the output from looking
like a test run.

Two selector rules this codebase forces — both learned by having them fail:

1. **Never match a button's accessible name exactly.** Font Awesome renders its glyph via
   `::before`, and accessible-name computation includes pseudo content, so the Add
   button's name is `"+ Add"` and Next's is `"Next ➜"`. Playwright's default substring
   match is correct; `exact: true` and anchored regexes find nothing. Scope to a
   container where a substring would be ambiguous (`Add` vs `Add New Patient`).
2. **Use placeholders inside the Add dialog.** Its fields are wrapped in `dc-field`, which
   generates the `name` attribute (`dc-field-ge18tt3`), so there is no stable name or id.

Also worth knowing: `<app-add-edit-modal>` has no box of its own and never reports as
visible — wait on something inside it. And the gender radios are visually hidden behind
styled `label.radio-pill` elements, with `[value]` bound as a property, so an attribute
selector on the input matches nothing; click the label.

A failed chapter is not silent: the recorder prints it, records it in
`timeline.json.failures`, and exits non-zero.

## Scope and limits

- The walkthrough runs against `mock-api/`, not a live DiagnoCare backend. The demo
  patients and catalogue are invented; no real lab or patient data is involved.
- The mock implements only the endpoints the recorded chapters touch. Anything else
  answers with an empty, well-formed body so a stray screen renders its empty state
  rather than throwing.
- `scripts/probe.js` and `scripts/probe-modal.js` are diagnostics for writing selectors
  against the running app. They are not part of the build.
