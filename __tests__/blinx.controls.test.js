/** @jest-environment jsdom */

import {
  normalizeControlSpecEntry,
  resolveElementByIdWithinRoot,
  applyControlPresentation,
} from '../lib/blinx.controls.js';

describe('blinx.controls micro-lib', () => {
  test('normalizeControlSpecEntry supports shorthand forms', () => {
    expect(normalizeControlSpecEntry('x')).toEqual({ domId: 'x' });
    expect(normalizeControlSpecEntry(true)).toEqual({ visible: true, disabled: false });
    expect(normalizeControlSpecEntry(false)).toEqual({ visible: false, disabled: true });
    expect(normalizeControlSpecEntry({ domId: 'a', label: 'Save' })).toEqual({ domId: 'a', label: 'Save' });
    expect(normalizeControlSpecEntry(undefined)).toBeNull();
    expect(normalizeControlSpecEntry(null)).toBeNull();
  });

  test('resolveElementByIdWithinRoot prefers root scope, then falls back to document', () => {
    document.body.innerHTML = '';

    const root = document.createElement('div');
    const inRoot = document.createElement('button');
    inRoot.id = 'in-root';
    root.appendChild(inRoot);
    document.body.appendChild(root);

    const inDoc = document.createElement('button');
    inDoc.id = 'in-doc';
    document.body.appendChild(inDoc);

    expect(resolveElementByIdWithinRoot(root, 'in-root')).toBe(inRoot);
    expect(resolveElementByIdWithinRoot(root, 'in-doc')).toBe(inDoc);
    expect(resolveElementByIdWithinRoot(root, 'missing')).toBeNull();
    expect(resolveElementByIdWithinRoot(null, 'in-doc')).toBe(inDoc);
  });

  test('applyControlPresentation updates visibility, disabled state, css, and label', () => {
    const btn = document.createElement('button');
    btn.className = 'a';
    btn.textContent = 'Old';

    applyControlPresentation(btn, {
      visible: false,
      disabled: true,
      css: 'b',
      label: 'New',
    });

    expect(btn.hidden).toBe(true);
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.className).toContain('a');
    expect(btn.className).toContain('b');
    expect(btn.textContent).toBe('New');

    // Should be safe on non-interactive elements too.
    const span = document.createElement('span');
    applyControlPresentation(span, { disabled: true });
    expect(span.getAttribute('aria-disabled')).toBe('true');
  });
});

