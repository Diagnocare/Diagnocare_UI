import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { SamplingLocationService } from 'src/app/features/samples/services/sampling-location.service';
import { AreaService }             from 'src/app/features/address-manager/services/area.service';
import { UnitService }             from 'src/app/features/lab/services/unit.service';
import { PathologyService }        from 'src/app/features/pathology/services/pathology.service';
import { ConfirmModalService }     from 'src/app/shared/components/confirm-modal/confirm-modal.service';
import { ConfirmModalComponent }   from 'src/app/shared/components/confirm-modal/confirm-modal.component';
import { TokenService }            from 'src/app/core/services/token.service';

export type LabSetupTab = 'sampling' | 'areas' | 'units' | 'policies';

@Component({
  selector: 'app-lab-setup',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmModalComponent],
  templateUrl: './lab-setup.component.html',
  styleUrls: ['./lab-setup.component.scss'],
})
export class LabSetupComponent implements OnInit {
  activeTab: LabSetupTab = 'sampling';

  // ── Sampling Locations ─────────────────────────────────────────────
  samplingLocations: string[] = [];
  newSamplingName   = '';
  newSamplingError  = '';
  editingSampling:  string | null = null;
  editSamplingName  = '';
  editSamplingError = '';

  // ── Areas of Operation ─────────────────────────────────────────────
  areas: string[] = [];
  newAreaName   = '';
  newAreaError  = '';
  editingArea:  string | null = null;
  editAreaName  = '';
  editAreaError = '';

  // ── Units ──────────────────────────────────────────────────────────
  units: string[] = [];
  newUnitName   = '';
  newUnitError  = '';
  editingUnit:  string | null = null;
  editUnitName  = '';
  editUnitError = '';

  // ── Grace Buffer (stored as token_expiry_in_minutes in DB) ──────────
  graceBufferMinutes: number | null = null;
  graceBufferInput:   number | null = null;
  graceBufferSaving   = false;
  graceBufferError    = '';
  graceBufferSuccess  = '';

  // ── Policies (max discount + session lockout) ──────────────────────
  policiesLoading      = false;
  policiesLoaded       = false;
  maxDiscountValue:    number | null = null;
  maxDiscountInput:    number | null = null;
  maxDiscountSaving    = false;
  maxDiscountError     = '';
  maxDiscountSuccess   = '';
  sessionLockoutValue: number | null = null;
  sessionLockoutInput: number | null = null;
  sessionLockoutSaving = false;
  sessionLockoutError  = '';
  sessionLockoutSuccess = '';

  // ── Paid Leave Carry Forward (%) ───────────────────────────────────
  // The share of an employee's ANNUAL paid-leave entitlement that may be carried into
  // the next leave year. A cap on the carry-forward, NOT a percentage applied to the
  // unused balance - see the hint text in the template.
  leaveCarryForwardValue:   number | null = null;
  leaveCarryForwardInput:   number | null = null;
  leaveCarryForwardSaving   = false;
  leaveCarryForwardError    = '';
  leaveCarryForwardSuccess  = '';

  /** True only for Super Admin — the only role allowed to change lab setup. */
  get isAdmin(): boolean {
    return this.tokenService.isSuperAdmin();
  }

  constructor(
    private samplingService:  SamplingLocationService,
    private areaService:      AreaService,
    private unitService:      UnitService,
    private pathologyService: PathologyService,
    private confirmModal:     ConfirmModalService,
    private tokenService:     TokenService,
    private router:           Router,
  ) {}

  ngOnInit(): void {
    this.refreshSampling();
    this.refreshAreas();
    this.refreshUnits();
  }

  switchTab(tab: LabSetupTab): void {
    this.activeTab = tab;
    // Grace buffer, max discount and screen-lock timeout are now all loaded
    // together when the merged Policies tab is opened.
    if (tab === 'policies' && !this.policiesLoaded && !this.policiesLoading) {
      this.loadPolicies();
    }
  }

  // ── Sampling helpers ───────────────────────────────────────────────

  private refreshSampling(): void {
    this.samplingLocations = this.samplingService.getAll();
  }

