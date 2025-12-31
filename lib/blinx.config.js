let CONFIG = {
  allowGeneratedViews: true,
  // Optional UI renderer capability behavior:
  // - uiFallbackRenderer: when a requested renderer reports unsupported for a field/cell,
  //   Blinx will try this renderer name next (if set).
  // - uiStrictRenderers: when true, throw if a field/cell cannot be rendered by the requested
  //   renderer and (if configured) the fallback renderer.
  uiFallbackRenderer: null,
  uiStrictRenderers: false,
  uiUnsupportedPlaceholder: '[unsupported]',
};

function normalize(next = {}) {
  const out = { ...CONFIG };
  if (Object.prototype.hasOwnProperty.call(next, 'allowGeneratedViews')) {
    out.allowGeneratedViews = Boolean(next.allowGeneratedViews);
  }
  if (Object.prototype.hasOwnProperty.call(next, 'uiFallbackRenderer')) {
    const v = next.uiFallbackRenderer;
    out.uiFallbackRenderer = (v === null || v === undefined || v === '') ? null : String(v);
  }
  if (Object.prototype.hasOwnProperty.call(next, 'uiStrictRenderers')) {
    out.uiStrictRenderers = Boolean(next.uiStrictRenderers);
  }
  if (Object.prototype.hasOwnProperty.call(next, 'uiUnsupportedPlaceholder')) {
    const v = next.uiUnsupportedPlaceholder;
    out.uiUnsupportedPlaceholder = (v === null || v === undefined) ? '[unsupported]' : String(v);
  }
  return out;
}

export const BlinxConfig = Object.freeze({
  get() {
    return { ...CONFIG };
  },

  set(next = {}) {
    if (!next || typeof next !== 'object') {
      throw new Error('BlinxConfig.set(next): next must be an object.');
    }
    CONFIG = normalize(next);
    return BlinxConfig.get();
  },

  // Convenience helpers
  isGeneratedViewAllowed() {
    return Boolean(CONFIG.allowGeneratedViews);
  },

  setDefaultViewGenerationEnabled(enabled = true) {
    return BlinxConfig.set({ allowGeneratedViews: Boolean(enabled) });
  },

  // Renderer capability behavior
  getUIFallbackRenderer() {
    return CONFIG.uiFallbackRenderer;
  },

  isUIRendererStrict() {
    return Boolean(CONFIG.uiStrictRenderers);
  },

  getUIUnsupportedPlaceholder() {
    return String(CONFIG.uiUnsupportedPlaceholder || '[unsupported]');
  },

  setUIRendererFallback(nameOrNull = null) {
    return BlinxConfig.set({ uiFallbackRenderer: nameOrNull });
  },

  setUIRendererStrict(enabled = true) {
    return BlinxConfig.set({ uiStrictRenderers: Boolean(enabled) });
  },

  setUIUnsupportedPlaceholder(text = '[unsupported]') {
    return BlinxConfig.set({ uiUnsupportedPlaceholder: text });
  },
});

