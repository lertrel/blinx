import { validateArray } from '../lib/validate/array.js';
import { validateDate } from '../lib/validate/date.js';
import { validateNumber } from '../lib/validate/number.js';
import { validateString } from '../lib/validate/string.js';
import { registerFormat, validators } from '../lib/blinx.validate.js';

describe('validate modules (direct imports)', () => {
  test('validateString: enum behavior is preserved (truthy only)', () => {
    expect(validateString('', { type: 'enum', values: ['A'] })).toEqual([]);
    expect(validateString(0, { type: 'enum', values: ['A'] })).toEqual([]); // historic: falsy treated as unset
    expect(validateString('X', { type: 'enum', values: ['A'] })).toEqual(['Invalid choice.']);
  });

  test('validateString: format/pattern checks', () => {
    expect(validateString('a@b.com', { type: 'string', format: 'email' })).toEqual([]);
    expect(validateString('abc', { type: 'string', pattern: '^[0-9]+$' })).toEqual(['Invalid format.']);
  });

  test('validateNumber: min/max and precision/scale', () => {
    expect(validateNumber('abc', { type: 'number' })).toEqual(['Must be a number.']);
    expect(validateNumber(1234.56, { type: 'number', precision: 5, scale: 2 })).toEqual(['Max precision 5.']);
  });

  test('validateDate: invalid and falsy-unset behavior', () => {
    expect(validateDate('not-a-date', { type: 'date' })).toEqual(['Invalid date.']);
    expect(validateDate(0, { type: 'date' })).toEqual([]); // historic: falsy treated as unset
  });

  test('validateArray: constraints and itemType recursion via callback', () => {
    const validateItem = (v, d) => (d.type === 'string' && typeof v !== 'string' ? ['Must be a string.'] : []);
    expect(validateArray(['a', 'a'], { type: 'array', uniqueItems: true }, validateItem)).toEqual(['Items must be unique.']);
    expect(validateArray([1], { type: 'array', itemType: 'string' }, validateItem)).toEqual(['Item 1: Must be a string.']);
  });
});

describe('blinx.validate façade exports', () => {
  test('exports validators map with {string, number, date, array}', () => {
    expect(Object.keys(validators).sort()).toEqual(['array', 'date', 'number', 'string']);
    expect(validators.string('x', { type: 'string', minLength: 2 })).toEqual(['Min length 2.']);
  });

  test('registerFormat: supports custom formats and trims keys', () => {
    registerFormat('  __test_format_trim__  ', (v) => v === 'ok', { override: true });
    expect(validators.string('ok', { type: 'string', format: '__test_format_trim__' })).toEqual([]);
    expect(validators.string('ok', { type: 'string', format: '  __test_format_trim__  ' })).toEqual([]);
    expect(validators.string('nope', { type: 'string', format: '__test_format_trim__' })).toEqual(['Invalid format.']);
  });
});

