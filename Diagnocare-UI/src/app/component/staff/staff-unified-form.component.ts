import { Component, OnInit, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule, FormBuilder, FormGroup, AbstractControl,
  FormControl, Validators, ValidatorFn
} from '@angular/forms';
import { FieldErrorComponent } from 'src/app/shared/field-error/field-error.component';
import { FormKeyboardDirective } from 'src/app/shared/directives/form-keyboard.directive';
import { switchMap } from 'rxjs/operators';
import { of, Observable } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';

import { MemberService }      from 'src/app/services/memberService/member.service';
import { CommonService }      from 'src/app/shared/common.service';
import { AppValidators }       from 'src/app/shared/validators/app-validators';
import { ConfirmModalService } from 'src/app/shared/confirm-modal/confirm-modal.service';
import { ConfirmModalComponent } from 'src/app/shared/confirm-modal/confirm-modal.component';
import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { SignaturePreviewModalComponent } from 'src/app/shared/signature-preview-modal/signature-preview-modal.component';
import { DatePickerComponent } from 'src/app/shared/date-picker/date-picker.component';

import { Role } from 'src/app/constant/enums';
import { MemberDto } from 'src/app/models/member/member.dto';

export type UnifiedFormType = 'user' | 'collection-boy' | 'doctor';

@Component({
  selector: 'app-staff-unified-form',
  templateUrl: './staff-unified-form.component.html',
  styleUrls: ['./staff-unified-form.component.css'],
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    LoadingSpinnerComponent, ConfirmModalComponent, SignaturePreviewModalComponent, DatePickerComponent,
    FieldErrorComponent, FormKeyboardDirective,
  ]
})
export class StaffUnifiedFormComponent implements OnInit {

  // ── State ──────────────────────────────────────────────────────────────────
  formType: UnifiedFormType = 'user';
  isEdit   = false;
  recordId: number | null = null;
  isLoading  = false;
  loadingMsg = '';

  form!: FormGroup;
  submitted = false;

  /** Tab order varies by form type — user has contactPhone/typeUserId, doctor has qualification/position. */
  get tabFields(): string[] {
    const common = ['user_Name', 'first_Name', 'last_Name', 'effectiveFrom', 'deactivatedAt'];
    if (this.formType === 'user')           return ['user_Name', 'first_Name', 'last_Name', 'email', 'contactPhone', 'typeUserId', 'effectiveFrom', 'deactivatedAt'];
    if (this.formType === 'doctor')         return ['user_Name', 'first_Name', 'last_Name', 'qualification', 'position', 'effectiveFrom', 'deactivatedAt'];
    return common; // collection-boy
  }

  /** Role options shown in the User type selector */
  userRoleOptions = [
    { id: Role.User.id,       label: Role.User.label       },
    { id: Role.Assistant.id,  label: Role.Assistant.label  },
    { id: Role.Admin.id,      label: Role.Admin.label      },
  ];

  // Signature (doctors only)
  selectedSignatureFile: File | null = null;
  selectedPreviewUrl:    string | null = null;
  showSignatureInput  = false;
  showSignatureModal  = false;
  signaturePreviewUrl: string | null = null;

  @ViewChild('fileInputRef') fileInputRef!: ElementRef<HTMLInputElement>;

  private fb           = inject(FormBuilder);
  private memberService = inject(MemberService);
  private confirmModal = inject(ConfirmModalService);
  private route        = inject(ActivatedRoute);
  private router       = inject(Router);

  // ── Init ───────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    // Determine type from query param
    const typeParam = this.route.snapshot.queryParamMap.get('type') as UnifiedFormType | null;
    this.formType = typeParam ?? 'user';

