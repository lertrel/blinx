import {
  modelKey,
  isNestedFieldDef,
  isSNMFieldDef,
  getSNMRef,
  extractSNMId,
  extractSNMIds,
} from '../lib/blinx.nested.js';

describe('blinx.nested helper contracts', () => {
  test('modelKey prefers id/name/entity in order', () => {
    expect(modelKey({ id: 'Customer', name: 'Alt', entity: 'Fallback' })).toBe('Customer');
    expect(modelKey({ name: 'ByName', entity: 'Fallback' })).toBe('ByName');
    expect(modelKey({ entity: 'OnlyEntity' })).toBe('OnlyEntity');
    expect(modelKey(null)).toBeNull();
  });

  test('isNestedFieldDef detects model/collection field definitions', () => {
    expect(isNestedFieldDef({ type: 'model' })).toBe(true);
    expect(isNestedFieldDef({ type: 'collection' })).toBe(true);
    expect(isNestedFieldDef({ type: 'string' })).toBe(false);
    expect(isNestedFieldDef(null)).toBe(false);
  });

  test('isSNMFieldDef returns true only when nested and embedded=false', () => {
    expect(isSNMFieldDef({ type: 'model', embedded: false })).toBe(true);
    expect(isSNMFieldDef({ type: 'collection', embedded: false })).toBe(true);
    expect(isSNMFieldDef({ type: 'collection', embedded: true })).toBe(false);
    expect(isSNMFieldDef({ type: 'string', embedded: false })).toBe(false);
  });

  test('getSNMRef normalizes defaults and provided overrides', () => {
    expect(getSNMRef({ ref: { keyField: 'uid', labelField: 'name', previewFields: ['a', '', 'b'] } })).toEqual({
      keyField: 'uid',
      labelField: 'name',
      previewFields: ['a', 'b'],
    });
    expect(getSNMRef({})).toEqual({ keyField: 'id', labelField: null, previewFields: null });
  });

  test('extractSNMId resolves ids from primitive and structured values', () => {
    const field = { type: 'model', ref: { keyField: 'uid' } };
    expect(extractSNMId(field, { uid: '123', label: 'Alice' })).toBe('123');
    expect(extractSNMId(field, '456')).toBe('456');
    expect(() => extractSNMId(field, { label: 'Missing key' })).toThrow('SNM value object is missing "uid".');
  });

  test('extractSNMIds maps arrays of SNM values and enforces array input', () => {
    const field = { type: 'collection', ref: { keyField: 'id' } };
    expect(extractSNMIds(field, [{ id: 'a' }, 'b'])).toEqual(['a', 'b']);
    expect(extractSNMIds(field, null)).toEqual([]);
    expect(() => extractSNMIds(field, 'not-an-array')).toThrow('SNM collection value must be an array.');
  });
});
