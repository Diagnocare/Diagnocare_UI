import { Component, OnDestroy, OnInit, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';

import { AttendanceCheckInService } from 'src/app/services/attendanceServices/attendance-check-in.service';
import { AttendanceDeviceService } from 'src/app/core/services/attendance-device.service';
import { AttendanceQr } from 'src/app/models/attendanceVerification/attendance-verification.model';

/**
 * The laboratory's wall display: a QR code that changes every minute.
 *
 * This is the factor that actually establishes presence. GPS mostly rules out a check-in
 * from home and fails honestly indoors; a code that can only be read off a screen inside
 * the building, and is worthless within the minute, is what a proxy cannot get around.
 *
 * It runs on an enrolled kiosk device and takes no location parameter — the backend reads
 * that from the kiosk token's own claim, which is what stops one site's display asking
 * for another site's code. An employee's phone token is refused outright by the
 * AttendanceKiosk policy: anyone able to mint a code from a handset could produce the
 * very thing they are supposed to have to walk up and read.
 *
 * Designed to be left running unattended for months, so every failure path recovers on
 * its own. Nobody is watching this screen to press retry.
 */
@Component({
  selector: 'app-attendance-kiosk',
  templateUrl: './attendance-kiosk.component.html',
  styleUrls: ['./attendance-kiosk.component.scss'],
  standalone: true,
  imports: [CommonModule],
})
export class AttendanceKioskComponent implements OnInit, OnDestroy {

  /**
   * Refetch this many seconds before the code expires.
   *
   * Without the lead, a code would be dead for the moment between expiring and the
   * replacement arriving — and that moment is exactly when somebody is holding a phone
   * up to it. Three seconds comfortably covers a round trip on lab Wi-Fi.
   */
  private readonly REFRESH_LEAD_S = 3;

  /** Never refetch faster than this, whatever the server says, so a bad value cannot spin. */
  private readonly MIN_INTERVAL_S = 5;

  /** Backoff after a failed fetch. Long enough not to hammer a server that is down. */
  private readonly RETRY_AFTER_S = 10;

  private readonly destroy$ = new Subject<void>();

  qr: AttendanceQr | null = null;

  /** Seconds left on the code currently displayed. Drives the countdown ring. */
  secondsLeft = 0;

  /** Total lifetime of the current code, for the ring's proportion. */
  private totalSeconds = 60;

  loading = true;
  errorMessage = '';

  /** True once at least one code has loaded — keeps a blip from blanking the wall. */
  private hasEverLoaded = false;

  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private fetchHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private checkInService: AttendanceCheckInService,
    private deviceService: AttendanceDeviceService,
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    if (!this.deviceService.hasToken()) {
      this.loading = false;
      this.errorMessage =
        'This screen is not enrolled as a kiosk yet. Ask an administrator to enrol it against this laboratory.';
      return;
    }

    this.fetch();
    this.startTicking();
  }

  ngOnDestroy(): void {
    this.stopTimers();
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Fetching ──────────────────────────────────────────────────────────────

  private fetch(): void {
    this.checkInService.getKioskQr()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: qr => {
          this.qr = qr;
          this.hasEverLoaded = true;
          this.loading = false;
          this.errorMessage = '';

          // Floored so a zero or negative figure — a slow round trip, a clock skew —
          // cannot schedule an immediate refetch and spin.
          this.totalSeconds = Math.max(this.MIN_INTERVAL_S, qr.expiresInSeconds);
          this.secondsLeft = this.totalSeconds;

          this.scheduleNext(Math.max(this.MIN_INTERVAL_S, qr.expiresInSeconds - this.REFRESH_LEAD_S));
        },
        error: err => {
          this.loading = false;

          // A display that has been working all week should not go blank because one
          // request failed — the code on screen is still valid for its remaining seconds,
          // and the next attempt is moments away. Only a screen that never loaded at all
          // shows the error instead of a code.
          this.errorMessage = this.describeError(err?.status);
          this.scheduleNext(this.RETRY_AFTER_S);
        },
      });
  }

  private describeError(status?: number): string {
    if (status === 401 || status === 403) {
      return 'This kiosk enrolment is no longer valid. Ask an administrator to enrol this screen again.';
    }

    if (status === 0) {
      return 'Cannot reach the server. Retrying…';
    }

    return 'Could not load the attendance code. Retrying…';
  }

  private scheduleNext(seconds: number): void {
    if (this.fetchHandle) clearTimeout(this.fetchHandle);

    // Scheduled outside Angular so an idle wall display is not running change detection
    // on a timer all day; the callback steps back in to update the view.
    this.zone.runOutsideAngular(() => {
      this.fetchHandle = setTimeout(() => {
        this.zone.run(() => this.fetch());
      }, seconds * 1000);
    });
  }

  // ── Countdown ─────────────────────────────────────────────────────────────

  private startTicking(): void {
    this.zone.runOutsideAngular(() => {
      this.tickHandle = setInterval(() => {
        if (this.secondsLeft <= 0) return;

        this.zone.run(() => {
          this.secondsLeft = Math.max(0, this.secondsLeft - 1);
          this.cdr.markForCheck();
        });
      }, 1000);
    });
  }

  private stopTimers(): void {
    if (this.tickHandle) { clearInterval(this.tickHandle); this.tickHandle = null; }
    if (this.fetchHandle) { clearTimeout(this.fetchHandle); this.fetchHandle = null; }
  }

  // ── Template helpers ──────────────────────────────────────────────────────

  /** Whether to show a code at all, as opposed to the error state. */
  get showCode(): boolean {
    return !!this.qr && this.hasEverLoaded;
  }

  /** A transient error while a code is still on screen — shown as a small footnote. */
  get showInlineWarning(): boolean {
    return !!this.errorMessage && this.showCode;
  }

  /** Proportion of the current code's life remaining, 0 to 1, for the ring. */
  get remainingFraction(): number {
    if (this.totalSeconds <= 0) return 0;
    return Math.max(0, Math.min(1, this.secondsLeft / this.totalSeconds));
  }

  /** Circumference offset for the SVG countdown ring (r = 26). */
  get ringOffset(): number {
    const circumference = 2 * Math.PI * 26;
    return circumference * (1 - this.remainingFraction);
  }

  get ringCircumference(): number {
    return 2 * Math.PI * 26;
  }

  /** Amber as the code approaches expiry, so somebody mid-scan knows to wait. */
  get ringColour(): string {
    return this.secondsLeft <= 10 ? '#f59e0b' : '#22c55e';
  }
}