    // Determine edit mode from route param
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.isEdit  = true;
      this.recordId = +idParam;
    }

    this.buildForm();
    if (this.isEdit && this.recordId) this.loadRecord(this.recordId);
  }

  // ── Form builder ───────────────────────────────────────────────────────────

  private buildForm(): void {
    if (this.formType === 'user') {
      this.form = this.fb.group({
        user_Name:    new FormControl(
          { value: '', disabled: this.isEdit },
          {
            validators: [Validators.required, Validators.minLength(5)],
            asyncValidators: this.isEdit ? [] : [this.memberService.userNameValidator()],
            updateOn: 'blur'
          }
        ),
        first_Name:    ['', [Validators.required, AppValidators.stringOnly()]],
        last_Name:     ['', [Validators.required, AppValidators.stringOnly()]],
        email:         ['', [Validators.required, Validators.email]],
        contactPhone:  ['', [Validators.required, AppValidators.contactNumber()]],
        typeUserId:    ['', Validators.required],
        effectiveFrom: [null, Validators.required],
        deactivatedAt: [null],
      });

    } else {
      // Doctor / Collection Boy — same fields as User but with qualification/position
      const isDoctor = this.formType === 'doctor';
      this.form = this.fb.group({
        id:            [0],
        user_Name: new FormControl(
          { value: '', disabled: this.isEdit },
          {
            validators: [Validators.required, Validators.minLength(5)],
            asyncValidators: this.isEdit ? [] : [this.memberService.userNameValidator()],
            updateOn: 'blur'
          }
        ),
        first_Name:    ['', [Validators.required, AppValidators.stringOnly()]],
        last_Name:     ['', [Validators.required, AppValidators.stringOnly()]],
        qualification:  ['', isDoctor ? Validators.required : []],
        position:       ['', isDoctor ? Validators.required : []],
        signature:      [''],
        effectiveFrom:  [null, Validators.required],
        deactivatedAt:  [null],
      });
    }
    // Cross-field validator: deactivatedAt must not be earlier than effectiveFrom
    const deactivationAfterEffective: ValidatorFn = (fg: AbstractControl) => {
      const eff = fg.get('effectiveFrom')?.value;
      const deact = fg.get('deactivatedAt')?.value;
      if (eff && deact) {
        const effD = new Date(eff);
        const deactD = new Date(deact);
        if (deactD < effD) return { deactivatedBeforeEffective: true };
      }
      return null;
    };
    this.form.setValidators(deactivationAfterEffective);
  }

  /** Converts dd-mm-yyyy or ISO yyyy-mm-dd to the picker's yyyy-mm-dd internal format. */
  private toPickerDate(raw: string): string {
    if (!raw) return '';
    const s = raw.split('T')[0]; // strip time if present
    if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
      const [dd, mm, yyyy] = s.split('-');
      return `${yyyy}-${mm}-${dd}`;
    }
    return s; // already yyyy-mm-dd or unknown — pass through
  }

  onNameBlur(): void { if (!this.isEdit) this.autoUsername(); }

  private autoUsername(): void {
    const first = (this.form.get('first_Name')?.value ?? '').trim();
    const last  = (this.form.get('last_Name')?.value  ?? '').trim();
    if (!first || !last) return;

    const base = `${first}.${last}`.toLowerCase();
    this.findAvailableUsername(base, 0).subscribe(username => {
      this.form.get('user_Name')?.setValue(username, { emitEvent: false });
    });
  }

  private findAvailableUsername(base: string, attempt: number): Observable<string> {
    const candidate = attempt === 0 ? base : `${base}${String(attempt).padStart(2, '0')}`;
    return this.memberService.checkUserName(candidate).pipe(
      switchMap(available => available
        ? of(candidate)
        : this.findAvailableUsername(base, attempt + 1)
      )
    );
  }

  // ── Load for edit ──────────────────────────────────────────────────────────

  private loadRecord(id: number): void {
    this.loadingMsg = 'Loading details...';
    this.isLoading  = true;

    this.memberService.getById(id).subscribe({
      next: (data) => {
        this.form.patchValue({
          ...data,
          signature:     data.signatureImage || data.signatureBase64 || '',
          effectiveFrom: data.effectiveFrom ? this.toPickerDate(data.effectiveFrom as string) : null,
          deactivatedAt: data.deactivatedAt ? this.toPickerDate(data.deactivatedAt as string) : null,
        });
        this.isLoading = false;
        // Ensure cross-field validation runs after patching values
        this.form.updateValueAndValidity({ onlySelf: false, emitEvent: false });
      },
      error: () => { this.isLoading = false; }
    });
  }

  // ── Type switcher (add mode only) ─────────────────────────────────────────

  setType(type: UnifiedFormType): void {
    if (this.isEdit) return;
    this.formType = type;
    this.buildForm();
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  onSubmit(): void {
    this.submitted = true;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loadingMsg = this.isEdit ? 'Updating...' : 'Saving...';
    this.isLoading  = true;

    this.saveMember();
  }

  private saveMember(): void {
    const v = this.form.getRawValue();
    const typeUserId = this.formType === 'user'           ? (v.typeUserId || Role.User.id)
                     : this.formType === 'collection-boy' ? Role.Collection_Boy.id
                     :                                      Role.Doctor.id;

    const payload: Partial<MemberDto> = {
      ...v,
      typeUserId,
      contactPhone:  v.contactPhone ? Number(v.contactPhone) : undefined,
      signatureImage: v.signature || undefined,
      // Empty string from a cleared date input must become null, not ""
      // — the backend's DateOnly? cannot deserialise an empty string.
      effectiveFrom: v.effectiveFrom || null,
      deactivatedAt: v.deactivatedAt || null,
    };

    const request$ = this.isEdit && this.recordId
      ? this.memberService.update({ ...payload, id: this.recordId })
      : this.memberService.add({ ...payload, id: 0 });

    request$.subscribe({
      next:  () => { this.isLoading = false; this.goBack(); },
      error: () => { this.isLoading = false; }
    });
  }

  goBack(): void { this.router.navigate(['/users'], { queryParams: { tab: this.formType } }); }

  // ── Signature handling (doctors only) ────────────────────────────────────

  onSelectNewSignature(): void { this.showSignatureInput = true; }
  triggerFileInput(): void     { this.fileInputRef?.nativeElement.click(); }

  cancelSignatureChange(): void {
    this.showSignatureInput    = false;
    this.selectedSignatureFile = null;
    this.selectedPreviewUrl    = null;
  }

  onRemoveSignature(): void {
    this.confirmModal.confirm({
      title: 'Remove Signature?',
      message: 'Are you sure you want to remove the signature?',
      confirmText: 'Remove', cancelText: 'Cancel'
    }).subscribe(confirmed => {
      if (!confirmed || !this.recordId) return;
      this.isLoading  = true;
      this.loadingMsg = 'Removing signature…';
      this.memberService.deleteSignature(this.recordId).subscribe({
        next: () => {
          this.isLoading = false;
          this.form.patchValue({ signature: '' });
          this.selectedSignatureFile = null;
          this.selectedPreviewUrl    = null;
          this.showSignatureInput    = false;
        },
        error: () => { this.isLoading = false; }
      });
    });
  }

  onSignatureFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    if (file.size > 30 * 1024) {
      this.confirmModal.confirm({
        title: 'File Too Large', message: 'Signature must be less than 30 KB.',
        confirmText: 'OK', hideCancelButton: true
      }).subscribe();
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      this.selectedPreviewUrl = dataUrl;
      this.confirmModal.confirm({
        title: 'Use This Signature?',
        message: `Use "${file.name}" as the signature?`,
        confirmText: 'Use Signature', cancelText: 'Cancel'
      }).subscribe(confirmed => {
        if (!confirmed) { this.selectedSignatureFile = null; this.selectedPreviewUrl = null; input.value = ''; return; }
        this.selectedSignatureFile = file;
        this.form.patchValue({ signature: dataUrl.split(',')[1] });
      });
    };
    reader.readAsDataURL(file);
  }

  onPreviewSignature(): void {
    if (this.selectedSignatureFile) {
      const reader = new FileReader();
      reader.onload = () => { this.signaturePreviewUrl = reader.result as string; this.showSignatureModal = true; };
      reader.readAsDataURL(this.selectedSignatureFile);
    } else if (this.form.value.signature) {
      this.signaturePreviewUrl = 'data:image/png;base64,' + this.form.value.signature;
      this.showSignatureModal = true;
    }
  }

  closeSignatureModal(): void { this.showSignatureModal = false; this.signaturePreviewUrl = null; }
  onModalClose(): void        { this.closeSignatureModal(); }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private readonly typeLabels: Record<UnifiedFormType, string> = {
    'user': 'User', 'collection-boy': 'Collection Boy', 'doctor': 'Doctor'
  };

  get pageTitle():     string { return `${this.isEdit ? 'Edit' : 'Add'} ${this.typeLabels[this.formType]}`; }
  get formTypeLabel(): string { return this.typeLabels[this.formType]; }

  isInvalid(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl?.invalid && (ctrl?.touched || this.submitted));
  }
}
