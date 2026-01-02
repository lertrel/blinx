import { BlinxArrayDataSource, BlinxDataSource, BlinxRestDataSource } from './blinx.datasource.js';
import {
  getComputedModelMeta,
  isComputedField,
  stripComputedFields,
  decorateRecordWithComputed,
  cloneWithComputed,
  invalidateComputedForField,
} from './blinx.computed.js';

export const DataTypes = {
  string: 'string',
  longText: 'longText',
  number: 'number',
  boolean: 'boolean',
  date: 'date',
  enum: 'enum',
  array: 'array',
  json: 'json',
  blob: 'blob',
  secret: 'secret',
};

export const EventTypes = {
  add: 'add',
  remove: 'remove',
  update: 'update',
  commit: 'commit',
  reset: 'reset',
  // Manager-level / view-level lifecycle events (emitted by the multi-view store manager).
  viewChanged: 'viewChanged',
  criteriaChanged: 'criteriaChanged',
};

const clone = value => JSON.parse(JSON.stringify(value));

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function normalizeCacheConfig(raw, { keyField = 'id', versionField = 'version' } = {}) {
  if (!raw || raw === true) {
    // Default: off (explicit opt-in). `true` enables safe defaults.
    if (raw !== true) return null;
  }
  const cfg = isPlainObject(raw) ? raw : {};
  const completeness = (cfg.completeness === 'all') ? 'all' : 'loaded';
  const maxEntities = Number.isFinite(cfg.maxEntities) ? Math.max(0, cfg.maxEntities) : null;
  const evictionRaw = isPlainObject(cfg.eviction) ? cfg.eviction : {};
  const policy = (evictionRaw.policy === 'ttl' || evictionRaw.policy === 'lru+ttl' || evictionRaw.policy === 'lru')
    ? evictionRaw.policy
    : (evictionRaw.ttlMs ? 'lru+ttl' : 'lru');
  const ttlMs = Number.isFinite(evictionRaw.ttlMs) ? Math.max(0, evictionRaw.ttlMs) : null;
  const fields = isPlainObject(cfg.fields) ? cfg.fields : null;
  const include = Array.isArray(fields?.include) ? fields.include.filter(f => typeof f === 'string' && f) : null;
  const exclude = Array.isArray(fields?.exclude) ? fields.exclude.filter(f => typeof f === 'string' && f) : null;
  const persist = isPlainObject(cfg.persist) ? cfg.persist : null;
  const persistAdapter = persist?.adapter ? String(persist.adapter) : 'memory';

  return {
    mode: 'entity',
    completeness,
    maxEntities,
    eviction: { policy, ttlMs },
    fields: { include, exclude },
    persist: { adapter: persistAdapter },
    keyField,
    versionField,
  };
}

function pickRecordFields(record, { include, exclude } = {}) {
  if (!record || typeof record !== 'object') return record;
  const inc = Array.isArray(include) && include.length ? new Set(include) : null;
  const exc = Array.isArray(exclude) && exclude.length ? new Set(exclude) : null;
  if (!inc && !exc) return record;
  const out = {};
  if (inc) {
    for (const k of inc) {
      if (Object.prototype.hasOwnProperty.call(record, k)) out[k] = record[k];
    }
    // Keep unknown keys out by default when include is provided.
    return out;
  }
  for (const [k, v] of Object.entries(record)) {
    if (exc && exc.has(k)) continue;
    out[k] = v;
  }
  return out;
}

function normalizeCriteriaInput(input) {
  const raw = isPlainObject(input) ? input : {};
  const mode = (raw.mode === 'local' || raw.mode === 'remote' || raw.mode === 'auto') ? raw.mode : 'auto';
  const scope = (raw.scope === 'all') ? 'all' : 'cached';
  const purpose = (typeof raw.purpose === 'string' && raw.purpose) ? raw.purpose : 'default';
  const filter = raw.filter === undefined ? null : raw.filter;
  const sort = Array.isArray(raw.sort) ? raw.sort : null;
  const page = isPlainObject(raw.page) ? raw.page : null;
  const meta = isPlainObject(raw.meta) ? raw.meta : null;
  return { purpose, mode, scope, filter, sort, page, meta };
}

function serializeCriteria(criteria) {
  const c = normalizeCriteriaInput(criteria);
  const filterType = (typeof c.filter === 'function') ? 'fn' : (c.filter ? 'object' : 'none');
  // Do NOT serialize predicate bodies.
  const filter = (filterType === 'fn') ? null : c.filter;
  return { ...c, filterType, filter };
}

