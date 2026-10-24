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

/** One option of a hierarchy-level selector (see ReportConfig.levelOptions). */
export interface ReportLevelOption {
  /** Sent to the API as GroupBy. */
  value: string;
  label: string;
  icon: string;
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
  /**
   * Levels this report can be summarised at — e.g. group → sub-group → test.
   *
   * When set, the report shows a "View by" selector on its chart panel. The choice
   * is sent to the API as GroupBy and the report comes back regrouped, so the table,
   * the totals and the chart all change together. This is separate from Chart Type,
   * which stays what it is everywhere else: the drawing style.
   *
   * The first option is the default.
   */
  levelOptions?: ReportLevelOption[];
  /**
   * Column the chart plots until the user picks another one. Without it the chart
   * defaults to the first currency column in the response, which on a report that
   * also carries a catalogue rate is the rate rather than the collection.
   */
  defaultChartCol?: string;
  /**
   * Response fields this report does not show: left out of the table, the chart's
   * column list, the totals strip and the CSV export. The API still returns them —
   * this is about what the report puts in front of a reader, not what is computed.
   *
   * Matched case-insensitively, ignoring a leading 'grand', so one entry
   * ('totalAmountPaid') also hides the envelope's grandTotalAmountPaid total.
   */
  hiddenCols?: string[];
}
