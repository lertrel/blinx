import { INVALID_DATE_MESSAGE } from './constants.js';

function parseDateLike(value) {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }
  const d = new Date(value);
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
}

export function validateDate(value, def = {}) {
  const errors = [];

  // Keep historic "falsy means unset" behavior for date/datetime (unless required already failed upstream).
  if (!value) return errors;

  const t = parseDateLike(value);
  if (t === null) {
    errors.push(INVALID_DATE_MESSAGE);
    return errors;
  }

  const minT = def.minDate !== undefined ? parseDateLike(def.minDate) : null;
  const maxT = def.maxDate !== undefined ? parseDateLike(def.maxDate) : null;
  if (minT !== null && t < minT) errors.push(`Must be on/after ${String(def.minDate)}.`);
  if (maxT !== null && t > maxT) errors.push(`Must be on/before ${String(def.maxDate)}.`);

  const now = Date.now();
  if (def.pastOnly && !(t < now)) errors.push('Must be in the past.');
  if (def.futureOnly && !(t > now)) errors.push('Must be in the future.');

  return errors;
}

