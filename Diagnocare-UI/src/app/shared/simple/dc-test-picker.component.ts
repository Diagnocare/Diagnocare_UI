import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/**
 * One test as the picker needs it. Deliberately not `TestItem` — the picker
 * knows nothing about the API, which is what lets it be previewed with sample
 * data and unit-tested without a backend.
 */
export interface DcPickableTest {
  /** Unique code — the identity used everywhere in this component. */
  code: string;
  name: string;
  price: number;
  /** False when the test has no parameters configured, so it cannot be booked. */
  bookable: boolean;
  /** Group name, shown as context on a search result. */
  group?: string;
}

/** A sub-group and the tests inside it. */
export interface DcTestSubGroup {
  id: string;
  name: string;
  tests: DcPickableTest[];
}

/** A top-level group and its sub-groups. */
export interface DcTestGroup {
  id: string;
  name: string;
  subGroups: DcTestSubGroup[];
}

/**
 * DcTestPickerComponent — browse the catalogue by group, or search across all of it.
 *
 * The shape of this screen
 * ────────────────────────
 * Group → Sub-group → Tests, as before, because that is how the catalogue is
 * organised and how staff who know it navigate. Everything is reachable by
 * browsing: nothing is hidden behind a search term.
 *
 * What changed from the original catalogue:
 *
 *   • Search sits at the top and searches every test in every group. Type
 *     anything and the three columns give way to a flat result list; clear it
 *     and the columns come back exactly where they were.
 *   • The first group and sub-group open automatically, so the Tests column is
 *     never an empty "Select a group" dead end on arrival.
 *   • Selected tests live in a bar pinned to the bottom rather than a fourth
 *     column, so the running total and the Done button are always in view — and
 *     each chosen test can be removed from there.
 *   • An unbookable test says WHY on its own row. In the original that reason
 *     lived in a `title` tooltip, which never appears on a touchscreen, so
 *     people clicked it repeatedly and concluded the app was broken.
 *
 * Colours chain kit tokens → the app's theme variables → the catalogue's own
 * literals, so it sits on the same background as everything around it whether
 * or not simple-ui.css has been imported, and in all five themes.
 *
 * Usage:
 *   <dc-test-picker [groups]="testGroups"
 *                   [selectedCodes]="selectedTestCodes"
 *                   [loading]="isLoadingAllTests"
 *                   (toggled)="onPickerToggled($event)"
 *                   (confirmed)="confirmTestSelection()"
 *                   (cancelled)="cancelTestCatalog()">
 *   </dc-test-picker>
 */
