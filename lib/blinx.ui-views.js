/**
 * UI Views registry + resolver (Option A).
 *
 * Goals:
 * - Keep UI views separate from model definitions.
 * - Allow Blinx components to resolve:
 *   (model, kind=form|collection|table, viewName?) -> view object
 * - Support "default" view per kind, plus named views.
 * - Remain backwards compatible with legacy store-scoped `uiViews` maps
 *   (flat: { [key]: viewObj }).
 */
 
import { generateSchemaDefaultUIView, __internal_cacheGeneratedUIView } from './blinx.default-uiviews.js';
import { BlinxConfig } from './blinx.config.js';

const VIEWS_BY_MODEL = new WeakMap(); // model object -> views object
const VIEWS_BY_ID = new Map();        // model id/name -> views object (fallback)

function modelKey(model) {
  if (!model || typeof model !== 'object') return null;
  const id = (typeof model.id === 'string' && model.id) ? model.id : null;
  const name = (typeof model.name === 'string' && model.name) ? model.name : null;
  return id || name || null;
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Register UI views for a model.
 *
 * @param {object} model - model object reference (preferred registry key)
 * @param {object} views - either:
 *   - kind-bucketed: { form: { default: {...}, compact: {...} }, collection: { default: {...} }, ... }
 *   - legacy flat map: { edit: {...}, list: {...} } (supported, but has no per-kind default)
 */
export function registerModelViews(model, views) {
  if (!model || typeof model !== 'object') throw new Error('registerModelViews(model, views): model must be an object.');
  if (!views || typeof views !== 'object') throw new Error('registerModelViews(model, views): views must be an object.');
  VIEWS_BY_MODEL.set(model, views);
  const key = modelKey(model);
  if (key) VIEWS_BY_ID.set(key, views);
}

export function getModelViews(model) {
  if (!model || typeof model !== 'object') return null;
  if (VIEWS_BY_MODEL.has(model)) return VIEWS_BY_MODEL.get(model);
  const key = modelKey(model);
  if (key && VIEWS_BY_ID.has(key)) return VIEWS_BY_ID.get(key);
  return null;
}

/**
 * Resolve a UI view for a model + kind + optional name.
 *
 * Resolution order:
 * - If kind-bucketed:
 *   - viewName provided:
 *     - views[kind][viewName]
 *     - views[kind].default (fallback)
 *   - no viewName:
 *     - views[kind].default
 * - If legacy flat map:
 *   - viewName provided:
 *     - views[viewName]
 *   - no viewName:
 *     - null (no implicit default possible)
 *
 * @returns {object|null} view object or null when unresolved
 */
export function resolveModelUIView({ model, kind, viewName } = {}) {
  const views = getModelViews(model);
  const k = (typeof kind === 'string' && kind) ? kind : null;
  const name = (typeof viewName === 'string' && viewName) ? viewName : null;

  // If no declarative views exist at all, allow schema fallback (only when no viewName is requested).
  if (!views) {
    if (k && !name && BlinxConfig.isGeneratedViewAllowed()) {
      const generated = generateSchemaDefaultUIView({ model, kind: k });
      if (generated) {
        __internal_cacheGeneratedUIView({ model, kind: k, view: generated });
        return generated;
      }
    }
    return null;
  }

  // Kind-bucketed: views.form / views.collection / views.table / ...
  if (k && isPlainObject(views[k])) {
    const bucket = views[k];
    if (name && bucket[name]) return bucket[name];
    if (bucket.default) return bucket.default;
    // Schema fallback only when caller did NOT request a specific viewName.
    if (!name && BlinxConfig.isGeneratedViewAllowed()) {
      const generated = generateSchemaDefaultUIView({ model, kind: k });
      if (generated) {
        __internal_cacheGeneratedUIView({ model, kind: k, view: generated });
        return generated;
      }
    }
    return null;
  }

  // Legacy flat map: { edit: {...}, list: {...} }
  if (name && views[name]) return views[name];

  // Legacy flat map has no per-kind default; fallback only when viewName omitted.
  if (k && !name && BlinxConfig.isGeneratedViewAllowed()) {
    const generated = generateSchemaDefaultUIView({ model, kind: k });
    if (generated) {
      __internal_cacheGeneratedUIView({ model, kind: k, view: generated });
      return generated;
    }
  }

  return null;
}

/**
 * Resolve a UI view for a *component call*.
 * Supports:
 * - view as object (already resolved)
 * - view as string:
 *   - first lookup store.getUIViews()[view] (legacy store-scoped map)
 *   - then lookup registry by (model, kind, viewName=view)
 * - view omitted:
 *   - lookup registry by (model, kind, viewName=null) => default
 */
export function resolveComponentUIView({ store, model, kind, view } = {}) {
  // Explicit object always wins.
  if (view && typeof view === 'object') return view;

  // String: legacy store-scoped map first (preserves historic behavior).
  if (typeof view === 'string') {
    const uiViews = (store && typeof store.getUIViews === 'function') ? store.getUIViews() : null;
    const fromStore = uiViews && typeof uiViews === 'object' ? uiViews[view] : null;
    if (fromStore) return fromStore;

    const fromRegistry = resolveModelUIView({ model, kind, viewName: view });
    if (fromRegistry) return fromRegistry;
    return null;
  }

  // Omitted: use registry default for the kind (if any).
  const fromRegistryDefault = resolveModelUIView({ model, kind, viewName: null });
  if (fromRegistryDefault) return fromRegistryDefault;

  // Final fallback: schema-driven default view generation (only when `view` is truly omitted).
  // IMPORTANT: do NOT generate when caller explicitly requested a missing viewName (string),
  // otherwise typos would silently succeed.
  const hasViewProp = Object.prototype.hasOwnProperty.call(arguments?.[0] || {}, 'view');
  const viewWasOmitted = !hasViewProp || view === undefined;
  if (viewWasOmitted && BlinxConfig.isGeneratedViewAllowed()) {
    const generated = generateSchemaDefaultUIView({ model, kind });
    if (generated) {
      __internal_cacheGeneratedUIView({ model, kind, view: generated });
      return generated;
    }
  }

  return null;
}

