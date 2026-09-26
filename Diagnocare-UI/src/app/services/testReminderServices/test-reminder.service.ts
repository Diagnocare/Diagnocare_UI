import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { controllerEndpoints } from 'src/app/constant/constants';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import {
  AutoSendResult,
  DueReminder,
  DueReminderTest,
  ReminderHistoryItem,
  ReminderSettings,
} from 'src/app/models/testReminder/test-reminder.model';

/**
 * Repeat-test reminders — api/TestReminder (LabOperations policy).
 * SendAutomatic is Admin / Super Admin only.
 */
@Injectable({ providedIn: 'root' })
export class TestReminderService {
  private readonly apiUrl = getDiagnocareApiUrl() + controllerEndpoints.testReminder;

  constructor(private http: HttpClient) {}

  getDue(): Observable<DueReminder[]> {
    return this.http.get<DueReminder[]>(`${this.apiUrl}Due`);
  }

  getHistory(take = 100): Observable<ReminderHistoryItem[]> {
    return this.http.get<ReminderHistoryItem[]>(`${this.apiUrl}History?take=${take}`);
  }

  getSettings(): Observable<ReminderSettings> {
    return this.http.get<ReminderSettings>(`${this.apiUrl}Settings`);
  }

  /** Records that the reminders for these tests were sent (or skipped). */
  mark(tests: DueReminderTest[], status: 'Sent' | 'Skipped', remark?: string): Observable<{ recorded: number }> {
    return this.http.post<{ recorded: number }>(`${this.apiUrl}Mark`, {
      status,
      remark: remark || null,
      items: tests.map(t => ({ sourceTestRegId: t.sourceTestRegId, testCode: t.testCode })),
    });
  }

  /** Sends every due reminder through the WhatsApp Cloud API now. Admin only. */
  sendAutomatic(): Observable<AutoSendResult> {
    return this.http.post<AutoSendResult>(`${this.apiUrl}SendAutomatic`, {});
  }
}
