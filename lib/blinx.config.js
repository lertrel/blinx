let CONFIG = {
  allowGeneratedViews: true,
};

function normalize(next = {}) {
  const out = { ...CONFIG };
  if (Object.prototype.hasOwnProperty.call(next, 'allowGeneratedViews')) {
    out.allowGeneratedViews = Boolean(next.allowGeneratedViews);
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
});

