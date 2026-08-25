/**
 * Staff head-count against the ceiling configured on the API
 * (`Staff:MaxStaffCount` in appsettings — never hard-coded in this app).
 *
 * Returned by `GET api/User/Capacity`. Every role counts towards `used`,
 * Super Admin included; deactivated members do not.
 *
 * Use it to inform the UI (badge, disabled Add buttons). It is NOT the
 * enforcement point — the API re-checks the limit on every create.
 */
export interface StaffCapacityDto {
  /** Active staff accounts right now. */
  used: number;
  /** Maximum the lab is allowed. */
  max: number;
  /** Slots still free. Never negative. */
  remaining: number;
  /** True while at least one more staff member may be created. */
  canAddMore: boolean;
}
