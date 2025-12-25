import { INVALID_CHOICE_MESSAGE, INVALID_FORMAT_MESSAGE, MUST_BE_STRING_MESSAGE } from './constants.js';
import { compilePattern, getFormatCheck } from './formats.js';

function normalizeStringLength(def = {}) {
  const min = def.minLength ?? def.length?.min;
  const max = def.maxLength ?? def.length?.max;
  const exact = def.exactLength ?? def.length?.exact;
  return { min, max, exact };
}

export function validateString(value, def = {}) {
  const errors = [];

  if (def.type === 'enum') {
    // Keep historic "falsy means unset" behavior for enums (unless required already failed upstream).
    if (value && !def.values?.includes(value)) errors.push(INVALID_CHOICE_MESSAGE);
    return errors;
  }

  if (typeof value !== 'string') {
    errors.push(MUST_BE_STRING_MESSAGE);
    return errors;
  }

  const { min, max, exact } = normalizeStringLength(def);
  if (exact !== undefined && value.length !== exact) errors.push(`Length must be ${exact}.`);
  if (min !== undefined && value.length < min) errors.push(`Min length ${min}.`);
  if (max !== undefined && value.length > max) errors.push(`Max length ${max}.`);

  if (def.format) {
    const check = getFormatCheck(def.format);
    if (check && !check(value)) errors.push(INVALID_FORMAT_MESSAGE);
  } else if (def.pattern) {
    const re = compilePattern(def.pattern);
    if (re && !re.test(value)) errors.push(INVALID_FORMAT_MESSAGE);
  }

  return errors;
}

