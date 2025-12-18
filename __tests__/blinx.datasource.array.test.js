import { BlinxArrayDataSource } from '../lib/blinx.datasource.js';

describe('BlinxArrayDataSource', () => {
  test('query(): supports object filter + sort + page mode "page" and returns pageInfo.totalCount', async () => {
    const ds = new BlinxArrayDataSource(
      [
        { id: 1, name: 'B', category: 'x' },
        { id: 2, name: 'A', category: 'x' },
        { id: 3, name: 'C', category: 'y' },
      ],
      { entityType: 'Product', keyField: 'id', versionField: 'version' }
    );

    const res = await ds.query({
      resource: 'products',
      entityType: 'Product',
      filter: { category: 'x' },
      sort: [{ field: 'name', dir: 'asc' }],
      page: { mode: 'page', page: 0, limit: 1 },
    });

    expect(res.pageInfo.totalCount).toBe(2);
    expect(res.result).toEqual([{ type: 'Product', id: '2' }]); // A first
    expect(res.entities.Product[0]).toEqual(expect.objectContaining({ id: 2, name: 'A' }));
    // version is auto-added in query results when missing
    expect(res.entities.Product[0].version).toBeDefined();
  });

  test('query(): supports predicate filter + page mode "offset"', async () => {
    const ds = new BlinxArrayDataSource(
      [{ id: 1, n: 10 }, { id: 2, n: 20 }, { id: 3, n: 30 }, { id: 4, n: 40 }],
      { entityType: 'Thing', keyField: 'id', versionField: 'version' }
    );

    const res = await ds.query({
      resource: 'things',
      entityType: 'Thing',
      filter: (r) => r.n >= 20,
      page: { mode: 'offset', offset: 1, limit: 2 }, // after filtering => [20,30,40] -> offset 1 => [30,40]
    });

    expect(res.result.map(x => x.id)).toEqual(['3', '4']);
    expect(res.pageInfo.totalCount).toBe(3);
  });

  test('query(): supports page mode "cursor" with next/prev cursor info', async () => {
    const ds = new BlinxArrayDataSource(
      [{ id: 1 }, { id: 2 }, { id: 3 }],
      { entityType: 'Item', keyField: 'id', versionField: 'version' }
    );

    const first = await ds.query({
      resource: 'items',
      entityType: 'Item',
      page: { mode: 'cursor', after: null, limit: 2 },
    });

    expect(first.result.map(x => x.id)).toEqual(['1', '2']);
    expect(first.pageInfo.nextCursor).toBe('2');
    expect(first.pageInfo.prevCursor).toBeNull();
    expect(first.pageInfo.hasNext).toBe(true);
    expect(first.pageInfo.hasPrev).toBe(false);

    const next = await ds.query({
      resource: 'items',
      entityType: 'Item',
      page: { mode: 'cursor', after: first.pageInfo.nextCursor, limit: 2 },
    });

    expect(next.result.map(x => x.id)).toEqual(['3']);
    expect(next.pageInfo.nextCursor).toBeNull();
    expect(next.pageInfo.prevCursor).toBe('0');
    expect(next.pageInfo.hasNext).toBe(false);
    expect(next.pageInfo.hasPrev).toBe(true);
  });

  test('mutate(): create/update/delete + version bumping', async () => {
    const ds = new BlinxArrayDataSource(
      [{ id: 1, name: 'A', version: '1' }],
      { entityType: 'Product', keyField: 'id', versionField: 'version' }
    );

    const created = await ds.mutate([
      { opId: 'c1', type: 'create', entity: { type: 'Product' }, data: { id: 2, name: 'B' } },
    ]);

    expect(created.applied).toEqual([expect.objectContaining({ opId: 'c1', status: 'applied', serverId: '2' })]);
    expect(created.entities.Product[0]).toEqual(expect.objectContaining({ id: '2', name: 'B', version: '1' }));

    const updated = await ds.mutate([
      { opId: 'u1', type: 'update', entity: { type: 'Product', id: 1 }, patch: { name: 'A2' }, baseVersion: '1' },
    ]);

    expect(updated.conflicts).toEqual([]);
    expect(updated.rejected).toEqual([]);
    expect(updated.entities.Product[0]).toEqual(expect.objectContaining({ id: 1, name: 'A2', version: '2' }));

    const deleted = await ds.mutate([
      { opId: 'd1', type: 'delete', entity: { type: 'Product', id: 2 }, baseVersion: '1' },
    ]);

    expect(deleted.conflicts).toEqual([]);
    expect(deleted.rejected).toEqual([]);

    const after = await ds.query({ resource: 'products', entityType: 'Product', page: { mode: 'page', page: 0, limit: 10 } });
    expect(after.result.map(x => x.id)).toEqual(['1']);
  });

  test('mutate(): detects conflicts via baseVersion', async () => {
    const ds = new BlinxArrayDataSource(
      [{ id: 1, name: 'A', version: '5' }],
      { entityType: 'Product', keyField: 'id', versionField: 'version' }
    );

    const res = await ds.mutate([
      { opId: 'u1', type: 'update', entity: { type: 'Product', id: 1 }, patch: { name: 'A2' }, baseVersion: '4' },
    ]);

    expect(res.conflicts).toEqual([
      expect.objectContaining({ opId: 'u1', status: 'conflict', latestVersion: '5' }),
    ]);
  });

  test('mutate(): rejects unsupported op types and not-found update/delete', async () => {
    const ds = new BlinxArrayDataSource([{ id: 1, version: '1' }], { entityType: 'Product', keyField: 'id', versionField: 'version' });

    const res = await ds.mutate([
      { opId: 'x1', type: 'nope', entity: { type: 'Product', id: 1 } },
      { opId: 'u404', type: 'update', entity: { type: 'Product', id: 999 }, patch: { name: 'X' }, baseVersion: '1' },
      { opId: 'd404', type: 'delete', entity: { type: 'Product', id: 999 }, baseVersion: '1' },
    ]);

    expect(res.rejected).toEqual(expect.arrayContaining([
      expect.objectContaining({ opId: 'x1', status: 'rejected', error: expect.objectContaining({ code: 'unsupported' }) }),
      expect.objectContaining({ opId: 'u404', status: 'rejected', error: expect.objectContaining({ code: 'not_found' }) }),
      expect.objectContaining({ opId: 'd404', status: 'rejected', error: expect.objectContaining({ code: 'not_found' }) }),
    ]));
  });

  test('mutate(): batch deletes do not use stale array indices (regression)', async () => {
    const ds = new BlinxArrayDataSource(
      [
        { id: 1, version: '1' },
        { id: 2, version: '1' },
        { id: 3, version: '1' },
        { id: 4, version: '1' },
      ],
      { entityType: 'Product', keyField: 'id', versionField: 'version' }
    );

    const res = await ds.mutate([
      // If implementation incorrectly uses cached indices, the second delete can remove the wrong row after the first splice.
      { opId: 'd1', type: 'delete', entity: { type: 'Product', id: 1 }, baseVersion: '1' },
      { opId: 'd3', type: 'delete', entity: { type: 'Product', id: 3 }, baseVersion: '1' },
    ]);

    expect(res.rejected).toEqual([]);
    expect(res.conflicts).toEqual([]);
    expect(res.applied.map(a => a.opId)).toEqual(['d1', 'd3']);

    const after = await ds.query({ resource: 'products', entityType: 'Product', page: { mode: 'page', page: 0, limit: 10 } });
    expect(after.result.map(x => x.id)).toEqual(['2', '4']);
  });
});

