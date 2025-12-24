/** @jest-environment jsdom */

import { blinxStore } from '../lib/blinx.store.js';
import { blinxForm } from '../lib/blinx.form.js';

function setupDomControls(ids) {
  document.body.innerHTML = '';
  for (const [key, id] of Object.entries(ids)) {
    const el = (key.includes('indicator') || key.includes('status') || key.includes('Indicator') || key.includes('Status'))
      ? document.createElement('div')
      : document.createElement('button');
    el.id = id;
    document.body.appendChild(el);
  }
}

function getText(id) {
  const el = document.getElementById(id);
  return el ? el.textContent : null;
}

describe('blinxForm', () => {
  test('throws when store is missing getModel() or model.fields', () => {
    const root = document.createElement('div');

    expect(() => blinxForm({ root, view: { sections: [] }, store: null }))
      .toThrow('blinxForm requires a store that exposes getModel().');

    expect(() => blinxForm({
      root,
      view: { sections: [] },
      store: { getModel: () => ({}) },
    })).toThrow('blinxForm requires the store model to define fields.');
  });

  test('create/delete/next/prev update store and status', async () => {
    const model = {
      fields: {
        name: { type: 'string', required: true, length: { min: 2, max: 50 } },
        price: { type: 'number', required: true, min: 0 },
      }
    };

    const store = blinxStore([{ name: 'AA', price: 1 }], model);
    const view = { sections: [{ title: 'Main', columns: 2, fields: ['name', 'price'] }] };

    const root = document.createElement('div');

    setupDomControls({
      save: 'save',
      reset: 'reset',
      next: 'next',
      prev: 'prev',
      create: 'create',
      delete: 'delete',
      indicator: 'indicator',
      status: 'status',
    });

    blinxForm({
      root,
      view,
      store,
      recordIndex: 0,
      controls: {
        saveButton: 'save',
        resetButton: 'reset',
        nextButton: 'next',
        prevButton: 'prev',
        createButton: 'create',
        deleteButton: 'delete',
        recordIndicator: 'indicator',
        saveStatus: 'status',
      },
    });

    expect(getText('indicator')).toBe('Record 1 of 1');

    document.getElementById('prev').click();
    expect(getText('status')).toBe('Already at first record.');

    document.getElementById('next').click();
    expect(getText('status')).toBe('Already at last record.');

    document.getElementById('create').click();
    await Promise.resolve();

    expect(store.getLength()).toBe(2);
    expect(getText('status')).toBe('New record created.');
    expect(getText('indicator')).toBe('Record 2 of 2');

    document.getElementById('delete').click();
    await Promise.resolve();

    expect(store.getLength()).toBe(1);
    expect(getText('status')).toBe('Record deleted.');
    expect(getText('indicator')).toBe('Record 1 of 1');
  });

  test('save: blocks on validation errors, commits when diff exists, otherwise reports no changes', async () => {
    const model = {
      fields: {
        name: { type: 'string', required: true, length: { min: 2, max: 50 } },
        price: { type: 'number', required: true, min: 0 },
      }
    };

    const view = { sections: [{ title: 'Main', columns: 2, fields: ['name', 'price'] }] };

    setupDomControls({
      save: 'save',
      status: 'status',
      indicator: 'indicator',
    });

    const root = document.createElement('div');

    // Invalid record (name too short)
    const storeInvalid = blinxStore([{ name: 'A', price: 1 }], model);
    const commitSpyInvalid = jest.spyOn(storeInvalid, 'commit');

    blinxForm({
      root,
      view,
      store: storeInvalid,
      controls: {
        saveButton: 'save',
        saveStatus: 'status',
        recordIndicator: 'indicator',
      },
    });

    document.getElementById('save').click();
    await Promise.resolve();

    expect(getText('status')).toBe('Fix validation errors.');
    expect(commitSpyInvalid).not.toHaveBeenCalled();

    // Valid record: no changes
    const storeNoChanges = blinxStore([{ name: 'AA', price: 1 }], model);
    const commitSpyNoChanges = jest.spyOn(storeNoChanges, 'commit');

    blinxForm({
      root,
      view,
      store: storeNoChanges,
      controls: {
        saveButton: 'save',
        saveStatus: 'status',
        recordIndicator: 'indicator',
      },
    });

    document.getElementById('save').click();
    await Promise.resolve();

    expect(getText('status')).toBe('No changes to save.');
    expect(commitSpyNoChanges).not.toHaveBeenCalled();

    // Valid record: diff exists
    storeNoChanges.setField(0, 'name', 'BB');

    document.getElementById('save').click();
    await Promise.resolve();

    expect(commitSpyNoChanges).toHaveBeenCalledTimes(1);
    expect(getText('status')).toContain('Saved changes:');
    expect(storeNoChanges.diff()).toEqual([]);
  });

  test('responds to external store update/reset events with status message', () => {
    jest.useFakeTimers();

    const model = {
      fields: { name: { type: 'string', required: true, length: { min: 2 } } }
    };
    const store = blinxStore([{ name: 'AA' }], model);
    const view = { sections: [{ title: 'Main', columns: 2, fields: ['name'] }] };

    setupDomControls({
      status: 'status',
      indicator: 'indicator',
    });

    const root = document.createElement('div');

    blinxForm({
      root,
      view,
      store,
      controls: {
        saveStatus: 'status',
        recordIndicator: 'indicator',
      },
    });

    store.updateIndex(0);
    expect(getText('status')).toBe('Record updated elsewhere; refreshed view.');

    store.reset();
    // reset status message is scheduled with setTimeout(0)
    jest.runOnlyPendingTimers();
    expect(getText('status')).toBe('Store reset elsewhere; refreshed view.');

    jest.useRealTimers();
  });

  test('when controls are omitted, renders an opinionated default toolbar inside root', async () => {
    const model = {
      fields: {
        name: { type: 'string', required: true, length: { min: 2, max: 50 } },
        price: { type: 'number', required: true, min: 0 },
      }
    };
    const store = blinxStore([{ name: 'AA', price: 1 }], model);
    const view = { sections: [{ title: 'Main', columns: 2, fields: ['name', 'price'] }] };
    const root = document.createElement('div');

    blinxForm({ root, view, store, recordIndex: 0 });

    const toolbar = root.querySelector('.blinx-controls');
    expect(toolbar).not.toBeNull();
    expect(toolbar.querySelectorAll('button').length).toBe(6);

    const indicator = Array.from(toolbar.querySelectorAll('span')).find(s => s.textContent.includes('Record') || s.textContent.includes('No records')) || null;
    expect(indicator).not.toBeNull();

    const btn = (label) => Array.from(toolbar.querySelectorAll('button')).find(b => b.textContent === label);
    btn('Create').click();
    await Promise.resolve();

    expect(store.getLength()).toBe(2);
    expect(toolbar.textContent).toContain('New record created.');

    btn('Delete').click();
    await Promise.resolve();

    expect(store.getLength()).toBe(1);
    expect(toolbar.textContent).toContain('Record deleted.');
  });

  test('when there are no records, disables prev/next/save/reset/delete but keeps create enabled', () => {
    const model = {
      fields: { name: { type: 'string', required: true, length: { min: 2 } } }
    };
    const store = blinxStore([], model);
    const view = { sections: [{ title: 'Main', columns: 2, fields: ['name'] }] };
    const root = document.createElement('div');

    blinxForm({ root, view, store, recordIndex: 0 }); // controls omitted => internal toolbar

    const toolbar = root.querySelector('.blinx-controls');
    expect(toolbar).not.toBeNull();
    expect(toolbar.textContent).toContain('No records');

    const btn = (label) => Array.from(toolbar.querySelectorAll('button')).find(b => b.textContent === label);
    expect(btn('Previous').disabled).toBe(true);
    expect(btn('Next').disabled).toBe(true);
    expect(btn('Save').disabled).toBe(true);
    expect(btn('Reset').disabled).toBe(true);
    expect(btn('Delete').disabled).toBe(true);
    // Create should remain available so the user can add the first record.
    expect(btn('Create').disabled).toBe(false);
  });

  test('declarative view.controls renders only explicitly mentioned controls', () => {
    const model = {
      fields: { name: { type: 'string', required: true, length: { min: 2 } } }
    };
    const store = blinxStore([{ name: 'AA' }], model);
    const view = {
      sections: [{ title: 'Main', columns: 2, fields: ['name'] }],
      controls: {
        saveButton: true,
        saveStatus: true,
      },
    };
    const root = document.createElement('div');

    blinxForm({ root, view, store, recordIndex: 0 });

    const toolbar = root.querySelector('.blinx-controls');
    expect(toolbar).not.toBeNull();
    expect(Array.from(toolbar.querySelectorAll('button')).map(b => b.textContent)).toEqual(['Save']);
    // Status is declared, indicator is not.
    expect(toolbar.querySelectorAll('span').length).toBe(1);
  });

  test('declarative view.controls can bind to external DOM elements by id (no controls option required)', async () => {
    document.body.innerHTML = '';
    const save = document.createElement('button'); save.id = 'save';
    const status = document.createElement('div'); status.id = 'status';
    const indicator = document.createElement('div'); indicator.id = 'indicator';
    document.body.append(save, status, indicator);

    const model = {
      fields: { name: { type: 'string', required: true, length: { min: 2 } } }
    };
    const store = blinxStore([{ name: 'AA' }], model);
    const view = {
      sections: [{ title: 'Main', columns: 2, fields: ['name'] }],
      controls: {
        saveButton: 'save',
        saveStatus: 'status',
        recordIndicator: 'indicator',
      },
    };
    const root = document.createElement('div');

    blinxForm({ root, view, store, recordIndex: 0 });

    // No internal toolbar should be created since controls were bound externally.
    expect(root.querySelector('.blinx-controls')).toBeNull();

    document.getElementById('save').click();
    await Promise.resolve();

    expect(getText('status')).toBe('No changes to save.');
    expect(getText('indicator')).toBe('Record 1 of 1');
  });

  test('controls: {} suppresses the default toolbar (but still renders form content)', () => {
    const model = {
      fields: { name: { type: 'string', required: true, length: { min: 2 } } }
    };
    const store = blinxStore([{ name: 'AA' }], model);
    const view = { sections: [{ title: 'Main', columns: 2, fields: ['name'] }] };
    const root = document.createElement('div');

    blinxForm({ root, view, store, recordIndex: 0, controls: {} });

    // Explicit empty controls means "no auto controls".
    expect(root.querySelector('.blinx-controls')).toBeNull();
    // But content should still render.
    expect(root.querySelector('input, textarea, select')).not.toBeNull();
    expect(root.querySelectorAll('button').length).toBe(0);
  });
});
