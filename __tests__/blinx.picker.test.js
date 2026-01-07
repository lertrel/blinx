/** @jest-environment jsdom */

import { blinxStore } from '../lib/blinx.store.js';
import { blinxPicker } from '../lib/blinx.picker.js';

function byText(root, text) {
  return Array.from(root.querySelectorAll('button')).filter(b => b.textContent === text);
}

describe('blinxPicker', () => {
  test('multiple: add ➕ adds to cart, dedupes, and enables 🗑️ remove', async () => {
    const model = { fields: { id: { type: 'string' }, name: { type: 'string' } } };
    const childStore = blinxStore([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], model);
    const root = document.createElement('div');

    blinxPicker({
      root,
      childStore,
      selectionMode: 'multiple',
      keyField: 'id',
      labelField: 'name',
      views: {
        table: { columns: [{ field: 'name', label: 'Name' }] },
      },
    });

    // Two add buttons initially.
    let addBtns = byText(root, '➕');
    expect(addBtns.length).toBe(2);
    expect(addBtns[0].disabled).toBe(false);

    // Add first record => cart shows 1 row and add disabled for that row.
    addBtns[0].click();
    await Promise.resolve();

    expect(root.querySelectorAll('.blx-cart__row').length).toBe(1);
    addBtns = byText(root, '➕');
    expect(addBtns[0].disabled).toBe(true);

    // Dedupe: clicking again should not add another.
    addBtns[0].click();
    await Promise.resolve();
    expect(root.querySelectorAll('.blx-cart__row').length).toBe(1);

    // Remove from cart => cart becomes empty and add re-enabled.
    const removeBtns = byText(root, '🗑️');
    expect(removeBtns.length).toBe(1);
    removeBtns[0].click();
    await Promise.resolve();

    expect(root.querySelectorAll('.blx-cart__row').length).toBe(0);
    addBtns = byText(root, '➕');
    expect(addBtns[0].disabled).toBe(false);
  });

  test('single: once cart has one item, all ➕ are disabled', async () => {
    const model = { fields: { id: { type: 'string' }, name: { type: 'string' } } };
    const childStore = blinxStore([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], model);
    const root = document.createElement('div');

    blinxPicker({
      root,
      childStore,
      selectionMode: 'single',
      keyField: 'id',
      labelField: 'name',
      views: {
        table: { columns: [{ field: 'name', label: 'Name' }] },
      },
    });

    let addBtns = byText(root, '➕');
    expect(addBtns.length).toBe(2);
    expect(addBtns[0].disabled).toBe(false);
    expect(addBtns[1].disabled).toBe(false);

    addBtns[0].click();
    await Promise.resolve();

    addBtns = byText(root, '➕');
    expect(addBtns[0].disabled).toBe(true); // dedupe for the chosen record
    expect(addBtns[1].disabled).toBe(true); // cart not empty locks further adds
  });

  test('reset restores initial baseline and confirm returns selected records', async () => {
    const model = { fields: { id: { type: 'string' }, name: { type: 'string' } } };
    const childStore = blinxStore([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], model);
    const root = document.createElement('div');
    const onConfirm = jest.fn();

    const { pickerApi } = blinxPicker({
      root,
      childStore,
      selectionMode: 'multiple',
      keyField: 'id',
      labelField: 'name',
      initial: [{ id: 'b', name: 'B' }],
      views: {
        table: { columns: [{ field: 'name', label: 'Name' }] },
      },
      onConfirm,
    });

    // Baseline has 1 cart row (B)
    expect(root.querySelectorAll('.blx-cart__row').length).toBe(1);
    expect(root.textContent).toContain('B');

    // Add A => cart has 2 rows.
    const addBtns = byText(root, '➕');
    addBtns[0].click();
    await Promise.resolve();
    expect(root.querySelectorAll('.blx-cart__row').length).toBe(2);

    // Reset => back to baseline (1 row).
    const resetBtn = byText(root, 'Reset')[0];
    resetBtn.click();
    await Promise.resolve();
    expect(root.querySelectorAll('.blx-cart__row').length).toBe(1);
    expect(root.textContent).toContain('B');

    // Confirm => calls onConfirm with baseline selection
    const confirmBtn = byText(root, 'Confirm')[0];
    confirmBtn.click();
    await Promise.resolve();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith([{ id: 'b', name: 'B' }]);

    // API getSelected matches the same.
    expect(pickerApi.getSelected()).toEqual([{ id: 'b', name: 'B' }]);
  });

  test('picker-level status: reset sets status and confirm failure shows error', async () => {
    const model = { fields: { id: { type: 'string' }, name: { type: 'string' } } };
    const childStore = blinxStore([{ id: 'a', name: 'A' }], model);
    const root = document.createElement('div');

    const onConfirm = jest.fn(() => { throw new Error('boom'); });

    blinxPicker({
      root,
      childStore,
      selectionMode: 'multiple',
      keyField: 'id',
      labelField: 'name',
      views: {
        table: { columns: [{ field: 'name', label: 'Name' }] },
      },
      onConfirm,
    });

    const status = () => root.querySelector('.blinx-picker__status')?.textContent || '';

    // Reset should set a friendly status message.
    byText(root, 'Reset')[0].click();
    await Promise.resolve();
    expect(status()).toBe('Reset done.');

    // A failing confirm should show an error status.
    byText(root, 'Confirm')[0].click();
    await Promise.resolve();
    expect(status()).toBe('Confirm failed.');
  });
});

