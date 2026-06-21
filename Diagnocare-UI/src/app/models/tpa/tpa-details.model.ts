export interface TpaDetails {
  tpaName: string;
  tpaPolicyNumber: string;
  tpaClaimNumber: string;
  tpaApprovalCode: string;
  tpaPolicyValidFrom: string;
  tpaPolicyValidTo: string;
  /** "Pending" | "Approved" | "Settled" — tracks TPA claim lifecycle */
  tpaPaymentStatus?: string;
  /** Date TPA transferred the payment (Settled state) */
  tpaSettledDate?: string;
}
