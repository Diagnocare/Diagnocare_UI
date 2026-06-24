import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { SamplingLocationService } from 'src/app/services/samplingServices/sampling-location.service';
import { AreaService }             from 'src/app/services/areaServices/area.service';
import { UnitService }             from 'src/app/services/unitServices/unit.service';
import { PathologyService }        from 'src/app/services/pathologyServices/pathology.service';
import { ConfirmModalService }     from 'src/app/shared/confirm-modal/confirm-modal.service';
import { ConfirmModalComponent }   from 'src/app/shared/confirm-modal/confirm-modal.component';
import { TokenService }            from 'src/app/core/interceptors/token.service';

export type LabSetupTab = 'sampling' | 'areas' | 'units' | 'grace';

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
  graceBufferLoading  = false;
  graceBufferError    = '';
  graceBufferSuccess  = '';

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
    if (tab === 'grace' && this.graceBufferMinutes === null && !this.graceBufferLoading) {
      this.loadGraceBuffer();
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

  // ── Grace Buffer helpers (stored as token_expiry_in_minutes in DB) ──

  private loadGraceBuffer(): void {
    this.graceBufferLoading = true;
    this.graceBufferError   = '';
    this.pathologyService.getPathology().subscribe({
      next: (data) => {
        // graceBufferMinutes is serialised from DB column token_expiry_in_minutes
        this.graceBufferMinutes = data.graceBufferMinutes ?? 0;
        this.graceBufferInput   = this.graceBufferMinutes;
        this.graceBufferLoading = false;
        // Sync into TokenService cache so the interceptor reads it immediately
        this.tokenService.setGraceBufferMinutes(this.graceBufferMinutes);
      },
      error: () => {
        this.graceBufferError   = 'Failed to load grace buffer setting. Please try again.';
        this.graceBufferLoading = false;
      },
    });
  }

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
        // Persist to TokenService cache so the interceptor can read it immediately
        this.tokenService.setGraceBufferMinutes(Number(minutes));
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
}
