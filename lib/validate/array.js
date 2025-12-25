import { ITEMS_MUST_BE_UNIQUE_MESSAGE, MUST_BE_ARRAY_MESSAGE } from './constants.js';

function stableStringify(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'string') return JSON.stringify(value);
  if (t === 'number') return Number.isFinite(value) ? `n:${String(value)}` : `n:${String(value)}`;
  if (t === 'boolean') return `b:${value ? '1' : '0'}`;
  if (t === 'bigint') return `bi:${String(value)}`;
  if (t === 'undefined') return 'u:';
  if (Array.isArray(value)) return `a:[${value.map(stableStringify).join(',')}]`;
  if (t === 'object') {
    const keys = Object.keys(value).sort();
    return `o:{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return `x:${String(value)}`;
}

function normalizeItemDef(def = {}) {
  const it = def.itemType;
  if (!it) return null;
  if (typeof it === 'string') return { type: it };
  if (it && typeof it === 'object') return it;
  return null;
}

export function validateArray(value, def = {}, validateField) {
  const errors = [];
  if (!Array.isArray(value)) {
    errors.push(MUST_BE_ARRAY_MESSAGE);
    return errors;
  }

  if (def.minItems !== undefined && value.length < def.minItems) errors.push(`Must have at least ${def.minItems} item(s).`);
  if (def.maxItems !== undefined && value.length > def.maxItems) errors.push(`Must have at most ${def.maxItems} item(s).`);

  if (def.uniqueItems) {
    const seen = new Set();
    for (const item of value) {
      const key = stableStringify(item);
      if (seen.has(key)) { errors.push(ITEMS_MUST_BE_UNIQUE_MESSAGE); break; }
      seen.add(key);
    }
  }

  const itemDef = normalizeItemDef(def);
  if (itemDef && typeof validateField === 'function') {
    for (let i = 0; i < value.length; i++) {
      const itemErrs = validateField(value[i], itemDef);
      if (itemErrs.length) errors.push(`Item ${i + 1}: ${itemErrs.join(' ')}`);
    }
  }

  return errors;
}

