import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ConfirmModalService, ConfirmOptions } from './confirm-modal.service';

@Component({
  selector: 'app-confirm-modal',
  templateUrl: './confirm-modal.component.html',
  standalone: true,
  imports: [CommonModule]
})
export class ConfirmModalComponent implements OnInit, OnDestroy {
  title = 'Confirm';
  message = 'Are you sure?';
  confirmText = 'Confirm';
  cancelText = 'Cancel';
  hideCancelButton = false;

  private modal: any;
  private sub!: Subscription;

  constructor(private confirmModalService: ConfirmModalService) {}

  ngOnInit(): void {
    this.sub = this.confirmModalService.open$.subscribe((options: ConfirmOptions) => {
      this.title = options.title ?? 'Confirm';
      this.message = options.message;
      this.confirmText = options.confirmText ?? 'Confirm';
      this.cancelText = options.cancelText ?? 'Cancel';
      this.hideCancelButton = options.hideCancelButton ?? false;
      this.modal = new (window as any).bootstrap.Modal(document.getElementById('confirmModal')!, { backdrop: 'static' });
      this.modal.show();
    });
  }

  onConfirm(): void {
    this.hideModal();
    this.confirmModalService.resolve(true);
  }

  onCancel(): void {
    this.hideModal();
    this.confirmModalService.resolve(false);
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
    this.sub?.unsubscribe();
  }
}
