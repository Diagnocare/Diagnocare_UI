'use strict';

/**
 * Builds the subtitle files from out/timeline.json.
 *
 * The timings are the ones the recorder actually held each caption for, not an estimate
 * from word counts — so the subtitles cannot drift from the video. English and Hindi
 * share one set of intervals, which is what makes the two tracks interchangeable.
 *
 * Writes, into out/:
 *   tutorial.en.srt / .vtt
 *   tutorial.hi.srt / .vtt
 *   tutorial.bilingual.srt   both languages in one cue, for a single burned-in track
 *   chapters.txt             ffmpeg metadata for chapter markers
 */

const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, '..', 'out');

function stamp(ms, sep) {
  const t = Math.max(0, Math.round(ms));
  const h = String(Math.floor(t / 3600000)).padStart(2, '0');
  const m = String(Math.floor(t / 60000) % 60).padStart(2, '0');
  const s = String(Math.floor(t / 1000) % 60).padStart(2, '0');
  const f = String(t % 1000).padStart(3, '0');
  return `${h}:${m}:${s}${sep}${f}`;
}

/**
 * Wraps a caption to at most two lines, breaking at the space nearest the middle.
 * A single long line gets clipped by most players; two balanced ones do not.
 */
function wrap(text, maxChars = 74) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;

  const mid = Math.floor(clean.length / 2);
  let best = -1;
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] === ' ' && (best === -1 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  if (best === -1) return clean;
  return `${clean.slice(0, best)}\n${clean.slice(best + 1)}`;
}

function toSrt(cues) {
  return cues.map((c, i) =>
    `${i + 1}\n${stamp(c.startMs, ',')} --> ${stamp(c.endMs, ',')}\n${c.text}\n`,
  ).join('\n');
}

function toVtt(cues) {
  return `WEBVTT\n\n${cues.map((c, i) =>
    `${i + 1}\n${stamp(c.startMs, '.')} --> ${stamp(c.endMs, '.')}\n${c.text}\n`,
  ).join('\n')}`;
}

function main() {
  const timelinePath = path.join(OUT, 'timeline.json');
  if (!fs.existsSync(timelinePath)) {
    process.stderr.write('no out/timeline.json — run `npm run record` first\n');
    process.exit(1);
  }
  const timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));

  const lines = timeline.lines.filter(l => l.en || l.hi);
  // A cue that butts against the next one reads as a flicker; hold a small gap.
  const GAP = 80;
  const cue = (l, text) => ({
    startMs: l.startMs,
    endMs: Math.max(l.startMs + 700, l.endMs - GAP),
    text,
  });

  const en = lines.filter(l => l.en).map(l => cue(l, wrap(l.en)));
  const hi = lines.filter(l => l.hi).map(l => cue(l, wrap(l.hi, 58)));
  const both = lines.map(l => cue(l, `${wrap(l.en)}\n${wrap(l.hi, 58)}`));

  const files = {
    'tutorial.en.srt': toSrt(en),
    'tutorial.en.vtt': toVtt(en),
    'tutorial.hi.srt': toSrt(hi),
    'tutorial.hi.vtt': toVtt(hi),
    'tutorial.bilingual.srt': toSrt(both),
  };

  // Chapter markers, in the format `ffmpeg -i FFMETADATA` expects.
  const chapters = [';FFMETADATA1'];
  for (const s of timeline.sections) {
    chapters.push('[CHAPTER]', 'TIMEBASE=1/1000',
      `START=${Math.round(s.startMs)}`, `END=${Math.round(s.endMs)}`, `title=${s.title}`);
  }
  files['chapters.txt'] = `${chapters.join('\n')}\n`;

  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(OUT, name), body, 'utf8');
  }

  process.stdout.write(
    `subtitles written to out/\n  english cues: ${en.length}\n  hindi cues:   ${hi.length}\n` +
    `  chapters:     ${timeline.sections.length}\n`,
  );
  if (en.length !== hi.length) {
    process.stdout.write(`  note: ${en.length - hi.length} beat(s) have no Hindi line\n`);
  }
}

main();
