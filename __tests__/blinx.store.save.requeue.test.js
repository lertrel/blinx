import { blinxStore } from '../lib/blinx.store.js';

describe('blinxStore save() re-queue behavior', () => {
  test('does not re-queue already-applied ops when some ops are rejected (regression)', async () => {
    const calls = [];

    const dataSource = {
      init() {},
      async query() {
        return { entities: { Product: [] }, result: [], pageInfo: { totalCount: 0 } };
      },
      async mutate(ops) {
        calls.push(ops.map(o => o.opId));
        if (ops.length <= 1) {
          return { applied: [{ opId: ops[0].opId, status: 'applied' }], rejected: [], conflicts: [], entities: {} };
        }
        // Apply only the first op, reject the rest.
        return {
          applied: [{ opId: ops[0].opId, status: 'applied' }],
          rejected: ops.slice(1).map(o => ({ opId: o.opId, status: 'rejected', error: { code: 'x', message: 'fail' } })),
          conflicts: [],
          entities: {},
        };
      },
    };

    const store = blinxStore({
      model: { fields: {} },
      dataSource,
      view: { name: 'products', resource: 'products', entityType: 'Product', keyField: 'id', defaultPage: { mode: 'page', page: 0, limit: 10 } },
    });

    // Queue two creates.
    store.addRecord({ name: 'A' });
    store.addRecord({ name: 'B' });

    const first = await store.save();
    expect(first.applied.length).toBe(1);
    expect(first.rejected.length).toBe(1);
    expect(calls.length).toBe(1);
    expect(calls[0].length).toBe(2);

    // Second save should retry ONLY the rejected op (not both).
    const second = await store.save();
    expect(second.applied.length).toBe(1);
    expect(second.rejected.length).toBe(0);
    expect(calls.length).toBe(2);
    expect(calls[1]).toEqual([calls[0][1]]);
  });
});

