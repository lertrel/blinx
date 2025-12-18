import { BlinxArrayDataSource, BlinxDataSource } from './blinx.datasource.js';

export const DataTypes = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  date: 'date',
  enum: 'enum',
  array: 'array',
};

export const EventTypes = {
  add: 'add',
  remove: 'remove',
  update: 'update',
  commit: 'commit',
  reset: 'reset',
};

const clone = value => JSON.parse(JSON.stringify(value));

function createLegacyArrayStore(initialArray, dataModel) {
  let original = clone(initialArray);
  let current = clone(initialArray);
  const model = dataModel;
  const subs = new Set();
  let storeApi;

  function notify(path, value) {
    subs.forEach(fn => fn({ path, value, data: current, store: storeApi }));
  }

  function getRecord(idx) { return current[idx]; }
  function getModel() { return model; }
  function getLength() { return current.length; }

  function setField(idx, field, value) {
    current[idx][field] = value;
    notify([idx, field], value);
  }

  function addRecord(record, atIndex = current.length) {
    current.splice(atIndex, 0, record);
    notify([EventTypes.add, atIndex], record);
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
    notify([EventTypes.update, index], record);
    return record;
  }

  function update(index, record) {
    if (index < 0 || index >= current.length) return null;
    current[index] = record;
    notify([EventTypes.update, index], record);
    return record;
  }

  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
  function toJSON() { return clone(current); }

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
    notify([EventTypes.commit], snapshot);
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

  if (dataSource && typeof dataSource.init === 'function') {
    dataSource.init({ model, defaults: { entityType, keyField, versionField } });
  }

  function notify(path, value) {
    subs.forEach(fn => fn({ path, value, data: current, store: storeApi }));
  }

  function getModel() { return model; }
  function getLength() { return current.length; }
  function getRecord(idx) { return current[idx]; }
  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
  function toJSON() { return clone(current); }
  function getStatus() { return { status, error, pageInfo, pageState: { ...pageState }, criteria: clone(criteria) }; }

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
    notify([EventTypes.commit], snapshot);
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
    rec[field] = value;
    notify([idx, field], value);

    const id = rec?.[keyField];
    const baseVersion = (original[idx] && original[idx][versionField] !== undefined) ? String(original[idx][versionField]) : null;
    if (id !== undefined && id !== null) {
      enqueueUpdate(id, baseVersion, { [field]: value });
    }
  }

  function addRecord(record, atIndex = current.length) {
    const rec = clone(record || {});
    if (rec[keyField] === undefined || rec[keyField] === null || rec[keyField] === '') {
      rec[keyField] = `tmp-${viewName}-${opSeq++}`;
    }
    if (rec[versionField] === undefined) rec[versionField] = '0';
    current.splice(atIndex, 0, rec);
    notify([EventTypes.add, atIndex], rec);

    enqueue({
      opId: `op-${viewName}-${opSeq++}`,
      type: 'create',
      entity: { type: entityType },
      data: clone(rec),
    });
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
    return removed.length;
  }

  function updateIndex(index) {
    if (index < 0 || index >= current.length) return null;
    const record = current[index];
    notify([EventTypes.update, index], record);
    return record;
  }

  function update(index, record) {
    if (index < 0 || index >= current.length) return null;
    current[index] = clone(record);
    notify([EventTypes.update, index], current[index]);
    return current[index];
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
    const res = await dataSource.query(buildQuerySpec(), {});
    // Materialize as page-local array
    const records = (res?.entities?.[entityType] || []).map(r => clone(r));
    current = records;
    original = clone(records);
    pageInfo = res?.pageInfo || null;
    status = 'success';
    notify([EventTypes.reset, 0], current[0] || null);
    return res;
  }

  async function pageNext() {
    if (!dataSource || typeof dataSource.query !== 'function') throw new Error('Remote store requires a dataSource with query().');
    const mode = pageState.mode || 'cursor';
    if (mode === 'page') pageState = { ...pageState, page: (pageState.page || 0) + 1 };
    else if (mode === 'offset') pageState = { ...pageState, offset: (pageState.offset || 0) + (pageState.limit || 20) };
    else {
      const next = pageInfo?.nextCursor;
      if (next === null || next === undefined) return null;
      pageState = { ...pageState, cursor: next, pageIndex: (pageState.pageIndex || 0) + 1 };
    }
    status = 'loading'; error = null;
    const res = await dataSource.query(buildQuerySpec(), {});
    const records = (res?.entities?.[entityType] || []).map(r => clone(r));
    current = records;
    original = clone(records);
    pageInfo = res?.pageInfo || null;
    status = 'success';
    notify([EventTypes.reset, 0], current[0] || null);
    return res;
  }

  async function pagePrev() {
    if (!dataSource || typeof dataSource.query !== 'function') throw new Error('Remote store requires a dataSource with query().');
    const mode = pageState.mode || 'cursor';
    if (mode === 'page') pageState = { ...pageState, page: Math.max(0, (pageState.page || 0) - 1) };
    else if (mode === 'offset') pageState = { ...pageState, offset: Math.max(0, (pageState.offset || 0) - (pageState.limit || 20)) };
    else {
      const prev = pageInfo?.prevCursor;
      if (prev === null || prev === undefined) return null;
      pageState = { ...pageState, cursor: prev, pageIndex: Math.max(0, (pageState.pageIndex || 0) - 1) };
    }
    status = 'loading'; error = null;
    const res = await dataSource.query(buildQuerySpec(), {});
    const records = (res?.entities?.[entityType] || []).map(r => clone(r));
    current = records;
    original = clone(records);
    pageInfo = res?.pageInfo || null;
    status = 'success';
    notify([EventTypes.reset, 0], current[0] || null);
    return res;
  }

  async function search(nextCriteria) {
    return loadFirst(nextCriteria || {});
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
      res = await dataSource.mutate(ops, {});
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
    // Apply canonical entities (if provided) and snapshot.
    const canonical = res?.entities?.[entityType] || null;
    if (canonical && Array.isArray(canonical)) {
      // Replace by id for any returned records; keep current ordering.
      const byId = new Map(canonical.map(r => [String(r?.[keyField]), clone(r)]));
      current = current.map(r => {
        const id = String(r?.[keyField]);
        return byId.has(id) ? byId.get(id) : r;
      });
    }
    original = clone(current);
    status = 'success';
    notify([EventTypes.commit], clone(current));
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
  const defaultView = cfg.defaultView || Object.keys(views)[0] || 'default';
  const defaultViewConfig = views[defaultView] || { name: defaultView, entityType: 'Record', resource: defaultView };

  // The returned store is the default view controller, with `collection(name)` to access others.
  const defaultStore = createRemoteViewStore({ model, dataSource: ds, viewName: defaultView, viewConfig: { ...defaultViewConfig, name: defaultView } });

  const viewStores = new Map([[defaultView, defaultStore]]);

  defaultStore.collection = (name = defaultView) => {
    const key = name || defaultView;
    if (viewStores.has(key)) return viewStores.get(key);
    const vc = views[key];
    if (!vc) throw new Error(`Unknown collection/view "${String(key)}".`);
    const vs = createRemoteViewStore({ model, dataSource: ds, viewName: key, viewConfig: { ...vc, name: key } });
    viewStores.set(key, vs);
    return vs;
  };

  return defaultStore;
}

// Backwards-compatible alias (deprecated)
export { blinxStore as createBlinxStore };

// Re-export data source types for convenience
export { BlinxDataSource, BlinxArrayDataSource };
