/**
 * These tests validate RegisteredUI strict-mode behavior.
 *
 * IMPORTANT: RegisteredUI is stateful at module scope, so tests use fresh imports.
 */

describe('RegisteredUI strict mode', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('does not bypass strict-mode check after a failed render start', async () => {
    const { RegisteredUI } = await import('../lib/blinx.registered-ui.js');

    RegisteredUI.requireLockBeforeRender(true);

    expect(() => RegisteredUI.__internal_onRenderStart())
      .toThrow('RegisteredUI is not locked. Call RegisteredUI.lock() before rendering.');

    // Regression: a failed strict-mode check must not mark render as started.
    // If it did, the second call would return early and not throw.
    expect(() => RegisteredUI.__internal_onRenderStart())
      .toThrow('RegisteredUI is not locked. Call RegisteredUI.lock() before rendering.');
  });

  test('when locked first, strict-mode allows render start and prevents further registration', async () => {
    const { RegisteredUI } = await import('../lib/blinx.registered-ui.js');

    RegisteredUI.lock();
    RegisteredUI.requireLockBeforeRender(true);

    expect(() => RegisteredUI.__internal_onRenderStart()).not.toThrow();

    expect(() => RegisteredUI.register('x-test', {
      createField() {},
      formatCell() {},
    })).toThrow('RegisteredUI is locked. Renderer registration is disabled.');
  });
});