  addSampling(): void {
    this.newSamplingError = '';
    const result = this.samplingService.add(this.newSamplingName);
    if (result.success) {
      this.newSamplingName = '';
      this.refreshSampling();
    } else {
      this.newSamplingError = result.error ?? 'Error.';
    }
  }

  startEditSampling(name: string): void {
    this.editingSampling   = name;
    this.editSamplingName  = name;
    this.editSamplingError = '';
  }

  saveEditSampling(): void {
    if (!this.editingSampling) return;
    const result = this.samplingService.update(this.editingSampling, this.editSamplingName);
    if (result.success) {
      this.editingSampling = null;
      this.refreshSampling();
    } else {
      this.editSamplingError = result.error ?? 'Error.';
    }
  }

  cancelEditSampling(): void {
    this.editingSampling   = null;
    this.editSamplingError = '';
  }

  deleteSampling(name: string): void {
    this.confirmModal.confirm({
      title:       'Delete Sampling Location',
      message:     `Are you sure you want to delete "${name}"? This will remove it from all dropdowns.`,
      confirmText: 'Delete',
      cancelText:  'Cancel',
    }).subscribe(confirmed => {
      if (confirmed) {
        this.samplingService.delete(name);
        this.refreshSampling();
      }
    });
  }

  resetSampling(): void {
    this.confirmModal.confirm({
      title:       'Reset to Defaults',
      message:     'This will replace all sampling locations with the factory defaults. Any custom entries will be lost.',
      confirmText: 'Reset',
      cancelText:  'Cancel',
    }).subscribe(confirmed => {
      if (confirmed) {
        this.samplingService.reset();
        this.refreshSampling();
      }
    });
  }

  // ── Area helpers ───────────────────────────────────────────────────

  private refreshAreas(): void {
    this.areas = this.areaService.getAll();
  }

  addArea(): void {
    this.newAreaError = '';
    const result = this.areaService.add(this.newAreaName);
    if (result.success) {
      this.newAreaName = '';
      this.refreshAreas();
    } else {
      this.newAreaError = result.error ?? 'Error.';
    }
  }

  startEditArea(name: string): void {
    this.editingArea   = name;
    this.editAreaName  = name;
    this.editAreaError = '';
  }

  saveEditArea(): void {
    if (!this.editingArea) return;
    const result = this.areaService.update(this.editingArea, this.editAreaName);
    if (result.success) {
      this.editingArea = null;
      this.refreshAreas();
    } else {
      this.editAreaError = result.error ?? 'Error.';
    }
  }

  cancelEditArea(): void {
    this.editingArea   = null;
    this.editAreaError = '';
  }

  deleteArea(name: string): void {
    this.confirmModal.confirm({
      title:       'Delete Area',
      message:     `Are you sure you want to delete "${name}"? This will remove it from all dropdowns.`,
      confirmText: 'Delete',
      cancelText:  'Cancel',
    }).subscribe(confirmed => {
      if (confirmed) {
        this.areaService.delete(name);
        this.refreshAreas();
      }
    });
  }

  resetAreas(): void {
    this.confirmModal.confirm({
      title:       'Reset to Defaults',
      message:     'This will replace all areas with the factory defaults. Any custom entries will be lost.',
      confirmText: 'Reset',
      cancelText:  'Cancel',
    }).subscribe(confirmed => {
      if (confirmed) {
        this.areaService.reset();
        this.refreshAreas();
      }
    });
  }

  // ── Unit helpers ───────────────────────────────────────────────────

  private refreshUnits(): void {
    this.units = this.unitService.getAll();
  }

  addUnit(): void {
    this.newUnitError = '';
    const result = this.unitService.add(this.newUnitName);
    if (result.success) {
      this.newUnitName = '';
      this.refreshUnits();
    } else {
      this.newUnitError = result.error ?? 'Error.';
    }
  }

  startEditUnit(name: string): void {
    this.editingUnit   = name;
    this.editUnitName  = name;
    this.editUnitError = '';
  }

  saveEditUnit(): void {
    if (!this.editingUnit) return;
    const result = this.unitService.update(this.editingUnit, this.editUnitName);
    if (result.success) {
      this.editingUnit = null;
      this.refreshUnits();
    } else {
      this.editUnitError = result.error ?? 'Error.';
    }
  }

