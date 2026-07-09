import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';

/** sessionStorage key for the cached profile photo data-URL (shared with change-password). */
const PROFILE_PHOTO_CACHE_KEY = (userName: string) => `diagnocare_profile_img_${userName}`;

/** Derive a MIME type from the image file name returned by the API. */
function mimeFromFileName(fileName?: string | null): string {
  const ext = (fileName ?? '').split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}
import { FormsModule } from '@angular/forms';
import { CommonService } from 'src/app/shared/common.service';
import { jwtDecode } from 'jwt-decode';
import { HeaderService } from 'src/app/services/headerServices/header-service';
import { MemberDto } from 'src/app/models/member/member.dto';
import { ConfirmModalComponent } from 'src/app/shared/confirm-modal/confirm-modal.component';
import { ConfirmModalService } from 'src/app/shared/confirm-modal/confirm-modal.service';
import { ToastrService } from 'ngx-toastr';
import { Role } from 'src/app/constant/enums';

type EditField = 'email' | 'phone' | null;
type EditStep  = 'input' | 'otp' | null;

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['../account-pages.shared.css', './profile.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmModalComponent]
})
export class ProfileComponent implements OnInit, OnDestroy {

  user: MemberDto | undefined;
  pathology_Id: string = '';
  userName: string = '';
  previewAvailable: boolean = false;
  selectedFile: File | null = null;

  // ── Edit state ──────────────────────────────────────────────────────────────
  editField: EditField = null;
  editStep: EditStep   = null;

  newEmail: string    = '';
  newPhone: string    = '';
  otpCode: string     = '';
  /** 6 individual digit boxes for OTP entry. */
  otpDigits: string[] = ['', '', '', '', '', ''];

  otpSending: boolean   = false;
  otpVerifying: boolean = false;
  saving: boolean       = false;
  otpSent: boolean      = false;
  errorMsg: string      = '';

  // OTP resend countdown
  resendCountdown: number = 0;
  private countdownTimer: any;

