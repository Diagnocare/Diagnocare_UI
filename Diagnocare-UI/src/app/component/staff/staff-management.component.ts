import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';

import { MemberService }         from 'src/app/services/memberService/member.service';
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

  showSignatureModal   = false;
  signaturePreviewUrl: string | null = null;

  private subs = new Subscription();

  constructor(
    private memberService: MemberService,
    private confirmModal:  ConfirmModalService,
    private router:        Router,
    private route:         ActivatedRoute,
  ) {}

  ngOnInit(): void {
    const tab = this.route.snapshot.queryParamMap.get('tab') as SectionType | null;
    const initial = this.sections.find(s => s.type === tab) ?? this.sections[0];
    this.activeSection = initial;
    this.loadSection(initial.type);
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
    this.router.navigate(['/users/add'], { queryParams: { type } });
  }

  editUser(id: number): void {
    this.router.navigate(['/users/edit', id], { queryParams: { type: 'user' } });
  }

  editStaff(type: 'doctor' | 'collection-boy', id: number): void {
    this.router.navigate(['/users/edit', id], { queryParams: { type } });
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  deleteUser(userId: number): void {
    this.subs.add(
      this.confirmModal.confirm({
        title: 'Delete User',
        message: 'Are you sure you want to delete this user? This cannot be undone.',
        confirmText: 'Delete', cancelText: 'Cancel'
      }).subscribe(confirmed => {
        if (!confirmed) return;
        this.memberService.delete(userId).subscribe({
          next:  () => { this.sections.find(s => s.type === 'user')!.loaded = false; this.loadSection('user'); },
          error: () => {}
        });
      })
    );
  }

  deleteStaff(type: 'doctor' | 'collection-boy', id: number): void {
    const label = type === 'doctor' ? 'Doctor' : 'Collection Boy';
    this.subs.add(
      this.confirmModal.confirm({
        title: `Delete ${label}`,
        message: `Are you sure you want to delete this ${label.toLowerCase()}?`,
        confirmText: 'Delete', cancelText: 'Cancel'
      }).subscribe(confirmed => {
        if (!confirmed) return;
        this.memberService.delete(id).subscribe({
          next:  () => { this.sections.find(s => s.type === type)!.loaded = false; this.loadSection(type); },
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
