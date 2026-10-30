import { capitalizeWords, formatPersonName } from 'src/app/utilities/person-name.util';

/**
 * The patient name is capitalised in two passes — live on every keystroke, then once
 * more on blur/submit — so both passes are pinned here.
 *
 * The rule is: capitalise the first letter of each word, and never lower-case anything.
 * Most of these cases exist to guard the second half. A plain
 * `toLowerCase().replace(/\b\w/g, ...)` passes the three headline cases and still
 * corrupts the register, so the headline cases alone are not enough to protect this.
 */
describe('capitalizeWords (runs on every keystroke)', () => {
  it('capitalises the first letter of each word', () => {
    expect(capitalizeWords('john smith')).toBe('John Smith');
  });

  it('keeps whitespace, so a space can still be typed mid-name', () => {
    expect(capitalizeWords('john ')).toBe('John ');
    expect(capitalizeWords(' ')).toBe(' ');
  });

  it('never lower-cases, so an inner capital survives being typed', () => {
    // Typing "McDonald" goes M → Mc → McD …; a lower-casing rule undoes the D here.
    expect(capitalizeWords('McD')).toBe('McD');
    expect(capitalizeWords('john McD')).toBe('John McD');
    expect(capitalizeWords('RAHUL KUMAR')).toBe('RAHUL KUMAR');
  });

  it('does not change length, which is what lets the caret be restored', () => {
    const typed = 'john smith';
    expect(capitalizeWords(typed).length).toBe(typed.length);
  });
});

describe('formatPersonName (blur and submit)', () => {
  it.each([
    ['john smith',  'John Smith'],
    ['rahul kumar', 'Rahul Kumar'],
    ['mary joseph', 'Mary Joseph'],
    ['john',        'John'],
    ['doe',         'Doe'],
  ])('capitalises %s → %s', (input, expected) => {
    expect(formatPersonName(input)).toBe(expected);
  });

  it('trims leading and trailing whitespace', () => {
    expect(formatPersonName('  john smith  ')).toBe('John Smith');
  });

  it('leaves an already-formatted name alone (idempotent)', () => {
    const once = formatPersonName('john smith');
    expect(formatPersonName(once)).toBe(once);
  });

  it('preserves inner capitals the patient spelled themselves', () => {
    expect(formatPersonName('McDonald')).toBe('McDonald');
    expect(formatPersonName("D'Souza")).toBe("D'Souza");
  });

  it('capitalises every word of a multi-word surname', () => {
    expect(formatPersonName('van der berg')).toBe('Van Der Berg');
    expect(formatPersonName('van der Berg')).toBe('Van Der Berg');
  });

  it('capitalises after an apostrophe or a hyphen', () => {
    expect(formatPersonName("d'souza")).toBe("D'Souza");
    expect(formatPersonName('mary-jane')).toBe('Mary-Jane');
    expect(formatPersonName('o’brien')).toBe('O’Brien');
  });

  it('does not treat an accented letter as the start of a word', () => {
    // Regression guard: /\b\p{L}/gu gives "JosÉ MarÍa", because JavaScript's \b is
    // defined on ASCII \w even under the u flag.
    expect(formatPersonName('josé maría')).toBe('José María');
  });

  it('capitalises nothing in a script that has no case', () => {
    expect(formatPersonName('राहुल कुमार')).toBe('राहुल कुमार');
  });

  it.each([
    ['', ''],
    ['   ', ''],
    [null, ''],
    [undefined, ''],
  ])('returns an empty string for %p', (input, expected) => {
    expect(formatPersonName(input as string | null | undefined)).toBe(expected);
  });
});
