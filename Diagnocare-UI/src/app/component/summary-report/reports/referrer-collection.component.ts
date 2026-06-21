import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableReportComponent } from '../table-report/table-report.component';

interface TypeOption { label: string; value: string | null; }

@Component({
  selector: 'app-referrer-collection',
  standalone: true,
  imports: [CommonModule, FormsModule, TableReportComponent],
  template: `
    <div class="rc-toolbar">

      <!-- Info note -->
      <div class="rc-info-note">
        <i class="fa fa-info-circle"></i>
        <strong>Panel</strong> accounts have a commission % set with the lab.
        <strong>Non-Panel</strong> doctors are referral doctors without a commission arrangement.
        Collection Boys are always Non-Panel.
      </div>

      <!-- Row 1: Panel / Non-Panel -->
      <div class="rc-filter-row">
        <span class="rc-filter-label">Account Type</span>
        <div class="radio-pill-group">
          <label class="radio-pill" (click)="panelFilter='all'; onPanelChange()">
            <input type="radio" name="rcPanel" [value]="'all'" [(ngModel)]="panelFilter" />
            <span [class.is-active]="panelFilter === 'all'">All Accounts</span>
          </label>
          <label class="radio-pill" (click)="panelFilter='panel'; onPanelChange()">
            <input type="radio" name="rcPanel" [value]="'panel'" [(ngModel)]="panelFilter" />
            <span [class.is-active]="panelFilter === 'panel'"><i class="fa fa-percent"></i> Panel (Commission)</span>
          </label>
          <label class="radio-pill" (click)="panelFilter='non-panel'; onPanelChange()">
            <input type="radio" name="rcPanel" [value]="'non-panel'" [(ngModel)]="panelFilter" />
            <span [class.is-active]="panelFilter === 'non-panel'">Non-Panel</span>
          </label>
        </div>
      </div>

      <!-- Row 2: Type (options depend on panel selection) -->
      <div class="rc-filter-row">
        <span class="rc-filter-label">Type</span>
        <div class="radio-pill-group">
          <label class="radio-pill" (click)="typeFilter=null">
            <input type="radio" name="rcType" [value]="null" [(ngModel)]="typeFilter" />
            <span [class.is-active]="typeFilter === null">All Types</span>
          </label>
          <label class="radio-pill" *ngFor="let opt of availableTypes" (click)="typeFilter=opt.value">
            <input type="radio" name="rcType" [value]="opt.value" [(ngModel)]="typeFilter" />
            <span [class.is-active]="typeFilter === opt.value">{{ opt.label }}</span>
          </label>
        </div>
      </div>

      <!-- Row 3: Name search -->
      <div class="rc-filter-row">
        <span class="rc-filter-label"><i class="fa fa-search"></i> Name</span>
        <input class="form-control rc-name-search" type="text" placeholder="Search by name…" [(ngModel)]="nameSearch" />
      </div>

    </div>

    <app-table-report
      reportId="referrerCollection"
      [rowFilter]="nameSearch"
      [colFilters]="activeColFilters">
    </app-table-report>
  `,
  styles: [`
    /* ── Toolbar wrapper ─────────────────────────────────────────── */
    .rc-toolbar {
      background: var(--bg-white);
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      padding: 1rem 1.5rem 0.75rem;
      box-shadow: var(--shadow-light);
      clip-path: inset(-10px -10px 0 -10px);
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
    }

    /* ── Info note ───────────────────────────────────────────────── */
    .rc-info-note {
      font-size: 0.82rem;
      color: var(--text-secondary);
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-left: 3px solid #3b82f6;
      border-radius: var(--radius-sm);
      padding: 0.55rem 0.9rem;
      line-height: 1.5;
    }

    /* ── Filter row ──────────────────────────────────────────────── */
    .rc-filter-row {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .rc-filter-label {
      flex-shrink: 0;
      min-width: 7rem;
      padding-top: 0.38rem;   /* align with pill text */
      font-weight: 600;
      font-size: 0.8rem;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    /* ── Radio pill — matches add-patient.component.scss exactly ─── */
    .radio-pill-group {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5em;
      padding: 0.15em 0;
    }

    .radio-pill {
      display: flex;
      align-items: center;
      cursor: pointer;
    }

    .radio-pill input[type="radio"] {
      position: absolute;
      opacity: 0;
      width: 0;
      height: 0;
      pointer-events: none;
    }

    .radio-pill span {
      display: inline-block;
      padding: 0.35em 0.9em;
      border: 2px solid #d1d9e6;
      border-radius: 20px;
      font-size: 0.82em;
      font-weight: 600;
      color: #5a6a7e;
      background: #f7f9fc;
      transition: all 0.18s;
      user-select: none;
      cursor: pointer;
    }

    .radio-pill span.is-active {
      background: linear-gradient(135deg, #1E5BA8, #667eea);
      border-color: #1E5BA8;
      color: #fff;
      box-shadow: 0 2px 8px rgba(30, 91, 168, 0.25);
    }

    .radio-pill:hover span:not(.is-active) {
      border-color: #667eea;
      color: #1E5BA8;
      background: #eef2ff;
    }

    .radio-pill:hover span.is-active {
      background: linear-gradient(135deg, #1E5BA8, #667eea);
      color: #fff;
    }

    /* ── Name search ─────────────────────────────────────────────── */
    .rc-name-search {
      max-width: 22rem;
    }
  `]
})
export class ReferrerCollectionComponent {

  panelFilter: 'all' | 'panel' | 'non-panel' = 'all';
  typeFilter: string | null = null;
  nameSearch = '';

  /** Type options whose visibility depends on the panel filter. */
  private readonly panelTypes: TypeOption[] = [
    { label: 'Doctor',            value: 'Doctor'          },
    { label: 'Hospital',          value: 'Hospital'        },
    { label: 'Clinic',            value: 'Clinic'          },
    { label: 'Laboratory',        value: 'Laboratory'      },
    { label: 'Diagnostic Centre', value: 'DiagnosticCenter'},
    { label: 'Pharmacy',          value: 'Pharmacy'        },
    { label: 'Other',             value: 'Other'           },
  ];

  private readonly nonPanelTypes: TypeOption[] = [
    { label: 'Doctor',          value: 'Doctor'        },
    { label: 'Collection Boy',  value: 'Collection Boy'},
  ];

  private readonly allTypes: TypeOption[] = [
    ...this.panelTypes,
    { label: 'Collection Boy', value: 'Collection Boy' },
  ];

  get availableTypes(): TypeOption[] {
    if (this.panelFilter === 'panel')     return this.panelTypes;
    if (this.panelFilter === 'non-panel') return this.nonPanelTypes;
    return this.allTypes;
  }

  /** Column filters passed to table-report. */
  get activeColFilters(): Array<{ col: string; value?: string; isNull?: boolean }> {
    const filters: Array<{ col: string; value?: string; isNull?: boolean }> = [];

    if (this.panelFilter === 'panel') {
      // Panel = commissionPct is NOT null
      filters.push({ col: 'commissionPct', isNull: false });
    } else if (this.panelFilter === 'non-panel') {
      // Non-Panel = commissionPct IS null
      filters.push({ col: 'commissionPct', isNull: true });
    }

    if (this.typeFilter) {
      filters.push({ col: 'referrerType', value: this.typeFilter });
    }

    return filters;
  }

  onPanelChange(): void {
    // Reset type when panel mode changes so no orphaned type is active
    this.typeFilter = null;
    this.nameSearch = '';
  }
}
