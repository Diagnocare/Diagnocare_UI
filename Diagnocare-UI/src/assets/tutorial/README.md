# Product walkthrough — drop folder

`app-tutorial-video` (`src/app/shared/tutorial-video/`) plays the files in this
folder. It is opened from **Watch tutorial video** in the Product walkthrough section of
the public home page (`/home`), before sign-in.

| File | What it is |
|---|---|
| `DiagnoCare-Tutorial.mp4` | The walkthrough. 1920×1080, 16:9, H.264/AAC, English and Hindi audio tracks. |
| `tutorial.en.vtt` | English captions, attached as a `<track>`. |
| `tutorial.hi.vtt` | Hindi captions, attached as a `<track>`. |
| `tutorial.hi.m4a` | Hindi narration on its own. Optional — see below. |

## Why the Hindi narration is here twice

It is in the MP4 as a second, language-tagged audio track, and selecting that
track from a page needs `HTMLMediaElement.audioTracks`, which ships enabled in
Safari only. So the player switches language the way it can: in Safari through
that API, and everywhere else by playing `tutorial.hi.m4a` in step with the
picture while the video itself is muted.

The file is optional. Without it the player keeps both subtitle tracks and
disables its Hindi **audio** option, with a line in the menu saying so, rather
than offering a switch that silently mutes the tutorial.

The media is **not committed** — see the rules in `.gitignore`. Until something
puts it here, the player shows a short note saying the walkthrough has not been
added yet rather than a black rectangle. That is the expected state on a fresh
checkout, not a bug.

## How it gets here

**In a deployment**, it is downloaded. The *Tutorial video* workflow records and
encodes the walkthrough and attaches it to the `tutorial-latest` release; every
UI build then fetches those files into this folder before `ng build`. Nobody
copies anything by hand, and the recording — half an hour of playback and
encoding — stays out of the deploy path.

Each build path reaches it differently, which is why there are two entry points:

- **Vercel**, which builds UAT and production, runs it from the `postinstall`
  script in the UI’s `package.json`. `npm install` is the one step Vercel always
  runs regardless of how a project’s build command is configured, so nothing has
  to be set in the dashboard for a deployment to carry the walkthrough.
- **GitHub Actions** (DEV/QA) and the **Dockerfile** call `npm run ensure:tutorial`
  explicitly, one step before the build, so the fetch is visible in the log.

The script itself is `Diagnocare-UI/tools/ensure-tutorial.js`. It sits inside the
UI project rather than next to the recorder because Vercel builds from this
directory and does not carry anything above its Root Directory into the build.

If the download fails the build **continues** and the player falls back to its
note; a missing walkthrough must never block a release. Set `TUTORIAL_REQUIRED=1`
on an environment where the tutorial is part of what is being signed off, and the
step becomes fatal instead.

**Locally**, build it yourself:

```bash
cd ../../../../tutorial     # Diagnocare_UI/tutorial
npm install
npm run all                 # record → encode → copy into this folder
```

`ensure:tutorial` leaves an existing file alone, so a locally built video is
never overwritten by the published one.

## Serving it from somewhere else

For a deployment that would rather not ship tens of megabytes with the bundle,
point the player at a URL instead — the inputs are plain strings:

```html
<app-tutorial-video [open]="tutorialOpen"
                    src="https://cdn.example.com/diagnocare-tutorial.mp4"
                    (closed)="tutorialOpen = false"></app-tutorial-video>
```

Subtitles are `<track>` elements, so a cross-origin host must send
`Access-Control-Allow-Origin` or the captions are dropped while the video
still plays.
