
import { DataTypes } from './blinx.store.js';

const NUMERIC_TYPES = new Set([
  DataTypes.number,
  DataTypes.currency,
  DataTypes.percent,
  DataTypes.rating,
]);

const STRING_TYPES = new Set([
  DataTypes.string,
  DataTypes.longText,
  DataTypes.richText,
  DataTypes.markdown,
  DataTypes.address,
  DataTypes.secret,
  DataTypes.json,
  DataTypes.email,
  DataTypes.phone,
  DataTypes.url,
  DataTypes.slug,
  DataTypes.uuid,
  DataTypes.id,
  DataTypes.blob,
]);

const FORMAT_VALIDATORS = {
  [DataTypes.email]: {
    test: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    message: 'Must be a valid email address.',
  },
  [DataTypes.phone]: {
    test: (v) => /^\+?[1-9]\d{7,14}$/.test(v.replace(/[\s()-]/g, '')),
    message: 'Must be a valid phone number (E.164).',
  },
  [DataTypes.url]: {
    test: (v) => {
      try {
        // eslint-disable-next-line no-new
        new URL(v);
        return true;
      } catch {
        return false;
      }
    },
    message: 'Must be a valid URL.',
  },
  [DataTypes.slug]: {
    test: (v) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v),
    message: 'Must be a valid slug (lowercase letters, numbers, dashes).',
  },
  [DataTypes.uuid]: {
    test: (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
    message: 'Must be a valid UUID.',
  },
  [DataTypes.id]: {
    test: (v) => /^[A-Za-z0-9-_]+$/.test(v),
    message: 'Must be a valid identifier (letters, numbers, dashes, underscores).',
  },
};

const NUMERIC_DEFAULTS = {
  [DataTypes.percent]: { min: 0, max: 100 },
  [DataTypes.rating]: { min: 0, max: 5 },
};

function isEmptyValue(value, type) {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (type === DataTypes.geoPoint) {
    if (!value || typeof value !== 'object') return true;
    const hasLat = value.lat !== null && value.lat !== undefined && value.lat !== '';
    const hasLng = value.lng !== null && value.lng !== undefined && value.lng !== '';
    return !hasLat && !hasLng;
  }
  return false;
}

function runFormatValidator(key, value, errors) {
  if (!value) return;
  const validator = FORMAT_VALIDATORS[key];
  if (validator && !validator.test(value)) errors.push(validator.message);
}

export function validateField(value, def = {}) {
  const errors = [];
  const type = def.type || DataTypes.string;
  const empty = isEmptyValue(value, type);

  if (def.required && empty) errors.push('This field is required.');
  if (empty) return errors;

  if (NUMERIC_TYPES.has(type)) {
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isNaN(n)) {
      errors.push('Must be a number.');
      return errors;
    }
    const defaults = NUMERIC_DEFAULTS[type] || {};
    const min = def.min !== undefined ? def.min : defaults.min;
    const max = def.max !== undefined ? def.max : defaults.max;
    if (min !== undefined && n < min) errors.push(`Must be ≥ ${min}.`);
    if (max !== undefined && n > max) errors.push(`Must be ≤ ${max}.`);
  } else if (STRING_TYPES.has(type) && typeof value === 'string') {
    const len = value.length;
    if (def.length?.min !== undefined && len < def.length.min) errors.push(`Min length ${def.length.min}.`);
    if (def.length?.max !== undefined && len > def.length.max) errors.push(`Max length ${def.length.max}.`);
    if (def.pattern && !new RegExp(def.pattern).test(value)) errors.push('Invalid format.');
    runFormatValidator(type, value, errors);
    if (def.format) runFormatValidator(def.format, value, errors);
  }

  if (type === DataTypes.enum && value && !def.values?.includes(value)) {
    errors.push('Invalid choice.');
  }

  if (type === DataTypes.date && value && Number.isNaN(new Date(value).getTime())) {
    errors.push('Invalid date.');
  }

  if (type === DataTypes.json) {
    try {
      if (typeof value === 'string') JSON.parse(value);
      else JSON.parse(JSON.stringify(value));
    } catch {
      errors.push('Invalid JSON.');
    }
  }

  if (type === DataTypes.geoPoint) {
    const latProvided = value.lat !== null && value.lat !== undefined && value.lat !== '';
    const lngProvided = value.lng !== null && value.lng !== undefined && value.lng !== '';
    if (latProvided !== lngProvided) {
      errors.push('Latitude and longitude must both be provided.');
      return errors;
    }
    const lat = latProvided ? Number(value.lat) : null;
    const lng = lngProvided ? Number(value.lng) : null;
    if (latProvided && Number.isNaN(lat)) errors.push('Latitude must be a number.');
    if (lngProvided && Number.isNaN(lng)) errors.push('Longitude must be a number.');
    if (latProvided && (lat < -90 || lat > 90)) errors.push('Latitude must be between -90 and 90.');
    if (lngProvided && (lng < -180 || lng > 180)) errors.push('Longitude must be between -180 and 180.');
  }

  return errors;
}