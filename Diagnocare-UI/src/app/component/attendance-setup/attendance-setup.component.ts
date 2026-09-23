import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ToastrService } from 'ngx-toastr';

import { AttendanceAdminService } from 'src/app/services/attendanceServices/attendance-admin.service';
import { MemberService } from 'src/app/services/memberService/member.service';
import { ConfirmModalService } from 'src/app/shared/confirm-modal/confirm-modal.service';
import { ConfirmModalComponent } from 'src/app/shared/confirm-modal/confirm-modal.component';
import { acquirePosition, describeGeoFailure, describeGeolocationSupport, GeolocationError }
  from 'src/app/shared/geolocation.util';
import { AttendanceQr } from 'src/app/models/attendanceVerification/attendance-verification.model';
import {
  AttendanceDevice,
  AttendanceLocation,
  AttendanceLocationSave,
  EmployeeShift,
  EnrolAttendanceDevice,
  EnrolAttendanceDeviceResult,
  Shift,
  ShiftSave,
} from 'src/app/models/attendanceVerification/attendance-admin.model';

export type AttendanceSetupTab = 'locations' | 'shifts' | 'assignments' | 'devices';

/** An employee as this screen needs them — everything else on MemberDto is noise here. */
interface EmployeeOption {
  userId: number;
  name: string;
}

/**
 * Everything the attendance module has to be told before anybody can check in.
 *
 * <b>Why one screen with four tabs.</b> These four things are configured once, together,
 * on the day the module is switched on, and then barely touched again. Splitting them
 * across four routes would mean four nav entries for a page each administrator visits
 * twice a year, and would hide the fact that they are a sequence: a location has to exist
 * before a kiosk can display its code, and a shift has to exist before "late" means
 * anything.
 *
 * <b>The one screen where getting it wrong is expensive.</b> Device enrolment. The token
 * is shown once and never again — only its hash is stored — so a token dismissed before
 * it is copied is an enrolment that has to be redone. The enrolment panel therefore does
 * not close on a stray click, puts the copyable link above the raw token (the link is
 * what an administrator actually needs to send), and asks for confirmation on dismiss.
 *
 * Admin and Super Admin, matching <c>AttendanceSetupController</c>'s AdminOrSuperAdmin
 * policy. Correction — the one action here that can change what somebody is paid — lives
 * on the dashboard screen, not this one.
 */
@Component({
  selector: 'app-attendance-setup',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmModalComponent],
  templateUrl: './attendance-setup.component.html',
  styleUrls: ['./attendance-setup.component.scss'],
})
export class AttendanceSetupComponent implements OnInit, OnDestroy {

  activeTab: AttendanceSetupTab = 'locations';

  /** Loaded once and shared by the assignment and device tabs. */
  employees: EmployeeOption[] = [];
  employeesLoading = false;

  // ── Locations ──────────────────────────────────────────────────────────────

  locations: AttendanceLocation[] = [];
  locationsLoading = false;
  showInactiveLocations = false;

  locationForm: AttendanceLocationSave = AttendanceSetupComponent.emptyLocation();
  locationFormOpen = false;
  locationSaving = false;
  locationError = '';

  /** GPS capture for the coordinate fields. */
  locating = false;
  locatingMessage = '';
  locateError = '';

  // ── QR preview ─────────────────────────────────────────────────────────────

  qrPreview: AttendanceQr | null = null;
  qrPreviewLoading = false;
  qrSecondsLeft = 0;
  private qrTimer: ReturnType<typeof setInterval> | null = null;

  // ── Shifts ─────────────────────────────────────────────────────────────────

  shifts: Shift[] = [];
  shiftsLoading = false;
  showInactiveShifts = false;

  shiftForm: ShiftSave = AttendanceSetupComponent.emptyShift();
  shiftFormOpen = false;
  shiftSaving = false;
  shiftError = '';

  // ── Assignments ────────────────────────────────────────────────────────────

  assignments: EmployeeShift[] = [];
  assignmentsLoading = false;

  assignUserId: number | null = null;
  assignShiftId: number | null = null;
  assignEffectiveFrom = AttendanceSetupComponent.todayIso();
  assignSaving = false;
  assignError = '';

  /** Which locations one employee is allowed to check in at. */
  locAssignUserId: number | null = null;
  locAssignSelected: number[] = [];
  locAssignPrimaryId: number | null = null;
  locAssignSaving = false;
  locAssignError = '';

