/** @jest-environment jsdom */

import { createBlinxStore } from '../lib/blinx.store.js';
import { renderBlinxTable } from '../lib/blinx.table.js';
import { BlinxDefaultAdapter } from '../lib/blinx.adapters.default.js';

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

describe('renderBlinxTable', () => {
  test('throws when store is missing getModel() or model.fields', () => {
    const root = document.createElement('div');

    expect(() => renderBlinxTable({ root, view: { columns: [] }, store: null, ui: {} }))
      .toThrow('renderBlinxTable requires a store that exposes getModel().');

    expect(() => renderBlinxTable({
      root,
      view: { columns: [] },
      store: { getModel: () => ({}) },
      ui: {},
    })).toThrow('renderBlinxTable requires the store model to define fields.');
  });

  test('renders rows and calls onRowClick when clicking row (not checkbox)', () => {
    const model = { fields: { name: { type: 'string' } } };
    const store = createBlinxStore([{ name: 'A' }, { name: 'B' }], model);
    const ui = new BlinxDefaultAdapter();

    const root = document.createElement('div');
    const onRowClick = jest.fn();

    renderBlinxTable({
      root,
      view: { columns: [{ field: 'name', label: 'Name' }] },
      store,
      ui,
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
    const store = createBlinxStore([{ name: 'A' }, { name: 'B' }], model);
    const ui = new BlinxDefaultAdapter();

    setupButtons({ createId: 'create', deleteSelectedId: 'del', statusId: 'status' });

    const root = document.createElement('div');

    renderBlinxTable({
      root,
      view: { columns: [{ field: 'name', label: 'Name' }] },
      store,
      ui,
      pageSize: 20,
      controls: {
        createButtonId: 'create',
        deleteSelectedButtonId: 'del',
        statusId: 'status',
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
    const store = createBlinxStore([{ name: 'A' }], model);
    const ui = new BlinxDefaultAdapter();

    setupButtons({ createId: 'create', statusId: 'status' });

    const root = document.createElement('div');

    const { tableApi } = renderBlinxTable({
      root,
      view: { columns: [{ field: 'name', label: 'Name' }] },
      store,
      ui,
      pageSize: 20,
      controls: {
        createButtonId: 'create',
        statusId: 'status',
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
    const store = createBlinxStore([{ name: 'A' }], model);
    const ui = new BlinxDefaultAdapter();

    setupButtons({ statusId: 'status' });

    const root = document.createElement('div');

    renderBlinxTable({
      root,
      view: { columns: [{ field: 'name', label: 'Name' }] },
      store,
      ui,
      pageSize: 20,
      controls: {
        statusId: 'status',
      }
    });

    store.addRecord({ name: 'B' });
    expect(getText('status')).toBe('Rows added elsewhere; refreshed table.');

    store.reset();
    jest.runOnlyPendingTimers();
    expect(getText('status')).toBe('Store reset elsewhere; refreshed table.');

    jest.useRealTimers();
  });
});
