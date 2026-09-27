import { MemberDto } from 'src/app/models/member/member.dto';

/**
 * Parses a date string coming from the Diagnocare API into a local-midnight Date.
 *
 * The API serialises every DateOnly as **dd-MM-yyyy** (see DateOnlyJsonConverter).
 * `new Date('11-09-2026')` reads that as MM-dd-yyyy — 9 November, not 11 September —
 * so a member deactivated on the 11th looked like a *future* deactivation and stayed
 * on the staff list as active and editable. A day above 12 parsed as Invalid Date
 * instead, failing the other way. Hence an explicit parser.
 *
 * Accepts dd-MM-yyyy and ISO yyyy-MM-dd (some endpoints send ISO), and returns null
 * for anything it cannot read, so callers decide rather than inherit a NaN.
 */
export function parseApiDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const text = String(value).trim();

  // ISO first — yyyy-MM-dd, optionally followed by a time part.
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);

  // The API's own format — dd-MM-yyyy (also tolerates dd/MM/yyyy).
  const dmy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(text);
  if (dmy) return new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);

  const fallback = new Date(text);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Core active-check on a raw deactivatedAt string.
 *
 * Rules:
 *  - null / undefined / empty  → active
 *  - future date               → still active (scheduled deactivation)
 *  - today or past date        → inactive
 *  - unparseable               → inactive; a member the API has stamped with
 *                                *something* is safer treated as gone than as editable
 *
 * Use this when the object is NOT a MemberDto — e.g. attendance grid rows
 * (AttendanceRow.deactivatedAt) or salary records (SalaryRecordDTO.deactivatedAt).
 * For a MemberDto prefer isMemberActive, which trusts the API's own `isActive` flag.
 */
export function isActiveByDate(deactivatedAt: string | null | undefined): boolean {
  if (!deactivatedAt) return true;

  const d = parseApiDate(deactivatedAt);
  if (!d) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d > today;
}

/**
 * Returns true when a MemberDto is currently active.
 *
 * The API computes `isActive` server-side, where the value is a real date rather than
 * a string in an ambiguous format — so that is the answer whenever it is present.
 * The date check stays as a fallback for responses predating that field.
 */
export function isMemberActive(member: MemberDto): boolean {
  if (typeof member.isActive === 'boolean') return member.isActive;
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
