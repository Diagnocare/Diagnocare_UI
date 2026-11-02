'use strict';

/**
 * Copies the finished walkthrough into the application, where the in-app
 * player reads it from.
 *
 *   out/DiagnoCare-Tutorial.mp4  ──▶  Diagnocare-UI/src/assets/tutorial/
 *   out/tutorial.en.vtt
 *   out/tutorial.hi.vtt
 *   out/tutorial.hi.m4a
 *
 * The player (shared/tutorial-video/) points at assets/tutorial/ and shows a
 * short "not built yet" note when the files are absent, so running this is what
 * turns the Watch tutorial video button on the public home page from an
 * explanation into a video.
 *
 * The .m4a is the Hindi narration on its own, which is how the player's audio
 * switch works in every browser but Safari — the rest cannot select the second
 * audio track inside the MP4. Without it the player still plays, with Hindi
 * subtitles and its Hindi *audio* option disabled.
 *
 * Only these four files are copied, and only into that one folder: the .srt
 * sidecars are for desktop players rather than browsers, and nothing else in
 * out/ belongs in the bundle.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out');
const ASSETS = path.join(ROOT, '..', 'Diagnocare-UI', 'src', 'assets', 'tutorial');

const FILES = ['DiagnoCare-Tutorial.mp4', 'tutorial.en.vtt', 'tutorial.hi.vtt'];

/**
 * Copied when it is there, not insisted on. The player works without it — it
 * disables its Hindi audio option and says so — and an out/ built before that
 * file existed should still install rather than fail.
 */
const OPTIONAL = ['tutorial.hi.m4a'];

function main() {
  const missing = FILES.filter(name => !fs.existsSync(path.join(OUT, name)));
  if (missing.length) {
    process.stderr.write(
      `missing in out/: ${missing.join(', ')}\n` +
      "run 'npm run all' first\n",
    );
    process.exit(1);
  }

  fs.mkdirSync(ASSETS, { recursive: true });

  const present = [...FILES, ...OPTIONAL.filter(name => fs.existsSync(path.join(OUT, name)))];

  for (const name of present) {
    const from = path.join(OUT, name);
    const to = path.join(ASSETS, name);
    fs.copyFileSync(from, to);
    const megabytes = fs.statSync(to).size / (1024 * 1024);
    process.stdout.write(`  ${name}  ${megabytes.toFixed(1)} MB\n`);
  }

  // An optional file that is no longer built must also be *removed* from the
  // app, not merely skipped: a Hindi sidecar left behind by an earlier build is
  // a narration option that plays silence, which is the thing the build just
  // decided not to ship.
  for (const name of OPTIONAL.filter(file => !present.includes(file))) {
    const stale = path.join(ASSETS, name);
    if (fs.existsSync(stale)) {
      fs.rmSync(stale);
      process.stdout.write(`  ${name}  not in out/ — removed the stale copy\n`);
    } else {
      process.stdout.write(`  ${name}  not in out/ — skipped\n`);
    }
  }

  process.stdout.write(`\ninstalled into ${ASSETS}\n`);
  process.stdout.write('the Watch tutorial video button on the public home page (/home) now plays it.\n');
}

main();
