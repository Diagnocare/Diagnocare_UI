import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { TokenService } from 'src/app/core/interceptors/token.service';
import { ConfirmModalService } from 'src/app/shared/confirm-modal/confirm-modal.service';
import {
  DueReminder,
  ReminderHistoryItem,
  ReminderSettings,
} from 'src/app/models/testReminder/test-reminder.model';
import { TestReminderService } from 'src/app/services/testReminderServices/test-reminder.service';

type Tab = 'due' | 'history';
type Filter = 'all' | 'overdue' | 'upcoming';

/**
 * Repeat-test reminders.
 *
 * Lists patients whose last HbA1c / lipid profile / sugar / … result was long enough ago
 * that the test is due again (per the test's "Remind patient to repeat" interval on the
 * Master Test screen), starting a few days before the due date.
 *
 * WhatsApp opens the patient's chat with the reminder pre-written; staff press send there,
 * then "Mark as sent" here so the reminder leaves the list. "Skip" removes it without
 * messaging (patient moved away, doctor stopped the test…).
 */
@Component({
  selector: 'app-test-reminders',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './test-reminders.component.html',
  styleUrls: ['./test-reminders.component.scss'],
})
export class TestRemindersComponent implements OnInit {
  tab: Tab = 'due';
  filter: Filter = 'all';
  search = '';

  due: DueReminder[] = [];
  history: ReminderHistoryItem[] = [];
  settings: ReminderSettings | null = null;

  isLoading = false;
  loadError = '';
  isAdmin = false;
  isAutoSending = false;

  /** Patients whose WhatsApp chat was opened — waiting for "Mark as sent". */
  opened = new Set<string>();
  /** Patient currently being marked, to disable its buttons. */
  busyId: string | null = null;
  /** Expanded "preview message" per patient. */
  preview = new Set<string>();

  private historyLoaded = false;

  constructor(
    private service: TestReminderService,
    private toastr: ToastrService,
    private tokenService: TokenService,
    private confirmModal: ConfirmModalService,
  ) {}

  ngOnInit(): void {
    this.isAdmin = this.tokenService.isAdmin();
    this.loadDue();
    this.service.getSettings().subscribe({ next: s => this.settings = s, error: () => {} });
  }

  // ── Loading ─────────────────────────────────────────────────────────────

  setTab(tab: Tab): void {
    this.tab = tab;
    if (tab === 'history' && !this.historyLoaded) this.loadHistory();
  }

  refresh(): void {
    this.tab === 'due' ? this.loadDue() : this.loadHistory();
  }

  loadDue(): void {
    this.isLoading = true;
    this.loadError = '';
    this.service.getDue().subscribe({
      next: list => { this.due = list ?? []; this.isLoading = false; },
      error: () => { this.isLoading = false; this.loadError = 'Could not load reminders.'; },
    });
  }

  loadHistory(): void {
    this.isLoading = true;
    this.loadError = '';
    this.service.getHistory(200).subscribe({
      next: list => { this.history = list ?? []; this.historyLoaded = true; this.isLoading = false; },
      error: () => { this.isLoading = false; this.loadError = 'Could not load history.'; },
    });
  }

  // ── View helpers ────────────────────────────────────────────────────────

  get overdueCount(): number { return this.due.filter(d => d.daysUntilDue < 0).length; }
  get upcomingCount(): number { return this.due.filter(d => d.daysUntilDue >= 0).length; }

  get visibleDue(): DueReminder[] {
    const q = this.search.trim().toLowerCase();
    return this.due.filter(d => {
      if (this.filter === 'overdue' && d.daysUntilDue >= 0) return false;
      if (this.filter === 'upcoming' && d.daysUntilDue < 0) return false;
      if (!q) return true;
      return d.patientName?.toLowerCase().includes(q)
        || d.patientId?.toLowerCase().includes(q)
        || (d.contact || '').includes(q)
        || d.tests.some(t => t.testName.toLowerCase().includes(q) || t.testCode.toLowerCase().includes(q));
    });
  }

