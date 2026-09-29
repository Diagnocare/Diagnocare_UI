/** One test inside a due reminder. Mirrors DueReminderTestDto. */
export interface DueReminderTest {
  /** The booking whose result started the clock. */
  sourceTestRegId: number;
  testCode: string;
  testName: string;
  lastTestDate: string;
  repeatIntervalDays: number;
  dueDate: string;
}

/** One patient due (or nearly due) to repeat one or more tests. Mirrors DueReminderDto. */
export interface DueReminder {
  patientId: string;
  patientName: string;
  contact?: string | null;
  /** Digits with country code (919876543210), ready for wa.me. Null when unusable. */
  whatsAppNumber?: string | null;
  dueDate: string;
  /** Negative when overdue. */
  daysUntilDue: number;
  tests: DueReminderTest[];
  /** Pre-written message covering every test. */
  message: string;
}

export interface ReminderHistoryItem {
  id: number;
  patientId: string;
  patientName: string;
  testCode: string;
  testName: string;
  dueDate: string;
  status: 'Sent' | 'Skipped' | string;
  channel?: string | null;
  phone?: string | null;
  actionedAt: string;
  actionedBy?: string | null;
  remark?: string | null;
}

export interface ReminderSettings {
  leadDays: number;
  overdueWindowDays: number;
  autoSend: boolean;
  whatsAppApiConfigured: boolean;
  testsWithInterval: number;
}

export interface AutoSendResult {
  attempted: number;
  sent: number;
  failed: number;
  message?: string | null;
}

/** Presets offered on the Master Test screen for "Remind patient to repeat". */
export const REPEAT_INTERVAL_PRESETS: { days: number; label: string }[] = [
  { days: 30,  label: 'Every month (30 days)' },
  { days: 60,  label: 'Every 2 months (60 days)' },
  { days: 90,  label: 'Every 3 months (90 days)' },
  { days: 180, label: 'Every 6 months (180 days)' },
  { days: 365, label: 'Every year (365 days)' },
];
