import { coerceField } from './coerce.js';

export function defaultValueForField(def = {}) {
  if (!def || typeof def !== 'object') return '';
  if (Object.prototype.hasOwnProperty.call(def, 'defaultValue')) {
    const dv = def.defaultValue;
    if (typeof dv === 'function') {
      try { return dv(def); } catch { return ''; }
    }
    return dv;
  }
  if (def.nullable) return null;
  switch (def.type) {
    case 'boolean': return false;
    case 'array': return [];
    default: return '';
  }
}

export function seedRecord(model) {
  const fields = model?.fields || {};
  const rec = {};
  for (const [k, def] of Object.entries(fields)) {
    if (def?.computed) continue;
    rec[k] = coerceField(defaultValueForField(def), def);
  }
  return rec;
}

