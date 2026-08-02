import {
  Component, Input, OnInit, OnDestroy, OnChanges,
  SimpleChanges, ViewChild, ElementRef, AfterViewInit
} from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { Chart } from 'chart.js';

import { SummaryReportService }    from 'src/app/services/summaryServices/summary-report.service';
import { ChartService }            from 'src/app/services/summaryServices/chart.service';
import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { ReportFilterBarComponent, FilterChartOption } from 'src/app/shared/report-filter-bar/report-filter-bar.component';
import { reportConfigs, chartDisplayOptions, CHART_COLORS } from 'src/app/constant/constants';
import { ReportConfig }            from 'src/app/models/summaryReport/summaryReportModel';

/** Describes one derived column. */
interface ColDef {
  key:   string;
  label: string;
  kind:  'currency' | 'number' | 'date' | 'badge' | 'text';
  align: 'left' | 'right' | 'center';
}

@Component({
  selector:    'app-table-report',
  standalone:  true,
  imports:     [CommonModule, FormsModule, LoadingSpinnerComponent, ReportFilterBarComponent],
  providers:   [DatePipe, DecimalPipe],
  templateUrl: './table-report.component.html',
  styleUrls:   ['./table-report.component.scss'],
})
export class TableReportComponent implements OnInit, OnDestroy, OnChanges, AfterViewInit {

  @Input() reportId!: string;
  /** Optional name filter applied client-side. When set, only rows whose first text column matches are shown. */
  @Input() rowFilter = '';
  /** Extra key/value pairs merged into the API request body (e.g. { institutionType: 7 }). */
  @Input() extraParams: Record<string, any> = {};
  /**
   * Optional column filters applied client-side (AND logic).
   * Each entry is either:
   *   { col, value }          — exact string match (case-insensitive)
   *   { col, isNull: true }   — only rows where col is null / undefined
   *   { col, isNull: false }  — only rows where col is NOT null / undefined
   * Pass an empty array or null to show all rows.
   */
  @Input() colFilters: Array<{ col: string; value?: string; isNull?: boolean }> | null = null;
  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;

  config!: ReportConfig;

  // ── Filter ────────────────────────────────────────────────────────────────────
  selectedYear    = '';
  availableYears: string[] = [];
  selectedPeriod  = 'month';
  readonly periodOptions = [
    { label: 'Week',    value: 'week'    },
    { label: 'Month',   value: 'month'   },
    { label: 'Quarter', value: 'quarter' },
    { label: 'Year',    value: 'year'    },
  ];
  readonly chartOptions: FilterChartOption[] = chartDisplayOptions;

  // ── Data ─────────────────────────────────────────────────────────────────────
  private allRows:  any[]   = [];   // full unfiltered dataset from last API response
  private apiTotals: { [key: string]: number } = {};  // totals straight from API envelope
  rows:      any[]   = [];
  cols:      ColDef[] = [];
  totals:    { [key: string]: number } = {};
  hasTotals  = false;
  totalLabel = '';
  isLoading  = false;

  // ── Sort ──────────────────────────────────────────────────────────────────────
  sortKey = '';
  sortAsc = true;

  // ── Chart ─────────────────────────────────────────────────────────────────────
  showChart     = true;   // chart is always visible — no toggle
  chartType     = 'bar';
  chartValueCol = '';
  chartableNumericCols: ColDef[] = [];
  isSummaryOnly = false;            // true when response has no data[] array
  private chartViewReady = false;

  private destroy$ = new Subject<void>();

