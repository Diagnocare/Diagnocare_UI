import { HolidayDTO } from 'src/app/models/holiday/holiday.dto';

/** Calendar cell: one day in the monthly mini-grid. */
export interface CalendarCell {
  date:    Date;
  inMonth: boolean;
  holiday: HolidayDTO | null;
}

/** One month in the full-year calendar. */
export interface MonthGrid {
  name:  string;
  year:  number;
  month: number;   // 1-based
  weeks: CalendarCell[][];
}

/** One row in the bulk-add form. */
export interface BulkDraft {
  holidayDate: string;
  holidayName: string;
  remark:      string;
}
