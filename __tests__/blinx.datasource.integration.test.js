import { blinxStore, BlinxArrayDataSource } from '../lib/blinx.store.js';

describe('Blinx remote data layer (query/mutate) integration', () => {
  test('remote-mode store can loadFirst, edit, and save via BlinxArrayDataSource', async () => {
    const model = { fields: { id: { type: 'number' }, name: { type: 'string' } } };
    const ds = new BlinxArrayDataSource([{ id: 1, name: 'A' }], { entityType: 'Product', keyField: 'id', versionField: 'version' });

    const store = blinxStore({
      model,
      dataSource: ds,
      view: { name: 'products', resource: 'products', entityType: 'Product', keyField: 'id', defaultPage: { mode: 'page', page: 0, limit: 20 } },
    });

    await store.loadFirst();
    expect(store.getLength()).toBe(1);
    expect(store.getRecord(0).name).toBe('A');

    store.setField(0, 'name', 'B');
    expect(store.diff()).toEqual([{ index: 0, field: 'name', from: 'A', to: 'B' }]);

    const res = await store.save();
    expect(res.conflicts || []).toEqual([]);
    expect(res.rejected || []).toEqual([]);
    expect(store.diff()).toEqual([]);
    expect(store.getRecord(0).name).toBe('B');
  });

  test('remote-mode store supports pagination via pageNext/pagePrev', async () => {
    const model = { fields: { id: { type: 'number' }, name: { type: 'string' } } };
    const ds = new BlinxArrayDataSource(
      [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }],
      { entityType: 'Product', keyField: 'id', versionField: 'version' }
    );

    const store = blinxStore({
      model,
      dataSource: ds,
      view: { name: 'products', resource: 'products', entityType: 'Product', keyField: 'id', defaultPage: { mode: 'cursor', after: null, limit: 2 } },
    });

    await store.loadFirst();
    expect(store.toJSON().map(r => r.id)).toEqual([1, 2]);
    expect(store.getPagingState().pageState.pageIndex).toBe(0);

    await store.pageNext();
    expect(store.toJSON().map(r => r.id)).toEqual([3]);
    expect(store.getPagingState().pageState.pageIndex).toBe(1);

    await store.pagePrev();
    expect(store.toJSON().map(r => r.id)).toEqual([1, 2]);
    expect(store.getPagingState().pageState.pageIndex).toBe(0);
  });
});

