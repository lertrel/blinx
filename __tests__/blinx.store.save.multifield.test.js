import { blinxStore } from '../lib/blinx.store.js';

describe('blinxStore save() multi-field edits', () => {
  test('coalesces multiple setField updates into one op to avoid self-conflicts (regression)', async () => {
    const mutateCalls = [];
    const server = { id: '1', name: 'A', price: 1, version: '1' };

    const dataSource = {
      init() {},
      async query() {
        return {
          entities: { Product: [server] },
          result: [{ type: 'Product', id: '1' }],
          pageInfo: { totalCount: 1 },
        };
      },
      async mutate(ops) {
        mutateCalls.push(ops);
        // Simulate server-side optimistic concurrency: each update must match current version.
        // If multiple update ops are sent with the same baseVersion, later ones conflict.
        const applied = [];
        const rejected = [];
        const conflicts = [];

        for (const op of ops) {
          if (op.type !== 'update') continue;
          if (String(op.baseVersion) !== String(server.version)) {
            conflicts.push({ opId: op.opId, status: 'conflict', latestVersion: server.version, server: { ...server }, local: op });
            continue;
          }
          Object.assign(server, op.patch || {});
          server.version = String((parseInt(server.version, 10) || 0) + 1);
          applied.push({ opId: op.opId, status: 'applied' });
        }

        return { applied, rejected, conflicts, entities: { Product: [{ ...server }] } };
      },
    };

    const store = blinxStore({
      model: { fields: { id: {}, name: {}, price: {} } },
      dataSource,
      view: { name: 'products', resource: 'products', entityType: 'Product', keyField: 'id', versionField: 'version', defaultPage: { mode: 'page', page: 0, limit: 10 } },
    });

    await store.loadFirst();

    // User edits two fields before saving.
    store.setField(0, 'name', 'B');
    store.setField(0, 'price', 2);

    const res = await store.save();

    expect(res.conflicts || []).toEqual([]);
    expect(mutateCalls.length).toBe(1);
    // Regression assertion: should be a single update op with merged patch.
    expect(mutateCalls[0].filter(o => o.type === 'update').length).toBe(1);
    expect(mutateCalls[0][0]).toEqual(expect.objectContaining({
      type: 'update',
      entity: { type: 'Product', id: '1' },
      patch: { name: 'B', price: 2 },
      baseVersion: '1',
    }));
  });
});

