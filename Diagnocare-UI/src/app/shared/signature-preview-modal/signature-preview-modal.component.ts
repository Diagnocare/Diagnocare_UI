import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-signature-preview-modal',
  templateUrl: './signature-preview-modal.component.html',
  styleUrls: ['./signature-preview-modal.component.css'],
  standalone: true,
  imports: [CommonModule]
})
export class SignaturePreviewModalComponent {
  @Input() show: boolean = false;
  @Input() signatureUrl: string | null = null;
  /**
   * When true (default), Update Signature and Delete Signature buttons are shown.
   * Pass false for a read-only preview (e.g. from the doctor list).
   */
  @Input() allowActions: boolean = true;

  /** Emits the File the user chose — parent handles validation + API call. */
  @Output() update = new EventEmitter<File>();
  /** Emits when the user clicks Delete — parent handles confirmation + API call. */
  @Output() remove = new EventEmitter<void>();
  /** Emits when the user clicks Cancel. */
  @Output() close = new EventEmitter<void>();

  @ViewChild('signatureFileInput') fileInput!: ElementRef<HTMLInputElement>;

  onUpdateClick() {
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.update.emit(input.files[0]);
      // Reset so the same file can be re-selected if needed
      input.value = '';
    }
  }

  onRemove() {
    this.remove.emit();
  }

  onClose() {
    this.close.emit();
  }
}
