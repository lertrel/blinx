import { BlinxDefaultUI } from './blinx.adapters.default.js';

function assertValidName(name) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error('RegisteredUI.register(name, renderer) requires a non-empty string name.');
  }
}

function assertValidRenderer(renderer) {
  if (!renderer || typeof renderer !== 'object') {
    throw new Error('RegisteredUI.register(name, renderer) requires a renderer object.');
  }
  if (typeof renderer.createField !== 'function') {
    throw new Error('RegisteredUI renderer must implement createField({ fieldKey, def, value, onChange }).');
  }
  if (typeof renderer.formatCell !== 'function') {
    throw new Error('RegisteredUI renderer must implement formatCell(value, def).');
  }
}

const REGISTRY = new Map();
REGISTRY.set('default', new BlinxDefaultUI());

let locked = false;
let renderStarted = false;
let requireLockBeforeRender = false;

function onRenderStart() {
  if (renderStarted) return;
  renderStarted = true;

  if (requireLockBeforeRender && !locked) {
    throw new Error('RegisteredUI is not locked. Call RegisteredUI.lock() before rendering.');
  }

  // Safety-by-default: once any component renders, prevent further mutation.
  locked = true;
}

export const RegisteredUI = Object.freeze({
  /**
   * Retrieve a registered renderer.
   * - When `name` is omitted, returns the 'default' renderer.
   */
  get(name = 'default') {
    const key = name ?? 'default';
    const renderer = REGISTRY.get(key);
    if (!renderer) throw new Error(`RegisteredUI: unknown renderer "${String(key)}".`);
    return renderer;
  },

  /**
   * Register or replace a renderer by name.
   * Must be called before the first component renders (or after, will throw).
   */
  register(name, renderer) {
    assertValidName(name);
    assertValidRenderer(renderer);
    if (locked) throw new Error('RegisteredUI is locked. Renderer registration is disabled.');
    REGISTRY.set(name, renderer);
  },

  /**
   * Lock the registry. Once locked, `register()` throws until the page reloads.
   */
  lock() {
    locked = true;
  },

  isLocked() {
    return locked;
  },

  /**
   * Strict mode: when enabled, rendering will throw unless `lock()` was called first.
   */
  requireLockBeforeRender(next = true) {
    requireLockBeforeRender = Boolean(next);
  },

  // Internal hook used by Blinx components to enforce lock behavior.
  __internal_onRenderStart: onRenderStart,
});

