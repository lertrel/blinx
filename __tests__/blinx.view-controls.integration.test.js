/** @jest-environment jsdom */

import { blinxStore } from '../lib/blinx.store.js';
import { blinxForm } from '../lib/blinx.form.js';
import { blinxCollection } from '../lib/blinx.collection.js';
import { blinxTable } from '../lib/blinx.table.js';

function elById(id) {
  return document.getElementById(id);
}

describe('Controls declared on view definition (view.controls)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('blinxForm binds DOM controls from view.controls when controls param is omitted', () => {
    // Controls live outside root (supported via document.getElementById fallback)
    document.body.innerHTML = `
      <button id="next"></button>
      <button id="prev"></button>
      <span id="indicator"></span>
    `;

    const model = { fields: { name: { type: 'string' } } };
    const store = blinxStore([{ name: 'A' }, { name: 'B' }], model);

    const root = document.createElement('div');
    const view = {
      sections: [{ title: 'Main', columns: 1, fields: ['name'] }],
      controls: {
        nextButton: 'next',
        prevButton: 'prev',
        recordIndicator: 'indicator',
      },
    };

    blinxForm({ root, store, view, recordIndex: 0 });

    expect(elById('indicator')?.textContent).toBe('Record 1 of 2');
    elById('next').click();
    expect(elById('indicator')?.textContent).toBe('Record 2 of 2');
    elById('prev').click();
    expect(elById('indicator')?.textContent).toBe('Record 1 of 2');
  });

  test('blinxCollection binds DOM controls from view.controls when controls param is omitted', () => {
    document.body.innerHTML = `
      <button id="create"></button>
      <span id="status"></span>
    `;

    const model = { fields: { name: { type: 'string' } } };
    const store = blinxStore([{ name: 'A' }], model);
    const root = document.createElement('div');

    const view = {
      layout: 'table',
      columns: [{ field: 'name', label: 'Name' }],
      controls: {
        createButton: 'create',
        status: 'status',
      },
    };

    blinxCollection({ root, store, view, paging: { pageSize: 20 } });

    expect(root.querySelectorAll('tbody tr').length).toBe(1);
    elById('create').click();
    expect(root.querySelectorAll('tbody tr').length).toBe(2);
    expect(elById('status')?.textContent).toBe('New row created.');
  });

  test('blinxTable binds DOM controls from view.controls when controls param is omitted', () => {
    document.body.innerHTML = `
      <button id="tbl-create"></button>
      <span id="tbl-status"></span>
    `;

    const model = { fields: { name: { type: 'string' } } };
    const store = blinxStore([{ name: 'A' }], model);
    const root = document.createElement('div');

    const view = {
      columns: [{ field: 'name', label: 'Name' }],
      controls: {
        createButton: 'tbl-create',
        status: 'tbl-status',
      },
    };

    blinxTable({ root, store, view, pageSize: 20 });

    expect(root.querySelectorAll('tbody tr').length).toBe(1);
    elById('tbl-create').click();
    expect(root.querySelectorAll('tbody tr').length).toBe(2);
    expect(elById('tbl-status')?.textContent).toBe('New row created.');
  });
});

