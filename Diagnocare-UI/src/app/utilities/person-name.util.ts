/**
 * Formatting for the name of a person as it is typed into a form.
 *
 * Kept as plain functions so the same rule can be applied from three places without
 * drifting: live in the field (CapitalizedNameDirective), once more when a form is
 * submitted, and anywhere else a name is accepted from outside a form.
 *
 * The rule is deliberately the narrow one the product asked for — capitalise the first
 * letter of the field and leave everything after it exactly as typed. Title-casing every
 * word is NOT done: "D'Souza", "van der Berg" and "McDonald" are all names a lab has to
 * record the way the patient spells them, and a per-word rule mangles each of them.
 */

/**
 * Upper-cases the first letter that is actually a letter, leaving the rest of the string —
 * including any surrounding whitespace — untouched.
 *
 * Whitespace is preserved rather than trimmed so this is safe to run on every keystroke:
 * trimming mid-typing would swallow the space between "john" and "smith".
 */
export function capitalizeWords(value: string | null | undefined): string {
  const raw = value ?? '';

  return raw
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * The stored form of a person's name: trimmed, with the first letter capitalised.
 *
 * Use this when the value leaves the field for good — on blur and on submit — so what the
 * backend receives matches what the user was shown.
 */
export function formatPersonName(value: string | null | undefined): string {
  return capitalizeWords((value ?? '').trim());
}
