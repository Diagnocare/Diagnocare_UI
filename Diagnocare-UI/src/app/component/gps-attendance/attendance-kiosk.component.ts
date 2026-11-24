import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import { GpsAttendanceService, KIOSK_TOKEN_KEY, KioskQr } from 'src/app/services/attendanceServices/gps-attendance.service';

/**
 * The wall display: shows the location's rotating QR code. Runs without anyone signed in —
 * it authenticates with the enrolled device token held in this browser, which can request
 * its own location's code and nothing else. Open /attendance-kiosk once on the screen
 * after enrolling it and leave it running.
 */
@Component({
  selector: 'app-attendance-kiosk',
  standalone: true,
  imports: [CommonModule],
  template: `
  <main class="kiosk">
    <ng-container *ngIf="qr; else state">
      <h1>{{ qr.locationName }}</h1>
      <p class="sub">Scan to check in or out</p>
      <img [src]="qr.qrDataUri" alt="Attendance QR code" width="360" height="360">
      <p class="code">{{ qr.manualCode }}</p>
      <p class="sub">Or type this code · refreshes in {{ remaining }}s</p>
    </ng-container>
    <ng-template #state>
      <h1>Attendance display</h1>
      <p class="sub">{{ status }}</p>
    </ng-template>
  </main>`,
  styles: [`
    .kiosk{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
           background:#0f1b2d;color:#fff;text-align:center;padding:24px}
    h1{margin:0 0 4px;font-size:2rem}.sub{color:#b8c4d6;margin:6px 0}
    img{background:#fff;padding:14px;border-radius:16px;max-width:90vw;height:auto}
    .code{font:700 2.4rem/1.2 ui-monospace,Menlo,monospace;letter-spacing:.3em;margin:14px 0 0}
  `],
})
export class AttendanceKioskComponent implements OnInit, OnDestroy {
  qr?: KioskQr;
  status = 'Starting…';
  remaining = 0;

  private refresh?: ReturnType<typeof setTimeout>;
  private tick?: ReturnType<typeof setInterval>;

  constructor(private svc: GpsAttendanceService) {}

  ngOnInit(): void {
    this.load();
    // A countdown only; the actual refresh is scheduled from the server's expiry.
    this.tick = setInterval(() => { if (this.remaining > 0) this.remaining--; }, 1000);
  }

  ngOnDestroy(): void {
    clearTimeout(this.refresh);
    clearInterval(this.tick);
  }

  private load(): void {
    const token = localStorage.getItem(KIOSK_TOKEN_KEY);
    if (!token) {
      this.status = 'This screen is not enrolled. Ask an administrator for the enrolment link.';
      return;
    }

    this.svc.getKioskQr(token).subscribe({
      next: q => {
        this.qr = q;
        this.remaining = q.expiresInSeconds;
        // Fetch the next code a few seconds before this one lapses so the wall never shows a stale code.
        this.refresh = setTimeout(() => this.load(), Math.max(5, q.expiresInSeconds - 5) * 1000);
      },
      error: err => {
        this.qr = undefined;
        this.status = err?.status === 401
          ? 'This screen’s enrolment has expired or been revoked. Enrol it again.'
          : 'Cannot reach the server. Retrying…';
        this.refresh = setTimeout(() => this.load(), 15000);
      },
    });
  }
}

/**
 * Stores a kiosk enrolment token in this browser: /attendance-kiosk/enrol?token=…
 * The token is single-use to read (the server keeps only its hash), so it is removed from
 * the address bar as soon as it is saved.
 */
@Component({
  selector: 'app-kiosk-enrol',
  standalone: true,
  imports: [CommonModule],
  template: `<main style="padding:32px;font-family:sans-serif"><h2>Screen enrolment</h2><p>{{ message }}</p></main>`,
})
export class KioskEnrolComponent implements OnInit {
  message = 'Saving…';

  constructor(private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) { this.message = 'No enrolment token in this link.'; return; }

    localStorage.setItem(KIOSK_TOKEN_KEY, token);
    this.router.navigate(['/attendance-kiosk'], { replaceUrl: true });
  }
}
