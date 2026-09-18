import { Component, EventEmitter, Input, Output, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** One option in a <dc-choice>. */
export interface DcChoiceOption {
  /** The value written to the form control. */
  value: any;
  /** What the user reads. Keep it to one or two words. */
  label: string;
  /** Optional second line: when to pick this one. */
  hint?: string;
  /** Optional Font Awesome glyph, e.g. 'fa-mars'. Decoration only — never the
   *  only way to tell two options apart. */
  icon?: string;
  /** Greys the option out and blocks selection. */
  disabled?: boolean;
}

/**
 * DcChoiceComponent — big tappable cards instead of a dropdown.
 *
 * Why this exists
 * ───────────────
 * A <select> hides every option until you click it, needs a second precise
 * click to choose, and on Windows renders a list small enough to mis-click.
 * For a short, fixed list (gender, urgency, payment mode, report format) the
 * options should simply be visible — one click, no hunting, nothing hidden.
 *
 * Rule of thumb: 2–6 options → dc-choice. More than that → keep the dropdown
 * (or a searchable ng-select), because a wall of cards is its own problem.
 *
 * Usage (reactive):
 *   <dc-field label="Gender" [control]="form.get('gender')">
 *     <dc-choice formControlName="gender" [options]="genderOptions"></dc-choice>
 *   </dc-field>
 *
 * Usage (plain binding):
 *   <dc-choice [options]="modes" [(ngModel)]="paymentMode"></dc-choice>
 *
 * Keyboard: Tab moves into the group, arrow keys move between options,
 * Space/Enter selects — the standard radio-group behaviour, for free.
 */
@Component({
  selector: 'dc-choice',
  standalone: true,
  imports: [CommonModule],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => DcChoiceComponent),
    multi: true
  }],
  template: `
    <div class="dc-choice"
         role="radiogroup"
         [attr.aria-label]="ariaLabel || null"
         [style.--dc-choice-min]="minWidth">
      <button *ngFor="let option of options; let i = index"
              type="button"
              role="radio"
              class="dc-choice__option"
              [class.dc-choice__option--selected]="isSelected(option)"
              [attr.aria-checked]="isSelected(option)"
              [attr.tabindex]="tabIndexFor(option, i)"
              [disabled]="disabled || option.disabled"
              (click)="select(option)"
              (keydown)="onKeydown($event, i)">
        <span class="dc-choice__mark" aria-hidden="true">
          <i class="fa fa-check"></i>
        </span>
        <i class="dc-choice__icon fa" [ngClass]="option.icon" *ngIf="option.icon" aria-hidden="true"></i>
        <span class="dc-choice__text">
          <span class="dc-choice__label">{{ option.label }}</span>
          <span class="dc-choice__hint" *ngIf="option.hint">{{ option.hint }}</span>
        </span>
      </button>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .dc-choice {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(var(--dc-choice-min, 9rem), 1fr));
      gap: var(--dc-gap-sm, 0.6rem);
    }

    .dc-choice__option {
      position: relative;
      display: flex;
      align-items: center;
      gap: 0.65rem;
      text-align: left;
      min-height: var(--dc-touch-lg, 3.5rem);
      padding: 0.7rem 0.9rem;
      font-family: inherit;
      font-size: var(--dc-text, 1rem);
      background: var(--dc-surface, #fff);
      color: var(--dc-ink, #2c3e50);
      border: var(--dc-border, 2px) solid var(--dc-line, #e1e8ed);
      border-radius: var(--dc-radius, 0.625rem);
      cursor: pointer;
      transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
    }
    .dc-choice__option:hover:not(:disabled) {
      border-color: var(--dc-brand, #1e5ba8);
      background: var(--dc-surface-muted, #f8f9fa);
    }
    .dc-choice__option:focus-visible {
      outline: none;
      box-shadow: var(--dc-focus, 0 0 0 3px rgba(30,91,168,0.35));
    }
    .dc-choice__option:disabled { opacity: 0.45; cursor: not-allowed; }

    /* Selected state uses THREE cues at once — border, tint, and a tick — so it
       reads correctly on a washed-out screen and for a colour-blind user. */
    .dc-choice__option--selected {
      border-color: var(--dc-brand, #1e5ba8);
      background: var(--dc-info-bg, #dbeafe);
      color: var(--dc-info-ink, #1d4ed8);
      font-weight: 600;
    }

    .dc-choice__mark {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.5rem;
      height: 1.5rem;
      border-radius: 50%;
      border: var(--dc-border, 2px) solid var(--dc-line, #e1e8ed);
      background: var(--dc-surface, #fff);
      color: transparent;
      font-size: 0.8rem;
    }
    .dc-choice__option--selected .dc-choice__mark {
      border-color: var(--dc-brand, #1e5ba8);
      background: var(--dc-brand, #1e5ba8);
      color: #fff;
    }

    .dc-choice__icon { font-size: 1.15rem; opacity: 0.85; }

    .dc-choice__text { display: flex; flex-direction: column; min-width: 0; }
    .dc-choice__label { line-height: 1.25; }
    .dc-choice__hint {
      font-size: var(--dc-text-sm, 0.875rem);
      font-weight: 400;
      opacity: 0.75;
      line-height: 1.3;
      margin-top: 0.1rem;
    }
  `]
})
export class DcChoiceComponent implements ControlValueAccessor {
  /** The options to show. Keep the list to six or fewer. */
  @Input() options: DcChoiceOption[] = [];

