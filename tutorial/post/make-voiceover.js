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
 * On Windows, SAPI (System.Speech) is part of the OS, so narration is synthesised
 * with no install at all — for the languages SAPI actually has a voice for. It is
 * a concatenative engine and sounds like one; it is a real voice track, not a
 * stand-in, but a neural engine is worth swapping in for anything customer-facing.
 *
 * The voice is chosen by looking at what is *installed* for the language rather
 * than by assuming English, so adding a hi-IN voice in Windows Settings is all it
 * takes for Hindi narration to start being produced — no change here.
 *
 * AZURE, FOR THE LANGUAGES WINDOWS HAS NO VOICE FOR
 * ─────────────────────────────────────────────────
 * A default Windows install has no Hindi voice, and no offline engine here does
 * either, so Hindi is synthesised through Azure's Text-to-Speech REST API when
 * `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` are set. **This sends the narration
 * script to Microsoft** — it is the one step in this pipeline that leaves the
 * machine, it is announced on stdout when it happens, and it does nothing at all
 * without a key. `TTS_ENGINE=azure` uses it for every language; left unset, a
 * language keeps its local voice and only the ones without reach the network.
 *
 * Azure's documented, keyed API rather than the Edge read-aloud endpoint that
 * `edge-tts` and friends use: that one is a consumer service fronted by an
 * anti-abuse token, and working around the token to drive it from a build script
 * is not something to put in a repository. The free tier covers this comfortably
 * — the whole script is about eight thousand characters.
 *
 * With no key and no local voice the track comes out silent, which is reported
 * rather than hidden: `out/voice.<lang>.json` records whether the track holds
 * speech, and build-video.js leaves a silent language out of the MP4 altogether —
 * so the player offers a narration language only when choosing it would actually
 * be heard. Hindi still ships as a subtitle track either way.
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
/** What the mux downstream reads to find out whether this track holds speech. */
const REPORT = path.join(OUT, `voice.${LANG}.json`);

/** A voice name, or a substring of one. SAPI ships David and Zira on en-US. */
const SAPI_VOICE = process.env.SAPI_VOICE || 'Zira';
/**
 * SAPI rate, -10…10. The driver paces captions at 150 wpm and SAPI's default
 * sits above that, so it is nudged down to keep speech inside its own caption.
 */
const SAPI_RATE = Number(process.env.SAPI_RATE ?? -1);

/** Azure Text-to-Speech. Nothing reaches the network unless the key is set. */
const AZURE_KEY = process.env.AZURE_SPEECH_KEY || '';
const AZURE_REGION = process.env.AZURE_SPEECH_REGION || '';
/** Neural voices, overridable per language with e.g. AZURE_VOICE_HI. */
const AZURE_VOICES = { en: 'en-US-AriaNeural', hi: 'hi-IN-SwaraNeural' };
/**
 * The free tier allows twenty neural requests a minute and answers 429 past
 * that. One clip per narration beat means fifty-odd requests, so they are paced
 * rather than fired off together — a paid tier simply never hits the pause.
 */
const AZURE_GAP_MS = Number(process.env.AZURE_GAP_MS ?? 3100);

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

/**
 * Records what this run produced, for build-video.js to read.
 *
 * The distinction that matters downstream is `speech`: a silent track still has
 * to exist so the ffmpeg command line is the same shape either way, but a silent
 * language must not reach the player as a narration option — a language switch
 * that selects silence is worse than one that is not offered.
 */
function report({ speech, clips = 0, voice = null, why = null }) {
  fs.writeFileSync(
    REPORT,
    JSON.stringify({ lang: LANG, speech, clips, voice, why }, null, 2) + '\n',
    'utf8',
  );
}

/** Writes a silent track of the right length, and says why. */
function silent(seconds, why) {
  process.stdout.write(`${why}\n`);
  process.stdout.write(
    `writing a silent ${seconds.toFixed(3)}s track so the video still muxes; the ` +
    `${LANG} narration ships as out/tutorial.${LANG}.srt and as a subtitle track.\n`,
  );
  run([
    '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-t', seconds.toFixed(3), '-c:a', 'pcm_s16le', TARGET,
  ]);
  process.stdout.write(`wrote ${path.relative(process.cwd(), TARGET)} (silent)\n`);
  report({ speech: false, why });
}

/**
 * The best installed SAPI voice for a language, or null if there is none.
 *
 * Asked of Windows rather than assumed: the previous version hard-coded English,
 * which meant an installed hi-IN voice would have been ignored even once someone
 * had added one. `SAPI_VOICE` still wins when it names one of the candidates.
 */
function sapiVoiceFor(lang) {
  if (process.platform !== 'win32') return null;
  const script =
    "Add-Type -AssemblyName System.Speech; " +
    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; " +
    "$s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { " +
    '"{0}|{1}" -f $_.VoiceInfo.Name, $_.VoiceInfo.Culture.TwoLetterISOLanguageName }';

  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  if (result.status !== 0) return null;

  const candidates = (result.stdout || '')
    .split(/\r?\n/)
    .map(line => line.split('|'))
    .filter(parts => parts.length === 2)
    .map(([name, culture]) => ({ name: name.trim(), culture: culture.trim().toLowerCase() }))
    .filter(voice => voice.culture === lang);

  if (candidates.length === 0) return null;
  const preferred = candidates.find(
    voice => voice.name.toLowerCase().includes(SAPI_VOICE.toLowerCase()),
  );
  return (preferred ?? candidates[0]).name;
}

