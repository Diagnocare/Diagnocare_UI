import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ConfirmModalService, ConfirmOptions } from './confirm-modal.service';

@Component({
  selector: 'app-confirm-modal',
  templateUrl: './confirm-modal.component.html',
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class ConfirmModalComponent implements OnInit, OnDestroy {
  title = 'Confirm';
  message = 'Are you sure?';
  confirmText = 'Confirm';
  cancelText = 'Cancel';
  hideCancelButton = false;
  isLoading = false;

  // Reason input
  showReasonInput = false;
  reasonLabel = 'Reason';
  reasonPlaceholder = '';
  reasonRequired = false;
  reasonValue = '';

  private showLoadingOnConfirm = false;
  private modal: any;
  private subs: Subscription[] = [];

  constructor(private confirmModalService: ConfirmModalService) {}

  ngOnInit(): void {
    this.subs.push(
      this.confirmModalService.open$.subscribe((options: ConfirmOptions) => {
        this.title = options.title ?? 'Confirm';
        this.message = options.message;
        this.confirmText = options.confirmText ?? 'Confirm';
        this.cancelText = options.cancelText ?? 'Cancel';
        this.hideCancelButton = options.hideCancelButton ?? false;
        this.showLoadingOnConfirm = options.showLoadingOnConfirm ?? false;
        this.showReasonInput = options.showReasonInput ?? false;
        this.reasonLabel = options.reasonLabel ?? 'Reason';
        this.reasonPlaceholder = options.reasonPlaceholder ?? '';
        this.reasonRequired = options.reasonRequired ?? false;
        this.reasonValue = '';
        this.isLoading = false;
        this.modal = new (window as any).bootstrap.Modal(document.getElementById('confirmModal')!, { backdrop: 'static' });
        this.modal.show();
      }),

      this.confirmModalService.loading$.subscribe(loading => {
        this.isLoading = loading;
      }),

      this.confirmModalService.dismiss$.subscribe(() => {
        this.hideModal();
      })
    );
  }

  /** True when the reason field is required but still empty. */
  get isReasonMissing(): boolean {
    return this.showReasonInput && this.reasonRequired && !this.reasonValue.trim();
  }

  onConfirm(): void {
    if (this.isReasonMissing) {
      return; // guard: required reason not provided
    }
    const reason = this.reasonValue.trim();
    if (this.showLoadingOnConfirm) {
      // Resolve immediately so the caller's subscribe fires and can call setLoading(true),
      // but keep the modal open — caller must call dismiss() when done.
      this.confirmModalService.resolve(true, reason);
    } else {
      this.hideModal();
      this.confirmModalService.resolve(true, reason);
    }
  }

  onCancel(): void {
    this.hideModal();
    this.confirmModalService.resolve(false, '');
  }

  private hideModal(): void {
    this.modal?.hide();
    // Bootstrap sometimes leaves the backdrop and body class behind — force cleanup
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('padding-right');
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }
}
