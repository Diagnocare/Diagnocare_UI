import { capitalizeFirstLetter, formatPersonName } from 'src/app/utilities/person-name.util';

/**
 * The patient name is capitalised in two passes — live on every keystroke, then once
 * more on blur/submit — so both passes are pinned here. The rule is first letter only:
 * a per-word or lower-casing rule reads as a tidy-up but silently rewrites names a lab
 * is required to record as the patient spells them.
 */
describe('capitalizeFirstLetter (runs on every keystroke)', () => {
  it('capitalises the first letter and leaves the rest as typed', () => {
    expect(capitalizeFirstLetter('john smith')).toBe('John smith');
  });

  it('keeps whitespace, so a space can still be typed mid-name', () => {
    expect(capitalizeFirstLetter('john ')).toBe('John ');
    expect(capitalizeFirstLetter(' ')).toBe(' ');
  });

  it('never lower-cases, so mid-word capitals survive being typed', () => {
    expect(capitalizeFirstLetter('john McD')).toBe('John McD');
    expect(capitalizeFirstLetter('RAHUL KUMAR')).toBe('RAHUL KUMAR');
  });

  it('does not change length, which is what lets the caret be restored', () => {
    const typed = 'john smith';
    expect(capitalizeFirstLetter(typed).length).toBe(typed.length);
  });
});

describe('formatPersonName (blur and submit)', () => {
  it.each([
    ['john smith',  'John smith'],
    ['rahul kumar', 'Rahul kumar'],
    ['mary joseph', 'Mary joseph'],
    ['john',        'John'],
    ['doe',         'Doe'],
  ])('capitalises %s → %s', (input, expected) => {
    expect(formatPersonName(input)).toBe(expected);
  });

  it('trims leading and trailing whitespace', () => {
    expect(formatPersonName('  john smith  ')).toBe('John smith');
  });

  it('leaves a name that is already capitalised alone (idempotent)', () => {
    const once = formatPersonName('john smith');
    expect(formatPersonName(once)).toBe(once);
  });

  it('preserves spellings a per-word rule would mangle', () => {
    expect(formatPersonName('McDonald')).toBe('McDonald');
    expect(formatPersonName("D'Souza")).toBe("D'Souza");
    expect(formatPersonName('van der Berg')).toBe('Van der Berg');
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
