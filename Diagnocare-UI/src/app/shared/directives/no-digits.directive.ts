import { Directive, ElementRef, HostListener } from '@angular/core';

/**
 * NoDigitsDirective
 * ─────────────────
 * Stops digits (0-9) being entered into a name field.
 *
 * The counterpart of NumericOnlyDirective, and deliberately built the same way:
 * blocking on `keydown` alone is not enough, because paste, drag-drop, autofill
 * and IME input all reach the field without one. Each of those is handled here
 * too, so the field cannot hold a digit by any route.
 *
 * Everything that is not a digit still goes through — letters, spaces, hyphens,
 * brackets, '&', '/' — so names like "Liver Function Test (LFT)" are unaffected.
 *
 * Works with template-driven (ngModel) and reactive (formControlName) forms.
 *
 * Usage:
 *   <input type="text" appNoDigits [(ngModel)]="formData.group.name">
 */
@Directive({
  selector: '[appNoDigits]',
  standalone: true,
})
export class NoDigitsDirective {

  /** Navigation / editing keys that must always pass through. */
  private static readonly ALLOWED_KEYS = new Set<string>([
    'Backspace', 'Delete', 'Tab', 'Enter', 'Escape',
    'Home', 'End', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  ]);

  constructor(private readonly el: ElementRef<HTMLInputElement>) {}

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    // Allow control/navigation keys and any Ctrl/Cmd shortcut (copy, paste, …).
    if (NoDigitsDirective.ALLOWED_KEYS.has(event.key) || event.ctrlKey || event.metaKey) {
      return;
    }
    if (event.key.length === 1 && /[0-9]/.test(event.key)) {
      event.preventDefault();
    }
  }

  @HostListener('paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    this.insertText(event.clipboardData?.getData('text') ?? '');
  }

  @HostListener('drop', ['$event'])
  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.insertText(event.dataTransfer?.getData('text') ?? '');
  }

  /** Final safety net for autofill / IME / programmatic changes. */
  @HostListener('input')
  onInput(): void {
    const input = this.el.nativeElement;
    const cleaned = (input.value ?? '').replace(/[0-9]/g, '');
    if (input.value !== cleaned) {
      const caret = NoDigitsDirective.caretOf(input);
      // Digits removed before the caret shift it left by that many characters.
      const removedBefore = caret === null
        ? 0
        : ((input.value ?? '').slice(0, caret).match(/[0-9]/g) ?? []).length;

      input.value = cleaned;
      if (caret !== null) NoDigitsDirective.setCaret(input, Math.max(0, caret - removedBefore));
      // Re-emit so Angular's value accessor picks up the sanitised value.
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  /** Inserts `raw` with its digits stripped, at the caret, honouring maxlength. */
  private insertText(raw: string): void {
    const text = (raw ?? '').replace(/[0-9]/g, '');
    if (!text) return;

    const input = this.el.nativeElement;
    const max = input.maxLength > 0 ? input.maxLength : Number.MAX_SAFE_INTEGER;
    const current = input.value ?? '';
    const start = input.selectionStart ?? current.length;
    const end = input.selectionEnd ?? current.length;

    const next = (current.slice(0, start) + text + current.slice(end)).slice(0, max);
    input.value = next;
    NoDigitsDirective.setCaret(input, Math.min(start + text.length, next.length));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  private static caretOf(input: HTMLInputElement): number | null {
    try {
      return input.selectionStart;
    } catch {
      return null;
    }
  }

  private static setCaret(input: HTMLInputElement, caret: number): void {
    try {
      input.setSelectionRange(caret, caret);
    } catch {
      /* input type without selection support */
    }
  }
}
