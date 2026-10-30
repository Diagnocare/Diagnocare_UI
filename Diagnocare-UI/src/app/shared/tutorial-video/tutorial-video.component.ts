import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';

/** Which subtitle track the viewer has asked for. */
export type TutorialSubtitleChoice = 'off' | 'en' | 'hi';

/** Which narration the viewer has asked for. */
export type TutorialAudioChoice = 'en' | 'hi';

/**
 * How Hindi narration can be reached in *this* browser, worked out once the
 * metadata has loaded:
 *
 *   'native'   the MP4's second audio track is selectable (Safari).
 *   'sidecar'  a separate Hindi audio file is played in step with the video.
 *   'none'     neither is possible, so the Hindi option is disabled.
 */
type AudioRoute = 'native' | 'sidecar' | 'none';

/** How far the sidecar may drift from the picture before it is nudged back. */
const MAX_DRIFT_SECONDS = 0.3;

/** One click of the skip buttons, and of the arrow keys. */
const SKIP_SECONDS = 10;

/** How long the controls stay up after the pointer stops moving. */
const CONTROLS_IDLE_MS = 2600;

/**
 * TutorialVideoComponent — the product walkthrough, played inside the app.
 * ─────────────────────────────────────────────────────────────────────────────
 * One <video> in a full-screen overlay, opened from the home page. It is a
 * plain HTML5 player rather than an embedded YouTube iframe on purpose: the
 * file ships with the application, so the tutorial works on a lab's LAN with
 * no internet and sends nothing to a third party. A lab's patient list is on
 * screen behind this dialog; an external embed would be a tracker pointed at
 * it.
 *
 * The caller owns the open/closed state (`open`) so the same component serves
 * both home pages without either of them learning how it works.
 *
 * WHY THE CONTROLS ARE OURS AND NOT THE BROWSER'S
 * ───────────────────────────────────────────────
 * `controls` draws a different bar in every browser, and three of the things
 * this player needs are in none of them: a one-click language switch for the
 * narration, a subtitle menu that is discoverable rather than buried in a
 * context menu, and skip buttons. So the native bar is off and the row at the
 * bottom of the frame is this component's own. The <video> element is still
 * the single source of truth — every control writes to it, and the state below
 * is refreshed from its events rather than tracked in parallel.
 *
 * SUBTITLES
 * ─────────
 * The MP4 carries its own subtitle tracks, but no browser renders subtitles
 * muxed into an MP4 — mov_text is for players like VLC. So the WebVTT sidecars
 * are attached as <track> elements, which is what makes captions selectable.
 *
 * These are the only captions there are: the recording itself carries no text,
 * so exactly one of them shows and `Off` means silence on screen. That is what
 * `applySubtitles()` enforces — every other track goes to 'disabled', never
 * 'hidden'. English starts showing, because a tutorial with no text at all in
 * the picture should not open mute to someone who needs the words.
 *
 * AUDIO, AND WHY IT IS NOT SIMPLY audioTracks
 * ───────────────────────────────────────────
 * The MP4 is built with two language-tagged audio tracks, but
 * `HTMLMediaElement.audioTracks` ships enabled only in Safari — in Chrome,
 * Edge and Firefox the second track is in the file and unreachable from
 * script. Switching narration there needs a separate file played in step with
 * the picture, which is what `audioHi` is: the video is muted, the sidecar
 * carries the sound, and the two are held together on every seek and whenever
 * they drift. The route is chosen per browser in `routeAudio()`, and when
 * neither works the Hindi option is disabled rather than silently doing
 * nothing.
 *
 * MISSING FILE
 * ────────────
 * The video is built locally and is not committed (tutorial/ builds it), so a
 * fresh checkout has no file at `src`. That is a normal state, not an error:
 * `error` on the <video> swaps the player for a short explanation instead of
 * leaving a black rectangle with no indication of what went wrong.
 */
