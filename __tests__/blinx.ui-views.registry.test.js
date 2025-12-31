import { registerModelViews, resolveModelUIView, resolveComponentUIView } from '../lib/blinx.ui-views.js';

describe('UI Views registry (Option A)', () => {
  test('resolveModelUIView: kind-bucketed views support default + named', () => {
    const ModelA = { id: 'A', fields: {} };
    const viewsA = {
      form: {
        default: { sections: [{ title: 'A', columns: 1, fields: [] }] },
        compact: { sections: [{ title: 'A compact', columns: 1, fields: [] }] },
      },
      collection: {
        default: { layout: 'table', columns: [{ field: 'id', label: 'ID' }] },
      },
    };

    registerModelViews(ModelA, viewsA);

    expect(resolveModelUIView({ model: ModelA, kind: 'form' })?.sections?.[0]?.title).toBe('A');
    expect(resolveModelUIView({ model: ModelA, kind: 'form', viewName: 'compact' })?.sections?.[0]?.title).toBe('A compact');
    expect(resolveModelUIView({ model: ModelA, kind: 'collection' })?.layout).toBe('table');
  });

  test('resolveComponentUIView: string view resolves from registry by name', () => {
    const ModelA = { id: 'A', fields: {} };
    registerModelViews(ModelA, { form: { default: { sections: [] }, edit: { sections: [{ title: 'from-registry', columns: 1, fields: [] }] } } });

    const resolved = resolveComponentUIView({ model: ModelA, kind: 'form', view: 'edit' });
    expect(resolved?.sections?.[0]?.title).toBe('from-registry');
  });
});

