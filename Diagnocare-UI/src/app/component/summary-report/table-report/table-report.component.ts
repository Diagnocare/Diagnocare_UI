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
    { label: 'Month',   value: 'month'   },
    { label: 'Quarter', value: 'quarter' },
    { label: 'Year',    value: 'year'    },
  ];
  /** Chart Type sits beside Year and Period on every report and means drawing style. */
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

  // ── Level of aggregation (reports with config.levelOptions) ──────────────────
  //
  // Reports that declare levelOptions can be summarised at more than one level of a
  // hierarchy — group → sub-group → test. The level is picked on the chart panel's
  // own "View by" selector and sent to the API as GroupBy, which regroups the table,
  // the totals strip and the chart together. It is a question about the data, not a
  // drawing style, so it is kept apart from the Chart Type buttons.

  /** Sent to the API as GroupBy; the response comes back rolled up to this level. */
  groupLevel = '';
  /** How the API spells that level — 'Group', 'Sub Group', 'Test'. Shown in the title. */
  levelLabel = '';

  /** True when this report can be regrouped (and so shows the "View by" selector). */
  get isLevelReport(): boolean { return !!this.config?.levelOptions?.length; }

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
    this.groupLevel = this.config.levelOptions?.[0]?.value ?? '';
    this.levelLabel = this.config.levelOptions?.[0]?.label ?? '';
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
      this.groupLevel     = this.config.levelOptions?.[0]?.value ?? '';
      this.levelLabel     = this.config.levelOptions?.[0]?.label ?? '';
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

    // 3. Recompute totals from the visible rows (skip rate/percentage columns,
    //    and identifiers — the sum of a column of IDs means nothing).
    const computed: { [key: string]: number } = {};
    for (const col of this.cols) {
      if (col.kind !== 'currency' && col.kind !== 'number') continue;
      const lk = col.key.toLowerCase();
      if (/commissionpct|commissionpercentage/.test(lk)) continue;
      if (/id$/i.test(col.key) && !/paid$/i.test(col.key)) continue;
      computed[col.key] = this.rows.reduce((s, r) => s + (Number(r[col.key]) || 0), 0);
    }

    // The envelope's own aggregates describe the whole result set, so they are
    // only correct while nothing is filtered out. Column sums were previously
    // computed in the filtered branch alone, which left the footer blank on
    // first load for every report whose envelope totals are not column names.
    this.totals = (!term && !this.colFilters?.length)
      ? { ...computed, ...this.apiTotals }
      : computed;
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

  /**
   * "View by" changed — a different level of aggregation, so the report is
   * re-fetched rather than redrawn: the roll-up happens in the API, and the table,
   * the totals strip and the chart all change with it.
   */
  onLevelChange(level: string): void {
    if (!level || level === this.groupLevel) return;
    this.groupLevel = level;
    // Optimistic label, replaced by the one the API echoes back.
    this.levelLabel = this.config.levelOptions?.find(o => o.value === level)?.label ?? this.levelLabel;
    this.loadData();
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
      groupBy:   this.groupLevel     || undefined,
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

    // The API names the level it actually grouped by, so the title says what is on
    // screen even if the request was defaulted or spelt differently.
    if (typeof resp.levelLabel === 'string' && resp.levelLabel) this.levelLabel = resp.levelLabel;

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

      this.cols = this.allRows.length > 0
        ? Object.keys(this.allRows[0]).filter(k => !this.isHiddenKey(k)).map(k => this.makeColDef(k))
        : [];
      this.applyRowFilter();

      // Must precede applyRowFilter(): that is what folds these into this.totals.
      const skip = new Set(['data', 'fromDate', 'toDate', 'totalRecords', 'totalTests']);
      this.apiTotals = {};
      for (const [k, v] of Object.entries(resp)) {
        if (skip.has(k) || this.isHiddenKey(k)) continue;
        if (typeof v === 'number') this.apiTotals[k] = v as number;
      }

      this.applyRowFilter();

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
        if (!dateSkip.has(k) && !this.isHiddenKey(k)) synRow[k] = v;
      }

      this.rows      = [synRow];
      this.cols      = Object.keys(synRow).map(k => this.makeColDef(k));
      this.totals    = {};
      this.hasTotals = false;
      const count    = resp.totalRecords ?? 1;
      this.totalLabel = `${count} record${count !== 1 ? 's' : ''}`;
    }

    // ── Chart setup (shared) ──────────────────────────────────────────────────
    // Which columns can be charted is decided by what is actually IN the data,
    // not by detectKind()'s name regex.
    //
    // The regex only recognises a fixed vocabulary (amount, collection, count,
    // patients …). Any numeric field it does not happen to match was silently
    // classed as 'text' and vanished from this dropdown — which is why the list
    // could end up with a single entry on a report whose response carries eight
    // numeric columns. Reading the values makes it correct for every report,
    // including fields the API adds later.
    this.chartableNumericCols = this.cols.filter(c => this.isChartable(c));

    if (!this.chartValueCol || !this.chartableNumericCols.find(c => c.key === this.chartValueCol)) {
      // A report can name the column worth plotting. Without that the first currency
      // column wins, which on a report carrying a catalogue rate alongside the money
      // taken would chart the rate — the one number that is the same every month.
      const preferred = this.config?.defaultChartCol
        ? this.chartableNumericCols.find(c => c.key === this.config.defaultChartCol)
        : undefined;
      const defaultCurrency = this.chartableNumericCols.find(c => c.kind === 'currency');
      this.chartValueCol = preferred?.key ?? defaultCurrency?.key ?? this.chartableNumericCols[0]?.key ?? '';
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

    const valueCol = this.cols.find(c => c.key === this.chartValueCol);
    const colLabel = valueCol?.label ?? this.chartValueCol;

    // On a level report the title has to say which level is on screen — the same
    // chart drawn by group and by test is two different claims about the business.
    const level = this.isLevelReport && this.levelLabel ? this.levelLabel : '';

    this.chartSvc.createChart(
      this.chartCanvas.nativeElement,
      this.chartType as any,
      periodCounts,
      [],
      level
        ? `${this.config?.label ?? ''} — ${colLabel} by ${level}`
        : `${this.config?.label ?? ''} — ${colLabel}`,
      '1.2-2',
      {
        xTitle:      level || labelCol.label,
        yTitle:      colLabel,
        seriesLabel: level ? `${colLabel} per ${level}` : colLabel,
        currency:    valueCol?.kind === 'currency',
      }
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
    const yearPart  = this.selectedYear || 'all';
    // Two exports of the same report at different levels must not share a filename.
    const levelPart = this.isLevelReport && this.groupLevel ? `${this.groupLevel}_` : '';
    a.download = `${this.reportId}_${levelPart}${yearPart}_${this.selectedPeriod}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

  /**
   * True when a column holds numbers worth plotting.
   *
   * Dates and badges are excluded by kind. Identifiers are excluded because
   * they are numeric but plotting them is meaningless — a bar chart of patient
   * IDs tells nobody anything. Everything else is judged on its values: if any
   * row holds something that parses as a finite number, the column is offered.
   */
  private isChartable(col: ColDef): boolean {
    if (col.kind === 'date' || col.kind === 'badge') return false;
    if (/(^|[^a-z])id$/i.test(col.key)) return false;

    // Prefer the unfiltered set: a column should not disappear from the chart
    // dropdown just because the current row filter hid every value in it.
    const sample = this.allRows.length > 0 ? this.allRows : this.rows;
    return sample.some(row => {
      const v = row[col.key];
      if (v === null || v === undefined || v === '' || typeof v === 'boolean') return false;
      return Number.isFinite(Number(v));
    });
  }

  /**
   * True when config.hiddenCols says this response field is not shown.
   *
   * The envelope spells its totals with a 'grand' prefix (grandTotalAmountPaid for
   * the totalAmountPaid column), so the prefix is ignored when matching: hiding a
   * figure means hiding it in the table and in the totals strip, not one of the two.
   */
  private isHiddenKey(key: string): boolean {
    const hidden = this.config?.hiddenCols;
    if (!hidden?.length) return false;
    const normalise = (k: string) => k.toLowerCase().replace(/^grand/, '');
    const target = normalise(key);
    return hidden.some(h => normalise(h) === target);
  }

  private makeColDef(key: string): ColDef {
    const kind = this.detectKind(key);
    return { key, label: this.toLabel(key), kind, align: this.detectAlign(key, kind) };
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

  /**
   * Alignment follows the column kind, not a second name regex. The two used to
   * be derived independently, so a numeric column the align regex did not list
   * — 'active', 'inactive' — rendered left while 'count' next to it rendered
   * right, leaving the numbers in one numeric block visually unaligned.
   */
  private detectAlign(key: string, kind: ColDef['kind']): ColDef['align'] {
    if (kind !== 'currency' && kind !== 'number') return 'left';
    // Identifiers stay centred — except 'paid', which merely looks like one.
    return /id$/i.test(key) && !/paid$/i.test(key) ? 'center' : 'right';
  }

  // ── Template helpers ──────────────────────────────────────────────────────────

  formatCell(value: any, kind: ColDef['kind'], key = ''): string {
    if (value === null || value === undefined || value === '') return '—';
    // Column kind is guessed from the key name, so a string can land in a numeric
    // column (e.g. patientId = "DC-0001" matches /id$/). DecimalPipe throws on
    // non-numeric input, which aborts change detection and leaves the loading
    // spinner stuck on screen — so fall back to plain text instead.
    if ((kind === 'currency' || kind === 'number') && !Number.isFinite(Number(value))) {
      return String(value);
    }
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

  /**
   * Status colour for a badge cell.
   *
   * Matched against the WHOLE value, not as a substring. The alternatives are
   * short words ('no', 'done', 'paid', 'yes'), and an unanchored search finds
   * them inside unrelated nouns — 'DiagnosticCenter' contains 'no'
   * (diag-NO-sticcenter), so an institution type came out styled as an error.
   *
   * Anything that is not a recognised status keeps the neutral blue, which is
   * the right default for the type / gender / payment-mode columns that also
   * render as badges.
   */
  badgeClass(value: string): string {
    const v = String(value ?? '').trim().toLowerCase();
    if (/^(completed|complete|done|paid|active|yes|true)$/.test(v))                  return 'b-g';
    if (/^(pending|partial|partially paid|in progress)$/.test(v))                    return 'b-y';
    if (/^(cancelled|canceled|refund|refunded|rejected|inactive|no|false)$/.test(v)) return 'b-r';
    return 'b-b';
  }
}
