import { MUST_BE_INTEGER_MESSAGE, MUST_BE_NUMBER_MESSAGE } from './constants.js';

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
  if (newDot <= 0) return `${sign}0.${'0'.repeat(Math.abs(newDot))}${digits}`;
  if (newDot >= digits.length) return `${sign}${digits}${'0'.repeat(newDot - digits.length)}`;
  return `${sign}${digits.slice(0, newDot)}.${digits.slice(newDot)}`;
}

function isMultipleOf(n, step) {
  if (!Number.isFinite(n) || !Number.isFinite(step) || step === 0) return false;
  const q = n / step;
  const nearest = Math.round(q);
  return Math.abs(q - nearest) <= 1e-12;
}

export function validateNumber(value, def = {}) {
  const errors = [];
  const n = (typeof value === 'number') ? value : Number(value);
  if (Number.isNaN(n)) {
    errors.push(MUST_BE_NUMBER_MESSAGE);
    return errors;
  }

  if (def.min !== undefined && n < def.min) errors.push(`Must be ≥ ${def.min}.`);
  if (def.max !== undefined && n > def.max) errors.push(`Must be ≤ ${def.max}.`);
  if (def.integerOnly && !Number.isInteger(n)) errors.push(MUST_BE_INTEGER_MESSAGE);

  const step = def.multipleOf ?? def.step;
  if (step !== undefined && !Number.isNaN(Number(step))) {
    const s = Number(step);
    if (!isMultipleOf(n, s)) errors.push(`Must be a multiple of ${s}.`);
  }

  if (def.scale !== undefined || def.precision !== undefined) {
    const str = toPlainDecimalString(n).replace(/^-/, '');
    const [ip, fp = ''] = str.split('.');
    const digitsBefore = (ip || '0').replace(/^0+/, '') || '0';
    const digitsAfter = fp.replace(/0+$/, ''); // value-normalized
    const scale = def.scale !== undefined ? Number(def.scale) : undefined;
    const precision = def.precision !== undefined ? Number(def.precision) : undefined;
    if (scale !== undefined && Number.isFinite(scale) && digitsAfter.length > scale) {
      errors.push(`Max ${scale} decimal place(s).`);
    }
    if (precision !== undefined && Number.isFinite(precision)) {
      const totalDigits = (digitsBefore === '0' ? 1 : digitsBefore.length) + digitsAfter.length;
      if (totalDigits > precision) errors.push(`Max precision ${precision}.`);
    }
  }

  return errors;
}

