import { MemberDto } from 'src/app/models/member/member.dto';

/**
 * Core active-check on a raw deactivatedAt string.
 *
 * Rules:
 *  - null / undefined / empty  → active
 *  - future date               → still active (scheduled deactivation)
 *  - today or past date        → inactive
 *
 * Use this when the object is NOT a MemberDto — e.g. attendance grid rows
 * (AttendanceRow.deactivatedAt) or salary records (SalaryRecordDTO.deactivatedAt).
 */
export function isActiveByDate(deactivatedAt: string | null | undefined): boolean {
  if (!deactivatedAt) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(deactivatedAt);
  d.setHours(0, 0, 0, 0);
  return d > today;
}

/**
 * Returns true when a MemberDto is currently active.
 * Delegates to isActiveByDate for a single source of truth.
 */
export function isMemberActive(member: MemberDto): boolean {
  return isActiveByDate(member.deactivatedAt);
}

/** Returns only currently active members. */
export function filterActiveMembers(members: MemberDto[]): MemberDto[] {
  return members.filter(isMemberActive);
}

/** Returns only currently inactive (deactivated) members. */
export function filterInactiveMembers(members: MemberDto[]): MemberDto[] {
  return members.filter(m => !isMemberActive(m));
}
