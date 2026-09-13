import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { MemberService, StaffCapacity } from 'src/app/services/memberService/member.service';
import { ConfirmModalService }   from 'src/app/shared/confirm-modal/confirm-modal.service';
import { ConfirmModalComponent } from 'src/app/shared/confirm-modal/confirm-modal.component';
import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { ActionButtonComponent } from 'src/app/shared/action-button/action-button.component';
import { SignaturePreviewModalComponent } from 'src/app/shared/signature-preview-modal/signature-preview-modal.component';

import { MemberDto } from 'src/app/models/member/member.dto';
import { Role }      from 'src/app/constant/enums';
import { isMemberActive } from 'src/app/shared/member-utils';

export type SectionType = 'user' | 'collection-boy' | 'doctor';

interface Section {
  type:    SectionType;
  title:   string;
  icon:    string;
  loading: boolean;
  loaded:  boolean;
}

@Component({
  selector: 'app-staff-management',
  templateUrl: './staff-management.component.html',
  styleUrls: ['./staff-management.component.css'],
  standalone: true,
  imports: [
    CommonModule, RouterModule,
    LoadingSpinnerComponent, ConfirmModalComponent,
    ActionButtonComponent, SignaturePreviewModalComponent
  ]
})
export class StaffManagementComponent implements OnInit, OnDestroy {

  sections: Section[] = [
    { type: 'user',           title: 'Users',           icon: 'fa-users',      loading: false, loaded: false },
    { type: 'collection-boy', title: 'Collection Boys', icon: 'fa-motorcycle', loading: false, loaded: false },
    { type: 'doctor',         title: 'Doctors',         icon: 'fa-user-md',    loading: false, loaded: false },
  ];

  activeSection: Section = this.sections[0];

  // Raw lists (all, including inactive)
  users:          MemberDto[] = [];
  collectionBoys: MemberDto[] = [];
  doctors:        MemberDto[] = [];

  showInactive = false;

  /** Filtered lists exposed to the template. */
  get visibleUsers():          MemberDto[] { return this.showInactive ? this.users          : this.users.filter(isMemberActive); }
  get visibleCollectionBoys(): MemberDto[] { return this.showInactive ? this.collectionBoys : this.collectionBoys.filter(isMemberActive); }
  get visibleDoctors():        MemberDto[] { return this.showInactive ? this.doctors        : this.doctors.filter(isMemberActive); }

  toggleInactive(): void { this.showInactive = !this.showInactive; }

  /**
   * Staff head-count, fetched from the API — the limit is server configuration
   * (`Staff:MaxStaffCount`), never a constant here. Null until the first response,
   * so a slow or failed call cannot wrongly block a legitimate add.
   */
  capacity: StaffCapacity | null = null;

  get canAddStaff(): boolean { return this.capacity ? this.capacity.canAddMore : true; }

  get addDisabledReason(): string {
    return this.canAddStaff ? ''
      : `Staff limit reached — all ${this.capacity?.max} slots are in use. ` +
        'Deactivate or delete a member to free one.';
  }

  /** Refreshed on load and after anything that frees or takes a slot. */
  private loadCapacity(): void {
    this.subs.add(this.memberService.getCapacity().subscribe({
      next: c => this.capacity = c, error: () => {}
    }));
  }

  showSignatureModal   = false;
  signaturePreviewUrl: string | null = null;

  private subs = new Subscription();

  constructor(
    private memberService: MemberService,
    private confirmModal:  ConfirmModalService,
    private router:        Router,
    private route:         ActivatedRoute,
    private toastr:        ToastrService,
  ) {}

  ngOnInit(): void {
    const tab = this.route.snapshot.queryParamMap.get('tab') as SectionType | null;
    const initial = this.sections.find(s => s.type === tab) ?? this.sections[0];
    this.activeSection = initial;
    this.loadSection(initial.type);
    this.loadCapacity();
  }

  // ── Tab selection ─────────────────────────────────────────────────────────

  selectTab(section: Section): void {
    this.activeSection = section;
    if (!section.loaded) this.loadSection(section.type);
  }

