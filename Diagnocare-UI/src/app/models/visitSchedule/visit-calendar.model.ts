import { VisitCalendarDayDto } from 'src/app/models/visitSchedule/visit-schedule.dto';

/** One cell in the month calendar grid. */
export interface CalendarDay {
  date:      Date;
  inMonth:   boolean;
  isToday:   boolean;
  visitInfo: VisitCalendarDayDto | null;
  /** True when this date is a registered holiday. */
  isHoliday:   boolean;
  holidayName: string | null;
  /** True when the date is a holiday that still has visits scheduled on it. */
  hasConflict: boolean;
}
