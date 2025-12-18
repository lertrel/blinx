import { blinxStore } from '../lib/blinx.store.js';

describe('blinxStore multi-view', () => {
  test('store.collection(name) is stable and views keep independent state while sharing one dataSource', async () => {
    const initCalls = [];
    const queryCalls = [];
    const mutateCalls = [];

    const dataSource = {
      init(args) { initCalls.push(args); },
      async query(querySpec) {
        queryCalls.push({ ...querySpec });
        if (querySpec.resource === 'products') {
          return {
            entities: { Product: [{ id: 'p1', name: 'Milk', version: '1' }] },
            result: [{ type: 'Product', id: 'p1' }],
            pageInfo: { totalCount: 1, nextCursor: null, prevCursor: null },
          };
        }
        if (querySpec.resource === 'orders') {
          return {
            entities: { Order: [{ id: 'o1', total: 10, version: '1' }] },
            result: [{ type: 'Order', id: 'o1' }],
            pageInfo: { totalCount: 1, nextCursor: null, prevCursor: null },
          };
        }
        return { entities: {}, result: [], pageInfo: { totalCount: 0 } };
      },
      async mutate(ops) {
        mutateCalls.push(ops.map(o => ({ type: o.type, entity: o.entity, patch: o.patch, data: o.data, opId: o.opId })));
        return { applied: ops.map(o => ({ opId: o.opId, status: 'applied' })), rejected: [], conflicts: [], entities: {} };
      },
    };

    const store = blinxStore({
      model: { fields: { id: {}, name: {}, total: {}, version: {} } },
      dataSource,
      defaultView: 'products',
      views: {
        products: { resource: 'products', entityType: 'Product', keyField: 'id', versionField: 'version', defaultPage: { mode: 'page', page: 0, limit: 10 } },
        orders: { resource: 'orders', entityType: 'Order', keyField: 'id', versionField: 'version', defaultPage: { mode: 'page', page: 0, limit: 10 } },
      }
    });

    // Data source is initialized exactly once at store creation.
    expect(initCalls.length).toBe(1);

    const products1 = store.collection('products');
    const products2 = store.collection('products');
    const orders1 = store.collection('orders');
    const orders2 = store.collection('orders');

    expect(products1).toBe(products2);
    expect(orders1).toBe(orders2);
    expect(products1).not.toBe(orders1);

    await products1.loadFirst();
    await orders1.loadFirst();

    expect(products1.getRecord(0)).toEqual(expect.objectContaining({ id: 'p1', name: 'Milk' }));
    expect(orders1.getRecord(0)).toEqual(expect.objectContaining({ id: 'o1', total: 10 }));

    // Independent criteria: search on one view doesn't mutate the other's state.
    await orders1.search({ filter: { status: 'open' } });
    expect(orders1.getStatus().criteria.filter).toEqual({ status: 'open' });
    expect(products1.getStatus().criteria.filter).toBeNull();

    // Independent pending ops: save only flushes ops for that view.
    products1.setField(0, 'name', 'Milk2');
    await products1.save();
    expect(mutateCalls.length).toBe(1);
    expect(mutateCalls[0].some(o => o.entity?.type === 'Product')).toBe(true);
    expect(mutateCalls[0].some(o => o.entity?.type === 'Order')).toBe(false);

    orders1.setField(0, 'total', 20);
    await orders1.save();
    expect(mutateCalls.length).toBe(2);
    expect(mutateCalls[1].some(o => o.entity?.type === 'Order')).toBe(true);
    expect(mutateCalls[1].some(o => o.entity?.type === 'Product')).toBe(false);

    // Sanity: both views issued queries with their own resources.
    expect(queryCalls.some(q => q.resource === 'products')).toBe(true);
    expect(queryCalls.some(q => q.resource === 'orders')).toBe(true);
  });
});

