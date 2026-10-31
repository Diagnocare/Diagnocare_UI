import { capitalizeWords, formatPersonName } from 'src/app/utilities/person-name.util';

/**
 * The patient name is normalised in two passes — live on every keystroke, then once more
 * on blur/submit — so both passes are pinned here.
 *
 * The rule is full normalisation to Title Case: however the name is typed, it is stored
 * one way. The headline case is that all four spellings of one name converge, which is
 * what the four-way test below exists to hold.
 */
describe('capitalizeWords (runs on every keystroke)', () => {
  it('lower-cases the rest and capitalises each word', () => {
    expect(capitalizeWords('vanchhit kumar')).toBe('Vanchhit Kumar');
    expect(capitalizeWords('VANCHHIT KUMAR')).toBe('Vanchhit Kumar');
  });

  it('keeps whitespace, so a space can still be typed mid-name', () => {
    expect(capitalizeWords('vanchhit ')).toBe('Vanchhit ');
    expect(capitalizeWords(' ')).toBe(' ');
  });

  it('does not change length, which is what lets the caret be restored', () => {
    const typed = 'vanchhit kumar';
    expect(capitalizeWords(typed).length).toBe(typed.length);
  });
});

describe('formatPersonName (blur and submit)', () => {
  it.each([
    'vanchhit kumar',
    'VANCHHIT KUMAR',
    'vanchhit Kumar',
    'Vanchhit kumar',
  ])('normalises %s to "Vanchhit Kumar"', (input) => {
    expect(formatPersonName(input)).toBe('Vanchhit Kumar');
  });

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
    expect(formatPersonName('  vanchhit kumar  ')).toBe('Vanchhit Kumar');
  });

  it('leaves an already-formatted name alone (idempotent)', () => {
    const once = formatPersonName('VANCHHIT KUMAR');
    expect(formatPersonName(once)).toBe(once);
  });

  it('normalises an all-caps name rather than preserving it', () => {
    expect(formatPersonName('RAHUL KUMAR')).toBe('Rahul Kumar');
  });

  it('capitalises after an apostrophe or a hyphen, so those names survive', () => {
    expect(formatPersonName("D'SOUZA")).toBe("D'Souza");
    expect(formatPersonName("d'souza")).toBe("D'Souza");
    expect(formatPersonName('MARY-JANE')).toBe('Mary-Jane');
    expect(formatPersonName('o’brien')).toBe('O’Brien');
  });

  it('capitalises every word of a multi-word surname', () => {
    expect(formatPersonName('van der berg')).toBe('Van Der Berg');
  });

  it('cannot keep a capital inside a word — the accepted cost of normalising', () => {
    // Documented, not desired: normalising "VANCHHIT KUMAR" requires lower-casing, and
    // that necessarily takes "McDonald" with it. Change this only with the rule itself.
    expect(formatPersonName('McDonald')).toBe('Mcdonald');
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
