import { blinxStore } from '../lib/blinx.store.js';
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
    async json() { return json; },
  };
}

describe('blinxStore + BlinxRestDataSource', () => {
  test('save(): when mutate throws, all ops are re-queued and retried on next save()', async () => {
    const calls = [];
    let shouldThrow = true;

    const fetch = async (url, init) => {
      calls.push({ url, init });
      if (shouldThrow) {
        shouldThrow = false;
        throw new Error('network down');
      }
      // Create succeeds on retry.
      return makeResponse({ status: 201, headers: { etag: '"v1"' }, json: { id: 'p1', name: 'A', version: '"v1"' } });
    };

    const ds = new BlinxRestDataSource({ baseUrl: 'https://api.test', fetch });

    const store = blinxStore({
      model: { fields: { id: {}, name: {}, version: {} } },
      dataSource: ds,
      view: { name: 'products', resource: 'products', entityType: 'Product', keyField: 'id', versionField: 'version', defaultPage: { mode: 'page', page: 0, limit: 10 } },
    });

    store.addRecord({ name: 'A' });

    await expect(store.save()).rejects.toThrow('network down');
    // Next save retries the same create.
    const res = await store.save();

    expect(res.rejected || []).toEqual([]);
    expect(res.conflicts || []).toEqual([]);
    expect(res.applied.length).toBe(1);
    // Two fetch attempts: first threw, second succeeded.
    expect(calls.length).toBe(2);
    expect(calls[0].init.method).toBe('POST');
    expect(calls[1].init.method).toBe('POST');
  });

  test('save(): reconciles server-assigned ids for create ops when serverId is returned', async () => {
    const fetch = async (url, init) => {
      // The store generates a tmp id, but the server returns a canonical id.
      if (init.method === 'POST') {
        return makeResponse({ status: 201, headers: { etag: '"v1"' }, json: { id: 'p100', name: 'A', version: '"v1"' } });
      }
      throw new Error(`Unexpected request: ${init.method} ${url}`);
    };

    const ds = new BlinxRestDataSource({ baseUrl: 'https://api.test', fetch });

    const store = blinxStore({
      model: { fields: { id: {}, name: {}, version: {} } },
      dataSource: ds,
      view: { name: 'products', resource: 'products', entityType: 'Product', keyField: 'id', versionField: 'version', defaultPage: { mode: 'page', page: 0, limit: 10 } },
    });

    const idx = store.addRecord({ name: 'A' });
    const before = store.getRecord(idx).id;
    expect(String(before)).toContain('tmp-');

    const res = await store.save();
    expect(res.rejected || []).toEqual([]);
    expect(res.conflicts || []).toEqual([]);

    const after = store.getRecord(idx).id;
    expect(after).toBe('p100');
    expect(store.getRecord(idx)).toEqual(expect.objectContaining({ id: 'p100', name: 'A', version: '"v1"' }));
  });
});
