/** @jest-environment jsdom */

import { blinxStore, DataTypes } from '../lib/blinx.store.js';
import { blinxForm } from '../lib/blinx.form.js';

function getFieldInputByLabel(root, labelText) {
  const labels = Array.from(root.querySelectorAll('label'));
  const label = labels.find(l => l.textContent === labelText);
  if (!label) return null;
  const wrapper = label.parentElement;
  if (!wrapper) return null;
  return wrapper.querySelector('input, textarea, select');
}

describe('present(): form integration', () => {
  test('recomputes present on record change (setRecordIndex) without caching', () => {
    const model = {
      id: 'Product',
      fields: {
        id: { type: DataTypes.string },
        name: { type: DataTypes.string },
        price: { type: DataTypes.number },
      },
    };

    const store = blinxStore([
      { id: '1', name: 'A', price: 10 },
      { id: '', name: 'B', price: 20 },
    ], model);

    let calls = 0;
    const view = {
      sections: [{
        title: 'Main',
        columns: 2,
        fields: [
          'name',
          {
            field: 'price',
            present: (_c, r) => {
              calls += 1;
              return { attrs: { input: { readonly: !!r?.id } } };
            },
          },
        ],
      }],
    };

    const root = document.createElement('div');
    const { formApi } = blinxForm({ root, store, view });

    const priceInput0 = getFieldInputByLabel(root, 'price');
    expect(priceInput0).toBeTruthy();
    expect(priceInput0.readOnly).toBe(true);
    expect(calls).toBeGreaterThan(0);
    const callsAfterFirstRender = calls;

    // Switch record: present must re-run and flip readonly.
    formApi.setRecordIndex(1);
    const priceInput1 = getFieldInputByLabel(root, 'price');
    expect(priceInput1).toBeTruthy();
    expect(priceInput1.readOnly).toBe(false);
    expect(calls).toBeGreaterThan(callsAfterFirstRender);
  });

  test('supports attrs.wrapper.hidden via present()', () => {
    const model = { id: 'M', fields: { id: { type: DataTypes.string }, name: { type: DataTypes.string } } };
    const store = blinxStore([{ id: '1', name: 'A' }, { id: '', name: 'B' }], model);

    const view = {
      sections: [{
        title: 'Main',
        columns: 2,
        fields: [{
          field: 'name',
          present: (_c, r) => ({ attrs: { wrapper: { hidden: !!r?.id } } }),
        }],
      }],
    };

    const root = document.createElement('div');
    const { formApi } = blinxForm({ root, store, view });

    // When id exists, wrapper is hidden.
    const label0 = Array.from(root.querySelectorAll('label')).find(l => l.textContent === 'name');
    expect(label0).toBeTruthy();
    expect(label0.parentElement.hidden).toBe(true);

    // When id falsy, wrapper is visible.
    formApi.setRecordIndex(1);
    const label1 = Array.from(root.querySelectorAll('label')).find(l => l.textContent === 'name');
    expect(label1).toBeTruthy();
    expect(label1.parentElement.hidden).toBe(false);
  });
});

