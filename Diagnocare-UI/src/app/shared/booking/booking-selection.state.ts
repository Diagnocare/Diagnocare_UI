import { Subscription } from 'rxjs';
import { PromotionService } from 'src/app/services/promotionServices/promotion.service';
import {
  ActivePromotion, BookingPackageRef, BookingSelection, PricingPlan,
} from 'src/app/models/promotion/promotion.model';

/**
 * What the booking screens remember about WHOLE groups and sub-groups, and the server's
 * price for the current choice.
 *
 * Both booking screens (Add Patient, Add New Test) hold a list of individual tests of their
 * own. This class holds the rest — the chosen groups/sub-groups, the offers on show, and the
 * latest quote — so the two screens share one implementation instead of two copies that
 * drift. It prices nothing itself: every figure in `plan` came from POST api/Promotion/Quote,
 * and the API repeats the same sum when the booking is saved.
 *
 * Overlaps are not resolved here. "Group + one of its tests" is sent as is, the server
 * charges the test once, and `plan.notices` says so in words — nothing is silently dropped.
 */
export class BookingSelectionState {
  /** Whole groups / sub-groups the user has chosen, in the order they chose them. */
  packages: BookingPackageRef[] = [];

  /** Offers open today, for display. Loaded once. */
  promos: ActivePromotion[] = [];

  /** The server's latest answer. Null until the first one, or when nothing is chosen. */
  plan: PricingPlan | null = null;

  /** True while a quote is in flight. */
  quoting = false;

  /** Set when the last quote failed; the screen blocks Done rather than guess a price. */
  error: string | null = null;

  private seq = 0;
  private quoteSub?: Subscription;
  private promoSub?: Subscription;

  constructor(private readonly api: PromotionService, private readonly changed: () => void = () => {}) {}

  /**
   * Loads the offers open today. Called each time the picker opens, so an offer that started
   * or ended since the screen was last used is shown correctly. Failing is harmless: no
   * badges, and the quote still prices correctly.
   */
  loadPromos(): void {
    this.promoSub?.unsubscribe();
    this.promoSub = this.api.getActive().subscribe({
      next: list => { this.promos = list ?? []; this.changed(); },
      error: () => { this.promos = []; this.changed(); },
    });
  }

  isPackageSelected(type: string, id: string): boolean {
    return this.packages.some(p => p.type === type && p.id === id);
  }

  /** Adds the package, or removes it if already chosen. Returns true when it was added. */
  togglePackage(ref: BookingPackageRef): boolean {
    if (this.isPackageSelected(ref.type, ref.id)) {
      this.packages = this.packages.filter(p => !(p.type === ref.type && p.id === ref.id));
      return false;
    }
    this.packages = [...this.packages, ref];
    return true;
  }

  /** Everything chosen, as the API wants it. */
  selections(testCodes: string[]): BookingSelection[] {
    return [
      ...this.packages.map(p => ({ type: p.type, id: p.id } as BookingSelection)),
      ...testCodes.map(code => ({ type: 'Test', id: code } as BookingSelection)),
    ];
  }

  /** Codes of every test the server will book, once each. Empty until a quote has arrived. */
  get bookedCodes(): string[] {
    return this.plan?.success ? this.plan.tests.map(t => t.code) : [];
  }

  /** True when there is a good price for the current choice. */
  get ready(): boolean {
    return !this.quoting && !!this.plan?.success;
  }

  get hasPackages(): boolean {
    return this.packages.length > 0;
  }

  /** Asks the server for the price of the current choice. Latest call wins. */
  refresh(testCodes: string[]): void {
    const selections = this.selections(testCodes);
    this.quoteSub?.unsubscribe();
    const seq = ++this.seq;

    if (selections.length === 0) {
      this.plan = null;
      this.quoting = false;
      this.error = null;
      this.changed();
      return;
    }

    this.quoting = true;
    this.error = null;
    this.quoteSub = this.api.quote(selections).subscribe({
      next: plan => {
        if (seq !== this.seq) return;
        this.plan = plan;
        this.quoting = false;
        this.error = plan.success ? null : (plan.error ?? 'The price could not be worked out.');
        this.changed();
      },
      error: err => {
        if (seq !== this.seq) return;
        // The API answers 400 with the plan itself when a selection is invalid.
        const body = err?.error;
        this.plan = body && typeof body === 'object' && 'success' in body ? (body as PricingPlan) : null;
        this.quoting = false;
        this.error = this.plan?.error ?? 'The price could not be worked out. Please try again.';
        this.changed();
      },
    });
  }

  /** Forget everything (after a booking, or when the form is reset). */
  clear(): void {
    this.quoteSub?.unsubscribe();
    this.seq++;
    this.packages = [];
    this.plan = null;
    this.quoting = false;
    this.error = null;
  }

  destroy(): void {
    this.quoteSub?.unsubscribe();
    this.promoSub?.unsubscribe();
  }
}
