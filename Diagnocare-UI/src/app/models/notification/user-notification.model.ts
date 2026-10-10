/**
 * In-app notifications — mirrors Diagnocare_API Model/Dtos/Notifications/UserNotificationDtos.cs
 * (camelCase). `module` keys are the API's UserNotificationModule names, camelCased.
 */
export type NotificationModuleKey = 'attendance' | 'salary' | 'visit' | 'attendanceRequest' | 'sampleCollection';

export interface UserNotification {
  id: number;
  module: NotificationModuleKey;
  /** UserNotificationType name, e.g. "VisitAssigned", "SalaryPaid". */
  type: string;
  title: string;
  message: string;
  /** Angular path to open on click, e.g. "/my-visits?date=2026-10-03". */
  route: string | null;
  /** ISO-8601 UTC ("…Z"). */
  createdAt: string;
  isRead: boolean;
}

export interface UserNotificationCounts {
  unread: number;
  byModule: Record<NotificationModuleKey, number>;
}

export const EMPTY_NOTIFICATION_COUNTS: UserNotificationCounts = {
  unread: 0,
  byModule: { attendance: 0, salary: 0, visit: 0, attendanceRequest: 0, sampleCollection: 0 },
};
