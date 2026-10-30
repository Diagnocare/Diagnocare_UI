'use strict';

/**
 * Builds a voice-over track per language from out/timeline.json.
 *
 *   usage: node post/make-voiceover.js [en|hi]
 *
 * Phase 7 of the brief: use a local TTS engine if one is available, otherwise
 * leave the narration as text and keep the project ready for a voice later.
 * This script is that switch, and it produces a track of exactly the recorded
 * length either way — so the mux downstream is identical whether or not a voice
 * was found, and adding one is a drop-in rather than a rebuild.
 *
 * ENGINES
 * ───────
 * On Windows, SAPI (System.Speech) is part of the OS and always present, so
 * English narration is synthesised with no install at all. It is a concatenative
 * engine and sounds like one; it is a real voice track, not a stand-in, but a
 * neural engine is worth swapping in for anything customer-facing.
 *
 * Hindi has no SAPI voice on a default Windows install, so the Hindi track is
 * silent unless a hi-IN voice has been added or piper is available. The Hindi
 * narration still ships as on-screen captions and as a subtitle track, which is
 * how the video is bilingual as a picture.
 *
 * ALIGNMENT
 * ─────────
 * One clip per narration beat, laid onto a silent bed at that beat's own
 * recorded start time. Speech therefore stays aligned with the picture however
 * long each clip turns out to be — a clip that overruns its caption is allowed
 * to, rather than dragging everything after it out of sync.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { run } = require('./ffmpeg-bin.js');

const OUT = path.join(__dirname, '..', 'out');
const LANG = (process.argv[2] || 'en') === 'hi' ? 'hi' : 'en';
const TARGET = path.join(OUT, `voice.${LANG}.wav`);

/** A voice name, or a substring of one. SAPI ships David and Zira on en-US. */
const SAPI_VOICE = process.env.SAPI_VOICE || 'Zira';
/**
 * SAPI rate, -10…10. The driver paces captions at 150 wpm and SAPI's default
 * sits above that, so it is nudged down to keep speech inside its own caption.
 */
const SAPI_RATE = Number(process.env.SAPI_RATE ?? -1);

/**
 * Is this command on PATH?
 *
 * Asks the OS's own lookup (`where` / `which`) rather than running the command
 * with --version: spawning with shell:true to find a .cmd would mean passing
 * arguments through a shell, which Node now warns about, and some of these
 * engines do not accept --version anyway.
 */
function has(command) {
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(lookup, [command], { stdio: 'ignore' }).status === 0;
}

/** Writes a silent track of the right length, and says why. */
function silent(seconds, why) {
  process.stdout.write(`${why}\n`);
  process.stdout.write(
    `writing a silent ${seconds.toFixed(3)}s track so the video still muxes; the ` +
    `narration ships as out/tutorial.${LANG}.srt and as on-screen captions.\n`,
  );
  run([
    '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-t', seconds.toFixed(3), '-c:a', 'pcm_s16le', TARGET,
  ]);
  process.stdout.write(`wrote ${path.relative(process.cwd(), TARGET)} (silent)\n`);
}

/**
 * Synthesises every line in one PowerShell process.
 *
 * One process for the whole set rather than one per line: starting PowerShell
 * costs the better part of a second, and a fifty-beat script would spend most
 * of its time launching interpreters.
 */
function speakWithSapi(rows, workDir) {
  const manifest = path.join(workDir, 'lines.json');
  fs.writeFileSync(manifest, JSON.stringify(rows.map((r, i) => ({ i, text: r.text }))), 'utf8');

  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$wanted = '${SAPI_VOICE.replace(/'/g, "''")}'
$voice = $synth.GetInstalledVoices() |
  Where-Object { $_.VoiceInfo.Name -like "*$wanted*" } |
  Select-Object -First 1
