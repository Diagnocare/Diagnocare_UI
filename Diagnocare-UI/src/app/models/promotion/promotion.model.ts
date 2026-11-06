/** Mirrors the API's promotional-pricing DTOs. Nothing here is priced by the browser. */

export type SelectionType = 'Test' | 'SubGroup' | 'Group';

/** One thing the user picked. */
export interface BookingSelection {
  type: SelectionType;
  id: string;
}

/** A picked group/sub-group, with its name for display. */
export interface BookingPackageRef extends BookingSelection {
  type: 'SubGroup' | 'Group';
  name: string;
}

export interface PricedTest {
  code: string;
  name: string;
  price: number;
}

export interface PricingLine {
  type: SelectionType;
  id: string;
  name: string;
  /** Tests this row is charged for (empty when all are already covered elsewhere). */
  tests: PricedTest[];
  regularPrice: number;
  chargedPrice: number;
  savings: number;
  promotionId?: number | null;
  promotionTitle?: string | null;
  alreadyIncluded: boolean;
}

/** The server's answer to "what does this selection cost, and why". */
export interface PricingPlan {
  success: boolean;
  error?: string | null;
  lines: PricingLine[];
  /** Every test that will be booked, once each. */
  tests: PricedTest[];
  totalTests: number;
  regularTotal: number;
  promotionDiscount: number;
  payableAfterPromotion: number;
  notices: string[];
}

/** An offer open for booking today, prices already worked out by the server. */
export interface ActivePromotion {
  promotionId: number;
  title: string;
  targetType: SelectionType;
  targetId: string;
  regularPrice: number;
  promoPrice: number;
  savings: number;
  endDate: string;
  terms?: string | null;
}

/** Admin view of an offer. */
export interface PromotionRow {
  promotionId: number;
  title: string;
  targetType: SelectionType;
  targetId: string;
  targetName: string;
  fixedPrice?: number | null;
  percentOff?: number | null;
  startDate: string;
  endDate: string;
  isActive: boolean;
  terms?: string | null;
  regularPrice: number;
  promoPrice?: number | null;
  liveNow: boolean;
}

export interface PromotionSave {
  title: string;
  targetType: SelectionType;
  targetId: string;
  fixedPrice?: number | null;
  percentOff?: number | null;
  startDate: string;
  endDate: string;
  isActive: boolean;
  terms?: string | null;
}
