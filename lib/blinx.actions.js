// Minimal action execution helpers:
// - Supports inline function actions (existing behavior)
// - Supports declarative action references via an ActionRegistry:
//    - action: "namespace.id"
//    - action: { id: "namespace.id", payload: {...} }
//
// The registry can be either:
// - { get(id) => handler | { handler, validate? } }
// - a plain object map: { [id]: handler | { handler, validate? } }
//
// Validation chain:
// - validate: [fn, fn, ...]
// - each validator may return:
//    - true / undefined / { ok: true } => pass
//    - false / string / { ok: false, ... } => fail (stop)
//
// This module is intentionally tiny; richer workflow/cancellation can be layered
// by providing a custom runner via the parent component.

function normalizeActionRef(action) {
  if (typeof action === 'string') return { id: action, payload: undefined };
  if (action && typeof action === 'object' && typeof action.id === 'string') {
    return { id: action.id, payload: action.payload };
  }
  return null;
}

function normalizeModule(mod) {
  if (typeof mod === 'function') return { handler: mod, validate: [] };
  if (mod && typeof mod === 'object' && typeof mod.handler === 'function') {
    return {
      handler: mod.handler,
      validate: Array.isArray(mod.validate) ? mod.validate : [],
    };
  }
  return null;
}

function resolveFromRegistry(registry, id) {
  if (!registry) return null;
  if (typeof registry.get === 'function') return registry.get(id);
  if (typeof registry === 'object') return registry[id];
  return null;
}

function normalizeValidationResult(r) {
  if (r === undefined) return { ok: true };
  if (r === true) return { ok: true };
  if (r === false) return { ok: false, code: 'INVALID' };
  if (typeof r === 'string') return { ok: false, code: 'INVALID', message: r };
  if (r && typeof r === 'object' && typeof r.ok === 'boolean') return r;
  // Unknown return value => treat as invalid (defensive)
  return { ok: false, code: 'INVALID' };
}

/**
 * Execute an action spec.
 *
 * @param {object} args
 * @param {any} args.action - action spec (function | string | {id,payload})
 * @param {object} args.ctx - action context passed to validators/handler
 * @param {any} [args.registry] - action registry
 * @param {Function} [args.runner] - custom runner override
 * @param {object} [args.meta] - optional metadata (viewId/controlName/etc.)
 * @returns {Promise<{status: 'success', value: any} | {status: 'invalid', reason: any}>}
 */
export async function executeActionSpec({ action, ctx, registry, runner, meta } = {}) {
  if (typeof action === 'function') {
    const value = await action(ctx);
    return { status: 'success', value };
  }

  const ref = normalizeActionRef(action);
  if (!ref) {
    // Nothing to do (unsupported/empty action spec)
    return { status: 'invalid', reason: { ok: false, code: 'NO_ACTION' } };
  }

  if (typeof runner === 'function') {
    return await runner({ ctx, action: ref, registry, meta });
  }

  const raw = resolveFromRegistry(registry, ref.id);
  const mod = normalizeModule(raw);
  if (!mod) throw new Error(`Unknown action id "${ref.id}" (missing registry entry).`);

  for (const validate of mod.validate) {
    if (typeof validate !== 'function') continue;
    // NOTE: no cancellation plumbing here by design (can be added by custom runner)
    const r = normalizeValidationResult(await validate(ctx, ref.payload));
    if (!r.ok) return { status: 'invalid', reason: r };
  }

  const value = await mod.handler(ctx, ref.payload);
  return { status: 'success', value };
}

