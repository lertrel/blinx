import { REQUIRED_MESSAGE } from './constants.js';

export function isPromiseLike(v) {
  return v && (typeof v === 'object' || typeof v === 'function') && typeof v.then === 'function';
}

export function isUnsetValue(value) {
  return value === undefined || value === '';
}

export function validateRequired(value, def = {}) {
  if (!def?.required) return [];
  const emptyArray = Array.isArray(value) && value.length === 0;
  const empty = isUnsetValue(value) || emptyArray || (value === null && def.nullable !== true);
  return empty ? [REQUIRED_MESSAGE] : [];
}

export function runCustomValidatorsSync(value, def, errors) {
  const validators = Array.isArray(def?.validators) ? def.validators : [];
  for (const fn of validators) {
    if (typeof fn !== 'function') continue;
    try {
      const res = fn(value, def);
      if (typeof res === 'string' && res) errors.push(res);
      else if (Array.isArray(res)) errors.push(...res.filter(Boolean).map(String));
    } catch {
      errors.push('Invalid value.');
    }
  }
}

export async function runCustomValidatorsAsync(value, def, errors) {
  const validators = Array.isArray(def?.asyncValidators) ? def.asyncValidators : [];
  for (const fn of validators) {
    if (typeof fn !== 'function') continue;
    try {
      const res = fn(value, def);
      const out = isPromiseLike(res) ? await res : res;
      if (typeof out === 'string' && out) errors.push(out);
      else if (Array.isArray(out)) errors.push(...out.filter(Boolean).map(String));
    } catch {
      errors.push('Invalid value.');
    }
  }
}

