/** @jest-environment jsdom */

import { blinxStore } from '../lib/blinx.store.js';
import { blinxTable } from '../lib/blinx.table.js';

function setupButtons({ createId, deleteSelectedId, statusId }) {
  document.body.innerHTML = '';

  if (createId) {
    const b = document.createElement('button');
    b.id = createId;
    document.body.appendChild(b);
  }

  if (deleteSelectedId) {
    const b = document.createElement('button');
    b.id = deleteSelectedId;
    document.body.appendChild(b);
  }

  if (statusId) {
    const s = document.createElement('div');
    s.id = statusId;
    document.body.appendChild(s);
  }
}

function getText(id) {
  const el = document.getElementById(id);
  return el ? el.textContent : null;
}

describe('blinxTable', () => {
  test('throws when store is missing getModel() or model.fields', () => {
    const root = document.createElement('div');

    expect(() => blinxTable({ root, view: { columns: [] }, store: null }))
      .toThrow('blinxTable requires a store that exposes getModel().');

    expect(() => blinxTable({
      root,
      view: { columns: [] },
      store: { getModel: () => ({}) },
    })).toThrow('blinxTable requires the store model to define fields.');
  });

  test('renders rows and calls onRowClick when clicking row (not checkbox)', () => {
    const model = { fields: { name: { type: 'string' } } };
    const store = blinxStore([{ name: 'A' }, { name: 'B' }], model);

    const root = document.createElement('div');
    const onRowClick = jest.fn();

    blinxTable({
      root,
      view: { columns: [{ field: 'name', label: 'Name' }] },
      store,
      onRowClick,
      pageSize: 20,
    });

    const rows = root.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);

    rows[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onRowClick).toHaveBeenCalledWith(1);

    // Clicking checkbox should not trigger row click.
    const cb = rows[0].querySelector('input[type="checkbox"]');
    cb.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  test('create/deleteSelected buttons update store and status; delete requires selection', async () => {
    const model = { fields: { name: { type: 'string' } } };
    const store = blinxStore([{ name: 'A' }, { name: 'B' }], model);

    setupButtons({ createId: 'create', deleteSelectedId: 'del', statusId: 'status' });

    const root = document.createElement('div');

    blinxTable({
      root,
      view: { columns: [{ field: 'name', label: 'Name' }] },
      store,
      pageSize: 20,
      controls: {
        createButton: 'create',
        deleteSelectedButton: 'del',
        status: 'status',
      }
    });

    document.getElementById('del').click();
    await Promise.resolve();
    expect(getText('status')).toBe('No rows selected.');

    // Select first row
    const firstRowCb = root.querySelector('tbody tr input[type="checkbox"]');
    firstRowCb.checked = true;
    firstRowCb.dispatchEvent(new Event('change', { bubbles: true }));

    document.getElementById('del').click();
    await Promise.resolve();

    expect(store.getLength()).toBe(1);
    expect(getText('status')).toBe('Selected rows deleted.');

    document.getElementById('create').click();
    await Promise.resolve();

    expect(store.getLength()).toBe(2);
    expect(getText('status')).toBe('New row created.');
  });

  test('interceptors can prevent execution by not calling proceed()', async () => {
    const model = { fields: { name: { type: 'string' } } };
    const store = blinxStore([{ name: 'A' }], model);

    setupButtons({ createId: 'create', statusId: 'status' });

    const root = document.createElement('div');

    const { tableApi } = blinxTable({
      root,
      view: { columns: [{ field: 'name', label: 'Name' }] },
      store,
      pageSize: 20,
      controls: {
        createButton: 'create',
        status: 'status',
      }
    });

    tableApi.onCreate(async ({ proceed }) => {
      // Intentionally do not call proceed.
      void proceed;
    });

    document.getElementById('create').click();
    await Promise.resolve();

    expect(store.getLength()).toBe(1);
  });

  test('responds to external store add/reset events with status message (reset is scheduled)', () => {
    jest.useFakeTimers();

    const model = { fields: { name: { type: 'string' } } };
    const store = blinxStore([{ name: 'A' }], model);

    setupButtons({ statusId: 'status' });

    const root = document.createElement('div');

    blinxTable({
      root,
      view: { columns: [{ field: 'name', label: 'Name' }] },
      store,
      pageSize: 20,
      controls: {
        status: 'status',
      }
    });

    store.addRecord({ name: 'B' });
    expect(getText('status')).toBe('Rows added elsewhere; refreshed table.');

    store.reset();
    jest.runOnlyPendingTimers();
    expect(getText('status')).toBe('Store reset elsewhere; refreshed table.');

    jest.useRealTimers();
  });

  test('controls: {} suppresses the default toolbar (but still renders table rows)', () => {
    const model = { fields: { name: { type: 'string' } } };
    const store = blinxStore([{ name: 'A' }, { name: 'B' }], model);
    const root = document.createElement('div');

    blinxTable({
      root,
      view: { columns: [{ field: 'name', label: 'Name' }] },
      store,
      pageSize: 20,
      controls: {},
    });

    expect(root.querySelector('.blinx-controls')).toBeNull();
    expect(root.querySelector('table')).not.toBeNull();
    expect(root.querySelectorAll('tbody tr').length).toBe(2);
  });
});
