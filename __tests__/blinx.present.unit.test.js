/** @jest-environment jsdom */

import { applyAttrs } from '../lib/blinx.present.js';

describe('blinx.present: applyAttrs', () => {
  test('maps readonly variants to readOnly + readonly attribute', () => {
    const input = document.createElement('input');
    expect(input.readOnly).toBe(false);

    applyAttrs(input, { readonly: true });
    expect(input.readOnly).toBe(true);
    expect(input.hasAttribute('readonly')).toBe(true);

    applyAttrs(input, { readonly: false });
    expect(input.readOnly).toBe(false);
    expect(input.hasAttribute('readonly')).toBe(false);

    applyAttrs(input, { 'read-only': true });
    expect(input.readOnly).toBe(true);
    expect(input.hasAttribute('readonly')).toBe(true);

    // Bug regression: removing 'read-only' must remove the readonly attribute (not 'read-only').
    applyAttrs(input, { 'read-only': false });
    expect(input.readOnly).toBe(false);
    expect(input.hasAttribute('readonly')).toBe(false);
  });

  test('supports hidden + data-* attributes', () => {
    const div = document.createElement('div');
    applyAttrs(div, { hidden: true, 'data-tenant': 't1' });
    expect(div.hidden).toBe(true);
    expect(div.getAttribute('data-tenant')).toBe('t1');

    applyAttrs(div, { hidden: false, 'data-tenant': null });
    expect(div.hidden).toBe(false);
    expect(div.hasAttribute('data-tenant')).toBe(false);
  });
});

