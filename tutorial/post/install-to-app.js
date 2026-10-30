'use strict';

/**
 * Copies the finished walkthrough into the application, where the in-app
 * player reads it from.
 *
 *   out/DiagnoCare-Tutorial.mp4  ──▶  Diagnocare-UI/src/assets/tutorial/
 *   out/tutorial.en.vtt
 *   out/tutorial.hi.vtt
 *
 * The player (shared/tutorial-video/) points at assets/tutorial/ and shows a
 * short "not built yet" note when the files are absent, so running this is what
 * turns the Watch tutorial video button on the public home page from an
 * explanation into a video.
 *
 * Only these three files are copied, and only into that one folder: the .srt
 * sidecars are for desktop players rather than browsers, and nothing else in
 * out/ belongs in the bundle.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out');
const ASSETS = path.join(ROOT, '..', 'Diagnocare-UI', 'src', 'assets', 'tutorial');

const FILES = ['DiagnoCare-Tutorial.mp4', 'tutorial.en.vtt', 'tutorial.hi.vtt'];

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

  for (const name of FILES) {
    const from = path.join(OUT, name);
    const to = path.join(ASSETS, name);
    fs.copyFileSync(from, to);
    const megabytes = fs.statSync(to).size / (1024 * 1024);
    process.stdout.write(`  ${name}  ${megabytes.toFixed(1)} MB\n`);
  }

  process.stdout.write(`\ninstalled into ${ASSETS}\n`);
  process.stdout.write('the Watch tutorial video button on the public home page (/home) now plays it.\n');
}

main();
