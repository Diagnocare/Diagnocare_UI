import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PricingPlan } from 'src/app/models/promotion/promotion.model';

/**
 * BookingSummaryComponent: "what exactly am I paying for" on the payment step.
 *
 * Shows the groups / sub-groups / tests chosen, how many tests that comes to, the regular
 * price, the promotional discount, any manual discount, and the final amount. Every figure
 * except the manual-discount rupee value comes from the server's quote; the manual figure is
 * the same sum the server repeats on Save (percentage of the price after offers).
 *
 * Presentation only. It never decides a price.
 */
@Component({
  selector: 'dc-booking-summary',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="bks" *ngIf="plan?.success" aria-label="Booking summary">
      <h4 class="bks__title">What you are booking</h4>

      <ul class="bks__lines">
        <li *ngFor="let line of plan!.lines" [class.bks__inc]="line.alreadyIncluded">
          <div class="bks__what">
            <strong>{{ line.name }}</strong>
            <small>{{ line.type === 'Group' ? 'Whole group' : line.type === 'SubGroup' ? 'Sub-group' : 'Single test' }}
              <ng-container *ngIf="line.promotionTitle"> · {{ line.promotionTitle }}</ng-container></small>
            <small class="bks__tests" *ngIf="line.type !== 'Test' && line.tests.length">
              Includes: {{ names(line) }}
            </small>
            <small class="bks__tests" *ngIf="line.alreadyIncluded">Already included above, not charged again</small>
          </div>
          <div class="bks__amt">
            <s *ngIf="line.savings > 0">₹{{ line.regularPrice | number:'1.0-2' }}</s>
            ₹{{ line.chargedPrice | number:'1.0-2' }}
          </div>
        </li>
      </ul>

      <ul class="bks__notes" *ngIf="plan!.notices.length">
        <li *ngFor="let n of plan!.notices"><i class="fa fa-info-circle" aria-hidden="true"></i> {{ n }}</li>
      </ul>

      <dl class="bks__total">
        <div><dt>Total tests</dt><dd>{{ plan!.totalTests }}</dd></div>
        <div><dt>Regular price</dt><dd>₹{{ plan!.regularTotal | number:'1.0-2' }}</dd></div>
        <div class="bks__good" *ngIf="plan!.promotionDiscount > 0">
          <dt>Promotional discount</dt><dd>−₹{{ plan!.promotionDiscount | number:'1.0-2' }}</dd>
        </div>
        <div class="bks__good" *ngIf="manualAmount > 0">
          <dt>Extra discount ({{ discountPercent | number:'1.0-2' }}%)</dt><dd>−₹{{ manualAmount | number:'1.0-2' }}</dd>
        </div>
        <div class="bks__final"><dt>Final amount payable</dt><dd>₹{{ final | number:'1.0-2' }}</dd></div>
        <div class="bks__saved" *ngIf="totalSavings > 0">
          <dt>Total savings</dt><dd>₹{{ totalSavings | number:'1.0-2' }}</dd>
        </div>
      </dl>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .bks {
      margin: 0 0 1rem; padding: .85rem 1rem;
      background: var(--color-surface); color: var(--color-text-primary);
      border: 1px solid var(--color-border); border-radius: var(--radius-md);
    }
    .bks, .bks * { box-sizing: border-box; }
    .bks__title { margin: 0 0 .5rem; font-size: var(--dc-text-body); font-weight: 700; }
    .bks ul { list-style: none; margin: 0; padding: 0; }
    .bks__lines li {
      display: flex; justify-content: space-between; gap: .75rem;
      padding: .45rem 0; border-bottom: 1px solid var(--color-border);
      font-size: var(--dc-text-meta);
    }
    .bks__inc { opacity: .7; }
    .bks__what { display: flex; flex-direction: column; min-width: 0; }
    .bks__what small { color: var(--color-text-secondary); }
    .bks__tests { overflow-wrap: anywhere; }
    .bks__amt { flex: 0 0 auto; font-weight: 700; white-space: nowrap; }
    .bks__amt s { font-weight: 400; color: var(--color-text-secondary); margin-right: .3rem; }
    .bks__notes { display: grid; gap: .3rem; margin-top: .6rem !important; }
    .bks__notes li {
      padding: .4rem .6rem; border-radius: var(--radius-md); font-size: var(--dc-text-meta);
      background: var(--dc-info-bg); border: 1px solid var(--dc-info-line); color: var(--dc-info-ink);
    }
    .bks__total { margin: .6rem 0 0; font-size: var(--dc-text-meta); }
    .bks__total > div { display: flex; justify-content: space-between; gap: 1rem; padding: .15rem 0; }
    .bks__total dt, .bks__total dd { margin: 0; }
    .bks__good { color: var(--dc-ok-ink); font-weight: 600; }
    .bks__final {
      margin-top: .3rem; padding-top: .4rem !important; border-top: 2px solid var(--color-border);
      font-size: var(--dc-text-body); font-weight: 700;
    }
    .bks__saved { color: var(--dc-ok-ink); font-weight: 700; }
  `],
})
export class BookingSummaryComponent {
  /** The server's quote for the booking. Nothing renders until it succeeded. */
  @Input() plan: PricingPlan | null = null;

  /** Manual discount % entered on the payment step (applied after offers). */
  @Input() discountPercent = 0;

  /** Rupees the manual discount takes off the price after offers. */
  get manualAmount(): number {
    if (!this.plan?.success) return 0;
    const pct = Math.max(0, Number(this.discountPercent) || 0);
    return Math.round(this.plan.payableAfterPromotion * pct) / 100;
  }

  get final(): number {
    return this.plan?.success ? Math.round((this.plan.payableAfterPromotion - this.manualAmount) * 100) / 100 : 0;
  }

  get totalSavings(): number {
    return this.plan?.success ? Math.round((this.plan.promotionDiscount + this.manualAmount) * 100) / 100 : 0;
  }

  names(line: { tests: { name: string }[] }): string {
    return line.tests.map(t => t.name).join(', ');
  }
}
