import { coerceField, seedRecord, validateField, validateFieldAsync } from '../lib/blinx.validate.js';

describe('validateField', () => {
  test('required: flags empty values including empty arrays', () => {
    expect(validateField('', { type: 'string', required: true })).toEqual(['This field is required.']);
    expect(validateField(null, { type: 'string', required: true })).toEqual(['This field is required.']);
    expect(validateField(undefined, { type: 'string', required: true })).toEqual(['This field is required.']);
    expect(validateField([], { type: 'array', required: true })).toEqual(['This field is required.']);
  });

  test('nullable: allows null when required', () => {
    expect(validateField(null, { type: 'string', required: true, nullable: true })).toEqual([]);
    expect(validateField(null, { type: 'number', required: true, nullable: true })).toEqual([]);
  });

  test('number: validates NaN and min/max bounds', () => {
    expect(validateField('abc', { type: 'number' })).toEqual(['Must be a number.']);
    expect(validateField(-1, { type: 'number', min: 0 })).toEqual(['Must be ≥ 0.']);
    expect(validateField(11, { type: 'number', max: 10 })).toEqual(['Must be ≤ 10.']);

    // Empty is allowed unless required.
    expect(validateField('', { type: 'number', min: 0 })).toEqual([]);
  });

  test('number: validates multipleOf/step, integerOnly, precision/scale', () => {
    expect(validateField(1.5, { type: 'number', multipleOf: 1 })).toEqual(['Must be a multiple of 1.']);
    expect(validateField(2, { type: 'number', step: 0.5 })).toEqual([]);
    expect(validateField(2.25, { type: 'number', step: 0.5 })).toEqual(['Must be a multiple of 0.5.']);
    expect(validateField(1.1, { type: 'number', integerOnly: true })).toEqual(['Must be an integer.']);
    expect(validateField(12.345, { type: 'number', scale: 2 })).toEqual(['Max 2 decimal place(s).']);
    expect(validateField(1234.56, { type: 'number', precision: 5, scale: 2 })).toEqual(['Max precision 5.']);
  });

  test('string: validates length and pattern', () => {
    expect(validateField('a', { type: 'string', length: { min: 2 } })).toEqual(['Min length 2.']);
    expect(validateField('abcd', { type: 'string', length: { max: 3 } })).toEqual(['Max length 3.']);
    expect(validateField('abc', { type: 'string', pattern: '^[0-9]+$' })).toEqual(['Invalid format.']);
    expect(validateField('123', { type: 'string', pattern: '^[0-9]+$' })).toEqual([]);
  });

  test('string: validates exactLength/minLength/maxLength synonyms', () => {
    expect(validateField('abc', { type: 'string', exactLength: 4 })).toEqual(['Length must be 4.']);
    expect(validateField('a', { type: 'string', minLength: 2 })).toEqual(['Min length 2.']);
    expect(validateField('abcd', { type: 'string', maxLength: 3 })).toEqual(['Max length 3.']);
  });

  test('string: validates built-in formats', () => {
    expect(validateField('a@b.com', { type: 'string', format: 'email' })).toEqual([]);
    expect(validateField('not-an-email', { type: 'string', format: 'email' })).toEqual(['Invalid format.']);
    expect(validateField('https://example.com', { type: 'string', format: 'url' })).toEqual([]);
    expect(validateField('example.com', { type: 'string', format: 'url' })).toEqual(['Invalid format.']);
    expect(validateField('550e8400-e29b-41d4-a716-446655440000', { type: 'string', format: 'uuid' })).toEqual([]);
    expect(validateField('not-a-uuid', { type: 'string', format: 'uuid' })).toEqual(['Invalid format.']);
    expect(validateField('hello-world-1', { type: 'string', format: 'slug' })).toEqual([]);
    expect(validateField('Hello World', { type: 'string', format: 'slug' })).toEqual(['Invalid format.']);
  });

  test('array: validates minItems/maxItems/uniqueItems and itemType recursively', () => {
    expect(validateField(['a'], { type: 'array', minItems: 2 })).toEqual(['Must have at least 2 item(s).']);
    expect(validateField(['a', 'b', 'c'], { type: 'array', maxItems: 2 })).toEqual(['Must have at most 2 item(s).']);
    expect(validateField(['a', 'a'], { type: 'array', uniqueItems: true })).toEqual(['Items must be unique.']);
    expect(validateField(['a', 1], { type: 'array', itemType: 'string' })[0]).toMatch(/^Item 2:/);
    expect(
      validateField([[1, 2], [3, 'x']], { type: 'array', itemType: { type: 'array', itemType: 'number' } })[0]
    ).toMatch(/^Item 2:/);
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

  test('date: validates minDate/maxDate and pastOnly/futureOnly', () => {
    expect(validateField('2025-01-01', { type: 'date', minDate: '2025-02-01' })).toEqual(['Must be on/after 2025-02-01.']);
    expect(validateField('2025-03-01', { type: 'date', maxDate: '2025-02-01' })).toEqual(['Must be on/before 2025-02-01.']);
    expect(validateField('2999-01-01', { type: 'date', pastOnly: true })).toEqual(['Must be in the past.']);
    expect(validateField('1999-01-01', { type: 'date', futureOnly: true })).toEqual(['Must be in the future.']);
  });
});

describe('coerceField / seedRecord / custom validators', () => {
  test('coerceField: trims and lowercases strings', () => {
    expect(coerceField('  AbC  ', { type: 'string', trim: true, lowercase: true })).toBe('abc');
  });

  test('seedRecord: uses defaultValue/nullable and skips computed', () => {
    const model = {
      fields: {
        a: { type: 'string', defaultValue: 'x' },
        b: { type: 'string', nullable: true },
        c: { type: 'number' },
        d: { type: 'string', computed: true },
      }
    };
    expect(seedRecord(model)).toEqual({ a: 'x', b: null, c: '' });
  });

  test('validateFieldAsync: supports sync validators and asyncValidators', async () => {
    const def = {
      type: 'string',
      validators: [(v) => (v === 'bad' ? 'Nope.' : null)],
      asyncValidators: [async (v) => (v === 'worse' ? 'Still nope.' : null)],
    };
    await expect(validateFieldAsync('bad', def)).resolves.toEqual(['Nope.']);
    await expect(validateFieldAsync('worse', def)).resolves.toEqual(['Still nope.']);
    await expect(validateFieldAsync('ok', def)).resolves.toEqual([]);
  });
});
