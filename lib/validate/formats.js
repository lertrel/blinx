const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// E.164: "+" followed by 2–15 digits; first digit cannot be 0.
// Examples: +14155552671, +442071838750
const PHONE_E164_RE = /^\+[1-9]\d{1,14}$/;

export const FORMAT_CHECKS = {
  email: v => EMAIL_RE.test(v),
  url: v => { try { new URL(v); return true; } catch { return false; } },
  uuid: v => UUID_RE.test(v),
  slug: v => SLUG_RE.test(v),
  phone: v => PHONE_E164_RE.test(v),
};

export function getFormatCheck(name) {
  const key = typeof name === 'string' ? name : null;
  if (!key) return null;
  return FORMAT_CHECKS[key] || null;
}

export function registerFormat(name, check, { override = false } = {}) {
  const key = typeof name === 'string' ? name.trim() : '';
  if (!key) throw new Error('registerFormat: name must be a non-empty string.');
  if (typeof check !== 'function') throw new Error('registerFormat: check must be a function.');
  if (!override && FORMAT_CHECKS[key]) throw new Error(`registerFormat: format "${key}" is already registered.`);
  FORMAT_CHECKS[key] = check;
  return true;
}

const PATTERN_CACHE = new Map();

export function compilePattern(pattern) {
  if (pattern instanceof RegExp) return pattern;
  if (typeof pattern !== 'string') return null;

  if (PATTERN_CACHE.has(pattern)) return PATTERN_CACHE.get(pattern);

  // Keep historic behavior: invalid patterns throw.
  const re = new RegExp(pattern);
  PATTERN_CACHE.set(pattern, re);
  return re;
}

