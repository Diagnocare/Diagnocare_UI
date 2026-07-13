import { Directive, ElementRef, HostListener } from '@angular/core';

/**
 * NumericOnlyDirective
 * ────────────────────
 * Restricts an input to digits (0-9) only, straight from the keyboard.
 *
 * Why this exists:
 *   `<input type="number">` still accepts the exponent char 'e'/'E' and the
 *   signs '+', '-', '.', while `type="text"`/`type="tel"` accept every letter.
 *   Form validation catches these afterwards, but the characters still land in
 *   the field. This directive prevents them from being entered at all and also
 *   sanitises pasted / drag-dropped / autofilled content.
 *
 * Works with both template-driven (ngModel) and reactive (formControlName)
 * forms, and on text / tel / number inputs.
 *
 * Usage:
 *   <input type="text" inputmode="numeric" appNumericOnly formControlName="phone">
 */
@Directive({
  selector: '[appNumericOnly]',
  standalone: true,
})
export class NumericOnlyDirective {

  /** Navigation / editing keys that must always pass through. */
  private static readonly ALLOWED_KEYS = new Set<string>([
    'Backspace', 'Delete', 'Tab', 'Enter', 'Escape',
    'Home', 'End', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  ]);

  constructor(private readonly el: ElementRef<HTMLInputElement>) {}

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    // Allow control/navigation keys and any Ctrl/Cmd shortcut (copy, paste, …).
    if (NumericOnlyDirective.ALLOWED_KEYS.has(event.key) || event.ctrlKey || event.metaKey) {
      return;
    }
    // Block every printable key that is not a single digit (letters, e, +, -, ., space).
    if (event.key.length === 1 && !/[0-9]/.test(event.key)) {
      event.preventDefault();
    }
  }

  @HostListener('paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    this.insertDigits(event.clipboardData?.getData('text') ?? '');
  }

  @HostListener('drop', ['$event'])
  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.insertDigits(event.dataTransfer?.getData('text') ?? '');
  }

  /** Final safety net for autofill / IME / programmatic changes. */
  @HostListener('input')
  onInput(): void {
    const input = this.el.nativeElement;
    const cleaned = (input.value ?? '').replace(/\D/g, '');
    if (input.value !== cleaned) {
      input.value = cleaned;
      // Re-emit so Angular's value accessor picks up the sanitised value.
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  /** Inserts only the digits of `raw` at the caret, honouring maxlength. */
  private insertDigits(raw: string): void {
    const digits = (raw ?? '').replace(/\D/g, '');
    if (!digits) return;

    const input = this.el.nativeElement;
    const max = input.maxLength && input.maxLength > 0 ? input.maxLength : Number.MAX_SAFE_INTEGER;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;

    const next = (input.value.slice(0, start) + digits + input.value.slice(end)).slice(0, max);
    input.value = next;

    const caret = Math.min(start + digits.length, next.length);
    input.setSelectionRange?.(caret, caret);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