@Component({
  selector: 'dc-test-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="dcp">

      <!-- ── Search, always on top ───────────────────────────────────────── -->
      <div class="dcp__searchbar">
        <div class="dcp__search">
          <i class="fa fa-search" aria-hidden="true"></i>
          <input type="search"
                 class="dcp__input"
                 [(ngModel)]="query"
                 [ngModelOptions]="{ standalone: true }"
                 [placeholder]="placeholder"
                 autocomplete="off"
                 aria-label="Search every test by name or code">
          <button type="button" class="dcp__clear" *ngIf="query"
                  aria-label="Clear the search and go back to browsing"
                  (click)="query = ''">
            <i class="fa fa-times" aria-hidden="true"></i>
          </button>
        </div>
        <p class="dcp__searchhint">
          <ng-container *ngIf="!query">Search every group, or browse below.</ng-container>
          <ng-container *ngIf="query">
            {{ matches.length }} test{{ matches.length === 1 ? '' : 's' }} match “{{ query }}”.
            Clear the box to browse by group again.
          </ng-container>
        </p>
      </div>

      <!-- ── Loading ─────────────────────────────────────────────────────── -->
      <p class="dcp__loading" *ngIf="loading">
        <i class="fa fa-spinner fa-spin" aria-hidden="true"></i>
        Loading the test list…
      </p>

      <!-- ── BROWSE: Group → Sub-group → Tests ───────────────────────────── -->
      <div class="dcp__cols" *ngIf="!loading && !query">

        <!-- Groups -->
        <section class="dcp__col">
          <h4 class="dcp__colhead">Group</h4>
          <div class="dcp__collist">
            <p class="dcp__empty" *ngIf="groups.length === 0">No groups found</p>
            <button type="button" class="dcp__node"
                    *ngFor="let group of groups"
                    [class.dcp__node--on]="group.id === openGroupId"
                    (click)="openGroup(group)">
              <span class="dcp__nodetext">
                <span class="dcp__nodename">{{ group.name }}</span>
                <span class="dcp__nodemeta">{{ group.subGroups.length }} sub-group{{ group.subGroups.length === 1 ? '' : 's' }}</span>
              </span>
              <i class="fa fa-chevron-right" aria-hidden="true"></i>
            </button>
          </div>
        </section>

        <!-- Sub-groups -->
        <section class="dcp__col">
          <h4 class="dcp__colhead">Sub-group</h4>
          <div class="dcp__collist">
            <p class="dcp__empty" *ngIf="openSubGroups.length === 0">Choose a group first</p>
            <button type="button" class="dcp__node"
                    *ngFor="let sub of openSubGroups"
                    [class.dcp__node--on]="sub.id === openSubGroupId"
                    (click)="openSubGroup(sub)">
              <span class="dcp__nodetext">
                <span class="dcp__nodename">{{ sub.name }}</span>
                <span class="dcp__nodemeta">
                  {{ sub.tests.length }} test{{ sub.tests.length === 1 ? '' : 's' }}
                  <ng-container *ngIf="countChosenIn(sub) > 0"> · {{ countChosenIn(sub) }} chosen</ng-container>
                </span>
              </span>
              <i class="fa fa-chevron-right" aria-hidden="true"></i>
            </button>
          </div>
        </section>

        <!-- Tests -->
        <section class="dcp__col dcp__col--tests">
          <h4 class="dcp__colhead">
            Tests
            <span class="dcp__colhint" *ngIf="openTests.length">Tap to add or remove</span>
          </h4>
          <div class="dcp__collist">
            <p class="dcp__empty" *ngIf="openTests.length === 0">Choose a sub-group to see its tests</p>
            <ng-container *ngFor="let test of openTests">
              <ng-container *ngTemplateOutlet="testRow; context: { $implicit: test, showGroup: false }"></ng-container>
            </ng-container>
          </div>
        </section>
      </div>

      <!-- ── SEARCH RESULTS: flat, across every group ────────────────────── -->
      <div class="dcp__results" *ngIf="!loading && query">
        <p class="dcp__none" *ngIf="matches.length === 0">
          <i class="fa fa-info-circle" aria-hidden="true"></i>
          No test matches “{{ query }}”. Try fewer letters — “thy” finds Thyroid Profile.
        </p>
        <ng-container *ngFor="let test of matches">
          <ng-container *ngTemplateOutlet="testRow; context: { $implicit: test, showGroup: true }"></ng-container>
        </ng-container>
      </div>

      <!-- ── One row, used by both views ─────────────────────────────────── -->
      <ng-template #testRow let-test let-showGroup="showGroup">
        <button type="button" class="dcp__row"
                *ngIf="test.bookable"
                [class.dcp__row--on]="isSelected(test.code)"
                (click)="toggled.emit(test)">
          <span class="dcp__box" aria-hidden="true"><i class="fa fa-check"></i></span>
          <span class="dcp__rowtext">
            <span class="dcp__rowname">{{ test.name }}</span>
            <span class="dcp__rowmeta">
              {{ isSelected(test.code) ? 'Added — tap to remove'
                 : (showGroup && test.group ? test.group + ' · ' : '') + test.code }}
            </span>
          </span>
          <span class="dcp__price">₹{{ test.price }}</span>
        </button>

        <!-- Not a button: it cannot be chosen, and it says so in words. -->
        <div class="dcp__row dcp__row--off" *ngIf="!test.bookable">
          <span class="dcp__box" aria-hidden="true"><i class="fa fa-ban"></i></span>
          <span class="dcp__rowtext">
            <span class="dcp__rowname">{{ test.name }}</span>
            <span class="dcp__rowmeta">Cannot be booked yet — no parameters set up for this test</span>
          </span>
          <span class="dcp__price">₹{{ test.price }}</span>
        </div>
      </ng-template>

      <!-- ── Chosen tests + total, pinned ────────────────────────────────── -->
      <div class="dcp__basket">
        <div class="dcp__sum">
          <p class="dcp__sumline">
            <ng-container *ngIf="selected.length === 0">No tests chosen yet</ng-container>
            <ng-container *ngIf="selected.length > 0">
              {{ selected.length }} test{{ selected.length === 1 ? '' : 's' }} · ₹{{ total }}
            </ng-container>
          </p>
          <div class="dcp__tags" *ngIf="selected.length > 0">
            <span class="dcp__tag" *ngFor="let test of selected">
              <span>{{ test.name }}</span>
              <button type="button" [attr.aria-label]="'Remove ' + test.name" (click)="toggled.emit(test)">
                <i class="fa fa-times" aria-hidden="true"></i>
              </button>
            </span>
          </div>
          <p class="dcp__sumsub" *ngIf="selected.length === 0">
            Browse the groups above, or search for a test by name.
          </p>
        </div>

        <div class="dcp__buttons">
          <button type="button" class="dcp__btn dcp__btn--back" (click)="cancelled.emit()">
            {{ cancelLabel }}
          </button>
          <button type="button" class="dcp__btn dcp__btn--go"
                  [disabled]="selected.length === 0"
                  (click)="confirmed.emit()">
            <i class="fa fa-check" aria-hidden="true"></i>
            <span>{{ confirmLabel }}</span>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* Colours chain: kit token → the app's theme variable → the original
       catalogue's literal. That is what keeps this panel on the same
       background as the card it sits in, in every theme, with or without
       simple-ui.css imported. */
    :host {
      --p-surface: var(--dc-surface,       var(--bg-white,        #ffffff));
      --p-muted:   var(--dc-surface-muted, var(--bg-light,        #f8fafc));
      --p-line:    var(--dc-line,          var(--border-color,    #eef1f8));
      --p-ink:     var(--dc-ink,           var(--text-primary,    #234a57));
      --p-soft:    var(--dc-ink-soft,      var(--text-secondary,  #6b7c93));
      --p-brand:   var(--dc-brand,         var(--primary-color,   #1e5ba8));
      --p-radius:  var(--dc-radius,        8px);
      --p-touch:   var(--dc-touch,         3rem);

      display: block;
      background: transparent;      /* inherit the card behind it */
      color: var(--p-ink);
      padding: 1.25rem 1.75rem 1.5rem;
    }
    @media (max-width: 40rem) { :host { padding: 1rem; } }

    /* Bootstrap already sets this globally in the app; stated here too so the
       picker keeps its layout if it is ever rendered without it (the preview
       app, a test harness). Without it, width:100% plus padding overflows and
       the price column clips. */
    .dcp, .dcp *, .dcp *::before, .dcp *::after { box-sizing: border-box; }

    /* ── Search ─────────────────────────────────────────────────────────── */
    .dcp__searchbar { margin-bottom: 1rem; }
    .dcp__search {
      display: flex; align-items: center; gap: .6rem;
      padding: 0 1rem; min-height: var(--dc-touch-lg, 3.25rem);
      background: var(--p-surface);
      border: 2px solid var(--p-line);
      border-radius: var(--p-radius);
    }
    .dcp__search:focus-within {
      border-color: var(--p-brand);
      box-shadow: var(--dc-focus, 0 0 0 3px rgba(30,91,168,.28));
    }
    .dcp__search > .fa { color: var(--p-soft); }
    .dcp__input {
      flex: 1 1 auto; min-width: 0; border: 0; outline: none; background: transparent;
      color: var(--p-ink); font-family: inherit; font-size: var(--dc-text-lg, 1.05rem);
    }
    .dcp__input::-webkit-search-cancel-button { display: none; }
    .dcp__clear {
      width: 2.25rem; height: 2.25rem; border: 0; border-radius: 50%; cursor: pointer;
      background: var(--p-muted); color: var(--p-soft);
    }
    .dcp__clear:hover { background: var(--dc-danger-bg, #fee2e2); color: var(--dc-danger-ink, #b91c1c); }
    .dcp__searchhint {
      margin: .4rem 0 0; font-size: var(--dc-text-sm, .85rem); color: var(--p-soft);
    }

    .dcp__loading {
      display: flex; align-items: center; gap: .5rem; margin: 1rem 0; color: var(--p-soft);
    }

    /* ── Three columns ──────────────────────────────────────────────────── */
    .dcp__cols {
      display: grid;
      grid-template-columns: 1fr 1fr 1.4fr;
      gap: .75rem;
      align-items: stretch;
    }
    @media (max-width: 60rem) { .dcp__cols { grid-template-columns: 1fr 1fr; } .dcp__col--tests { grid-column: 1 / -1; } }
    @media (max-width: 34rem) { .dcp__cols { grid-template-columns: 1fr; } }

    .dcp__col {
      display: flex; flex-direction: column; min-width: 0;
      background: var(--p-surface);
      border: 1px solid var(--p-line);
      border-radius: var(--p-radius);
      overflow: hidden;
    }
    .dcp__colhead {
      display: flex; align-items: baseline; justify-content: space-between; gap: .5rem;
      margin: 0; padding: .6rem .85rem;
      font-family: inherit; font-size: .8rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: .04em;
      color: var(--p-soft);
      background: var(--p-muted);
      border-bottom: 1px solid var(--p-line);
    }
    .dcp__colhint { font-size: .68rem; font-weight: 500; text-transform: none; letter-spacing: 0; }
    .dcp__collist { flex: 1 1 auto; max-height: 20rem; overflow-y: auto; padding: .4rem; }
    .dcp__empty { margin: 0; padding: 1.25rem .75rem; text-align: center; font-size: .85rem; color: var(--p-soft); }

    /* Group / sub-group rows */
    .dcp__node {
      display: flex; align-items: center; gap: .5rem; width: 100%; text-align: left;
      min-height: var(--p-touch); padding: .5rem .7rem; margin-bottom: .25rem;
      font-family: inherit; font-size: .95rem;
      background: transparent; color: var(--p-ink);
      border: 2px solid transparent; border-radius: var(--p-radius);
      cursor: pointer;
    }
    .dcp__node:hover { background: var(--p-muted); }
    .dcp__node:focus-visible { outline: none; box-shadow: var(--dc-focus, 0 0 0 3px rgba(30,91,168,.28)); }
    .dcp__node--on {
      background: var(--dc-info-bg, #e8f0fb);
      border-color: var(--p-brand);
      color: var(--dc-info-ink, var(--primary-color, #1e5ba8));
      font-weight: 600;
    }
    .dcp__nodetext { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
    .dcp__nodename { line-height: 1.3; }
    .dcp__nodemeta { font-size: .78rem; font-weight: 400; color: var(--p-soft); }
    .dcp__node--on .dcp__nodemeta { color: inherit; opacity: .8; }
    .dcp__node > .fa { flex: 0 0 auto; opacity: .45; font-size: .8rem; }

    /* ── Test rows, shared by browse and search ─────────────────────────── */
    .dcp__results { display: flex; flex-direction: column; gap: .5rem; }
    .dcp__none {
      display: flex; align-items: flex-start; gap: .5rem; margin: 0;
      padding: .75rem 1rem; border-radius: var(--p-radius);
      background: var(--dc-info-bg, #e8f0fb);
      border: 1px solid var(--dc-info-line, #b9d2f2);
      color: var(--dc-info-ink, var(--primary-color, #1e5ba8));
      font-weight: 600;
    }

    .dcp__row {
      display: flex; align-items: center; gap: .75rem; width: 100%; text-align: left;
      min-height: var(--p-touch); padding: .55rem .7rem; margin-bottom: .25rem;
      font-family: inherit; font-size: .95rem;
      background: var(--p-surface); color: var(--p-ink);
      border: 2px solid var(--p-line); border-radius: var(--p-radius);
      cursor: pointer;
    }
    .dcp__results .dcp__row { margin-bottom: 0; }
    .dcp__row:hover { border-color: var(--p-brand); background: var(--p-muted); }
    .dcp__row:focus-visible { outline: none; box-shadow: var(--dc-focus, 0 0 0 3px rgba(30,91,168,.28)); }
    .dcp__row--on {
      border-color: var(--dc-ok-line, #86efac);
      background: var(--dc-ok-bg, #dcfce7);
      color: var(--dc-ok-ink, #15803d);
    }
    .dcp__row--off { opacity: .65; cursor: default; }
    .dcp__row--off:hover { border-color: var(--p-line); background: var(--p-surface); }

    .dcp__box {
      flex: 0 0 auto; width: 1.5rem; height: 1.5rem; border-radius: 5px;
      border: 2px solid var(--p-line); background: var(--p-surface); color: transparent;
      display: inline-flex; align-items: center; justify-content: center; font-size: .8rem;
    }
    .dcp__row--on .dcp__box {
      background: var(--dc-ok-ink, #15803d); border-color: var(--dc-ok-ink, #15803d); color: #fff;
    }
    .dcp__row--off .dcp__box { color: var(--dc-danger-ink, #b91c1c); border-style: dashed; }

    .dcp__rowtext { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
    .dcp__rowname { font-weight: 600; line-height: 1.3; }
    .dcp__rowmeta { font-size: .78rem; font-weight: 400; color: var(--p-soft); }
    .dcp__row--on .dcp__rowmeta { color: inherit; opacity: .85; }
    .dcp__price { flex: 0 0 auto; margin-left: .25rem; font-weight: 700; white-space: nowrap; }

    /* ── Basket ─────────────────────────────────────────────────────────── */
    .dcp__basket {
      position: sticky; bottom: 0; margin-top: 1rem;
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 1rem; flex-wrap: wrap;
      padding: .85rem 1rem;
      background: var(--p-surface);
      border: 2px solid var(--p-line);
      border-radius: var(--p-radius);
      box-shadow: 0 -6px 18px rgba(22, 45, 60, .07);
    }
    .dcp__sum { flex: 1 1 18rem; min-width: 0; }
    .dcp__sumline { margin: 0; font-weight: 700; font-size: 1.02rem; }
    .dcp__sumsub { margin: .1rem 0 0; font-size: .85rem; color: var(--p-soft); }

    .dcp__tags { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .5rem; }
    .dcp__tag {
      display: inline-flex; align-items: center; gap: .35rem;
      padding: .25rem .3rem .25rem .7rem; border-radius: 999px;
      font-size: .82rem; font-weight: 600;
      background: var(--dc-ok-bg, #dcfce7);
      border: 1px solid var(--dc-ok-line, #86efac);
      color: var(--dc-ok-ink, #15803d);
    }
    .dcp__tag button {
      width: 1.5rem; height: 1.5rem; border: 0; border-radius: 50%; cursor: pointer;
      background: rgba(0,0,0,.06); color: inherit; font-size: .7rem;
    }
    .dcp__tag button:hover { background: var(--dc-danger-ink, #b91c1c); color: #fff; }

    .dcp__buttons { display: flex; gap: .6rem; flex: 0 0 auto; }
    .dcp__btn {
      display: inline-flex; align-items: center; justify-content: center; gap: .5rem;
      min-height: var(--dc-touch-lg, 3.25rem); padding: 0 1.5rem;
      font-family: inherit; font-size: 1rem; font-weight: 600;
      border-radius: var(--p-radius); border: 2px solid transparent; cursor: pointer;
    }
    .dcp__btn:focus-visible { outline: none; box-shadow: var(--dc-focus, 0 0 0 3px rgba(30,91,168,.28)); }
    .dcp__btn:disabled { opacity: .45; cursor: not-allowed; }
    .dcp__btn--go { background: #15803d; color: #fff; font-size: 1.05rem; }
    .dcp__btn--back {
      background: var(--dc-idle-bg, #f1f5f9); color: var(--dc-idle-ink, #475569);
      border-color: var(--dc-idle-line, #cbd5e1);
    }
    @media (max-width: 34rem) {
      .dcp__buttons { flex: 1 1 100%; }
      .dcp__btn { flex: 1 1 auto; padding: 0 1rem; }
    }
  `]
})
export class DcTestPickerComponent implements OnChanges {
  /** The catalogue as a tree: groups → sub-groups → tests. */
  @Input() groups: DcTestGroup[] = [];

  /** Codes of the tests currently chosen. The caller owns the list. */
  @Input() selectedCodes: string[] = [];

  /** True while the catalogue is still being fetched. */
  @Input() loading = false;

  @Input() placeholder = 'Search all tests by name or code…';
  @Input() confirmLabel = 'Done — add these tests';
  @Input() cancelLabel = 'Back';

  /** Emitted when a test is added OR removed. */
  @Output() toggled = new EventEmitter<DcPickableTest>();
  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  query = '';
  openGroupId: string | null = null;
  openSubGroupId: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    // Open the first group and sub-group as soon as the catalogue arrives, so
    // the Tests column shows something instead of "select a group".
    if (changes['groups'] && this.groups.length && !this.openGroupId) {
      this.openGroup(this.groups[0]);
    }
  }

  openGroup(group: DcTestGroup): void {
    this.openGroupId = group.id;
    const first = group.subGroups[0];
    this.openSubGroupId = first ? first.id : null;
  }

  openSubGroup(sub: DcTestSubGroup): void {
    this.openSubGroupId = sub.id;
  }

  get openSubGroups(): DcTestSubGroup[] {
    const group = this.groups.find(g => g.id === this.openGroupId);
    return group ? group.subGroups : [];
  }

  get openTests(): DcPickableTest[] {
    const sub = this.openSubGroups.find(s => s.id === this.openSubGroupId);
    return sub ? sub.tests : [];
  }

  /** Every test in the catalogue, flat — what the search runs over. */
  get allTests(): DcPickableTest[] {
    const flat: DcPickableTest[] = [];
    this.groups.forEach(group => group.subGroups.forEach(sub => sub.tests.forEach(test => {
      flat.push(test.group ? test : { ...test, group: group.name });
    })));
    return flat;
  }

  /**
   * Name or code, case-insensitive, substring — not a prefix match. Staff type
   * the distinctive middle of a name ("thyro", "creat") more often than the
   * first word.
   */
  get matches(): DcPickableTest[] {
    const term = this.query.trim().toLowerCase();
    if (!term) return [];
    return this.allTests.filter(test =>
      test.name.toLowerCase().indexOf(term) > -1 ||
      test.code.toLowerCase().indexOf(term) > -1);
  }

  isSelected(code: string): boolean {
    return this.selectedCodes.indexOf(code) > -1;
  }

  /** How many tests in this sub-group are already chosen — shown on its row so
   *  the operator can see where their selection came from without re-opening. */
  countChosenIn(sub: DcTestSubGroup): number {
    return sub.tests.filter(test => this.isSelected(test.code)).length;
  }

  get selected(): DcPickableTest[] {
    const all = this.allTests;
    return this.selectedCodes
      .map(code => all.find(test => test.code === code))
      .filter((test): test is DcPickableTest => !!test);
  }

  get total(): number {
    return this.selected.reduce((sum, test) => sum + Number(test.price || 0), 0);
  }
}
