/** DTO used when creating a holiday. */
export interface CreateHolidayDTO {
  holidayDate: string;   // 'YYYY-MM-DD'
  holidayName: string;
  remark:      string;
}
