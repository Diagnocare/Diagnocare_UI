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

The media is **not committed** — see the rules in `.gitignore`. It is built from
the recorder and copied here:

```bash
cd ../../../../tutorial     # Diagnocare_UI/tutorial
npm install
npm run all                 # record, then build the MP4
npm run install:app         # copy the MP4 + .vtt into this folder
```

Until that has been run, the player shows a short note saying the walkthrough
has not been added yet rather than a black rectangle. That is the expected state
on a fresh checkout, not a bug.

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
