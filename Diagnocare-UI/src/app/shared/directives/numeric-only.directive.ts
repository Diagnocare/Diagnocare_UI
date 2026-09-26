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

  /**
   * Puts the digits of `raw` into the field, honouring maxlength.
   *
   * A paste that is a whole value on its own REPLACES the field instead of being inserted
   * into it — pasting a mobile number into a box that already holds one must give the new
   * number, not the old one with digits stuck on (which maxlength then cut back off, so the
   * paste looked like it did nothing). That is the case when:
   *   - the pasted digits fill maxlength (a complete 10-digit number), or
   *   - the field cannot report a caret (type="number"), or
   *   - the whole current value is selected.
   * Anything shorter is inserted at the caret, as typing would.
   *
   * When a maxlength is set and more digits are pasted than fit, the LAST ones are kept:
   * "+91 98765 43210" or "098765 43210" becomes "9876543210" rather than "9198765432".
   */
  private insertDigits(raw: string): void {
    let digits = (raw ?? '').replace(/\D/g, '');
    if (!digits) return;

    const input = this.el.nativeElement;
    const hasMax = input.maxLength > 0;
    const max = hasMax ? input.maxLength : Number.MAX_SAFE_INTEGER;
    if (hasMax && digits.length > max) digits = digits.slice(-max);

    const current = input.value ?? '';
    const { start, end } = NumericOnlyDirective.selectionOf(input);
    const wholeSelected = start === 0 && end === current.length && current.length > 0;
    const replace = start === null || wholeSelected || (hasMax && digits.length >= max);

    let next: string;
    let caret: number;
    if (replace) {
      next = digits.slice(0, max);
      caret = next.length;
    } else {
      next = (current.slice(0, start!) + digits + current.slice(end!)).slice(0, max);
      caret = Math.min(start! + digits.length, next.length);
    }

    input.value = next;
    NumericOnlyDirective.setCaret(input, caret);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * Caret / selection of the field, or nulls when the input type has none. type="number"
   * (and email) report null in Chrome and throw in some older engines.
   */
  private static selectionOf(input: HTMLInputElement): { start: number | null; end: number | null } {
    try {
      return { start: input.selectionStart, end: input.selectionEnd };
    } catch {
      return { start: null, end: null };
    }
  }

  /** setSelectionRange throws InvalidStateError on type="number" — it is cosmetic, so skip it there. */
  private static setCaret(input: HTMLInputElement, caret: number): void {
    try {
      input.setSelectionRange(caret, caret);
    } catch {
      /* input type without selection support */
    }
  }
}
