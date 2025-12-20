import { blinxStore, EventTypes } from '../lib/blinx.store.js';

describe('blinxStore (remote) manager/proxy behavior', () => {
  test('proxies store operations to active view and emits viewChanged', async () => {
    const calls = [];

    const dataSource = {
      init() {},
      async query(spec) {
        calls.push(spec.resource);
        if (spec.resource === 'a') {
          return {
            entities: { Item: [{ id: '1', name: 'A', version: '1' }] },
            result: [{ type: 'Item', id: '1' }],
            pageInfo: { totalCount: 1 },
          };
        }
        if (spec.resource === 'b') {
          return {
            entities: { Item: [{ id: '2', name: 'B', version: '1' }] },
            result: [{ type: 'Item', id: '2' }],
            pageInfo: { totalCount: 1 },
          };
        }
        return { entities: { Item: [] }, result: [], pageInfo: { totalCount: 0 } };
      },
      async mutate() {
        return { applied: [], rejected: [], conflicts: [], entities: {} };
      },
    };

    const store = blinxStore({
      model: { fields: { id: {}, name: {}, version: {} } },
      dataSource,
      defaultView: 'viewA',
      views: {
        viewA: { resource: 'a', entityType: 'Item', keyField: 'id', versionField: 'version', defaultPage: { mode: 'page', page: 0, limit: 10 } },
        viewB: { resource: 'b', entityType: 'Item', keyField: 'id', versionField: 'version', defaultPage: { mode: 'page', page: 0, limit: 10 } },
      }
    });

    const events = [];
    store.subscribe(ev => events.push(ev));

    expect(store.getActiveView()).toBe('viewA');
    await store.loadFirst();
    expect(store.getRecord(0)).toEqual(expect.objectContaining({ name: 'A' }));

    store.setActiveView('viewB');
    const vc = events.find(e => e.path?.[0] === EventTypes.viewChanged);
    expect(vc).toBeDefined();
    expect(vc.value).toEqual({ from: 'viewA', to: 'viewB' });

    await store.loadFirst();
    expect(store.getRecord(0)).toEqual(expect.objectContaining({ name: 'B' }));
    expect(calls).toEqual(expect.arrayContaining(['a', 'b']));

    // Still supports retrieving a concrete view-store
    const viewAStore = store.collection('viewA');
    expect(typeof viewAStore.loadFirst).toBe('function');
  });
});

