import { Component, EventEmitter, Input, Output, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/**
 * DcSearchComponent — one big search box that behaves predictably.
 *
 * Why this exists
 * ───────────────
 * Search is the first thing every user of this app does, and today each screen
 * builds its own: some search as you type, some wait for a button, some have a
 * Clear, some don't. Staff learn the wrong lesson ("this screen is broken")
 * when the same box behaves differently two screens apart.
 *
 * This one always does the same four things:
 *   • one large box with a magnifier and a placeholder that says WHAT to type
 *   • Enter searches; a visible Search button searches — both, always
 *   • a Clear (×) that appears only when there is something to clear, and
 *     immediately re-runs the empty search so the full list comes back
 *   • an optional live result count underneath, so an empty result reads as
 *     "0 patients found" rather than a blank screen the user thinks is a crash
 *
 * Usage:
 *   <dc-search [(value)]="searchTerm"
 *              label="Find a patient"
 *              placeholder="Type a name or patient ID"
 *              [resultCount]="filteredPatients.length"
 *              resultNoun="patient"
 *              (search)="searchPatients()">
 *   </dc-search>
 */
@Component({
  selector: 'dc-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="dc-search">
      <label class="dc-search__label" [attr.for]="inputId" *ngIf="label">{{ label }}</label>

      <div class="dc-search__row">
        <div class="dc-search__box">
          <i class="fa fa-search dc-search__icon" aria-hidden="true"></i>
          <input #box
                 class="dc-search__input"
                 [id]="inputId"
                 type="search"
                 autocomplete="off"
                 [placeholder]="placeholder"
                 [ngModel]="value"
                 [disabled]="disabled"
                 (ngModelChange)="onType($event)"
                 (keyup.enter)="run()">
          <button type="button"
                  class="dc-search__clear"
                  *ngIf="value"
                  aria-label="Clear the search box"
                  (click)="clear()">
            <i class="fa fa-times" aria-hidden="true"></i>
          </button>
        </div>

        <button type="button" class="dc-search__go" [disabled]="disabled" (click)="run()">
          <i class="fa fa-search" aria-hidden="true"></i>
          <span>{{ buttonLabel }}</span>
        </button>
      </div>

      <p class="dc-search__count" *ngIf="resultCount !== null" aria-live="polite">
        <ng-container *ngIf="resultCount === 0">
          Nothing found{{ value ? ' for “' + value + '”' : '' }}. Check the spelling, or clear the box to see everything.
        </ng-container>
        <ng-container *ngIf="resultCount !== 0">
          Showing {{ resultCount }} {{ resultCount === 1 ? resultNoun : resultNounPlural }}.
        </ng-container>
      </p>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .dc-search__label {
      display: block;
      font-size: var(--dc-text-lg, 1.125rem);
      font-weight: 600;
      color: var(--dc-ink, #2c3e50);
      margin-bottom: var(--dc-gap-xs, 0.35rem);
    }

    .dc-search__row {
      display: flex;
      gap: var(--dc-gap-sm, 0.6rem);
      flex-wrap: wrap;
    }

    .dc-search__box {
      flex: 1 1 16rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0 0.85rem;
      min-height: var(--dc-touch-lg, 3.5rem);
      background: var(--dc-surface, #fff);
      border: var(--dc-border, 2px) solid var(--dc-line, #e1e8ed);
      border-radius: var(--dc-radius, 0.625rem);
    }
    .dc-search__box:focus-within {
      border-color: var(--dc-brand, #1e5ba8);
      box-shadow: var(--dc-focus, 0 0 0 3px rgba(30,91,168,0.35));
    }

    .dc-search__icon { color: var(--dc-ink-soft, #666); font-size: 1.05rem; }

    .dc-search__input {
      flex: 1 1 auto;
      min-width: 0;
      border: 0;
      outline: none;
      background: transparent;
      color: var(--dc-ink, #2c3e50);
      font-family: inherit;
      font-size: var(--dc-text-lg, 1.125rem);
      padding: 0;
    }
    /* The browser's own clear cross is tiny and inconsistent — we draw our own. */
    .dc-search__input::-webkit-search-cancel-button { display: none; }

    .dc-search__clear {
      flex: 0 0 auto;
      width: 2.25rem;
      height: 2.25rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 50%;
      background: var(--dc-surface-muted, #f8f9fa);
      color: var(--dc-ink-soft, #666);
      cursor: pointer;
    }
    .dc-search__clear:hover {
      background: var(--dc-danger-bg, #fee2e2);
      color: var(--dc-danger-ink, #b91c1c);
    }
    .dc-search__clear:focus-visible {
      outline: none;
      box-shadow: var(--dc-focus, 0 0 0 3px rgba(30,91,168,0.35));
    }

    .dc-search__go {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      min-height: var(--dc-touch-lg, 3.5rem);
      padding: 0 1.5rem;
      font-family: inherit;
      font-size: var(--dc-text, 1rem);
      font-weight: 600;
      color: #fff;
      background: var(--dc-brand, #1e5ba8);
      border: var(--dc-border, 2px) solid transparent;
      border-radius: var(--dc-radius, 0.625rem);
      cursor: pointer;
      transition: filter 0.15s ease;
    }
    .dc-search__go:hover:not(:disabled) { filter: brightness(1.1); }
    .dc-search__go:focus-visible {
      outline: none;
      box-shadow: var(--dc-focus, 0 0 0 3px rgba(30,91,168,0.35));
    }
    .dc-search__go:disabled { opacity: 0.5; cursor: not-allowed; }

    .dc-search__count {
      margin: var(--dc-gap-xs, 0.35rem) 0 0;
      font-size: var(--dc-text-sm, 0.875rem);
      color: var(--dc-ink-soft, #666);
    }

    @media (max-width: 30rem) {
      .dc-search__go { flex: 1 1 100%; }
    }
  `]
})
export class DcSearchComponent {
  /** Text above the box. Phrase it as a task: "Find a patient". */
  @Input() label = '';

  /** Placeholder. Say what to type, not what the box is: "Type a name or ID". */
  @Input() placeholder = 'Type to search';

  /** Words on the button. */
  @Input() buttonLabel = 'Search';

  /** Two-way bound search text. */
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();

  /** Pass your filtered list length to get a plain-language count line. */
  @Input() resultCount: number | null = null;

  /** Singular noun for the count line, e.g. 'patient'. */
  @Input() resultNoun = 'result';

  /** Plural override, when adding 's' is wrong ('entry' → 'entries'). */
  @Input() set resultNounPlural(value: string) { this.pluralOverride = value; }
  get resultNounPlural(): string { return this.pluralOverride || this.resultNoun + 's'; }

  @Input() disabled = false;

  /** id for the label to point at; unique per instance. */
  @Input() inputId = 'dc-search-' + Math.random().toString(36).slice(2, 8);

  /** Fires on Enter, on the Search button, and when the box is cleared. */
  @Output() search = new EventEmitter<string>();

  @ViewChild('box') private box?: ElementRef<HTMLInputElement>;

  private pluralOverride = '';

  onType(text: string): void {
    this.value = text;
    this.valueChange.emit(text);
  }

  run(): void {
    this.search.emit(this.value);
  }

  /**
   * Clearing re-runs the search immediately. Leaving the list filtered after
   * the box is empty is the single most common "the app is stuck" report.
   */
  clear(): void {
    this.value = '';
    this.valueChange.emit('');
    this.search.emit('');
    this.box?.nativeElement.focus();
  }
}