/**
 * Synthesises every line in one PowerShell process.
 *
 * One process for the whole set rather than one per line: starting PowerShell
 * costs the better part of a second, and a fifty-beat script would spend most
 * of its time launching interpreters.
 */
function speakWithSapi(rows, workDir, voiceName) {
  const manifest = path.join(workDir, 'lines.json');
  fs.writeFileSync(manifest, JSON.stringify(rows.map((r, i) => ({ i, text: r.text }))), 'utf8');

  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice('${voiceName.replace(/'/g, "''")}')
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

/** XML, because the request body is SSML and the narration contains apostrophes. */
function xmlEscape(text) {
  return text.replace(/[<>&'"]/g, c => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
  ));
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * One clip per line from Azure's REST endpoint.
 *
 * `riff-48khz-16bit-mono-pcm` comes back as a finished WAV at the bed's own
 * sample rate, so the clips drop straight into mix() with no conversion step
 * and nothing to go wrong between here and ffmpeg.
 *
 * A 429 is expected rather than exceptional on the free tier: the per-minute
 * allowance is lower than the number of lines, so a throttled request waits and
 * is retried instead of failing the build.
 */
async function speakWithAzure(rows, workDir, voiceName) {
  const endpoint = `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const locale = voiceName.split('-').slice(0, 2).join('-');

  for (const [n, row] of rows.entries()) {
    const ssml =
      `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}">` +
      `<voice name="${voiceName}">${xmlEscape(row.text)}</voice></speak>`;

    let audio = null;
    for (let attempt = 0; attempt < 5 && !audio; attempt++) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_KEY,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'riff-48khz-16bit-mono-pcm',
          'User-Agent': 'diagnocare-tutorial',
        },
        body: ssml,
      });

      if (response.ok) {
        audio = Buffer.from(await response.arrayBuffer());
        break;
      }
      if (response.status === 429 || response.status >= 500) {
        const wait = Number(response.headers.get('retry-after') || 0) * 1000 || 2000 * (attempt + 1);
        process.stdout.write(`  line ${row.i}: ${response.status}, waiting ${wait}ms\n`);
        await sleep(wait);
        continue;
      }
      // 401 and 403 mean the key or the region is wrong, and no amount of
      // retrying fixes either — say which, rather than looping five times.
      throw new Error(
        `Azure answered ${response.status} ${response.statusText}. ` +
        (response.status === 401 || response.status === 403
          ? 'Check AZURE_SPEECH_KEY and that AZURE_SPEECH_REGION matches the resource.'
          : (await response.text()).slice(0, 200)),
      );
    }

    if (!audio) throw new Error(`Azure did not return audio for line ${row.i} after 5 attempts.`);
    fs.writeFileSync(path.join(workDir, `line-${row.i}.wav`), audio);

    if (n % 10 === 9) process.stdout.write(`  ${n + 1}/${rows.length} lines\n`);
    if (n < rows.length - 1) await sleep(AZURE_GAP_MS);
  }
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

async function main() {
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

  // Pick an engine. A local voice is preferred wherever there is one: it is
  // free, offline, and for English it is what the existing track was built
  // with. Azure is the fallback for a language nothing here can speak — and
  // TTS_ENGINE=azure overrides the lot, for one consistent voice throughout.
  const azureReady = Boolean(AZURE_KEY && AZURE_REGION);
  const azureVoice = process.env[`AZURE_VOICE_${LANG.toUpperCase()}`] || AZURE_VOICES[LANG];
  const sapiVoice = process.platform === 'win32' ? sapiVoiceFor(LANG) : null;

  let engine = null;
  let voiceName = null;
  if (process.env.TTS_ENGINE === 'azure' && azureReady) { engine = 'azure'; voiceName = azureVoice; }
  else if (sapiVoice) { engine = 'sapi'; voiceName = sapiVoice; }
  else if (has('piper')) engine = 'piper';
  else if (has('espeak-ng')) engine = 'espeak-ng';
  else if (has('espeak')) engine = 'espeak';
  else if (azureReady) { engine = 'azure'; voiceName = azureVoice; }

  if (!engine) {
    silent(
      seconds,
      `no '${LANG}' voice available (no SAPI voice is installed for it, ` +
      'piper, espeak-ng and espeak are not on PATH, and AZURE_SPEECH_KEY / ' +
      'AZURE_SPEECH_REGION are not set).',
    );
    return;
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-tts-'));
  try {
    if (engine === 'azure') {
      // Said plainly, every time. This is the only step in the build that
      // sends anything off the machine.
      process.stdout.write(
        `→ sending ${rows.length} ${LANG} narration lines to Azure Text-to-Speech ` +
        `(${AZURE_REGION}, ${voiceName}).\n` +
        '  the narration script leaves this machine; nothing else in this build does.\n',
      );
    } else {
      process.stdout.write(
        `synthesising ${rows.length} ${LANG} lines with ${engine}` +
        `${voiceName ? ` (${voiceName})` : ''}…\n`,
      );
    }

    if (engine === 'azure') await speakWithAzure(rows, workDir, voiceName);
    else if (engine === 'sapi') speakWithSapi(rows, workDir, voiceName);
    else speakWithUnixEngine(engine, rows, workDir);

    const used = mix(rows, workDir, seconds);
    if (used) {
      process.stdout.write(`wrote ${path.relative(process.cwd(), TARGET)} (${used} clips)\n`);
      report({ speech: true, clips: used, voice: voiceName ?? engine });
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch(err => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
