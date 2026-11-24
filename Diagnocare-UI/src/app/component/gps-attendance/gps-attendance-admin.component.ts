import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';

import {
  GpsAttendanceService, GpsDashboard, GpsDailyRow, GpsException, GpsLocation, GpsDevice, GpsMonthlyReport,
} from 'src/app/services/attendanceServices/gps-attendance.service';

type Tab = 'dashboard' | 'exceptions' | 'locations' | 'devices';

/** Admin view of GPS attendance: dashboard + reports, exception queue, locations, kiosk devices. */
@Component({
  selector: 'app-gps-attendance-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="ga">
    <h2>GPS attendance</h2>
    <nav class="ga-tabs" role="tablist">
      <button *ngFor="let t of tabs" role="tab" [class.on]="tab === t.id" (click)="open(t.id)">
        {{ t.label }}<span class="badge" *ngIf="t.id === 'exceptions' && (dash?.pendingExceptions ?? 0) > 0">{{ dash?.pendingExceptions }}</span>
      </button>
    </nav>

    <!-- ── Dashboard ─────────────────────────────────────────────── -->
    <section *ngIf="tab === 'dashboard'">
      <div class="ga-bar">
        <label>Date <input type="date" [(ngModel)]="date" (change)="loadDashboard()"></label>
        <button (click)="download('daily','xlsx')">Daily Excel</button>
        <button (click)="download('daily','pdf')">Daily PDF</button>
        <label>Month <input type="month" [(ngModel)]="month"></label>
        <button (click)="loadMonthly()">View month</button>
        <button (click)="download('monthly','xlsx')">Monthly Excel</button>
        <button (click)="download('monthly','pdf')">Monthly PDF</button>
      </div>

      <p *ngIf="dash?.isHoliday" class="note">Holiday: {{ dash?.holidayName }}</p>
      <div class="ga-tiles" *ngIf="dash as d">
        <div><b>{{ d.totalEmployees }}</b><span>Employees</span></div>
        <div><b>{{ d.present }}</b><span>Present</span></div>
        <div><b>{{ d.absent }}</b><span>Absent</span></div>
        <div><b>{{ d.currentlyWorking }}</b><span>Working now</span></div>
        <div><b>{{ d.late }}</b><span>Late</span></div>
        <div><b>{{ d.notMarked }}</b><span>Not yet marked</span></div>
        <div class="warn" *ngIf="d.missingCheckOut"><b>{{ d.missingCheckOut }}</b><span>Missing check-out (30 d)</span></div>
        <div class="warn" *ngIf="d.flaggedLocations"><b>{{ d.flaggedLocations }}</b><span>Flagged locations</span></div>
        <div class="warn" *ngIf="d.pendingExceptions"><b>{{ d.pendingExceptions }}</b><span>Pending exceptions</span></div>
      </div>

      <div class="ga-split" *ngIf="dash as d">
        <div><h4>Office</h4>{{ d.office.present }} present · {{ d.office.late }} late · {{ d.office.currentlyWorking }} working</div>
        <div><h4>Field</h4>{{ d.field.present }} present · {{ d.field.late }} late · {{ d.field.currentlyWorking }} working</div>
      </div>

      <table *ngIf="rows.length">
        <thead><tr><th>Employee</th><th>Status</th><th>Location</th><th>In</th><th>Out</th><th>Late</th><th>Worked</th><th>Method</th></tr></thead>
        <tbody>
          <tr *ngFor="let r of rows" [class.flag]="r.flagged">
            <td>{{ r.fullName }}<span *ngIf="r.flagged" title="Location data looks unreliable"> ⚑</span></td>
            <td>{{ r.status }}</td><td>{{ r.location }}</td><td>{{ r.checkIn }}</td><td>{{ r.checkOut }}</td>
            <td>{{ r.lateMinutes || '' }}</td><td>{{ worked(r.workedMinutes) }}</td><td>{{ r.method }}</td>
          </tr>
        </tbody>
      </table>

      <div *ngIf="monthly as m">
        <h4>{{ m.monthLabel }}</h4>
        <table>
          <thead><tr><th>Employee</th><th>Days</th><th>Present</th><th>Half</th><th>Absent</th><th>Late</th><th>No check-out</th><th>Hours</th></tr></thead>
          <tbody><tr *ngFor="let r of m.rows">
            <td>{{ r.fullName }}</td><td>{{ r.workingDays }}</td><td>{{ r.presentDays }}</td><td>{{ r.halfDays }}</td>
            <td>{{ r.absentDays }}</td><td>{{ r.lateDays }}</td><td>{{ r.missingCheckOutDays }}</td>
            <td>{{ (r.totalWorkedMinutes / 60) | number:'1.0-1' }}</td></tr></tbody>
        </table>
      </div>
    </section>

    <!-- ── Exceptions ────────────────────────────────────────────── -->
    <section *ngIf="tab === 'exceptions'">
      <label>Show
        <select [(ngModel)]="exStatus" (change)="loadExceptions()">
          <option [ngValue]="1">Pending</option><option [ngValue]="2">Approved</option>
          <option [ngValue]="3">Rejected</option><option [ngValue]="0">All</option>
        </select>
      </label>
      <p *ngIf="!exceptions.length">Nothing here.</p>
      <article class="ga-card" *ngFor="let e of exceptions" [class.overdue]="e.isOverdue">
        <header><b>{{ e.fullName }}</b> · {{ e.attendanceDate }} · {{ e.actionLabel }} · {{ e.exceptionTypeLabel }}
          <span class="pill">{{ e.statusLabel }}</span></header>
        <p>{{ e.reason }}</p>
        <small>Requested {{ e.requestedAt }} · {{ e.locationName }}
          <ng-container *ngIf="e.claimedDistanceMetres != null"> · claimed position {{ e.claimedDistanceMetres | number:'1.0-0' }} m from site (accuracy {{ e.claimedAccuracyMetres | number:'1.0-0' }} m, unverified)</ng-container>
        </small>
        <p *ngIf="e.reviewedByName"><small>{{ e.statusLabel }} by {{ e.reviewedByName }} {{ e.reviewedAt }} {{ e.reviewNote ? '— ' + e.reviewNote : '' }}</small></p>
        <div *ngIf="e.status === 1" class="ga-actions">
          <input type="text" placeholder="Note (required to reject)" [(ngModel)]="notes[e.exceptionId]">
          <button class="ok" (click)="decide(e, true)">Approve</button>
          <button class="no" (click)="decide(e, false)">Reject</button>
        </div>
      </article>
    </section>

    <!-- ── Locations ─────────────────────────────────────────────── -->
    <section *ngIf="tab === 'locations'">
      <table *ngIf="locations.length">
        <thead><tr><th>Name</th><th>Type</th><th>Radius</th><th>QR</th><th>Active</th><th></th></tr></thead>
        <tbody><tr *ngFor="let l of locations">
          <td>{{ l.name }}</td><td>{{ l.locationType === 2 ? 'Field' : 'Office' }}</td>
          <td>{{ l.radiusMetres }} m{{ l.usingDefaultRadius ? ' (default)' : '' }}</td>
          <td>{{ l.requireQr ? 'GPS + QR' : 'GPS only' }}</td><td>{{ l.isActive ? 'Yes' : 'No' }}</td>
          <td><button (click)="editLocation(l)">Edit</button></td></tr></tbody>
      </table>

      <form class="ga-form" (ngSubmit)="saveLocation()">
        <h4>{{ form.locationId ? 'Edit location' : 'Add location' }}</h4>
        <label>Name <input name="n" [(ngModel)]="form.name" required></label>
        <label>Address <input name="a" [(ngModel)]="form.address"></label>
        <div class="ga-two">
          <label>Latitude <input name="la" type="number" step="0.000001" [(ngModel)]="form.latitude" required></label>
          <label>Longitude <input name="lo" type="number" step="0.000001" [(ngModel)]="form.longitude" required></label>
        </div>
        <button type="button" (click)="useHere()">Use my current position</button>
        <label>Radius (metres, 0 = default 150) <input name="r" type="number" [(ngModel)]="form.radiusMetres"></label>
        <label>Type
          <select name="t" [(ngModel)]="form.locationType"><option [ngValue]="1">Office</option><option [ngValue]="2">Field / project site</option></select>
        </label>
        <label class="ck"><input name="q" type="checkbox" [(ngModel)]="form.requireQr"> Require the kiosk QR code (untick for GPS-only)</label>
        <label class="ck"><input name="ac" type="checkbox" [(ngModel)]="form.isActive"> Active</label>
        <button type="submit">Save location</button>
        <button type="button" (click)="resetForm()">Clear</button>
      </form>
    </section>

    <!-- ── Devices ───────────────────────────────────────────────── -->
    <section *ngIf="tab === 'devices'">
      <p>A kiosk is the wall screen that shows the QR code. Enrol it once, open the link on that screen, and leave it running.</p>
      <div class="ga-bar">
        <label>Kiosk for
          <select [(ngModel)]="kioskLocation"><option *ngFor="let l of locations" [ngValue]="l.locationId">{{ l.name }}</option></select>
        </label>
        <label>Label <input [(ngModel)]="kioskLabel" placeholder="Reception tablet"></label>
        <button (click)="enrolKiosk()" [disabled]="!kioskLocation">Enrol kiosk</button>
      </div>
      <div class="ga-card" *ngIf="enrolLink">
        <b>Open this link on the kiosk screen (shown once):</b>
        <input readonly [value]="enrolLink" (focus)="$any($event.target).select()">
      </div>
      <table *ngIf="devices.length">
        <thead><tr><th>Type</th><th>Label</th><th>Location</th><th>Expires</th><th>Last used</th><th></th></tr></thead>
        <tbody><tr *ngFor="let d of devices">
          <td>{{ d.isKiosk ? 'Kiosk' : 'Phone' }}</td><td>{{ d.label }}</td><td>{{ d.locationName }}</td>
          <td>{{ d.expiresAt }}</td><td>{{ d.lastUsedAt }}</td>
          <td><button *ngIf="d.isActive" (click)="revoke(d)">Revoke</button></td></tr></tbody>
      </table>
    </section>
  </div>`,
  styles: [`
    .ga{padding:16px;max-width:1100px}
    .ga-tabs{display:flex;gap:6px;margin:8px 0 16px;flex-wrap:wrap}
    .ga-tabs button{padding:8px 14px;border:1px solid #c6ccd4;background:#fff;border-radius:8px;cursor:pointer}
    .ga-tabs button.on{background:#1a5fb4;color:#fff}
    .badge{margin-left:6px;background:#c0392b;color:#fff;border-radius:999px;padding:0 7px;font-size:.75rem}
    .ga-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin-bottom:12px}
    .ga-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:12px 0}
    .ga-tiles div{border:1px solid #d9dee5;border-radius:10px;padding:10px;background:#fff}
    .ga-tiles b{display:block;font-size:1.6rem}.ga-tiles span{font-size:.78rem;color:#556}
    .ga-tiles .warn{border-color:#e0a800;background:#fff8e1}
    .ga-split{display:flex;gap:24px;flex-wrap:wrap;margin-bottom:12px}
    table{border-collapse:collapse;width:100%;margin:10px 0;font-size:.9rem}
    th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e3e7ec}tr.flag{background:#fff8e1}
    .ga-card{border:1px solid #d9dee5;border-radius:10px;padding:10px;margin:10px 0;background:#fff}
    .ga-card.overdue{border-color:#c0392b}
    .pill{font-size:.75rem;background:#eef2f7;border-radius:999px;padding:1px 8px;margin-left:6px}
    .ga-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}.ga-actions input{flex:1;min-width:200px;padding:6px}
    .ok{background:#1a7f4b;color:#fff}.no{background:#b3261e;color:#fff}
    button{padding:7px 12px;border-radius:8px;border:1px solid #c6ccd4;cursor:pointer}
    .ga-form{display:grid;gap:8px;max-width:480px;margin-top:18px}.ga-form label{display:flex;flex-direction:column;gap:3px}
    .ga-form .ck{flex-direction:row;align-items:center;gap:8px}.ga-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    input,select{padding:7px;border:1px solid #c6ccd4;border-radius:6px}.note{color:#8a5a00}
  `],
})
export class GpsAttendanceAdminComponent implements OnInit {
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard & reports' }, { id: 'exceptions', label: 'Exceptions' },
    { id: 'locations', label: 'Locations' }, { id: 'devices', label: 'Kiosk screens' },
  ];
  tab: Tab = 'dashboard';

  date = new Date().toISOString().slice(0, 10);
  month = new Date().toISOString().slice(0, 7);
  dash?: GpsDashboard;
  rows: GpsDailyRow[] = [];
  monthly?: GpsMonthlyReport;

  exStatus = 1;
  exceptions: GpsException[] = [];
  notes: Record<number, string> = {};

  locations: GpsLocation[] = [];
  form: Partial<GpsLocation> = this.blank();

  devices: GpsDevice[] = [];
  kioskLocation = 0;
  kioskLabel = '';
  enrolLink = '';

  constructor(private svc: GpsAttendanceService, private toastr: ToastrService) {}

  ngOnInit(): void { this.loadDashboard(); this.loadLocations(); }

  open(t: Tab): void {
    this.tab = t;
    if (t === 'exceptions') this.loadExceptions();
    if (t === 'locations' || t === 'devices') this.loadLocations();
    if (t === 'devices') this.loadDevices();
  }

  worked(m?: number): string { return m == null ? '' : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; }

  // ── Dashboard ──
  loadDashboard(): void {
    this.svc.dashboard(this.date).subscribe(d => (this.dash = d));
    this.svc.daily(this.date).subscribe(r => (this.rows = r));
  }

  loadMonthly(): void {
    const [y, m] = this.month.split('-').map(Number);
    this.svc.monthly(y, m).subscribe(r => (this.monthly = r));
  }

  download(kind: 'daily' | 'monthly', format: 'xlsx' | 'pdf'): void {
    const [y, m] = this.month.split('-').map(Number);
    const req = kind === 'daily' ? this.svc.exportDaily(this.date, format) : this.svc.exportMonthly(y, m, format);
    req.subscribe(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = kind === 'daily' ? `attendance-${this.date}.${format}` : `attendance-${y}-${String(m).padStart(2, '0')}.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  // ── Exceptions ──
  loadExceptions(): void {
    this.svc.exceptions(this.exStatus || undefined).subscribe(r => (this.exceptions = r.items));
  }

  decide(e: GpsException, approve: boolean): void {
    const note = (this.notes[e.exceptionId] ?? '').trim();
    if (!approve && note.length < 5) { this.toastr.warning('Enter a reason to reject.'); return; }

    (approve ? this.svc.approve(e.exceptionId, note) : this.svc.reject(e.exceptionId, note)).subscribe({
      next: r => { r.success ? this.toastr.success(r.message) : this.toastr.warning(r.message); this.loadExceptions(); this.loadDashboard(); },
      error: err => this.toastr.warning(err?.error?.message ?? 'Could not save the decision.'),
    });
  }

  // ── Locations ──
  private blank(): Partial<GpsLocation> {
    return { locationId: 0, name: '', address: '', latitude: undefined, longitude: undefined, radiusMetres: 0, isActive: true, locationType: 1, requireQr: true };
  }

  loadLocations(): void { this.svc.locations().subscribe(l => { this.locations = l; if (!this.kioskLocation && l.length) this.kioskLocation = l[0].locationId; }); }
  editLocation(l: GpsLocation): void { this.form = { ...l }; window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }
  resetForm(): void { this.form = this.blank(); }

  async useHere(): Promise<void> {
    try {
      const p = await this.svc.getPosition();
      this.form.latitude = +p.coords.latitude.toFixed(6);
      this.form.longitude = +p.coords.longitude.toFixed(6);
      this.toastr.info(`Position set (accuracy ±${Math.round(p.coords.accuracy)} m). Stand at the centre of the site.`);
    } catch { this.toastr.warning('Could not read your position.'); }
  }

  saveLocation(): void {
    this.svc.saveLocation(this.form).subscribe({
      next: r => { r.success ? this.toastr.success(r.message) : this.toastr.warning(r.message); if (r.success) { this.resetForm(); this.loadLocations(); } },
      error: err => this.toastr.warning(err?.error?.message ?? 'Could not save the location.'),
    });
  }

  // ── Devices ──
  loadDevices(): void { this.svc.devices().subscribe(d => (this.devices = d)); }

  enrolKiosk(): void {
    this.svc.enrolDevice({ userId: 0, isKiosk: true, locationId: this.kioskLocation, label: this.kioskLabel || 'Kiosk' }).subscribe({
      next: r => {
        this.enrolLink = `${location.origin}/attendance-kiosk/enrol?token=${encodeURIComponent(r.token)}`;
        this.loadDevices();
      },
      error: err => this.toastr.warning(err?.error?.message ?? 'Could not enrol the kiosk.'),
    });
  }

  revoke(d: GpsDevice): void {
    const reason = prompt('Reason for revoking this device?');
    if (!reason) return;
    this.svc.revokeDevice(d.deviceId, reason).subscribe(() => this.loadDevices());
  }
}