  private loadSection(type: SectionType): void {
    const section = this.sections.find(s => s.type === type)!;
    section.loading = true;

    // User tab loads all members (no role filter); staff tabs filter by specific role.
    const roleId = type === 'collection-boy' ? Role.Collection_Boy.id
                 : type === 'doctor'         ? Role.Doctor.id
                 :                             undefined;   // null → return all users

    this.subs.add(
      this.memberService.getAll(roleId).subscribe({
        next: d => {
          if (type === 'user')           this.users          = d;
          else if (type === 'collection-boy') this.collectionBoys = d;
          else                           this.doctors        = d;
          section.loading = false; section.loaded = true;
        },
        error: () => { section.loading = false; }
      })
    );
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  add(type: SectionType): void {
    if (!this.canAddStaff) return;   // button is disabled; this covers keyboard activation
    this.router.navigate(['/users/add'], { queryParams: { type } });
  }

  editUser(id: number): void {
    this.router.navigate(['/users/edit', id], { queryParams: { type: 'user' } });
  }

  editStaff(type: 'doctor' | 'collection-boy', id: number): void {
    this.router.navigate(['/users/edit', id], { queryParams: { type } });
  }

  // ── Deactivate / Reactivate / Permanent delete ────────────────────────────

  /**
   * Reloads one tab and refreshes the head-count. Called after anything that
   * changes a member's active state.
   */
  private refreshSection(type: SectionType): void {
    this.sections.find(s => s.type === type)!.loaded = false;
    this.loadSection(type);
    this.loadCapacity();
  }

  /**
   * The API returns `{ success, message }` on a 200 even when it refused the
   * operation — a staff limit, a self-deactivation, a visit schedule still
   * assigned. Without this the row simply did not move and the user was left
   * guessing, which is how "delete does nothing" gets reported as a bug.
   */
  private handleResult(type: SectionType, result: any, fallback: string): void {
    if (result?.success === false) {
      this.toastr.error(result.message || fallback, 'Error');
      return;
    }
    if (result?.message) this.toastr.success(result.message);
    this.refreshSection(type);
  }

  /**
   * Deactivates a member — the API keeps the row and stamps DeactivatedAt.
   * Their attendance, salary history and the approvals they signed off stay
   * intact, and the slot they occupied is freed. Reversible.
   */
  deactivateMember(type: SectionType, id: number): void {
    const label = type === 'user' ? 'User' : type === 'doctor' ? 'Doctor' : 'Collection Boy';
    this.subs.add(
      this.confirmModal.confirm({
        title: `Deactivate ${label}`,
        message: `Deactivate this ${label.toLowerCase()}? They lose access immediately and drop out of this list, ` +
                 'but their attendance and salary history is kept. You can reactivate them later from "Show Inactive".',
        confirmText: 'Deactivate', cancelText: 'Cancel'
      }).subscribe(confirmed => {
        if (!confirmed) return;
        this.memberService.delete(id).subscribe({
          next:  r => this.handleResult(type, r, `Could not deactivate this ${label.toLowerCase()}.`),
          error: () => {}   // HTTP/network errors are surfaced centrally by ErrorInterceptor
        });
      })
    );
  }

  /** Restores a deactivated member. Refused by the API when the staff limit is reached. */
  reactivateMember(type: SectionType, id: number): void {
    const label = type === 'user' ? 'User' : type === 'doctor' ? 'Doctor' : 'Collection Boy';
    this.subs.add(
      this.confirmModal.confirm({
        title: `Reactivate ${label}`,
        message: `Reactivate this ${label.toLowerCase()}? They will be able to sign in again and will take a staff slot.`,
        confirmText: 'Reactivate', cancelText: 'Cancel'
      }).subscribe(confirmed => {
        if (!confirmed) return;
        this.memberService.reactivate(id).subscribe({
          next:  r => this.handleResult(type, r, `Could not reactivate this ${label.toLowerCase()}.`),
          error: () => {}
        });
      })
    );
  }

  /**
   * Permanent erasure. Super Admin only (the API enforces it) and refused while
   * the member still has visit schedules assigned.
   */
  hardDeleteMember(type: SectionType, id: number): void {
    const label = type === 'user' ? 'User' : type === 'doctor' ? 'Doctor' : 'Collection Boy';
    this.subs.add(
      this.confirmModal.confirm({
        title: `Permanently Delete ${label}`,
        message: `This PERMANENTLY deletes this ${label.toLowerCase()} along with their attendance, salary ` +
                 'and login records. It cannot be undone. Continue?',
        confirmText: 'Delete Permanently', cancelText: 'Cancel'
      }).subscribe(confirmed => {
        if (!confirmed) return;
        this.memberService.hardDelete(id).subscribe({
          next:  r => this.handleResult(type, r, `Could not delete this ${label.toLowerCase()}.`),
          error: () => {}
        });
      })
    );
  }

  // ── Signature preview ─────────────────────────────────────────────────────

  openSignaturePreview(doctor: MemberDto): void {
    this.signaturePreviewUrl = doctor.signatureImage
      ? 'data:image/png;base64,' + doctor.signatureImage
      : null;
    this.showSignatureModal = true;
  }

  closeSignatureModal(): void {
    this.showSignatureModal  = false;
    this.signaturePreviewUrl = null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Exposed to template for inactive row styling / badge. */
  readonly isMemberActive = isMemberActive;

  getRoleLabel(typeUserId: number): string {
    return Object.values(Role).find(r => r.id === typeUserId)?.label ?? 'Unknown';
  }

  /** Super Admin (typeUserId=4) and the lab-owner admin (last_Name='Admin') cannot be edited or deleted. */
  isProtectedUser(u: MemberDto): boolean {
    return u.typeUserId === 4 ||
           (u.last_Name ?? '').toLowerCase() === 'admin';
  }

  ngOnDestroy(): void { this.subs.unsubscribe(); }
}
