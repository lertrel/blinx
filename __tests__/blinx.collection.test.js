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
  test('does not accept legacy ui parameter', () => {
    const model = { fields: { name: { type: 'string' } } };
    const store = blinxStore([{ name: 'A' }], model);
    const root = document.createElement('div');

    expect(() => blinxCollection({
      root,
      store,
      view: { layout: 'table', columns: [{ field: 'name', label: 'Name' }] },
      ui: { any: 'thing' },
    })).toThrow('does not accept a ui parameter');
  });

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
        createButton: 'create',
        deleteSelectedButton: 'del',
        status: 'status',
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

  test('controls: {} suppresses the default toolbar (but still renders collection content)', () => {
    const model = { fields: { name: { type: 'string' } } };
    const store = blinxStore([{ name: 'A' }, { name: 'B' }], model);
    const root = document.createElement('div');

    blinxCollection({
      root,
      store,
      view: { layout: 'table', columns: [{ field: 'name', label: 'Name' }] },
      paging: { pageSize: 20 },
      controls: {},
    });

    expect(root.querySelector('.blinx-controls')).toBeNull();
    expect(root.querySelector('table')).not.toBeNull();
    expect(root.querySelectorAll('tbody tr').length).toBe(2);
    expect(root.textContent).not.toContain('Prev');
    expect(root.textContent).not.toContain('Next');
    expect(root.textContent).not.toContain('Page:');
  });

  test('toolbar renders after content in both auto and declarative modes', () => {
    const model = { fields: { name: { type: 'string' } } };
    const store = blinxStore([{ name: 'A' }, { name: 'B' }], model);

    // Auto mode: controls omitted => default toolbar created.
    const rootAuto = document.createElement('div');
    blinxCollection({
      root: rootAuto,
      store,
      view: { layout: 'table', columns: [{ field: 'name', label: 'Name' }] },
      paging: { pageSize: 20 },
    });
    expect(rootAuto.firstElementChild?.classList.contains('blinx-collection__content')).toBe(true);
    expect(rootAuto.lastElementChild?.classList.contains('blinx-controls')).toBe(true);

    // Declarative mode: some controls declared => toolbar created, should still be after content.
    const rootDecl = document.createElement('div');
    blinxCollection({
      root: rootDecl,
      store,
      view: {
        layout: 'table',
        columns: [{ field: 'name', label: 'Name' }],
        controls: { prevButton: true },
      },
      paging: { pageSize: 20 },
    });
    expect(rootDecl.firstElementChild?.classList.contains('blinx-collection__content')).toBe(true);
    expect(rootDecl.lastElementChild?.classList.contains('blinx-controls')).toBe(true);
  });

  test('when there are no records, disables prev/next/deleteSelected but keeps create enabled', () => {
    const model = { fields: { name: { type: 'string' } } };
    const store = blinxStore([], model);
    const root = document.createElement('div');

    blinxCollection({
      root,
      store,
      view: { layout: 'table', columns: [{ field: 'name', label: 'Name' }] },
      paging: { pageSize: 20 },
      // controls omitted => auto toolbar
    });

    const toolbar = root.querySelector('.blinx-controls');
    expect(toolbar).not.toBeNull();
    const btn = (label) => Array.from(toolbar.querySelectorAll('button')).find(b => b.textContent === label);

    expect(btn('Prev').disabled).toBe(true);
    expect(btn('Next').disabled).toBe(true);
    expect(btn('Delete Selected').disabled).toBe(true);
    // Create should remain available so the user can add the first row.
    expect(btn('Create').disabled).toBe(false);
  });
});

