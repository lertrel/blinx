// Minimal, schema-driven "present" helpers.
//
// This module intentionally stays tiny:
// - It only deals in DOM attributes/properties ("attrs")
// - It does NOT attempt to cache present() results (safer; avoids staleness bugs)
// - It provides best-effort mapping for common HTML boolean attributes

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function normalizeAttrsBag(bag) {
  return isPlainObject(bag) ? bag : null;
}

export function resolvePresent(presentFn, ctx, record, index) {
  if (typeof presentFn !== 'function') return null;
  const res = presentFn(ctx, record, index);
  if (!res || !isPlainObject(res)) return null;
  const attrs = normalizeAttrsBag(res.attrs);
  if (!attrs) return null;
  return { attrs };
}

function setBooleanAttr(el, attrName, enabled) {
  if (!el) return;
  if (attrName === 'hidden') {
    el.hidden = !!enabled;
    return;
  }
  if (attrName === 'disabled') {
    if ('disabled' in el) el.disabled = !!enabled;
    if (enabled) el.setAttribute('disabled', '');
    else el.removeAttribute('disabled');
    return;
  }
  if (attrName === 'required') {
    if ('required' in el) el.required = !!enabled;
    if (enabled) el.setAttribute('required', '');
    else el.removeAttribute('required');
    return;
  }
  if (attrName === 'readonly' || attrName === 'readOnly' || attrName === 'read-only') {
    // Property uses camelCase, attribute uses lowercase.
    if ('readOnly' in el) el.readOnly = !!enabled;
    if (enabled) el.setAttribute('readonly', '');
    else el.removeAttribute('readonly');
    return;
  }
  // Generic boolean attribute.
  if (enabled) el.setAttribute(attrName, '');
  else el.removeAttribute(attrName);
}

function removeAttr(el, attrName) {
  if (!el) return;
  if (attrName === 'hidden') { el.hidden = false; return; }
  if (attrName === 'disabled' && 'disabled' in el) el.disabled = false;
  if (attrName === 'required' && 'required' in el) el.required = false;
  if ((attrName === 'readonly' || attrName === 'readOnly' || attrName === 'read-only') && 'readOnly' in el) el.readOnly = false;
  try { el.removeAttribute(attrName === 'readOnly' ? 'readonly' : attrName); } catch { /* ignore */ }
}

export function applyAttrs(el, attrs) {
  const bag = normalizeAttrsBag(attrs);
  if (!el || !bag) return;
  for (const [rawKey, rawVal] of Object.entries(bag)) {
    const key = String(rawKey);
    const val = rawVal;
    if (val === undefined || val === null || val === false) {
      removeAttr(el, key);
      continue;
    }
    const isDataOrAria = key.startsWith('data-') || key.startsWith('aria-');
    const isKebab = key.includes('-');
    if (val === true) {
      // For data-/aria- attributes, boolean true should serialize as "true"
      // (not an empty boolean attribute).
      if (isDataOrAria) {
        try { el.setAttribute(key, 'true'); } catch { /* ignore */ }
      } else {
        setBooleanAttr(el, key, true);
      }
      continue;
    }
    // Prefer setting as a property when it exists and the key is camelCase,
    // but always set attributes for kebab-case (data-*, aria-*, etc.).
    if (!isDataOrAria && !isKebab && key in el) {
      try { el[key] = val; } catch { /* ignore */ }
    }
    try { el.setAttribute(isDataOrAria || isKebab ? key : key.toLowerCase(), String(val)); } catch { /* ignore */ }
  }
}

export function bestEffortFindPart(root, part) {
  if (!root || typeof root.querySelector !== 'function') return null;
  if (part === 'input') return root.querySelector('input, textarea, select');
  if (part === 'label') return root.querySelector('label');
  if (part === 'error') return root.querySelector('.error');
  if (part === 'help') return root.querySelector('.help, .hint, [data-help]');
  return null;
}

