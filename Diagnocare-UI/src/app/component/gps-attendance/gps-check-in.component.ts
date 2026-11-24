import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ToastrService } from 'ngx-toastr';

import {
  GpsAttendanceService, GpsToday, GpsException, GpsLocationOption, GpsCheckResult,
} from 'src/app/services/attendanceServices/gps-attendance.service';

// Backend AttendanceFailureReason values that mean "location itself failed" — the cases
// where an exception request is the right next step.
const EXCEPTION_REASONS = new Set([5, 6, 7, 23]);

/**
 * GPS check-in / check-out for the signed-in employee, used on the My Attendance page and
 * on /check-in (the target of the kiosk QR deep link).
 *
 * The browser's location is read only when a button is pressed. Everything that matters —
 * distance, accuracy, duplicates, timestamps — is decided by the server; this component
 * only reports what the device says.
 */
@Component({
  selector: 'app-gps-check-in',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <section class="gca" *ngIf="today">
    <header class="gca-head">
      <div>
        <h3>Today · {{ today.dayName }} {{ today.date }}</h3>
        <small *ngIf="today.shiftName">Shift {{ today.shiftName }} {{ today.shiftStart }}–{{ today.shiftEnd }}</small>
      </div>
      <span class="gca-pill">{{ today.displayStatusLabel }}</span>
    </header>

    <div class="gca-times">
      <div><label>Check in</label><strong>{{ today.checkInAt || '—' }}</strong></div>
      <div><label>Check out</label><strong>{{ today.checkOutAt || '—' }}</strong></div>
      <div><label>Worked</label><strong>{{ worked(today.workedMinutes) }}</strong></div>
      <div *ngIf="today.lateMinutes > 0"><label>Late</label><strong>{{ today.lateMinutes }} min</strong></div>
    </div>

    <p class="gca-blocked" *ngIf="today.blockedReason">{{ today.blockedReason }}</p>

    <div class="gca-row" *ngIf="today.locations.length > 1 && (today.canCheckIn || today.canCheckOut)">
      <label for="gca-loc">Location</label>
      <select id="gca-loc" [(ngModel)]="locationId" [disabled]="busy || today.hasCheckedIn">
        <option *ngFor="let l of today.locations" [ngValue]="l.locationId">
          {{ l.name }} ({{ l.locationType === 2 ? 'Field' : 'Office' }})
        </option>
      </select>
    </div>

    <div class="gca-row" *ngIf="needsQr()">
      <label for="gca-qr">Code shown on the laboratory screen</label>
      <input id="gca-qr" type="text" [(ngModel)]="qrToken" autocomplete="off" autocapitalize="characters"
             placeholder="Scan the QR with your camera, or type the code">
    </div>

    <div class="gca-actions">
      <button type="button" class="btn-in" (click)="submit('in')" [disabled]="busy || !today.canCheckIn || !locationId">
        {{ busy && action === 'in' ? 'Getting location…' : 'Check in' }}
      </button>
      <button type="button" class="btn-out" (click)="submit('out')" [disabled]="busy || !today.canCheckOut">
        {{ busy && action === 'out' ? 'Getting location…' : 'Check out' }}
      </button>
    </div>

    <p class="gca-msg" [class.ok]="lastOk" [class.bad]="lastOk === false" *ngIf="message" role="status">{{ message }}</p>

    <!-- Exception request: GPS refused, no network, or somewhere unassigned -->
    <div class="gca-ex" *ngIf="showException">
      <h4>Request approval instead</h4>
      <p>An administrator will review this. Nothing is recorded until they approve.</p>
      <div class="gca-row">
        <label for="gca-type">What happened?</label>
        <select id="gca-type" [(ngModel)]="exType">
          <option [ngValue]="1">Location permission denied / unavailable</option>
          <option [ngValue]="2">No network connection</option>
          <option [ngValue]="3">I am at a different work location</option>
          <option [ngValue]="4">Something else</option>
        </select>
      </div>
      <div class="gca-row">
        <label for="gca-reason">Reason (required)</label>
        <textarea id="gca-reason" rows="3" maxlength="500" [(ngModel)]="exReason"></textarea>
      </div>
      <button type="button" class="btn-in" (click)="sendException()" [disabled]="busy || exReason.trim().length < 10">
        Send request
      </button>
      <button type="button" class="btn-link" (click)="showException = false">Cancel</button>
    </div>
    <button type="button" class="btn-link" *ngIf="!showException && (today.canCheckIn || today.canCheckOut)"
            (click)="openException()">Can't check in with GPS? Request approval</button>

    <div class="gca-list" *ngIf="exceptions.length">
      <h4>My requests</h4>
      <ul>
        <li *ngFor="let e of exceptions">
          <span>{{ e.attendanceDate }} · {{ e.actionLabel }} · {{ e.exceptionTypeLabel }}</span>
          <span class="gca-pill" [class.approved]="e.status === 2" [class.rejected]="e.status === 3">{{ e.statusLabel }}</span>
          <small *ngIf="e.reviewNote">“{{ e.reviewNote }}”</small>
          <button type="button" class="btn-link" *ngIf="e.status === 1" (click)="cancel(e)">Cancel</button>
        </li>
      </ul>
    </div>
  </section>
  <p *ngIf="!today && loadError">{{ loadError }}</p>
  `,
  styles: [`
    .gca{max-width:520px;margin:0 auto;padding:16px;border:1px solid #d9dee5;border-radius:12px;background:#fff}
    .gca-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
    .gca-head h3{margin:0;font-size:1.05rem}
    .gca-pill{font-size:.78rem;padding:2px 10px;border-radius:999px;background:#eef2f7}
    .gca-pill.approved{background:#dff5e6}.gca-pill.rejected{background:#fde4e4}
    .gca-times{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;margin:14px 0}
    .gca-times label{display:block;font-size:.72rem;color:#667}
    .gca-row{display:flex;flex-direction:column;gap:4px;margin:10px 0}
    .gca-row select,.gca-row input,.gca-row textarea{font-size:16px;padding:10px;border:1px solid #c6ccd4;border-radius:8px}
    .gca-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
    button{font-size:1rem;min-height:48px;border-radius:10px;border:0;cursor:pointer}
    .btn-in{background:#1a7f4b;color:#fff}.btn-out{background:#b4551d;color:#fff}
    button[disabled]{opacity:.5;cursor:not-allowed}
    .btn-link{background:none;color:#1a5fb4;min-height:36px;text-decoration:underline}
    .gca-msg{margin-top:12px;padding:10px;border-radius:8px;background:#eef2f7}
    .gca-msg.ok{background:#dff5e6}.gca-msg.bad{background:#fde4e4}
    .gca-blocked{color:#8a5a00}
    .gca-ex{margin-top:14px;padding:12px;border:1px dashed #c6ccd4;border-radius:10px}
    .gca-list ul{list-style:none;padding:0}.gca-list li{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #eee}
  `],
})
export class GpsCheckInComponent implements OnInit {
  today?: GpsToday;
  exceptions: GpsException[] = [];
  loadError = '';

  locationId = 0;
  qrToken = '';
  busy = false;
  action: 'in' | 'out' | '' = '';
  message = '';
  lastOk: boolean | null = null;

  showException = false;
  exType = 1;
  exReason = '';
  private exAction: 1 | 2 = 1;
  private lastPosition?: { lat: number; lon: number; acc: number };

  constructor(
    private svc: GpsAttendanceService,
    private route: ActivatedRoute,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    // The kiosk QR is a deep link: /check-in?token=…  The code is prefilled, not submitted —
    // the employee still presses Check in, so GPS is only ever read on a deliberate tap.
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) this.qrToken = token;
    this.reload();
  }

  needsQr(): boolean {
    const loc = this.selected();
    return !!loc && loc.requireQr && !!this.today && (this.today.canCheckIn || this.today.canCheckOut);
  }

  worked(min?: number): string { return min == null ? '—' : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`; }

  private selected(): GpsLocationOption | undefined {
    return this.today?.locations.find(l => l.locationId === this.locationId);
  }

  private reload(): void {
    this.svc.getToday().subscribe({
      next: t => {
        this.today = t;
        if (!this.locationId) {
          this.locationId = (t.locations.find(l => l.isPrimary) ?? t.locations[0])?.locationId ?? 0;
        }
      },
      error: () => { this.loadError = 'Could not load today’s attendance.'; },
    });
    this.svc.myExceptions().subscribe({ next: e => (this.exceptions = e), error: () => {} });
  }

  async submit(kind: 'in' | 'out'): Promise<void> {
    if (this.busy || !this.today) return;
    this.busy = true; this.action = kind; this.message = ''; this.lastOk = null; this.showException = false;

    let pos: GeolocationPosition;
    try {
      pos = await this.svc.getPosition();
    } catch (err: any) {
      this.busy = false; this.action = '';
      this.lastOk = false;
      this.message = err?.code === 1
        ? 'Location permission was denied. Allow location for this site in your browser settings, or request approval below.'
        : 'Your location could not be read. Move near a window and try again, or request approval below.';
      this.exType = 1; this.exAction = kind === 'in' ? 1 : 2;
      this.showException = true;
      return;
    }

    this.lastPosition = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy };
    const body = {
      locationId: this.locationId,
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracyMetres: pos.coords.accuracy,
      qrToken: this.needsQr() ? this.qrToken.trim() || null : null,
      positionTimestampMs: pos.timestamp,
    };

    const call = kind === 'in' ? this.svc.doCheckIn(body) : this.svc.doCheckOut(body);
    call.subscribe({
      next: r => this.onResult(r, kind),
      error: () => {
        // Network failure or server error: the attempt never reached a decision.
        this.busy = false; this.action = '';
        this.lastOk = false;
        this.message = 'Could not reach the server. Check your connection and try again, or request approval below.';
        this.exType = 2; this.exAction = kind === 'in' ? 1 : 2;
        this.showException = true;
      },
    });
  }

  private onResult(r: GpsCheckResult, kind: 'in' | 'out'): void {
    this.busy = false; this.action = '';
    this.lastOk = r.success;
    this.message = r.message;
    if (r.success) { this.qrToken = ''; this.reload(); return; }

    if (EXCEPTION_REASONS.has(r.failureReason)) {
      // Outside the geofence → most likely "different location"; the rest are GPS problems.
      this.exType = r.failureReason === 6 ? 3 : 1;
      this.exAction = kind === 'in' ? 1 : 2;
      this.showException = true;
    }
  }

  openException(): void { this.exAction = this.today?.canCheckOut && !this.today?.canCheckIn ? 2 : 1; this.showException = true; }

  sendException(): void {
    if (this.busy) return;
    this.busy = true;
    const body = {
      exceptionType: this.exType,
      action: this.exAction,
      locationId: this.locationId,
      reason: this.exReason.trim(),
      latitude: this.lastPosition?.lat ?? null,
      longitude: this.lastPosition?.lon ?? null,
      accuracyMetres: this.lastPosition?.acc ?? null,
    };
    this.svc.createException(body).subscribe({
      next: r => {
        this.busy = false;
        if (r.success) { this.toastr.success(r.message); this.showException = false; this.exReason = ''; this.reload(); }
        else this.toastr.warning(r.message);
      },
      error: err => {
        this.busy = false;
        this.toastr.warning(err?.error?.message ?? 'The request could not be sent. Try again when you are online.');
      },
    });
  }

  cancel(e: GpsException): void {
    this.svc.cancelException(e.exceptionId).subscribe({ next: () => this.reload(), error: () => {} });
  }
}
