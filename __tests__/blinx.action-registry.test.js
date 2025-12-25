/** @jest-environment jsdom */

import { blinxStore } from '../lib/blinx.store.js';
import { blinxForm } from '../lib/blinx.form.js';
import { blinxCollection } from '../lib/blinx.collection.js';

function getToolbarButton(root, label) {
  const toolbar = root.querySelector('.blinx-controls');
  if (!toolbar) return null;
  return Array.from(toolbar.querySelectorAll('button')).find(b => b.textContent === label) || null;
}

function getToolbarText(root) {
  const toolbar = root.querySelector('.blinx-controls');
  return toolbar ? toolbar.textContent : '';
}

describe('ActionRegistry + validation chain (custom controls)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('blinxForm: declarative action id runs validation chain and blocks handler on first failure', async () => {
    const model = { fields: { name: { type: 'string' } } };
    const store = blinxStore([{ name: 'A' }], model);
    const root = document.createElement('div');

    const validate1 = jest.fn(async () => ({ ok: true }));
    const validate2 = jest.fn(() => ({ ok: false, code: 'NOPE' }));
    const handler = jest.fn(async () => {});

    const actionRegistry = {
      'external.ok': { validate: [validate1, validate2], handler },
    };

    blinxForm({
      root,
      store,
      recordIndex: 0,
      actionRegistry,
      view: {
        sections: [{ title: 'Main', columns: 1, fields: ['name'] }],
        controls: {
          // Provide a status area so blocked actions can show feedback.
          saveStatus: true,
          customInternal: {
            label: 'Do',
            action: { id: 'external.ok', payload: { result: 'ok' } },
          },
        },
      },
    });

    getToolbarButton(root, 'Do')?.click();
    // Click handlers are async; wait a tick for validation + status update.
    await new Promise(r => setTimeout(r, 0));

    expect(validate1).toHaveBeenCalledTimes(1);
    expect(validate2).toHaveBeenCalledTimes(1);
    expect(handler).not.toHaveBeenCalled();
    expect(getToolbarText(root)).toContain('Action "customInternal" blocked.');
  });

  test('blinxForm: declarative action id calls handler with payload when validation passes', async () => {
    const model = { fields: { name: { type: 'string' } } };
    const store = blinxStore([{ name: 'A' }], model);
    const root = document.createElement('div');

    const validate1 = jest.fn(() => true);
    const handler = jest.fn(async (_ctx, payload) => {
      expect(payload).toEqual({ result: 'ok' });
      return 'done';
    });

    const actionRegistry = {
      'external.ok': { validate: [validate1], handler },
    };

    blinxForm({
      root,
      store,
      recordIndex: 0,
      actionRegistry,
      view: {
        sections: [{ title: 'Main', columns: 1, fields: ['name'] }],
        controls: {
          customInternal: {
            label: 'Do',
            action: { id: 'external.ok', payload: { result: 'ok' } },
          },
        },
      },
    });

    getToolbarButton(root, 'Do')?.click();
    await new Promise(r => setTimeout(r, 0));

    expect(validate1).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('blinxCollection: declarative action id blocks handler and writes status when validation fails', async () => {
    const model = { fields: { name: { type: 'string' } } };
    const store = blinxStore([{ name: 'A' }], model);
    const root = document.createElement('div');

    const validate = jest.fn(() => 'blocked');
    const handler = jest.fn(async () => {});
    const actionRegistry = {
      'external.ok': { validate: [validate], handler },
    };

    blinxCollection({
      root,
      store,
      paging: { pageSize: 20 },
      actionRegistry,
      view: {
        layout: 'table',
        columns: [{ field: 'name', label: 'Name' }],
        controls: {
          status: true,
          customInternal: { label: 'Do', action: 'external.ok' },
        },
      },
    });

    getToolbarButton(root, 'Do')?.click();
    await new Promise(r => setTimeout(r, 0));

    expect(validate).toHaveBeenCalledTimes(1);
    expect(handler).not.toHaveBeenCalled();
    expect(getToolbarText(root)).toContain('Action "customInternal" blocked.');
  });
});

