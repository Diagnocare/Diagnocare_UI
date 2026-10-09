import { Directive, ElementRef, HostListener, Input } from '@angular/core';

/**
 * DecimalOnlyDirective
 * ────────────────────
 * Restricts an input to a decimal number — digits, at most one decimal point,
 * and an optional leading minus sign.
 *
 * Why this exists next to `appNumericOnly`:
 *   `appNumericOnly` strips everything that is not a digit, which is right for
 *   a phone number but destroys a lab result: it would turn 13.5 into 135 and
 *   silently report a tenfold haemoglobin. This directive keeps the point and
 *   the sign, and blocks only what can never be part of a number.
 *
 * Unlike `appNumericOnly` it can be switched off through its own input, so one
 * template can bind it per row:
 *
 *   <input [appDecimalOnly]="isNumericParam(param)" [(ngModel)]="param.resultValue">
 *
 * A bare attribute (`appDecimalOnly`) means "always on".
 *
 * Guards the three ways text reaches an input — keystrokes, paste/drop, and
 * programmatic or IME changes — because blocking only keystrokes leaves paste
 * wide open, which is how most bad values actually arrive.
 */
@Directive({
  selector: '[appDecimalOnly]',
  standalone: true,
})
export class DecimalOnlyDirective {

  /**
   * Whether the restriction is active. Accepts `''` so the directive can be
   * used as a bare attribute, where Angular passes an empty string.
   */
  @Input('appDecimalOnly') set appDecimalOnly(value: boolean | '' | null | undefined) {
    this.enabled = value === '' || value === true || value === null || value === undefined;
  }

  /** Defaults to on — a bare attribute must restrict, not do nothing. */
  private enabled = true;

  /** Navigation / editing keys that must always pass through. */
  private static readonly ALLOWED_KEYS = new Set<string>([
    'Backspace', 'Delete', 'Tab', 'Enter', 'Escape',
    'Home', 'End', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  ]);

  constructor(private readonly el: ElementRef<HTMLInputElement>) {}

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!this.enabled) return;

    // Control / navigation keys and any Ctrl/Cmd shortcut (copy, paste, undo…).
    if (DecimalOnlyDirective.ALLOWED_KEYS.has(event.key) || event.ctrlKey || event.metaKey) {
      return;
    }
    if (event.key.length !== 1) return;   // Shift, F5, dead keys…

    const input = this.el.nativeElement;
    const start = input.selectionStart ?? input.value.length;
    const end   = input.selectionEnd ?? input.value.length;

    // What the field would hold if this keystroke landed. Checking the result
    // rather than the character alone is what stops a second '.' or a '-' in
    // the middle while still allowing the first of each.
    const next = input.value.slice(0, start) + event.key + input.value.slice(end);

    // Partial input must stay typeable: '-', '.', '-.' and '1.' are all on the
    // way to a valid number, so the pattern accepts an incomplete tail.
    if (!/^-?\d*\.?\d*$/.test(next)) {
      event.preventDefault();
    }
  }

  @HostListener('paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    if (!this.enabled) return;
    event.preventDefault();
    this.insertNumeric(event.clipboardData?.getData('text') ?? '');
  }

  @HostListener('drop', ['$event'])
  onDrop(event: DragEvent): void {
    if (!this.enabled) return;
    event.preventDefault();
    this.insertNumeric(event.dataTransfer?.getData('text') ?? '');
  }

  /** Final safety net for autofill / IME / programmatic changes. */
  @HostListener('input')
  onInput(): void {
    if (!this.enabled) return;

    const input = this.el.nativeElement;
    const raw = input.value ?? '';
    const cleaned = DecimalOnlyDirective.sanitize(raw);
    if (raw === cleaned) return;

    // Keep the caret where the operator left it rather than throwing it to the
    // end — count how many characters were dropped before the caret position.
    const caret = input.selectionStart ?? raw.length;
    const removedBeforeCaret =
      caret - DecimalOnlyDirective.sanitize(raw.slice(0, caret)).length;

    input.value = cleaned;
    const nextCaret = Math.max(0, Math.min(caret - removedBeforeCaret, cleaned.length));
    input.setSelectionRange?.(nextCaret, nextCaret);

    // Re-emit so Angular's value accessor picks up the sanitised value.
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** Inserts only the numeric part of `raw` at the caret. */
  private insertNumeric(raw: string): void {
    const input = this.el.nativeElement;
    const start = input.selectionStart ?? input.value.length;
    const end   = input.selectionEnd ?? input.value.length;

    const merged  = input.value.slice(0, start) + (raw ?? '') + input.value.slice(end);
    const cleaned = DecimalOnlyDirective.sanitize(merged);
    if (cleaned === input.value) return;

    input.value = cleaned;
    const caret = Math.min(
      DecimalOnlyDirective.sanitize(merged.slice(0, start + (raw ?? '').length)).length,
      cleaned.length,
    );
    input.setSelectionRange?.(caret, caret);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * Reduces any string to the decimal number it contains: a single optional
   * leading '-', digits, and at most one '.'. Everything else is dropped.
   */
  private static sanitize(raw: string): string {
    const negative = (raw ?? '').trimStart().startsWith('-');
    let seenDot = false;

    let out = '';
    for (const ch of (raw ?? '')) {
      if (ch >= '0' && ch <= '9') { out += ch; continue; }
      if (ch === '.' && !seenDot)  { out += ch; seenDot = true; }
    }
    return negative ? '-' + out : out;
  }
}
