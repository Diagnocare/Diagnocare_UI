import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

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
 * SUBTITLES
 * ─────────
 * The MP4 carries its own subtitle tracks, but no browser renders subtitles
 * muxed into an MP4 — mov_text is for players like VLC. So the WebVTT sidecars
 * are attached as <track> elements, which is what makes captions actually
 * selectable in the browser. English is `default` only when the video has no
 * burnt-in captions; ours draws them in the picture, so neither track is
 * forced on and the viewer opts in from the player's own menu.
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
export class TutorialVideoComponent {
  /** Whether the overlay is showing. The caller owns this. */
  @Input() set open(value: boolean) {
    const next = !!value;
    if (next === this.isOpen) return;
    this.isOpen = next;
    if (next) {
      this.failed = false;
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

  /** Shown in the dialog header, so the viewer knows what they opened. */
  @Input() heading = 'DiagnoCare — Product Walkthrough';

  isOpen = false;
  /** The file could not be loaded — almost always "it has not been built yet". */
  failed = false;

  @ViewChild('player') playerRef?: ElementRef<HTMLVideoElement>;

  constructor(private cdr: ChangeDetectorRef) {}

  /**
   * Escape closes, matching every other dialog in the app.
   *
   * Bound on the document rather than the host because the host is not
   * focusable and the <video> swallows key events once the player has focus.
   */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen) this.close();
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
   * dialog on a slow connection keeps pulling tens of megabytes.
   */
  private stop(): void {
    const el = this.playerRef?.nativeElement;
    if (!el) return;
    try {
      el.pause();
      el.removeAttribute('src');
      el.load();
    } catch {
      /* The element is already gone; nothing to release. */
    }
  }
}
