
function isPromiseLike(v) {
  return v && (typeof v === 'object' || typeof v === 'function') && typeof v.then === 'function';
}

function isUnsetValue(value) {
  return value === undefined || value === '';
}

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

function toPlainDecimalString(n) {
  // Converts number to non-exponent form for digit counting.
  if (!Number.isFinite(n)) return String(n);
  const s = String(n);
  if (!/e/i.test(s)) return s;
  const sign = n < 0 ? '-' : '';
  const [coeffRaw, expRaw] = s.replace('-', '').split(/e/i);
  const exp = Number(expRaw);
  const [intPart, fracPart = ''] = coeffRaw.split('.');
  const digits = (intPart + fracPart).replace(/^0+/, '') || '0';
  const dotPos = intPart.length;
  const newDot = dotPos + exp;
  if (newDot <= 0) {
    return `${sign}0.${'0'.repeat(Math.abs(newDot))}${digits}`;
  }
  if (newDot >= digits.length) {
    return `${sign}${digits}${'0'.repeat(newDot - digits.length)}`;
  }
  return `${sign}${digits.slice(0, newDot)}.${digits.slice(newDot)}`;
}

function isMultipleOf(n, step) {
  if (!Number.isFinite(n) || !Number.isFinite(step) || step === 0) return false;
  const q = n / step;
  const nearest = Math.round(q);
  return Math.abs(q - nearest) <= 1e-12;
}

function parseDateLike(value) {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }
  const d = new Date(value);
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
}

const FORMAT_CHECKS = {
  email: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  url: v => { try { new URL(v); return true; } catch { return false; } },
  uuid: v => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
  slug: v => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v),
};

function normalizeStringLength(def = {}) {
  const min = def.minLength ?? def.length?.min;
  const max = def.maxLength ?? def.length?.max;
  const exact = def.exactLength ?? def.length?.exact;
  return { min, max, exact };
}

function normalizeItemDef(def = {}) {
  const it = def.itemType;
  if (!it) return null;
  if (typeof it === 'string') return { type: it };
  if (it && typeof it === 'object') return it;
  return null;
}

export function coerceField(value, def = {}) {
  let v = value;
  if (!def || typeof def !== 'object') return v;

  if (v === null || v === undefined) return v;

  if ((def.type === 'string' || def.type === 'longText' || def.type === 'secret') && typeof v === 'string') {
    if (def.trim) v = v.trim();
    if (def.lowercase) v = v.toLowerCase();
  }

  if (typeof def.coerce === 'function') {
    try { v = def.coerce(v, def); } catch { /* ignore coercion errors */ }
  }

  // Optional, lightweight built-in coercions by type.
  if (def.type === 'number' && typeof v === 'string' && v !== '') {
    const n = Number(v);
    if (!Number.isNaN(n)) v = n;
  }

  return v;
}

function runCustomValidatorsSync(value, def, errors) {
  const validators = Array.isArray(def?.validators) ? def.validators : [];
  for (const fn of validators) {
    if (typeof fn !== 'function') continue;
    try {
      const res = fn(value, def);
      if (typeof res === 'string' && res) errors.push(res);
      else if (Array.isArray(res)) errors.push(...res.filter(Boolean).map(String));
    } catch (e) {
      errors.push('Invalid value.');
    }
  }
}

async function runCustomValidatorsAsync(value, def, errors) {
  const validators = Array.isArray(def?.asyncValidators) ? def.asyncValidators : [];
  for (const fn of validators) {
    if (typeof fn !== 'function') continue;
    try {
      const res = fn(value, def);
      const out = isPromiseLike(res) ? await res : res;
      if (typeof out === 'string' && out) errors.push(out);
      else if (Array.isArray(out)) errors.push(...out.filter(Boolean).map(String));
    } catch (e) {
      errors.push('Invalid value.');
    }
  }
}