@Component({
  selector: 'app-tutorial-video',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tutorial-video.component.html',
  styleUrls: ['./tutorial-video.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TutorialVideoComponent implements OnDestroy {
  /** Whether the overlay is showing. The caller owns this. */
  @Input() set open(value: boolean) {
    const next = !!value;
    if (next === this.isOpen) return;
    this.isOpen = next;
    if (next) {
      this.failed = false;
      this.resetPlaybackState();
      // The <video> only exists once *ngIf has run, so play on the next tick.
      queueMicrotask(() => this.play());
    } else {
      this.stop();
    }
    this.cdr.markForCheck();
  }

  /** Asked to close — by the backdrop, the close button or Escape. */
  @Output() closed = new EventEmitter<void>();

  /** Where the walkthrough and its caption sidecars live. */
  @Input() src = 'assets/tutorial/DiagnoCare-Tutorial.mp4';
  @Input() captionsEn = 'assets/tutorial/tutorial.en.vtt';
  @Input() captionsHi = 'assets/tutorial/tutorial.hi.vtt';

  /**
   * Hindi narration as its own file, for the browsers that cannot reach the
   * MP4's second audio track. Set it to '' to drop the Hindi option from the
   * audio menu in a deployment that does not ship the file.
   */
  @Input() audioHi = 'assets/tutorial/tutorial.hi.m4a';

  /** Shown in the dialog header, so the viewer knows what they opened. */
  @Input() heading = 'DiagnoCare — Product Walkthrough';

  isOpen = false;
  /** The file could not be loaded — almost always "it has not been built yet". */
  failed = false;

  @ViewChild('player') playerRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('frame') frameRef?: ElementRef<HTMLElement>;
  @ViewChild('sidecar') sidecarRef?: ElementRef<HTMLAudioElement>;

  // ── Playback, mirrored from the element's events ───────────────────────────
  playing = false;
  /** True between asking for frames and getting them, for the spinner. */
  waiting = false;
  currentTime = 0;
  duration = 0;
  /** Seconds already downloaded, for the lighter fill behind the progress. */
  bufferedTo = 0;
  /** Held while the viewer drags, so the fill does not animate behind them. */
  scrubbing = false;

  // ── Sound ──────────────────────────────────────────────────────────────────
  volume = 1;
  muted = false;
  /** Restores the previous level when unmuting a slider sitting at zero. */
  private volumeBeforeMute = 1;

  // ── Language ───────────────────────────────────────────────────────────────
  subtitles: TutorialSubtitleChoice = 'en';
  audio: TutorialAudioChoice = 'en';
  /** Which menu, if any, is open. Only one at a time. */
  menu: 'cc' | 'audio' | null = null;
  /** Worked out at `loadedmetadata`; 'none' disables the Hindi option. */
  private audioRoute: AudioRoute = 'none';
  /** Set when the sidecar file turns out not to be there (a 404, usually). */
  hindiAudioMissing = false;

  // ── Window state ───────────────────────────────────────────────────────────
  isFullscreen = false;
  isPip = false;
  /**
   * Whether to draw the picture-in-picture button at all.
   *
   * A field settled once at `loadedmetadata` rather than a getter: it depends
   * on the <video> element, which does not exist for the template's first
   * pass, and a getter that answered differently on the second pass would trip
   * Angular's dev-mode "changed after it was checked" check.
   */
  pipAvailable = false;
  /** The bar hides itself while the video plays and nothing is moving. */
  controlsVisible = true;
  private idleTimer?: ReturnType<typeof setTimeout>;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnDestroy(): void {
    this.clearIdleTimer();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Opening, closing and the keyboard
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Escape closes, matching every other dialog in the app.
   *
   * Bound on the document rather than the host because the host is not
   * focusable and the <video> swallows key events once the player has focus.
   *
   * It is taken one layer at a time. While the frame is full-screen Escape
   * belongs to the browser — it leaves full-screen, and closing the dialog
   * underneath in the same press would undo two things at once — and an open
   * menu closes before the dialog does.
   */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.isOpen) return;
    if (this.fullscreenElement()) return;
    if (this.menu) {
      this.menu = null;
      this.cdr.markForCheck();
      return;
    }
    this.close();
  }

  /**
   * The shortcuts every video player has.
   *
   * Skipped while the focus is inside one of the sliders: the arrow keys there
   * already mean something, and handling them in both places would move the
   * playhead by two different amounts from one press.
   */
  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!this.isOpen || this.failed) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    const target = event.target as HTMLElement | null;
    if (target?.tagName === 'INPUT' || target?.isContentEditable) return;
    // A focused button answers Space and Enter itself. Acting on them here as
    // well would run the control twice — play then pause, back where it was.
    if (target?.tagName === 'BUTTON' && (event.key === ' ' || event.key === 'Enter')) return;

    switch (event.key) {
      case ' ':
      case 'k':
        this.togglePlay();
        break;
      case 'ArrowLeft':
      case 'j':
        this.skip(-SKIP_SECONDS);
        break;
      case 'ArrowRight':
      case 'l':
        this.skip(SKIP_SECONDS);
        break;
      case 'ArrowUp':
        this.setVolume(this.volume + 0.1);
        break;
      case 'ArrowDown':
        this.setVolume(this.volume - 0.1);
        break;
      case 'm':
        this.toggleMute();
        break;
      case 'f':
        this.toggleFullscreen();
        break;
      case 'c':
        this.chooseSubtitles(this.subtitles === 'off' ? 'en' : 'off');
        break;
      case 'p':
        void this.togglePip();
        break;
      default:
        // 1…9 jump to that tenth of the video, 0 back to the start.
        if (!/^[0-9]$/.test(event.key)) return;
        this.seekTo((this.duration * Number(event.key)) / 10);
    }

    // Space would scroll the page behind the dialog and the letter keys would
    // reach whatever is focused; both are ours once we have acted on them.
    event.preventDefault();
    this.wake();
  }

  close(): void {
    this.stop();
    this.closed.emit();
  }

  onError(): void {
    this.failed = true;
    this.cdr.markForCheck();
  }

  private play(): void {
    const el = this.playerRef?.nativeElement;
    if (!el) return;
    // A rejected play() is not a failure worth reporting: browsers block
    // autoplay with sound until the page has been interacted with, and the
    // viewer has the player's own controls either way.
    el.play().catch(() => {});
  }

  /**
   * Stops playback and releases the download.
   *
   * Pausing alone leaves the browser streaming a file that nobody is watching,
   * so the source is detached and the element reloaded — otherwise closing the
   * dialog on a slow connection keeps pulling tens of megabytes. The sidecar
   * gets the same treatment, for the same reason.
   */
  private stop(): void {
    this.clearIdleTimer();
    for (const el of [this.playerRef?.nativeElement, this.sidecarRef?.nativeElement]) {
      if (!el) continue;
      try {
        el.pause();
        el.removeAttribute('src');
        el.load();
      } catch {
        /* The element is already gone; nothing to release. */
      }
    }
  }

  /** Back to a first-open state, so a reopened dialog does not resume mid-way. */
  private resetPlaybackState(): void {
    this.playing = false;
    this.waiting = false;
    this.currentTime = 0;
    this.duration = 0;
    this.bufferedTo = 0;
    this.scrubbing = false;
    this.menu = null;
    this.subtitles = 'en';
    this.audio = 'en';
    this.audioRoute = 'none';
    this.hindiAudioMissing = false;
    this.isPip = false;
    this.pipAvailable = false;
    this.controlsVisible = true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Element events — the state above is refreshed from here, never guessed
  // ═══════════════════════════════════════════════════════════════════════════

  onLoadedMetadata(): void {
    const el = this.playerRef?.nativeElement;
    if (!el) return;
    this.duration = Number.isFinite(el.duration) ? el.duration : 0;
    this.audioRoute = this.routeAudio(el);
    this.pipAvailable = this.detectPip(el);
    this.applySubtitles();
    this.applySound();
    this.cdr.markForCheck();
  }

  onTimeUpdate(): void {
    const el = this.playerRef?.nativeElement;
    if (!el) return;
    if (!this.scrubbing) this.currentTime = el.currentTime;
    this.holdSidecarInStep();
    this.cdr.markForCheck();
  }

  onDurationChange(): void {
    const el = this.playerRef?.nativeElement;
    if (el && Number.isFinite(el.duration)) {
      this.duration = el.duration;
      this.cdr.markForCheck();
    }
  }

  /** The buffered fill. Only the range holding the playhead is of any use. */
  onProgress(): void {
    const el = this.playerRef?.nativeElement;
    if (!el) return;
    for (let i = 0; i < el.buffered.length; i++) {
      if (el.buffered.start(i) <= el.currentTime && el.currentTime <= el.buffered.end(i)) {
        this.bufferedTo = el.buffered.end(i);
        break;
      }
    }
    this.cdr.markForCheck();
  }

  onPlay(): void {
    this.playing = true;
    this.syncSidecar(true);
    this.startIdleTimer();
    this.cdr.markForCheck();
  }

  onPause(): void {
    this.playing = false;
    this.sidecarRef?.nativeElement.pause();
    // A paused player keeps its controls: there is nothing to get out of the
    // way of, and a bar that vanishes over a still frame looks broken.
    this.wake();
  }

  onEnded(): void {
    this.playing = false;
    this.sidecarRef?.nativeElement.pause();
    this.wake();
  }

  onWaiting(): void {
    this.waiting = true;
    // The narration waits with the picture rather than running on ahead.
    this.sidecarRef?.nativeElement.pause();
    this.cdr.markForCheck();
  }

  onPlaying(): void {
    this.waiting = false;
    this.syncSidecar(true);
    this.cdr.markForCheck();
  }

  onSeeked(): void {
    this.syncSidecar(this.playing);
    this.cdr.markForCheck();
  }

  /** The element's own volume can change from the OS or a media key. */
  onVolumeChange(): void {
    const el = this.playerRef?.nativeElement;
    if (!el) return;
    this.volume = el.volume;
    // While the sidecar carries the sound the video is muted on purpose, so
    // its `muted` flag says nothing about what the viewer asked for.
    if (!this.sidecarInUse) this.muted = el.muted;
    this.cdr.markForCheck();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Transport
  // ═══════════════════════════════════════════════════════════════════════════

  togglePlay(): void {
    const el = this.playerRef?.nativeElement;
    if (!el) return;
    if (el.paused || el.ended) this.play();
    else el.pause();
  }

  /**
   * The picture itself is a play/pause target, as it is in the native player.
   *
   * An open menu takes the click instead: clicking away from a menu to dismiss
   * it should not also stop the video.
   */
  onVideoClick(): void {
    if (this.menu) {
      this.menu = null;
      this.cdr.markForCheck();
      return;
    }
    this.togglePlay();
  }

  /** Clamped at both ends: a skip past either edge is a skip to the edge. */
  skip(seconds: number): void {
    this.seekTo(this.currentTime + seconds);
  }

  seekTo(seconds: number): void {
    const el = this.playerRef?.nativeElement;
    if (!el || !this.duration) return;
    const next = Math.min(Math.max(seconds, 0), this.duration);
    el.currentTime = next;
    this.currentTime = next;
    this.syncSidecar(this.playing);
    this.cdr.markForCheck();
  }

  /** The progress slider, dragged or arrowed. */
  onSeekInput(event: Event): void {
    this.seekTo(Number((event.target as HTMLInputElement).value));
  }

  /**
   * Arrow keys on the progress slider skip by ten seconds like everywhere
   * else, rather than by the slider's own step — which is a hundredth of a
   * second, chosen so that dragging is smooth.
   */
  onSeekKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft') this.skip(-SKIP_SECONDS);
    else if (event.key === 'ArrowRight') this.skip(SKIP_SECONDS);
    else return;
    event.preventDefault();
  }

  startScrub(): void {
    this.scrubbing = true;
  }

  endScrub(): void {
    this.scrubbing = false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Sound
  // ═══════════════════════════════════════════════════════════════════════════

  setVolume(value: number): void {
    this.volume = Math.min(Math.max(value, 0), 1);
    // Dragging the slider to zero is the clearest way to say "mute".
    this.muted = this.volume === 0;
    if (this.volume > 0) this.volumeBeforeMute = this.volume;
    this.applySound();
    this.cdr.markForCheck();
  }

  onVolumeInput(event: Event): void {
    this.setVolume(Number((event.target as HTMLInputElement).value));
  }

  toggleMute(): void {
    this.muted = !this.muted;
    // Unmuting a slider sitting at zero would stay silent and look broken.
    if (!this.muted && this.volume === 0) this.volume = this.volumeBeforeMute || 1;
    this.applySound();
    this.cdr.markForCheck();
  }

  /** Which of the three speaker icons to draw. */
  get volumeIcon(): string {
    if (this.muted || this.volume === 0) return 'fa-volume-xmark';
    return this.volume < 0.5 ? 'fa-volume-low' : 'fa-volume-high';
  }

  /**
   * Pushes the viewer's wishes onto whichever element is actually making sound.
   *
   * When the sidecar is carrying Hindi the video is muted whatever the mute
   * button says and the button applies to the sidecar instead — otherwise the
   * English narration inside the MP4 would play underneath the Hindi one.
   */
  private applySound(): void {
    const el = this.playerRef?.nativeElement;
    const side = this.sidecarRef?.nativeElement;
    if (el) {
      el.volume = this.volume;
      el.muted = this.muted || this.sidecarInUse;
    }
    if (side) {
      side.volume = this.volume;
      side.muted = this.muted;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Subtitles
  // ═══════════════════════════════════════════════════════════════════════════

  chooseSubtitles(choice: TutorialSubtitleChoice): void {
    this.subtitles = choice;
    this.menu = null;
    this.applySubtitles();
    this.cdr.markForCheck();
  }

  /**
   * Exactly one track showing, or none.
   *
   * 'disabled' rather than 'hidden' for the rest: a hidden track still loads
   * its cues and fires cue events, and leaving both hidden has been enough to
   * make a browser render the two languages at once.
   */
  private applySubtitles(): void {
    const tracks = this.playerRef?.nativeElement.textTracks;
    if (!tracks) return;
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      if (track.kind !== 'subtitles' && track.kind !== 'captions') continue;
      track.mode = track.language === this.subtitles ? 'showing' : 'disabled';
    }
    this.liftCuesAboveTheBar();
  }

  /**
   * A <track> only fetches its WebVTT once it has been switched on, so this is
   * where the cues of the track just chosen first become available to move.
   */
  onTrackLoad(): void {
    this.liftCuesAboveTheBar();
  }

  /**
   * Raises the cues clear of the control bar.
   *
   * The browser draws subtitles at the foot of the video and only makes room
   * for its *own* controls; with those off, every cue would be printed through
   * this component's bar. A negative `line` counts rows of text up from the
   * bottom, and a cue grows downwards from the row it is given — so -4 leaves
   * two rows clear under a two-line cue, which is about this bar's height.
   */
  private liftCuesAboveTheBar(): void {
    const tracks = this.playerRef?.nativeElement.textTracks;
    if (!tracks) return;
    for (let i = 0; i < tracks.length; i++) {
      const cues = tracks[i].cues;
      if (!cues) continue;
      for (let c = 0; c < cues.length; c++) {
        const cue = cues[c] as VTTCue;
        if ('line' in cue) cue.line = -4;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Narration language
  // ═══════════════════════════════════════════════════════════════════════════

  /** Hindi is offered only where one of the two routes to it exists. */
  get hindiAudioAvailable(): boolean {
    return this.audioRoute !== 'none' && !this.hindiAudioMissing;
  }

  /** True while the hidden <audio> element is the thing making sound. */
  get sidecarInUse(): boolean {
    return this.audioRoute === 'sidecar' && this.audio === 'hi';
  }

  async chooseAudio(choice: TutorialAudioChoice): Promise<void> {
    this.menu = null;
    if (choice === this.audio || (choice === 'hi' && !this.hindiAudioAvailable)) {
      this.cdr.markForCheck();
      return;
    }

    this.audio = choice;

    if (this.audioRoute === 'native') this.selectNativeAudioTrack(choice);
    else if (choice === 'hi') await this.startSidecar();
    else this.sidecarRef?.nativeElement.pause();

    this.applySound();
    this.cdr.markForCheck();
  }

  /**
   * Which route to Hindi this browser has.
   *
   * `audioTracks` is tested for a *second* track rather than merely for the
   * API: Chrome exposes the interface behind a flag and, with the flag off,
   * reports a single track through it — which would look like success and then
   * switch to nothing.
   */
  private routeAudio(el: HTMLVideoElement): AudioRoute {
    const tracks = (el as HTMLVideoElement & { audioTracks?: { length: number } }).audioTracks;
    if (tracks && tracks.length > 1) return 'native';
    return this.audioHi ? 'sidecar' : 'none';
  }

  private selectNativeAudioTrack(choice: TutorialAudioChoice): void {
    const el = this.playerRef?.nativeElement as
      | (HTMLVideoElement & {
          audioTracks?: { length: number; [index: number]: { language: string; enabled: boolean } };
        })
      | undefined;
    const tracks = el?.audioTracks;
    if (!tracks) return;
    // ffmpeg writes ISO 639-2 ('eng', 'hin') and browsers report either that or
    // the two-letter form, so match on the prefix rather than on equality.
    const wanted = choice === 'hi' ? 'hi' : 'en';
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].enabled = (tracks[i].language || '').toLowerCase().startsWith(wanted);
    }
  }

  /**
   * Starts the Hindi sidecar at the picture's position.
   *
   * A file that is not there is the likely case — it is built locally, like the
   * video — so a failure here disables the option and says so in the menu,
   * rather than leaving a language switch that silently mutes the tutorial.
   */
  private async startSidecar(): Promise<void> {
    const side = this.sidecarRef?.nativeElement;
    const el = this.playerRef?.nativeElement;
    if (!side || !el) return;
    try {
      side.currentTime = el.currentTime;
      side.playbackRate = el.playbackRate;
      if (!el.paused) await side.play();
    } catch {
      this.onSidecarError();
    }
  }

  onSidecarError(): void {
    this.hindiAudioMissing = true;
    this.audio = 'en';
    this.audioRoute = 'none';
    this.applySound();
    this.cdr.markForCheck();
  }

  /** Lines the sidecar up with the picture and matches its play state. */
  private syncSidecar(shouldPlay: boolean): void {
    if (!this.sidecarInUse) return;
    const side = this.sidecarRef?.nativeElement;
    const el = this.playerRef?.nativeElement;
    if (!side || !el) return;
    side.currentTime = el.currentTime;
    side.playbackRate = el.playbackRate;
    if (shouldPlay) side.play().catch(() => {});
    else side.pause();
  }

  /**
   * Drift control, on every timeupdate.
   *
   * Two media elements started together do not stay together — they buffer
   * independently and neither waits for the other. A third of a second is
   * about where narration stops matching the pointer on screen, so anything
   * past that is corrected; correcting smaller gaps would be audible as a
   * stutter several times a minute.
   */
  private holdSidecarInStep(): void {
    if (!this.sidecarInUse) return;
    const side = this.sidecarRef?.nativeElement;
    const el = this.playerRef?.nativeElement;
    if (!side || !el) return;
    if (Math.abs(side.currentTime - el.currentTime) > MAX_DRIFT_SECONDS) {
      side.currentTime = el.currentTime;
    }
    if (!el.paused && side.paused) side.play().catch(() => {});
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Full-screen and picture-in-picture
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * The *frame* goes full-screen, not the video element.
   *
   * Full-screening the <video> hands the browser its own chrome back, and this
   * bar — which is where the language switches live — would be outside the
   * full-screen element and therefore invisible.
   */
  toggleFullscreen(): void {
    const frame = this.frameRef?.nativeElement as
      | (HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void })
      | undefined;
    if (!frame) return;
    const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> | void };
    const request = this.fullscreenElement()
      ? (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())
      : (frame.requestFullscreen?.() ?? frame.webkitRequestFullscreen?.());
    // Safari's prefixed pair returns nothing at all, so there is not always a
    // promise to attach to.
    Promise.resolve(request).catch(() => {});
  }

  @HostListener('document:fullscreenchange')
  @HostListener('document:webkitfullscreenchange')
  onFullscreenChange(): void {
    this.isFullscreen = !!this.fullscreenElement();
    this.wake();
  }

  private fullscreenElement(): Element | null {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
  }

  /** The button is hidden where the browser has no PiP, not shown and dead. */
  private detectPip(el: HTMLVideoElement): boolean {
    if (typeof document === 'undefined') return false;
    const safari = el as HTMLVideoElement & {
      webkitSupportsPresentationMode?: (mode: string) => boolean;
    };
    if (safari.webkitSupportsPresentationMode?.('picture-in-picture')) return true;
    return !!document.pictureInPictureEnabled && !el.disablePictureInPicture;
  }

  async togglePip(): Promise<void> {
    const el = this.playerRef?.nativeElement as
      | (HTMLVideoElement & { webkitSetPresentationMode?: (mode: string) => void })
      | undefined;
    if (!el) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (el.requestPictureInPicture) await el.requestPictureInPicture();
      else el.webkitSetPresentationMode?.('picture-in-picture');
    } catch {
      /* Refused, or the window was closed as we asked — the element's own
         enter/leave events settle the button's state either way. */
    }
  }

  onPipChange(active: boolean): void {
    this.isPip = active;
    this.cdr.markForCheck();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // The control bar itself
  // ═══════════════════════════════════════════════════════════════════════════

  toggleMenu(which: 'cc' | 'audio'): void {
    this.menu = this.menu === which ? null : which;
    this.wake();
  }

  /** Progress and buffering as percentages, for the two rail fills. */
  get playedPercent(): number {
    return this.duration ? (this.currentTime / this.duration) * 100 : 0;
  }

  get bufferedPercent(): number {
    return this.duration ? Math.min((this.bufferedTo / this.duration) * 100, 100) : 0;
  }

  /** h:mm:ss past an hour, m:ss below it — a 12-minute video reads as 12:30. */
  format(seconds: number): string {
    const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    const whole = Math.floor(safe);
    const hours = Math.floor(whole / 3600);
    const minutes = Math.floor((whole % 3600) / 60);
    const secs = whole % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return hours ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
  }

  /** Spoken position, so the slider reads as a time and not as "450". */
  get seekValueText(): string {
    return `${this.format(this.currentTime)} of ${this.format(this.duration)}`;
  }

  /** Likewise the volume, as a percentage rather than as "0.35". */
  get volumeValueText(): string {
    return `${Math.round((this.muted ? 0 : this.volume) * 100)}%`;
  }

  /** Pointer moved, or a key was pressed: show the bar, restart the clock. */
  wake(): void {
    this.controlsVisible = true;
    this.startIdleTimer();
    this.cdr.markForCheck();
  }

  /**
   * The same, for `mousemove` — which fires dozens of times a second, so it
   * only asks for a re-render on the move that actually brings the bar back.
   */
  onPointerMove(): void {
    const wasHidden = !this.controlsVisible;
    this.controlsVisible = true;
    this.startIdleTimer();
    if (wasHidden) this.cdr.markForCheck();
  }

  /** The pointer left the frame — nothing will move, so get out of the way. */
  onFrameLeave(): void {
    if (this.playing && !this.menu) {
      this.controlsVisible = false;
      this.clearIdleTimer();
      this.cdr.markForCheck();
    }
  }

  /**
   * Hides the bar after a pause in activity, but only while the video is
   * playing and no menu is open — a menu that closed itself under the pointer
   * would be unusable.
   */
  private startIdleTimer(): void {
    this.clearIdleTimer();
    if (!this.playing) return;
    this.idleTimer = setTimeout(() => {
      if (this.playing && !this.menu) {
        this.controlsVisible = false;
        this.cdr.markForCheck();
      }
    }, CONTROLS_IDLE_MS);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }
}
