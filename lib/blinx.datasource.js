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

    const byId = new Map();
    this._data.forEach((rec, idx) => byId.set(this._getId(rec, idx), { rec, idx }));

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
          const currentVersion = this._getVersion(found.rec);
          if (baseVersion !== null && currentVersion !== null && baseVersion !== currentVersion) {
            conflicts.push({
              opId,
              status: 'conflict',
              latestVersion: currentVersion,
              server: clone(found.rec),
              local: op,
            });
            continue;
          }
          this._data.splice(found.idx, 1);
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
          const currentVersion = this._getVersion(found.rec);
          if (baseVersion !== null && currentVersion !== null && baseVersion !== currentVersion) {
            conflicts.push({
              opId,
              status: 'conflict',
              latestVersion: currentVersion,
              server: clone(found.rec),
              local: op,
            });
            continue;
          }
          const patch = op?.patch ? clone(op.patch) : null;
          const data = op?.data ? clone(op.data) : null;
          if (patch) Object.assign(found.rec, patch);
          else if (data) Object.assign(found.rec, data);
          this._bumpVersion(found.rec);
          if (!entities[entityType]) entities[entityType] = [];
          entities[entityType].push(clone(found.rec));
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