  cancelEditUnit(): void {
    this.editingUnit   = null;
    this.editUnitError = '';
  }

  deleteUnit(name: string): void {
    this.confirmModal.confirm({
      title:       'Delete Unit',
      message:     `Are you sure you want to delete "${name}"? It will no longer appear in the unit dropdown.`,
      confirmText: 'Delete',
      cancelText:  'Cancel',
    }).subscribe(confirmed => {
      if (confirmed) {
        this.unitService.delete(name);
        this.refreshUnits();
      }
    });
  }

  resetUnits(): void {
    this.confirmModal.confirm({
      title:       'Reset to Defaults',
      message:     'This will replace all units with the factory defaults. Any custom entries will be lost.',
      confirmText: 'Reset',
      cancelText:  'Cancel',
    }).subscribe(confirmed => {
      if (confirmed) {
        this.unitService.reset();
        this.refreshUnits();
      }
    });
  }

  // ── Grace Buffer helpers (loaded via loadPolicies; part of the Policies tab) ──

  saveGraceBuffer(): void {
    const minutes = this.graceBufferInput;
    if (minutes === null || minutes === undefined || isNaN(Number(minutes))) {
      this.graceBufferError = 'Please enter a valid number of minutes.';
      return;
    }
    if (Number(minutes) < 0) {
      this.graceBufferError = 'Grace buffer cannot be negative. Use 0 to disable.';
      return;
    }
    this.graceBufferError   = '';
    this.graceBufferSuccess = '';
    this.graceBufferSaving  = true;

    this.pathologyService.updateGraceBuffer(Number(minutes)).subscribe({
      next: () => {
        this.graceBufferMinutes = Number(minutes);
        // TokenService cache is updated by PathologyService itself on success.
        this.graceBufferSuccess = 'Grace buffer updated successfully.';
        this.graceBufferSaving  = false;
        setTimeout(() => this.graceBufferSuccess = '', 4000);
      },
      error: () => {
        this.graceBufferError  = 'Failed to save grace buffer. Please try again.';
        this.graceBufferSaving = false;
      },
    });
  }

  // ── Policies helpers ───────────────────────────────────────────────────────

  private loadPolicies(): void {
    this.policiesLoading = true;
    this.pathologyService.getPathology().subscribe({
      next: (data) => {
        // Grace buffer (merged into the Policies tab)
        this.graceBufferMinutes = data.graceBufferMinutes ?? 0;
        this.graceBufferInput   = this.graceBufferMinutes;
        this.tokenService.setGraceBufferMinutes(this.graceBufferMinutes);

        this.maxDiscountValue   = data.maxDiscountPercent  ?? 50;
        this.maxDiscountInput   = this.maxDiscountValue;
        this.sessionLockoutValue= data.sessionLockoutMinutes ?? 30;
        this.sessionLockoutInput= this.sessionLockoutValue;
        this.leaveCarryForwardValue = data.paidLeaveCarryForwardPercent ?? 50;
        this.leaveCarryForwardInput = this.leaveCarryForwardValue;
        this.policiesLoaded     = true;
        this.policiesLoading    = false;
        // Keep TokenService cache in sync
        this.tokenService.setMaxDiscountPercent(this.maxDiscountValue);
        this.tokenService.setSessionLockoutMinutes(this.sessionLockoutValue);
      },
      error: () => {
        this.maxDiscountError   = 'Failed to load policy settings. Please try again.';
        this.policiesLoading    = false;
      },
    });
  }

  saveMaxDiscount(): void {
    const val = this.maxDiscountInput;
    if (val === null || val === undefined || isNaN(Number(val))) {
      this.maxDiscountError = 'Please enter a valid number.';
      return;
    }
    if (Number(val) < 0 || Number(val) > 99) {
      this.maxDiscountError = 'Discount must be between 0 and 99. (100% is never allowed.)';
      return;
    }
    this.maxDiscountError   = '';
    this.maxDiscountSuccess = '';
    this.maxDiscountSaving  = true;
    this.pathologyService.updateMaxDiscount(Number(val)).subscribe({
      next: () => {
        this.maxDiscountValue   = Number(val);
        // TokenService cache is updated by PathologyService itself on success.
        this.maxDiscountSuccess = 'Max discount updated successfully.';
        this.maxDiscountSaving  = false;
        setTimeout(() => this.maxDiscountSuccess = '', 4000);
      },
      error: () => {
        this.maxDiscountError  = 'Failed to save max discount. Please try again.';
        this.maxDiscountSaving = false;
      },
    });
  }

