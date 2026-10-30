'use strict';

/**
 * Phase 9 — turns the raw Playwright capture into the deliverable.
 *
 *   out/*.webm  ──▶  out/DiagnoCare-Tutorial.mp4
 *                     out/tutorial.hi.m4a
 *
 * 1920x1080, 16:9, H.264 + AAC, with:
 *   • chapter markers for the eight sections,
 *   • two selectable subtitle tracks, English and Hindi, language-tagged,
 *   • one audio track per language that a voice was actually found for.
 *
 * The picture carries no captions of its own — see the note at the top of
 * recorder/overlay.js — so these subtitle tracks are the only text, and the
 * player's subtitle menu genuinely chooses between them.
 *
 * The Hindi narration is also written out on its own, as tutorial.hi.m4a.
 * That is not a duplicate for its own sake: `audioTracks` — the only way to
 * select the MP4's second audio track from a page — ships enabled in Safari
 * alone, so in Chrome, Edge and Firefox the in-app player switches language
 * by playing this file in step with the picture instead. See the audio notes
 * in shared/tutorial-video/tutorial-video.component.ts.
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
const HINDI_AUDIO = path.join(OUT, 'tutorial.hi.m4a');

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

/**
 * Did make-voiceover.js actually find a voice for this language?
 *
 * An out/ built before these reports existed has no file to read; such a build
 * is treated as having speech, which is what it always assumed.
 */
function hasSpeech(lang) {
  const file = path.join(OUT, `voice.${lang}.json`);
  if (!fs.existsSync(file)) return true;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).speech !== false;
  } catch {
    return true;
  }
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

  // A language whose voice-over came out silent is left out of the MP4 entirely.
  // Shipping it would put a narration language in the player's menu that selects
  // silence — which is how a missing voice turns into a bug report about the
  // language switch not working.
  const hindiNarration = hasSpeech('hi');
  if (!hindiNarration) {
    process.stdout.write(
      '\nhindi narration is silent — leaving the Hindi audio track out of the MP4.\n' +
      'the player will show its Hindi audio option as unavailable; Hindi subtitles are unaffected.\n',
    );
  }

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
    // Input 2 (the Hindi voice) stays on the command line even when it is not
    // mapped, so the inputs that follow keep the indices 4 and 5 the subtitle
    // maps below refer to.
    '-map', '0:v:0', '-map', '1:a:0',
    ...(hindiNarration ? ['-map', '2:a:0'] : []),
    '-map', '4', '-map', '5',
    '-map_metadata', '3',
    '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,' +
           'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=#071326,setsar=1,fps=30',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '160k',
    '-c:s', 'mov_text',
    '-metadata:s:a:0', 'language=eng', '-metadata:s:a:0', 'title=English narration',
    ...(hindiNarration
      ? ['-metadata:s:a:1', 'language=hin', '-metadata:s:a:1', 'title=Hindi narration']
      : []),
    '-metadata:s:s:0', 'language=eng', '-metadata:s:s:0', 'title=English',
    '-metadata:s:s:1', 'language=hin', '-metadata:s:s:1', 'title=हिन्दी',
    '-metadata', 'title=DiagnoCare — Product Tutorial',
    FINAL,
  ], { quiet: false });

  // The same Hindi narration again, on its own, for the player's language
  // switch in the browsers that cannot select the MP4's second audio track.
  // Audio only and faststart, so switching language mid-video starts playing
  // from the first range the browser fetches rather than after the whole file.
  if (hindiNarration) {
    process.stdout.write('\n→ Hindi narration as a separate track\n');
    run([
      '-loglevel', 'error', '-stats', '-stats_period', '20',
      '-i', path.join(OUT, 'voice.hi.wav'),
      '-vn', '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      '-metadata', 'language=hin',
      '-metadata', 'title=DiagnoCare — Hindi narration',
      HINDI_AUDIO,
    ], { quiet: false });
  } else if (fs.existsSync(HINDI_AUDIO)) {
    // A sidecar left over from a build that did have a Hindi voice would be
    // installed into the app and played as silence. Take it with the track.
    fs.rmSync(HINDI_AUDIO);
    process.stdout.write('\nremoved the stale Hindi audio sidecar from out/.\n');
  }

  const seconds = durationOf(FINAL);
  const megabytes = fs.statSync(FINAL).size / (1024 * 1024);

  process.stdout.write('\n── built ──\n');
  process.stdout.write(`video:     ${FINAL}\n`);
  if (seconds) {
    const mins = Math.floor(seconds / 60);
    process.stdout.write(`duration:  ${mins}m ${Math.round(seconds % 60)}s\n`);
  }
  process.stdout.write(`size:      ${megabytes.toFixed(1)} MB\n`);
  process.stdout.write(
    'hindi:     ' +
    (hindiNarration
      ? `${HINDI_AUDIO}  ${(fs.statSync(HINDI_AUDIO).size / (1024 * 1024)).toFixed(1)} MB\n`
      : 'no voice installed — subtitles only, no Hindi audio track\n'),
  );
  process.stdout.write('subtitles: out/tutorial.en.srt  out/tutorial.hi.srt (+ .vtt, + bilingual)\n');
}

main();
