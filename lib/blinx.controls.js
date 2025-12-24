// Internal helpers for declarative controls (shared across adapters).

export function normalizeControlSpecEntry(entry) {
  // Shorthand forms:
  // - string: domId
  // - true: visible + auto-render
  // - false: hidden
  if (typeof entry === 'string') return { domId: entry };
  if (entry === true) return { visible: true, disabled: false };
  if (entry === false) return { visible: false, disabled: true };
  if (entry && typeof entry === 'object') return { ...entry };
  // undefined/null => treat as omitted (not declared)
  return null;
}

export function resolveElementByIdWithinRoot(root, id) {
  if (!id) return null;
  // Prefer scoping to root (important for nested renderers); fall back to global.
  if (root && typeof root.querySelector === 'function') {
    try {
      // CSS.escape is not guaranteed in all runtimes; best-effort.
      const escaped = (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') ? CSS.escape(id) : id;
      const within = root.querySelector(`#${escaped}`);
      if (within) return within;
    } catch { /* ignore */ }
  }
  return document.getElementById(id);
}

export function applyControlPresentation(el, spec) {
  if (!el || !spec) return;
  if (typeof spec.visible === 'boolean') {
    // Use hidden for accessibility & easy toggling.
    el.hidden = !spec.visible;
  }
  if (typeof spec.disabled === 'boolean') {
    // Only meaningful for interactive controls.
    if ('disabled' in el) el.disabled = !!spec.disabled;
    el.setAttribute('aria-disabled', spec.disabled ? 'true' : 'false');
  }
  if (typeof spec.css === 'string' && spec.css.trim()) {
    el.className = `${el.className || ''} ${spec.css}`.trim();
  }
  // Optional extension: allow declarative data-variant styling without coupling to a CSS framework.
  if (typeof spec.variant === 'string' && spec.variant.trim()) {
    el.setAttribute('data-variant', spec.variant.trim());
  }
  if (typeof spec.label === 'string') {
    // For buttons, update label.
    if (el.tagName === 'BUTTON') el.textContent = spec.label;
  }
}

