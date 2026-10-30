'use strict';

/**
 * Phase 9 — turns the raw Playwright capture into the deliverable.
 *
 *   out/*.webm  ──▶  out/DiagnoCare-Tutorial.mp4
 *
 * 1920x1080, 16:9, H.264 + AAC, with:
 *   • chapter markers for the eight sections,
 *   • two selectable subtitle tracks, English and Hindi, language-tagged,
 *   • an audio track per language (narration where a TTS engine was available,
 *     silence of the right length where it was not).
 *
 * The captions a viewer sees by default are already in the picture — the
 * recorder draws them in the page in both languages — so the subtitle tracks
 * are for players and for accessibility, not a second copy burned on top.
 *
 * Replaces the earlier build-video.sh: this runs the same way on Windows, and
 * it resolves ffmpeg through ffmpeg-static rather than requiring one on PATH.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { run } = require('./ffmpeg-bin.js');

const HERE = __dirname;
const ROOT = path.join(HERE, '..');
const OUT = path.join(ROOT, 'out');
const FINAL = path.join(OUT, 'DiagnoCare-Tutorial.mp4');

function node(script, args = []) {
  const result = spawnSync(process.execPath, [path.join(HERE, script), ...args], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/** The newest capture in out/. Playwright names each one after the page. */
function newestCapture() {
  const webm = fs.readdirSync(OUT)
    .filter(name => name.endsWith('.webm'))
    .map(name => ({ name, at: fs.statSync(path.join(OUT, name)).mtimeMs }))
    .sort((a, b) => b.at - a.at);
  return webm.length ? path.join(OUT, webm[0].name) : null;
}

/** Duration in seconds, read out of ffmpeg's own report — no ffprobe needed. */
function durationOf(file) {
  const stderr = run(['-i', file, '-f', 'null', '-'], { quiet: true });
  const match = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(stderr);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function main() {
  if (!fs.existsSync(path.join(OUT, 'timeline.json'))) {
    process.stderr.write("no out/timeline.json — run 'npm run record' first\n");
    process.exit(1);
  }

  const raw = newestCapture();
  if (!raw) {
    process.stderr.write("no .webm in out/ — run 'npm run record' first\n");
    process.exit(1);
  }
  process.stdout.write(`source: ${path.basename(raw)}\n`);

  process.stdout.write('\n→ subtitles and chapters\n');
  node('make-subtitles.js');

  process.stdout.write('\n→ voice-over\n');
  node('make-voiceover.js', ['en']);
  node('make-voiceover.js', ['hi']);

  process.stdout.write('\n→ encoding 1080p H.264\n');
  // scale+pad rather than a bare scale: this guarantees exactly 1920x1080 and
  // 16:9 even if the capture came back a few pixels off, instead of silently
  // changing the aspect ratio.
  run([
    // A progress line every 20 seconds rather than several per second: the
    // default -stats cadence buries everything else in the build log.
    '-loglevel', 'error', '-stats', '-stats_period', '20',
    '-i', raw,
    '-i', path.join(OUT, 'voice.en.wav'),
    '-i', path.join(OUT, 'voice.hi.wav'),
    '-f', 'ffmetadata', '-i', path.join(OUT, 'chapters.txt'),
    '-i', path.join(OUT, 'tutorial.en.srt'),
    '-i', path.join(OUT, 'tutorial.hi.srt'),
    '-map', '0:v:0', '-map', '1:a:0', '-map', '2:a:0', '-map', '4', '-map', '5',
    '-map_metadata', '3',
    '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,' +
           'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=#071326,setsar=1,fps=30',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '160k',
    '-c:s', 'mov_text',
    '-metadata:s:a:0', 'language=eng', '-metadata:s:a:0', 'title=English narration',
    '-metadata:s:a:1', 'language=hin', '-metadata:s:a:1', 'title=Hindi narration',
    '-metadata:s:s:0', 'language=eng', '-metadata:s:s:0', 'title=English',
    '-metadata:s:s:1', 'language=hin', '-metadata:s:s:1', 'title=हिन्दी',
    '-metadata', 'title=DiagnoCare — Product Tutorial',
    FINAL,
  ], { quiet: false });

  const seconds = durationOf(FINAL);
  const megabytes = fs.statSync(FINAL).size / (1024 * 1024);

  process.stdout.write('\n── built ──\n');
  process.stdout.write(`video:     ${FINAL}\n`);
  if (seconds) {
    const mins = Math.floor(seconds / 60);
    process.stdout.write(`duration:  ${mins}m ${Math.round(seconds % 60)}s\n`);
  }
  process.stdout.write(`size:      ${megabytes.toFixed(1)} MB\n`);
  process.stdout.write('subtitles: out/tutorial.en.srt  out/tutorial.hi.srt (+ .vtt, + bilingual)\n');
}

main();
