'use strict';

/**
 * Finds an ffmpeg to run, and runs it.
 *
 * Order: $FFMPEG, then the `ffmpeg-static` package, then whatever is on PATH.
 * The static package is what makes this work on a machine with no system
 * ffmpeg — the usual case on Windows — without asking anybody to install one.
 *
 * ffprobe is deliberately not used anywhere in this pipeline: `ffmpeg-static`
 * ships only ffmpeg, and everything the build reports can be read from ffmpeg's
 * own output, so requiring a second binary would add a dependency that buys
 * nothing.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

function resolve() {
  if (process.env.FFMPEG && fs.existsSync(process.env.FFMPEG)) return process.env.FFMPEG;

  try {
    const fromPackage = require('ffmpeg-static');
    if (fromPackage && fs.existsSync(fromPackage)) return fromPackage;
  } catch {
    /* Not installed — fall through to PATH. */
  }

  const probe = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore', shell: process.platform === 'win32' });
  if (probe.status === 0) return 'ffmpeg';

  throw new Error(
    'no ffmpeg found. Run `npm install` in tutorial/ (it brings ffmpeg-static), ' +
    'or set FFMPEG to the path of an ffmpeg binary.',
  );
}

const FFMPEG = resolve();

/**
 * Runs ffmpeg and throws with its stderr if it fails.
 *
 * ffmpeg writes everything to stderr, including ordinary progress, so the
 * output is only surfaced when the exit code says something actually went
 * wrong — otherwise every successful call would look like an error.
 */
function run(args, { quiet = true } = {}) {
  const result = spawnSync(FFMPEG, ['-nostdin', '-y', ...args], {
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const tail = (result.stderr || '').trim().split('\n').slice(-20).join('\n');
    throw new Error(`ffmpeg exited with ${result.status}\n${tail}`);
  }
  return result.stderr || '';
}

module.exports = { FFMPEG, run };
