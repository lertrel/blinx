export function coerceString(value, def = {}) {
  let v = value;
  if (typeof v !== 'string') return v;
  if (def.trim) v = v.trim();
  if (def.lowercase) v = v.toLowerCase();
  return v;
}

export function coerceNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value !== '') {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  return value;
}

// Scaffold helpers for future use; not applied unless def.coerce does it.
export function coerceDate(value) {
  return value;
}

export function coerceArray(value) {
  return value;
}

export function coerceField(value, def = {}) {
  let v = value;
  if (!def || typeof def !== 'object') return v;

  if (v === null || v === undefined) return v;

  if (def.type === 'string' || def.type === 'longText' || def.type === 'secret') {
    v = coerceString(v, def);
  }

  if (typeof def.coerce === 'function') {
    try { v = def.coerce(v, def); } catch { /* ignore coercion errors */ }
  }

  // Optional, lightweight built-in coercions by type.
  if (def.type === 'number') {
    v = coerceNumber(v);
  }

  return v;
}

