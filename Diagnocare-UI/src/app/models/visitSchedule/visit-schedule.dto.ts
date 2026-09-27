/** Visit assignment returned from API */
export interface VisitScheduleGetDto {
  id:               number;
  assignedMemberId: number;
  memberName:       string;
  contactId:        number;
  contactName:      string;
  contactType:      string;
  contactPhone:     string;
  contactAddress:   string;
  visitDate:        string;   // yyyy-MM-dd
  visitTime:        string;   // HH:mm
  purpose?:         string | null;
  notes?:           string | null;
  status:           'Pending' | 'Completed' | 'Cancelled';
  // Completion evidence
  completedAt?:             string | null;  // ISO datetime
  completionRemark?:        string | null;
  completionLocation?:      string | null;
  completionPhotoBase64?:   string | null;
  // Holiday annotation
  isHoliday?:               boolean;
  holidayName?:             string | null;
}

/** Day summary for the admin calendar */
export interface VisitCalendarDayDto {
  date:           string;   // yyyy-MM-dd
  count:          number;
  pendingCount:   number;
  completedCount: number;
  /** True when this date is a registered holiday. */
  isHoliday:      boolean;
  holidayName?:   string | null;
  /** True when the date is a holiday AND still has visits scheduled on it. */
  hasHolidayConflict: boolean;
}

/** A date that is a holiday but still carries scheduled visits. */
export interface HolidayVisitConflictDto {
  date:         string;   // yyyy-MM-dd
  holidayName:  string;
  visitCount:   number;
  pendingCount: number;
}

/** Payload to create a new visit */
export interface VisitScheduleCreateDto {
  assignedMemberId: number;
  contactId:        number;
  visitDate:        string;   // yyyy-MM-dd
  visitTime:        string;   // HH:mm
  purpose?:         string;
  notes?:           string;
  /** Set once the admin confirms the "this date is a holiday" warning. */
  overrideHoliday?: boolean;
}

/** Payload to update a visit */
export interface VisitScheduleUpdateDto {
  id:                number;
  assignedMemberId?: number;
  contactId?:        number;
  visitDate?:        string;
  visitTime?:        string;
  purpose?:          string;
  notes?:            string;
  /** 0=Pending 1=Completed 2=Cancelled */
  status?:           number;
  // Completion evidence — sent only when marking complete
  completionRemark?:      string;
  completionLocation?:    string;
  completionPhotoBase64?: string;
  /** Set once the admin confirms moving the visit onto a holiday. */
  overrideHoliday?:       boolean;
}
