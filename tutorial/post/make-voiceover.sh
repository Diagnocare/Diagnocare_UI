#!/usr/bin/env bash
# Builds a voice-over track per language from out/timeline.json.
#
# Phase 7 of the brief: use a local TTS engine if one is available, otherwise leave the
# narration as text and keep the project ready for TTS to be added later. This script is
# that switch. It looks for an engine, and if it finds none it still produces a silent
# track of exactly the right length so the mux downstream is identical either way —
# which is what makes adding a voice later a drop-in rather than a rebuild.
#
#   usage: bash post/make-voiceover.sh [en|hi]
set -euo pipefail

LANG_CODE="${1:-en}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/../out"
TIMELINE="$OUT/timeline.json"

[ -f "$TIMELINE" ] || { echo "no out/timeline.json — run 'npm run record' first" >&2; exit 1; }

DURATION_MS=$(node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('$TIMELINE','utf8')).durationMs||0))")
DURATION_S=$(node -e "process.stdout.write((${DURATION_MS}/1000).toFixed(3))")
TARGET="$OUT/voice.${LANG_CODE}.wav"

# Engines in order of preference. piper is neural and has a Hindi voice; espeak-ng and
# flite are formant synthesisers and are only acceptable as a fallback.
ENGINE=""
for candidate in piper espeak-ng espeak flite; do
  if command -v "$candidate" >/dev/null 2>&1; then ENGINE="$candidate"; break; fi
done

if [ -z "$ENGINE" ]; then
  echo "no local TTS engine found (looked for piper, espeak-ng, espeak, flite)."
  echo "writing a silent ${DURATION_S}s track so the video still muxes; narration text is"
  echo "in out/tutorial.${LANG_CODE}.srt and plan/storyboard.md, ready for TTS later."
  ffmpeg -nostdin -y -loglevel error \
    -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 \
    -t "$DURATION_S" -c:a pcm_s16le "$TARGET"
  echo "wrote $TARGET (silent)"
  exit 0
fi

echo "using TTS engine: $ENGINE"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# One clip per narration beat, laid onto a silent bed at the beat's own start time, so
# the speech stays aligned with the picture however long each clip turns out to be.
node -e "
const fs=require('fs');
const t=JSON.parse(fs.readFileSync('$TIMELINE','utf8'));
const key='$LANG_CODE'==='hi'?'hi':'en';
const rows=t.lines.filter(l=>l[key]).map((l,i)=>({i,start:l.startMs,text:l[key]}));
fs.writeFileSync('$WORK/lines.json',JSON.stringify(rows));
"

COUNT=$(node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('$WORK/lines.json','utf8')).length))")
echo "synthesising $COUNT lines…"

for i in $(seq 0 $((COUNT - 1))); do
  node -e "
    const rows=JSON.parse(require('fs').readFileSync('$WORK/lines.json','utf8'));
    process.stdout.write(rows[$i].text);
  " > "$WORK/line-$i.txt"

  case "$ENGINE" in
    piper)
      VOICE="${PIPER_VOICE:-}"
      [ -n "$VOICE" ] || { echo "set PIPER_VOICE to a .onnx voice model path" >&2; exit 1; }
      piper --model "$VOICE" --output_file "$WORK/line-$i.wav" < "$WORK/line-$i.txt" ;;
    espeak-ng|espeak)
      "$ENGINE" -v "$([ "$LANG_CODE" = hi ] && echo hi || echo en-us)" -s 150 \
        -w "$WORK/line-$i.wav" -f "$WORK/line-$i.txt" ;;
    flite)
      flite -o "$WORK/line-$i.wav" -f "$WORK/line-$i.txt" ;;
  esac
done

# Build the filter graph: silent bed + every clip delayed to its own start, all mixed.
FILTER=$(node -e "
const rows=JSON.parse(require('fs').readFileSync('$WORK/lines.json','utf8'));
const parts=rows.map((r,i)=>\`[\${i+1}:a]adelay=\${Math.round(r.start)}|\${Math.round(r.start)}[d\${i}]\`);
const mixIn=rows.map((_,i)=>\`[d\${i}]\`).join('')+'[0:a]';
process.stdout.write(parts.join(';')+';'+mixIn+\`amix=inputs=\${rows.length+1}:normalize=0:duration=first[out]\`);
")

INPUTS=(-f lavfi -t "$DURATION_S" -i anullsrc=channel_layout=stereo:sample_rate=48000)
for i in $(seq 0 $((COUNT - 1))); do INPUTS+=(-i "$WORK/line-$i.wav"); done

ffmpeg -nostdin -y -loglevel error "${INPUTS[@]}" \
  -filter_complex "$FILTER" -map '[out]' -ac 2 -ar 48000 -c:a pcm_s16le "$TARGET"

echo "wrote $TARGET"
