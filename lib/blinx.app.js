import { blinxStore } from './blinx.store.js';
import { modelKey } from './blinx.nested.js';

let APP = null;
const BASE_STORES = new Map(); // modelKey -> store instance

/**
 * Register the Blinx app store registry.
 *
 * Shape (v0, minimal):
 * {
 *   stores: {
 *     [modelId]: { model, dataSource, views, defaultView } | { store }
 *   }
 * }
 */
export function registerBlinxApp(app) {
  if (!app || typeof app !== 'object') throw new Error('registerBlinxApp(app): app must be an object.');
  APP = app;
  BASE_STORES.clear();
  return APP;
}

export function getBlinxApp() {
  return APP;
}

export function getBaseStore(model) {
  const key = modelKey(model);
  if (!key) throw new Error('getBaseStore(model): model must have an id/name/entity.');
  if (BASE_STORES.has(key)) return BASE_STORES.get(key);

  const app = APP;
  const cfg = app?.stores?.[key];
  if (!cfg) throw new Error(`No base store registered for model "${key}".`);

  // Allow providing an already created store instance.
  if (cfg && typeof cfg === 'object' && cfg.store) {
    BASE_STORES.set(key, cfg.store);
    return cfg.store;
  }

  const store = blinxStore(cfg);
  BASE_STORES.set(key, store);
  return store;
}

