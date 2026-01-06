import { registerBlinxApp, getBaseStore } from '../lib/blinx.app.js';

describe('blinx.app registry helpers', () => {
  test('registerBlinxApp rejects non-object input', () => {
    expect(() => registerBlinxApp(null)).toThrow('registerBlinxApp');
  });

  test('getBaseStore returns provided store instance and caches by model', () => {
    const storeInstance = { name: 'Products' };
    registerBlinxApp({ stores: { Product: { store: storeInstance } } });
    const first = getBaseStore({ id: 'Product' });
    const second = getBaseStore({ id: 'Product' });
    expect(first).toBe(storeInstance);
    expect(second).toBe(storeInstance);
  });

  test('registerBlinxApp resets cached stores on subsequent registrations', () => {
    const original = { name: 'Original' };
    registerBlinxApp({ stores: { Order: { store: original } } });
    const first = getBaseStore({ id: 'Order' });
    const replacement = { name: 'Replacement' };
    registerBlinxApp({ stores: { Order: { store: replacement } } });
    const second = getBaseStore({ id: 'Order' });
    expect(first).toBe(original);
    expect(second).toBe(replacement);
  });

  test('getBaseStore throws when requested model has no configuration', () => {
    registerBlinxApp({ stores: {} });
    expect(() => getBaseStore({ id: 'Missing' })).toThrow('No base store registered for model "Missing".');
  });
});
