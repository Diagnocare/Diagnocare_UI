import {
  Component, ContentChild, EventEmitter, Input, OnChanges, Output, SimpleChanges, TemplateRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ActivePromotion, BookingPackageRef, PricingPlan, SelectionType,
} from 'src/app/models/promotion/promotion.model';
import { CheckState, SelectionModel, SelOp, SelUnit, buildUnits, unitKey } from './dc-selection-model';
import { DcPickableTest, DcTestGroup, DcTestSubGroup } from '../../models/common/dc-primitives.model';

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
 *                   (focused)="onPickerFocused($event)"
 *                   (confirmed)="confirmTestSelection()"
 *                   (cancelled)="cancelTestCatalog()">
 *
 *     <!-- Optional: anything to show about the test last tapped. -->
 *     <ng-template #dcpProtocol>
 *       <app-test-protocol-panel [protocols]="focusedProtocols"></app-test-protocol-panel>
 *     </ng-template>
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
            <div class="dcp__nodewrap" *ngFor="let group of groups">
              <ng-container *ngTemplateOutlet="unitCheck; context: { type: 'Group', id: group.id, name: group.name }"></ng-container>
              <button type="button" class="dcp__node"
                      [class.dcp__node--on]="group.id === openGroupId"
                      (click)="openGroup(group)">
                <span class="dcp__nodetext">
                  <span class="dcp__nodename">{{ group.name }}</span>
                  <span class="dcp__nodemeta">{{ group.subGroups.length }} sub-group{{ group.subGroups.length === 1 ? '' : 's' }}</span>
                  <ng-container *ngTemplateOutlet="offerLine; context: { type: 'Group', id: group.id }"></ng-container>
                </span>
                <span class="dcp__price">₹{{ regularOf('Group', group.id) | number:'1.0-2' }}</span>
                <i class="fa fa-chevron-right" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </section>

        <!-- Sub-groups -->
        <section class="dcp__col">
          <h4 class="dcp__colhead">Sub-group</h4>
          <div class="dcp__collist">
            <p class="dcp__empty" *ngIf="openSubGroups.length === 0">Choose a group first</p>
            <div class="dcp__nodewrap" *ngFor="let sub of openSubGroups">
              <ng-container *ngTemplateOutlet="unitCheck; context: { type: 'SubGroup', id: sub.id, name: sub.name }"></ng-container>
              <button type="button" class="dcp__node"
                      [class.dcp__node--on]="sub.id === openSubGroupId"
                      (click)="openSubGroup(sub)">
                <span class="dcp__nodetext">
                  <span class="dcp__nodename">{{ sub.name }}</span>
                  <span class="dcp__nodemeta">
                    {{ sub.tests.length }} test{{ sub.tests.length === 1 ? '' : 's' }}
                    <ng-container *ngIf="countChosenIn(sub) > 0"> · {{ countChosenIn(sub) }} chosen</ng-container>
                  </span>
                  <ng-container *ngTemplateOutlet="offerLine; context: { type: 'SubGroup', id: sub.id }"></ng-container>
                </span>
                <span class="dcp__price">₹{{ regularOf('SubGroup', sub.id) | number:'1.0-2' }}</span>
                <i class="fa fa-chevron-right" aria-hidden="true"></i>
              </button>
            </div>
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

      <!-- ── Checkbox beside a group / sub-group name. Same box as a test row; its state is
           worked out from the tests beneath it (all / some / none). It is a separate button from
           the one that opens the node, so tapping a name never changes the selection. ───────── -->
      <ng-template #unitCheck let-type="type" let-id="id" let-name="name">
        <button type="button" class="dcp__check"
                role="checkbox"
                [attr.aria-checked]="checkState(type, id) === 'all' ? 'true' : checkState(type, id) === 'some' ? 'mixed' : 'false'"
                [attr.aria-label]="'Select all of ' + name"
                [disabled]="!hasEligible(type, id)"
                [title]="hasEligible(type, id) ? '' : 'None of these tests can be booked yet'"
                (click)="toggleUnit(type, id)">
          <span class="dcp__box"
                [class.dcp__box--on]="checkState(type, id) === 'all'"
                [class.dcp__box--some]="checkState(type, id) === 'some'" aria-hidden="true">
            <i class="fa" [ngClass]="checkState(type, id) === 'some' ? 'fa-minus' : 'fa-check'"></i>
          </span>
        </button>
      </ng-template>

      <!-- The offer on a group / sub-group, shown under its name. -->
      <ng-template #offerLine let-type="type" let-id="id">
        <span class="dcp__nodeoffer" *ngIf="promoFor(type, id) as promo">
          Promotional price: <b>₹{{ promo.promoPrice | number:'1.0-2' }}</b> (Save ₹{{ promo.savings | number:'1.0-2' }})
          <span class="dcp__offer">{{ promo.title }}</span>
        </span>
      </ng-template>

      <!-- ── One row, used by both views ─────────────────────────────────── -->
      <ng-template #testRow let-test let-showGroup="showGroup">
        <button type="button" class="dcp__row"
                *ngIf="test.bookable"
                [class.dcp__row--on]="isCovered(test.code)"
                [class.dcp__row--focus]="protocolSlot && focusedTest?.code === test.code"
                (click)="pick(test)">
          <span class="dcp__box" aria-hidden="true"><i class="fa fa-check"></i></span>
          <span class="dcp__rowtext">
            <span class="dcp__rowname">{{ test.name }}</span>
            <span class="dcp__rowmeta">
              {{ isSelected(test.code) ? 'Added — tap to remove'
                 : coveredBy(test.code) ? 'Included in ' + coveredBy(test.code) + ' — tap to remove'
                 : (showGroup && test.group ? test.group + ' · ' : '') + test.code }}
            </span>
          </span>
          <span class="dcp__price">
            <ng-container *ngIf="promoFor('Test', test.code) as tp; else regularPrice">
              <s class="dcp__was">₹{{ test.price }}</s> ₹{{ tp.promoPrice | number:'1.0-2' }}
              <span class="dcp__offer">{{ tp.title }}</span>
            </ng-container>
            <ng-template #regularPrice>₹{{ test.price }}</ng-template>
          </span>
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

      <!-- ── Collection protocol for the test last tapped ─────────────────
           Optional, and supplied by the host: the picker has no idea what a
           protocol is or where one comes from. Full width under the columns
           rather than as a fourth column, because procedure and rejection
           criteria are paragraphs and a narrow column makes them unreadable at
           exactly the moment they matter. -->
      <div class="dcp__slot" *ngIf="protocolSlot">
        <ng-container *ngTemplateOutlet="protocolSlot; context: { $implicit: focusedTest }"></ng-container>
      </div>

      <!-- ── Chosen tests + total, pinned ────────────────────────────────── -->
      <div class="dcp__basket">
        <div class="dcp__sum" aria-live="polite">
          <p class="dcp__sumline">
            <ng-container *ngIf="!hasAnything">No tests chosen yet</ng-container>
            <ng-container *ngIf="hasAnything && plan?.success">
              {{ plan!.totalTests }} test{{ plan!.totalTests === 1 ? '' : 's' }} · you pay ₹{{ plan!.payableAfterPromotion | number:'1.0-2' }}
            </ng-container>
            <ng-container *ngIf="hasAnything && !plan?.success && !planRequired">
              {{ selected.length }} test{{ selected.length === 1 ? '' : 's' }} · ₹{{ total }}
            </ng-container>
            <ng-container *ngIf="hasAnything && !plan?.success && planRequired && !quoting">
              Price not available yet
            </ng-container>
            <i class="fa fa-spinner fa-spin dcp__quoting" *ngIf="quoting" aria-label="Working out the price"></i>
          </p>

          <div class="dcp__tags" *ngIf="hasAnything">
            <span class="dcp__tag dcp__tag--pkg" *ngFor="let pkg of packages">
              <i class="fa fa-cubes" aria-hidden="true"></i>
              <span>{{ pkg.name }} <small>({{ pkg.type === 'Group' ? 'whole group' : 'sub-group' }})</small></span>
              <button type="button" [attr.aria-label]="'Remove ' + pkg.name" (click)="packageToggled.emit(pkg)">
                <i class="fa fa-times" aria-hidden="true"></i>
              </button>
            </span>
            <span class="dcp__tag" *ngFor="let test of selected">
              <span>{{ test.name }}</span>
              <button type="button" [attr.aria-label]="'Remove ' + test.name" (click)="toggled.emit(test)">
                <i class="fa fa-times" aria-hidden="true"></i>
              </button>
            </span>
          </div>

          <!-- What you are buying, and why it costs this. The server wrote every figure. -->
          <div class="dcp__bill" *ngIf="plan?.success && hasAnything">
            <div class="dcp__billline" *ngFor="let line of plan!.lines" [class.dcp__billline--inc]="line.alreadyIncluded">
              <span class="dcp__billname">
                {{ line.name }}
                <small>{{ line.type === 'Group' ? 'whole group' : line.type === 'SubGroup' ? 'sub-group' : 'test' }}</small>
                <small class="dcp__billtests" *ngIf="line.type !== 'Test' && line.tests.length">
                  Includes {{ line.tests.length }}: {{ testNames(line) }}
                </small>
                <small class="dcp__billtests" *ngIf="line.alreadyIncluded">Already included above, so not charged again</small>
              </span>
              <span class="dcp__billamt">
                <s class="dcp__was" *ngIf="line.savings > 0">₹{{ line.regularPrice | number:'1.0-2' }}</s>
                ₹{{ line.chargedPrice | number:'1.0-2' }}
              </span>
            </div>
            <div class="dcp__billtotal">
              <div><span>Regular price</span><span>₹{{ plan!.regularTotal | number:'1.0-2' }}</span></div>
              <div class="dcp__save" *ngIf="plan!.promotionDiscount > 0">
                <span>Promotional discount</span><span>−₹{{ plan!.promotionDiscount | number:'1.0-2' }}</span>
              </div>
              <div class="dcp__final"><span>Final price</span><span>₹{{ plan!.payableAfterPromotion | number:'1.0-2' }}</span></div>
              <p class="dcp__saved" *ngIf="plan!.promotionDiscount > 0">
                <i class="fa fa-tag" aria-hidden="true"></i> You save ₹{{ plan!.promotionDiscount | number:'1.0-2' }}
              </p>
            </div>
          </div>

          <ul class="dcp__notes" *ngIf="plan?.notices?.length">
            <li *ngFor="let note of plan!.notices"><i class="fa fa-info-circle" aria-hidden="true"></i> {{ note }}</li>
          </ul>

          <p class="dcp__sumsub dcp__sumsub--err" *ngIf="planRequired && !plan?.success && plan?.error">{{ plan!.error }}</p>
          <p class="dcp__sumsub" *ngIf="!hasAnything">
            Search for a test, or browse the groups and tick a box to take a test, a sub-group or a whole group.
          </p>
        </div>

        <div class="dcp__buttons">
          <button type="button" class="dc-btn dc-btn--back" (click)="cancelled.emit()">
            {{ cancelLabel }}
          </button>
          <button type="button" class="dc-btn dc-btn--save"
                  [disabled]="!canConfirm"
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
      --p-surface: var(--color-surface);
      --p-muted:   var(--color-surface-sunken);
      --p-line:    var(--color-border);
      --p-ink:     var(--color-text-primary);
      --p-soft:    var(--color-text-secondary);
      --p-brand:   var(--color-primary);
      --p-radius:  var(--radius-md);
      --p-touch:   var(--dc-touch, 3rem);

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
    /* Same box as the global .form-control: 2.5 x 14px tall, 2px border, radius-md. */
    .dcp__search {
      display: flex; align-items: center; gap: .6rem;
      padding: 0 .9375rem; height: 2.5rem;
      background: var(--p-surface);
      border: .125rem solid var(--p-line);
      border-radius: var(--p-radius);
      transition: all .3s ease;
    }
    .dcp__search:focus-within {
      border-color: var(--p-brand);
      box-shadow: var(--dc-focus);
    }
    .dcp__search > .fa { color: var(--p-soft); }
    .dcp__input {
      flex: 1 1 auto; min-width: 0; border: 0; outline: none; background: transparent;
      color: var(--p-ink); font-family: inherit; font-size: var(--dc-text-body);
    }
    .dcp__input::-webkit-search-cancel-button { display: none; }
    .dcp__clear {
      width: 1.75rem; height: 1.75rem; border: 0; border-radius: 50%; cursor: pointer;
      background: var(--p-muted); color: var(--p-soft);
    }
    .dcp__clear:hover { background: var(--dc-danger-bg); color: var(--dc-danger-ink); }
    .dcp__searchhint {
      margin: .4rem 0 0; font-size: var(--dc-text-meta); color: var(--p-soft);
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
      font-family: inherit; font-size: var(--dc-text-micro); font-weight: 700;
      text-transform: uppercase; letter-spacing: .04em;
      color: var(--p-soft);
      background: var(--p-muted);
      border-bottom: 1px solid var(--p-line);
    }
    .dcp__colhint { font-size: .68rem; font-weight: 500; text-transform: none; letter-spacing: 0; }
    .dcp__collist { flex: 1 1 auto; max-height: 20rem; overflow-y: auto; padding: .4rem; }
    .dcp__empty { margin: 0; padding: 1.25rem .75rem; text-align: center; font-size: var(--dc-text-meta); color: var(--p-soft); }

    /* Group / sub-group rows */
    .dcp__node {
      display: flex; align-items: center; gap: .5rem; width: 100%; text-align: left;
      min-height: var(--p-touch); padding: .5rem .7rem; margin-bottom: .25rem;
      font-family: inherit; font-size: var(--dc-text-body);
      background: transparent; color: var(--p-ink);
      border: 2px solid transparent; border-radius: var(--p-radius);
      cursor: pointer;
    }
    .dcp__node:hover { background: var(--p-muted); }
    .dcp__node:focus-visible { outline: none; box-shadow: var(--dc-focus); }
    .dcp__node--on {
      background: var(--dc-info-bg);
      border-color: var(--p-brand);
      color: var(--dc-info-ink);
      font-weight: 600;
    }
    .dcp__nodetext { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
    .dcp__nodename { line-height: 1.3; }
    .dcp__nodemeta { font-size: var(--dc-text-micro); font-weight: 400; color: var(--p-soft); }
    .dcp__node--on .dcp__nodemeta { color: inherit; opacity: .8; }
    .dcp__node > .fa { flex: 0 0 auto; opacity: .45; font-size: .8rem; }

    /* ── Test rows, shared by browse and search ─────────────────────────── */
    .dcp__results { display: flex; flex-direction: column; gap: .5rem; }
    .dcp__none {
      display: flex; align-items: flex-start; gap: .5rem; margin: 0;
      padding: .75rem 1rem; border-radius: var(--p-radius);
      background: var(--dc-info-bg);
      border: 1px solid var(--dc-info-line);
      color: var(--dc-info-ink);
      font-weight: 600;
    }

    .dcp__row {
      display: flex; align-items: center; gap: .75rem; width: 100%; text-align: left;
      min-height: var(--p-touch); padding: .55rem .7rem; margin-bottom: .25rem;
      font-family: inherit; font-size: var(--dc-text-body);
      background: var(--p-surface); color: var(--p-ink);
      border: 2px solid var(--p-line); border-radius: var(--p-radius);
      cursor: pointer;
    }
    .dcp__results .dcp__row { margin-bottom: 0; }
    .dcp__row:hover { border-color: var(--p-brand); background: var(--p-muted); }
    .dcp__row:focus-visible { outline: none; box-shadow: var(--dc-focus); }
    .dcp__row--on {
      border-color: var(--dc-ok-line);
      background: var(--dc-ok-bg);
      color: var(--dc-ok-ink);
    }
    .dcp__row--off { opacity: .65; cursor: default; }
    .dcp__row--off:hover { border-color: var(--p-line); background: var(--p-surface); }

    /* Which row the protocol below is describing. A left edge rather than a
       background, so it reads on top of the green "chosen" state as well. */
    .dcp__row--focus { box-shadow: inset 3px 0 0 0 var(--p-brand); }

    .dcp__box {
      flex: 0 0 auto; width: 1.5rem; height: 1.5rem; border-radius: 5px;
      border: 2px solid var(--p-line); background: var(--p-surface); color: transparent;
      display: inline-flex; align-items: center; justify-content: center; font-size: .8rem;
    }
    .dcp__row--on .dcp__box {
      background: var(--dc-ok-ink); border-color: var(--dc-ok-ink); color: #fff;
    }
    .dcp__row--off .dcp__box { color: var(--dc-danger-ink); border-style: dashed; }

    .dcp__rowtext { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
    .dcp__rowname { font-weight: 600; line-height: 1.3; }
    .dcp__rowmeta { font-size: var(--dc-text-micro); font-weight: 400; color: var(--p-soft); }
    .dcp__row--on .dcp__rowmeta { color: inherit; opacity: .85; }
    .dcp__price { flex: 0 0 auto; margin-left: .25rem; font-weight: 700; white-space: nowrap; }

    /* ── Host-supplied slot (collection protocol) ───────────────────────────
       No margin of its own: what the host projects brings its own spacing, and
       two sources of margin here is how panels end up with uneven gaps. */
    .dcp__slot { display: block; }

    /* ── Whole-group / sub-group actions and offers ─────────────────────── */
    .dcp__nodewrap { display: flex; align-items: flex-start; gap: .35rem; }
    .dcp__nodewrap .dcp__node { flex: 1 1 auto; min-width: 0; }
    .dcp__check {
      flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;
      min-width: var(--p-touch); min-height: var(--p-touch); padding: 0;
      background: transparent; border: 0; border-radius: var(--p-radius); cursor: pointer;
    }
    .dcp__check:hover:not(:disabled) { background: var(--p-muted); }
    .dcp__check:focus-visible { outline: none; box-shadow: var(--dc-focus); }
    .dcp__check:disabled { opacity: .45; cursor: not-allowed; }
    .dcp__box--on { background: var(--dc-ok-ink); border-color: var(--dc-ok-ink); color: #fff; }
    .dcp__box--some { background: var(--p-surface); border-color: var(--dc-ok-ink); color: var(--dc-ok-ink); }
    .dcp__nodeoffer {
      display: flex; flex-wrap: wrap; align-items: baseline; gap: .35rem; margin-top: .15rem;
      font-size: var(--dc-text-micro); color: var(--dc-ok-ink); font-weight: 600;
    }
    .dcp__was { font-weight: 400; color: var(--p-soft); }
    .dcp__offer {
      display: inline-block; padding: .05rem .45rem; border-radius: 999px;
      font-size: var(--dc-text-micro); font-weight: 700; font-style: normal;
      background: var(--dc-warn-bg, var(--dc-info-bg)); color: var(--dc-warn-ink, var(--dc-info-ink));
      border: 1px solid var(--dc-warn-line, var(--dc-info-line));
    }
    .dcp__quoting { margin-left: .4rem; color: var(--p-soft); }

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
      /* A long breakdown scrolls inside the bar instead of covering the whole screen on a phone. */
      max-height: 55vh; overflow-y: auto;
    }
    .dcp__sum { flex: 1 1 18rem; min-width: 0; }
    .dcp__sumline { margin: 0; font-weight: 700; font-size: var(--dc-text-body); }
    .dcp__sumsub { margin: .1rem 0 0; font-size: var(--dc-text-meta); color: var(--p-soft); }

    .dcp__tags { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .5rem; }
    .dcp__tag {
      display: inline-flex; align-items: center; gap: .35rem;
      padding: .25rem .3rem .25rem .7rem; border-radius: 999px;
      font-size: var(--dc-text-meta); font-weight: 600;
      background: var(--dc-ok-bg);
      border: 1px solid var(--dc-ok-line);
      color: var(--dc-ok-ink);
    }
    .dcp__tag button {
      width: 1.5rem; height: 1.5rem; border: 0; border-radius: 50%; cursor: pointer;
      background: rgba(0,0,0,.06); color: inherit; font-size: .7rem;
    }
    .dcp__tag button:hover { background: var(--dc-danger-ink); color: #fff; }

    .dcp__tag--pkg { background: var(--dc-info-bg); border-color: var(--dc-info-line); color: var(--dc-info-ink); }
    .dcp__tag small { font-weight: 400; opacity: .8; }

    /* ── Price breakdown ────────────────────────────────────────────────── */
    .dcp__bill {
      margin-top: .7rem; border: 1px solid var(--p-line); border-radius: var(--p-radius);
      background: var(--p-muted); overflow: hidden;
    }
    .dcp__billline {
      display: flex; justify-content: space-between; align-items: flex-start; gap: .75rem;
      padding: .5rem .75rem; border-bottom: 1px solid var(--p-line);
      font-size: var(--dc-text-meta);
    }
    .dcp__billline--inc { opacity: .7; }
    .dcp__billname { display: flex; flex-direction: column; min-width: 0; font-weight: 600; }
    .dcp__billname small { font-weight: 400; color: var(--p-soft); }
    .dcp__billtests { overflow-wrap: anywhere; }
    .dcp__billamt { flex: 0 0 auto; font-weight: 700; white-space: nowrap; }
    .dcp__billtotal { padding: .5rem .75rem; font-size: var(--dc-text-meta); }
    .dcp__billtotal > div { display: flex; justify-content: space-between; gap: 1rem; padding: .1rem 0; }
    .dcp__save { color: var(--dc-ok-ink); font-weight: 600; }
    .dcp__final {
      margin-top: .25rem; padding-top: .35rem !important; border-top: 1px solid var(--p-line);
      font-size: var(--dc-text-body); font-weight: 700;
    }
    .dcp__saved { margin: .35rem 0 0; color: var(--dc-ok-ink); font-weight: 700; }
    .dcp__notes { list-style: none; margin: .6rem 0 0; padding: 0; display: grid; gap: .3rem; }
    .dcp__notes li {
      padding: .4rem .6rem; border-radius: var(--p-radius); font-size: var(--dc-text-meta);
      background: var(--dc-info-bg); border: 1px solid var(--dc-info-line); color: var(--dc-info-ink);
    }
    .dcp__sumsub--err { color: var(--dc-danger-ink); font-weight: 600; }

    .dcp__buttons { display: flex; gap: .6rem; flex: 0 0 auto; }
    @media (max-width: 34rem) {
      .dcp__buttons { flex: 1 1 100%; }
      .dcp__buttons .dc-btn { flex: 1 1 auto; }
    }
  `]
})
export class DcTestPickerComponent implements OnChanges {
  /** The catalogue as a tree: groups → sub-groups → tests. */
  @Input() groups: DcTestGroup[] = [];

  /** Codes of the tests currently chosen. The caller owns the list. */
  @Input() selectedCodes: string[] = [];

  /** Offers open today (from the API), used only to DISPLAY them; the API prices the booking. */
  @Input() promos: ActivePromotion[] = [];

  /** Whole groups / sub-groups currently chosen. The caller owns the list. */
  @Input() packages: BookingPackageRef[] = [];

  /** The server's price for the current choice. Null until it has answered. */
  @Input() plan: PricingPlan | null = null;

  /** True while a price is being worked out. */
  @Input() quoting = false;

  /**
   * When true the host prices everything on the server, so Done stays disabled until a
   * price has come back. Left false (the preview app), the picker prices tests locally.
   */
  @Input() planRequired = false;

  /** A whole group or sub-group was tapped (to add or remove). */
  @Output() packageToggled = new EventEmitter<BookingPackageRef>();

  /** True while the catalogue is still being fetched. */
  @Input() loading = false;

  @Input() placeholder = 'Search all tests by name or code…';
  @Input() confirmLabel = 'Done — add these tests';
  @Input() cancelLabel = 'Back';

  /** Emitted when a test is added OR removed. */
  @Output() toggled = new EventEmitter<DcPickableTest>();
  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  /**
   * The test row just tapped, whether that added or removed it. Hosts use this
   * to load something about that one test — the sample collection protocol, in
   * both of the screens that embed this picker.
   */
  @Output() focused = new EventEmitter<DcPickableTest>();

  /**
   * Optional region rendered full width between the catalogue and the basket,
   * with the focused test as its implicit context:
   *
   *   <ng-template #dcpProtocol let-test> … </ng-template>
   *
   * Nothing is rendered when the host does not supply it, so the picker stays
   * usable on its own and keeps knowing nothing about protocols or the API.
   */
  @ContentChild('dcpProtocol') protocolSlot?: TemplateRef<{ $implicit: DcPickableTest | null }>;

  query = '';
  openGroupId: string | null = null;
  openSubGroupId: string | null = null;

  /** Last row tapped — drives the slot's context and the row marker. */
  focusedTest: DcPickableTest | null = null;

  private units: SelUnit[] = [];
  private model = new SelectionModel([], [], [], new Set());
  private offerKeys = new Set<string>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['groups']) this.units = buildUnits(this.groups);
    if (changes['promos']) this.offerKeys = new Set(this.promos.map(p => unitKey(p.targetType, p.targetId)));
    // Rebuilt on every input change: it is cheap, and the checkboxes are read from it.
    this.model = new SelectionModel(this.units, this.selectedCodes, this.packages, this.offerKeys);

    // Open the first group and sub-group as soon as the catalogue arrives, so
    // the Tests column shows something instead of "select a group".
    if (changes['groups'] && this.groups.length && !this.openGroupId) {
      this.openGroup(this.groups[0]);
    }
  }

  /**
   * One tap means two things: change the selection, and make this the test the
   * protocol slot describes. Kept as one method so a host can never wire up the
   * selection and forget the focus, which is how the two catalogues drifted
   * apart in the first place.
   */
  pick(test: DcPickableTest): void {
    this.focusedTest = test;
    this.focused.emit(test);
    // A test that is only ticked because its group / sub-group is: unticking it must break the
    // package up rather than add the test a second time.
    if (!this.isSelected(test.code) && this.model.packageCovering(test.code)) {
      this.apply(this.model.planUnselect([test.code]));
      return;
    }
    this.toggled.emit(test);
  }

  /** Carries out a plan from the selection model using the events the host already handles. */
  private apply(ops: SelOp[]): void {
    for (const op of ops) {
      if (op.kind === 'package') this.packageToggled.emit(op.ref);
      else this.toggled.emit(op.test as DcPickableTest);
    }
  }

  // ── Group / sub-group checkboxes ───────────────────────────────────────────

  private unitOf(type: SelectionType, id: string): SelUnit | undefined {
    return this.model.unit(type as 'Group' | 'SubGroup', id);
  }

  checkState(type: SelectionType, id: string): CheckState {
    const unit = this.unitOf(type, id);
    return unit ? this.model.state(unit.tests) : 'none';
  }

  hasEligible(type: SelectionType, id: string): boolean {
    return !!this.unitOf(type, id)?.tests.some(t => t.bookable);
  }

  /** Tick or untick a group / sub-group. Ticked → untick; anything less → tick everything. */
  toggleUnit(type: SelectionType, id: string): void {
    const unit = this.unitOf(type, id);
    if (!unit || !this.hasEligible(type, id)) return;
    this.apply(this.checkState(type, id) === 'all'
      ? this.model.planUnselect(unit.tests.map(t => t.code))
      : this.model.planSelect(unit));
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

  /** Chosen on its own. */
  isSelected(code: string): boolean {
    return this.selectedCodes.indexOf(code) > -1;
  }

  /** Chosen on its own or through a chosen group / sub-group. */
  isCovered(code: string): boolean {
    return this.model.covered(code);
  }

  /** How many tests in this sub-group are already chosen — shown on its row so
   *  the operator can see where their selection came from without re-opening. */
  countChosenIn(sub: DcTestSubGroup): number {
    return sub.tests.filter(test => this.isCovered(test.code)).length;
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

  // ── Whole groups and sub-groups ───────────────────────────────────────────

  get hasAnything(): boolean {
    return this.selected.length > 0 || this.packages.length > 0;
  }

  get canConfirm(): boolean {
    if (!this.hasAnything || this.quoting) return false;
    return this.planRequired ? !!this.plan?.success : this.plan ? this.plan.success : true;
  }

  /**
   * Catalogue price of a group / sub-group: the sum of its tests' prices, which is the rule the
   * API uses for the regular price (see PromotionPricing.cs). Shown beside the name so the price
   * is visible before anything is ticked; an offer, when there is one, is shown under it.
   */
  regularOf(type: SelectionType, id: string): number {
    const unit = this.unitOf(type, id);
    return unit ? unit.tests.reduce((sum, test) => sum + Number(test.price || 0), 0) : 0;
  }

  /** The offer open today for exactly this test, group or sub-group, if any. */
  promoFor(type: SelectionType, id: string): ActivePromotion | undefined {
    return this.promos.find(p => p.targetType === type && p.targetId === id);
  }

  /** Name of the chosen group/sub-group that includes this test, if any. */
  coveredBy(code: string): string {
    return this.model.packageCovering(code)?.name ?? '';
  }

  testNames(line: { tests: { name: string }[] }): string {
    return line.tests.map(t => t.name).join(', ');
  }
}
