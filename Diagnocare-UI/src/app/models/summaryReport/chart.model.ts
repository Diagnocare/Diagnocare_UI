/**
 * Labelling and formatting for one chart. Everything is optional; the defaults are
 * the time-series wording the summary dashboard has always used ('Period' / 'Count'
 * / 'Current Year'). Reports that plot something else — collection per test group,
 * say — pass their own, so the axes name what is actually on them.
 */
export interface ChartLabelOptions {
  /** X-axis title. Default 'Period'. */
  xTitle?: string;
  /** Y-axis title. Default 'Count'. */
  yTitle?: string;
  /** Legend / tooltip name of the plotted series. Default 'Current Year'. */
  seriesLabel?: string;
  /** Format values as rupees on the axis and in tooltips, and drop integer ticks. */
  currency?: boolean;
}
