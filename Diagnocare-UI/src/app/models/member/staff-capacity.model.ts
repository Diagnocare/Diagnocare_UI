/**
 * Staff head-count vs the ceiling configured on the API (`Staff:MaxStaffCount`).
 * Every role counts, Super Admin included; deactivated members do not.
 */
export interface StaffCapacity {
  used: number;
  max: number;
  remaining: number;
  canAddMore: boolean;
}
