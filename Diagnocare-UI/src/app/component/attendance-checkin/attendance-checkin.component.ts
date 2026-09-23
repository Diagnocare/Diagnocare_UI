import { Component, OnDestroy, OnInit, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';

import { AttendanceCheckInService } from 'src/app/services/attendanceServices/attendance-check-in.service';
import { AttendanceDeviceService } from 'src/app/core/services/attendance-device.service';
import {
  AttendanceCheckRequest,
  AttendanceCheckResult,
  AttendanceDisplayStatus,
  AttendanceFailureReason,
  AttendanceLocationOption,
  AttendanceToday,
  DISPLAY_STATUS_TONE,
  RESCAN_FAILURES,
  RETRYABLE_FAILURES,
} from 'src/app/models/attendanceVerification/attendance-verification.model';
import {
  acquirePosition,
  describeGeoFailure,
  describeGeolocationSupport,
  GeoFix,
  GeolocationError,
} from 'src/app/shared/geolocation.util';

/** Which action the employee started. */
type CheckAction = 'in' | 'out';

/**
 * Where the flow is. Rendered as one screen at a time rather than a wizard — the
 * employee is standing at a door holding a phone, and every extra tap is a second they
 * are not working.
 */
type Phase =
  | 'loading'      // fetching today
  | 'ready'        // showing the card, waiting for a press
  | 'locating'     // acquiring a GPS fix
  | 'scanning'     // camera open, looking for the kiosk code
  | 'selfie'       // waiting for a photo
  | 'submitting'   // posting to the server
  | 'result'       // showing the outcome
  | 'error';       // could not load today at all

@Component({
  selector: 'app-attendance-checkin',
  templateUrl: './attendance-checkin.component.html',
  styleUrls: ['./attendance-checkin.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule],
})
export class AttendanceCheckinComponent implements OnInit, OnDestroy {

  // ── Exposed to the template ───────────────────────────────────────────────
  readonly Status = AttendanceDisplayStatus;
  readonly Reason = AttendanceFailureReason;
  readonly tone = DISPLAY_STATUS_TONE;

  /**
   * Target accuracy before we stop waiting, in metres.
   *
   * Comfortably better than the server's default 100 m gate, so the fix we submit is
   * normally well inside what it will accept. It is only a target: the acquire loop
   * returns the best it managed either way and lets the server judge, because the server
   * is where that decision belongs.
   */
  private readonly TARGET_ACCURACY_M = 40;

  /**
   * How long to keep improving the fix before submitting what we have.
   *
   * Twelve seconds is the compromise. A first indoor fix is often 200 m+ and settles
   * within about ten; giving up sooner means submitting a reading the server will refuse,
   * and waiting much longer is indistinguishable from the app having hung.
   */
  private readonly MAX_WAIT_MS = 12_000;

  /** Longest edge of a stored selfie, in pixels. Keeps the payload well under the 2 MB server cap. */
  private readonly SELFIE_MAX_EDGE = 640;

  private readonly destroy$ = new Subject<void>();

  // ── State ─────────────────────────────────────────────────────────────────
  phase: Phase = 'loading';
  today: AttendanceToday | null = null;

  /** Fatal load error — shown instead of the card. */
  loadError = '';

  action: CheckAction = 'in';
  selectedLocationId: number | null = null;

  /** Progress text while acquiring a fix. */
  locatingMessage = '';
  currentAccuracy: number | null = null;

  /** Set once a fix has been acquired for the action in flight. */
  private fix: GeoFix | null = null;

  /** The scanned or typed code for the action in flight. */
  private qrToken: string | null = null;

  /**
   * A code that arrived in the URL, from the phone's native camera.
   *
   * Consumed once. A rotation lives about a minute, so it is good for this attempt and
   * meaningless afterwards — holding on to it would mean a retry two minutes later
   * silently reusing a dead code and reporting "expired" when the employee had done
   * nothing wrong.
   */
  private pendingQrToken: string | null = null;

  /** Base64 selfie for the action in flight, when the lab requires one. */
  private selfieBase64: string | null = null;

  // ── Scanner ───────────────────────────────────────────────────────────────
  /** Element id the scanner library renders into. */
  readonly scannerElementId = 'attendance-qr-reader';

  scannerError = '';
  manualCode = '';
  showManualEntry = false;

  /** Held as `any` so the component compiles before html5-qrcode is installed. */
  private scanner: any = null;

  // ── Result ────────────────────────────────────────────────────────────────
  result: AttendanceCheckResult | null = null;

  constructor(
    private checkInService: AttendanceCheckInService,
    private deviceService: AttendanceDeviceService,
    private route: ActivatedRoute,
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    // A code opened with the phone's own camera arrives as ?t=… on this route. Staff
    // reach for the native camera first whatever the instructions say, so that path is
    // supported rather than fought: the token is held here and the scanner step is
    // skipped entirely, which turns scan-then-check-in into a single action.
    const scanned = (this.route.snapshot.queryParamMap.get('t') ?? '').trim();
    this.pendingQrToken = scanned.length > 0 ? scanned : null;

    this.loadToday();
  }

  ngOnDestroy(): void {
    // The camera must be released explicitly. Angular tearing the view down does not stop
    // a MediaStream, and a phone left with its camera light on after the employee has
    // walked away is the kind of thing that gets a feature switched off.
    void this.stopScanner();

    this.destroy$.next();
    this.destroy$.complete();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LOADING
  // ══════════════════════════════════════════════════════════════════════════

  loadToday(): void {
    this.phase = 'loading';
    this.loadError = '';

    this.checkInService.getToday()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: data => {
          this.today = data;
          this.phase = 'ready';

          // Preselect so the common case — one lab, one location — needs no choice at
          // all. The picker only earns its place when there is genuinely something to
          // pick.
          const primary = data.locations.find(l => l.isPrimary) ?? data.locations[0] ?? null;
          this.selectedLocationId = primary ? primary.locationId : null;

          // Arrived by scanning with the native camera: start straight away rather than
          // making the employee press a button they did not know they needed. Only for
          // check-in — silently checking somebody *out* because they scanned a code
          // would be a genuinely bad surprise.
          if (this.pendingQrToken && data.canCheckIn && this.selectedLocationId !== null) {
            this.start('in');
          }
        },
        error: err => {
          this.phase = 'error';
          this.loadError = this.describeLoadError(err?.status);
        },
      });
  }

  /**
   * A 401 here means something specific and fixable, and saying so saves a support call:
   * either this handset was never enrolled, or its enrolment has been revoked.
   */
  private describeLoadError(status?: number): string {
    if (status === 401 || status === 403) {
      return this.deviceService.hasToken()
        ? 'This device is no longer enrolled for attendance. Ask your administrator to enrol it again.'
        : 'This device is not set up for attendance yet. Ask your administrator for an enrolment link, or sign in to the app first.';
    }

    if (status === 0) {
      return 'Could not reach the server. Check your connection and try again.';
    }

    return 'Could not load your attendance. Please try again.';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // THE FLOW
  // ══════════════════════════════════════════════════════════════════════════

  start(action: CheckAction): void {
    if (!this.today || this.selectedLocationId === null) return;

    this.action = action;
    this.fix = null;
    this.qrToken = null;
    this.selfieBase64 = null;
    this.manualCode = '';
    this.scannerError = '';
    this.showManualEntry = false;
    this.result = null;

    void this.acquireLocation();
  }

  /** Step 1 — a GPS fix, with the accuracy shown as it improves. */
  private async acquireLocation(): Promise<void> {
    this.phase = 'locating';
    this.currentAccuracy = null;
    this.locatingMessage = 'Finding your location…';

    const unsupported = describeGeolocationSupport();
    if (unsupported) {
      this.failLocally(describeGeoFailure(unsupported));
      return;
    }

    try {
      const fix = await acquirePosition({
        targetAccuracyMetres: this.TARGET_ACCURACY_M,
        maxWaitMs: this.MAX_WAIT_MS,
        onProgress: partial => {
          // The geolocation callback is outside Angular's zone, so an update from it
          // would not repaint on its own. Showing the accuracy climbing down is the
          // difference between "it is working" and "it has frozen".
          this.zone.run(() => {
            this.currentAccuracy = Math.round(partial.accuracy);
            this.locatingMessage = `Improving accuracy — about ${this.currentAccuracy} m so far…`;
            this.cdr.markForCheck();
          });
        },
      });

      this.zone.run(() => {
        this.fix = fix;
        this.currentAccuracy = Math.round(fix.accuracy);
        void this.afterLocation();
      });
    } catch (err) {
      const message = err instanceof GeolocationError
        ? describeGeoFailure(err.reason)
        : 'Could not get your location.';

      this.zone.run(() => this.failLocally(message));
    }
  }

  /** Step 2 — the QR code, unless this is a check-out the lab does not gate. */
  private async afterLocation(): Promise<void> {
    const needsQr = this.action === 'in' || (this.today?.qrRequiredOnCheckOut ?? true);

    if (!needsQr) {
      await this.afterQr();
      return;
    }

    // A code from the native camera means the scanner has nothing to do. Consumed here
    // so a later retry opens the camera properly instead of resubmitting a stale code.
    if (this.pendingQrToken) {
      this.qrToken = this.pendingQrToken;
      this.pendingQrToken = null;
      await this.afterQr();
      return;
    }

    this.phase = 'scanning';
    await this.startScanner();
  }

  /** Step 3 — the selfie, when the administrator has switched it on. */
  private async afterQr(): Promise<void> {
    await this.stopScanner();

    if (this.action === 'in' && this.today?.selfieRequired) {
      this.phase = 'selfie';
      return;
    }

    this.submit();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCANNER
  // ══════════════════════════════════════════════════════════════════════════

  private async startScanner(): Promise<void> {
    this.scannerError = '';

    try {
      // The container has to exist before the library looks it up by id. Setting
      // `phase = 'scanning'` only queues a render, so constructing the scanner in the
      // same turn races Angular and fails intermittently — the worst kind of failure
      // here, because it would work on a fast phone and not on a slow one.
      const container = await this.waitForElement(this.scannerElementId);

      if (!container) {
        throw new Error('scanner container never appeared');
      }

      // Imported on demand so the scanner is not in the bundle of anyone who never opens
      // this screen, and so a kiosk or admin page never pays for it.
      const { Html5Qrcode } = await import('html5-qrcode');

      // The employee may have cancelled while the chunk was downloading.
      if (this.phase !== 'scanning') return;

      this.scanner = new Html5Qrcode(this.scannerElementId, /* verbose */ false);

      await this.scanner.start(
        // The rear camera, by constraint rather than by picking from a device list.
        // Enumerating cameras needs permission first on iOS, which means asking twice.
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded: string) => {
          this.zone.run(() => {
            if (this.qrToken) return;   // already have one; ignore repeat decodes
            this.qrToken = decoded;
            void this.afterQr();
          });
        },
        () => {
          // Per-frame "no code in this frame" callback. Deliberately empty: it fires many
          // times a second and is not an error.
        },
      );
    } catch (err) {
      this.zone.run(() => {
        // The camera is the single most likely thing to fail here — permission refused,
        // an older handset, a browser that will not share it. This is exactly why the
        // typed code exists, so the flow offers it rather than dead-ending.
        this.scannerError = 'Could not open the camera.';
        this.showManualEntry = true;
        this.cdr.markForCheck();
      });
    }
  }

  /**
   * Polls briefly for an element Angular is about to render.
   *
   * A fixed `setTimeout(0)` would usually work and would be a latent flake — change
   * detection may take more than one turn under load, and this runs on the slowest
   * device in the lab. Polling a few frames is honest about what is being waited for.
   */
  private waitForElement(id: string, attempts = 20): Promise<HTMLElement | null> {
    return new Promise(resolve => {
      let remaining = attempts;

      const look = () => {
        const found = document.getElementById(id);

        if (found) { resolve(found); return; }
        if (--remaining <= 0) { resolve(null); return; }

        setTimeout(look, 25);
      };

      look();
    });
  }

  private async stopScanner(): Promise<void> {
    if (!this.scanner) return;

    const scanner = this.scanner;
    this.scanner = null;

    try {
      await scanner.stop();
      scanner.clear();
    } catch {
      // Already stopped, or never fully started. Nothing to recover.
    }
  }

  /** The typed fallback, for when the camera will not cooperate. */
  submitManualCode(): void {
    const code = this.manualCode.trim();

    if (code.length < 4) {
      this.scannerError = 'Enter the code shown under the QR code.';
      return;
    }

    this.qrToken = code;
    void this.afterQr();
  }

  toggleManualEntry(): void {
    this.showManualEntry = !this.showManualEntry;
    this.scannerError = '';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SELFIE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Takes the photo through a file input with `capture`, not `getUserMedia`.
   *
   * The native camera handles orientation, focus, the front/rear choice and the
   * permission prompt far better than anything worth hand-writing here, and it works on
   * iOS Safari where an inline video stream is a long-standing source of trouble.
   */
  onSelfieSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    this.downscaleToBase64(file)
      .then(base64 => {
        this.selfieBase64 = base64;
        this.submit();
      })
      .catch(() => {
        this.failLocally('Could not read that photo. Please try again.');
      });
  }

  skipSelfie(): void {
    // Submitted without one on purpose rather than blocked here. The server owns whether
    // a selfie is required, and letting it refuse keeps one rule in one place — and
    // leaves an audit row explaining the refusal.
    this.submit();
  }

  /**
   * Scales the image down and re-encodes it as JPEG.
   *
   * A modern phone camera produces several megabytes; the server caps a selfie at 2 MB
   * and, more to the point, these land in the same database as the lab's patient records.
   * 640 px is more than enough to recognise a face.
   */
  private downscaleToBase64(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => reject(new Error('read failed'));

      reader.onload = () => {
        const image = new Image();

        image.onerror = () => reject(new Error('decode failed'));

        image.onload = () => {
          try {
            const scale = Math.min(1, this.SELFIE_MAX_EDGE / Math.max(image.width, image.height));
            const canvas = document.createElement('canvas');

            canvas.width = Math.max(1, Math.round(image.width * scale));
            canvas.height = Math.max(1, Math.round(image.height * scale));

            const context = canvas.getContext('2d');
            if (!context) {
              reject(new Error('no canvas context'));
              return;
            }

            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.75));
          } catch {
            reject(new Error('resize failed'));
          }
        };

        image.src = reader.result as string;
      };

      reader.readAsDataURL(file);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUBMIT
  // ══════════════════════════════════════════════════════════════════════════

  private submit(): void {
    if (!this.fix || this.selectedLocationId === null) {
      this.failLocally('Could not get your location.');
      return;
    }

    this.phase = 'submitting';

    const request: AttendanceCheckRequest = {
      locationId:     this.selectedLocationId,
      latitude:       this.fix.latitude,
      longitude:      this.fix.longitude,
      accuracyMetres: this.fix.accuracy,
      qrToken:        this.qrToken,
      selfieBase64:   this.selfieBase64,
    };

    const call = this.action === 'in'
      ? this.checkInService.checkIn(request)
      : this.checkInService.checkOut(request);

    call.pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.result = result;
        this.phase = 'result';

        // Refreshed on success so the card behind the result reflects reality — the
        // buttons, the times and the status all come from the server rather than being
        // patched together on the client.
        if (result.success) this.refreshTodayQuietly();
      },
      error: err => {
        this.result = {
          success: false,
          failureReason: AttendanceFailureReason.None,
          message: err?.status === 0
            ? 'Could not reach the server. Check your connection and try again.'
            : 'Attendance could not be recorded. Please try again.',
          lateMinutes: 0,
          displayStatus: AttendanceDisplayStatus.NotMarked,
          displayStatusLabel: 'Not Marked',
          acceptedWithPoorAccuracy: false,
        };
        this.phase = 'result';
      },
    });
  }

  private refreshTodayQuietly(): void {
    this.checkInService.getToday()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: data => { this.today = data; },
        error: () => { /* the result is already on screen; a failed refresh is not worth an error */ },
      });
  }

  /** A failure that never reached the server — no audit row exists, so say so plainly. */
  private failLocally(message: string): void {
    void this.stopScanner();

    this.result = {
      success: false,
      failureReason: AttendanceFailureReason.CoordinatesMissingOrInvalid,
      message,
      lateMinutes: 0,
      displayStatus: AttendanceDisplayStatus.NotMarked,
      displayStatusLabel: 'Not Marked',
      acceptedWithPoorAccuracy: false,
    };

    this.phase = 'result';
    this.cdr.markForCheck();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEMPLATE HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  cancel(): void {
    void this.stopScanner();
    this.phase = 'ready';
    this.result = null;
  }

  dismissResult(): void {
    this.result = null;
    this.phase = 'ready';
  }

  /** Retry the same action from the top, including a fresh fix and a fresh code. */
  retry(): void {
    this.start(this.action);
  }

  get canRetry(): boolean {
    return !!this.result
        && !this.result.success
        && RETRYABLE_FAILURES.has(this.result.failureReason);
  }

  /** True when the right advice is "scan the current code again". */
  get shouldRescan(): boolean {
    return !!this.result
        && !this.result.success
        && RESCAN_FAILURES.has(this.result.failureReason);
  }

  get actionLabel(): string {
    return this.action === 'in' ? 'Check In' : 'Check Out';
  }

  get selectedLocation(): AttendanceLocationOption | null {
    if (!this.today || this.selectedLocationId === null) return null;
    return this.today.locations.find(l => l.locationId === this.selectedLocationId) ?? null;
  }

  get hasLocationChoice(): boolean {
    return (this.today?.locations.length ?? 0) > 1;
  }

  toneFor(status: AttendanceDisplayStatus): string {
    return this.tone[status] ?? 'secondary';
  }

  /** "8h 05m", or a dash when the day is still open. */
  formatWorked(minutes: number | null | undefined): string {
    if (minutes === null || minutes === undefined) return '—';

    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;

    return `${hours}h ${rest.toString().padStart(2, '0')}m`;
  }

  trackLocation(_index: number, location: AttendanceLocationOption): number {
    return location.locationId;
  }
}
