import { blinxStore, EventTypes } from '../lib/blinx.store.js';

describe('blinxStore criteria + cache (local mode)', () => {
  const model = { fields: { id: {}, category: {}, price: {}, version: {} } };

  function makeStore(data, { cacheCompleteness = 'loaded' } = {}) {
    return blinxStore({
      model,
      dataSource: data, // convenience: wrapped into BlinxArrayDataSource
      defaultView: 'default',
      views: {
        default: {
          resource: 'products',
          entityType: 'Product',
          keyField: 'id',
          versionField: 'version',
          defaultPage: { mode: 'cursor', after: null, limit: 2 },
          cache: {
            completeness: cacheCompleteness,
            maxEntities: 1000,
            eviction: { policy: 'lru' },
            fields: { include: ['id', 'category', 'price', 'version'] },
          },
        }
      }
    });
  }

  test('local criteria filters over loaded working-set cache (multi-page)', async () => {
    const store = makeStore([
      { id: '1', category: 'mens', price: 10 },
      { id: '2', category: 'womens', price: 20 },
      { id: '3', category: 'mens', price: 30 },
      { id: '4', category: 'kitchen', price: 40 },
      { id: '5', category: 'mens', price: 50 },
      { id: '6', category: 'womens', price: 60 },
    ]);

    await store.loadFirst(); // caches 1-2
    await store.pageNext();  // caches 3-4

    const base = store.collection('default');
    const lv = base.localView('productSearch');

    await lv.setCriteria({
      scope: 'cached',
      filter: { field: 'category', op: 'eq', value: 'mens' },
      sort: [{ field: 'price', dir: 'asc' }],
      page: { limit: 50 },
    });

    // Only records 1 and 3 match in the loaded cache (5 not yet loaded).
    expect(lv.getLength()).toBe(2);
    expect(lv.toJSON().map(r => r.id)).toEqual(['1', '3']);

    // Remote view store remains unchanged (still on page 2 => ids 3,4).
    expect(base.toJSON().map(r => r.id)).toEqual(['3', '4']);
  });

  test('local criteria with scope=all warms all pages and filters across full cache', async () => {
    const store = makeStore([
      { id: '1', category: 'mens', price: 10 },
      { id: '2', category: 'womens', price: 20 },
      { id: '3', category: 'mens', price: 30 },
      { id: '4', category: 'kitchen', price: 40 },
      { id: '5', category: 'mens', price: 50 },
      { id: '6', category: 'womens', price: 60 },
    ], { cacheCompleteness: 'all' });

    const lv = store.collection('default').localView('productSearch');
    await lv.setCriteria({
      scope: 'all',
      filter: { field: 'category', op: 'eq', value: 'mens' },
      sort: [{ field: 'price', dir: 'desc' }],
      page: { limit: 50 },
    });

    expect(lv.getLength()).toBe(3);
    expect(lv.toJSON().map(r => r.id)).toEqual(['5', '3', '1']);
  });

  test('predicate filter is treated as local escape hatch and criteriaChanged is serializable', async () => {
    const store = makeStore([
      { id: '1', category: 'mens', price: 999 },
      { id: '2', category: 'mens', price: 1000 },
      { id: '3', category: 'mens', price: 5000 },
      { id: '4', category: 'mens', price: 5001 },
    ], { cacheCompleteness: 'all' });

    const base = store.collection('default');
    const lv = base.localView('productSearch');
    const baseEvents = [];
    const localEvents = [];
    base.subscribe(ev => baseEvents.push(ev));
    lv.subscribe(ev => localEvents.push(ev));

    await lv.setCriteria({
      scope: 'all',
      filter: (rec) => rec.category === 'mens' && rec.price >= 1000 && rec.price <= 5000,
      sort: [{ field: 'price', dir: 'asc' }],
      page: { limit: 50 },
      meta: { label: 'mens:1000-5000' },
    });

    expect(lv.toJSON().map(r => r.id)).toEqual(['2', '3']);

    const ce = localEvents.find(e => e?.path?.[0] === EventTypes.criteriaChanged);
    expect(ce).toBeDefined();
    expect(ce.value).toEqual(expect.objectContaining({
      purpose: 'productSearch',
      filterType: 'fn',
      filter: null,
      meta: { label: 'mens:1000-5000' },
    }));

    // Criteria changes should NOT be emitted on the base store event bus.
    expect(baseEvents.some(e => e?.path?.[0] === EventTypes.criteriaChanged)).toBe(false);
  });

  test('localView mutability can be enabled via options', async () => {
    const store = makeStore([{ id: '1', category: 'x', price: 1 }], { cacheCompleteness: 'all' });
    const base = store.collection('default');
    const ro = base.localView('search');
    expect(ro.isMutable()).toBe(false);
    const rw = base.localView('search', { mutable: true });
    expect(rw.isMutable()).toBe(true);
  });

  test('immutable localView commit/reset do not recurse and emit events', async () => {
    const store = makeStore([
      { id: '1', category: 'mens', price: 10 },
      { id: '2', category: 'womens', price: 20 },
    ], { cacheCompleteness: 'all' });

    const lv = store.collection('default').localView('search'); // read-only by default
    const events = [];
    lv.subscribe(ev => events.push(ev));

    await lv.setCriteria({
      scope: 'all',
      filter: { field: 'category', op: 'eq', value: 'mens' },
      page: { limit: 50 },
    });

    events.length = 0;
    expect(() => lv.commit()).not.toThrow();
    expect(() => lv.reset()).not.toThrow();

    expect(events.some(e => e?.path?.[0] === EventTypes.commit)).toBe(true);
    expect(events.some(e => e?.path?.[0] === EventTypes.reset)).toBe(true);
  });
});

