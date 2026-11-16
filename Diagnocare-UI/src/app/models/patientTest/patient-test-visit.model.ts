/** One step of a visit's progress bar. */
export interface VisitStep {
  label: string;
  state: 'done' | 'current' | 'todo';
}

/**
 * Everything the page says about one booking, in plain words, computed once per
 * load rather than on every change-detection pass.
 */
export interface VisitView {
  /** Test names on the booking (codes where a name is unknown). */
  names: string[];
  isToday: boolean;
  /** "27 Sep 2026" */
  dateLabel: string;
  /** "Sunday, 27 September 2026" */
  dayLabel: string;
  /** "Today", "15 days ago" */
  relLabel: string;
  /** "SEPTEMBER 2026" — the past-visits group header */
  monthLabel: string;
  steps: VisitStep[];
  /** What the big button does. */
  next: 'sampling' | 'results' | 'payment' | 'reports' | 'none';
  nextText: string;
  statusText: string;
  statusTone: 'ok' | 'warn' | 'muted';
  paymentText: string;
  paymentTone: 'ok' | 'due' | 'hold' | 'none';
  due: number;
  cancelled: boolean;
}
