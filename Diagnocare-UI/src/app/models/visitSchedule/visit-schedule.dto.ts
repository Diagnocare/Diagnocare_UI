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
}

/** Day summary for the admin calendar */
export interface VisitCalendarDayDto {
  date:           string;   // yyyy-MM-dd
  count:          number;
  pendingCount:   number;
  completedCount: number;
}

/** Payload to create a new visit */
export interface VisitScheduleCreateDto {
  assignedMemberId: number;
  contactId:        number;
  visitDate:        string;   // yyyy-MM-dd
  visitTime:        string;   // HH:mm
  purpose?:         string;
  notes?:           string;
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
}
