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

  test('nullable + default: distinguishes null handling', () => {
    expect(validateField(null, { type: 'string', required: true, nullable: true })).toEqual([]);
    expect(validateField(null, { type: 'string' })).toEqual(['Null is not allowed.']);
  });

  test('number: enforces integerOnly, multipleOf, step, precision/scale', () => {
    expect(validateField(1.2, { type: 'number', integerOnly: true })).toEqual(['Must be an integer.']);
    expect(validateField(7, { type: 'number', multipleOf: 4 })).toEqual(['Must be a multiple of 4.']);
    expect(validateField(0.3, { type: 'number', step: 0.5 })).toEqual(['Must align with step 0.5.']);
    expect(validateField('123.456', { type: 'number', precision: 5, scale: 2 })).toEqual([
      'Exceeds precision 5.',
      'Exceeds scale 2.',
    ]);
  });

  test('string: supports exact length and format helpers', () => {
    expect(validateField('abc', { type: 'string', length: { exact: 2 } })).toEqual(['Exact length 2 required.']);
    expect(validateField('foo@bar', { type: 'string', format: 'email' })).toEqual(['Must be a valid email.']);
    expect(validateField('Good Slug', { type: 'string', format: 'slug' })).toEqual(['Must be a valid slug (letters, numbers, dashes).']);
  });

  test('array: validates length, uniqueness, and item definitions', () => {
    expect(validateField([], { type: 'array', minItems: 1 })).toEqual(['Must include at least 1 item(s).']);
    expect(validateField(['a', 'a'], { type: 'array', uniqueItems: true })).toEqual(['Items must be unique.']);
    expect(validateField(['1', 'x'], { type: 'array', itemType: 'number' })).toEqual(['Item 1: Must be a number.']);
  });

  test('date bounds: enforces min/max and futureOnly', () => {
    const minDate = '2024-01-01';
    const maxDate = '2024-12-31';
    expect(validateField('2023-12-31', { type: 'date', minDate })).toEqual(['Date must be on/after minDate.']);
    expect(validateField('2025-01-01', { type: 'date', maxDate })).toEqual(['Date must be on/before maxDate.']);
    expect(validateField('2000-01-01', { type: 'date', futureOnly: true })).toEqual(['Date must be in the future.']);
  });

  test('custom validators: collects returned errors', () => {
    const validators = [
      val => (val !== 'ok' ? 'Value must equal "ok".' : undefined),
      val => (val === 'fail' ? ['Another failure.'] : []),
    ];
    expect(validateField('nope', { type: 'string', validators })).toEqual(['Value must equal "ok".']);
    expect(validateField('fail', { type: 'string', validators })).toEqual(['Value must equal "ok".', 'Another failure.']);
  });
});
