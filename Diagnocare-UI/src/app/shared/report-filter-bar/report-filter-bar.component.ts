import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface FilterChartOption {
  value: string;
  label: string;
  icon: string;
}

export interface FilterPeriodOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-report-filter-bar',
  templateUrl: './report-filter-bar.component.html',
  styleUrls: ['./report-filter-bar.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule],
})
export class ReportFilterBarComponent {
  // ── Report identity ───────────────────────────────────────────────────────────
  @Input() reportTitle = '';
  @Input() reportIcon  = '';

  // ── Year ──────────────────────────────────────────────────────────────────────
  @Input() availableYears: string[]  = [];
  @Input() selectedYear: string      = '';

  // ── Period ────────────────────────────────────────────────────────────────────
  @Input() periodOptions: FilterPeriodOption[] = [
    { label: 'Week',    value: 'week'    },
    { label: 'Month',   value: 'month'   },
    { label: 'Quarter', value: 'quarter' },
    { label: 'Year',    value: 'year'    },
  ];
  @Input() selectedPeriod: string = 'month';

  // ── Chart type ────────────────────────────────────────────────────────────────
  @Input() chartOptions: FilterChartOption[] = [];
  @Input() selectedChartType: string = 'bar';

  // ── Visibility ────────────────────────────────────────────────────────────────
  /** When false, hides Year + Period controls (for static/non-date-filtered reports). */
  @Input() showDateFilters = true;

  // ── State ─────────────────────────────────────────────────────────────────────
  @Input() isLoading   = false;
  @Input() hasData     = false;
  /** Show the Chart toggle button (used by table-report; base-report always shows chart) */
  @Input() showChartToggle = false;
  /** Active state of the chart toggle button */
  @Input() chartActive = false;

  // ── Outputs ───────────────────────────────────────────────────────────────────
  @Output() yearChange      = new EventEmitter<string>();
  @Output() periodChange    = new EventEmitter<string>();
  @Output() chartTypeChange = new EventEmitter<string>();
  @Output() csvExport       = new EventEmitter<void>();
  @Output() chartToggle     = new EventEmitter<void>();
}