  constructor(
    private headerService: HeaderService,
    private common: CommonService,
    private confirmModal: ConfirmModalService,
    private toastr: ToastrService
  ) {
    const token = this.common.getAccessToken();
    const decoded = jwtDecode<any>(token || '');
    this.pathology_Id = decoded.typ;
    this.userName = decoded.sub;
    this.getUserDetails();
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    // Stop the OTP resend countdown so it doesn't keep firing after the
    // component is destroyed (e.g. the profile dialog is closed).
    this.clearCountdown();
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  get userId(): number {
    return this.user?.id ?? this.user?.user_Id ?? 0;
  }

  getRoleLabel(typeUserId?: number): string {
    if (!typeUserId) return '';
    const match = Object.values(Role).find(r => r.id === typeUserId);
    return match?.label ?? '';
  }

  // ── User / image ─────────────────────────────────────────────────────────────

  getUserDetails() {
    // Check sessionStorage cache first — avoids a redundant API call on revisit.
    const cached = sessionStorage.getItem(PROFILE_PHOTO_CACHE_KEY(this.userName));

    this.headerService.getUserDetails(this.userName).subscribe(
      (data: any) => {
        this.user = data as MemberDto;

        if (cached) {
          // Use cached data URL immediately — no extra network call needed.
          this.user.profilePhoto = cached;
        } else {
          // GetUserDetails now includes ProfileImage (base64) and ProfileImageFileName.
          // Use them directly instead of making a second API call.
          const b64: string | null = data?.profileImage ?? null;
          if (b64) {
            const mime = mimeFromFileName(data?.profileImageFileName);
            const dataUrl = `data:${mime};base64,${b64}`;
            this.user.profilePhoto = dataUrl;
            try { sessionStorage.setItem(PROFILE_PHOTO_CACHE_KEY(this.userName), dataUrl); } catch {}
          } else {
            this.user.profilePhoto = '/assets/defaultPic.jpg';
          }
        }
      },
      (err: any) => console.error('Failed to fetch user details', err)
    );
  }

  onProfilePicChange(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      this.confirmModal.confirm({
        title: 'Invalid File',
        message: 'Only JPG and PNG images are allowed.',
        confirmText: 'OK',
        cancelText: ''
      }).subscribe();
      this.previewAvailable = false;
      (event.target as HTMLInputElement).value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (e: any) => {
      if (this.user) {
        this.user.profilePhoto = e.target.result;
        this.previewAvailable = true;
      }
    };
    reader.readAsDataURL(file);
    this.selectedFile = file;
  }

  saveProfilePic() {
    if (!this.selectedFile || !this.userId) return;
    this.confirmModal.confirm({
      title: 'Update Profile Picture',
      message: 'Are you sure you want to set this as your new profile picture?',
      confirmText: 'Upload',
      cancelText: 'Cancel'
    }).subscribe(confirmed => {
      if (!confirmed) return;
      this.headerService.uploadProfilePhoto(this.userName, this.selectedFile!).subscribe({
        next: (res: any) => {
          this.previewAvailable = false;
          // Evict the cache so the next getUserDetails call picks up the new image.
          sessionStorage.removeItem(PROFILE_PHOTO_CACHE_KEY(this.userName));
          // The preview was already set to the new image via onProfilePicChange — keep it.
          window.dispatchEvent(new CustomEvent('diagnocare-profile-updated'));
        },
        error: () => {
          this.confirmModal.confirm({
            title: 'Upload Failed',
            message: 'Failed to upload profile photo. Please try again.',
            confirmText: 'OK',
            cancelText: ''
          }).subscribe();
        }
      });
    });
  }

  // ── Edit field management ────────────────────────────────────────────────────

  startEdit(field: EditField) {
    this.cancelEdit();
    this.editField = field;
    this.editStep  = 'input';
    this.newEmail  = field === 'email' ? (this.user?.email ?? '') : '';
    this.newPhone  = field === 'phone' ? String(this.user?.contactPhone ?? '') : '';
    this.errorMsg = '';
  }

  cancelEdit() {
    this.editField  = null;
    this.editStep   = null;
    this.otpCode    = '';
    this.otpDigits  = ['', '', '', '', '', ''];
    this.newEmail   = '';
    this.newPhone   = '';
    this.otpSent    = false;
    this.errorMsg   = '';
    this.clearCountdown();
  }

  // ── OTP digit-box handlers ───────────────────────────────────────────────────

  onOtpDigitInput(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const val   = input.value.replace(/\D/g, '').slice(-1);
    input.value        = val;
    this.otpDigits[index] = val;
    this.otpCode       = this.otpDigits.join('');
    if (val && index < 5) {
      const next = document.querySelectorAll<HTMLInputElement>('.prof-otp-box')[index + 1];
      if (next) { next.focus(); next.select(); }
    }
    if (this.otpDigits.every(d => d.length === 1)) {
      setTimeout(() => this.verifyAndSave(), 80);
    }
  }

  onOtpDigitKeydown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace') {
      const input = event.target as HTMLInputElement;
      if (input.value) {
        event.preventDefault();
        this.otpDigits[index] = '';
        input.value = '';
        this.otpCode = this.otpDigits.join('');
      } else if (index > 0) {
        const prev = document.querySelectorAll<HTMLInputElement>('.prof-otp-box')[index - 1];
        if (prev) { prev.focus(); prev.select(); }
      }
    }
  }

  onOtpDigitPaste(event: ClipboardEvent): void {
    const pasted = (event.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    event.preventDefault();
    pasted.split('').forEach((d, i) => { this.otpDigits[i] = d; });
    this.otpCode = this.otpDigits.join('');
    const boxes = document.querySelectorAll<HTMLInputElement>('.prof-otp-box');
    boxes.forEach((b, i) => { b.value = this.otpDigits[i] || ''; });
    const focusIdx = Math.min(pasted.length, 5);
    if (boxes[focusIdx]) { boxes[focusIdx].focus(); boxes[focusIdx].select(); }
    if (pasted.length === 6) setTimeout(() => this.verifyAndSave(), 80);
  }

  /** Circular SVG progress for resend countdown (0–60). */
  get resendCircleOffset(): number {
    const total = 60;
    return 100 - (this.resendCountdown / total) * 100;
  }

  /** Go back to the input step and reset OTP digit state. */
  goBackToInput(): void {
    this.editStep  = 'input';
    this.otpCode   = '';
    this.otpDigits = ['', '', '', '', '', ''];
    this.errorMsg  = '';
  }

  // ── OTP flow ─────────────────────────────────────────────────────────────────

  sendOtp() {
    this.errorMsg = '';
    if (this.editField === 'email' && !this.isValidEmail(this.newEmail)) {
      this.errorMsg = 'Enter a valid email address.';
      return;
    }
    if (this.editField === 'phone' && !this.isValidPhone(this.newPhone)) {
      this.errorMsg = 'Enter a valid 10-digit phone number.';
      return;
    }

    this.otpSending = true;
    const channel: 'email' | 'phone' = this.editField === 'email' ? 'email' : 'phone';

    // Uses POST api/header/SendProfileOtp — Bearer auth, no Basic Auth required.
    this.headerService.sendProfileOtp(
      this.userId,
      this.userName,
      channel,
      this.editField === 'email' ? this.newEmail   : undefined,
      this.editField === 'phone' ? this.newPhone   : undefined
    ).subscribe({
      next: (res) => {
        this.otpSending = false;
        if (res.success) {
          this.otpSent  = true;
          this.editStep = 'otp';
          this.startResendCountdown();
        } else {
          this.errorMsg = res.message || 'Failed to send OTP. Please try again.';
        }
      },
      error: () => {
        this.otpSending = false;
        this.errorMsg = 'Failed to send OTP. Please try again.';
      }
    });
  }

  resendOtp() {
    if (this.resendCountdown > 0) return;
    this.errorMsg   = '';
    this.otpSending = true;
    const channel: 'email' | 'phone' = this.editField === 'email' ? 'email' : 'phone';

    this.headerService.sendProfileOtp(
      this.userId,
      this.userName,
      channel,
      this.editField === 'email' ? this.newEmail : undefined,
      this.editField === 'phone' ? this.newPhone : undefined
    ).subscribe({
      next: (res) => {
        this.otpSending = false;
        if (res.success) {
          this.startResendCountdown();
        } else {
          this.errorMsg = res.message || 'Failed to resend OTP.';
        }
      },
      error: () => {
        this.otpSending = false;
        this.errorMsg = 'Failed to resend OTP.';
      }
    });
  }

  verifyAndSave() {
    if (!this.otpCode || this.otpCode.length !== 6) {
      this.errorMsg = 'Enter the 6-digit OTP code.';
      return;
    }

    this.errorMsg     = '';
    this.otpVerifying = true;

    // Uses POST api/header/VerifyProfileOtp — Bearer auth, returns success/message only (no JWT).
    this.headerService.verifyProfileOtp(this.userName, this.otpCode).subscribe({
      next: (res) => {
        if (res.success) {
          this.applyUpdate();
        } else {
          this.otpVerifying = false;
          this.errorMsg = res.message || 'Invalid OTP. Please try again.';
        }
      },
      error: () => {
        this.otpVerifying = false;
        this.errorMsg = 'OTP verification failed. Please try again.';
      }
    });
  }

  private applyUpdate() {
    this.saving = true;
    const update$ = this.editField === 'email'
      ? this.headerService.updateUserEmail(this.userName, this.newEmail)
      : this.headerService.updateUserPhone(this.userName, this.newPhone);

    update$.subscribe({
      next: (res: any) => {
        this.otpVerifying = false;
        this.saving       = false;
        if (res?.success !== false) {
          if (this.user) {
            if (this.editField === 'email') this.user.email = this.newEmail;
            else this.user.contactPhone = Number(this.newPhone);
          }
          this.toastr.success(
            this.editField === 'email' ? 'Email updated successfully.' : 'Phone number updated successfully.',
            'Success'
          );
          this.clearEditState();
        } else {
          this.errorMsg = res?.message || 'Update failed. Please try again.';
        }
      },
      error: () => {
        this.otpVerifying = false;
        this.saving       = false;
        this.errorMsg = 'Update failed. Please try again.';
      }
    });
  }

  // ── Countdown ─────────────────────────────────────────────────────────────────

  private startResendCountdown(seconds: number = 60) {
    this.clearCountdown();
    this.resendCountdown = seconds;
    this.countdownTimer = setInterval(() => {
      this.resendCountdown--;
      if (this.resendCountdown <= 0) this.clearCountdown();
    }, 1000);
  }

  private clearCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.resendCountdown = 0;
  }

  private clearEditState() {
    this.editField  = null;
    this.editStep   = null;
    this.otpCode    = '';
    this.otpDigits  = ['', '', '', '', '', ''];
    this.newEmail   = '';
    this.newPhone   = '';
    this.otpSent    = false;
    this.clearCountdown();
  }

  // ── Validators ────────────────────────────────────────────────────────────────

  isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  isValidPhone(phone: string): boolean {
    return /^\d{10}$/.test(phone);
  }
}
