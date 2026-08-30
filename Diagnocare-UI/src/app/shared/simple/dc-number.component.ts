import { Component, EventEmitter, Input, Output, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * DcNumberComponent — a number box with big minus and plus buttons.
 *
 * Why this exists
 * ───────────────
 * The native number input's spinners are about 10px tall: unusable with a
 * trackpad, invisible on a touchscreen, and they vanish entirely on mobile.
 * For discount percentages, quantities, ages and amounts, the two operations
 * people actually perform are "a bit more" and "a bit less". This gives them
 * 48px targets, keeps the box typeable, and clamps to min/max so an out-of-
 * range value cannot be entered in the first place — no error message needed.
 *
 * Usage:
 *   <dc-field label="Discount" hint="Maximum allowed is 20%">
 *     <dc-number formControlName="discount" suffix="%" [min]="0" [max]="20" [step]="5"></dc-number>
 *   </dc-field>
 *
 *   <dc-field label="Amount received">
 *     <dc-number [(ngModel)]="amount" prefix="₹" [step]="100" [min]="0"></dc-number>
 *   </dc-field>
 */
@Component({
  selector: 'dc-number',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => DcNumberComponent),
    multi: true
  }],
  template: `
    <div class="dc-number" [class.dc-number--disabled]="disabled">
      <button type="button"
              class="dc-number__step"
              [disabled]="disabled || atMin"
              [attr.aria-label]="'Decrease ' + (ariaLabel || 'value') + ' by ' + step"
              (click)="nudge(-step)">
        <i class="fa fa-minus" aria-hidden="true"></i>
      </button>

      <div class="dc-number__box">
        <span class="dc-number__affix" *ngIf="prefix" aria-hidden="true">{{ prefix }}</span>
        <input class="dc-number__input"
               type="text"
               inputmode="decimal"
               [attr.aria-label]="ariaLabel || null"
               [ngModel]="display"
               [disabled]="disabled"
               (ngModelChange)="onType($event)"
               (blur)="onBlur()">
        <span class="dc-number__affix" *ngIf="suffix" aria-hidden="true">{{ suffix }}</span>
      </div>

      <button type="button"
              class="dc-number__step"
              [disabled]="disabled || atMax"
              [attr.aria-label]="'Increase ' + (ariaLabel || 'value') + ' by ' + step"
              (click)="nudge(step)">
        <i class="fa fa-plus" aria-hidden="true"></i>
      </button>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .dc-number {
      display: flex;
      align-items: stretch;
      gap: var(--dc-gap-xs, 0.35rem);
      max-width: 20rem;
    }
    .dc-number--disabled { opacity: 0.55; }

    .dc-number__step {
      flex: 0 0 var(--dc-touch, 3rem);
      width: var(--dc-touch, 3rem);
      min-height: var(--dc-touch, 3rem);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 1.05rem;
      color: var(--dc-ink, #2c3e50);
      background: var(--dc-surface-muted, #f8f9fa);
      border: var(--dc-border, 2px) solid var(--dc-line, #e1e8ed);
      border-radius: var(--dc-radius, 0.625rem);
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .dc-number__step:hover:not(:disabled) {
      background: var(--dc-info-bg, #dbeafe);
      border-color: var(--dc-brand, #1e5ba8);
      color: var(--dc-info-ink, #1d4ed8);
    }
    .dc-number__step:focus-visible {
      outline: none;
      box-shadow: var(--dc-focus, 0 0 0 3px rgba(30,91,168,0.35));
    }
    .dc-number__step:disabled { opacity: 0.4; cursor: not-allowed; }

    .dc-number__box {
      flex: 1 1 auto;
      display: flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0 0.75rem;
      min-height: var(--dc-touch, 3rem);
      background: var(--dc-surface, #fff);
      border: var(--dc-border, 2px) solid var(--dc-line, #e1e8ed);
      border-radius: var(--dc-radius, 0.625rem);
    }
    .dc-number__box:focus-within {
      border-color: var(--dc-brand, #1e5ba8);
      box-shadow: var(--dc-focus, 0 0 0 3px rgba(30,91,168,0.35));
    }

    .dc-number__affix {
      font-size: var(--dc-text, 1rem);
      font-weight: 600;
      color: var(--dc-ink-soft, #666);
    }

    .dc-number__input {
      flex: 1 1 auto;
      width: 100%;
      min-width: 0;
      border: 0;
      outline: none;
      background: transparent;
      color: var(--dc-ink, #2c3e50);
      font-family: inherit;
      font-size: var(--dc-text-lg, 1.125rem);
      font-weight: 600;
      text-align: center;
      padding: 0;
    }
  `]
})
export class DcNumberComponent implements ControlValueAccessor {
  /** How much one press of − or + changes the value. */
  @Input() step = 1;

  /** Lowest allowed value. The − button disables here. */
  @Input() min: number | null = null;

  /** Highest allowed value. The + button disables here. */
  @Input() max: number | null = null;

  /** Shown inside the box before the number, e.g. '₹'. */
  @Input() prefix = '';

  /** Shown inside the box after the number, e.g. '%'. */
  @Input() suffix = '';

  /** Decimal places to settle on when the user leaves the box. */
  @Input() decimals = 0;

  /** Spoken name for the box and its two buttons. */
  @Input() ariaLabel = '';

  @Input() disabled = false;

  @Output() valueChange = new EventEmitter<number | null>();

  /** What the user currently sees — kept as text so half-typed input survives. */
  display = '';

  private value: number | null = null;
  private onChange: (value: number | null) => void = () => {};
  private onTouched: () => void = () => {};

  get atMin(): boolean {
    return this.min !== null && this.value !== null && this.value <= this.min;
  }
  get atMax(): boolean {
    return this.max !== null && this.value !== null && this.value >= this.max;
  }

  nudge(by: number): void {
    if (this.disabled) return;
    const base = this.value ?? this.min ?? 0;
    this.commit(base + by);
  }

  /** While typing we only mirror the text — clamping mid-keystroke fights the
   *  user (typing "1" toward "15" would snap to the minimum). */
  onType(text: string): void {
    this.display = text;
    const parsed = this.parse(text);
    this.value = parsed;
    this.onChange(parsed);
    this.valueChange.emit(parsed);
  }

  /** On blur the value is settled: clamped, rounded, and reformatted. */
  onBlur(): void {
    this.onTouched();
    if (this.value === null) {
      this.display = '';
      return;
    }
    this.commit(this.value);
  }

  private commit(raw: number): void {
    let next = raw;
    if (this.min !== null) next = Math.max(this.min, next);
    if (this.max !== null) next = Math.min(this.max, next);
    next = Number(next.toFixed(this.decimals));

    this.value = next;
    this.display = next.toFixed(this.decimals);
    this.onChange(next);
    this.valueChange.emit(next);
  }

  private parse(text: string): number | null {
    const cleaned = (text ?? '').toString().replace(/[^0-9.\-]/g, '');
    if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /** The API sometimes hands back a numeric string ("250.00"), so parse rather
   *  than trust the declared type. */
  writeValue(value: number | string | null): void {
    this.value = typeof value === 'number' && Number.isFinite(value)
      ? value
      : this.parse(value as string);
    this.display = this.value === null ? '' : this.value.toFixed(this.decimals);
  }
  registerOnChange(fn: (value: number | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.disabled = isDisabled; }
}
