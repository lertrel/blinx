/** @jest-environment jsdom */

function makeRenderer({ name, onCreateField, onFormatCell }) {
  return {
    createField({ fieldKey, def, value, onChange }) {
      onCreateField?.({ renderer: name, fieldKey, def, value });
      // Minimal widget contract needed by BlinxDefaultUI callers.
      const el = document.createElement('div');
      el.setAttribute('data-renderer', name);
      el.setAttribute('data-field', fieldKey);
      // Keep onChange reachable (not used by this test).
      el.__blinx_onChange = onChange;
      return {
        el,
        getValue: () => value,
        setError: () => {},
      };
    },
    formatCell(value, def) {
      onFormatCell?.({ renderer: name, value, def });
      return `${name}:${value ?? ''}`;
    },
  };
}

describe('Renderer selection (view.renderer + per-field/per-column override)', () => {
  beforeEach(() => {
    // RegisteredUI has module-scope state and auto-locks on first render start.
    // Use fresh imports per test to avoid cross-test locking.
    jest.resetModules();
  });

  test('blinxForm: view.renderer used by default; per-field renderer override respected', async () => {
    const { blinxStore } = await import('../lib/blinx.store.js');
    const { blinxForm } = await import('../lib/blinx.form.js');
    const { RegisteredUI } = await import('../lib/blinx.registered-ui.js');

    const calls = [];

    const defaultRendererName = 'x-custom-form';
    const fieldRendererName = 'x-field-form';

    RegisteredUI.register(defaultRendererName, makeRenderer({
      name: defaultRendererName,
      onCreateField: (c) => calls.push(c),
    }));
    RegisteredUI.register(fieldRendererName, makeRenderer({
      name: fieldRendererName,
      onCreateField: (c) => calls.push(c),
    }));

    const model = {
      fields: {
        name: { type: 'string' },
        price: { type: 'number' },
      }
    };
    const store = blinxStore([{ name: 'A', price: 1 }], model);

    const root = document.createElement('div');

    blinxForm({
      root,
      store,
      view: {
        renderer: defaultRendererName,
        sections: [{
          title: 'Main',
          columns: 2,
          fields: [
            { field: 'name', renderer: fieldRendererName },
            'price',
          ],
        }]
      },
      controls: {},
    });

    // Assert renderer choice
    expect(calls.map(c => `${c.renderer}:${c.fieldKey}`)).toEqual([
      `${fieldRendererName}:name`,
      `${defaultRendererName}:price`,
    ]);
  });

  test('blinxCollection: view.renderer used by default; per-column renderer override respected', async () => {
    const { blinxStore } = await import('../lib/blinx.store.js');
    const { blinxCollection } = await import('../lib/blinx.collection.js');
    const { RegisteredUI } = await import('../lib/blinx.registered-ui.js');

    const formatCalls = [];

    const defaultRendererName = 'x-custom-collection';
    const columnRendererName = 'x-col-collection';

    RegisteredUI.register(defaultRendererName, makeRenderer({
      name: defaultRendererName,
      onFormatCell: (c) => formatCalls.push(c),
    }));
    RegisteredUI.register(columnRendererName, makeRenderer({
      name: columnRendererName,
      onFormatCell: (c) => formatCalls.push(c),
    }));

    const model = {
      fields: {
        name: { type: 'string' },
        price: { type: 'number' },
      }
    };
    const store = blinxStore([{ name: 'A', price: 10 }], model);
    const root = document.createElement('div');

    blinxCollection({
      root,
      store,
      view: {
        renderer: defaultRendererName,
        layout: 'table',
        columns: [
          { field: 'name', label: 'Name' }, // uses view.renderer
          { field: 'price', label: 'Price', renderer: columnRendererName }, // override
        ],
      },
      paging: { pageSize: 20 },
    });

    // One row, two columns => two formatCell calls.
    const byRenderer = formatCalls.reduce((acc, c) => {
      acc[c.renderer] = acc[c.renderer] || [];
      acc[c.renderer].push(c.value);
      return acc;
    }, {});

    expect(byRenderer[defaultRendererName]).toEqual(['A']);
    expect(byRenderer[columnRendererName]).toEqual([10]);
  });
});

