/** @jest-environment jsdom */

describe('Renderer capability hook: supportsField()', () => {
  beforeEach(() => {
    // RegisteredUI + BlinxConfig have module-scope state; use fresh imports per test.
    jest.resetModules();
  });

  test('blinxForm: unsupported field uses safe fallback in non-strict mode', async () => {
    const { blinxStore } = await import('../lib/blinx.store.js');
    const { blinxForm } = await import('../lib/blinx.form.js');
    const { RegisteredUI } = await import('../lib/blinx.registered-ui.js');

    RegisteredUI.register('no-blob', {
      supportsField({ fieldDef, kind, mode }) {
        return !(kind === 'form' && mode === 'field' && fieldDef?.type === 'blob');
      },
      createField() {
        throw new Error('createField should not be called for unsupported field in non-strict mode');
      },
      formatCell() { return ''; },
    });

    const model = { id: 'M', fields: { file: { type: 'blob' } } };
    const store = blinxStore([{ file: 'BIN' }], model);
    const root = document.createElement('div');

    blinxForm({
      root,
      store,
      view: {
        renderer: 'no-blob',
        sections: [{ title: 'Main', columns: 1, fields: ['file'] }],
      },
      controls: false,
    });

    const unsupported = root.querySelector('[data-blinx-unsupported="true"]');
    expect(unsupported).toBeTruthy();
    expect(root.textContent).toContain('file');
    expect(root.textContent).toContain('BIN');
  });

  test('blinxForm: unsupported field throws in strict mode (no fallback configured)', async () => {
    const { blinxStore } = await import('../lib/blinx.store.js');
    const { blinxForm } = await import('../lib/blinx.form.js');
    const { RegisteredUI } = await import('../lib/blinx.registered-ui.js');
    const { BlinxConfig } = await import('../lib/blinx.config.js');

    BlinxConfig.setUIRendererStrict(true);

    RegisteredUI.register('no-blob', {
      supportsField({ fieldDef, kind, mode }) {
        return !(kind === 'form' && mode === 'field' && fieldDef?.type === 'blob');
      },
      createField() { return { el: document.createElement('div'), getValue: () => null, setError: () => {} }; },
      formatCell() { return ''; },
    });

    const model = { id: 'M', fields: { file: { type: 'blob' } } };
    const store = blinxStore([{ file: 'BIN' }], model);
    const root = document.createElement('div');

    expect(() => blinxForm({
      root,
      store,
      view: { renderer: 'no-blob', sections: [{ title: 'Main', columns: 1, fields: ['file'] }] },
      controls: false,
    })).toThrow(/does not support field "file"/);
  });

  test('blinxCollection: unsupported cell uses configured fallback renderer', async () => {
    const { blinxStore } = await import('../lib/blinx.store.js');
    const { blinxCollection } = await import('../lib/blinx.collection.js');
    const { RegisteredUI } = await import('../lib/blinx.registered-ui.js');
    const { BlinxConfig } = await import('../lib/blinx.config.js');

    BlinxConfig.setUIRendererFallback('default');
    BlinxConfig.setUIRendererStrict(true);

    RegisteredUI.register('no-blob-cell', {
      supportsField({ fieldDef, kind, mode }) {
        return !(kind === 'collection' && mode === 'cell' && fieldDef?.type === 'blob');
      },
      createField() { return { el: document.createElement('div'), getValue: () => null, setError: () => {} }; },
      formatCell() {
        throw new Error('formatCell should not be called for unsupported cell when fallback is configured');
      },
    });

    const model = { id: 'M', fields: { file: { type: 'blob' } } };
    const store = blinxStore([{ file: 'BIN' }], model);
    const root = document.createElement('div');

    blinxCollection({
      root,
      store,
      view: {
        layout: 'table',
        columns: [{ field: 'file', label: 'File', renderer: 'no-blob-cell' }],
      },
      paging: { pageSize: 20 },
    });

    // One row, one column => cell should render using fallback renderer (default) without throwing.
    expect(root.textContent).toContain('BIN');
  });
});

