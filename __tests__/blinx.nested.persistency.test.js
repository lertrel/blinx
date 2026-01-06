import { blinxStore } from '../lib/blinx.store.js';
import { registerBlinxApp } from '../lib/blinx.app.js';
import { createActionFacade } from '../lib/blinx.action-facade.js';

function createCapturingDataSource(initialEntitiesByType) {
  const calls = { query: 0, mutate: 0, lastOps: null };
  return {
    calls,
    async query(_querySpec, { entityType, keyField = 'id', versionField = 'version' } = {}) {
      calls.query += 1;
      const items = (initialEntitiesByType?.[entityType] || []).map(r => ({ ...r }));
      // Ensure key+version exist.
      items.forEach((r, idx) => {
        if (r[keyField] === undefined || r[keyField] === null) r[keyField] = String(idx + 1);
        if (r[versionField] === undefined) r[versionField] = '1';
      });
      return {
        entities: { [entityType]: items },
        result: items.map(r => ({ type: entityType, id: String(r[keyField]) })),
        pageInfo: { mode: 'offset', offset: 0, limit: 20, totalCount: items.length },
      };
    },
    async mutate(ops) {
      calls.mutate += 1;
      calls.lastOps = ops;
      return { applied: (ops || []).map(o => ({ opId: o.opId })), rejected: [], conflicts: [], entities: {} };
    },
  };
}

describe('Nested spec v0: SNM normalization (persist + diff)', () => {
  const CustomerModel = { id: 'Customer', fields: { id: { type: 'string' }, name: { type: 'string' }, tier: { type: 'string' } } };
  const OrderModel = {
    id: 'Order',
    fields: {
      id: { type: 'string' },
      customer: { type: 'model', model: CustomerModel, embedded: false, ref: { keyField: 'id', labelField: 'name' } },
      products: { type: 'collection', model: { id: 'Product', fields: { id: { type: 'string' }, title: { type: 'string' } } }, embedded: false, ref: { keyField: 'id', labelField: 'title' } },
    }
  };

  test('SNM label-only change does not enqueue update', async () => {
    const ds = createCapturingDataSource({ Order: [{ id: 'o1', customer: { id: 'c1', name: 'Alice' } }] });
    const store = blinxStore({
      model: OrderModel,
      dataSource: ds,
      views: { default: { resource: 'orders', entityType: 'Order', keyField: 'id', versionField: 'version' } },
      defaultView: 'default',
    });

    await store.loadFirst();
    store.setField(0, 'customer', { id: 'c1', name: 'Bob' }); // same id, different label
    await store.save();

    expect(ds.calls.mutate).toBe(0);
  });

  test('SNM id change enqueues update with id only', async () => {
    const ds = createCapturingDataSource({ Order: [{ id: 'o1', customer: { id: 'c1', name: 'Alice' } }] });
    const store = blinxStore({
      model: OrderModel,
      dataSource: ds,
      views: { default: { resource: 'orders', entityType: 'Order', keyField: 'id', versionField: 'version' } },
      defaultView: 'default',
    });

    await store.loadFirst();
    store.setField(0, 'customer', { id: 'c2', name: 'Zed' });
    await store.save();

    expect(ds.calls.mutate).toBe(1);
    expect(ds.calls.lastOps).toHaveLength(1);
    expect(ds.calls.lastOps[0].type).toBe('update');
    expect(ds.calls.lastOps[0].patch.customer).toBe('c2');
  });

  test('SNM create op is normalized to id only', async () => {
    const ds = createCapturingDataSource({ Order: [{ id: 'o1', customer: { id: 'c1', name: 'Alice' } }] });
    const store = blinxStore({
      model: OrderModel,
      dataSource: ds,
      views: { default: { resource: 'orders', entityType: 'Order', keyField: 'id', versionField: 'version' } },
      defaultView: 'default',
    });

    await store.loadFirst();
    store.addRecord({ id: 'o2', customer: { id: 'c3', name: 'Carl' } });
    await store.save();

    expect(ds.calls.mutate).toBe(1);
    expect(ds.calls.lastOps).toHaveLength(1);
    expect(ds.calls.lastOps[0].type).toBe('create');
    expect(ds.calls.lastOps[0].data.customer).toBe('c3');
  });
});

describe('Nested spec v0: action facade SNM patch/delete', () => {
  test('SNM patch updates child store and flush persists child ops', async () => {
    const CustomerModel = { id: 'Customer', fields: { id: { type: 'string' }, tier: { type: 'string' } } };
    const ParentModel = { id: 'Order', fields: { id: { type: 'string' }, customer: { type: 'model', model: CustomerModel, embedded: false, ref: { keyField: 'id' } } } };

    const childDS = createCapturingDataSource({ Customer: [{ id: 'c1', tier: 'silver' }] });
    registerBlinxApp({
      stores: {
        Customer: {
          model: CustomerModel,
          dataSource: childDS,
          views: { default: { resource: 'customers', entityType: 'Customer', keyField: 'id', versionField: 'version' } },
          defaultView: 'default',
        }
      }
    });

    const parent = blinxStore([{ id: 'o1', customer: 'c1' }], ParentModel);
    const facade = createActionFacade({
      store: parent,
      getRecord: () => parent.getRecord(0),
      getRecordIndex: () => 0,
      strict: true,
    });

    // Patch child entity through SNM relationship.
    facade.model().get('customer').patch({ tier: 'gold' });
    await facade.flush();

    expect(childDS.calls.mutate).toBe(1);
    expect(childDS.calls.lastOps).toHaveLength(1);
    expect(childDS.calls.lastOps[0].type).toBe('update');
    expect(childDS.calls.lastOps[0].patch.tier).toBe('gold');
  });

  test('SNM delete deletes child and unlinks parent', async () => {
    const CustomerModel = { id: 'Customer', fields: { id: { type: 'string' } } };
    const ParentModel = { id: 'Order', fields: { id: { type: 'string' }, customer: { type: 'model', model: CustomerModel, embedded: false, ref: { keyField: 'id' } } } };

    const childDS = createCapturingDataSource({ Customer: [{ id: 'c1' }] });
    registerBlinxApp({
      stores: {
        Customer: {
          model: CustomerModel,
          dataSource: childDS,
          views: { default: { resource: 'customers', entityType: 'Customer', keyField: 'id', versionField: 'version' } },
          defaultView: 'default',
        }
      }
    });

    const parent = blinxStore([{ id: 'o1', customer: 'c1' }], ParentModel);
    const facade = createActionFacade({
      store: parent,
      getRecord: () => parent.getRecord(0),
      getRecordIndex: () => 0,
      strict: true,
    });

    facade.model().get('customer').delete();
    await facade.flush();

    expect(childDS.calls.mutate).toBe(1);
    expect(childDS.calls.lastOps[0].type).toBe('delete');
    expect(parent.getRecord(0).customer).toBeNull();
  });
});

