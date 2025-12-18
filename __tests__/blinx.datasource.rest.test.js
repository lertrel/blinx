import { BlinxRestDataSource } from '../lib/blinx.datasource.js';

function makeHeaders(map = {}) {
  const lower = new Map(Object.entries(map).map(([k, v]) => [String(k).toLowerCase(), String(v)]));
  return {
    get(name) {
      return lower.has(String(name).toLowerCase()) ? lower.get(String(name).toLowerCase()) : null;
    }
  };
}

function makeResponse({ status = 200, json = null, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: makeHeaders(headers),
    async json() {
      if (json instanceof Error) throw json;
      return json;
    },
  };
}

describe('BlinxRestDataSource', () => {
  test('query(): builds URL with filter/sort/paging and normalizes entities/result', async () => {
    const fetchCalls = [];
    const fetch = async (url, init) => {
      fetchCalls.push({ url, init });
      return makeResponse({
        status: 200,
        headers: { 'x-total-count': '2' },
        json: [{ id: 2, name: 'B' }],
      });
    };

    const ds = new BlinxRestDataSource({ baseUrl: 'https://api.test', fetch });
    ds.init({ defaults: { entityType: 'Product', keyField: 'id', versionField: 'version' } });

    const res = await ds.query({
      resource: 'products',
      entityType: 'Product',
      filter: { category: 'x' },
      sort: [{ field: 'name', dir: 'desc' }],
      page: { mode: 'page', page: 1, limit: 10 },
    });

    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].init.method).toBe('GET');
    // URL shape is default-mapped and should include key params.
    expect(fetchCalls[0].url).toContain('https://api.test/products');
    expect(fetchCalls[0].url).toContain('category=x');
    expect(fetchCalls[0].url).toContain('sort=-name');
    expect(fetchCalls[0].url).toContain('page=1');
    expect(fetchCalls[0].url).toContain('limit=10');

    expect(res.pageInfo.totalCount).toBe(2);
    expect(res.result).toEqual([{ type: 'Product', id: '2' }]);
    expect(res.entities.Product[0]).toEqual(expect.objectContaining({ id: '2', name: 'B' }));
    // Version is always materialized (best-effort) so the store can compute baseVersion.
    expect(res.entities.Product[0].version).toBeDefined();
  });

  test('mutate(update): sends If-Match from baseVersion and returns canonical entity with ETag as version', async () => {
    const fetchCalls = [];
    const fetch = async (url, init) => {
      fetchCalls.push({ url, init });
      return makeResponse({
        status: 200,
        headers: { etag: '"v2"' },
        json: { id: '1', name: 'B' },
      });
    };

    const ds = new BlinxRestDataSource({ baseUrl: 'https://api.test', fetch });
    ds.init({ defaults: { entityType: 'Product', keyField: 'id', versionField: 'version' } });

    const res = await ds.mutate([
      { opId: 'u1', type: 'update', entity: { type: 'Product', id: '1' }, patch: { name: 'B' }, baseVersion: '"v1"' }
    ], { resource: 'products', entityType: 'Product', keyField: 'id', versionField: 'version' });

    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toBe('https://api.test/products/1');
    expect(fetchCalls[0].init.method).toBe('PATCH');
    expect(fetchCalls[0].init.headers['If-Match']).toBe('"v1"');

    expect(res.rejected).toEqual([]);
    expect(res.conflicts).toEqual([]);
    expect(res.applied).toEqual([expect.objectContaining({ opId: 'u1', status: 'applied' })]);
    expect(res.entities.Product[0]).toEqual(expect.objectContaining({ id: '1', name: 'B', version: '"v2"' }));
  });

  test('mutate(update): maps 412 to conflict and fetches latest record for conflict payload', async () => {
    const fetchCalls = [];
    const fetch = async (url, init) => {
      fetchCalls.push({ url, init });
      // First call: PATCH => precondition failed.
      if (fetchCalls.length === 1) {
        return makeResponse({ status: 412, json: { message: 'stale' } });
      }
      // Second call: GET latest
      return makeResponse({
        status: 200,
        headers: { etag: '"v2"' },
        json: { id: '1', name: 'Server', version: '"v2"' },
      });
    };

    const ds = new BlinxRestDataSource({ baseUrl: 'https://api.test', fetch });
    ds.init({ defaults: { entityType: 'Product', keyField: 'id', versionField: 'version' } });

    const res = await ds.mutate([
      { opId: 'u1', type: 'update', entity: { type: 'Product', id: '1' }, patch: { name: 'Local' }, baseVersion: '"v1"' }
    ], { resource: 'products', entityType: 'Product', keyField: 'id', versionField: 'version' });

    expect(fetchCalls.length).toBe(2);
    expect(fetchCalls[0].init.method).toBe('PATCH');
    expect(fetchCalls[1].init.method).toBe('GET');

    expect(res.applied).toEqual([]);
    expect(res.rejected).toEqual([]);
    expect(res.conflicts).toEqual([
      expect.objectContaining({
        opId: 'u1',
        status: 'conflict',
        latestVersion: '"v2"',
        server: expect.objectContaining({ id: '1', name: 'Server' }),
        httpStatus: 412,
      })
    ]);
  });

  test('mutate(): throws on transport failure (so store can re-queue all ops)', async () => {
    const fetch = async () => {
      throw new Error('network down');
    };

    const ds = new BlinxRestDataSource({ baseUrl: 'https://api.test', fetch });
    ds.init({ defaults: { entityType: 'Product', keyField: 'id', versionField: 'version' } });

    await expect(ds.mutate([
      { opId: 'u1', type: 'update', entity: { type: 'Product', id: '1' }, patch: { name: 'B' }, baseVersion: '"v1"' }
    ], { resource: 'products', entityType: 'Product' })).rejects.toThrow('network down');
  });
});
