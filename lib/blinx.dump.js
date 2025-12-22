import { __internal_getGeneratedUIViewSnapshots } from './blinx.default-uiviews.js';

function safeStringify(value) {
  // JSON-only: keeps output copy/pasteable.
  return JSON.stringify(value, null, 2);
}

/**
 * Dev helper to dump internal Blinx artifacts for copy/paste.
 *
 * Currently supported:
 * - blinxDump('ui-view'): dumps cached schema-generated UI views (if any)
 */
export function blinxDump(what, _options = {}) {
  const key = String(what || '').trim();
  if (!key) throw new Error('blinxDump(what): missing "what".');

  if (key === 'ui-view') {
    const snaps = __internal_getGeneratedUIViewSnapshots();
    const payload = snaps.length === 1 ? snaps[0] : { generatedUIViews: snaps };
    const out = safeStringify(payload);

    // Intentionally no "auto-generated" label; dev explicitly opted into dumping.
    if (typeof console !== 'undefined' && console && typeof console.log === 'function') {
      console.log(out);
    }
    return out;
  }

  throw new Error(`blinxDump: unsupported dump target "${key}".`);
}

