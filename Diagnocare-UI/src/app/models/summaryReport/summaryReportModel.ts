// --- API request / response ---

export interface ReportRequestDto {
  pathologyId: string;
  period?: string;
}

export interface PeriodCount {
  period: string;
  count: number;
}

export interface SummaryReportResponse {
  currentYear: PeriodCount[];
  previousYear: PeriodCount[];
}

// --- UI types ---

export type ChartType = 'bar' | 'line' | 'pie' | 'doughnut' | 'area' | 'scatter' | 'bubble';

export interface ChartDisplayConfig {
  chartType: ChartType;
  label: string;
  icon: string;
}

export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  type?: 'text' | 'number' | 'date' | 'currency';
  width?: string;
}

export interface ReportConfig {
  id: string;
  label: string;
  icon: string;
  endpoint: string;
  defaultChartType: ChartType;
  digitInfo?: string;
  /** When true, hides Year + Period filter controls (for static/non-time-series reports). */
  noDateFilter?: boolean;
  /** When true, hides the chart column entirely (for non-visual list reports). */
  noChart?: boolean;
}