  // ── Devices ────────────────────────────────────────────────────────────────

  devices: AttendanceDevice[] = [];
  devicesLoading = false;
  showRevokedDevices = false;

  enrolForm: EnrolAttendanceDevice = AttendanceSetupComponent.emptyEnrolment();
  enrolFormOpen = false;
  enrolSaving = false;
  enrolError = '';

  /** The one and only sight of a freshly minted token. */
  enrolResult: EnrolAttendanceDeviceResult | null = null;
  enrolLink = '';
  copied: '' | 'link' | 'token' = '';

  constructor(
    private admin: AttendanceAdminService,
    private members: MemberService,
    private confirmModal: ConfirmModalService,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.loadLocations();
  }

  ngOnDestroy(): void {
    this.stopQrTimer();
  }

  switchTab(tab: AttendanceSetupTab): void {
    this.activeTab = tab;
    this.closeQrPreview();

    // Loaded on first open rather than up front: an administrator adding a location
    // should not wait on three lists they are not going to look at.
    if (tab === 'shifts' && this.shifts.length === 0 && !this.shiftsLoading) {
      this.loadShifts();
    }

    if (tab === 'assignments') {
      this.loadEmployees();
      if (this.shifts.length === 0 && !this.shiftsLoading) this.loadShifts();
      if (this.locations.length === 0 && !this.locationsLoading) this.loadLocations();
      if (this.assignments.length === 0 && !this.assignmentsLoading) this.loadAssignments();
    }

    if (tab === 'devices') {
      this.loadEmployees();
      if (this.locations.length === 0 && !this.locationsLoading) this.loadLocations();
      if (this.devices.length === 0 && !this.devicesLoading) this.loadDevices();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Employees
  // ═══════════════════════════════════════════════════════════════════════════

  private loadEmployees(): void {
    if (this.employees.length > 0 || this.employeesLoading) return;

    this.employeesLoading = true;
    this.members.getAll().subscribe({
      next: list => {
        this.employees = list
          .filter(m => m.isActive !== false)
          .map(m => ({
            userId: m.id,
            name: `${m.first_Name ?? ''} ${m.last_Name ?? ''}`.trim() || (m.user_Name ?? `#${m.id}`),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        this.employeesLoading = false;
      },
      error: () => { this.employeesLoading = false; },
    });
  }

  employeeName(userId: number | null | undefined): string {
    if (!userId) return '';
    return this.employees.find(e => e.userId === userId)?.name ?? `#${userId}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Locations
  // ═══════════════════════════════════════════════════════════════════════════

  loadLocations(): void {
    this.locationsLoading = true;
    this.admin.getLocations(this.showInactiveLocations).subscribe({
      next: list => { this.locations = list; this.locationsLoading = false; },
      error: () => { this.locationsLoading = false; },
    });
  }

  toggleInactiveLocations(): void {
    this.showInactiveLocations = !this.showInactiveLocations;
    this.loadLocations();
  }

  newLocation(): void {
    this.locationForm = AttendanceSetupComponent.emptyLocation();
    this.locationFormOpen = true;
    this.locationError = '';
    this.locateError = '';
    this.locatingMessage = '';
  }

  editLocation(loc: AttendanceLocation): void {
    this.locationForm = {
      locationId: loc.locationId,
      name: loc.name,
      address: loc.address ?? '',
      latitude: loc.latitude,
      longitude: loc.longitude,
      // 0 means "fall back to the configured default", and that is exactly what a
      // location currently on the default should send back if left alone.
      radiusMetres: loc.usingDefaultRadius ? 0 : loc.radiusMetres,
      isActive: loc.isActive,
    };
    this.locationFormOpen = true;
    this.locationError = '';
    this.locateError = '';
    this.locatingMessage = '';
  }

  cancelLocation(): void {
    this.locationFormOpen = false;
    this.locationError = '';
  }

  /**
   * Fills the coordinate fields from the browser's own position.
   *
   * The intended workflow is that an administrator stands in the reception area with a
   * laptop and presses this, rather than copying numbers out of a map. Reuses the
   * employee screen's acquisition helper, so it waits for the fix to settle instead of
   * taking the first cell-tower estimate — a 300 m fix here would silently produce a
   * geofence centred on the wrong side of the building.
   */
  useCurrentLocation(): void {
    const unsupported = describeGeolocationSupport();
    if (unsupported) {
      this.locateError = describeGeoFailure(unsupported);
      return;
    }

    this.locating = true;
    this.locateError = '';
    this.locatingMessage = 'Getting a position…';

    acquirePosition({
      targetAccuracyMetres: 25,
      maxWaitMs: 20000,
      onProgress: fix => {
        this.locatingMessage = `Accurate to about ${Math.round(fix.accuracy)} m — still improving…`;
      },
    }).then(fix => {
      this.locationForm.latitude = Number(fix.latitude.toFixed(6));
      this.locationForm.longitude = Number(fix.longitude.toFixed(6));
      this.locating = false;
      this.locatingMessage = fix.timedOut
        ? `Used the best fix available — accurate to about ${Math.round(fix.accuracy)} m. Check it looks right before saving.`
        : `Position captured, accurate to about ${Math.round(fix.accuracy)} m.`;
    }).catch((err: unknown) => {
      this.locating = false;
      this.locatingMessage = '';
      this.locateError = err instanceof GeolocationError
        ? describeGeoFailure(err.reason)
        : 'Could not get a position from this device.';
    });
  }

  saveLocation(): void {
    const form = this.locationForm;
    this.locationError = '';

    if (!form.name || form.name.trim().length < 2) {
      this.locationError = 'Give the location a name staff will recognise.';
      return;
    }
    if (!this.isLatitude(form.latitude) || !this.isLongitude(form.longitude)) {
      this.locationError = 'Latitude must be between -90 and 90, longitude between -180 and 180.';
      return;
    }
    if (form.latitude === 0 && form.longitude === 0) {
      this.locationError = 'Those coordinates are in the Atlantic. Capture the position or enter it properly.';
      return;
    }
    if (form.radiusMetres < 0 || form.radiusMetres > 5000) {
      this.locationError = 'Radius must be between 0 (use the default) and 5000 metres.';
      return;
    }

    this.locationSaving = true;
    this.admin.saveLocation({ ...form, name: form.name.trim(), address: (form.address ?? '').trim() || null })
      .subscribe({
        next: result => {
          this.locationSaving = false;
          if (!result.success) { this.locationError = result.message; return; }
          this.toastr.success(result.message || 'Location saved.');
          this.locationFormOpen = false;
          this.loadLocations();
        },
        error: () => { this.locationSaving = false; },
      });
  }

  deactivateLocation(loc: AttendanceLocation): void {
    this.confirmModal.confirm({
      title: 'Deactivate Location',
      message: `Deactivate "${loc.name}"? Nobody will be able to check in there, and its kiosk will stop `
        + 'showing a code. Attendance already recorded is unchanged.',
      confirmText: 'Deactivate',
      cancelText: 'Cancel',
    }).subscribe(confirmed => {
      if (!confirmed) return;

      this.admin.saveLocation({
        locationId: loc.locationId,
        name: loc.name,
        address: loc.address ?? null,
        latitude: loc.latitude,
        longitude: loc.longitude,
        radiusMetres: loc.usingDefaultRadius ? 0 : loc.radiusMetres,
        isActive: false,
      }).subscribe(result => {
        if (result.success) this.toastr.success('Location deactivated.');
        this.loadLocations();
      });
    });
  }

  // ── QR preview ─────────────────────────────────────────────────────────────

  /**
   * Shows the code a kiosk at this location is displaying right now.
   *
   * Deliberately the live rotation rather than a freshly minted one: previewing must not
   * invalidate the code staff are standing in front of.
   */
  previewQr(loc: AttendanceLocation): void {
    this.qrPreviewLoading = true;
    this.stopQrTimer();

    this.admin.previewLocationQr(loc.locationId).subscribe({
      next: qr => {
        this.qrPreview = qr;
        this.qrSecondsLeft = qr.expiresInSeconds;
        this.qrPreviewLoading = false;
        this.startQrTimer();
      },
      error: () => { this.qrPreviewLoading = false; },
    });
  }

  closeQrPreview(): void {
    this.qrPreview = null;
    this.stopQrTimer();
  }

  private startQrTimer(): void {
    this.qrTimer = setInterval(() => {
      this.qrSecondsLeft = Math.max(0, this.qrSecondsLeft - 1);
      if (this.qrSecondsLeft === 0) this.stopQrTimer();
    }, 1000);
  }

  private stopQrTimer(): void {
    if (this.qrTimer !== null) {
      clearInterval(this.qrTimer);
      this.qrTimer = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Shifts
  // ═══════════════════════════════════════════════════════════════════════════

  loadShifts(): void {
    this.shiftsLoading = true;
    this.admin.getShifts(this.showInactiveShifts).subscribe({
      next: list => { this.shifts = list; this.shiftsLoading = false; },
      error: () => { this.shiftsLoading = false; },
    });
  }

  toggleInactiveShifts(): void {
    this.showInactiveShifts = !this.showInactiveShifts;
    this.loadShifts();
  }

  newShift(): void {
    this.shiftForm = AttendanceSetupComponent.emptyShift();
    this.shiftFormOpen = true;
    this.shiftError = '';
  }

  editShift(shift: Shift): void {
    this.shiftForm = {
      shiftId: shift.shiftId,
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      graceMinutes: shift.graceMinutes,
      lateAfterMinutes: shift.lateAfterMinutes,
      halfDayAfterMinutes: shift.halfDayAfterMinutes,
      minimumWorkMinutes: shift.minimumWorkMinutes,
      isActive: shift.isActive,
    };
    this.shiftFormOpen = true;
    this.shiftError = '';
  }

  cancelShift(): void {
    this.shiftFormOpen = false;
    this.shiftError = '';
  }

  saveShift(): void {
    const form = this.shiftForm;
    this.shiftError = '';

    if (!form.name || form.name.trim().length < 2) {
      this.shiftError = 'Give the shift a name.';
      return;
    }
    if (!form.startTime || !form.endTime) {
      this.shiftError = 'Both a start and an end time are needed.';
      return;
    }
    if (form.startTime >= form.endTime) {
      // Overnight shifts are not supported yet — the server would store a window that
      // ends before it begins. Said plainly rather than silently accepted.
      this.shiftError = 'The end time must be later than the start time. Overnight shifts are not supported yet.';
      return;
    }
    if (form.graceMinutes < 0 || form.lateAfterMinutes < 0
      || form.halfDayAfterMinutes < 0 || form.minimumWorkMinutes < 0) {
      this.shiftError = 'Minute values cannot be negative.';
      return;
    }
    if (form.lateAfterMinutes < form.graceMinutes) {
      this.shiftError = '"Late after" cannot be earlier than the grace period — nobody would ever be merely late.';
      return;
    }
    if (form.halfDayAfterMinutes > 0 && form.halfDayAfterMinutes <= form.lateAfterMinutes) {
      this.shiftError = '"Half day after" must be later than "late after", or every late arrival becomes a half day.';
      return;
    }

    this.shiftSaving = true;
    this.admin.saveShift({ ...form, name: form.name.trim() }).subscribe({
      next: result => {
        this.shiftSaving = false;
        if (!result.success) { this.shiftError = result.message; return; }
        this.toastr.success(result.message || 'Shift saved.');
        this.shiftFormOpen = false;
        this.loadShifts();
      },
      error: () => { this.shiftSaving = false; },
    });
  }

  deactivateShift(shift: Shift): void {
    this.confirmModal.confirm({
      title: 'Deactivate Shift',
      message: `Deactivate "${shift.name}"? It stays attached to the ${shift.assignedEmployeeCount} `
        + 'employee(s) already on it — this only stops it being assigned to anybody new.',
      confirmText: 'Deactivate',
      cancelText: 'Cancel',
    }).subscribe(confirmed => {
      if (!confirmed) return;

      this.admin.saveShift({
        shiftId: shift.shiftId,
        name: shift.name,
        startTime: shift.startTime,
        endTime: shift.endTime,
        graceMinutes: shift.graceMinutes,
        lateAfterMinutes: shift.lateAfterMinutes,
        halfDayAfterMinutes: shift.halfDayAfterMinutes,
        minimumWorkMinutes: shift.minimumWorkMinutes,
        isActive: false,
      }).subscribe(result => {
        if (result.success) this.toastr.success('Shift deactivated.');
        this.loadShifts();
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Assignments
  // ═══════════════════════════════════════════════════════════════════════════

  loadAssignments(): void {
    this.assignmentsLoading = true;
    this.admin.getShiftAssignments().subscribe({
      next: list => { this.assignments = list; this.assignmentsLoading = false; },
      error: () => { this.assignmentsLoading = false; },
    });
  }

  assignShift(): void {
    this.assignError = '';

    if (!this.assignUserId) { this.assignError = 'Choose an employee.'; return; }
    if (!this.assignShiftId) { this.assignError = 'Choose a shift.'; return; }
    if (!this.assignEffectiveFrom) { this.assignError = 'Choose the date the shift starts applying.'; return; }

    this.assignSaving = true;
    this.admin.assignShift({
      userId: this.assignUserId,
      shiftId: this.assignShiftId,
      effectiveFrom: this.assignEffectiveFrom,
      effectiveTo: null,
    }).subscribe({
      next: result => {
        this.assignSaving = false;
        if (!result.success) { this.assignError = result.message; return; }
        this.toastr.success(result.message || 'Shift assigned.');
        this.assignUserId = null;
        this.assignShiftId = null;
        this.assignEffectiveFrom = AttendanceSetupComponent.todayIso();
        this.loadAssignments();
        this.loadShifts();
      },
      error: () => { this.assignSaving = false; },
    });
  }

  /** Employees with no shift at all — the reason check-in silently refuses them. */
  get unassignedEmployees(): EmployeeOption[] {
    const assigned = new Set(this.assignments.filter(a => a.isCurrent).map(a => a.userId));
    return this.employees.filter(e => !assigned.has(e.userId));
  }

  // ── Location access ────────────────────────────────────────────────────────

  onLocAssignUserChange(): void {
    this.locAssignSelected = [];
    this.locAssignPrimaryId = null;
    this.locAssignError = '';
  }

  toggleLocAssign(locationId: number): void {
    const at = this.locAssignSelected.indexOf(locationId);

    if (at >= 0) {
      this.locAssignSelected.splice(at, 1);
      if (this.locAssignPrimaryId === locationId) this.locAssignPrimaryId = null;
    } else {
      this.locAssignSelected.push(locationId);
      this.locAssignPrimaryId ??= locationId;
    }
  }

  isLocAssigned(locationId: number): boolean {
    return this.locAssignSelected.includes(locationId);
  }

  saveLocationAccess(): void {
    this.locAssignError = '';

    if (!this.locAssignUserId) { this.locAssignError = 'Choose an employee.'; return; }
    if (this.locAssignSelected.length === 0) {
      this.locAssignError = 'Pick at least one location, or this employee will not be able to check in anywhere.';
      return;
    }

    this.locAssignSaving = true;
    this.admin.assignEmployeeLocations({
      userId: this.locAssignUserId,
      locationIds: [...this.locAssignSelected],
      primaryLocationId: this.locAssignPrimaryId,
    }).subscribe({
      next: result => {
        this.locAssignSaving = false;
        if (!result.success) { this.locAssignError = result.message; return; }
        this.toastr.success(result.message || 'Location access updated.');
        this.loadLocations();
      },
      error: () => { this.locAssignSaving = false; },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Devices
  // ═══════════════════════════════════════════════════════════════════════════

  loadDevices(): void {
    this.devicesLoading = true;
    this.admin.getDevices(undefined, this.showRevokedDevices).subscribe({
      next: list => { this.devices = list; this.devicesLoading = false; },
      error: () => { this.devicesLoading = false; },
    });
  }

  toggleRevokedDevices(): void {
    this.showRevokedDevices = !this.showRevokedDevices;
    this.loadDevices();
  }

  newEnrolment(): void {
    this.enrolForm = AttendanceSetupComponent.emptyEnrolment();
    this.enrolFormOpen = true;
    this.enrolError = '';
  }

  cancelEnrolment(): void {
    this.enrolFormOpen = false;
    this.enrolError = '';
  }

  onKioskChange(): void {
    if (!this.enrolForm.isKiosk) this.enrolForm.locationId = null;
  }

  enrolDevice(): void {
    this.enrolError = '';

    if (!this.enrolForm.userId) {
      this.enrolError = 'Choose the employee this device belongs to. A kiosk still needs one — it is the '
        + 'account the display authenticates as, not the person checking in.';
      return;
    }
    if (this.enrolForm.isKiosk && !this.enrolForm.locationId) {
      this.enrolError = 'A kiosk has to be tied to a location — that is what decides which code it shows.';
      return;
    }

    this.enrolSaving = true;
    this.admin.enrolDevice({
      ...this.enrolForm,
      label: (this.enrolForm.label ?? '').trim() || null,
    }).subscribe({
      next: result => {
        this.enrolSaving = false;
        this.enrolResult = result;
        this.enrolLink = AttendanceSetupComponent.buildEnrolLink(result.token);
        this.enrolFormOpen = false;
        this.copied = '';
        this.loadDevices();
      },
      error: () => { this.enrolSaving = false; },
    });
  }

  copyEnrolLink(): void {
    void this.copy(this.enrolLink, 'link');
  }

  copyEnrolToken(): void {
    if (this.enrolResult) void this.copy(this.enrolResult.token, 'token');
  }

  private async copy(text: string, what: 'link' | 'token'): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copied = what;
      setTimeout(() => { this.copied = ''; }, 2500);
    } catch {
      // Clipboard access is refused on an insecure origin and in some locked-down
      // browsers. Saying so beats a button that silently does nothing, because the
      // administrator can still select the text by hand.
      this.toastr.warning('This browser would not let the page copy. Select the text and copy it manually.');
    }
  }

  /**
   * Closes the one-time token panel — behind a confirmation, because once it is gone the
   * token cannot be retrieved and the device has to be enrolled again.
   */
  dismissEnrolResult(): void {
    this.confirmModal.confirm({
      title: 'Done with this code?',
      message: 'The enrolment code is shown only once and cannot be retrieved afterwards. '
        + 'Close it only if you have already sent the link to the device.',
      confirmText: 'Close it',
      cancelText: 'Not yet',
    }).subscribe(confirmed => {
      if (!confirmed) return;
      this.enrolResult = null;
      this.enrolLink = '';
      this.copied = '';
    });
  }

  revokeDevice(device: AttendanceDevice): void {
    this.confirmModal.confirmWithReason({
      title: 'Revoke Device',
      message: `Revoke ${device.isKiosk ? 'the kiosk' : 'the device'} for ${device.fullName}? `
        + 'It stops working immediately — the next check-in from it is refused. Attendance already '
        + 'recorded is unchanged.',
      confirmText: 'Revoke',
      cancelText: 'Cancel',
      reasonLabel: 'Why is it being revoked?',
      reasonPlaceholder: 'Phone lost, employee left, replaced handset…',
      reasonRequired: true,
    }).subscribe(result => {
      if (!result.confirmed) return;

      this.admin.revokeDevice(device.deviceId, result.reason).subscribe(op => {
        if (op.success) this.toastr.success(op.message || 'Device revoked.');
        this.loadDevices();
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  private isLatitude(value: number): boolean {
    return Number.isFinite(value) && value >= -90 && value <= 90;
  }

  private isLongitude(value: number): boolean {
    return Number.isFinite(value) && value >= -180 && value <= 180;
  }

  private static emptyLocation(): AttendanceLocationSave {
    return {
      locationId: 0,
      name: '',
      address: '',
      latitude: 0,
      longitude: 0,
      radiusMetres: 0,
      isActive: true,
    };
  }

  private static emptyShift(): ShiftSave {
    return {
      shiftId: 0,
      name: '',
      startTime: '09:00',
      endTime: '18:00',
      graceMinutes: 10,
      lateAfterMinutes: 15,
      halfDayAfterMinutes: 240,
      minimumWorkMinutes: 240,
      isActive: true,
    };
  }

  private static emptyEnrolment(): EnrolAttendanceDevice {
    return {
      userId: 0,
      isKiosk: false,
      locationId: null,
      label: '',
      deviceIdentifier: null,
    };
  }

  private static todayIso(): string {
    const now = new Date();
    const pad = (n: number) => `${n}`.padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  /**
   * The link that installs the token on a phone.
   *
   * A plain path, matching the router: the application is bootstrapped with
   * `provideRouter` and no `withHashLocation()`, and nginx falls back to `index.html`.
   * A `/#/` link would load the site root, be redirected to login, and lose the token —
   * the fragment never reaches the router under the path strategy.
   *
   * Built from the browser's own origin so it is correct in every environment without
   * configuration: the administrator is, by definition, already looking at the
   * deployment they want the phone to reach.
   */
  private static buildEnrolLink(token: string): string {
    return `${window.location.origin}/check-in/enrol?token=${encodeURIComponent(token)}`;
  }
}
