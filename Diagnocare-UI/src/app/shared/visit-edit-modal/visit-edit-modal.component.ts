import {
  Component, EventEmitter, Input, OnInit, OnDestroy, Output
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators
} from '@angular/forms';
import { Subscription }        from 'rxjs';

import { MemberDto }           from 'src/app/models/member/member.dto';
import { DatePickerComponent } from 'src/app/shared/date-picker/date-picker.component';
import { VisitScheduleGetDto, VisitCalendarDayDto } from 'src/app/models/visitSchedule/visit-schedule.dto';
import { AppValidators }       from 'src/app/shared/validators/app-validators';

export interface VisitEditData {
  assignedMemberId: number;
  visitDate:        string;
  visitTime:        string;
  /** Set when the admin confirmed moving the visit onto a holiday. */
  overrideHoliday?: boolean;
}

@Component({
  selector:    'app-visit-edit-modal',
  standalone:  true,
  imports:     [CommonModule, FormsModule, ReactiveFormsModule, DatePickerComponent],
  templateUrl: './visit-edit-modal.component.html',
  styleUrls:   ['./visit-edit-modal.component.scss'],
})
export class VisitEditModalComponent implements OnInit, OnDestroy {
  @Input()  visit!:   VisitScheduleGetDto;
  @Input()  members:  MemberDto[] = [];
  @Input()  saving    = false;
  /**
   * Calendar data for the month on screen — carries the holiday flags, so the
   * modal can warn before a visit is moved onto a holiday.
   */
  @Input()  calendarData: VisitCalendarDayDto[] = [];
  @Output() saved     = new EventEmitter<VisitEditData>();
  @Output() cancelled = new EventEmitter<void>();

  form!: FormGroup;

  /** Admin ticked "move it anyway". */
  overrideHoliday = false;

  /** Role filter chips — mirrors the assign form. */
  readonly memberTypeOptions = [
    { label: 'User',           value: 1 },
    { label: 'Assistant',      value: 2 },
    { label: 'Admin',          value: 3 },
    { label: 'Collection Boy', value: 5 },
    { label: 'Doctor',         value: 6 },
  ];

  memberTypeFilter: number | null = null;

  get displayMembers(): MemberDto[] {
    if (this.memberTypeFilter === null) return this.members;
    return this.members.filter(m => m.typeUserId === this.memberTypeFilter);
  }

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    document.body.classList.add('modal-open');
    this.form = this.fb.group({
      assignedMemberId: [this.visit.assignedMemberId, Validators.required],
      visitDate:        [this.visit.visitDate,         Validators.required],
      visitTime:        [this.visit.visitTime,         [
        Validators.required,
        AppValidators.time24h(),
      ]],
    });

    // Changing the date invalidates any override already given.
    this.dateSub = this.form.get('visitDate')!.valueChanges
      .subscribe(() => (this.overrideHoliday = false));
  }

  private dateSub?: Subscription;

  ngOnDestroy(): void {
    this.dateSub?.unsubscribe();
    document.body.classList.remove('modal-open');
  }

  isInvalid(field: string): boolean {
    const c = this.form.get(field);
    return !!(c?.invalid && c.touched);
  }

  // ── Holiday awareness ──────────────────────────────────────────────────────

  /** The date currently chosen in the form. */
  private get chosenDate(): string | null {
    return this.form?.get('visitDate')?.value ?? null;
  }

  /** Holiday name for the chosen date, or null when it is a working day. */
  get holidayName(): string | null {
    const iso = this.chosenDate;
    if (!iso) return null;
    return this.calendarData.find(d => d.date === iso && d.isHoliday)?.holidayName
        ?? (this.visit.visitDate === iso ? this.visit.holidayName ?? null : null);
  }

  /**
   * Only warn when the date is actually moving onto a holiday. Re-saving a visit
   * that already sits on one (e.g. to change the assignee) must not be blocked.
   */
  get holidayWarning(): string | null {
    if (this.chosenDate === this.visit.visitDate) return null;
    return this.holidayName;
  }

  get blocked(): boolean {
    return !!this.holidayWarning && !this.overrideHoliday;
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    if (this.blocked) return;

    this.saved.emit({
      ...(this.form.value as VisitEditData),
      overrideHoliday: this.overrideHoliday || undefined,
    });
  }

  cancel(): void { this.cancelled.emit(); }
}
