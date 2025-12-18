/**
 * RegisteredUI has module-scope state; each test uses a fresh import.
 */

describe('RegisteredUI', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('get() returns the default renderer when name omitted', async () => {
    const { RegisteredUI } = await import('../lib/blinx.registered-ui.js');
    const ui = RegisteredUI.get();
    expect(ui).toBeDefined();
    expect(typeof ui.createField).toBe('function');
    expect(typeof ui.formatCell).toBe('function');
  });

  test('get() throws for unknown renderer name', async () => {
    const { RegisteredUI } = await import('../lib/blinx.registered-ui.js');
    expect(() => RegisteredUI.get('nope')).toThrow('RegisteredUI: unknown renderer "nope".');
  });

  test('register() validates name and renderer shape', async () => {
    const { RegisteredUI } = await import('../lib/blinx.registered-ui.js');

    expect(() => RegisteredUI.register('', { createField() {}, formatCell() {} }))
      .toThrow('RegisteredUI.register(name, renderer) requires a non-empty string name.');

    expect(() => RegisteredUI.register('x', null))
      .toThrow('RegisteredUI.register(name, renderer) requires a renderer object.');

    expect(() => RegisteredUI.register('x', { formatCell() {} }))
      .toThrow('RegisteredUI renderer must implement createField({ fieldKey, def, value, onChange }).');

    expect(() => RegisteredUI.register('x', { createField() {} }))
      .toThrow('RegisteredUI renderer must implement formatCell(value, def).');
  });

  test('register() works before render and get() retrieves it', async () => {
    const { RegisteredUI } = await import('../lib/blinx.registered-ui.js');

    const renderer = { createField() {}, formatCell() {} };
    RegisteredUI.register('x-test', renderer);

    expect(RegisteredUI.get('x-test')).toBe(renderer);
  });

  test('lock() flips isLocked() and prevents registration', async () => {
    const { RegisteredUI } = await import('../lib/blinx.registered-ui.js');
    expect(RegisteredUI.isLocked()).toBe(false);

    RegisteredUI.lock();
    expect(RegisteredUI.isLocked()).toBe(true);

    expect(() => RegisteredUI.register('x-after-lock', { createField() {}, formatCell() {} }))
      .toThrow('RegisteredUI is locked. Renderer registration is disabled.');
  });

  test('__internal_onRenderStart() locks registry (even without strict-mode)', async () => {
    const { RegisteredUI } = await import('../lib/blinx.registered-ui.js');
    expect(RegisteredUI.isLocked()).toBe(false);

    expect(() => RegisteredUI.__internal_onRenderStart()).not.toThrow();
    expect(RegisteredUI.isLocked()).toBe(true);

    expect(() => RegisteredUI.register('x-after-render', { createField() {}, formatCell() {} }))
      .toThrow('RegisteredUI is locked. Renderer registration is disabled.');
  });

  test('requireLockBeforeRender(true) enforces lock before render start', async () => {
    const { RegisteredUI } = await import('../lib/blinx.registered-ui.js');

    RegisteredUI.requireLockBeforeRender(true);
    expect(() => RegisteredUI.__internal_onRenderStart())
      .toThrow('RegisteredUI is not locked. Call RegisteredUI.lock() before rendering.');

    // Once locked, render start should be allowed.
    RegisteredUI.lock();
    expect(() => RegisteredUI.__internal_onRenderStart()).not.toThrow();
  });
});

