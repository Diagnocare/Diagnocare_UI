/** Represents a single public / office holiday returned by the API. */
export interface HolidayDTO {
  holidayId:   number;
  holidayDate: string;   // 'YYYY-MM-DD'
  dayOfWeek:   string;   // e.g. 'Monday'
  holidayName: string;   // e.g. 'Republic Day', 'Diwali'
  remark:      string;
  year:        number;
}

/** Payload sent when creating a new holiday. */
export interface CreateHolidayDTO {
  holidayDate: string;   // 'YYYY-MM-DD'
  holidayName: string;
  remark:      string;
}

/** Payload sent when updating an existing holiday. */
export interface UpdateHolidayDTO {
  holidayId:   number;
  holidayDate: string;   // 'YYYY-MM-DD'
  holidayName: string;
  remark:      string;
}
