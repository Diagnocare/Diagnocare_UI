import {
  AfterViewInit,
  Directive,
  ElementRef,
  HostListener,
  Input,
} from '@angular/core';

/**
 * FormKeyboardDirective — centralised keyboard navigation for forms.
 *
 * Apply to any <form> element:
 *
 *   <form appFormKeyboard [tabFields]="tabOrderAdd" ...>
 *
 * Features
 * ─────────
 * 1. Auto-tabindex assignment
 *    Pass [tabFields] with an ordered array of formControlName strings
 *    (empty string = skip a slot).  The directive assigns tabindex values
 *    so the browser Tab / Shift+Tab order matches the array order exactly.
 *
 *    Example in constants.ts:
 *      export const tabOrderLogin = ['userId', 'password'];
 *
 *    Then in the template:
 *      <form appFormKeyboard [tabFields]="tabOrderLogin">
 *
 * 2. Enter → advance to next field
 *    Pressing Enter on a text / number / email / etc. input focuses the next
 *    focusable field in tab order instead of submitting the form.
 *    (Enter on the last field, on a submit button, or inside a textarea
 *    is passed through unchanged.)
 *
 * 3. Shift+Tab → previous field (native browser behaviour — no override needed)
 *
 * Note: Alt+Tab is a Windows OS-level shortcut (window switcher) and
 * intentionally not overridden here.  The standard previous-field shortcut
 * for web forms is Shift+Tab.
 */
@Directive({
  selector: 'form[appFormKeyboard]',
  standalone: true,
})
export class FormKeyboardDirective implements AfterViewInit {
  /**
   * Ordered list of formControlName values used to assign tabindex.
   * Use an empty string ('') as a placeholder to skip an index slot.
   * Leave unset (or pass []) to skip auto-assignment and rely on DOM order.
   */
  @Input() tabFields: string[] = [];

  constructor(private el: ElementRef<HTMLFormElement>) {}

  ngAfterViewInit(): void {
    if (this.tabFields.length) {
      // Small delay so Angular has rendered all child components
      setTimeout(() => this.assignTabIndices(), 0);
    }
  }

  /**
   * Re-run tabindex assignment (e.g. after a step change in a multi-step form).
   * Call from the host component: @ViewChild(FormKeyboardDirective) kbd!: FormKeyboardDirective;
   *                                this.kbd?.refreshTabIndices();
   */
  refreshTabIndices(): void {
    if (this.tabFields.length) this.assignTabIndices();
  }

  // ── Tabindex assignment ────────────────────────────────────────────────────

  private assignTabIndices(): void {
    const form = this.el.nativeElement;
    let idx = 1;
    for (const name of this.tabFields) {
      if (name) {
        // Supports reactive forms (formControlName / ng-reflect-name) and
        // template-driven forms (name attribute used by ngModel).
        const el = form.querySelector<HTMLElement>(
          `[formcontrolname="${name}"], [ng-reflect-name="${name}"], [name="${name}"]`
        );
        if (el) el.tabIndex = idx;
      }
      idx++;
    }
  }

  // ── Keyboard handling ──────────────────────────────────────────────────────

  /**
   * Enter on a text-like input → move focus to the next field.
   * Enter on buttons, checkboxes, radios, textareas, and submit inputs
   * is left to the browser's default behaviour.
   */
  @HostListener('keydown.enter', ['$event'])
  onEnter(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const tag  = target.tagName.toLowerCase();
    const type = ((target as HTMLInputElement).type ?? '').toLowerCase();

    // Let these through unchanged
    if (
      tag === 'textarea' ||
      tag === 'select' ||
      type === 'submit' ||
      type === 'button' ||
      type === 'checkbox' ||
      type === 'radio' ||
      type === 'file'
    ) {
      return;
    }

    event.preventDefault();
    this.moveFocus(target, 1);
  }

  // ── Focus helpers ──────────────────────────────────────────────────────────

  private moveFocus(current: HTMLElement, dir: 1 | -1): void {
    const focusable = this.getFocusableElements();
    const idx = focusable.indexOf(current);
    if (idx === -1) return;
    const next = focusable[idx + dir];
    if (next) next.focus();
  }

  private getFocusableElements(): HTMLElement[] {
    const all = Array.from(
      this.el.nativeElement.querySelectorAll<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]), ' +
        'select:not([disabled]), ' +
        'textarea:not([disabled])'
      )
    ).filter(el => el.tabIndex !== -1);

    // Sort by tabindex so Enter respects the same order as Tab
    return all.sort((a, b) => {
      const ta = a.tabIndex;
      const tb = b.tabIndex;
      // Elements with tabIndex 0 come after explicitly numbered ones
      if (ta === 0 && tb === 0) return 0;
      if (ta === 0) return 1;
      if (tb === 0) return -1;
      return ta - tb;
    });
  }
}
