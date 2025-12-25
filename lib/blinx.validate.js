
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isEmptyValue(value) {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function normalizeLength(def = {}) {
  const { length = {} } = def;
  return {
    min: length.min ?? def.minLength,
    max: length.max ?? def.maxLength,
    exact: length.exact ?? def.exactLength,
  };
}

function parseDateLike(input) {
  if (!input && input !== 0) return NaN;
  if (input instanceof Date) return input.getTime();
  return new Date(input).getTime();
}

function cloneDefaultValue(value) {
  if (Array.isArray(value)) return value.map(cloneDefaultValue);
  if (value instanceof Date) return new Date(value.getTime());
  if (value && typeof value === 'object') return { ...value };
  return value;
}

export function createDefaultValue(def = {}) {
  if ('defaultValue' in def) {
    const v = typeof def.defaultValue === 'function' ? def.defaultValue() : def.defaultValue;
    return cloneDefaultValue(v);
  }
  if (def.nullable) return null;
  switch (def.type) {
    case 'boolean':
      return false;
    case 'number':
      return '';
    case 'array':
      return [];
    default:
      return '';
  }
}

export function coerceFieldValue(value, def = {}) {
  const coerces = {
    trim: def.trim || def.coerce?.trim,
    lowercase: def.lowercase || def.coerce?.lowercase,
    uppercase: def.uppercase || def.coerce?.uppercase,
    collapseWhitespace: def.coerce?.collapseWhitespace,
  };
  let next = value;
  if (typeof next === 'string') {
    if (coerces.trim) next = next.trim();
    if (coerces.collapseWhitespace) next = next.replace(/\s+/g, ' ');
    if (coerces.lowercase) next = next.toLowerCase();
    if (coerces.uppercase) next = next.toUpperCase();
  }
  return next;
}

function enforceFormat(value, def, errors) {
  if (!def.format || typeof value !== 'string' || value === '') return;
  switch (def.format) {
    case 'email':
      if (!EMAIL_REGEX.test(value)) errors.push('Must be a valid email.');
      break;
    case 'url':
      try {
        // eslint-disable-next-line no-new
        new URL(value);
      } catch {
        errors.push('Must be a valid URL.');
      }
      break;
    case 'uuid':
      if (!UUID_REGEX.test(value)) errors.push('Must be a valid UUID.');
      break;
    case 'slug':
      if (!SLUG_REGEX.test(value)) errors.push('Must be a valid slug (letters, numbers, dashes).');
      break;
    default:
      break;
  }
}

function validateArray(value, def, errors) {
  if (value === '' || value === undefined || value === null) return;
  if (!Array.isArray(value)) {
    errors.push('Must be an array.');
    return;
  }

  if (def.minItems !== undefined && value.length < def.minItems) {
    errors.push(`Must include at least ${def.minItems} item(s).`);
  }
  if (def.maxItems !== undefined && value.length > def.maxItems) {
    errors.push(`Must include no more than ${def.maxItems} item(s).`);
  }
  if (def.uniqueItems) {
    const unique = new Set(value.map(item => (typeof item === 'object' ? JSON.stringify(item) : item)));
    if (unique.size !== value.length) errors.push('Items must be unique.');
  }
  const itemDef = def.items || (def.itemType ? { type: def.itemType } : null);
  if (itemDef) {
    value.forEach((item, idx) => {
      const itemErrors = validateField(item, itemDef);
      if (itemErrors.length) errors.push(`Item ${idx}: ${itemErrors.join(' ')}`);
    });
  }
}

export function validateField(rawValue, def = {}) {
  const value = coerceFieldValue(rawValue, def);
  const errors = [];
  const isNullish = value === null || value === undefined;

  if (!def.nullable && value === null && !def.required) errors.push('Null is not allowed.');

  if (def.required) {
    const nullAllowed = def.nullable && isNullish;
    if (!nullAllowed && isEmptyValue(value)) {
      errors.push('This field is required.');
    }
  }

  if (def.type === 'number') {
    if (!(value === '' || value === null || value === undefined)) {
      const n = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(n)) {
        errors.push('Must be a number.');
      } else {
        if (def.min !== undefined && n < def.min) errors.push(`Must be ≥ ${def.min}.`);
        if (def.max !== undefined && n > def.max) errors.push(`Must be ≤ ${def.max}.`);
        if (def.integerOnly && !Number.isInteger(n)) errors.push('Must be an integer.');
        if (def.multipleOf !== undefined) {
          if (n % def.multipleOf !== 0) errors.push(`Must be a multiple of ${def.multipleOf}.`);
        } else if (def.step !== undefined) {
          const base = def.stepBase ?? 0;
          const diff = (n - base) / def.step;
          if (!Number.isInteger(diff)) errors.push(`Must align with step ${def.step}.`);
        }
        if (def.precision !== undefined || def.scale !== undefined) {
          const str = String(value);
          const [intPartRaw, fracPartRaw = ''] = str.replace('-', '').split('.');
          const precision = (intPartRaw.replace(/^0+/, '') || '0').length + fracPartRaw.length;
          const scale = fracPartRaw.length;
          if (def.precision !== undefined && precision > def.precision) {
            errors.push(`Exceeds precision ${def.precision}.`);
          }
          if (def.scale !== undefined && scale > def.scale) {
            errors.push(`Exceeds scale ${def.scale}.`);
          }
        }
      }
    }
  }

  if (def.type === 'string' && typeof value === 'string') {
    const { min, max, exact } = normalizeLength(def);
    const len = value.length;
    if (exact !== undefined && len !== exact) errors.push(`Exact length ${exact} required.`);
    if (min !== undefined && len < min) errors.push(`Min length ${min}.`);
    if (max !== undefined && len > max) errors.push(`Max length ${max}.`);
    if (def.pattern) {
      const regex = def.pattern instanceof RegExp ? def.pattern : new RegExp(def.pattern);
      if (!regex.test(value)) errors.push('Invalid format.');
    }
    enforceFormat(value, def, errors);
  }

  if (def.type === 'enum' && value !== '' && value !== null && value !== undefined) {
    if (!def.values?.includes(value)) errors.push('Invalid choice.');
  }

  if (def.type === 'date' && value) {
    const ts = parseDateLike(value);
    if (Number.isNaN(ts)) errors.push('Invalid date.');
    else {
      if (def.minDate !== undefined) {
        const minTs = parseDateLike(def.minDate);
        if (!Number.isNaN(minTs) && ts < minTs) errors.push('Date must be on/after minDate.');
      }
      if (def.maxDate !== undefined) {
        const maxTs = parseDateLike(def.maxDate);
        if (!Number.isNaN(maxTs) && ts > maxTs) errors.push('Date must be on/before maxDate.');
      }
      if (def.pastOnly && ts > Date.now()) errors.push('Date must be in the past.');
      if (def.futureOnly && ts < Date.now()) errors.push('Date must be in the future.');
    }
  }

  if (def.type === 'array') {
    validateArray(value, def, errors);
  }

  if (Array.isArray(def.validators)) {
    def.validators.forEach(fn => {
      if (typeof fn !== 'function') return;
      try {
        const result = fn(value, def);
        if (Array.isArray(result)) result.filter(Boolean).forEach(msg => errors.push(msg));
        else if (result) errors.push(result);
      } catch (err) {
        errors.push(err?.message || 'Custom validator failed.');
      }
    });
  }

  return errors;
}