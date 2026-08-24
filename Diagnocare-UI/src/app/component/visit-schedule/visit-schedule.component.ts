import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';

import { VisitScheduleService }   from 'src/app/services/visitScheduleServices/visit-schedule.service';
import { ContactAddressService }   from 'src/app/services/contactAddressServices/contact-address.service';
import { MemberService }           from 'src/app/services/memberService/member.service';
import { filterActiveMembers }     from 'src/app/shared/member-utils';
import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { DatePickerComponent }     from 'src/app/shared/date-picker/date-picker.component';
import { AppValidators }            from 'src/app/shared/validators/app-validators';
import { VisitCalendarComponent }  from 'src/app/shared/visit-calendar/visit-calendar.component';
import { VisitCardComponent }      from 'src/app/shared/visit-card/visit-card.component';

import {
  VisitCompleteModalComponent,
  VisitCompletionData,
} from 'src/app/shared/visit-complete-modal/visit-complete-modal.component';
import {
  VisitEditModalComponent,
  VisitEditData,
} from 'src/app/shared/visit-edit-modal/visit-edit-modal.component';

import {
  VisitScheduleGetDto,
  VisitCalendarDayDto,
  VisitScheduleCreateDto,
} from 'src/app/models/visitSchedule/visit-schedule.dto';
import { ContactAddressListDto } from 'src/app/models/contactAddress/contactAddress-list.dto';
import { MemberDto }             from 'src/app/models/member/member.dto';
import { InstitutionType } from 'src/app/constant/enums';

interface CalendarDay {
  date:      Date;
  inMonth:   boolean;
  isToday:   boolean;
  visitInfo: VisitCalendarDayDto | null;
}