function compileFilterPredicate(filter) {
  if (!filter) return () => true;
  if (typeof filter === 'function') return (rec, ctx) => !!filter(rec, ctx);

  // Legacy: { field: value, ... } shallow equality.
  if (isPlainObject(filter) && !('and' in filter) && !('or' in filter) && !('field' in filter) && !('op' in filter)) {
    const entries = Object.entries(filter);
    if (entries.length === 0) return () => true;
    return (rec) => entries.every(([k, v]) => rec?.[k] === v);
  }

  // Minimal DSL:
  // - { and: [Filter, ...] }
  // - { or:  [Filter, ...] }
  // - { field, op, value }
  if (!isPlainObject(filter)) return () => true;

  if (Array.isArray(filter.and)) {
    const ps = filter.and.map(compileFilterPredicate);
    return (rec, ctx) => ps.every(p => p(rec, ctx));
  }
  if (Array.isArray(filter.or)) {
    const ps = filter.or.map(compileFilterPredicate);
    return (rec, ctx) => ps.some(p => p(rec, ctx));
  }

  const field = filter.field;
  const op = filter.op;
  const value = filter.value;
  if (typeof field !== 'string' || !field) return () => true;
  const opKey = (typeof op === 'string' && op) ? op : 'eq';

  return (rec) => {
    const v = rec?.[field];
    if (opKey === 'eq') return v === value;
    if (opKey === 'ne') return v !== value;
    if (opKey === 'in') return Array.isArray(value) ? value.includes(v) : false;
    if (opKey === 'contains') {
      if (v === undefined || v === null) return false;
      const s = Array.isArray(v) ? v.join(', ') : String(v);
      return String(s).toLowerCase().includes(String(value ?? '').toLowerCase());
    }
    const n = Number(v);
    const x = Number(value);
    if (opKey === 'gt') return Number.isFinite(n) && Number.isFinite(x) ? n > x : false;
    if (opKey === 'gte') return Number.isFinite(n) && Number.isFinite(x) ? n >= x : false;
    if (opKey === 'lt') return Number.isFinite(n) && Number.isFinite(x) ? n < x : false;
    if (opKey === 'lte') return Number.isFinite(n) && Number.isFinite(x) ? n <= x : false;
    if (opKey === 'between') {
      if (!Array.isArray(value) || value.length < 2) return false;
      const a = Number(value[0]);
      const b = Number(value[1]);
      if (!Number.isFinite(n) || !Number.isFinite(a) || !Number.isFinite(b)) return false;
      return n >= Math.min(a, b) && n <= Math.max(a, b);
    }
    return true;
  };
}

