/** @jest-environment jsdom */

import { blinxStore } from '../lib/blinx.store.js';
import { blinxForm } from '../lib/blinx.form.js';
import { blinxCollection } from '../lib/blinx.collection.js';
import { Notifier } from '../lib/blinx.notifier.js';

function getToolbarButton(root, label) {
  const toolbar = root.querySelector('.blinx-controls');
  if (!toolbar) return null;
  return Array.from(toolbar.querySelectorAll('button')).find(b => b.textContent === label) || null;
}

function getToolbarText(root) {
  const toolbar = root.querySelector('.blinx-controls');
  return toolbar ? toolbar.textContent : '';
}

describe('Notifier post-action hook (forms/collections)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Notifier.set(null);
  });

  test('blinxForm: after custom action, issues are routed to active notifier impl', async () => {
    const model = {
      fields: {
        name: { type: 'string' },
        child: { type: 'model', embedded: true, model: { id: 'Child', fields: { id: { type: 'string' } } } },
      },
    };
    const store = blinxStore([{ name: 'A', child: { id: 'c1' } }], model);
    const root = document.createElement('div');

    const notify = jest.fn();
    Notifier.set({ notify });

    blinxForm({
      root,
      store,
      recordIndex: 0,
      view: {
        sections: [{ title: 'Main', columns: 1, fields: ['name'] }],
        controls: {
          // Provide a status area so fallback would have somewhere to write (if used).
          saveStatus: true,
          custom: {
            label: 'Do',
            action: (ctx) => {
              // ENM delete is denied by default => facade reports an issue.
              ctx.model().get('child').delete();
            },
          },
        },
      },
    });

    getToolbarButton(root, 'Do')?.click();
    await new Promise(r => setTimeout(r, 0));

    expect(notify).toHaveBeenCalledTimes(1);
    const payload = notify.mock.calls[0][0];
    expect(payload?.issues?.[0]?.code).toBe('ENM_DELETE_DENIED');
  });

  test('blinxForm: without notifier impl, issues fall back to setStatus()', async () => {
    const model = {
      fields: {
        name: { type: 'string' },
        child: { type: 'model', embedded: true, model: { id: 'Child', fields: { id: { type: 'string' } } } },
      },
    };
    const store = blinxStore([{ name: 'A', child: { id: 'c1' } }], model);
    const root = document.createElement('div');

    blinxForm({
      root,
      store,
      recordIndex: 0,
      view: {
        sections: [{ title: 'Main', columns: 1, fields: ['name'] }],
        controls: {
          saveStatus: true,
          custom: {
            label: 'Do',
            action: (ctx) => {
              ctx.model().get('child').delete();
            },
          },
        },
      },
    });

    getToolbarButton(root, 'Do')?.click();
    await new Promise(r => setTimeout(r, 0));

    expect(getToolbarText(root)).toContain('Issues: ENM_DELETE_DENIED');
  });

  test('blinxCollection: after custom action, issues fall back to status by default', async () => {
    const model = {
      fields: {
        name: { type: 'string' },
        child: { type: 'model', embedded: true, model: { id: 'Child', fields: { id: { type: 'string' } } } },
      },
    };
    const store = blinxStore([{ name: 'A', child: { id: 'c1' } }], model);
    const root = document.createElement('div');

    blinxCollection({
      root,
      store,
      paging: { pageSize: 20 },
      view: {
        layout: 'table',
        columns: [{ field: 'name', label: 'Name' }],
        controls: {
          status: true,
          custom: {
            label: 'Do',
            action: (ctx) => {
              ctx.model().get('child').delete();
            },
          },
        },
      },
    });

    getToolbarButton(root, 'Do')?.click();
    await new Promise(r => setTimeout(r, 0));

    expect(getToolbarText(root)).toContain('Issues: ENM_DELETE_DENIED');
  });
});

