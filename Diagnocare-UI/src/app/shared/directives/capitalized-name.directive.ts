import { Directive, ElementRef, HostListener } from '@angular/core';
import { capitalizeWords, formatPersonName } from 'src/app/utilities/person-name.util';

/**
 * CapitalizedNameDirective
 * ────────────────────────
 * Keeps each word of a name field capitalised as it is typed, and trims the field once
 * the user leaves it.
 *
 * Built the same way as NoDigitsDirective: the work happens on `input` rather than
 * `keydown`, so paste, drag-drop, autofill and IME input are all covered by the one
 * handler. Nothing is ever blocked and nothing is ever lower-cased — every character the
 * user types still goes in, and the only change made is adding a capital they did not
 * type. That is what keeps "McDonald" typeable; see person-name.util.ts.
 *
 * Trimming is held back until `blur` on purpose. Trimming on every keystroke would eat the
 * space the moment it was typed, making "John Smith" impossible to enter.
 *
 * Works with template-driven (ngModel) and reactive (formControlName) forms: the rewritten
 * value is re-emitted as an `input` event, which is what both value accessors listen for.
 *
 * Usage:
 *   <input type="text" appCapitalizedName formControlName="patient_Name">
 */
@Directive({
  selector: '[appCapitalizedName]',
  standalone: true,
})
export class CapitalizedNameDirective {

  constructor(private readonly el: ElementRef<HTMLInputElement>) {}

  @HostListener('input')
  onInput(): void {
    this.rewrite(capitalizeWords(this.el.nativeElement.value));
  }

  @HostListener('blur')
  onBlur(): void {
    this.rewrite(formatPersonName(this.el.nativeElement.value));
  }

  /**
   * Writes `next` back into the field and tells Angular about it.
   *
   * The equality guard is what stops the re-dispatched `input` event from recursing: the
   * second pass formats an already-formatted value, finds it unchanged, and stops.
   */
  private rewrite(next: string): void {
    const input = this.el.nativeElement;
    const current = input.value ?? '';
    if (current === next) return;

    const caret = input.selectionStart;
    input.value = next;

    // Changing a letter's case never changes the length, so the caret goes back exactly
    // where it was. A blur-time trim does change the length, and by then it is moot.
    if (caret !== null && current.length === next.length) {
      try {
        input.setSelectionRange(caret, caret);
      } catch {
        /* input type without selection support */
      }
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
