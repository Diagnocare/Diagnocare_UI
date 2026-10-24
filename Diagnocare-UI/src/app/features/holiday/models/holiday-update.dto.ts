/** DTO used when updating a holiday. */
export interface UpdateHolidayDTO {
  holidayId:   number;
  holidayDate: string;   // 'YYYY-MM-DD'
  holidayName: string;
  remark:      string;
}