if ($voice) { $synth.SelectVoice($voice.VoiceInfo.Name) }
$synth.Rate = ${Math.round(SAPI_RATE)}
Write-Output ("voice: " + $synth.Voice.Name)
$rows = Get-Content -Raw -Encoding UTF8 '${manifest.replace(/'/g, "''")}' | ConvertFrom-Json
foreach ($row in $rows) {
  $file = Join-Path '${workDir.replace(/'/g, "''")}' ("line-" + $row.i + ".wav")
  $synth.SetOutputToWaveFile($file)
  $synth.Speak($row.text)
}
$synth.SetOutputToNull()
$synth.Dispose()
`;

  const scriptPath = path.join(workDir, 'speak.ps1');
  fs.writeFileSync(scriptPath, script, 'utf8');

  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );

  if (result.status !== 0) {
    throw new Error(`SAPI failed: ${(result.stderr || '').trim().split('\n').slice(-6).join('\n')}`);
  }
  process.stdout.write(`${(result.stdout || '').trim()}\n`);
}

/** piper / espeak-ng / espeak, one process per line. Used off Windows. */
function speakWithUnixEngine(engine, rows, workDir) {
  for (const row of rows) {
    const textFile = path.join(workDir, `line-${row.i}.txt`);
    const wavFile = path.join(workDir, `line-${row.i}.wav`);
    fs.writeFileSync(textFile, row.text, 'utf8');

    let args;
    if (engine === 'piper') {
      if (!process.env.PIPER_VOICE) throw new Error('set PIPER_VOICE to a .onnx voice model path');
      args = ['--model', process.env.PIPER_VOICE, '--output_file', wavFile];
      spawnSync(engine, args, { input: row.text, stdio: ['pipe', 'ignore', 'inherit'] });
      continue;
    }
    args = ['-v', LANG === 'hi' ? 'hi' : 'en-us', '-s', '150', '-w', wavFile, '-f', textFile];
    spawnSync(engine, args, { stdio: 'ignore' });
  }
}

/**
 * Lays every clip onto a silent bed at its recorded start time.
 *
 * Each clip is forced to the bed's rate and layout before it is delayed:
 * SAPI writes whatever the voice's native format is, and amix refuses inputs
 * that disagree.
 */
function mix(rows, workDir, seconds) {
  const present = rows.filter(r => {
    const file = path.join(workDir, `line-${r.i}.wav`);
    return fs.existsSync(file) && fs.statSync(file).size > 1024;
  });

  if (present.length === 0) {
    silent(seconds, 'the engine produced no audio.');
    return 0;
  }

  const inputs = ['-f', 'lavfi', '-t', seconds.toFixed(3), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000'];
  for (const row of present) inputs.push('-i', path.join(workDir, `line-${row.i}.wav`));

  const chains = present.map((row, n) =>
    `[${n + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,` +
    `adelay=${Math.round(row.start)}|${Math.round(row.start)}[d${n}]`);
  // The silent bed goes FIRST, because `duration=first` takes the output length
  // from amix's first input. With the bed last, the track was truncated to the
  // first narration clip — a 15-minute video got 7 seconds of audio and then
  // silence, which reads as the video having frozen.
  const mixInputs = '[0:a]' + present.map((_, n) => `[d${n}]`).join('');
  const filter =
    `${chains.join(';')};${mixInputs}amix=inputs=${present.length + 1}:normalize=0:duration=first[out]`;

  run([
    '-loglevel', 'error',
    ...inputs,
    '-filter_complex', filter,
    '-map', '[out]', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le',
    TARGET,
  ]);
  return present.length;
}

function main() {
  const timelinePath = path.join(OUT, 'timeline.json');
  if (!fs.existsSync(timelinePath)) {
    process.stderr.write("no out/timeline.json — run 'npm run record' first\n");
    process.exit(1);
  }

  const timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
  const seconds = (timeline.durationMs || 0) / 1000;
  const rows = timeline.lines
    .filter(line => line[LANG])
    .map((line, i) => ({ i, start: line.startMs, text: line[LANG] }));

  if (rows.length === 0) {
    silent(seconds, `no ${LANG} narration in the timeline.`);
    return;
  }

  // Pick an engine. Windows always has SAPI, but only for the languages it has
  // a voice for — and a default install has none for Hindi.
  let engine = null;
  if (process.platform === 'win32' && LANG === 'en') engine = 'sapi';
  else if (has('piper')) engine = 'piper';
  else if (has('espeak-ng')) engine = 'espeak-ng';
  else if (has('espeak')) engine = 'espeak';

  if (!engine) {
    silent(seconds, `no local TTS engine for '${LANG}' (looked for SAPI, piper, espeak-ng, espeak).`);
    return;
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-tts-'));
  try {
    process.stdout.write(`synthesising ${rows.length} ${LANG} lines with ${engine}…\n`);
    if (engine === 'sapi') speakWithSapi(rows, workDir);
    else speakWithUnixEngine(engine, rows, workDir);

    const used = mix(rows, workDir, seconds);
    if (used) {
      process.stdout.write(`wrote ${path.relative(process.cwd(), TARGET)} (${used} clips)\n`);
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main();