  /** Narrowest a card may get before the grid wraps to a new row. */
  @Input() minWidth = '9rem';

  /** Spoken group name, when the field label is not adjacent. */
  @Input() ariaLabel = '';

  @Input() disabled = false;

  /** Emits the chosen value. ngModel / formControlName also work. */
  @Output() valueChange = new EventEmitter<any>();

  value: any = null;

  private onChange: (value: any) => void = () => {};
  private onTouched: () => void = () => {};

  isSelected(option: DcChoiceOption): boolean {
    return this.value === option.value;
  }

  select(option: DcChoiceOption): void {
    if (this.disabled || option.disabled) return;
    this.value = option.value;
    this.onChange(this.value);
    this.onTouched();
    this.valueChange.emit(this.value);
  }

  /**
   * Only one option is tabbable, matching native radio behaviour: Tab reaches
   * the group, arrows move inside it. Without this a ten-option group would
   * cost ten Tab presses to get past.
   */
  tabIndexFor(option: DcChoiceOption, index: number): number {
    const selectedIndex = this.options.findIndex(o => o.value === this.value);
    const active = selectedIndex >= 0 ? selectedIndex : 0;
    return index === active ? 0 : -1;
  }

  onKeydown(event: KeyboardEvent, index: number): void {
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    if (!forward && !back) return;

    event.preventDefault();
    const step = forward ? 1 : -1;
    const count = this.options.length;

    // Walk past disabled options rather than landing on a dead end.
    for (let hop = 1; hop <= count; hop++) {
      const next = (index + step * hop + count * hop) % count;
      const option = this.options[next];
      if (option && !option.disabled) {
        this.select(option);
        const group = (event.currentTarget as HTMLElement).parentElement;
        (group?.children[next] as HTMLElement)?.focus();
        return;
      }
    }
  }

  writeValue(value: any): void { this.value = value; }
  registerOnChange(fn: (value: any) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.disabled = isDisabled; }
}

/**
 * The most common choice in the app is a yes/no: Urgent? Paid? Active?
 * A checkbox states one side and leaves the other implied, which people
 * misread under time pressure. Two labelled buttons state both.
 *
 *   <dc-choice [options]="urgency" formControlName="isUrgent"></dc-choice>
 *   urgency = yesNoOptions('Urgent', 'Normal', 'Yes', 'No');
 */
export function yesNoOptions(
  yesLabel = 'Yes',
  noLabel = 'No',
  yesValue: any = true,
  noValue: any = false,
): DcChoiceOption[] {
  return [
    { value: yesValue, label: yesLabel, icon: 'fa-check' },
    { value: noValue,  label: noLabel,  icon: 'fa-times' },
  ];
}
