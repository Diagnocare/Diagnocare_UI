import { Component, Input } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-required-asterisk',
  standalone: true,
  imports: [CommonModule],
  template: `<span *ngIf="isRequired" style="color:red">*</span>`
})
export class RequiredAsteriskComponent {
  @Input() controlName!: string;
  @Input() formGroup!: FormGroup;

  get isRequired(): boolean {
    if (!this.formGroup || !this.controlName) return false;
    const control = this.formGroup.get(this.controlName);
    if (!control || !control.validator) return false;
    const validator = control.validator({} as any);
    return !!(validator && validator['required']);
  }
}
