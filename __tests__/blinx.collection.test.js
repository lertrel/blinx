/** @jest-environment jsdom */

import { blinxStore } from '../lib/blinx.store.js';
import { blinxCollection } from '../lib/blinx.collection.js';

function setupButtons(ids = {}) {
  document.body.innerHTML = '';
  for (const [key, id] of Object.entries(ids)) {
    if (!id) continue;
    const el = document.createElement(key.includes('status') ? 'div' : 'button');
    el.id = id;
    document.body.appendChild(el);
  }
}

describe('blinxCollection', () => {
  test('renders built-in table layout and supports onItemClick', () => {
    const model = { fields: { name: { type: 'string' } } };
    const store = blinxStore([{ name: 'A' }, { name: 'B' }], model);
    const root = document.createElement('div');
    const onItemClick = jest.fn();

    blinxCollection({
      root,
      store,
      view: { layout: 'table', columns: [{ field: 'name', label: 'Name' }] },
      paging: { pageSize: 20 },
      onItemClick,
    });

    const rows = root.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onItemClick).toHaveBeenCalledWith({ index: 0, record: { name: 'A' } });
  });

  test('single selection mode refreshes UI so only one checkbox stays checked', () => {
    const model = { fields: { name: { type: 'string' } } };
    const store = blinxStore([{ name: 'A' }, { name: 'B' }], model);
    const root = document.createElement('div');

    blinxCollection({
      root,
      store,
      view: { layout: 'table', columns: [{ field: 'name', label: 'Name' }] },
      paging: { pageSize: 20 },
      selection: { mode: 'single' },
    });

    let cbs = root.querySelectorAll('tbody tr input[type="checkbox"]');
    expect(cbs.length).toBe(2);

    cbs[0].checked = true;
    cbs[0].dispatchEvent(new Event('change', { bubbles: true }));

    cbs = root.querySelectorAll('tbody tr input[type="checkbox"]');
    expect(cbs[0].checked).toBe(true);
    expect(cbs[1].checked).toBe(false);

    cbs[1].checked = true;
    cbs[1].dispatchEvent(new Event('change', { bubbles: true }));

    cbs = root.querySelectorAll('tbody tr input[type="checkbox"]');
    expect(cbs[0].checked).toBe(false);
    expect(cbs[1].checked).toBe(true);
  });

  test('supports custom layout registry via view.layout key', () => {
    const model = { fields: { name: { type: 'string' } } };
    const store = blinxStore([{ name: 'A' }], model);
    const root = document.createElement('div');

    const customLayout = {
      mount({ root: mountRoot, controller }) {
        const el = document.createElement('div');
        el.className = 'custom';
        mountRoot.appendChild(el);
        return {
          update() {
            const state = controller.getState();
            el.textContent = `count=${state.items.length};page=${state.page + 1}`;
          }
        };
      }
    };

    blinxCollection({
      root,
      store,
      view: { layout: 'x-custom' },
      layouts: { 'x-custom': customLayout },
      paging: { pageSize: 20 },
    });

    expect(root.querySelector('.custom').textContent).toBe('count=1;page=1');
    store.addRecord({ name: 'B' });
    expect(root.querySelector('.custom').textContent).toBe('count=2;page=1');
  });

  test('create/deleteSelected actions + interceptors work via external controls', async () => {
    const model = { fields: { name: { type: 'string' } } };
    const store = blinxStore([{ name: 'A' }], model);
    const root = document.createElement('div');

    setupButtons({ createBtn: 'create', deleteBtn: 'del', status: 'status' });

    const { api } = blinxCollection({
      root,
      store,
      view: { layout: 'table', columns: [{ field: 'name', label: 'Name' }] },
      paging: { pageSize: 20 },
      controls: {
        createButtonId: 'create',
        deleteSelectedButtonId: 'del',
        statusId: 'status',
      }
    });

    api.onCreate(async ({ proceed }) => {
      // block default create
      void proceed;
    });

    document.getElementById('create').click();
    await Promise.resolve();
    expect(store.getLength()).toBe(1);

    // allow create now
    api.onCreate(async ({ proceed }) => proceed());
    document.getElementById('create').click();
    await Promise.resolve();
    expect(store.getLength()).toBe(2);

    // select first row and delete selected
    const firstRowCb = root.querySelector('tbody tr input[type="checkbox"]');
    firstRowCb.checked = true;
    firstRowCb.dispatchEvent(new Event('change', { bubbles: true }));

    document.getElementById('del').click();
    await Promise.resolve();
    expect(store.getLength()).toBe(1);
  });
});

