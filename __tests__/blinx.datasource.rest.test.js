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

  test('query(): throws on non-2xx HTTP responses (does not silently return empty data)', async () => {
    const fetch = async () => makeResponse({ status: 500, json: { message: 'server down' } });

    const ds = new BlinxRestDataSource({ baseUrl: 'https://api.test', fetch });
    ds.init({ defaults: { entityType: 'Product', keyField: 'id', versionField: 'version' } });

    await expect(ds.query({ resource: 'products', entityType: 'Product' })).rejects.toThrow('server down');
  });

  test('query(): when server returns primitive items, datasource wraps them (never pushes primitives into entities)', async () => {
    const fetch = async () => makeResponse({
      status: 200,
      headers: { etag: '"v1"' },
      json: ['OK'],
    });

    const ds = new BlinxRestDataSource({ baseUrl: 'https://api.test', fetch });
    ds.init({ defaults: { entityType: 'Product', keyField: 'id', versionField: 'version' } });

    const res = await ds.query({ resource: 'products', entityType: 'Product', page: { mode: 'page', page: 0, limit: 10 } });

    expect(res.result).toEqual([{ type: 'Product', id: '0' }]);
    expect(res.entities.Product.length).toBe(1);
    expect(typeof res.entities.Product[0]).toBe('object');
    expect(res.entities.Product[0]).toEqual(expect.objectContaining({
      id: '0',
      value: 'OK',
      version: '"v1"',
    }));
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

  test('mutate(update): when server returns primitive JSON body (e.g. \"OK\"), datasource still returns an object entity (never a primitive)', async () => {
    const fetchCalls = [];
    const fetch = async (url, init) => {
      fetchCalls.push({ url, init });
      return makeResponse({
        status: 200,
        headers: { etag: '"v2"' },
        json: 'OK',
      });
    };

    const ds = new BlinxRestDataSource({ baseUrl: 'https://api.test', fetch });
    ds.init({ defaults: { entityType: 'Product', keyField: 'id', versionField: 'version' } });

    const res = await ds.mutate([
      { opId: 'u1', type: 'update', entity: { type: 'Product', id: '1' }, patch: { name: 'B' }, baseVersion: '"v1"' }
    ], { resource: 'products', entityType: 'Product', keyField: 'id', versionField: 'version' });

    expect(fetchCalls.length).toBe(1);
    expect(res.applied.map(a => a.opId)).toEqual(['u1']);
    expect(res.rejected).toEqual([]);
    expect(res.conflicts).toEqual([]);

    expect(res.entities.Product.length).toBe(1);
    // Critical: entity must be an object, even if server returned a primitive.
    // Current behavior: ignore primitive response body and fall back to payload + ETag-derived version.
    expect(typeof res.entities.Product[0]).toBe('object');
    expect(res.entities.Product[0]).toEqual(expect.objectContaining({
      id: '1',
      name: 'B',
      version: '"v2"',
    }));
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

  test('mutate(): multi-op same record => first update applied, second update 412 + GET latest => conflict (order: PATCH, PATCH, GET)', async () => {
    const fetchCalls = [];
    const fetch = async (url, init) => {
      fetchCalls.push({ url, init });

      // 1) PATCH #1 -> ok
      if (fetchCalls.length === 1) {
        return makeResponse({ status: 200, headers: { etag: '"v2"' }, json: { id: '1', name: 'B' } });
      }
      // 2) PATCH #2 -> 412 conflict
      if (fetchCalls.length === 2) {
        return makeResponse({ status: 412, json: { message: 'stale' } });
      }
      // 3) GET latest for conflict payload
      return makeResponse({ status: 200, headers: { etag: '"v9"' }, json: { id: '1', name: 'Server', version: '"v9"' } });
    };

    const ds = new BlinxRestDataSource({ baseUrl: 'https://api.test', fetch });
    ds.init({ defaults: { entityType: 'Product', keyField: 'id', versionField: 'version' } });

    const res = await ds.mutate([
      { opId: 'u1', type: 'update', entity: { type: 'Product', id: '1' }, patch: { name: 'B' }, baseVersion: '"v1"' },
      { opId: 'u2', type: 'update', entity: { type: 'Product', id: '1' }, patch: { price: 2 }, baseVersion: '"v1"' },
    ], { resource: 'products', entityType: 'Product', keyField: 'id', versionField: 'version' });

    expect(fetchCalls.length).toBe(3);
    expect(fetchCalls.map(c => c.init.method)).toEqual(['PATCH', 'PATCH', 'GET']);
    expect(fetchCalls[0].url).toBe('https://api.test/products/1');
    expect(fetchCalls[1].url).toBe('https://api.test/products/1');
    expect(fetchCalls[2].url).toBe('https://api.test/products/1');
    expect(fetchCalls[0].init.headers['If-Match']).toBe('"v1"');
    expect(fetchCalls[1].init.headers['If-Match']).toBe('"v1"');

    expect(res.applied.map(a => a.opId)).toEqual(['u1']);
    expect(res.rejected).toEqual([]);
    expect(res.conflicts).toEqual([
      expect.objectContaining({
        opId: 'u2',
        status: 'conflict',
        latestVersion: '"v9"',
        server: expect.objectContaining({ id: '1', name: 'Server' }),
        local: expect.objectContaining({ opId: 'u2' }),
        httpStatus: 412,
      }),
    ]);
    expect(res.entities.Product).toEqual([expect.objectContaining({ id: '1', name: 'B', version: '"v2"' })]);
  });

  test('mutate(): same record, multiple ops on different fields (both applied, in order, no merging at datasource layer)', async () => {
    const fetchCalls = [];
    const fetch = async (url, init) => {
      fetchCalls.push({ url, init });
      // Echo back what server would return as canonical record.
      if (fetchCalls.length === 1) {
        return makeResponse({ status: 200, headers: { etag: '"v2"' }, json: { id: '1', name: 'B' } });
      }
      return makeResponse({ status: 200, headers: { etag: '"v3"' }, json: { id: '1', price: 2 } });
    };

    const ds = new BlinxRestDataSource({ baseUrl: 'https://api.test', fetch });
    ds.init({ defaults: { entityType: 'Product', keyField: 'id', versionField: 'version' } });

    const res = await ds.mutate([
      { opId: 'u1', type: 'update', entity: { type: 'Product', id: '1' }, patch: { name: 'B' }, baseVersion: '"v1"' },
      { opId: 'u2', type: 'update', entity: { type: 'Product', id: '1' }, patch: { price: 2 }, baseVersion: '"v2"' },
    ], { resource: 'products', entityType: 'Product', keyField: 'id', versionField: 'version' });

    expect(fetchCalls.length).toBe(2);
    expect(fetchCalls.map(c => c.init.method)).toEqual(['PATCH', 'PATCH']);
    expect(fetchCalls[0].init.headers['If-Match']).toBe('"v1"');
    expect(fetchCalls[1].init.headers['If-Match']).toBe('"v2"');
    expect(JSON.parse(fetchCalls[0].init.body)).toEqual({ name: 'B' });
    expect(JSON.parse(fetchCalls[1].init.body)).toEqual({ price: 2 });

    expect(res.conflicts).toEqual([]);
    expect(res.rejected).toEqual([]);
    expect(res.applied.map(a => a.opId)).toEqual(['u1', 'u2']);
    // Datasource returns canonical records per successful op; store decides how to apply.
    expect(res.entities.Product.map(r => r.version)).toEqual(['"v2"', '"v3"']);
  });

  test('mutate(): different records, mixed results in one call (u1 applied, u2 412+GET conflict)', async () => {
    const fetchCalls = [];
    const fetch = async (url, init) => {
      fetchCalls.push({ url, init });
      // 1) PATCH /1 -> ok
      if (fetchCalls.length === 1) {
        return makeResponse({ status: 200, headers: { etag: '"v2"' }, json: { id: '1', name: 'B' } });
      }
      // 2) PATCH /2 -> 412
      if (fetchCalls.length === 2) {
        return makeResponse({ status: 412, json: { message: 'stale' } });
      }
      // 3) GET /2 latest
      return makeResponse({ status: 200, headers: { etag: '"v8"' }, json: { id: '2', name: 'Server2', version: '"v8"' } });
    };

    const ds = new BlinxRestDataSource({ baseUrl: 'https://api.test', fetch });
    ds.init({ defaults: { entityType: 'Product', keyField: 'id', versionField: 'version' } });

    const res = await ds.mutate([
      { opId: 'u1', type: 'update', entity: { type: 'Product', id: '1' }, patch: { name: 'B' }, baseVersion: '"v1"' },
      { opId: 'u2', type: 'update', entity: { type: 'Product', id: '2' }, patch: { name: 'X' }, baseVersion: '"v1"' },
    ], { resource: 'products', entityType: 'Product', keyField: 'id', versionField: 'version' });

    expect(fetchCalls.length).toBe(3);
    expect(fetchCalls.map(c => `${c.init.method} ${c.url}`)).toEqual([
      'PATCH https://api.test/products/1',
      'PATCH https://api.test/products/2',
      'GET https://api.test/products/2',
    ]);
    expect(res.applied.map(a => a.opId)).toEqual(['u1']);
    expect(res.conflicts.map(c => c.opId)).toEqual(['u2']);
    expect(res.entities.Product).toEqual([expect.objectContaining({ id: '1', name: 'B', version: '"v2"' })]);
  });

  test('mutate(): throws when transport fails mid-batch (best-effort semantics delegated to store re-queue)', async () => {
    const fetchCalls = [];
    const fetch = async (url, init) => {
      fetchCalls.push({ url, init });
      if (fetchCalls.length === 1) {
        return makeResponse({ status: 200, headers: { etag: '"v2"' }, json: { id: '1', name: 'B' } });
      }
      throw new Error('network down');
    };

    const ds = new BlinxRestDataSource({ baseUrl: 'https://api.test', fetch });
    ds.init({ defaults: { entityType: 'Product', keyField: 'id', versionField: 'version' } });

    await expect(ds.mutate([
      { opId: 'u1', type: 'update', entity: { type: 'Product', id: '1' }, patch: { name: 'B' }, baseVersion: '"v1"' },
      { opId: 'u2', type: 'update', entity: { type: 'Product', id: '2' }, patch: { name: 'C' }, baseVersion: '"v1"' },
    ], { resource: 'products', entityType: 'Product', keyField: 'id', versionField: 'version' })).rejects.toThrow('network down');

    expect(fetchCalls.length).toBe(2);
    expect(fetchCalls[0].init.method).toBe('PATCH');
    expect(fetchCalls[1].init.method).toBe('PATCH');
  });

  test('mutate(): supports mixed applied + rejected within one call (does not throw)', async () => {
    const fetchCalls = [];
    const fetch = async (url, init) => {
      fetchCalls.push({ url, init });
      if (url.endsWith('/1')) {
        return makeResponse({ status: 200, headers: { etag: '"v2"' }, json: { id: '1', name: 'B' } });
      }
      // Not found for record 2
      return makeResponse({ status: 404, json: { message: 'Not found' } });
    };

    const ds = new BlinxRestDataSource({ baseUrl: 'https://api.test', fetch });
    ds.init({ defaults: { entityType: 'Product', keyField: 'id', versionField: 'version' } });

    const res = await ds.mutate([
      { opId: 'u1', type: 'update', entity: { type: 'Product', id: '1' }, patch: { name: 'B' }, baseVersion: '"v1"' },
      { opId: 'u2', type: 'update', entity: { type: 'Product', id: '2' }, patch: { name: 'C' }, baseVersion: '"v1"' },
    ], { resource: 'products', entityType: 'Product', keyField: 'id', versionField: 'version' });

    expect(fetchCalls.length).toBe(2);
    expect(res.applied.map(a => a.opId)).toEqual(['u1']);
    expect(res.conflicts).toEqual([]);
    expect(res.rejected).toEqual([
      expect.objectContaining({ opId: 'u2', status: 'rejected', error: expect.objectContaining({ code: 'not_found', httpStatus: 404 }) }),
    ]);
  });
});