  saveSessionLockout(): void {
    const val = this.sessionLockoutInput;
    if (val === null || val === undefined || isNaN(Number(val))) {
      this.sessionLockoutError = 'Please enter a valid number.';
      return;
    }
    if (Number(val) < 0 || Number(val) > 1440) {
      this.sessionLockoutError = 'Lockout timeout must be between 0 (disabled) and 1440 minutes (24 hours).';
      return;
    }
    this.sessionLockoutError   = '';
    this.sessionLockoutSuccess = '';
    this.sessionLockoutSaving  = true;
    this.pathologyService.updateSessionLockout(Number(val)).subscribe({
      next: () => {
        this.sessionLockoutValue = Number(val);
        // TokenService cache is updated by PathologyService itself on success.
        this.sessionLockoutSuccess = 'Session lockout updated successfully.';
        this.sessionLockoutSaving  = false;
        setTimeout(() => this.sessionLockoutSuccess = '', 4000);
      },
      error: () => {
        this.sessionLockoutError  = 'Failed to save session lockout. Please try again.';
        this.sessionLockoutSaving = false;
      },
    });
  }

  // ── Carry-forward worked example ────────────────────────────────────
  // Spelled out in the hint text because the rule is the one people get wrong: the
  // percentage caps the carry-forward, it is not applied to the unused balance. The
  // numbers move with the configured percentage so the example is never stale.

  /** A typical entitlement: 2 paid leaves a month over 12 months. */
  readonly exampleAnnualEntitlement = 24;

  private get carryForwardPercent(): number {
    return this.leaveCarryForwardValue ?? 50;
  }

  /** The ceiling for the worked example: annual entitlement x the configured percentage. */
  get exampleMaxCarryForward(): number {
    return this.round1(this.exampleAnnualEntitlement * this.carryForwardPercent / 100);
  }

  /** 18 unused days, capped. Above the ceiling at any percentage below 75%. */
  get exampleCarryForwardFor18(): number {
    return Math.min(18, this.exampleMaxCarryForward);
  }

  /** 3 unused days, capped. Below the ceiling unless carry forward is nearly off. */
  get exampleCarryForwardFor3(): number {
    return Math.min(3, this.exampleMaxCarryForward);
  }

  /** One decimal place, so a half-day ceiling reads as 11.5 rather than 11.499999. */
  private round1(value: number): number {
    return Math.round(value * 10) / 10;
  }

  /**
   * Saves the carry-forward cap. 0-100: 0 makes leave lapse at the end of every year,
   * 100 lets the whole unused balance move. Validated here as well as server-side so a
   * typo is caught before the round-trip.
   */
  saveLeaveCarryForward(): void {
    const val = this.leaveCarryForwardInput;
    if (val === null || val === undefined || isNaN(Number(val))) {
      this.leaveCarryForwardError = 'Please enter a valid number.';
      return;
    }
    if (Number(val) < 0 || Number(val) > 100) {
      this.leaveCarryForwardError = 'Carry forward must be between 0 and 100%.';
      return;
    }
    this.leaveCarryForwardError   = '';
    this.leaveCarryForwardSuccess = '';
    this.leaveCarryForwardSaving  = true;
    this.pathologyService.updatePaidLeaveCarryForward(Number(val)).subscribe({
      next: () => {
        this.leaveCarryForwardValue   = Number(val);
        this.leaveCarryForwardSuccess = 'Paid leave carry forward updated successfully.';
        this.leaveCarryForwardSaving  = false;
        setTimeout(() => this.leaveCarryForwardSuccess = '', 4000);
      },
      error: () => {
        this.leaveCarryForwardError  = 'Failed to save paid leave carry forward. Please try again.';
        this.leaveCarryForwardSaving = false;
      },
    });
  }
}
