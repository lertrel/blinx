/** @jest-environment jsdom */

import { blinxStore, DataTypes } from '../lib/blinx.store.js';
import { blinxForm } from '../lib/blinx.form.js';
import { blinxCollection } from '../lib/blinx.collection.js';
import { blinxDump } from '../lib/blinx.dump.js';

describe('schema-driven default UI view fallback', () => {
  test('blinxForm: when no explicit view exists, generates a default form view from schema', () => {
    const model = {
      id: 'ModelX',
      fields: {
        id: { type: DataTypes.string },
        name: { type: DataTypes.string },
        bio: { type: DataTypes.longText }, // hidden by default
        payload: { type: DataTypes.json }, // hidden by default
        token: { type: DataTypes.secret }, // hidden by default
      },
    };
    const store = blinxStore([{ id: '1', name: 'A' }], model);
    const root = document.createElement('div');

    // No `view` => should not throw
    blinxForm({ root, store });

    const labels = Array.from(root.querySelectorAll('label')).map(el => el.textContent);
    expect(labels).toContain('id');
    expect(labels).toContain('name');
    expect(labels).not.toContain('bio');
    expect(labels).not.toContain('payload');
    expect(labels).not.toContain('token');
  });

  test('blinxCollection: generates a default table view with columns and search controls', () => {
    const model = {
      id: 'ModelY',
      fields: {
        id: { type: DataTypes.string },
        name: { type: DataTypes.string },
        createdAt: { type: DataTypes.date },
        blob: { type: DataTypes.blob }, // hidden by default
      },
    };
    const store = blinxStore([{ id: '1', name: 'A', createdAt: '2024-01-01' }], model);
    const root = document.createElement('div');

    blinxCollection({ root, store }); // no view

    // Columns should exist (thead contains "Sel" + generated columns)
    const ths = Array.from(root.querySelectorAll('thead th')).map(el => el.textContent);
    expect(ths.length).toBeGreaterThan(1);

    // Search input only appears when view.searchFields exist (schema generator provides it)
    const searchInput = root.querySelector('input[type="text"].input');
    expect(searchInput).toBeTruthy();
  });

  test("blinxDump('ui-view') prints copy/pasteable generated views", () => {
    const model = {
      id: 'ModelDump',
      fields: { id: { type: DataTypes.string }, name: { type: DataTypes.string } },
    };
    const store = blinxStore([{ id: '1', name: 'A' }], model);
    const root = document.createElement('div');
    blinxForm({ root, store }); // triggers generation + caching

    const out = blinxDump('ui-view');
    expect(out).toContain('"model": "ModelDump"');
    expect(out).toContain('"form"');
  });
});

