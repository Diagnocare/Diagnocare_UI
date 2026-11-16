export interface VisitCompletionData {
  remark:      string;
  location:    string;
  photoBase64: string | null;
}

export interface VisitEditData {
  assignedMemberId: number;
  visitDate:        string;
  visitTime:        string;
  /** Set when the admin confirmed moving the visit onto a holiday. */
  overrideHoliday?: boolean;
}
