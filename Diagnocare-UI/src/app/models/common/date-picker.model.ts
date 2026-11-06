export interface CalendarDay {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isDisabled: boolean;
}

/** One cell of the month or year grid. */
export interface CalendarCell {
  /** Month index 0-11 in the month grid, full year in the year grid. */
  value: number;
  label: string;
  isCurrent: boolean;    // this month / this year on the wall calendar
  isSelected: boolean;   // holds the currently selected date
  isDisabled: boolean;   // entirely outside [min, max]
}

/** Which grid the panel is showing. */
export type DatePickerView = 'days' | 'months' | 'years';
