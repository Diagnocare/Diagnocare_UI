import {
  Component, Input, OnInit, OnDestroy, OnChanges,
  SimpleChanges, ViewChild, ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { ReportConfig, PeriodCount, ChartType } from 'src/app/models/summaryReport/summaryReportModel';
import { ChartService } from 'src/app/services/summaryServices/chart.service';
import { SummaryReportService } from 'src/app/services/summaryServices/summary-report.service';
import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { ReportFilterBarComponent, FilterChartOption } from 'src/app/shared/report-filter-bar/report-filter-bar.component';
import { chartDisplayOptions } from 'src/app/constant/constants';

@Component({
  selector: 'app-base-report',
  templateUrl: './base-report.component.html',
  styleUrls: ['./base-report.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent, ReportFilterBarComponent]
})
export class BaseReportComponent implements OnInit, OnDestroy, OnChanges {
  @Input() reportConfig!: ReportConfig;
  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;

  currentYearData: PeriodCount[] = [];
  previousYearData: PeriodCount[] = [];
  // When 'All' years selected, hold per-year series for table and chart
  multiYearSeries: Array<{ year: number, label: string, periods: PeriodCount[] }> = [];
  multiLabels: string[] = [];
  isLoading = false;
  selectedChartType: string = 'bar';
  selectedYear: string = '';
  availableYears: string[] = [];
  selectedPeriodType: string = 'month';
  periodTypeOptions = [
    { label: 'Week',    value: 'week'    },
    { label: 'Month',   value: 'month'   },
    { label: 'Quarter', value: 'quarter' },
    { label: 'Year',    value: 'year'    },
  ];

  private monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  private destroy$ = new Subject<void>();

  constructor(
    private reportService: SummaryReportService,
    private chartService: ChartService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    const currentYear = new Date().getFullYear();
    for (let i = 0; i <= 5; i++) {
      this.availableYears.push((currentYear - i).toString());
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['reportConfig'] && this.reportConfig) {
      this.selectedChartType = this.reportConfig.defaultChartType;
      this.countDigitInfo = this.reportConfig.digitInfo || '1.2-2';
      this.resetFilter();
    }
  }

  readonly chartOptions: FilterChartOption[] = chartDisplayOptions;
  countDigitInfo = '1.2-2';

  // ── Filter bar event handlers ─────────────────────────────────────────────────

  onYearChange(year: string): void {
    this.selectedYear = year;
    this.loadData();
  }

  onPeriodChange(period: string): void {
    this.selectedPeriodType = period;
    this.loadData();
  }

  onChartTypeChange(type: string): void {
    this.selectedChartType = type;
    if (this.multiYearSeries.length > 0 || this.currentYearData.length > 0) {
      setTimeout(() => this.renderChart(), 0);
    }
  }

  onCsvExport(): void {
    this.downloadCsv();
  }

  get hasData(): boolean {
    return this.currentYearData.length > 0 || this.multiYearSeries.length > 0;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.chartService.destroyChart();
  }

  loadData(): void {
    if (!this.reportConfig) return;

    this.isLoading = true;
    const year = this.selectedYear || undefined;

    this.reportService.getReportData(this.reportConfig.id, this.selectedPeriodType, year)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;

          if (response && Array.isArray(response.data)) {
            const grouped = response.data as Array<any>;

            if (!this.selectedYear) {
              this.multiYearSeries = [];
              this.multiLabels = [];

              if (this.selectedPeriodType === 'month') {
                this.multiLabels = this.monthNames.slice();
                for (const yr of grouped) {
                  const map = new Map<string, number>();
                  for (const p of (yr.periods || [])) map.set(p.period, p.count || 0);
                  const periods = this.multiLabels.map(m => ({ period: m, count: map.get(m) || 0 }));
                  this.multiYearSeries.push({ year: yr.year, label: String(yr.year), periods });
                }
              } else if (this.selectedPeriodType === 'quarter') {
                const qLabelsSet = new Set<string>();
                for (const yr of grouped) for (const p of (yr.periods || [])) qLabelsSet.add(p.period);
                this.multiLabels = Array.from(qLabelsSet);
                for (const yr of grouped) {
                  const map = new Map<string, number>();
                  for (const p of (yr.periods || [])) map.set(p.period, p.count || 0);
                  const periods = this.multiLabels.map(q => ({ period: q, count: map.get(q) || 0 }));
                  this.multiYearSeries.push({ year: yr.year, label: String(yr.year), periods });
                }
              } else if (this.selectedPeriodType === 'year') {
                this.multiLabels = grouped.map(g => String(g.year));
                for (const yr of grouped) {
                  const total = (yr.periods || []).reduce((s: number, p: any) => s + (p.count || 0), 0);
                  this.multiYearSeries.push({ year: yr.year, label: String(yr.year), periods: [{ period: String(yr.year), count: total }] });
                }
              } else {
                const labelsSet = new Set<string>();
                for (const yr of grouped) for (const p of (yr.periods || [])) labelsSet.add(p.period);
                this.multiLabels = Array.from(labelsSet);
                for (const yr of grouped) {
                  const map = new Map<string, number>();
                  for (const p of (yr.periods || [])) map.set(p.period, p.count || 0);
                  const periods = this.multiLabels.map(l => ({ period: l, count: map.get(l) || 0 }));
                  this.multiYearSeries.push({ year: yr.year, label: String(yr.year), periods });
                }
              }

              this.currentYearData = [];
              this.previousYearData = [];
              if (this.multiYearSeries.length > 0) setTimeout(() => this.renderChart(), 0);
            } else {
              this.multiYearSeries = [];
              this.multiLabels = [];
              const found = grouped.find(g => String(g.year) === String(this.selectedYear));
              if (this.selectedPeriodType === 'month') {
                const map = new Map<string, number>();
                for (const p of (found && found.periods) || []) map.set(p.period, p.count || 0);
                this.currentYearData = this.buildMonthlyData(map, Number(this.selectedYear));
              } else {
                this.currentYearData = (found && found.periods) ? found.periods : [];
              }
              this.previousYearData = [];
              if (this.currentYearData.length > 0) setTimeout(() => this.renderChart(), 0);
            }
            return;
          }

          // Legacy response shape
          this.multiYearSeries = [];
          this.multiLabels = [];
          if (this.selectedPeriodType === 'month') {
            const map = new Map<string, number>();
            for (const p of (response.currentYear || [])) map.set(p.period, p.count || 0);
            this.currentYearData = this.buildMonthlyData(map);
            const prevMap = new Map<string, number>();
            for (const p of (response.previousYear || [])) prevMap.set(p.period, p.count || 0);
            this.previousYearData = this.buildMonthlyDataFull(prevMap);
          } else {
            this.currentYearData = response.currentYear || [];
            this.previousYearData = response.previousYear || [];
          }
          if (this.currentYearData.length > 0) setTimeout(() => this.renderChart(), 0);
        },
        error: () => {
          this.isLoading = false;
          this.currentYearData = [];
          this.previousYearData = [];
        }
      });
  }

  resetFilter(): void {
    this.selectedYear = '';
    this.selectedPeriodType = 'month';
    this.loadData();
  }

  // Helper used by template
  getMultiCount(series: { year: number, label: string, periods: PeriodCount[] }, lbl: string): number {
    if (!series?.periods) return 0;
    const found = series.periods.find(p => p.period === lbl);
    return (found && typeof found.count === 'number') ? found.count : 0;
  }

  // ── CSV Export ────────────────────────────────────────────────────────────────

  downloadCsv(): void {
    if (!this.hasData) { this.toastr.warning('No data to download.', 'Empty'); return; }

    let csv = '';

    if (this.multiYearSeries.length > 0) {
      // Comparison mode: Period | Year1 | Year2 | ...
      const yearHeaders = this.multiYearSeries.map(s => s.label).join(',');
      csv = `${this.selectedPeriodType},${yearHeaders}\r\n`;
      for (const lbl of this.multiLabels) {
        const counts = this.multiYearSeries.map(s => this.getMultiCount(s, lbl));
        csv += `${lbl},${counts.join(',')}\r\n`;
      }
    } else {
      // Single year mode: Period | Count
      csv = `${this.selectedPeriodType},Count\r\n`;
      for (const row of this.currentYearData) {
        csv += `${row.period},${row.count}\r\n`;
      }
    }

    const yearPart = this.selectedYear || 'all';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${this.reportConfig.id}_${yearPart}_${this.selectedPeriodType}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private buildMonthlyData(countsMap: Map<string, number>, year?: number): PeriodCount[] {
    const now = new Date();
    const currentYear = now.getFullYear();
    const isCurrentYear = year === undefined || year === currentYear;
    const months = isCurrentYear
      ? this.monthNames.slice(0, now.getMonth() + 1)
      : this.monthNames.slice();
    return months.map(m => ({ period: m, count: countsMap.get(m) || 0 }));
  }

  private buildMonthlyDataFull(countsMap: Map<string, number>): PeriodCount[] {
    return this.monthNames.map(m => ({ period: m, count: countsMap.get(m) || 0 }));
  }

  private renderChart(): void {
    if (!this.chartCanvas?.nativeElement) return;

    if (this.multiYearSeries.length > 0) {
      this.chartService.createChart(
        this.chartCanvas.nativeElement,
        this.selectedChartType as ChartType,
        this.multiYearSeries,
        this.multiLabels,
        this.reportConfig.label,
        this.countDigitInfo
      );
      return;
    }

    if (this.currentYearData.length === 0) return;

    this.chartService.createChart(
      this.chartCanvas.nativeElement,
      this.selectedChartType as ChartType,
      this.currentYearData,
      this.previousYearData,
      this.reportConfig.label,
      this.countDigitInfo
    );
  }
}
