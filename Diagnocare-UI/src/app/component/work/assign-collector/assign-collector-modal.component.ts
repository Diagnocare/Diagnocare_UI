import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';

import { WorklistItem } from 'src/app/models/worklist/worklist.models';
import { MemberDto } from 'src/app/models/member/member.dto';
import { MemberService } from 'src/app/services/memberService/member.service';
import { SampleCollectionService } from 'src/app/services/sampleCollectionServices/sample-collection.service';
import { MODAL_STYLES } from '../mark-collected/mark-collected-modal.component';

/**
 * "Assign collection boy" — hands a booking's pickup to a collection boy, or
 * moves it to another one. The grain is the booking (one visit, one draw), so
 * every test on it moves together. The API refuses once the sample is collected.
 */
@Component({
  selector: 'app-assign-collector-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="mc-overlay" *ngIf="visible" role="dialog" aria-modal="true"
         aria-labelledby="ac-title" (keydown.escape)="close()">
      <div class="mc-backdrop" (click)="close()"></div>

      <div class="mc-container">
        <div class="mc-header">
          <div class="mc-header-left">
            <h2 id="ac-title">
              <i class="fa fa-motorcycle" aria-hidden="true"></i>
              {{ item?.collectionAssignedTo ? 'Reassign collection boy' : 'Send for outside collection' }}
            </h2>
            <p class="mc-subtitle" *ngIf="item">
              {{ item.patientName }} · {{ item.patientAge }} / {{ item.patientGender }}
              · {{ item.patientId }} · order {{ item.testRegId }}
            </p>
          </div>
          <button type="button" class="mc-close" (click)="close()" aria-label="Close">
            <i class="fa fa-times" aria-hidden="true"></i>
          </button>
        </div>

        <div class="mc-body">
          <p class="mc-test" *ngIf="item?.collectionAssignedToName">
            Currently with {{ item?.collectionAssignedToName }}
          </p>

          <label class="mc-label" for="ac-collector">Who will collect the sample?</label>
          <select id="ac-collector" class="form-select" [(ngModel)]="collectorId" [disabled]="isSaving">
            <option value="">-- Select collection boy --</option>
            <option *ngFor="let cb of collectionBoys" [value]="cb.id">{{ cb.first_Name }} {{ cb.last_Name }}</option>
          </select>

          <p class="mc-hint" *ngIf="!loading && collectionBoys.length === 0">
            No active collection boys. Add one in Staff Management.
          </p>
          <p class="mc-hint">
            For samples collected outside the centre (home visits and the like). It appears
            on his "My Pickups" list, and every test on this order moves together.
          </p>
        </div>

        <div class="mc-footer">
          <button type="button" class="dc-btn dc-btn--cancel" (click)="close()" [disabled]="isSaving">Cancel</button>
          <button type="button" class="dc-btn dc-btn--save"
                  [disabled]="!collectorId || isSaving || +collectorId === item?.collectionAssignedTo"
                  (click)="save()">
            <i class="fa" [ngClass]="isSaving ? 'fa-spinner fa-spin' : 'fa-check'" aria-hidden="true"></i>
            {{ isSaving ? 'Saving…' : 'Assign' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [MODAL_STYLES],
})
export class AssignCollectorModalComponent implements OnChanges {
  @Input() item: WorklistItem | null = null;
  @Input() visible = false;

  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  collectionBoys: MemberDto[] = [];
  collectorId: string | number = '';
  isSaving = false;
  loading = false;

  constructor(
    private members: MemberService,
    private collection: SampleCollectionService,
    private toastr: ToastrService,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.collectorId = this.item?.collectionAssignedTo ?? '';
      // Read fresh each time: a collection boy added or deactivated elsewhere
      // should be reflected without a page refresh.
      this.loading = true;
      this.members.getCollectionBoysLookup().subscribe({
        next: list => { this.collectionBoys = list ?? []; this.loading = false; },
        error: () => { this.collectionBoys = []; this.loading = false; },
      });
    }
  }

  save(): void {
    if (!this.item || !this.collectorId || this.isSaving) return;
    this.isSaving = true;

    this.collection.assign(this.item.testRegId, +this.collectorId).subscribe({
      next: res => {
        this.isSaving = false;
        this.toastr.success(res?.message || 'Assigned.', 'Pickup assigned');
        this.saved.emit();
      },
      error: err => {
        this.isSaving = false;
        this.toastr.error(err?.error?.error || 'Could not assign that. Please try again.', 'Not assigned');
      },
    });
  }

  close(): void {
    if (this.isSaving) return;
    this.cancelled.emit();
  }
}
