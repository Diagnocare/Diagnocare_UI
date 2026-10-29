#!/usr/bin/env bash
# Phase 9 — turns the raw Playwright capture into the deliverable.
#
#   out/raw.webm  ──▶  out/DiagnoCare-Tutorial.mp4
#
# The result is 1920x1080, 16:9, H.264 + AAC, with:
#   • chapter markers for the eight sections,
#   • two selectable subtitle tracks, English and Hindi, language-tagged,
#   • an audio track (narration if a TTS engine was available, silence if not).
#
# The captions a viewer sees by default are already in the picture — the recorder draws
# them in the page in both languages — so the subtitle tracks are for players and for
# accessibility, not a second copy of the same thing burned on top.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$HERE/.."
OUT="$ROOT/out"
FINAL="$OUT/DiagnoCare-Tutorial.mp4"

command -v ffmpeg >/dev/null || { echo "ffmpeg is required" >&2; exit 1; }
[ -f "$OUT/timeline.json" ] || { echo "no out/timeline.json — run 'npm run record' first" >&2; exit 1; }

# Playwright names the capture after the page; take the newest.
RAW="$(ls -t "$OUT"/*.webm 2>/dev/null | head -1 || true)"
[ -n "$RAW" ] || { echo "no .webm in out/ — run 'npm run record' first" >&2; exit 1; }
echo "source: $(basename "$RAW")"

echo "→ subtitles and chapters"
node "$HERE/make-subtitles.js"

echo "→ voice-over"
bash "$HERE/make-voiceover.sh" en
bash "$HERE/make-voiceover.sh" hi

echo "→ encoding 1080p H.264"
# scale+pad rather than a bare scale: it guarantees exactly 1920x1080 and 16:9 even if
# the capture came back a few pixels off, instead of silently changing the aspect.
ffmpeg -nostdin -y -loglevel error -stats \
  -i "$RAW" \
  -i "$OUT/voice.en.wav" \
  -i "$OUT/voice.hi.wav" \
  -f ffmetadata -i "$OUT/chapters.txt" \
  -i "$OUT/tutorial.en.srt" \
  -i "$OUT/tutorial.hi.srt" \
  -map 0:v:0 -map 1:a:0 -map 2:a:0 -map 4 -map 5 -map_metadata 3 \
  -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=#071326,setsar=1,fps=30" \
  -c:v libx264 -preset medium -crf 20 -profile:v high -level 4.0 -pix_fmt yuv420p \
  -movflags +faststart \
  -c:a aac -b:a 160k \
  -c:s mov_text \
  -metadata:s:a:0 language=eng -metadata:s:a:0 title="English narration" \
  -metadata:s:a:1 language=hin -metadata:s:a:1 title="Hindi narration" \
  -metadata:s:s:0 language=eng -metadata:s:s:0 title="English" \
  -metadata:s:s:1 language=hin -metadata:s:s:1 title="हिन्दी" \
  -metadata title="DiagnoCare — Product Tutorial" \
  "$FINAL"

echo
echo "── built ──"
ffprobe -v error -show_entries format=duration,size -show_entries stream=index,codec_type,codec_name,width,height:stream_tags=language,title \
  -of default=noprint_wrappers=1 "$FINAL"
echo
echo "video:     $FINAL"
echo "subtitles: out/tutorial.en.srt  out/tutorial.hi.srt (+ .vtt, + bilingual)"
