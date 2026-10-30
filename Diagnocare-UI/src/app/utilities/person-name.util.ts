/**
 * Formatting for the name of a person as it is typed into a form.
 *
 * Kept as plain functions so the same rule can be applied from three places without
 * drifting: live in the field (CapitalizedNameDirective), once more when a form is
 * submitted, and anywhere else a name is accepted from outside a form.
 *
 * The rule has two halves, and the second half is the one that is easy to lose:
 *
 *   1. The first letter of every word is upper-cased — "john smith" → "John Smith".
 *   2. Nothing is ever lower-cased.
 *
 * Half 2 is why there is no `.toLowerCase()` here. The obvious one-liner for title case
 * is `value.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())`, and it is wrong for a
 * lab's patient register: it rewrites "McDonald" to "Mcdonald" and "D'Souza" to
 * "D'souza", and it flattens a name a previous user deliberately stored in capitals.
 * Because this also runs on every keystroke, lower-casing makes an inner capital
 * literally untypeable — the character is undone as fast as it is entered.
 *
 * A name has to be recorded the way the patient spells it, so case the user supplied is
 * always left alone; this only ever adds a capital the user did not type.
 */

/** Start of string, or a character that separates one word of a name from the next. */
const WORD_START = /(^|[\s'’\-.])(\p{L})/gu;

/**
 * Upper-cases the first letter of each word, leaving every other character — including
 * all surrounding whitespace and any capitals the user typed — exactly as it was.
 *
 * Whitespace is preserved rather than trimmed so this is safe to run on every keystroke:
 * trimming mid-typing would swallow the space between "john" and "smith".
 *
 * Word starts are matched by what precedes them rather than with `\b`, which in JavaScript
 * is defined in terms of `\w` (ASCII only) even under the `u` flag. `\b\p{L}` therefore
 * treats an accented letter as starting a word and gives "José" → "JosÉ". Spelling the
 * separators out avoids that: a letter is capitalised only after whitespace, an
 * apostrophe, a hyphen or a period, so "d'souza" → "D'Souza" and "mary-jane" →
 * "Mary-Jane", while the "é" in "josé" is left alone.
 *
 * `\p{L}` covers every script, so a Devanagari or Tamil name passes through unchanged —
 * those letters have no upper case, and `toUpperCase()` returns them as-is.
 */
export function capitalizeWords(value: string | null | undefined): string {
  return (value ?? '').replace(
    WORD_START,
    (_match, prefix: string, letter: string) => prefix + letter.toUpperCase(),
  );
}

/**
 * The stored form of a person's name: trimmed, with each word capitalised.
 *
 * Use this when the value leaves the field for good — on blur and on submit — so what the
 * backend receives matches what the user was shown.
 */
export function formatPersonName(value: string | null | undefined): string {
  return capitalizeWords((value ?? '').trim());
}