export function validateField(value, def = {}) {
  const errors = [];
  const d = def && typeof def === 'object' ? def : {};
  const v = coerceField(value, d);

  // Required / nullable
  if (d.required) {
    const emptyArray = Array.isArray(v) && v.length === 0;
    const empty = isUnsetValue(v) || emptyArray || (v === null && d.nullable !== true);
    if (empty) errors.push('This field is required.');
  }

  // Treat null/undefined/'' as "unset" for constraint checks (unless required already failed).
  if (v === null || isUnsetValue(v)) {
    runCustomValidatorsSync(v, d, errors);
    return errors;
  }

  // Array constraints + recursive itemType
  if (d.type === 'array') {
    if (!Array.isArray(v)) {
      errors.push('Must be an array.');
      runCustomValidatorsSync(v, d, errors);
      return errors;
    }
    if (d.minItems !== undefined && v.length < d.minItems) errors.push(`Must have at least ${d.minItems} item(s).`);
    if (d.maxItems !== undefined && v.length > d.maxItems) errors.push(`Must have at most ${d.maxItems} item(s).`);
    if (d.uniqueItems) {
      const seen = new Set();
      for (const item of v) {
        const key = stableStringify(item);
        if (seen.has(key)) { errors.push('Items must be unique.'); break; }
        seen.add(key);
      }
    }
    const itemDef = normalizeItemDef(d);
    if (itemDef) {
      for (let i = 0; i < v.length; i++) {
        const itemErrs = validateField(v[i], itemDef);
        if (itemErrs.length) errors.push(`Item ${i + 1}: ${itemErrs.join(' ')}`);
      }
    }
    runCustomValidatorsSync(v, d, errors);
    return errors;
  }

  // Number constraints (step/multipleOf, integerOnly, precision/scale)
  if (d.type === 'number') {
    const n = (typeof v === 'number') ? v : Number(v);
    if (Number.isNaN(n)) errors.push('Must be a number.');
    else {
      if (d.min !== undefined && n < d.min) errors.push(`Must be ≥ ${d.min}.`);
      if (d.max !== undefined && n > d.max) errors.push(`Must be ≤ ${d.max}.`);
      if (d.integerOnly && !Number.isInteger(n)) errors.push('Must be an integer.');
      const step = d.multipleOf ?? d.step;
      if (step !== undefined && !Number.isNaN(Number(step))) {
        const s = Number(step);
        if (!isMultipleOf(n, s)) errors.push(`Must be a multiple of ${s}.`);
      }
      if (d.scale !== undefined || d.precision !== undefined) {
        const str = toPlainDecimalString(n).replace(/^-/, '');
        const [ip, fp = ''] = str.split('.');
        const digitsBefore = (ip || '0').replace(/^0+/, '') || '0';
        const digitsAfter = fp.replace(/0+$/, ''); // value-normalized
        const scale = d.scale !== undefined ? Number(d.scale) : undefined;
        const precision = d.precision !== undefined ? Number(d.precision) : undefined;
        if (scale !== undefined && Number.isFinite(scale) && digitsAfter.length > scale) {
          errors.push(`Max ${scale} decimal place(s).`);
        }
        if (precision !== undefined && Number.isFinite(precision)) {
          const totalDigits = (digitsBefore === '0' ? 1 : digitsBefore.length) + digitsAfter.length;
          if (totalDigits > precision) errors.push(`Max precision ${precision}.`);
        }
      }
    }
    runCustomValidatorsSync(v, d, errors);
    return errors;
  }

  // Boolean type check
  if (d.type === 'boolean') {
    if (typeof v !== 'boolean') errors.push('Must be true/false.');
    runCustomValidatorsSync(v, d, errors);
    return errors;
  }

  // Enum
  if (d.type === 'enum') {
    // Keep historic "falsy means unset" behavior for enums, unless explicitly required (handled above).
    if (v && !d.values?.includes(v)) errors.push('Invalid choice.');
    runCustomValidatorsSync(v, d, errors);
    return errors;
  }

  // Date / datetime constraints
  if (d.type === 'date' || d.type === 'datetime') {
    // Keep historic "falsy means unset" behavior for date, unless required (handled above).
    if (!v) {
      runCustomValidatorsSync(v, d, errors);
      return errors;
    }
    const t = parseDateLike(v);
    if (t === null) errors.push('Invalid date.');
    else {
      const minT = d.minDate !== undefined ? parseDateLike(d.minDate) : null;
      const maxT = d.maxDate !== undefined ? parseDateLike(d.maxDate) : null;
      if (minT !== null && t < minT) errors.push(`Must be on/after ${String(d.minDate)}.`);
      if (maxT !== null && t > maxT) errors.push(`Must be on/before ${String(d.maxDate)}.`);
      const now = Date.now();
      if (d.pastOnly && !(t < now)) errors.push('Must be in the past.');
      if (d.futureOnly && !(t > now)) errors.push('Must be in the future.');
    }
    runCustomValidatorsSync(v, d, errors);
    return errors;
  }

  // String constraints (format helpers, exactLength/minLength/maxLength)
  if (d.type === 'string' || d.type === 'longText' || d.type === 'secret') {
    if (typeof v !== 'string') {
      errors.push('Must be a string.');
      runCustomValidatorsSync(v, d, errors);
      return errors;
    }
    const { min, max, exact } = normalizeStringLength(d);
    if (exact !== undefined && v.length !== exact) errors.push(`Length must be ${exact}.`);
    if (min !== undefined && v.length < min) errors.push(`Min length ${min}.`);
    if (max !== undefined && v.length > max) errors.push(`Max length ${max}.`);

    if (d.format && FORMAT_CHECKS[d.format]) {
      if (!FORMAT_CHECKS[d.format](v)) errors.push('Invalid format.');
    } else if (d.pattern) {
      const re = d.pattern instanceof RegExp ? d.pattern : new RegExp(d.pattern);
      if (!re.test(v)) errors.push('Invalid format.');
    }

    runCustomValidatorsSync(v, d, errors);
    return errors;
  }

  // Default: custom validators only
  runCustomValidatorsSync(v, d, errors);
  return errors;
}

export async function validateFieldAsync(value, def = {}) {
  const errors = validateField(value, def);
  await runCustomValidatorsAsync(coerceField(value, def), def, errors);
  return errors;
}

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