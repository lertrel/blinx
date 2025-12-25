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

  test('format-aware string types: email/phone/url/slug/uuid', () => {
    expect(validateField('person@example.com', { type: 'email' })).toEqual([]);
    expect(validateField('bad-email', { type: 'email' })).toEqual(['Must be a valid email address.']);

    expect(validateField('+14155550100', { type: 'phone' })).toEqual([]);
    expect(validateField('12345', { type: 'phone' })).toEqual(['Must be a valid phone number (E.164).']);

    expect(validateField('https://example.com', { type: 'url' })).toEqual([]);
    expect(validateField('notaurl', { type: 'url' })).toEqual(['Must be a valid URL.']);

    expect(validateField('valid-slug', { type: 'slug' })).toEqual([]);
    expect(validateField('Invalid Slug', { type: 'slug' })).toEqual(['Must be a valid slug (lowercase letters, numbers, dashes).']);

    expect(validateField('123e4567-e89b-12d3-a456-426614174000', { type: 'uuid' })).toEqual([]);
    expect(validateField('not-a-uuid', { type: 'uuid' })).toEqual(['Must be a valid UUID.']);
  });

  test('format alias: slug validator runs when format is set', () => {
    expect(validateField('kilo-item', { type: 'string', format: 'slug' })).toEqual([]);
    expect(validateField('INVALID', { type: 'string', format: 'slug' })).toEqual(['Must be a valid slug (lowercase letters, numbers, dashes).']);
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

  test('json: validates JSON payloads', () => {
    expect(validateField('{"a":1}', { type: 'json' })).toEqual([]);
    expect(validateField({ a: 1 }, { type: 'json' })).toEqual([]);
    expect(validateField('{oops}', { type: 'json' })).toEqual(['Invalid JSON.']);
  });

  test('percent & rating: enforce default ranges', () => {
    expect(validateField('', { type: 'percent' })).toEqual([]);
    expect(validateField(50, { type: 'percent' })).toEqual([]);
    expect(validateField(-1, { type: 'percent' })).toEqual(['Must be ≥ 0.']);
    expect(validateField(120, { type: 'percent' })).toEqual(['Must be ≤ 100.']);

    expect(validateField(4.5, { type: 'rating' })).toEqual([]);
    expect(validateField(6, { type: 'rating' })).toEqual(['Must be ≤ 5.']);
  });

  test('geoPoint: validates presence, numeric values, and ranges', () => {
    expect(validateField({ lat: 10 }, { type: 'geoPoint' })).toEqual(['Latitude and longitude must both be provided.']);
    expect(validateField({ lat: 95, lng: 10 }, { type: 'geoPoint' })).toEqual(['Latitude must be between -90 and 90.']);
    expect(validateField({ lat: 15, lng: 200 }, { type: 'geoPoint' })).toEqual(['Longitude must be between -180 and 180.']);
    expect(validateField({ lat: 'abc', lng: 20 }, { type: 'geoPoint' })).toEqual(['Latitude must be a number.']);
    expect(validateField({ lat: 10, lng: 20 }, { type: 'geoPoint' })).toEqual([]);
  });
});
