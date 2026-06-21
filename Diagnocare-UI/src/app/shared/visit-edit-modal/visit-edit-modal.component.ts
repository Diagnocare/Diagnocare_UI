import {
  Component, EventEmitter, Input, OnInit, OnDestroy, Output
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';

import { MemberDto }           from 'src/app/models/member/member.dto';
import { DatePickerComponent } from 'src/app/shared/date-picker/date-picker.component';
import { VisitScheduleGetDto } from 'src/app/models/visitSchedule/visit-schedule.dto';

export interface VisitEditData {
  assignedMemberId: number;
  visitDate:        string;
  visitTime:        string;
}

@Component({
  selector:    'app-visit-edit-modal',
  standalone:  true,
  imports:     [CommonModule, ReactiveFormsModule, DatePickerComponent],
  templateUrl: './visit-edit-modal.component.html',
  styleUrls:   ['./visit-edit-modal.component.scss'],
})
export class VisitEditModalComponent implements OnInit, OnDestroy {
  @Input()  visit!:   VisitScheduleGetDto;
  @Input()  members:  MemberDto[] = [];
  @Input()  saving    = false;
  @Output() saved     = new EventEmitter<VisitEditData>();
  @Output() cancelled = new EventEmitter<void>();

  form!: FormGroup;

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
        Validators.pattern(/^([01]\d|2[0-3]):[0-5]\d$/),
      ]],
    });
  }

  ngOnDestroy(): void { document.body.classList.remove('modal-open'); }

  isInvalid(field: string): boolean {
    const c = this.form.get(field);
    return !!(c?.invalid && (c.touched || c.dirty));
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saved.emit(this.form.value as VisitEditData);
  }

  cancel(): void { this.cancelled.emit(); }
}
