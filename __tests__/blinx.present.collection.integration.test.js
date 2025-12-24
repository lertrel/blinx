/** @jest-environment jsdom */

import { blinxStore, DataTypes } from '../lib/blinx.store.js';
import { blinxCollection } from '../lib/blinx.collection.js';

describe('present(): collection/table integration', () => {
  test('applies column present attrs to header/cell and rowPresent attrs to row', () => {
    const model = {
      id: 'Product',
      fields: {
        id: { type: DataTypes.string },
        name: { type: DataTypes.string },
      },
    };
    const store = blinxStore([{ id: '1', name: 'A' }], model);
    const root = document.createElement('div');

    const view = {
      layout: 'table',
      columns: [{
        field: 'name',
        label: 'Name',
        present: (c, r) => ({
          attrs: {
            header: { 'data-tenant': c.tenant },
            cell: { 'data-variant': `primary-${c.role}`, 'data-has-id': !!r?.id },
          },
        }),
      }],
      rowPresent: (_c, r) => ({ attrs: { row: { 'data-row-id': r?.id || '' } } }),
      controls: false,
    };

    blinxCollection({ root, store, view, context: { tenant: 't1', role: 'admin' } });

    const ths = root.querySelectorAll('thead th');
    expect(ths.length).toBeGreaterThanOrEqual(2); // Sel + Name
    const thName = Array.from(ths).find(th => th.textContent === 'Name');
    expect(thName).toBeTruthy();
    expect(thName.getAttribute('data-tenant')).toBe('t1');

    const tr = root.querySelector('tbody tr');
    expect(tr).toBeTruthy();
    expect(tr.getAttribute('data-row-id')).toBe('1');

    const tds = tr.querySelectorAll('td');
    // first td is selection checkbox, second is name column
    expect(tds.length).toBeGreaterThanOrEqual(2);
    const tdName = tds[1];
    expect(tdName.getAttribute('data-variant')).toBe('primary-admin');
    expect(tdName.getAttribute('data-has-id')).toBe('true');
  });
});

