
export function validateField(value, def) {
  const errors = [];
  if (def.required) {
    const empty = value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
    if (empty) errors.push('This field is required.');
  }
  if (def.type === 'number' && value !== '' && value !== null && value !== undefined) {
    const n = Number(value);
    if (Number.isNaN(n)) errors.push('Must be a number.');
    if (def.min !== undefined && n < def.min) errors.push(`Must be ≥ ${def.min}.`);
    if (def.max !== undefined && n > def.max) errors.push(`Must be ≤ ${def.max}.`);
  }
  if (def.type === 'string' && typeof value === 'string') {
    const len = value.length;
    if (def.length?.min !== undefined && len < def.length.min) errors.push(`Min length ${def.length.min}.`);
    if (def.length?.max !== undefined && len > def.length.max) errors.push(`Max length ${def.length.max}.`);
    if (def.pattern && !new RegExp(def.pattern).test(value)) errors.push('Invalid format.');
  }
  if (def.type === 'enum' && value && !def.values?.includes(value)) errors.push('Invalid choice.');
  if (def.type === 'date' && value && isNaN(new Date(value).getTime())) errors.push('Invalid date.');
  return errors;
}