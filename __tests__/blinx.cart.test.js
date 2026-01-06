/** @jest-environment jsdom */

import { blinxCart } from '../lib/blinx.cart.js';
import { blinxStore } from '../lib/blinx.store.js';

describe('blinxCart', () => {
  test('defaults to all-selected and supports reset selection', async () => {
    const model = { fields: { name: { type: 'string' } } };
    const root = document.createElement('div');

    const { cartApi } = blinxCart({
      root,
      model,
      labelField: 'name',
      data: [{ name: 'A' }, { name: 'B' }],
    });

    // Initial selection is "all selected"
    let cbs = root.querySelectorAll('input[type="checkbox"]');
    expect(cbs.length).toBe(2);
    expect(cbs[0].checked).toBe(true);
    expect(cbs[1].checked).toBe(true);

    // Deselect first -> row should be crossed-out
    cbs[0].checked = false;
    cbs[0].dispatchEvent(new Event('change', { bubbles: true }));

    const rows = root.querySelectorAll('.blx-cart__row');
    expect(rows[0].classList.contains('blx-cart__row--deselected')).toBe(true);

    // Reset via default control
    const resetBtn = Array.from(root.querySelectorAll('button')).find(b => b.textContent === 'Reset');
    expect(resetBtn).toBeTruthy();
    resetBtn.click();
    await Promise.resolve();

    cbs = root.querySelectorAll('input[type="checkbox"]');
    expect(cbs[0].checked).toBe(true);
    expect(cbs[1].checked).toBe(true);
    expect(root.querySelectorAll('.blx-cart__row--deselected').length).toBe(0);

    // getSelected returns selected records
    const selected = cartApi.getSelected();
    expect(selected).toEqual([{ name: 'A' }, { name: 'B' }]);
  });

  test('selectable=false renders prefix icon instead of checkbox', () => {
    const model = { fields: { name: { type: 'string' } } };
    const root = document.createElement('div');

    blinxCart({
      root,
      model,
      labelField: 'name',
      data: [{ name: 'A' }],
      selectable: false,
    });

    expect(root.querySelectorAll('input[type="checkbox"]').length).toBe(0);
    expect(root.textContent).toContain('➖');
    expect(Array.from(root.querySelectorAll('button')).some(b => b.textContent === 'Reset')).toBe(false);
  });

  test('editable=true shows edit icon and executes record control action', async () => {
    const model = { fields: { name: { type: 'string' } } };
    const root = document.createElement('div');
    const editHandler = jest.fn();

    blinxCart({
      root,
      model,
      labelField: 'name',
      data: [{ name: 'A' }],
      editable: true,
      actionRegistry: {
        'blinx.global.journeys.edit-single-model': { handler: () => editHandler() },
      },
    });

    const cb = root.querySelector('input[type="checkbox"]');
    expect(cb.checked).toBe(true);

    const editBtn = Array.from(root.querySelectorAll('button')).find(b => b.textContent === '⚙️');
    expect(editBtn).toBeTruthy();
    editBtn.click();
    await Promise.resolve();

    expect(editHandler).toHaveBeenCalledTimes(1);
    // Clicking edit icon must NOT toggle selection
    expect(root.querySelector('input[type="checkbox"]').checked).toBe(true);
  });

  test('accepts external store so external actions can add items', () => {
    const model = { fields: { name: { type: 'string' } } };
    const store = blinxStore([{ name: 'A' }], model);
    const root = document.createElement('div');

    blinxCart({
      root,
      store,
      labelField: 'name',
      // model optional when store is provided
    });

    expect(root.querySelectorAll('.blx-cart__row').length).toBe(1);
    store.addRecord({ name: 'B' });
    expect(root.querySelectorAll('.blx-cart__row').length).toBe(2);
  });

  test('supports multiple record controls (custom) and executes correct actions', async () => {
    const model = { fields: { name: { type: 'string' } } };
    const root = document.createElement('div');
    const editHandler = jest.fn();
    const deleteHandler = jest.fn();

    blinxCart({
      root,
      model,
      labelField: 'name',
      data: [{ name: 'A' }],
      editable: false,
      recordControls: {
        edit: { label: 'Edit', action: 'cart.edit' },
        delete: { label: 'Delete', action: 'cart.delete' },
        hidden: { label: 'Hidden', visible: () => false, action: 'cart.hidden' },
      },
      actionRegistry: {
        'cart.edit': { handler: () => editHandler() },
        'cart.delete': { handler: () => deleteHandler() },
        'cart.hidden': { handler: () => { throw new Error('should not run'); } },
      },
    });

    const btn = (label) => Array.from(root.querySelectorAll('button')).find(b => b.textContent === label);
    expect(btn('Edit')).toBeTruthy();
    expect(btn('Delete')).toBeTruthy();
    expect(btn('Hidden')).toBeFalsy();

    btn('Edit').click();
    btn('Delete').click();
    await Promise.resolve();

    expect(editHandler).toHaveBeenCalledTimes(1);
    expect(deleteHandler).toHaveBeenCalledTimes(1);
  });

  test('getSelected() returns only selected items (some selected, none selected)', () => {
    const model = { fields: { name: { type: 'string' } } };
    const root = document.createElement('div');

    const { cartApi } = blinxCart({
      root,
      model,
      labelField: 'name',
      data: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      selectable: true,
    });

    // Deselect B only.
    const cbs = Array.from(root.querySelectorAll('input[type="checkbox"]'));
    expect(cbs.length).toBe(3);
    cbs[1].checked = false;
    cbs[1].dispatchEvent(new Event('change', { bubbles: true }));
    expect(cartApi.getSelected()).toEqual([{ name: 'A' }, { name: 'C' }]);

    // Deselect all.
    for (const cb of Array.from(root.querySelectorAll('input[type="checkbox"]'))) {
      cb.checked = false;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    }
    expect(cartApi.getSelected()).toEqual([]);
  });
});

