const clone = value => JSON.parse(JSON.stringify(value));

function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function makeQueryKey(querySpec) {
  // Intentional: deterministic, human-readable key for caching/invalidation.
  // DataSource implementations may ignore it; store can also override.
  return `${querySpec?.resource || 'resource'}:${stableStringify(querySpec || {})}`;
}

function applyFilter(records, filter) {
  if (!filter) return records;
  // Minimal, implementation-agnostic filter:
  // - object => equality on fields
  // - function => predicate(record) boolean
  if (typeof filter === 'function') return records.filter(filter);
  if (typeof filter !== 'object') return records;
  const entries = Object.entries(filter);
  if (entries.length === 0) return records;
  return records.filter(rec => entries.every(([k, v]) => rec?.[k] === v));
}

function applySort(records, sort) {
  if (!Array.isArray(sort) || sort.length === 0) return records;
  const specs = sort
    .filter(Boolean)
    .map(s => ({ field: s.field, dir: (s.dir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc' }))
    .filter(s => typeof s.field === 'string' && s.field.length > 0);
  if (specs.length === 0) return records;
  const out = records.slice();
  out.sort((a, b) => {
    for (const s of specs) {
      const av = a?.[s.field];
      const bv = b?.[s.field];
      if (av === bv) continue;
      if (av === undefined || av === null) return s.dir === 'asc' ? 1 : -1;
      if (bv === undefined || bv === null) return s.dir === 'asc' ? -1 : 1;
      if (av < bv) return s.dir === 'asc' ? -1 : 1;
      if (av > bv) return s.dir === 'asc' ? 1 : -1;
    }
    return 0;
  });
  return out;
}

function slicePage(records, page) {
  const mode = page?.mode || 'offset';
  const limit = Number.isFinite(page?.limit) ? page.limit : 20;

  if (mode === 'page') {
    const pageNumber = Number.isFinite(page?.page) ? page.page : 0;
    const offset = Math.max(0, pageNumber) * Math.max(0, limit);
    return { items: records.slice(offset, offset + limit), pageInfo: { page: pageNumber, limit } };
  }

  if (mode === 'cursor') {
    // Cursor is an opaque token; for the array source we use numeric offset cursors.
    const after = page?.after === null || page?.after === undefined ? null : String(page.after);
    const offset = after ? Math.max(0, parseInt(after, 10) || 0) : 0;
    const items = records.slice(offset, offset + limit);
    const nextOffset = offset + items.length;
    return {
      items,
      pageInfo: {
        mode: 'cursor',
        limit,
        nextCursor: nextOffset < records.length ? String(nextOffset) : null,
        prevCursor: offset > 0 ? String(Math.max(0, offset - limit)) : null,
        hasNext: nextOffset < records.length,
        hasPrev: offset > 0,
      }
    };
  }

  // offset mode (default)
  const offset = Number.isFinite(page?.offset) ? page.offset : 0;
  const items = records.slice(Math.max(0, offset), Math.max(0, offset) + limit);
  return { items, pageInfo: { mode: 'offset', offset: Math.max(0, offset), limit } };
}

export class BlinxDataSource {
  init({ model, defaults } = {}) {
    this._model = model || null;
    this._defaults = defaults || {};
  }

  capabilities() {
    return {
      pagination: ['cursor', 'page', 'offset'],
      conflicts: true,
      subscriptions: false,
      offline: false,
    };
  }

  // Implement in derived classes
  async query(_querySpec, _options = {}) {
    throw new Error('BlinxDataSource.query(querySpec, options) is not implemented.');
  }

  // Implement in derived classes
  async mutate(_ops, _options = {}) {
    throw new Error('BlinxDataSource.mutate(ops, options) is not implemented.');
  }

  async close() {}
}

/**
 * In-memory adapter used for backwards compatibility and prototyping.
 * Implements query/mutate on top of a plain array of records.
 */
export class BlinxArrayDataSource extends BlinxDataSource {
  constructor(initialArray = [], { entityType = 'Record', keyField = 'id', versionField = 'version' } = {}) {
    super();
    this._entityType = entityType;
    this._keyField = keyField;
    this._versionField = versionField;
    this._data = clone(initialArray);
    this._nextTmpId = 1;
  }

  init({ model, defaults } = {}) {
    super.init({ model, defaults });
    if (defaults?.entityType) this._entityType = defaults.entityType;
    if (defaults?.keyField) this._keyField = defaults.keyField;
    if (defaults?.versionField) this._versionField = defaults.versionField;
  }

  _getId(rec, fallbackIndex) {
    const v = rec?.[this._keyField];
    if (v === undefined || v === null || v === '') return String(fallbackIndex);
    return String(v);
  }

  _getVersion(rec) {
    const v = rec?.[this._versionField];
    return v === undefined ? null : String(v);
  }

  _bumpVersion(rec) {
    const cur = this._getVersion(rec);
    const next = cur === null ? 1 : (parseInt(cur, 10) || 0) + 1;
    rec[this._versionField] = String(next);
    return rec;
  }

  async query(querySpec = {}, _options = {}) {
    const resource = querySpec.resource || 'resource';
    const entityType = querySpec.entityType || this._entityType;

    let rows = this._data.slice();
    rows = applyFilter(rows, querySpec.filter);
    rows = applySort(rows, querySpec.sort);

    const totalCount = rows.length;
    const { items, pageInfo } = slicePage(rows, querySpec.page || { mode: 'offset', offset: 0, limit: 20 });

    const entities = { [entityType]: [] };
    const result = [];

    items.forEach((rec, idx) => {
      const id = this._getId(rec, idx);
      const withMeta = { ...clone(rec), [this._keyField]: rec?.[this._keyField] ?? id };
      if (this._getVersion(withMeta) === null) this._bumpVersion(withMeta);
      entities[entityType].push(withMeta);
      result.push({ type: entityType, id });
    });

    return {
      entities,
      result,
      pageInfo: { ...pageInfo, totalCount },
      meta: { resource, queryKey: makeQueryKey({ ...querySpec, resource, entityType }), fetchedAt: Date.now() },
    };
  }

  async mutate(ops = [], _options = {}) {
    const entityTypeDefault = this._entityType;
    const applied = [];
    const rejected = [];
    const conflicts = [];
    const entities = {};

    // IMPORTANT: do NOT cache array indices here.
    // Deletes mutate the array via splice(), which shifts indices and makes cached indices stale.
    // Keep only record references, and compute current index at the moment of deletion.
    const byId = new Map();
    this._data.forEach((rec, idx) => byId.set(this._getId(rec, idx), rec));

    for (const op of ops || []) {
      const opId = op?.opId || `op-${Date.now()}-${Math.random()}`;
      const type = op?.type;
      const entityType = op?.entity?.type || op?.entityType || entityTypeDefault;
      const id = op?.entity?.id !== undefined ? String(op.entity.id) : null;
      const baseVersion = op?.baseVersion === undefined || op?.baseVersion === null ? null : String(op.baseVersion);

      try {
        if (type === 'create') {
          const data = clone(op?.data || {});
          const nextId = data?.[this._keyField] ?? `tmp-${this._nextTmpId++}`;
          data[this._keyField] = String(nextId);
          this._bumpVersion(data);
          this._data.push(data);
          byId.set(String(nextId), data);
          if (!entities[entityType]) entities[entityType] = [];
          entities[entityType].push(clone(data));
          applied.push({ opId, status: 'applied', serverId: String(nextId) });
          continue;
        }

        if (type === 'delete') {
          if (!id) throw new Error('delete requires entity.id');
          const found = byId.get(id);
          if (!found) {
            rejected.push({ opId, status: 'rejected', error: { code: 'not_found', message: `Not found: ${id}` } });
            continue;
          }
          const currentVersion = this._getVersion(found);
          if (baseVersion !== null && currentVersion !== null && baseVersion !== currentVersion) {
            conflicts.push({
              opId,
              status: 'conflict',
              latestVersion: currentVersion,
              server: clone(found),
              local: op,
            });
            continue;
          }
          const idx = this._data.findIndex(r => String(r?.[this._keyField]) === String(id));
          if (idx < 0) {
            // Record disappeared mid-batch (e.g., deleted earlier). Treat as not_found.
            rejected.push({ opId, status: 'rejected', error: { code: 'not_found', message: `Not found: ${id}` } });
            continue;
          }
          this._data.splice(idx, 1);
          byId.delete(id);
          applied.push({ opId, status: 'applied' });
          continue;
        }

        if (type === 'update') {
          if (!id) throw new Error('update requires entity.id');
          const found = byId.get(id);
          if (!found) {
            rejected.push({ opId, status: 'rejected', error: { code: 'not_found', message: `Not found: ${id}` } });
            continue;
          }
          const currentVersion = this._getVersion(found);
          if (baseVersion !== null && currentVersion !== null && baseVersion !== currentVersion) {
            conflicts.push({
              opId,
              status: 'conflict',
              latestVersion: currentVersion,
              server: clone(found),
              local: op,
            });
            continue;
          }
          const patch = op?.patch ? clone(op.patch) : null;
          const data = op?.data ? clone(op.data) : null;
          if (patch) Object.assign(found, patch);
          else if (data) Object.assign(found, data);
          this._bumpVersion(found);
          if (!entities[entityType]) entities[entityType] = [];
          entities[entityType].push(clone(found));
          applied.push({ opId, status: 'applied' });
          continue;
        }

        rejected.push({ opId, status: 'rejected', error: { code: 'unsupported', message: `Unsupported op type: ${String(type)}` } });
      } catch (e) {
        rejected.push({ opId, status: 'rejected', error: { code: 'exception', message: e?.message || String(e) } });
      }
    }

    return { applied, rejected, conflicts, entities, invalidations: [], meta: { mutatedAt: Date.now() } };
  }
}

function makeHeadersObject(input) {
  const out = {};
  if (!input) return out;
  if (typeof input !== 'object') return out;
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || v === null) continue;
    out[String(k)] = String(v);
  }
  return out;
}

function getHeader(headers, name) {
  if (!headers || !name) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  // Fallback for plain objects
  const key = String(name).toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (String(k).toLowerCase() === key) return v;
  }
  return null;
}

function parseJsonSafely(res) {
  if (!res || typeof res.json !== 'function') return Promise.resolve(null);
  return res.json().catch(() => null);
}

function joinUrl(baseUrl, path) {
  const b = String(baseUrl || '').replace(/\/+$/, '');
  const p = String(path || '').replace(/^\/+/, '');
  if (!b) return `/${p}`;
  if (!p) return b;
  return `${b}/${p}`;
}

function encodeQueryParams(params) {
  const parts = [];
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      v.forEach(item => parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(item))}`));
      continue;
    }
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

function coerceListPayload(json) {
  // Common list response shapes:
  // - Array => items
  // - { items: [] } / { results: [] } / { data: [] }
  if (Array.isArray(json)) return { items: json, meta: {} };
  if (json && typeof json === 'object') {
    if (Array.isArray(json.items)) return { items: json.items, meta: json };
    if (Array.isArray(json.results)) return { items: json.results, meta: json };
    if (Array.isArray(json.data)) return { items: json.data, meta: json };
  }
  return { items: [], meta: json || {} };
}

/**
 * REST/HTTP data source.
 *
 * Goals:
 * - Match the existing Blinx store contract: query() => {entities, result, pageInfo}; mutate() => {applied, rejected, conflicts, entities}
 * - Provide optimistic concurrency with ETag/If-Match (mapping store's baseVersion to If-Match).
 *
 * This is intentionally adapter-driven to work with many "test APIs":
 * - URL building is configurable but has sensible defaults:
 *   - list:   `${baseUrl}/${resource}`
 *   - item:   `${baseUrl}/${resource}/${id}`
 * - list parsing supports common shapes: array, {items}, {results}, {data}
 * - totalCount may be read from `x-total-count` header or `totalCount/total` fields.
 */
export class BlinxRestDataSource extends BlinxDataSource {
  constructor({
    baseUrl = '',
    fetch: fetchImpl = null,
    headers = {},
    // Optional per-resource config: { [resource]: { path, itemPath, entityType, keyField, versionField } }
    resources = {},
    // Concurrency settings (store baseVersion => If-Match by default)
    concurrency = { mode: 'etag', ifMatchHeader: 'If-Match', etagHeader: 'ETag' },
  } = {}) {
    super();
    this._baseUrl = baseUrl;
    this._fetch = fetchImpl;
    this._headers = makeHeadersObject(headers);
    this._resources = resources || {};
    this._concurrency = {
      mode: concurrency?.mode || 'etag',
      ifMatchHeader: concurrency?.ifMatchHeader || 'If-Match',
      etagHeader: concurrency?.etagHeader || 'ETag',
    };

    // Defaults; may be overridden by init() from store.
    this._entityType = 'Record';
    this._keyField = 'id';
    this._versionField = 'version';
  }

  init({ model, defaults } = {}) {
    super.init({ model, defaults });
    if (defaults?.entityType) this._entityType = defaults.entityType;
    if (defaults?.keyField) this._keyField = defaults.keyField;
    if (defaults?.versionField) this._versionField = defaults.versionField;
  }

  capabilities() {
    return {
      pagination: ['cursor', 'page', 'offset'],
      conflicts: true,
      subscriptions: false,
      offline: false,
    };
  }

  _getFetch() {
    const f = this._fetch || globalThis.fetch;
    if (typeof f !== 'function') {
      throw new Error('BlinxRestDataSource: fetch is not available. Provide { fetch } in constructor options.');
    }
    return f;
  }

  _resourceConfig(resource, entityTypeFromQuery) {
    const cfg = (resource && this._resources && this._resources[resource]) ? this._resources[resource] : null;
    const entityType = cfg?.entityType || entityTypeFromQuery || this._entityType;
    const keyField = cfg?.keyField || this._keyField;
    const versionField = cfg?.versionField || this._versionField;
    const basePath = cfg?.path || resource || 'resource';
    const itemPathTemplate = cfg?.itemPath || `${basePath}/{id}`;
    return { entityType, keyField, versionField, basePath, itemPathTemplate };
  }

  _buildListUrl(querySpec) {
    const resource = querySpec?.resource || 'resource';
    const { basePath } = this._resourceConfig(resource, querySpec?.entityType);
    const params = { ...(querySpec?.params || {}) };

    // Filter: object => shallow equality params
    if (querySpec?.filter && typeof querySpec.filter === 'object' && !Array.isArray(querySpec.filter)) {
      for (const [k, v] of Object.entries(querySpec.filter)) {
        if (v === undefined || v === null) continue;
        params[k] = v;
      }
    }

    // Sort: `sort=field1,-field2` (common convention)
    if (Array.isArray(querySpec?.sort) && querySpec.sort.length) {
      const parts = querySpec.sort
        .filter(Boolean)
        .map(s => {
          const field = s?.field;
          if (!field) return null;
          const dir = (s?.dir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
          return dir === 'desc' ? `-${field}` : String(field);
        })
        .filter(Boolean);
      if (parts.length) params.sort = parts.join(',');
    }

    // Paging
    const page = querySpec?.page || { mode: 'offset', offset: 0, limit: 20 };
    const limit = Number.isFinite(page?.limit) ? page.limit : 20;
    if ((page?.mode || 'offset') === 'page') {
      params.page = Number.isFinite(page?.page) ? page.page : 0;
      params.limit = limit;
    } else if ((page?.mode || 'offset') === 'cursor') {
      params.after = page?.after ?? null;
      params.limit = limit;
    } else {
      params.offset = Number.isFinite(page?.offset) ? page.offset : 0;
      params.limit = limit;
    }

    return joinUrl(this._baseUrl, String(basePath)) + encodeQueryParams(params);
  }

  _buildItemUrl({ resource, id }) {
    const cfg = this._resourceConfig(resource, null);
    const path = String(cfg.itemPathTemplate || '').replace('{id}', encodeURIComponent(String(id)));
    return joinUrl(this._baseUrl, path);
  }

  _normalizeRecord(rec, { keyField, versionField, fallbackVersion = '0' } = {}) {
    if (!rec || typeof rec !== 'object') return rec;
    const out = { ...clone(rec) };
    // Ensure version exists so the store can always compute baseVersion (even if it becomes "0" best-effort).
    if (out[versionField] === undefined) out[versionField] = fallbackVersion;
    // Ensure id is stringy to match the rest of Blinx normalization.
    if (out[keyField] !== undefined && out[keyField] !== null) out[keyField] = String(out[keyField]);
    return out;
  }

  async query(querySpec = {}, _options = {}) {
    const resource = querySpec?.resource || 'resource';
    const { entityType, keyField, versionField } = this._resourceConfig(resource, querySpec?.entityType);
    const fetchImpl = this._getFetch();

    const url = this._buildListUrl({ ...querySpec, resource, entityType });
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { ...this._headers },
    });

    const json = await parseJsonSafely(res);
    const { items, meta } = coerceListPayload(json);

    const totalCountHeader = getHeader(res?.headers, 'x-total-count');
    const totalCountFromHeader = totalCountHeader !== null && totalCountHeader !== undefined ? parseInt(String(totalCountHeader), 10) : null;
    const totalCountFromBody = (meta && typeof meta === 'object')
      ? (meta.totalCount ?? meta.total ?? meta?.pageInfo?.totalCount ?? null)
      : null;
    const totalCount = Number.isFinite(totalCountFromHeader) ? totalCountFromHeader : (Number.isFinite(totalCountFromBody) ? totalCountFromBody : items.length);

    const pageInfoFromBody = (meta && typeof meta === 'object' && meta.pageInfo && typeof meta.pageInfo === 'object') ? meta.pageInfo : null;
    const page = querySpec?.page || { mode: 'offset', offset: 0, limit: 20 };
    const pageInfo = {
      ...(pageInfoFromBody || {}),
      mode: page?.mode || 'offset',
      limit: Number.isFinite(page?.limit) ? page.limit : 20,
      totalCount,
    };

    const entities = { [entityType]: [] };
    const result = [];
    const defaultEtag = getHeader(res?.headers, this._concurrency.etagHeader);
    const fallbackVersion = defaultEtag || '0';

    items.forEach((raw, idx) => {
      const rec = this._normalizeRecord(raw, { keyField, versionField, fallbackVersion });
      const id = rec?.[keyField] !== undefined && rec?.[keyField] !== null ? String(rec[keyField]) : String(idx);
      if (rec && typeof rec === 'object') rec[keyField] = id;
      entities[entityType].push(rec);
      result.push({ type: entityType, id });
    });

    return {
      entities,
      result,
      pageInfo,
      meta: { resource, queryKey: makeQueryKey({ ...querySpec, resource, entityType }), fetchedAt: Date.now(), httpStatus: res?.status },
    };
  }

  async _fetchLatestForConflict({ resource, entityType, keyField, versionField, id }) {
    const fetchImpl = this._getFetch();
    const url = this._buildItemUrl({ resource, id });
    const res = await fetchImpl(url, { method: 'GET', headers: { ...this._headers } });
    const etag = getHeader(res?.headers, this._concurrency.etagHeader);
    const json = await parseJsonSafely(res);
    const record = this._normalizeRecord(json, { keyField, versionField, fallbackVersion: etag || '0' });
    const latestVersion = record?.[versionField] !== undefined ? String(record[versionField]) : (etag ? String(etag) : null);
    return { record, latestVersion, httpStatus: res?.status };
  }

  _errorFromHttp(res, body) {
    const status = res?.status;
    const message = (body && typeof body === 'object' && (body.message || body.error)) ? (body.message || body.error) : `HTTP ${String(status)}`;
    if (status === 404) return { code: 'not_found', message, httpStatus: status };
    if (status === 401) return { code: 'unauthorized', message, httpStatus: status };
    if (status === 403) return { code: 'forbidden', message, httpStatus: status };
    if (status === 400 || status === 422) return { code: 'validation', message, httpStatus: status };
    return { code: 'http_error', message, httpStatus: status };
  }

  async mutate(ops = [], options = {}) {
    const applied = [];
    const rejected = [];
    const conflicts = [];
    const entities = {};
    const fetchImpl = this._getFetch();

    for (const op of ops || []) {
      const opId = op?.opId || `op-${Date.now()}-${Math.random()}`;
      const type = op?.type;
      const resource = op?.resource || options?.resource || this._defaults?.resource || null;
      const entityTypeFromOp = op?.entity?.type || op?.entityType || options?.entityType || null;
      const entityId = op?.entity?.id !== undefined && op?.entity?.id !== null ? String(op.entity.id) : null;
      const baseVersion = op?.baseVersion === undefined || op?.baseVersion === null ? null : String(op.baseVersion);

      const effectiveResource = resource || (entityTypeFromOp ? String(entityTypeFromOp).toLowerCase() + 's' : 'resource');
      const { entityType, keyField, versionField } = this._resourceConfig(effectiveResource, entityTypeFromOp);

      try {
        if (type === 'create') {
          const url = joinUrl(this._baseUrl, this._resourceConfig(effectiveResource, entityTypeFromOp).basePath);
          const data = clone(op?.data || {});
          const res = await fetchImpl(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...this._headers },
            body: JSON.stringify(data),
          });
          const body = await parseJsonSafely(res);
          if (!res?.ok) {
            rejected.push({ opId, status: 'rejected', error: this._errorFromHttp(res, body) });
            continue;
          }
          const etag = getHeader(res?.headers, this._concurrency.etagHeader);
          const rec = this._normalizeRecord(body || data, { keyField, versionField, fallbackVersion: etag || '0' });
          const serverId = rec?.[keyField] !== undefined && rec?.[keyField] !== null ? String(rec[keyField]) : null;
          if (!entities[entityType]) entities[entityType] = [];
          if (rec && typeof rec === 'object') entities[entityType].push(rec);
          applied.push({ opId, status: 'applied', serverId: serverId || undefined });
          continue;
        }

        if (type === 'update') {
          if (!entityId) throw new Error('update requires entity.id');
          const url = this._buildItemUrl({ resource: effectiveResource, id: entityId });
          const payload = op?.patch ? clone(op.patch) : clone(op?.data || {});
          const headers = { 'content-type': 'application/json', ...this._headers };
          if (this._concurrency.mode === 'etag' && baseVersion !== null) {
            headers[this._concurrency.ifMatchHeader] = baseVersion;
          }
          const res = await fetchImpl(url, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(payload),
          });
          if (res?.status === 409 || res?.status === 412) {
            const latest = await this._fetchLatestForConflict({ resource: effectiveResource, entityType, keyField, versionField, id: entityId });
            conflicts.push({
              opId,
              status: 'conflict',
              latestVersion: latest.latestVersion,
              server: latest.record,
              local: op,
              httpStatus: res?.status,
            });
            continue;
          }
          const body = await parseJsonSafely(res);
          if (!res?.ok) {
            rejected.push({ opId, status: 'rejected', error: this._errorFromHttp(res, body) });
            continue;
          }
          const etag = getHeader(res?.headers, this._concurrency.etagHeader);
          const rec = this._normalizeRecord(body || { ...payload, [keyField]: entityId }, { keyField, versionField, fallbackVersion: etag || baseVersion || '0' });
          rec[keyField] = String(rec[keyField] ?? entityId);
          if (!entities[entityType]) entities[entityType] = [];
          entities[entityType].push(rec);
          applied.push({ opId, status: 'applied' });
          continue;
        }

        if (type === 'delete') {
          if (!entityId) throw new Error('delete requires entity.id');
          const url = this._buildItemUrl({ resource: effectiveResource, id: entityId });
          const headers = { ...this._headers };
          if (this._concurrency.mode === 'etag' && baseVersion !== null) {
            headers[this._concurrency.ifMatchHeader] = baseVersion;
          }
          const res = await fetchImpl(url, { method: 'DELETE', headers });
          if (res?.status === 409 || res?.status === 412) {
            const latest = await this._fetchLatestForConflict({ resource: effectiveResource, entityType, keyField, versionField, id: entityId });
            conflicts.push({
              opId,
              status: 'conflict',
              latestVersion: latest.latestVersion,
              server: latest.record,
              local: op,
              httpStatus: res?.status,
            });
            continue;
          }
          if (!res?.ok) {
            const body = await parseJsonSafely(res);
            rejected.push({ opId, status: 'rejected', error: this._errorFromHttp(res, body) });
            continue;
          }
          applied.push({ opId, status: 'applied' });
          continue;
        }

        rejected.push({ opId, status: 'rejected', error: { code: 'unsupported', message: `Unsupported op type: ${String(type)}` } });
      } catch (e) {
        // IMPORTANT: transport-level failures must throw so the store re-queues all ops.
        // We only convert *our own* validation errors to rejected.
        const msg = e?.message || String(e);
        const isLocalValidation =
          msg.includes('update requires entity.id') ||
          msg.includes('delete requires entity.id') ||
          msg.includes('Unsupported op type');
        if (isLocalValidation) {
          rejected.push({ opId, status: 'rejected', error: { code: 'exception', message: msg } });
          continue;
        }
        throw e;
      }
    }

    return { applied, rejected, conflicts, entities, invalidations: [], meta: { mutatedAt: Date.now() } };
  }
}