  dueLabel(item: DueReminder): string {
    const d = item.daysUntilDue;
    if (d === 0) return 'Due today';
    if (d === 1) return 'Due tomorrow';
    if (d > 1) return `Due in ${d} days`;
    if (d === -1) return 'Overdue by 1 day';
    return `Overdue by ${-d} days`;
  }

  intervalLabel(days: number): string {
    if (days % 365 === 0) return days === 365 ? 'every year' : `every ${days / 365} years`;
    if (days % 30 === 0) return days === 30 ? 'every month' : `every ${days / 30} months`;
    return `every ${days} days`;
  }

  togglePreview(item: DueReminder): void {
    this.preview.has(item.patientId) ? this.preview.delete(item.patientId) : this.preview.add(item.patientId);
  }

  // ── Actions ─────────────────────────────────────────────────────────────

  /** Opens the patient's WhatsApp chat with the reminder typed in. */
  openWhatsApp(item: DueReminder): void {
    if (!item.whatsAppNumber) {
      this.toastr.warning(
        'This patient has no valid mobile number. Add one in the patient details, then refresh.',
        'WhatsApp');
      return;
    }

    // Staff press send inside WhatsApp; the app cannot see that happen, so the card
    // switches to a "Mark as sent" step rather than assuming it went.
    const url = `https://wa.me/${item.whatsAppNumber}?text=${encodeURIComponent(item.message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    this.opened.add(item.patientId);
  }

  markSent(item: DueReminder): void { this.mark(item, 'Sent'); }

  skip(item: DueReminder): void {
    this.confirmModal.confirmWithReason({
      title: 'Skip reminder',
      message: `Skip the reminder for ${item.patientName}? It will not come back until they are tested again.`,
      confirmText: 'Skip',
      reasonLabel: 'Reason (optional)',
      reasonPlaceholder: 'e.g. Patient moved away, doctor stopped the test',
    }).subscribe(r => { if (r.confirmed) this.mark(item, 'Skipped', r.reason); });
  }

  private mark(item: DueReminder, status: 'Sent' | 'Skipped', remark?: string): void {
    this.busyId = item.patientId;
    this.service.mark(item.tests, status, remark).subscribe({
      next: () => {
        this.busyId = null;
        this.due = this.due.filter(d => d.patientId !== item.patientId);
        this.opened.delete(item.patientId);
        this.historyLoaded = false;
        this.toastr.success(
          status === 'Sent'
            ? `Reminder for ${item.patientName} marked as sent.`
            : `Reminder for ${item.patientName} skipped.`,
          'Test reminders');
      },
      error: () => { this.busyId = null; },
    });
  }

  /** Admin: send every due reminder through the WhatsApp Cloud API now. */
  sendAutomatic(): void {
    if (!this.settings?.whatsAppApiConfigured) return;
    this.confirmModal.confirm({
      title: 'Send reminders automatically',
      message: `Send ${this.due.length} reminder(s) now through the WhatsApp Business API? `
             + 'Patients without a valid mobile number are left on the list.',
      confirmText: 'Send now',
    }).subscribe(ok => { if (ok) this.runAutoSend(); });
  }

  private runAutoSend(): void {
    this.isAutoSending = true;
    this.service.sendAutomatic().subscribe({
      next: r => {
        this.isAutoSending = false;
        r.failed > 0
          ? this.toastr.warning(r.message || 'Some reminders could not be sent.', 'Test reminders')
          : this.toastr.success(r.message || 'Done.', 'Test reminders');
        this.historyLoaded = false;
        this.loadDue();
      },
      error: () => { this.isAutoSending = false; },
    });
  }

  trackByPatient = (_: number, item: DueReminder) => item.patientId;
  trackById = (_: number, item: ReminderHistoryItem) => item.id;
}
