/**
 * WhatsApp chat number for a stored contact, in international form without "+"
 * (e.g. "919876543210"), or null when there is no usable number.
 *
 * - A bare 10-digit number is treated as an Indian mobile ("91" is added).
 * - "91" + 10 digits is accepted as-is.
 * - A number written with "+" or "00" is international: 11–15 digits.
 * Separators (spaces, dashes, brackets) are ignored, so "+91-9876543210" works.
 *
 * The API applies the same rule (Helpers/WhatsAppNumber.cs) when a booking asks
 * for its report on WhatsApp — keep the two in step.
 */
export function toWhatsAppNumber(contact: string | null | undefined): string | null {
  const raw = (contact ?? '').toString().trim();
  if (!raw) return null;
  const hasCountryCode = raw.startsWith('+') || raw.startsWith('00');
  let digits = raw.replace(/\D/g, '');
  if (raw.startsWith('00')) digits = digits.slice(2);
  if (!hasCountryCode) {
    digits = digits.replace(/^0+/, '');
    if (digits.length === 10) return '91' + digits;
    if (digits.length === 12 && digits.startsWith('91')) return digits;
    return null;
  }
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

/** True when the contact can receive a report on WhatsApp. */
export function isWhatsAppNumber(contact: string | null | undefined): boolean {
  return toWhatsAppNumber(contact) !== null;
}