  constructor(
    private reportSvc: SummaryReportService,
    private chartSvc:  ChartService,
    private toastr:    ToastrService,
    private datePipe:  DatePipe,
    private decimal:   DecimalPipe,
  ) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.config    = reportConfigs[this.reportId];
    this.showChart = !this.config.noChart;
    this.initAvailableYears();
    this.loadData();
  }

  ngAfterViewInit(): void { this.chartViewReady = true; }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['reportId'] && !changes['reportId'].isFirstChange()) {
      this.config = reportConfigs[this.reportId];
      this.initAvailableYears();
      this.selectedYear   = '';
      this.selectedPeriod = 'month';
      this.clearState();
      this.loadData();
    }
    if ((changes['rowFilter'] || changes['colFilters']) && !changes['reportId']) {
      this.applyRowFilter();
      if (this.showChart) setTimeout(() => this.renderChart(), 0);
    }
    if (changes['extraParams'] && !changes['extraParams'].isFirstChange()) {
      this.clearState();
      this.loadData();
    }
  }

  ngOnDestroy(): void {
    this.chartSvc.destroyChart();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private clearState(): void {
    this.rows = []; this.allRows = []; this.cols = [];
    this.totals = {}; this.apiTotals = {};
    this.showChart = !this.config.noChart; this.hasTotals = false;
    this.isSummaryOnly = false;
  }

  private applyRowFilter(): void {
    const term = (this.rowFilter ?? '').trim().toLowerCase();

    // 1. Text / name filter (first text or badge column)
    let filtered: any[];
    if (!term) {
      filtered = [...this.allRows];
    } else {
      const textCol = this.cols.find(c => c.kind === 'text' || c.kind === 'badge');
      filtered = textCol
        ? this.allRows.filter(r => String(r[textCol.key] ?? '').toLowerCase().includes(term))
        : [...this.allRows];
    }

    // 2. Column filters (AND logic — exact match or null/not-null check)
    if (this.colFilters?.length) {
      for (const f of this.colFilters) {
        if (f.isNull !== undefined) {
          // null / not-null check
          filtered = f.isNull
            ? filtered.filter(r => r[f.col] == null)
            : filtered.filter(r => r[f.col] != null);
        } else if (f.value !== undefined) {
          const target = f.value.toLowerCase();
          filtered = filtered.filter(r => String(r[f.col] ?? '').toLowerCase() === target);
        }
      }
    }

    this.rows = filtered;

    // 3. Recompute totals from visible rows (skip rate/percentage columns)
    if (!term && !this.colFilters?.length) {
      this.totals = { ...this.apiTotals };
    } else {
      this.totals = {};
      for (const col of this.cols) {
        if (col.kind !== 'currency' && col.kind !== 'number') continue;
        const lk = col.key.toLowerCase();
        if (/commissionpct|commissionpercentage/.test(lk)) continue;
        this.totals[col.key] = this.rows.reduce((s, r) => s + (Number(r[col.key]) || 0), 0);
      }
    }
    this.hasTotals = Object.keys(this.totals).length > 0;
  }

  private initAvailableYears(): void {
    const currentYear = new Date().getFullYear();
    this.availableYears = [];
    for (let i = 0; i <= 5; i++) {
      this.availableYears.push((currentYear - i).toString());
    }
  }

  // ── Filter bar event handlers ─────────────────────────────────────────────────

  onYearChange(year: string): void {
    this.selectedYear = year;
    this.loadData();
  }

  onPeriodChange(period: string): void {
    this.selectedPeriod = period;
    this.loadData();
  }

  onChartTypeChange(type: string): void {
    this.chartType = type;
    if (this.showChart) setTimeout(() => this.renderChart(), 0);
  }

  onCsvExport(): void { this.downloadCsv(); }

  get hasData(): boolean { return this.rows.length > 0; }

  // ── Load ──────────────────────────────────────────────────────────────────────

  loadData(): void {
    if (!this.reportId) return;
    this.isLoading = true;
    this.chartSvc.destroyChart();

    this.reportSvc.getTableReport(this.reportId, {
      period:    this.selectedPeriod || undefined,
      year:      this.selectedYear   || undefined,
      chartType: this.chartType      || undefined,
      extra:     Object.keys(this.extraParams).length ? this.extraParams : undefined,
    }).pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  resp => { this.handleResponse(resp); this.isLoading = false; },
        error: ()   => { this.isLoading = false; },   // message shown centrally by ErrorInterceptor
      });
  }

  // ── Response ──────────────────────────────────────────────────────────────────

  private handleResponse(resp: any): void {
    if (!resp) { this.rows = []; this.cols = []; return; }

    const hasDataArray = Object.prototype.hasOwnProperty.call(resp, 'data') && Array.isArray(resp.data);

    if (hasDataArray) {
      // ── Standard row-based response ────────────────────────────────────────
      this.isSummaryOnly = false;
      const raw: any[] = resp.data;

      const flatKey = raw.length > 0
        ? Object.keys(raw[0]).find(k =>
            Array.isArray(raw[0][k]) && raw[0][k].length > 0 && typeof raw[0][k][0] === 'object')
        : undefined;

      if (flatKey) {
        this.allRows = raw.flatMap(parent => {
          const parentFields = Object.fromEntries(Object.entries(parent).filter(([k]) => k !== flatKey));
          return (parent[flatKey] as any[]).map(child => ({ ...parentFields, ...child }));
        });
      } else {
        this.allRows = [...raw];
      }

      this.cols = this.allRows.length > 0 ? Object.keys(this.allRows[0]).map(k => this.makeColDef(k)) : [];
      this.applyRowFilter();

      const skip = new Set(['data', 'fromDate', 'toDate', 'totalRecords', 'totalTests']);
      this.apiTotals = {};
      for (const [k, v] of Object.entries(resp)) {
        if (!skip.has(k) && typeof v === 'number') this.apiTotals[k] = v as number;
      }
      this.hasTotals = Object.keys(this.apiTotals).length > 0;

      const count = resp.totalRecords ?? resp.totalTests ?? this.rows.length;
      this.totalLabel = `${count} record${count !== 1 ? 's' : ''}`;

    } else {
      // ── Summary-only response (no data array) ──────────────────────────────
      // Backend returns only aggregate fields (e.g. refund-register).
      // Synthesise a single display row so the table and chart still work.
      this.isSummaryOnly = true;
      const dateSkip = new Set(['fromDate', 'toDate']);
      const from = resp.fromDate ? new Date(resp.fromDate) : null;
      const to   = resp.toDate   ? new Date(resp.toDate)   : null;
      const periodLabel = from
        ? (to
          ? `${this.datePipe.transform(from, 'MMM yyyy')} – ${this.datePipe.transform(to, 'MMM yyyy')}`
          : (this.datePipe.transform(from, 'MMM yyyy') ?? 'Summary'))
        : 'Summary';

      const synRow: any = { period: periodLabel };
      for (const [k, v] of Object.entries(resp)) {
        if (!dateSkip.has(k)) synRow[k] = v;
      }

      this.rows      = [synRow];
      this.cols      = Object.keys(synRow).map(k => this.makeColDef(k));
      this.totals    = {};
      this.hasTotals = false;
      const count    = resp.totalRecords ?? 1;
      this.totalLabel = `${count} record${count !== 1 ? 's' : ''}`;
    }

    // ── Chart setup (shared) ──────────────────────────────────────────────────
    this.chartableNumericCols = this.cols.filter(c => c.kind === 'currency' || c.kind === 'number');
    if (!this.chartValueCol || !this.chartableNumericCols.find(c => c.key === this.chartValueCol)) {
      const defaultCurrency = this.chartableNumericCols.find(c => c.kind === 'currency');
      this.chartValueCol = defaultCurrency?.key ?? this.chartableNumericCols[0]?.key ?? '';
    }

    if (this.showChart) setTimeout(() => this.renderChart(), 50);
  }

  // ── Chart ─────────────────────────────────────────────────────────────────────

  onChartColChange(): void {
    if (this.showChart && this.chartValueCol) setTimeout(() => this.renderChart(), 0);
  }

  private renderChart(): void {
    if (this.isSummaryOnly) {
      this.renderDualChart();
      return;
    }

    if (!this.chartCanvas?.nativeElement || !this.chartValueCol || this.rows.length === 0) return;

    const labelCol = this.cols.find(c => c.kind === 'text' || c.kind === 'badge');
    if (!labelCol) return;

    const topRows = [...this.rows]
      .sort((a, b) => (b[this.chartValueCol] ?? 0) - (a[this.chartValueCol] ?? 0))
      .slice(0, 20);

    const periodCounts = topRows.map(r => ({
      period: String(r[labelCol.key] ?? '(blank)'),
      count:  Number(r[this.chartValueCol] ?? 0),
    }));

    const colLabel = this.cols.find(c => c.key === this.chartValueCol)?.label ?? this.chartValueCol;
    this.chartSvc.createChart(
      this.chartCanvas.nativeElement,
      this.chartType as any,
      periodCounts,
      [],
      `${this.config?.label ?? ''} — ${colLabel}`,
      '1.2-2'
    );
  }

  /**
   * Renders a single merged chart for summary-only responses.
   * Amount uses the left Y-axis, count uses the right Y-axis, so their
   * incompatible scales don't distort either dataset.
   * Pie/doughnut don't support dual axes — only amount is shown for those.
   */
  private renderDualChart(): void {
    if (!this.chartCanvas?.nativeElement || this.rows.length === 0) return;

    this.chartSvc.destroyChart();   // ensure no stale chart on the canvas

    const labels    = this.rows.map(r => String(r['period'] ?? ''));
    const amountCol = this.chartableNumericCols.find(c => c.kind === 'currency');
    const countCol  = this.chartableNumericCols.find(c => c.kind === 'number');
    const isPie     = this.chartType === 'pie' || this.chartType === 'doughnut';
    const jsType    = (this.chartType === 'area' ? 'line' : this.chartType) as any;
    const fill      = this.chartType === 'area' ? true : undefined;
    const tension   = this.chartType === 'area' ? 0.4 : (this.chartType === 'line' ? 0.1 : undefined);

    const datasets: any[] = [];

    if (amountCol) {
      datasets.push({
        label:           amountCol.label,
        data:            this.rows.map(r => Number(r[amountCol.key] ?? 0)),
        backgroundColor: isPie ? labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]) : CHART_COLORS[0],
        borderColor:     isPie ? '#ffffff' : CHART_COLORS[0],
        borderWidth:     isPie ? 2 : 1,
        yAxisID:         'yAmount',
        fill, tension,
      });
    }

    // Pie/doughnut have no axes — skip count dataset for those types
    if (countCol && !isPie) {
      datasets.push({
        label:           countCol.label,
        data:            this.rows.map(r => Number(r[countCol.key] ?? 0)),
        backgroundColor: CHART_COLORS[1],
        borderColor:     CHART_COLORS[1],
        borderWidth:     1,
        yAxisID:         'yCount',
        fill, tension,
      });
    }

    const scales: any = isPie ? {} : {
      yAmount: {
        type:       'linear',
        position:   'left',
        beginAtZero: true,
        grid:       { color: 'rgba(0,0,0,0.05)' },
        title:      { display: true, text: amountCol?.label ?? 'Amount' },
        ticks: {
          callback: (v: any) =>
            '₹' + Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }),
        },
      },
      yCount: {
        type:       'linear',
        position:   'right',
        beginAtZero: true,
        grid:       { drawOnChartArea: false },   // no overlapping grid lines
        title:      { display: true, text: countCol?.label ?? 'Count' },
        ticks: {
          stepSize:  1,
          precision: 0,
          callback:  (v: any) => Number.isInteger(Number(v)) ? String(v) : '',
        },
      },
      x: { grid: { display: false } },
    };

    // Build directly — ChartService API is designed for single-dataset time-series
    const chart = new Chart(this.chartCanvas.nativeElement, {
      type: jsType,
      data: { labels, datasets },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'bottom' },
          title:  { display: true, text: this.config?.label ?? '', font: { size: 14, weight: 'bold' }, color: '#2c3e50' },
          tooltip: {
            callbacks: {
              label: (ctx: any) => {
                const v = ctx.raw as number;
                return ctx.dataset.yAxisID === 'yAmount'
                  ? `${ctx.dataset.label}: ₹${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `${ctx.dataset.label}: ${v}`;
              },
            },
          },
        },
        scales,
      },
    });

    // Register with ChartService so its destroyChart() cleans it up on next load
    (this.chartSvc as any).activeChart = chart;
  }

  // ── CSV Download ──────────────────────────────────────────────────────────────

  downloadCsv(): void {
    if (!this.rows.length) { this.toastr.warning('No data to download.', 'Empty'); return; }

    const header   = this.cols.map(c => this.csvEscape(c.label)).join(',');
    const dataRows = this.rows.map(r =>
      this.cols.map(c => {
        const v = r[c.key];
        return (v === null || v === undefined) ? '' : this.csvEscape(String(v));
      }).join(',')
    );

    const csv  = [header, ...dataRows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    const yearPart = this.selectedYear || 'all';
    a.download = `${this.reportId}_${yearPart}_${this.selectedPeriod}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.toastr.success('CSV downloaded.', 'Done');
  }

  private csvEscape(value: string): string {
    if (!value) return '';
    const s = String(value);
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  }

  // ── Sort ──────────────────────────────────────────────────────────────────────

  sortBy(key: string): void {
    this.sortAsc = this.sortKey === key ? !this.sortAsc : true;
    this.sortKey = key;
    const cmp = (a: any, b: any) => {
      const va = a[key] ?? ''; const vb = b[key] ?? '';
      return this.sortAsc ? (va > vb ? 1 : va < vb ? -1 : 0) : (va < vb ? 1 : va > vb ? -1 : 0);
    };
    this.allRows = [...this.allRows].sort(cmp);
    this.rows    = [...this.rows].sort(cmp);
    if (this.showChart) setTimeout(() => this.renderChart(), 0);
  }

  // ── Column builder ────────────────────────────────────────────────────────────

  private makeColDef(key: string): ColDef {
    return { key, label: this.toLabel(key), kind: this.detectKind(key), align: this.detectAlign(key) };
  }

  private toLabel(key: string): string {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
              .replace(/\bId\b/, 'ID').replace(/\bIds\b/, 'IDs').trim();
  }

  private detectKind(key: string): ColDef['kind'] {
    const lk = key.toLowerCase();
    if (/amount|collection|discount|price|net(?!amount)|paid|pending|total(?!patients|records|tests)/.test(lk)) return 'currency';
    // 'active' and 'inactive' are numeric counts (e.g. AddressManagerSummary); only 'isactive' is a boolean badge
    if (/^active$|^inactive$|count|patients|records|tests|id$|commissionpct|commissionpercentage/.test(lk)) return 'number';
    if (/date/.test(lk)) return 'date';
    if (/status|type|gender|isactive/.test(lk)) return 'badge';
    return 'text';
  }

  private detectAlign(key: string): ColDef['align'] {
    const lk = key.toLowerCase();
    if (/amount|collection|discount|price|net|paid|pending|count|patients|records|tests/.test(lk)) return 'right';
    if (/id$/.test(lk)) return 'center';
    return 'left';
  }

  // ── Template helpers ──────────────────────────────────────────────────────────

  formatCell(value: any, kind: ColDef['kind'], key = ''): string {
    if (value === null || value === undefined || value === '') return '—';
    switch (kind) {
      case 'currency': return '₹ ' + (this.decimal.transform(value, '1.2-2') ?? '0.00');
      case 'number': {
        const lk = key.toLowerCase();
        if (/commissionpct|commissionpercentage/.test(lk))
          return (this.decimal.transform(value, '1.2-2') ?? String(value)) + ' %';
        return this.decimal.transform(value, '1.0-0') ?? String(value);
      }
      default: return String(value);
    }
  }

  formatTotalKey(key: string): string { return this.toLabel(key); }

  formatTotalValue(key: string, v: number): string {
    const lk = key.toLowerCase();
    // Plain integer counts — no currency symbol
    if (/count|patients|records|tests|institutes/.test(lk))
      return this.decimal.transform(v, '1.0-0') ?? String(v);
    // Commission percentage
    if (/commissionpct|commissionpercentage/.test(lk))
      return (this.decimal.transform(v, '1.2-2') ?? String(v)) + ' %';
    // Everything else is currency
    return '₹ ' + (this.decimal.transform(v, '1.2-2') ?? '0.00');
  }

  badgeClass(value: string): string {
    const v = String(value ?? '').toLowerCase();
    if (/completed|done|paid|active|yes/.test(v))  return 'b-g';
    if (/pending|partial/.test(v))                  return 'b-y';
    if (/cancelled|refund|no|inactive/.test(v))     return 'b-r';
    return 'b-b';
  }
}
