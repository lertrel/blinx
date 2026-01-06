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

  test('localView: immutable local view disables create/deleteSelected by default', async () => {
    const model = { fields: { id: { type: 'string' }, status: { type: 'string' }, version: { type: 'string' } } };
    const store = blinxStore({
      model,
      dataSource: [{ id: '1', status: 'open', version: '1' }],
      view: {
        name: 'orders',
        resource: 'orders',
        entityType: 'Order',
        keyField: 'id',
        versionField: 'version',
        cache: { completeness: 'loaded', maxEntities: 100 },
      }
    });
    await store.loadFirst();

    const root = document.createElement('div');
    blinxCollection({
      root,
      store,
      dataView: 'orders',
      localView: 'search', // read-only local view
      view: { layout: 'table', columns: [{ field: 'id', label: 'ID' }] },
      // controls omitted => auto toolbar
    });

    const toolbar = root.querySelector('.blinx-controls');
    const btn = (label) => Array.from(toolbar.querySelectorAll('button')).find(b => b.textContent === label);
    expect(btn('Create').disabled).toBe(true);
    expect(btn('Delete Selected').disabled).toBe(true);
  });

  test('api.setSelection(asBaseline) + api.resetSelection restores selection baseline', () => {
    const model = { fields: { name: { type: 'string' } } };
    const store = blinxStore([{ name: 'A' }, { name: 'B' }], model);
    const root = document.createElement('div');

    const { api } = blinxCollection({
      root,
      store,
      view: { layout: 'table', columns: [{ field: 'name', label: 'Name' }] },
      paging: { pageSize: 20 },
      selection: { mode: 'multi' },
      controls: {}, // suppress toolbar noise
    });

    // Baseline = all selected.
    api.setSelection([0, 1], { asBaseline: true });

    let cbs = root.querySelectorAll('tbody tr input[type="checkbox"]');
    expect(cbs[0].checked).toBe(true);
    expect(cbs[1].checked).toBe(true);

    // Deselect one.
    cbs[0].checked = false;
    cbs[0].dispatchEvent(new Event('change', { bubbles: true }));

    cbs = root.querySelectorAll('tbody tr input[type="checkbox"]');
    expect(cbs[0].checked).toBe(false);
    expect(cbs[1].checked).toBe(true);

    // Reset back to baseline.
    api.resetSelection();
    cbs = root.querySelectorAll('tbody tr input[type="checkbox"]');
    expect(cbs[0].checked).toBe(true);
    expect(cbs[1].checked).toBe(true);
  });

  test('view.recordControls renders per-row buttons and does not toggle row selection', async () => {
    const model = { fields: { name: { type: 'string' } } };
    const store = blinxStore([{ name: 'A' }], model);
    const root = document.createElement('div');
    const onItemClick = jest.fn();
    const onEdit = jest.fn();

    blinxCollection({
      root,
      store,
      view: {
        layout: 'table',
        columns: [{ field: 'name', label: 'Name' }],
        recordControls: {
          edit: { label: 'Edit', action: () => onEdit() },
        },
      },
      paging: { pageSize: 20 },
      onItemClick,
      controls: {}, // keep DOM small
    });

    const cb = root.querySelector('tbody tr input[type="checkbox"]');
    expect(cb.checked).toBe(false);

    const editBtn = Array.from(root.querySelectorAll('tbody tr button')).find(b => b.textContent === 'Edit');
    expect(editBtn).toBeTruthy();
    editBtn.click();
    await Promise.resolve();

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onItemClick).toHaveBeenCalledTimes(0);
    expect(root.querySelector('tbody tr input[type="checkbox"]').checked).toBe(false);
  });

  test('view.recordControls supports multiple actions with visible/disabled guards', async () => {
    const model = { fields: { name: { type: 'string' } } };
    const store = blinxStore([{ name: 'A' }], model);
    const root = document.createElement('div');
    const onItemClick = jest.fn();
    const onEdit = jest.fn();
    const onDelete = jest.fn();

    blinxCollection({
      root,
      store,
      view: {
        layout: 'table',
        columns: [{ field: 'name', label: 'Name' }],
        recordControls: {
          edit: { label: 'Edit', action: () => onEdit() },
          delete: {
            label: 'Delete',
            disabled: (_ctx) => true,
            action: () => onDelete(),
          },
          hidden: {
            label: 'Hidden',
            visible: () => false,
            action: () => { throw new Error('should not run'); },
          },
        },
      },
      paging: { pageSize: 20 },
      onItemClick,
      controls: {},
    });

    // Should render Edit + Delete only (Hidden suppressed)
    const row = root.querySelector('tbody tr');
    const buttons = Array.from(row.querySelectorAll('button'));
    const labels = buttons.map(b => b.textContent);
    expect(labels).toContain('Edit');
    expect(labels).toContain('Delete');
    expect(labels).not.toContain('Hidden');

    const editBtn = buttons.find(b => b.textContent === 'Edit');
    const deleteBtn = buttons.find(b => b.textContent === 'Delete');
    expect(editBtn.disabled).toBe(false);
    expect(deleteBtn.disabled).toBe(true);

    // Clicking disabled button does nothing
    deleteBtn.click();
    await Promise.resolve();
    expect(onDelete).toHaveBeenCalledTimes(0);

    // Clicking edit triggers handler but not row click nor selection toggle
    const cb = row.querySelector('input[type="checkbox"]');
    expect(cb.checked).toBe(false);
    editBtn.click();
    await Promise.resolve();
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onItemClick).toHaveBeenCalledTimes(0);
    expect(row.querySelector('input[type="checkbox"]').checked).toBe(false);
  });
});