function applySortLocal(records, sort) {
  if (!Array.isArray(sort) || sort.length === 0) return records;
  const specs = sort
    .filter(Boolean)
    .map(s => ({ field: s.field, dir: (s.dir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc' }))
    .filter(s => typeof s.field === 'string' && s.field.length > 0);
  if (specs.length === 0) return records;
  const decorated = records.map((r, pos) => ({ r, pos }));
  decorated.sort((a, b) => {
    for (const s of specs) {
      const av = a.r?.[s.field];
      const bv = b.r?.[s.field];
      if (av === bv) continue;
      if (av === undefined || av === null) return s.dir === 'asc' ? 1 : -1;
      if (bv === undefined || bv === null) return s.dir === 'asc' ? -1 : 1;
      if (av < bv) return s.dir === 'asc' ? -1 : 1;
      if (av > bv) return s.dir === 'asc' ? 1 : -1;
    }
    return a.pos - b.pos;
  });
  return decorated.map(x => x.r);
}

function sliceOffsetPage(records, { offset = 0, limit = 20 } = {}) {
  const off = Number.isFinite(offset) ? Math.max(0, offset) : 0;
  const lim = Number.isFinite(limit) ? Math.max(0, limit) : 20;
  const items = records.slice(off, off + lim);
  const totalCount = records.length;
  return {
    items,
    pageInfo: {
      mode: 'offset',
      offset: off,
      limit: lim,
      totalCount,
      hasPrev: off > 0,
      hasNext: off + items.length < totalCount,
    }
  };
}

function createLegacyArrayStore(initialArray, dataModel) {
  // Validate computed metadata early (throws on cycles / invalid dependsOn).
  getComputedModelMeta(dataModel);
  let original = clone((initialArray || []).map(r => stripComputedFields(dataModel, r)));
  let current = clone((initialArray || []).map(r => stripComputedFields(dataModel, r)));
  const model = dataModel;
  const subs = new Set();
  let storeApi;

  function notify(path, value) {
    subs.forEach(fn => fn({ path, value, data: current, store: storeApi }));
  }

  function getRecord(idx) {
    const rec = current[idx];
    return decorateRecordWithComputed(model, rec);
  }
  function getModel() { return model; }
  function getLength() { return current.length; }

  function setField(idx, field, value) {
    if (isComputedField(model, field)) {
      throw new Error(`Cannot set computed field "${String(field)}".`);
    }
    current[idx][field] = value;
    invalidateComputedForField(model, current[idx], field);
    notify([idx, field], value);
  }

  function addRecord(record, atIndex = current.length) {
    const sanitized = stripComputedFields(model, record || {});
    current.splice(atIndex, 0, sanitized);
    // Keep notification payload consistent with remote view store (include computed values).
    notify([EventTypes.add, atIndex], cloneWithComputed(model, sanitized, { clone }));
    return atIndex;
  }

  function removeRecords(indexes) {
    const sorted = Array.from(new Set(indexes)).sort((a, b) => b - a);
    const removed = [];
    sorted.forEach(i => {
      if (i >= 0 && i < current.length) {
        const [record] = current.splice(i, 1);
        removed.push({ index: i, record });
      }
    });
    if (removed.length > 0) {
      const removedIndexes = removed.map(item => item.index);
      const removedRecords = removed.map(item => item.record);
      notify([EventTypes.remove, removedIndexes], removedRecords);
    }
    return removed.length;
  }

  function updateIndex(index) {
    if (index < 0 || index >= current.length) return null;
    const record = current[index];
    notify([EventTypes.update, index], cloneWithComputed(model, record, { clone }));
    return decorateRecordWithComputed(model, record);
  }

  function update(index, record) {
    if (index < 0 || index >= current.length) return null;
    const sanitized = stripComputedFields(model, record || {});
    current[index] = sanitized;
    notify([EventTypes.update, index], cloneWithComputed(model, sanitized, { clone }));
    return decorateRecordWithComputed(model, sanitized);
  }

  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
  function toJSON() { return current.map(r => cloneWithComputed(model, r, { clone })); }

  function diff() {
    const changes = [];
    const max = Math.max(current.length, original.length);
    for (let i = 0; i < max; i++) {
      const rec = current[i];
      const orig = original[i];
      if (rec && !orig) { changes.push({ index: i, added: true, to: rec }); continue; }
      if (!rec && orig) { changes.push({ index: i, deleted: true, from: orig }); continue; }
      if (rec && orig) {
        for (const k of Object.keys(rec)) {
          if (JSON.stringify(rec[k]) !== JSON.stringify(orig[k])) {
            changes.push({ index: i, field: k, from: orig[k], to: rec[k] });
          }
        }
      }
    }
    return changes;
  }

  function commit() {
    const snapshot = clone(current);
    original = snapshot;
    notify([EventTypes.commit], snapshot.map(r => cloneWithComputed(model, r, { clone })));
  }

  function reset() {
    current = clone(original);
    current.forEach((record, idx) => notify([EventTypes.reset, idx], record));
  }

  storeApi = {
    getRecord,
    getLength,
    setField,
    addRecord,
    removeRecords,
    updateIndex,
    update,
    subscribe,
    toJSON,
    diff,
    commit,
    reset,
    getModel,
  };

  return storeApi;
}

function normalizeViewsConfig(input) {
  if (input && typeof input === 'object' && !Array.isArray(input) && input.views) {
    const views = input.views || {};
    const keys = Object.keys(views);
    const defaultView = input.defaultView || keys[0] || 'default';
    return { ...input, views, defaultView };
  }
  // Allow single view config via `view`
  if (input && typeof input === 'object' && !Array.isArray(input) && input.view) {
    const viewName = input.view.name || 'default';
    return { ...input, views: { [viewName]: input.view }, defaultView: viewName };
  }
  return null;
}

function createRemoteViewStore({ model, dataSource, viewName, viewConfig }) {
  // Validate computed metadata early (throws on cycles / invalid dependsOn).
  getComputedModelMeta(model);
  const subs = new Set();
  let storeApi;

  const entityType = viewConfig.entityType || viewConfig.entity || 'Record';
  const keyField = viewConfig.keyField || 'id';
  const versionField = viewConfig.versionField || 'version';
  const resource = viewConfig.resource || viewConfig.name || viewName || 'resource';
  const defaultPage = viewConfig.defaultPage || viewConfig.page || { mode: 'cursor', limit: 20, after: null };

  let original = []; // last loaded/saved snapshot (page-local)
  let current = [];  // current working set (page-local)
  let pageInfo = null;
  let pageState = {
    mode: defaultPage.mode || 'cursor',
    cursor: defaultPage.after ?? null,
    page: defaultPage.page ?? 0,
    offset: defaultPage.offset ?? 0,
    limit: defaultPage.limit ?? 20,
    pageIndex: 0, // used for cursor-mode UX (best-effort)
  };
  let criteria = { filter: viewConfig.defaultFilter || null, sort: viewConfig.defaultSort || null, select: viewConfig.defaultSelect || null };
  let status = 'idle';
  let error = null;
  let opSeq = 1;
  const pendingOps = []; // queued local ops (for offline / save batching)

  // ---- Optional entity cache (multi-page / working-set / full) ----
  const cacheConfig = normalizeCacheConfig(viewConfig.cache, { keyField, versionField });
  const cacheState = cacheConfig
    ? { entities: new Map(), access: new Map() } // Map preserves insertion order (stable for snapshots)
    : null;

  function cacheNow() { return Date.now(); }

  function cacheEvictIfNeeded() {
    if (!cacheConfig || !cacheState) return;
    const policy = cacheConfig.eviction?.policy || 'lru';
    const ttlMs = cacheConfig.eviction?.ttlMs;

    if ((policy === 'ttl' || policy === 'lru+ttl') && Number.isFinite(ttlMs) && ttlMs > 0) {
      const cutoff = cacheNow() - ttlMs;
      for (const [id, ts] of cacheState.access.entries()) {
        if (ts < cutoff) {
          cacheState.access.delete(id);
          cacheState.entities.delete(id);
        }
      }
    }

    if (Number.isFinite(cacheConfig.maxEntities) && cacheConfig.maxEntities >= 0) {
      while (cacheState.entities.size > cacheConfig.maxEntities) {
        // Evict least-recently-used (or oldest seen when access is missing).
        let victimId = null;
        let victimTs = Infinity;
        for (const [id, rec] of cacheState.entities.entries()) {
          const ts = cacheState.access.get(id) ?? 0;
          if (ts < victimTs) { victimTs = ts; victimId = id; }
          // Defensive: avoid unused var warning; rec not needed
          void rec;
        }
        if (!victimId) break;
        cacheState.entities.delete(victimId);
        cacheState.access.delete(victimId);
      }
    }
  }

  function cacheTouch(id) {
    if (!cacheConfig || !cacheState) return;
    if (!id) return;
    cacheState.access.set(String(id), cacheNow());
  }

  function cacheIngest(records) {
    if (!cacheConfig || !cacheState) return;
    if (!Array.isArray(records) || records.length === 0) return;
    for (const r of records) {
      if (!r || typeof r !== 'object') continue;
      const id = r?.[keyField];
      if (id === undefined || id === null || id === '') continue;
      const sid = String(id);
      const picked = pickRecordFields(r, cacheConfig.fields);
      // Always ensure id+version exist in cache so updates can be reconciled.
      const ensured = { ...picked, [keyField]: sid };
      if (ensured[versionField] === undefined && r[versionField] !== undefined) ensured[versionField] = r[versionField];
      cacheState.entities.set(sid, ensured);
      cacheTouch(sid);
    }
    cacheEvictIfNeeded();
  }

  function cacheRemoveById(id) {
    if (!cacheConfig || !cacheState) return;
    const sid = String(id);
    cacheState.entities.delete(sid);
    cacheState.access.delete(sid);
  }

  function cacheSnapshot() {
    if (!cacheConfig || !cacheState) return [];
    cacheEvictIfNeeded();
    return Array.from(cacheState.entities.values());
  }

  async function cacheWarmAll({ pageSize = 200, maxPages = 2000, criteriaOverride = null } = {}) {
    if (!cacheConfig || !cacheState) return { warmed: 0, pages: 0 };
    if (!dataSource || typeof dataSource.query !== 'function') return { warmed: 0, pages: 0 };

    let cursor = null;
    let pages = 0;
    let warmed = 0;
    for (; pages < maxPages; pages++) {
      const res = await dataSource.query(
        buildQuerySpec({
          ...(criteriaOverride || {}),
          page: { mode: 'cursor', after: cursor, limit: pageSize },
        }),
        { resource, entityType, keyField, versionField }
      );
      const fetched = (res?.entities?.[entityType] || []).map(r => stripComputedFields(model, clone(r)));
      cacheIngest(fetched);
      warmed += fetched.length;
      const next = res?.pageInfo?.nextCursor;
      if (next === null || next === undefined) break;
      cursor = next;
      // Respect maxEntities cap: don't keep warming forever if capped too low.
      if (Number.isFinite(cacheConfig.maxEntities) && cacheConfig.maxEntities >= 0 && cacheState.entities.size >= cacheConfig.maxEntities) break;
    }
    return { warmed, pages };
  }

  // ---- Criteria (remote + local) ----
  let activeCriteria = null;     // last setCriteria() input (normalized)
  let criteriaSeq = 1;
  let localMode = false;         // whether the view is currently materialized from cache
  let localAll = [];             // filtered+sorted array used for local paging

  function notify(path, value) {
    subs.forEach(fn => fn({ path, value, data: current, store: storeApi }));
  }

  function getModel() { return model; }
  function getLength() { return current.length; }
  function getRecord(idx) {
    const rec = current[idx];
    return decorateRecordWithComputed(model, rec);
  }
  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
  function toJSON() { return current.map(r => cloneWithComputed(model, r, { clone })); }
  function getStatus() { return { status, error, pageInfo, pageState: { ...pageState }, criteria: clone(criteria) }; }

  function getCriteria() {
    return activeCriteria ? clone(serializeCriteria(activeCriteria)) : null;
  }

  function getCacheStatus() {
    if (!cacheConfig || !cacheState) return { enabled: false };
    return {
      enabled: true,
      config: clone(cacheConfig),
      size: cacheState.entities.size,
      completeness: cacheConfig.completeness,
    };
  }

  function diff() {
    // Keep legacy diff shape (index-based) for UI messaging/debugging.
    const changes = [];
    const max = Math.max(current.length, original.length);
    for (let i = 0; i < max; i++) {
      const rec = current[i];
      const orig = original[i];
      if (rec && !orig) { changes.push({ index: i, added: true, to: rec }); continue; }
      if (!rec && orig) { changes.push({ index: i, deleted: true, from: orig }); continue; }
      if (rec && orig) {
        for (const k of Object.keys(rec)) {
          if (JSON.stringify(rec[k]) !== JSON.stringify(orig[k])) {
            changes.push({ index: i, field: k, from: orig[k], to: rec[k] });
          }
        }
      }
    }
    return changes;
  }

  function commit() {
    // Local snapshot only (does not sync remotely). Provided for backwards compatibility.
    const snapshot = clone(current);
    original = snapshot;
    // Keep notification payload consistent with legacy store + remote save() commit notifications.
    notify([EventTypes.commit], snapshot.map(r => cloneWithComputed(model, r, { clone })));
  }

  function reset() {
    // Discard local edits and queued ops for this view.
    pendingOps.length = 0;
    current = clone(original);
    current.forEach((record, idx) => notify([EventTypes.reset, idx], record));
  }

  function ensureRecord(idx) {
    if (idx < 0 || idx >= current.length) return null;
    const rec = current[idx];
    if (!rec || typeof rec !== 'object') return null;
    return rec;
  }

  function enqueue(op) {
    pendingOps.push(op);
    return op;
  }

  function enqueueUpdate(entityId, baseVersion, patch) {
    const eid = entityId === undefined || entityId === null ? null : String(entityId);
    if (!eid) return null;
    // Coalesce multiple field edits on the same record into a single update op.
    // This avoids "self-conflicts" where multiple ops share the same baseVersion.
    for (let i = pendingOps.length - 1; i >= 0; i--) {
      const existing = pendingOps[i];
      if (
        existing &&
        existing.type === 'update' &&
        existing.entity &&
        existing.entity.type === entityType &&
        String(existing.entity.id) === eid
      ) {
        existing.patch = { ...(existing.patch || {}), ...(patch || {}) };
        return existing;
      }
    }
    const op = {
      opId: `op-${viewName}-${opSeq++}`,
      type: 'update',
      entity: { type: entityType, id: eid },
      patch: { ...(patch || {}) },
      baseVersion,
    };
    pendingOps.push(op);
    return op;
  }

  function setField(idx, field, value) {
    const rec = ensureRecord(idx);
    if (!rec) return;
    if (isComputedField(model, field)) {
      throw new Error(`Cannot set computed field "${String(field)}".`);
    }
    rec[field] = value;
    invalidateComputedForField(model, rec, field);
    notify([idx, field], value);

    const id = rec?.[keyField];
    const baseVersion = (original[idx] && original[idx][versionField] !== undefined) ? String(original[idx][versionField]) : null;
    if (id !== undefined && id !== null) {
      enqueueUpdate(id, baseVersion, { [field]: value });
    }

    // Keep cache in sync (best-effort). If localMode is active, this keeps projections stable.
    cacheIngest([rec]);
    if (localMode && activeCriteria) {
      // Recompute local projection with updated record (simple but correct).
      void applyLocalCriteria(activeCriteria);
    }
  }

  function addRecord(record, atIndex = current.length) {
    const rec = stripComputedFields(model, clone(record || {}));
    if (rec[keyField] === undefined || rec[keyField] === null || rec[keyField] === '') {
      rec[keyField] = `tmp-${viewName}-${opSeq++}`;
    }
    if (rec[versionField] === undefined) rec[versionField] = '0';
    current.splice(atIndex, 0, rec);
    notify([EventTypes.add, atIndex], cloneWithComputed(model, rec, { clone }));

    enqueue({
      opId: `op-${viewName}-${opSeq++}`,
      type: 'create',
      entity: { type: entityType },
      data: clone(rec),
    });

    cacheIngest([rec]);
    if (localMode && activeCriteria) {
      void applyLocalCriteria(activeCriteria);
    }
    return atIndex;
  }

  function removeRecords(indexes) {
    const sorted = Array.from(new Set(indexes)).sort((a, b) => b - a);
    const removed = [];
    sorted.forEach(i => {
      if (i >= 0 && i < current.length) {
        const [record] = current.splice(i, 1);
        removed.push({ index: i, record });
        const id = record?.[keyField];
        const baseVersion = record?.[versionField] !== undefined ? String(record[versionField]) : null;
        if (id !== undefined && id !== null) {
          enqueue({
            opId: `op-${viewName}-${opSeq++}`,
            type: 'delete',
            entity: { type: entityType, id: String(id) },
            baseVersion,
          });
        }
      }
    });
    if (removed.length > 0) {
      const removedIndexes = removed.map(item => item.index);
      const removedRecords = removed.map(item => item.record);
      notify([EventTypes.remove, removedIndexes], removedRecords);
    }

    // Remove from cache by id (best-effort).
    removed.forEach(({ record }) => {
      const id = record?.[keyField];
      if (id !== undefined && id !== null) cacheRemoveById(id);
    });
    if (localMode && activeCriteria) {
      void applyLocalCriteria(activeCriteria);
    }
    return removed.length;
  }

  function updateIndex(index) {
    if (index < 0 || index >= current.length) return null;
    const record = current[index];
    notify([EventTypes.update, index], cloneWithComputed(model, record, { clone }));
    return decorateRecordWithComputed(model, record);
  }

  function update(index, record) {
    if (index < 0 || index >= current.length) return null;
    current[index] = stripComputedFields(model, clone(record));
    notify([EventTypes.update, index], cloneWithComputed(model, current[index], { clone }));

    cacheIngest([current[index]]);
    if (localMode && activeCriteria) {
      void applyLocalCriteria(activeCriteria);
    }
    return decorateRecordWithComputed(model, current[index]);
  }

  function buildQuerySpec(overrides = {}) {
    const page = (() => {
      const mode = pageState.mode || 'cursor';
      if (mode === 'page') return { mode: 'page', page: pageState.page || 0, limit: pageState.limit };
      if (mode === 'offset') return { mode: 'offset', offset: pageState.offset || 0, limit: pageState.limit };
      return { mode: 'cursor', after: pageState.cursor ?? null, limit: pageState.limit };
    })();

    return {
      resource,
      entityType,
      select: criteria.select || null,
      filter: criteria.filter || null,
      sort: criteria.sort || null,
      page,
      params: {},
      ...overrides,
    };
  }

  async function loadFirst(nextCriteria = null) {
    if (!dataSource || typeof dataSource.query !== 'function') {
      throw new Error('Remote store requires a dataSource with query().');
    }
    if (nextCriteria) criteria = { ...criteria, ...clone(nextCriteria) };
    status = 'loading'; error = null;
    pageState = { ...pageState, cursor: defaultPage.after ?? null, page: defaultPage.page ?? 0, offset: defaultPage.offset ?? 0, pageIndex: 0 };
    const res = await dataSource.query(buildQuerySpec(), { resource, entityType, keyField, versionField });
    // Materialize as page-local array
    const records = (res?.entities?.[entityType] || []).map(r => stripComputedFields(model, clone(r)));
    cacheIngest(records);
    current = records;
    original = clone(records);
    pageInfo = res?.pageInfo || null;
    status = 'success';
    notify([EventTypes.reset, 0], current[0] || null);
    return res;
  }

  async function pageNext() {
    if (!dataSource || typeof dataSource.query !== 'function') throw new Error('Remote store requires a dataSource with query().');
    if (localMode) {
      // Local paging over the last materialized localAll set.
      pageState = { ...pageState, mode: 'offset', offset: (pageState.offset || 0) + (pageState.limit || 20) };
      const { items, pageInfo: pi } = sliceOffsetPage(localAll, { offset: pageState.offset, limit: pageState.limit });
      current = items;
      original = clone(items);
      pageInfo = pi;
      status = 'success';
      notify([EventTypes.reset, 0], current[0] || null);
      return { entities: { [entityType]: current }, result: [], pageInfo };
    }
    const mode = pageState.mode || 'cursor';
    if (mode === 'page') pageState = { ...pageState, page: (pageState.page || 0) + 1 };
    else if (mode === 'offset') pageState = { ...pageState, offset: (pageState.offset || 0) + (pageState.limit || 20) };
    else {
      const next = pageInfo?.nextCursor;
      if (next === null || next === undefined) return null;
      pageState = { ...pageState, cursor: next, pageIndex: (pageState.pageIndex || 0) + 1 };
    }
    status = 'loading'; error = null;
    const res = await dataSource.query(buildQuerySpec(), { resource, entityType, keyField, versionField });
    const records = (res?.entities?.[entityType] || []).map(r => stripComputedFields(model, clone(r)));
    cacheIngest(records);
    current = records;
    original = clone(records);
    pageInfo = res?.pageInfo || null;
    status = 'success';
    notify([EventTypes.reset, 0], current[0] || null);
    return res;
  }

  async function pagePrev() {
    if (!dataSource || typeof dataSource.query !== 'function') throw new Error('Remote store requires a dataSource with query().');
    if (localMode) {
      pageState = { ...pageState, mode: 'offset', offset: Math.max(0, (pageState.offset || 0) - (pageState.limit || 20)) };
      const { items, pageInfo: pi } = sliceOffsetPage(localAll, { offset: pageState.offset, limit: pageState.limit });
      current = items;
      original = clone(items);
      pageInfo = pi;
      status = 'success';
      notify([EventTypes.reset, 0], current[0] || null);
      return { entities: { [entityType]: current }, result: [], pageInfo };
    }
    const mode = pageState.mode || 'cursor';
    if (mode === 'page') pageState = { ...pageState, page: Math.max(0, (pageState.page || 0) - 1) };
    else if (mode === 'offset') pageState = { ...pageState, offset: Math.max(0, (pageState.offset || 0) - (pageState.limit || 20)) };
    else {
      const prev = pageInfo?.prevCursor;
      if (prev === null || prev === undefined) return null;
      pageState = { ...pageState, cursor: prev, pageIndex: Math.max(0, (pageState.pageIndex || 0) - 1) };
    }
    status = 'loading'; error = null;
    const res = await dataSource.query(buildQuerySpec(), { resource, entityType, keyField, versionField });
    const records = (res?.entities?.[entityType] || []).map(r => stripComputedFields(model, clone(r)));
    cacheIngest(records);
    current = records;
    original = clone(records);
    pageInfo = res?.pageInfo || null;
    status = 'success';
    notify([EventTypes.reset, 0], current[0] || null);
    return res;
  }

  async function search(nextCriteria) {
    // Remote search always disables localMode materialization.
    localMode = false;
    localAll = [];
    return loadFirst(nextCriteria || {});
  }

  async function applyLocalCriteria(next) {
    const nextC = normalizeCriteriaInput(next);
    const ctx = { model, viewName, viewConfig, store: storeApi, criteria: nextC };

    if (nextC.scope === 'all') {
      // Best-effort warm-all (bounded by cacheConfig.maxEntities if set).
      await cacheWarmAll({ criteriaOverride: null });
    } else if (cacheConfig && cacheState && cacheState.entities.size === 0) {
      // Seed cache with at least one page so local filters are useful in "auto" mode.
      try { await loadFirst(null); } catch { /* ignore; local filter will apply to empty */ }
    }

    const records = cacheSnapshot().map(r => stripComputedFields(model, clone(r)));
    const pred = compileFilterPredicate(nextC.filter);
    let filtered = records.filter(r => pred(r, ctx));
    filtered = applySortLocal(filtered, nextC.sort);

    localAll = filtered;
    localMode = true;
    status = 'success';
    error = null;
    // Local paging uses offset mode (simplest, deterministic).
    const limit = Number.isFinite(nextC.page?.limit) ? Math.max(1, nextC.page.limit) : (pageState.limit || 20);
    pageState = { ...pageState, mode: 'offset', offset: 0, limit, page: 0, cursor: null, pageIndex: 0 };

    const { items, pageInfo: pi } = sliceOffsetPage(localAll, { offset: 0, limit });
    current = items;
    original = clone(items);
    pageInfo = pi;
    notify([EventTypes.reset, 0], current[0] || null);
    return { entities: { [entityType]: current }, result: [], pageInfo };
  }

  async function setCriteria(nextCriteria) {
    const next = normalizeCriteriaInput(nextCriteria);
    const mode = next.mode;

    // Normalize mode when filter is a predicate (local-only).
    const effectiveMode = (typeof next.filter === 'function' && mode !== 'local') ? 'local' : mode;

    activeCriteria = { ...next, mode: effectiveMode, seq: criteriaSeq++ };
    notify([EventTypes.criteriaChanged, next.purpose], serializeCriteria(activeCriteria));

    // Avoid footguns: local materialization while edits are pending can hide records and confuse diff/save.
    if (effectiveMode === 'local' && pendingOps.length > 0) {
      throw new Error('Cannot apply local criteria while there are pending edits. Call save() or reset() first.');
    }

    if (effectiveMode === 'remote') {
      // Map to existing remote criteria channel.
      const remoteCriteria = { filter: next.filter ?? null, sort: next.sort ?? null, select: null };
      return search(remoteCriteria);
    }

    if (effectiveMode === 'local') {
      return applyLocalCriteria(activeCriteria);
    }

    // auto:
    // - predicate => local (already handled)
    // - otherwise prefer local if cache is enabled; fallback to remote.
    if (cacheConfig) return applyLocalCriteria(activeCriteria);
    return search({ filter: next.filter ?? null, sort: next.sort ?? null, select: null });
  }

  async function save() {
    if (!dataSource || typeof dataSource.mutate !== 'function') {
      // No remote: fallback to local commit to keep behavior consistent.
      commit();
      return { applied: [], rejected: [], conflicts: [] };
    }
    if (pendingOps.length === 0) return { applied: [], rejected: [], conflicts: [], entities: {} };
    status = 'saving'; error = null;
    const ops = pendingOps.splice(0, pendingOps.length).map(o => clone(o));

    let res;
    try {
      res = await dataSource.mutate(ops, { resource, entityType, keyField, versionField });
    } catch (e) {
      // Transport-level failure: restore all pending ops so nothing is lost.
      pendingOps.unshift(...ops);
      status = 'error';
      error = e;
      throw e;
    }

    const conflicts = res?.conflicts || [];
    const rejected = res?.rejected || [];
    const applied = res?.applied || [];
    const appliedIds = new Set(applied.map(a => a?.opId).filter(Boolean));

    if (conflicts.length || rejected.length) {
      // Re-queue only ops that were NOT applied.
      // This avoids retrying successful creates/updates and creating duplicates on the next save().
      const failedOps = appliedIds.size > 0
        ? ops.filter(o => !appliedIds.has(o?.opId))
        : ops;
      pendingOps.unshift(...failedOps);
      status = 'error';
      error = { conflicts, rejected };
      return res;
    }
    // Reconcile create ops with server-assigned IDs (if provided).
    // Store generates temporary IDs; data sources may return `applied[].serverId`.
    const appliedById = new Map((applied || []).filter(Boolean).map(a => [String(a?.opId), a]));
    for (const op of ops) {
      if (op?.type !== 'create') continue;
      const a = appliedById.get(String(op?.opId));
      const serverId = a?.serverId !== undefined && a?.serverId !== null ? String(a.serverId) : null;
      if (!serverId) continue;
      const clientId = op?.data?.[keyField] !== undefined && op?.data?.[keyField] !== null ? String(op.data[keyField]) : null;
      if (!clientId) continue;
      // Update the in-memory current record id so canonical entity replacement can succeed.
      const idx = current.findIndex(r => String(r?.[keyField]) === clientId);
      if (idx >= 0 && current[idx] && typeof current[idx] === 'object') {
        current[idx][keyField] = serverId;
      }
    }
    // Apply canonical entities (if provided) and snapshot.
    const canonical = res?.entities?.[entityType] || null;
    if (canonical && Array.isArray(canonical)) {
      // Replace by id for any returned records; keep current ordering.
      const byId = new Map(canonical.map(r => [String(r?.[keyField]), stripComputedFields(model, clone(r))]));
      current = current.map(r => {
        const id = String(r?.[keyField]);
        return byId.has(id) ? byId.get(id) : r;
      });
    }
    original = clone(current);
    status = 'success';
    notify([EventTypes.commit], current.map(r => cloneWithComputed(model, r, { clone })));
    return res;
  }

  storeApi = {
    getModel,
    getRecord,
    getLength,
    setField,
    addRecord,
    removeRecords,
    updateIndex,
    update,
    subscribe,
    toJSON,
    diff,
    commit,
    reset,

    // Remote/view-oriented API
    loadFirst,
    pageNext,
    pagePrev,
    search,
    save,
    getStatus,
    getPagingState: () => ({ pageInfo, pageState: { ...pageState } }),
    // Criteria + cache API (new)
    setCriteria,
    getCriteria,
    getCacheStatus,
    cacheSnapshot: () => cacheSnapshot().map(r => cloneWithComputed(model, r, { clone })),
    cacheWarmAll,

    // View compatibility (if store is used as a collection controller)
    collection: () => storeApi,
  };

  return storeApi;
}

export function blinxStore(arg1, arg2) {
  // Legacy: blinxStore(initialArray, model)
  if (Array.isArray(arg1)) return createLegacyArrayStore(arg1, arg2);

  const cfg = normalizeViewsConfig(arg1);
  if (!cfg) {
    throw new Error('blinxStore: expected (initialArray, model) or ({ model, dataSource, views, defaultView } | { model, dataSource, view }).');
  }

  const model = cfg.model;
  if (!model) throw new Error('blinxStore: missing required model.');

  let ds = cfg.dataSource;
  if (Array.isArray(ds)) {
    ds = new BlinxArrayDataSource(ds, cfg.dataSourceOptions || {});
  }
  if (!ds) {
    // Backward compatible: allow `initialArray` key on config for convenience.
    if (Array.isArray(cfg.initialArray)) ds = new BlinxArrayDataSource(cfg.initialArray, cfg.dataSourceOptions || {});
  }
  if (!ds) throw new Error('blinxStore: missing required dataSource (or initialArray).');
  if (!(ds instanceof BlinxDataSource) && (typeof ds.query !== 'function' || typeof ds.mutate !== 'function')) {
    throw new Error('blinxStore: dataSource must implement query() and mutate().');
  }

  const views = cfg.views || {};
  // UI view registry is store-scoped; DO NOT mutate the user-provided model object.
  const defaultView = cfg.defaultView || Object.keys(views)[0] || 'default';
  const defaultViewConfig = views[defaultView] || { name: defaultView, entityType: 'Record', resource: defaultView };

  // Initialize data source once for the whole store.
  // Per-view stores MUST NOT call init() again, otherwise view-specific defaults can leak across views
  // when a data source keeps mutable config at instance scope.
  if (ds && typeof ds.init === 'function') {
    ds.init({
      model,
      defaults: {
        entityType: defaultViewConfig.entityType || defaultViewConfig.entity || 'Record',
        keyField: defaultViewConfig.keyField || 'id',
        versionField: defaultViewConfig.versionField || 'version',
        ...(cfg.dataSourceOptions || {}),
      }
    });
  }

  // Multi-view manager: exposes a single-model event bus + view selection,
  // while remaining drop-in compatible with a view store by proxying operations to the active view.
  const viewStores = new Map();

  function getOrCreateViewStore(name) {
    const key = name || defaultView;
    if (viewStores.has(key)) return viewStores.get(key);
    const vc = views[key];
    if (!vc) throw new Error(`Unknown collection/view "${String(key)}".`);
    const vs = createRemoteViewStore({ model, dataSource: ds, viewName: key, viewConfig: { ...vc, name: key } });
    viewStores.set(key, vs);
    return vs;
  }

  // Eagerly create default view store (preserves historic behavior: store methods work immediately).
  const defaultStore = createRemoteViewStore({ model, dataSource: ds, viewName: defaultView, viewConfig: { ...defaultViewConfig, name: defaultView } });
  viewStores.set(defaultView, defaultStore);

  const subs = new Set();
  let activeView = defaultView;
  let activeUnsubscribe = null;
  let managerApi;

  function notify(path, value) {
    subs.forEach(fn => fn({ path, value, data: managerApi.toJSON(), store: managerApi }));
  }

  function attachActiveSubscription() {
    if (typeof activeUnsubscribe === 'function') activeUnsubscribe();
    const vs = getOrCreateViewStore(activeView);
    activeUnsubscribe = vs.subscribe(ev => {
      // Forward view events through the manager. Use the manager as `store` so non-UI listeners
      // can treat it as the model-scoped event bus.
      const payload = ev && typeof ev === 'object'
        ? { ...ev, store: managerApi, view: activeView }
        : { path: [EventTypes.update], value: null, data: managerApi.toJSON(), store: managerApi, view: activeView };
      subs.forEach(fn => fn(payload));
    });
  }

  function activeStore() {
    return getOrCreateViewStore(activeView);
  }

  function proxy(method, ...args) {
    const vs = activeStore();
    if (!vs || typeof vs[method] !== 'function') {
      throw new Error(`blinxStore: active view store does not implement "${String(method)}".`);
    }
    return vs[method](...args);
  }

  managerApi = {
    // ---- View management ----
    collection(name) {
      // Back-compat: when called without a name, return the active view store.
      if (name === undefined || name === null) return activeStore();
      return getOrCreateViewStore(name);
    },
    // Preferred alias (clearer semantics)
    view(name) { return managerApi.collection(name); },
    getViews: () => ({ ...views }),
    getActiveView: () => activeView,
    setActiveView(name) {
      const next = name || defaultView;
      if (next === activeView) return activeView;
      // Validate (will throw for unknown views)
      getOrCreateViewStore(next);
      const prev = activeView;
      activeView = next;
      attachActiveSubscription();
      notify([EventTypes.viewChanged, next], { from: prev, to: next });
      return activeView;
    },
    active: () => activeStore(),

    // ---- Event bus ----
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },

    // ---- View-store compatible API (proxied to active view) ----
    getModel: () => model,
    getRecord: (idx) => proxy('getRecord', idx),
    getLength: () => proxy('getLength'),
    setField: (idx, field, value) => proxy('setField', idx, field, value),
    addRecord: (record, atIndex) => proxy('addRecord', record, atIndex),
    removeRecords: (indexes) => proxy('removeRecords', indexes),
    updateIndex: (index) => proxy('updateIndex', index),
    update: (index, record) => proxy('update', index, record),
    toJSON: () => proxy('toJSON'),
    diff: () => proxy('diff'),
    commit: () => proxy('commit'),
    reset: () => proxy('reset'),

    // Remote/view-oriented API
    loadFirst: (criteria) => proxy('loadFirst', criteria),
    pageNext: () => proxy('pageNext'),
    pagePrev: () => proxy('pagePrev'),
    search: (criteria) => proxy('search', criteria),
    save: () => proxy('save'),
    getStatus: () => proxy('getStatus'),
    getPagingState: () => proxy('getPagingState'),

    // Criteria + cache API (new; proxied to active view)
    setCriteria: (criteria) => proxy('setCriteria', criteria),
    getCriteria: () => proxy('getCriteria'),
    getCacheStatus: () => proxy('getCacheStatus'),
    cacheSnapshot: () => proxy('cacheSnapshot'),
    cacheWarmAll: (opts) => proxy('cacheWarmAll', opts),
  };

  // Initialize subscription to the default view for manager-level events.
  attachActiveSubscription();

  return managerApi;
}

// Backwards-compatible alias (deprecated)
export { blinxStore as createBlinxStore };

// Re-export data source types for convenience
export { BlinxDataSource, BlinxArrayDataSource, BlinxRestDataSource };
