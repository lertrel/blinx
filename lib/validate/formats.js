const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const FORMAT_CHECKS = {
  email: v => EMAIL_RE.test(v),
  url: v => { try { new URL(v); return true; } catch { return false; } },
  uuid: v => UUID_RE.test(v),
  slug: v => SLUG_RE.test(v),
};

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

