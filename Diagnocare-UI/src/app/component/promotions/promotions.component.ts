import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { PromotionRow, PromotionSave, SelectionType } from 'src/app/models/promotion/promotion.model';
import { PathTestService } from 'src/app/services/pathTestServices/path-test-service';
import { PromotionService } from 'src/app/services/promotionServices/promotion.service';
import { TargetOption } from '../../models/promotion/promotion-target.model';

/**
 * Offers: promotional prices for a test, a sub-group or a whole group.
 *
 * The regular price is never typed here. It is always the sum of the tests inside, so an offer
 * cannot drift from the catalogue. An offer is either a fixed price for the whole item or a
 * percentage off, within a date range, and can be switched off without deleting it.
 * Bookings already made keep the price they were made at; changing or deleting an offer only
 * affects bookings made afterwards. The API enforces every rule on this form; the checks here
 * are only so the person sees a problem before pressing Save.
 */
@Component({
  selector: 'app-promotions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-container">
      <div class="page-header">
        <div class="header-left">
          <h1>Offers</h1>
          <p class="subtitle">
            Special prices for a test, a sub-group or a whole group. Staff see them when they book,
            and the price is always checked again when the booking is saved.
            Bookings already made keep the price they were made at.
          </p>
        </div>
        <div class="header-actions">
          <button class="btn-light" type="button" (click)="startNew()"><i class="fa fa-plus"></i> New offer</button>
        </div>
      </div>

      <div class="content-container">
        <!-- ── Form ───────────────────────────────────────────────────── -->
        <form class="promo-form" *ngIf="editing" (ngSubmit)="save()" #f="ngForm" novalidate>
          <h2 class="promo-h">{{ editing.id ? 'Change offer' : 'New offer' }}</h2>

          <div class="promo-grid">
            <label class="promo-field promo-wide">
              <span>Offer name</span>
              <input class="form-control" name="title" [(ngModel)]="form.title" maxlength="200" required
                     placeholder="e.g. Monsoon health check">
            </label>

            <label class="promo-field">
              <span>This offer is for</span>
              <select class="form-control" name="type" [ngModel]="form.targetType" (ngModelChange)="onTypeChange($event)">
                <option value="Group">A whole group</option>
                <option value="SubGroup">A sub-group</option>
                <option value="Test">A single test</option>
              </select>
            </label>

            <label class="promo-field promo-wide">
              <span>{{ form.targetType === 'Group' ? 'Group' : form.targetType === 'SubGroup' ? 'Sub-group' : 'Test' }}</span>
              <select class="form-control" name="target" [(ngModel)]="form.targetId" required>
                <option value="" disabled>{{ loadingTargets ? 'Loading…' : 'Choose…' }}</option>
                <option *ngFor="let o of targets" [value]="o.id">{{ o.label }}</option>
              </select>
            </label>

            <fieldset class="promo-field promo-wide promo-mode">
              <legend>How is the price set?</legend>
              <label><input type="radio" name="mode" value="fixed" [(ngModel)]="mode"> Fixed offer price</label>
              <label><input type="radio" name="mode" value="percent" [(ngModel)]="mode"> Percentage off</label>
            </fieldset>

            <label class="promo-field" *ngIf="mode === 'fixed'">
              <span>Offer price (₹) for the whole item</span>
              <input class="form-control" type="number" min="1" step="0.01" name="fixed" [(ngModel)]="form.fixedPrice" required>
            </label>
            <label class="promo-field" *ngIf="mode === 'percent'">
              <span>Percentage off (%)</span>
              <input class="form-control" type="number" min="0.01" max="99.99" step="0.01" name="pct" [(ngModel)]="form.percentOff" required>
            </label>

            <label class="promo-field">
              <span>Starts on</span>
              <input class="form-control" type="date" name="start" [(ngModel)]="form.startDate" required>
            </label>
            <label class="promo-field">
              <span>Ends on (this day included)</span>
              <input class="form-control" type="date" name="end" [(ngModel)]="form.endDate" required>
            </label>

            <label class="promo-field promo-wide">
              <span>Terms shown to staff (optional)</span>
              <input class="form-control" name="terms" [(ngModel)]="form.terms" maxlength="500">
            </label>

            <label class="promo-field promo-check">
              <input type="checkbox" name="active" [(ngModel)]="form.isActive"> Switched on
            </label>
          </div>

          <p class="promo-error" *ngIf="error"><i class="fa fa-exclamation-triangle"></i> {{ error }}</p>

          <div class="promo-actions">
            <button type="button" class="btn-light" (click)="cancel()" [disabled]="saving">Cancel</button>
            <button type="submit" class="btn-primary" [disabled]="saving">
              <i class="fa" [ngClass]="saving ? 'fa-spinner fa-spin' : 'fa-check'"></i> Save offer
            </button>
          </div>
        </form>

        <!-- ── List ───────────────────────────────────────────────────── -->
        <p class="promo-empty" *ngIf="!loading && rows.length === 0 && !editing">
          No offers yet. Use “New offer” to add one.
        </p>

        <div class="promo-table-wrap" *ngIf="rows.length">
          <table class="promo-table">
            <thead>
              <tr>
                <th>Offer</th><th>For</th><th class="num">Regular</th><th class="num">Offer price</th>
                <th>Dates</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let r of rows; trackBy: trackById">
                <td data-label="Offer"><strong>{{ r.title }}</strong><small *ngIf="r.terms"><br>{{ r.terms }}</small></td>
                <td data-label="For">{{ r.targetName }}<small><br>{{ label(r.targetType) }}</small></td>
                <td class="num" data-label="Regular">₹{{ r.regularPrice | number:'1.0-2' }}</td>
                <td class="num" data-label="Offer price">
                  <ng-container *ngIf="r.promoPrice != null; else noSaving">₹{{ r.promoPrice | number:'1.0-2' }}
                    <small *ngIf="r.percentOff"><br>{{ r.percentOff }}% off</small></ng-container>
                  <ng-template #noSaving><span class="promo-warn" title="The regular price is now at or below the offer price, so the offer does nothing">No saving</span></ng-template>
                </td>
                <td data-label="Dates">{{ r.startDate | date:'d MMM y' }} – {{ r.endDate | date:'d MMM y' }}</td>
                <td data-label="Status">
                  <span class="promo-pill" [class.on]="r.liveNow" [class.off]="!r.liveNow">
                    {{ status(r) }}
                  </span>
                </td>
                <td class="promo-row-actions">
                  <button type="button" class="link-btn" (click)="edit(r)">Change</button>
                  <button type="button" class="link-btn" (click)="toggle(r)">{{ r.isActive ? 'Switch off' : 'Switch on' }}</button>
                  <button type="button" class="link-btn promo-del" (click)="remove(r)">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .promo-form, .promo-table-wrap {
      background: var(--color-surface); color: var(--color-text-primary);
      border: 1px solid var(--color-border); border-radius: var(--radius-md);
      padding: 1rem 1.25rem; margin-bottom: 1.25rem;
    }
    .promo-h { margin: 0 0 .75rem; font-size: 1.05rem; }
    .promo-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: .85rem 1rem; }
    .promo-field { display: flex; flex-direction: column; gap: .25rem; font-size: var(--dc-text-meta); font-weight: 600; margin: 0; }
    .promo-wide { grid-column: 1 / -1; }
    .promo-mode { border: 0; padding: 0; display: flex; flex-direction: row; gap: 1.25rem; flex-wrap: wrap; }
    .promo-mode legend { font-size: var(--dc-text-meta); font-weight: 600; width: 100%; margin-bottom: .25rem; }
    .promo-mode label { font-weight: 400; display: inline-flex; gap: .4rem; align-items: center; }
    .promo-check { flex-direction: row; align-items: center; gap: .5rem; }
    .promo-error { margin: .75rem 0 0; color: var(--dc-danger-ink); font-weight: 600; }
    .promo-actions { display: flex; justify-content: flex-end; gap: .6rem; margin-top: 1rem; }
    .promo-empty { color: var(--color-text-secondary); }
    .promo-table-wrap { overflow-x: auto; padding: 0; }
    .promo-table { width: 100%; border-collapse: collapse; font-size: var(--dc-text-meta); }
    .promo-table th, .promo-table td { padding: .6rem .8rem; text-align: left; border-bottom: 1px solid var(--color-border); vertical-align: top; }
    .promo-table th { background: var(--color-surface-sunken); font-size: var(--dc-text-micro); text-transform: uppercase; letter-spacing: .04em; color: var(--color-text-secondary); }
    .promo-table .num { text-align: right; white-space: nowrap; }
    .promo-table small { color: var(--color-text-secondary); }
    .promo-pill { display: inline-block; padding: .1rem .55rem; border-radius: 999px; font-weight: 700; font-size: var(--dc-text-micro); }
    .promo-pill.on  { background: var(--dc-ok-bg); color: var(--dc-ok-ink); border: 1px solid var(--dc-ok-line); }
    .promo-pill.off { background: var(--color-surface-sunken); color: var(--color-text-secondary); border: 1px solid var(--color-border); }
    .promo-warn { color: var(--dc-danger-ink); font-weight: 600; }
    .promo-row-actions { white-space: nowrap; }
    .promo-row-actions .link-btn { margin-right: .6rem; }
    .promo-del { color: var(--dc-danger-ink); }
    /* Phone: each row becomes a labelled card instead of a sideways-scrolling table. */
    @media (max-width: 40rem) {
      .promo-table thead { display: none; }
      .promo-table tr { display: block; padding: .6rem .8rem; border-bottom: 1px solid var(--color-border); }
      .promo-table td { display: flex; justify-content: space-between; gap: 1rem; border: 0; padding: .2rem 0; text-align: right; }
      .promo-table td::before { content: attr(data-label); font-weight: 600; color: var(--color-text-secondary); text-align: left; }
      .promo-table td.promo-row-actions { justify-content: flex-start; }
      .promo-table td.promo-row-actions::before { content: none; }
    }
  `],
})
export class PromotionsComponent implements OnInit {
  rows: PromotionRow[] = [];
  loading = false;
  saving = false;
  error = '';

  /** Today as yyyy-MM-dd, for the "not started / ended" label. */
  today = this.iso(new Date());

  /** The row being changed (id set) or a new one (id null). Null = form closed. */
  editing: { id: number | null } | null = null;
  mode: 'fixed' | 'percent' = 'fixed';
  form = this.blank();

  targets: TargetOption[] = [];
  loadingTargets = false;

  private groups: TargetOption[] = [];
  private subGroups: TargetOption[] | null = null;
  private tests: TargetOption[] | null = null;

  constructor(
    private api: PromotionService,
    private catalogue: PathTestService,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.reload();
    this.loadTargets('Group');
  }

  trackById = (_: number, r: PromotionRow) => r.promotionId;

  /** Plain-language state of an offer, for the list. */
  status(r: PromotionRow): string {
    if (r.liveNow) return 'Live now';
    if (!r.isActive) return 'Switched off';
    return r.startDate.substring(0, 10) > this.today ? 'Not started' : 'Ended';
  }
  label(type: SelectionType): string { return type === 'Group' ? 'Whole group' : type === 'SubGroup' ? 'Sub-group' : 'Single test'; }

  reload(): void {
    this.loading = true;
    this.api.getAll().subscribe({
      next: rows => { this.rows = rows ?? []; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  startNew(): void {
    this.editing = { id: null };
    this.form = this.blank();
    this.mode = 'fixed';
    this.error = '';
    this.loadTargets('Group');
  }

  edit(r: PromotionRow): void {
    this.editing = { id: r.promotionId };
    this.mode = r.percentOff != null ? 'percent' : 'fixed';
    this.form = {
      title: r.title, targetType: r.targetType, targetId: r.targetId,
      fixedPrice: r.fixedPrice ?? null, percentOff: r.percentOff ?? null,
      startDate: r.startDate.substring(0, 10), endDate: r.endDate.substring(0, 10),
      isActive: r.isActive, terms: r.terms ?? '',
    };
    this.error = '';
    this.loadTargets(r.targetType);
  }

  cancel(): void { this.editing = null; this.error = ''; }

  onTypeChange(type: SelectionType): void {
    this.form.targetType = type;
    this.form.targetId = '';
    this.loadTargets(type);
  }

  save(): void {
    this.error = this.validate();
    if (this.error || !this.editing) return;

    const body: PromotionSave = {
      title: this.form.title.trim(),
      targetType: this.form.targetType,
      targetId: this.form.targetId,
      fixedPrice: this.mode === 'fixed' ? Number(this.form.fixedPrice) : null,
      percentOff: this.mode === 'percent' ? Number(this.form.percentOff) : null,
      startDate: this.form.startDate,
      endDate: this.form.endDate,
      isActive: this.form.isActive,
      terms: this.form.terms?.trim() || null,
    };

    this.saving = true;
    const call = this.editing.id == null ? this.api.create(body) : this.api.update(this.editing.id, body);
    call.subscribe({
      next: () => {
        this.saving = false;
        this.editing = null;
        this.toastr.success('Offer saved.');
        this.reload();
      },
      // The API's reason (overlapping dates, price not below regular…) is shown in the form.
      error: err => {
        this.saving = false;
        this.error = err?.error?.message ?? err?.error?.title ?? 'The offer could not be saved.';
      },
    });
  }

  toggle(r: PromotionRow): void {
    this.api.update(r.promotionId, {
      title: r.title, targetType: r.targetType, targetId: r.targetId,
      fixedPrice: r.fixedPrice ?? null, percentOff: r.percentOff ?? null,
      startDate: r.startDate, endDate: r.endDate, isActive: !r.isActive, terms: r.terms ?? null,
    }).subscribe({ next: () => this.reload() });
  }

  remove(r: PromotionRow): void {
    if (!confirm(`Delete the offer "${r.title}"? Bookings already made keep their price.`)) return;
    this.api.remove(r.promotionId).subscribe({ next: () => { this.toastr.success('Offer deleted.'); this.reload(); } });
  }

  private validate(): string {
    const f = this.form;
    if (!f.title.trim()) return 'Give the offer a name.';
    if (!f.targetId) return 'Choose what the offer is for.';
    if (this.mode === 'fixed' && !(Number(f.fixedPrice) > 0)) return 'Enter the offer price.';
    if (this.mode === 'percent' && !(Number(f.percentOff) > 0 && Number(f.percentOff) < 100)) return 'Percentage off must be between 0 and 100.';
    if (!f.startDate || !f.endDate) return 'Choose the start and end dates.';
    if (f.endDate < f.startDate) return 'The end date cannot be before the start date.';
    return '';
  }

  // ── Targets (loaded from the existing catalogue endpoints, once per kind) ──

  private loadTargets(type: SelectionType): void {
    if (type === 'Group') {
      if (this.groups.length) { this.targets = this.groups; return; }
      this.loadingTargets = true;
      this.catalogue.getTestGroupList().pipe(catchError(() => of([] as any[]))).subscribe(gs => {
        this.groups = (gs ?? []).map((g: any) => ({ id: g.testGroupId, label: g.name }));
        this.targets = this.groups;
        this.loadingTargets = false;
      });
      return;
    }

    const cached = type === 'SubGroup' ? this.subGroups : this.tests;
    if (cached) { this.targets = cached; return; }

    this.loadingTargets = true;
    this.catalogue.getTestGroupList().pipe(
      catchError(() => of([] as any[])),
      switchMap((gs: any[]) => forkJoin((gs ?? []).map((g: any) =>
        this.catalogue.getTestSubGroupList(g.testGroupId).pipe(
          catchError(() => of([] as any[])),
          map((subs: any[]) => (subs ?? []).map(s => ({ group: g.name, sub: s }))),
        ))).pipe(map(parts => ([] as { group: string; sub: any }[]).concat(...parts)))),
      switchMap(pairs => {
        if (type === 'SubGroup') {
          return of(pairs.map(p => ({ id: p.sub.testGroupId, label: `${p.group} › ${p.sub.name}` })));
        }
        if (!pairs.length) return of([] as TargetOption[]);
        return forkJoin(pairs.map(p =>
          this.catalogue.getMedicalTestList(p.sub.testGroupId).pipe(
            catchError(() => of([] as any[])),
            map((ts: any[]) => (ts ?? []).map(t => ({ id: t.testCode, label: `${t.testName} (${p.group} › ${p.sub.name})` }))),
          ))).pipe(map(parts => ([] as TargetOption[]).concat(...parts)));
      }),
    ).subscribe(options => {
      if (type === 'SubGroup') this.subGroups = options; else this.tests = options;
      if (this.form.targetType === type) this.targets = options;
      this.loadingTargets = false;
    });
  }

  private blank() {
    return {
      title: '', targetType: 'Group' as SelectionType, targetId: '',
      fixedPrice: null as number | null, percentOff: null as number | null,
      startDate: this.iso(new Date()), endDate: this.iso(new Date(Date.now() + 30 * 86400000)),
      isActive: true, terms: '',
    };
  }

  private iso(d: Date): string {
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }
}
