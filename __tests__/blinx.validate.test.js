import { validateField } from '../lib/blinx.validate.js';

describe('validateField', () => {
  test('required: flags empty values including empty arrays', () => {
    expect(validateField('', { type: 'string', required: true })).toEqual(['This field is required.']);
    expect(validateField(null, { type: 'string', required: true })).toEqual(['This field is required.']);
    expect(validateField(undefined, { type: 'string', required: true })).toEqual(['This field is required.']);
    expect(validateField([], { type: 'array', required: true })).toEqual(['This field is required.']);
  });

  test('number: validates NaN and min/max bounds', () => {
    expect(validateField('abc', { type: 'number' })).toEqual(['Must be a number.']);
    expect(validateField(-1, { type: 'number', min: 0 })).toEqual(['Must be ≥ 0.']);
    expect(validateField(11, { type: 'number', max: 10 })).toEqual(['Must be ≤ 10.']);

    // Empty is allowed unless required.
    expect(validateField('', { type: 'number', min: 0 })).toEqual([]);
  });

  test('string: validates length and pattern', () => {
    expect(validateField('a', { type: 'string', length: { min: 2 } })).toEqual(['Min length 2.']);
    expect(validateField('abcd', { type: 'string', length: { max: 3 } })).toEqual(['Max length 3.']);
    expect(validateField('abc', { type: 'string', pattern: '^[0-9]+$' })).toEqual(['Invalid format.']);
    expect(validateField('123', { type: 'string', pattern: '^[0-9]+$' })).toEqual([]);
  });

  test('enum: validates choices (truthy values only)', () => {
    expect(validateField('X', { type: 'enum', values: ['A', 'B'] })).toEqual(['Invalid choice.']);
    expect(validateField('A', { type: 'enum', values: ['A', 'B'] })).toEqual([]);

    // Falsy values are treated as "unset".
    expect(validateField('', { type: 'enum', values: ['A'] })).toEqual([]);
  });

  test('date: validates date strings', () => {
    expect(validateField('not-a-date', { type: 'date' })).toEqual(['Invalid date.']);
    expect(validateField('2025-12-12', { type: 'date' })).toEqual([]);

    // Falsy values are treated as "unset".
    expect(validateField('', { type: 'date' })).toEqual([]);
  });
});
