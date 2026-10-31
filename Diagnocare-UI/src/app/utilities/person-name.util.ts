/**
 * Formatting for the name of a person as it is typed into a form.
 *
 * Kept as plain functions so the same rule can be applied from three places without
 * drifting: live in the field (CapitalizedNameDirective), once more when a form is
 * submitted, and anywhere else a name is accepted from outside a form.
 *
 * The rule is full normalisation to Title Case: whatever case the name arrives in, it is
 * stored one way. All four of these produce "Vanchhit Kumar":
 *
 *   vanchhit kumar  VANCHHIT KUMAR  vanchhit Kumar  Vanchhit kumar
 *
 * Normalising means lower-casing first, and that is a deliberate trade, not an oversight:
 * it is the only way "VANCHHIT KUMAR" can become "Vanchhit Kumar". The cost is that a
 * capital *inside* a word cannot survive, so "McDonald" is stored as "Mcdonald". Names
 * broken by a separator are unaffected — "D'SOUZA" → "D'Souza", "MARY-JANE" →
 * "Mary-Jane" — because the apostrophe and the hyphen start a new word (see WORD_START).
 * If a McDonald ever has to be stored exactly, that needs a way to opt a field out of
 * this, not a loosening of the rule, or all-caps input stops being normalised.
 */

/** Start of string, or a character that separates one word of a name from the next. */
const WORD_START = /(^|[\s'’\-.])(\p{L})/gu;

/**
 * Lower-cases the whole value, then upper-cases the first letter of each word.
 *
 * Whitespace is preserved rather than trimmed so this is safe to run on every keystroke:
 * trimming mid-typing would swallow the space between "vanchhit" and "kumar".
 *
 * Word starts are matched by what precedes them rather than with `\b`, which in JavaScript
 * is defined in terms of `\w` (ASCII only) even under the `u` flag. `\b\p{L}` therefore
 * treats an accented letter as starting a word and gives "José" → "JosÉ". Spelling the
 * separators out avoids that: a letter is capitalised only after whitespace, an
 * apostrophe, a hyphen or a period, so the "é" in "josé" is left alone.
 *
 * `\p{L}` covers every script, so a Devanagari or Tamil name passes through unchanged —
 * those letters have no case, and `toLowerCase()`/`toUpperCase()` return them as-is.
 */
export function capitalizeWords(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(WORD_START, (_match, prefix: string, letter: string) => prefix + letter.toUpperCase());
}

/**
 * The stored form of a person's name: trimmed and normalised to Title Case.
 *
 * Use this when the value leaves the field for good — on blur and on submit — so what the
 * backend receives matches what the user was shown.
 */
export function formatPersonName(value: string | null | undefined): string {
  return capitalizeWords((value ?? '').trim());
}
