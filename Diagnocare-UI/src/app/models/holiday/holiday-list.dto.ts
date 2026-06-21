/** DTO representing a holiday row in list responses. */
export interface HolidayDTO {
  holidayId:   number;
  holidayDate: string;   // 'YYYY-MM-DD'
  dayOfWeek:   string;
  holidayName: string;
  remark:      string;
  year:        number;
}
