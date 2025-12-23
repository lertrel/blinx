// Computed fields support (virtual, read-only, on-demand).
//
// Design goals:
// - Keep compute logic as plain JS: compute(record, ctx)
// - Treat computed fields as virtual + read-only (never persisted in store state)
// - Cache per-record computed values and invalidate on dependency changes (dependsOn)
// - Detect dependency cycles at model analysis time
//
// NOTE: This module intentionally avoids any DSL.

const MODEL_META = new WeakMap(); // model -> meta
const RECORD_STATE = new WeakMap(); // record(obj) -> { values: Map, inProgress: Set }

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function uniqStrings(arr) {
  const out = [];
  const seen = new Set();
  for (const v of arr || []) {
    if (typeof v !== 'string') continue;
    const s = v.trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function topoSortComputed({ computedKeys, computedDeps }) {
  // computedDeps: Map(field -> Set(computedFieldDepsOnly))
  const indeg = new Map();
  for (const k of computedKeys) indeg.set(k, 0);
  for (const [k, deps] of computedDeps.entries()) {
    for (const d of deps) indeg.set(d, (indeg.get(d) || 0) + 1);
  }

  const q = [];
  for (const [k, n] of indeg.entries()) if (n === 0) q.push(k);
  const out = [];
  while (q.length) {
    const n = q.shift();
    out.push(n);
    const deps = computedDeps.get(n);
    if (!deps) continue;
    for (const d of deps) {
      const next = (indeg.get(d) || 0) - 1;
      indeg.set(d, next);
      if (next === 0) q.push(d);
    }
  }

  if (out.length !== computedKeys.length) {
    // Best-effort cycle reporting: list remaining nodes.
    const remaining = [];
    for (const [k, n] of indeg.entries()) if (n > 0) remaining.push(k);
    throw new Error(`Blinx computed fields: dependency cycle detected: ${remaining.join(' -> ')}`);
  }

  return out;
}

function buildModelMeta(model) {
  const fields = model?.fields;
  if (!isPlainObject(fields)) return null;

  const computed = new Set();
  const computeFns = new Map(); // key -> fn
  const dependsOn = new Map(); // key -> string[]
  const dependentsByField = new Map(); // anyField -> Set(computedFieldsThatDependOnItDirectly)
  const computedDepsOnly = new Map(); // computedField -> Set(computedFieldDepsOnly)

  for (const [key, def] of Object.entries(fields)) {
    if (!def || typeof def !== 'object') continue;
    if (!def.computed) continue;
    computed.add(key);
    const fn = def.compute || def.computeLogic; // allow legacy-ish naming
    if (typeof fn !== 'function') {
      throw new Error(`Blinx computed fields: field "${key}" is marked computed but has no compute(record, ctx) function.`);
    }
    computeFns.set(key, fn);
    const deps = uniqStrings(def.dependsOn || []);
    dependsOn.set(key, deps);
  }

  if (computed.size === 0) {
    return {
      hasComputed: false,
      computedKeys: [],
      computeFns,
      dependsOn,
      dependentsByField,
      order: [],
    };
  }

  // Validate dependsOn references + build dependency maps.
  for (const key of computed) {
    const deps = dependsOn.get(key) || [];
    for (const dep of deps) {
      if (!Object.prototype.hasOwnProperty.call(fields, dep)) {
        throw new Error(`Blinx computed fields: field "${key}" dependsOn unknown field "${dep}".`);
      }
      if (!dependentsByField.has(dep)) dependentsByField.set(dep, new Set());
      dependentsByField.get(dep).add(key);
    }
    // Computed->computed edges only for cycle detection / ordering.
    const computedOnly = new Set(deps.filter(d => computed.has(d)));
    computedDepsOnly.set(key, computedOnly);
  }

  // Cycle detection on computed-only graph.
  // NOTE: We are not auto-inferring dependencies from compute() body; dependsOn is authoritative.
  topoSortComputed({ computedKeys: Array.from(computed), computedDeps: computedDepsOnly });

  // Precompute a full evaluation order (topological) for "compute all" cases.
  // We want dependencies first, so we invert edges for topo ordering:
  // Our computedDepsOnly currently stores key -> deps; we can topo sort by Kahn using reversed edges:
  const forward = new Map(); // dep -> Set(dependent)
  const indeg = new Map();
  for (const k of computed) indeg.set(k, 0);
  for (const [k, deps] of computedDepsOnly.entries()) {
    for (const dep of deps) {
      if (!forward.has(dep)) forward.set(dep, new Set());
      forward.get(dep).add(k);
      indeg.set(k, (indeg.get(k) || 0) + 1);
    }
  }
  const q = [];
  for (const [k, n] of indeg.entries()) if (n === 0) q.push(k);
  const order = [];
  while (q.length) {
    const n = q.shift();
    order.push(n);
    const outs = forward.get(n);
    if (!outs) continue;
    for (const d of outs) {
      const next = (indeg.get(d) || 0) - 1;
      indeg.set(d, next);
      if (next === 0) q.push(d);
    }
  }

  return {
    hasComputed: true,
    computedKeys: Array.from(computed),
    computeFns,
    dependsOn,
    dependentsByField,
    order,
  };
}

export function getComputedModelMeta(model) {
  if (!model || typeof model !== 'object') return null;
  if (MODEL_META.has(model)) return MODEL_META.get(model);
  const meta = buildModelMeta(model);
  MODEL_META.set(model, meta);
  return meta;
}

export function isComputedField(model, fieldKey) {
  const meta = getComputedModelMeta(model);
  if (!meta || !meta.hasComputed) return false;
  return meta.computeFns.has(String(fieldKey));
}

export function stripComputedFields(model, recordLike) {
  if (!recordLike || typeof recordLike !== 'object') return recordLike;
  const meta = getComputedModelMeta(model);
  if (!meta || !meta.hasComputed) return recordLike;
  const out = { ...recordLike };
  for (const k of meta.computedKeys) {
    if (Object.prototype.hasOwnProperty.call(out, k)) delete out[k];
  }
  return out;
}

function getRecordState(record) {
  let st = RECORD_STATE.get(record);
  if (!st) {
    st = { values: new Map(), inProgress: new Set() };
    RECORD_STATE.set(record, st);
  }
  return st;
}

export function invalidateComputedForField(model, record, changedField) {
  if (!record || typeof record !== 'object') return;
  const meta = getComputedModelMeta(model);
  if (!meta || !meta.hasComputed) return;

  const start = String(changedField);
  const visited = new Set([start]);
  const q = [start];
  const st = getRecordState(record);

  while (q.length) {
    const cur = q.shift();
    const deps = meta.dependentsByField.get(cur);
    if (!deps) continue;
    for (const computedField of deps) {
      st.values.delete(computedField);
      if (visited.has(computedField)) continue;
      visited.add(computedField);
      q.push(computedField);
    }
  }
}

function computeField(model, record, fieldKey, ctx) {
  const meta = getComputedModelMeta(model);
  if (!meta || !meta.hasComputed) return undefined;
  const key = String(fieldKey);
  const fn = meta.computeFns.get(key);
  if (!fn) return undefined;

  const st = getRecordState(record);
  if (st.values.has(key)) return st.values.get(key);
  if (st.inProgress.has(key)) {
    throw new Error(`Blinx computed fields: cycle while computing "${key}". Check dependsOn configuration.`);
  }

  st.inProgress.add(key);
  try {
    const localCtx = ctx || {};
    // Provide a stable ctx.get() so compute functions can explicitly read dependencies.
    if (typeof localCtx.get !== 'function') {
      localCtx.get = (name) => {
        const n = String(name);
        if (meta.computeFns.has(n)) return computeField(model, record, n, localCtx);
        return record?.[n];
      };
    }
    // Pass a computed-aware record view so compute() can read other computed
    // fields via normal property access (e.g., record.subtotal).
    const recordView = new Proxy(record, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && meta.computeFns.has(prop)) {
          return computeField(model, target, prop, localCtx);
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const val = fn(recordView, localCtx);
    st.values.set(key, val);
    return val;
  } finally {
    st.inProgress.delete(key);
  }
}

export function decorateRecordWithComputed(model, record, { ctx } = {}) {
  const meta = getComputedModelMeta(model);
  if (!meta || !meta.hasComputed || !record || typeof record !== 'object') return record;
  // Proxy is intentionally minimal:
  // - Does NOT add computed fields to enumeration (keeps backwards-compatible equality checks)
  // - Only intercepts property get for computed keys
  return new Proxy(record, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && meta.computeFns.has(prop)) {
        return computeField(model, target, prop, ctx);
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

export function cloneWithComputed(model, record, { clone, ctx } = {}) {
  // clone: optional deep-clone function; if not provided, do a JSON-only clone.
  if (!record || typeof record !== 'object') return record;
  const meta = getComputedModelMeta(model);
  const base = (typeof clone === 'function')
    ? clone(record)
    : JSON.parse(JSON.stringify(record));
  if (!meta || !meta.hasComputed) return base;

  // Compute in topological order so dependsOn computed fields are available.
  // We compute against the *real* record (not the clone) to keep behavior consistent.
  for (const k of meta.order) {
    base[k] = computeField(model, record, k, ctx);
  }
  return base;
}