@Component({
  selector:    'app-visit-schedule',
  standalone:  true,
  imports:     [CommonModule, FormsModule, ReactiveFormsModule, LoadingSpinnerComponent, VisitCompleteModalComponent, VisitEditModalComponent, DatePickerComponent, VisitCalendarComponent, VisitCardComponent],
  providers:   [DatePipe],
  templateUrl: './visit-schedule.component.html',
  styleUrls:   ['./visit-schedule.component.scss'],
})
export class VisitScheduleComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // ── Calendar state ─────────────────────────────────────────────────────────
  viewYear  = new Date().getFullYear();
  viewMonth = new Date().getMonth() + 1;
  calendarData: VisitCalendarDayDto[] = [];

  /** Computed getter — recalculated on every change-detection cycle, immune to manual-call issues. */
  get calendarWeeks(): CalendarDay[][] {
    const today    = new Date();
    const first    = new Date(this.viewYear, this.viewMonth - 1, 1);
    const lastDay  = new Date(this.viewYear, this.viewMonth, 0).getDate();
    const startDow = first.getDay();   // 0 = Sunday

    const visitMap = new Map<string, VisitCalendarDayDto>(
      this.calendarData.map(d => [d.date, d])
    );

    const cells: CalendarDay[] = [];

    // Leading days from previous month
    const prevLast = new Date(this.viewYear, this.viewMonth - 1, 0).getDate();
    for (let i = startDow - 1; i >= 0; i--) {
      cells.push({ date: new Date(this.viewYear, this.viewMonth - 2, prevLast - i), inMonth: false, isToday: false, visitInfo: null });
    }

    // Current month
    for (let d = 1; d <= lastDay; d++) {
      const date    = new Date(this.viewYear, this.viewMonth - 1, d);
      const key     = this.toIso(date);
      const isToday = date.toDateString() === today.toDateString();
      cells.push({ date, inMonth: true, isToday, visitInfo: visitMap.get(key) ?? null });
    }

    // Trailing days to complete last row
    let trail = 1;
    while (cells.length % 7 !== 0) {
      cells.push({ date: new Date(this.viewYear, this.viewMonth, trail++), inMonth: false, isToday: false, visitInfo: null });
    }

    const weeks: CalendarDay[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }

  readonly weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  readonly months   = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];

  // ── Selected day / detail panel ────────────────────────────────────────────
  selectedDate: string | null = null;
  dayVisits: VisitScheduleGetDto[] = [];
  loadingDay = false;

  // ── Status filter ──────────────────────────────────────────────────────────
  statusFilter: 'all' | 'Pending' | 'Completed' = 'all';

  get filteredDayVisits(): VisitScheduleGetDto[] {
    if (this.statusFilter === 'all') return this.dayVisits;
    return this.dayVisits.filter(v => v.status === this.statusFilter);
  }

  get pendingCount():   number { return this.dayVisits.filter(v => v.status === 'Pending').length; }
  get completedCount(): number { return this.dayVisits.filter(v => v.status === 'Completed').length; }

  // ── Edit visit modal ───────────────────────────────────────────────────────
  editingVisit: VisitScheduleGetDto | null = null;
  savingEdit    = false;

  openEditModal(visit: VisitScheduleGetDto): void { this.editingVisit = visit; }
  cancelEdit():  void { this.editingVisit = null; this.savingEdit = false; }

  onEditSaved(data: VisitEditData): void {
    this.savingEdit = true;
    this._visitSvc.update({
      id:               this.editingVisit!.id,
      assignedMemberId: data.assignedMemberId,
      visitDate:        data.visitDate,
      visitTime:        data.visitTime,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.savingEdit   = false;
        this.editingVisit = null;
        this.loadCalendar();
        if (this.selectedDate) this.loadDayVisits(this.selectedDate);
      },
      error: () => { this.savingEdit = false; },   // message shown centrally by ErrorInterceptor
    });
  }

  // ── View completion details ────────────────────────────────────────────────
  viewingVisit: VisitScheduleGetDto | null = null;
  openViewDetails(visit: VisitScheduleGetDto): void  { this.viewingVisit = visit; }
  closeViewDetails(): void { this.viewingVisit = null; }

  // ── Assignment form ────────────────────────────────────────────────────────
  showForm   = false;
  savingForm = false;
  assignForm: FormGroup;

  // ── Member list (see allMembers + displayMembers below) ───────────────────

  // ── Contact autocomplete state ─────────────────────────────────────────────
  /** All contacts loaded from the address book (unfiltered). */
  private allContacts: ContactAddressListDto[] = [];
  /** Contacts matching the selected contact type. */
  contactsByType: ContactAddressListDto[] = [];
  /** Suggestions visible in the dropdown. */
  filteredContactSuggestions: ContactAddressListDto[] = [];
  /** Controls dropdown visibility. */
  showContactSuggestions = false;
  /** Resolved contact id — null until the user selects or the name is getOrCreate'd. */
  selectedContactId: number | null = null;

  /** Contact type options shown in the DDL. */
  readonly contactTypeOptions: { label: string; value: InstitutionType }[] = [
    { label: 'Clinic',            value: InstitutionType.Clinic           },
    { label: 'Hospital',          value: InstitutionType.Hospital         },
    { label: 'Laboratory',        value: InstitutionType.Laboratory       },
    { label: 'Diagnostic Center', value: InstitutionType.DiagnosticCenter },
    { label: 'Pharmacy',          value: InstitutionType.Pharmacy         },
    { label: 'Doctor',            value: InstitutionType.Doctor           },
    { label: 'Other',             value: InstitutionType.Other            },
  ];

  isLoading = false;

  constructor(
    private _visitSvc:   VisitScheduleService,
    private _contactSvc: ContactAddressService,
    private _memberSvc:  MemberService,
    private fb:          FormBuilder,
    private cdr:         ChangeDetectorRef
  ) {
    this.assignForm = this.fb.group({
      assignedMemberId: [null,  Validators.required],
      // contactId is populated programmatically, not bound to a form control
      contactType:      [null,  Validators.required],
      contactName:      ['',    Validators.required],
      visitDate:        ['',    Validators.required],
      visitTime:        ['',    [Validators.required, AppValidators.time24h()]],
      purpose:          [''],
      notes:            [''],
    });
  }

  ngOnInit(): void {
    this.loadMembers();
    this.loadAllContacts();
    this.loadCalendar();
  }

  // ── Data loading ────────────────────────────────────────────────────────────

  // ── Member type filter ─────────────────────────────────────────────────────
  /** All active members loaded from API (unfiltered by role). */
  allMembers: MemberDto[] = [];
  /** Currently selected role filter — null means "All". */
  memberTypeFilter: number | null = null;

  /** Role options for the filter DDL. */
  readonly memberTypeOptions: { label: string; value: number }[] = [
    { label: 'User',           value: 1 },
    { label: 'Assistant',      value: 2 },
    { label: 'Admin',          value: 3 },
    { label: 'Collection Boy', value: 5 },
    { label: 'Doctor',         value: 6 },
  ];

  /** Members visible in the member select — filtered by role when one is chosen. */
  get displayMembers(): MemberDto[] {
    if (this.memberTypeFilter === null) return this.allMembers;
    return this.allMembers.filter(m => m.typeUserId === this.memberTypeFilter);
  }

  onMemberTypeFilterChange(): void {
    // Clear the selected member when role filter changes so stale id isn't submitted
    this.assignForm.patchValue({ assignedMemberId: null }, { emitEvent: false });
  }

  private loadMembers(): void {
    this._memberSvc.getAll().pipe(takeUntil(this.destroy$)).subscribe({
      // Exclude Super Admin (typeUserId=4) and the lab-owner admin row (last name = "admin")
      next: users => (this.allMembers = filterActiveMembers(
        (users ?? []).filter(u =>
          u.typeUserId !== 4 &&
          (u.last_Name ?? '').toLowerCase() !== 'admin'
        )
      )),
      error: () => (this.allMembers = []),
    });
  }

  private loadAllContacts(): void {
    this._contactSvc.getContacts().pipe(takeUntil(this.destroy$)).subscribe({
      next: contacts => (this.allContacts = contacts ?? []),
      error: ()      => (this.allContacts = []),
    });
  }

  private firstLoad = true;

  loadCalendar(): void {
    this.isLoading = true;
    this._visitSvc.getCalendar(this.viewYear, this.viewMonth)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: data => {
          this.calendarData = data;   // getter recomputes automatically
          this.isLoading    = false;

          if (this.firstLoad) {
            this.firstLoad    = false;
            const iso         = this.toIso(new Date());
            this.selectedDate = iso;
            this.assignForm.patchValue({ visitDate: iso });
            this.loadDayVisits(iso);
          }
        },
        error: () => { this.isLoading = false; },
      });
  }

  loadDayVisits(dateStr: string): void {
    this.selectedDate = dateStr;
    this.loadingDay   = true;
    this._visitSvc.getByDate(dateStr).pipe(takeUntil(this.destroy$)).subscribe({
      next: visits => { this.dayVisits = visits; this.loadingDay = false; },
      error: ()    => { this.dayVisits = [];     this.loadingDay = false; },
    });
  }

  // ── Contact autocomplete ────────────────────────────────────────────────────

  /** Called when the contact type DDL changes. */
  onContactTypeChange(): void {
    const type: InstitutionType | null = this.assignForm.get('contactType')?.value;
    // Clear contact name & selection
    this.assignForm.patchValue({ contactName: '' }, { emitEvent: false });
    this.selectedContactId  = null;
    this.showContactSuggestions = false;

    if (type == null) {
      this.contactsByType = [];
      return;
    }
    this.contactsByType = this.allContacts.filter(c => +c.institutionType === +type);
    this.filteredContactSuggestions = [...this.contactsByType];
  }

  /** Called on every keystroke in the contact name input. */
  onContactNameInput(event: Event): void {
    const keyword = (event.target as HTMLInputElement).value;
    this.selectedContactId = null;      // clear resolved id on any edit
    this.filterContactSuggestions(keyword);
    this.showContactSuggestions = this.filteredContactSuggestions.length > 0;
    this.cdr.detectChanges();
  }

  onContactNameFocus(): void {
    const keyword = this.assignForm.get('contactName')?.value ?? '';
    this.filterContactSuggestions(keyword);
    this.showContactSuggestions = this.filteredContactSuggestions.length > 0;
    this.cdr.detectChanges();
  }

  onContactNameBlur(): void {
    // Delay so click on suggestion fires first
    setTimeout(() => { this.showContactSuggestions = false; }, 200);
  }

  selectContactSuggestion(contact: ContactAddressListDto): void {
    this.assignForm.patchValue({ contactName: contact.name }, { emitEvent: false });
    this.selectedContactId      = contact.id ?? null;
    this.showContactSuggestions = false;
  }

  private filterContactSuggestions(keyword: string): void {
    const q = keyword.trim().toLowerCase();
    this.filteredContactSuggestions = q
      ? this.contactsByType.filter(c => c.name.toLowerCase().includes(q))
      : [...this.contactsByType];
  }

  /** True when the typed name doesn't match any loaded contact for the selected type. */
  get isNewContact(): boolean {
    const name = (this.assignForm.get('contactName')?.value ?? '').trim().toLowerCase();
    if (!name) return false;
    return !this.contactsByType.some(c => c.name.toLowerCase() === name);
  }

  get selectedContactTypeName(): string {
    const type: InstitutionType | null = this.assignForm.get('contactType')?.value;
    return this.contactTypeOptions.find(o => +o.value === +type!)?.label ?? 'Contact';
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  prevMonth(): void {
    if (this.viewMonth === 1) { this.viewMonth = 12; this.viewYear--; } else this.viewMonth--;
    this.selectedDate = null; this.loadCalendar();
  }

  nextMonth(): void {
    if (this.viewMonth === 12) { this.viewMonth = 1; this.viewYear++; } else this.viewMonth++;
    this.selectedDate = null; this.loadCalendar();
  }

  /** Day selected from the shared calendar (emits an ISO date string). */
  onDaySelected(iso: string): void {
    this.showForm = false;
    this.loadDayVisits(iso);
    this.assignForm.patchValue({ visitDate: iso });
  }

  // ── Form ───────────────────────────────────────────────────────────────────

  openForm(): void { this.showForm = true; }

  cancelForm(): void {
    this.showForm = false;
    this.selectedContactId = null;
    this.showContactSuggestions = false;
    this.assignForm.reset({ visitDate: this.selectedDate ?? '' });
    this.contactsByType = [];
    this.filteredContactSuggestions = [];
  }

  saveForm(): void {
    if (this.assignForm.invalid) {
      this.assignForm.markAllAsTouched();
      return;
    }

    const contactName: string = this.assignForm.get('contactName')!.value.trim();
    const contactType: InstitutionType = this.assignForm.get('contactType')!.value;

    // If a suggestion was selected the id is already resolved; otherwise getOrCreate.
    if (this.selectedContactId !== null) {
      this.doCreateVisit(this.selectedContactId);
      return;
    }

    // New name — create/find the contact first
    this.savingForm = true;
    this._contactSvc.getOrCreate(contactName, contactType)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: created => {
          // Reload contacts so the new entry appears in future dropdowns
          this.allContacts = [...this.allContacts.filter(c => c.id !== created.id), created];
          this.contactsByType = this.allContacts.filter(c => +c.institutionType === +contactType);
          this.selectedContactId = created.id ?? null;
          this.doCreateVisit(created.id!);
        },
        error: () => {
          // Message shown centrally by ErrorInterceptor.
          this.savingForm = false;
        },
      });
  }

  private doCreateVisit(contactId: number): void {
    const f = this.assignForm.value;
    const dto: VisitScheduleCreateDto = {
      assignedMemberId: f.assignedMemberId,
      contactId,
      visitDate: f.visitDate,
      visitTime: f.visitTime,
      purpose:   f.purpose  || undefined,
      notes:     f.notes    || undefined,
    };

    this._visitSvc.create(dto).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.savingForm = false;
        this.showForm   = false;
        this.selectedContactId = null;
        this.loadCalendar();
        if (this.selectedDate) this.loadDayVisits(this.selectedDate);
      },
      error: () => {
        // Message shown centrally by ErrorInterceptor.
        this.savingForm = false;
      },
    });
  }

  // ── Completion modal ───────────────────────────────────────────────────────

  completingVisit: VisitScheduleGetDto | null = null;
  savingComplete  = false;

  openCompleteModal(visit: VisitScheduleGetDto): void {
    this.completingVisit = visit;
  }

  onCompleteConfirmed(data: VisitCompletionData): void {
    if (!this.completingVisit) return;
    this.savingComplete = true;

    this._visitSvc.update({
      id:                   this.completingVisit.id,
      status:               1,
      completionRemark:     data.remark     || undefined,
      completionLocation:   data.location   || undefined,
      completionPhotoBase64: data.photoBase64 || undefined,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.completingVisit!.status = 'Completed';
        this.savingComplete  = false;
        this.completingVisit = null;
        this.loadCalendar();
        if (this.selectedDate) this.loadDayVisits(this.selectedDate);
      },
      error: () => {
        // Message shown centrally by ErrorInterceptor.
        this.savingComplete = false;
      },
    });
  }

  onCompleteCancelled(): void {
    this.completingVisit = null;
    this.savingComplete  = false;
  }

  // ── Delete / complete ──────────────────────────────────────────────────────

  deleteVisit(id: number): void {
    if (!confirm('Delete this visit assignment?')) return;
    this._visitSvc.delete(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.loadCalendar();
        if (this.selectedDate) this.loadDayVisits(this.selectedDate);
      },
      error: () => { /* message shown centrally by ErrorInterceptor */ },
    });
  }


  // ── Helpers ────────────────────────────────────────────────────────────────

  get viewLabel(): string { return `${this.months[this.viewMonth - 1]} ${this.viewYear}`; }

  formatTime(t: string): string {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  toIsoPublic(d: Date): string { return this.toIso(d); }
  private toIso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  isInvalid(field: string): boolean {
    const c = this.assignForm.get(field);
    return !!(c?.invalid && c.touched);
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }
}
