import { MUST_BE_BOOLEAN_MESSAGE } from './validate/constants.js';
import { isUnsetValue, runCustomValidatorsAsync, runCustomValidatorsSync, validateRequired } from './validate/base.js';
import { coerceField } from './validate/coerce.js';
import { validateArray } from './validate/array.js';
import { validateDate } from './validate/date.js';
import { validateNumber } from './validate/number.js';
import { validateString } from './validate/string.js';
import { defaultValueForField, seedRecord } from './validate/seed.js';
import { registerFormat, getFormatCheck, FORMAT_CHECKS } from './validate/formats.js';

export function validateField(value, def = {}) {
  const errors = [];
  const d = def && typeof def === 'object' ? def : {};
  const v = coerceField(value, d);

  // Required / nullable
  errors.push(...validateRequired(v, d));

  // Treat null/undefined/'' as "unset" for constraint checks (unless required already failed).
  if (v === null || isUnsetValue(v)) {
    runCustomValidatorsSync(v, d, errors);
    return errors;
  }

  // Type dispatch
  if (d.type === 'array') errors.push(...validateArray(v, d, validateField));
  else if (d.type === 'number') errors.push(...validateNumber(v, d));
  else if (d.type === 'boolean') { if (typeof v !== 'boolean') errors.push(MUST_BE_BOOLEAN_MESSAGE); }
  else if (d.type === 'enum') errors.push(...validateString(v, d));
  else if (d.type === 'date' || d.type === 'datetime') errors.push(...validateDate(v, d));
  else if (d.type === 'string' || d.type === 'longText' || d.type === 'secret') errors.push(...validateString(v, d));

  runCustomValidatorsSync(v, d, errors);
  return errors;
}

export async function validateFieldAsync(value, def = {}) {
  const errors = validateField(value, def);
  await runCustomValidatorsAsync(coerceField(value, def), def, errors);
  return errors;
}

export { coerceField, defaultValueForField, seedRecord };
export { registerFormat, getFormatCheck, FORMAT_CHECKS };

export const validators = {
  string: (value, def = {}) => validateString(value, def),
  number: (value, def = {}) => validateNumber(value, def),
  date: (value, def = {}) => validateDate(value, def),
  array: (value, def = {}) => validateArray(value, def, validateField),
};