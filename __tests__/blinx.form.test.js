/** @jest-environment jsdom */

import { createBlinxStore } from '../lib/blinx.store.js';
import { renderBlinxForm } from '../lib/blinx.form.js';
import { BlinxDefaultAdapter } from '../lib/blinx.adapters.default.js';

function setupDomControls(ids) {
  document.body.innerHTML = '';
  for (const [key, id] of Object.entries(ids)) {
    const el = (key.includes('Indicator') || key.includes('Status')) ? document.createElement('div') : document.createElement('button');
    el.id = id;
    document.body.appendChild(el);
  }
}

function getText(id) {
  const el = document.getElementById(id);
  return el ? el.textContent : null;
}

describe('renderBlinxForm', () => {
  test('throws when store is missing getModel() or model.fields', () => {
    const root = document.createElement('div');

    expect(() => renderBlinxForm({ root, view: { sections: [] }, store: null, ui: {} }))
      .toThrow('renderBlinxForm requires a store that exposes getModel().');

    expect(() => renderBlinxForm({
      root,
      view: { sections: [] },
      store: { getModel: () => ({}) },
      ui: {},
    })).toThrow('renderBlinxForm requires the store model to define fields.');
  });

  test('create/delete/next/prev update store and status', async () => {
    const model = {
      fields: {
        name: { type: 'string', required: true, length: { min: 2, max: 50 } },
        price: { type: 'number', required: true, min: 0 },
      }
    };

    const store = createBlinxStore([{ name: 'AA', price: 1 }], model);
    const ui = new BlinxDefaultAdapter();
    const view = { sections: [{ title: 'Main', columns: 2, fields: ['name', 'price'] }] };

    const root = document.createElement('div');

    setupDomControls({
      saveButtonId: 'save',
      resetButtonId: 'reset',
      nextButtonId: 'next',
      prevButtonId: 'prev',
      createButtonId: 'create',
      deleteButtonId: 'delete',
      recordIndicatorId: 'indicator',
      saveStatusId: 'status',
    });

    renderBlinxForm({
      root,
      view,
      store,
      ui,
      recordIndex: 0,
      controls: {
        saveButtonId: 'save',
        resetButtonId: 'reset',
        nextButtonId: 'next',
        prevButtonId: 'prev',
        createButtonId: 'create',
        deleteButtonId: 'delete',
        recordIndicatorId: 'indicator',
        saveStatusId: 'status',
      }
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

    const ui = new BlinxDefaultAdapter();
    const view = { sections: [{ title: 'Main', columns: 2, fields: ['name', 'price'] }] };

    setupDomControls({
      saveButtonId: 'save',
      saveStatusId: 'status',
      recordIndicatorId: 'indicator',
    });

    const root = document.createElement('div');

    // Invalid record (name too short)
    const storeInvalid = createBlinxStore([{ name: 'A', price: 1 }], model);
    const commitSpyInvalid = jest.spyOn(storeInvalid, 'commit');

    renderBlinxForm({
      root,
      view,
      store: storeInvalid,
      ui,
      controls: {
        saveButtonId: 'save',
        saveStatusId: 'status',
        recordIndicatorId: 'indicator',
      }
    });

    document.getElementById('save').click();
    await Promise.resolve();

    expect(getText('status')).toBe('Fix validation errors.');
    expect(commitSpyInvalid).not.toHaveBeenCalled();

    // Valid record: no changes
    const storeNoChanges = createBlinxStore([{ name: 'AA', price: 1 }], model);
    const commitSpyNoChanges = jest.spyOn(storeNoChanges, 'commit');

    renderBlinxForm({
      root,
      view,
      store: storeNoChanges,
      ui,
      controls: {
        saveButtonId: 'save',
        saveStatusId: 'status',
        recordIndicatorId: 'indicator',
      }
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
    const store = createBlinxStore([{ name: 'AA' }], model);
    const ui = new BlinxDefaultAdapter();
    const view = { sections: [{ title: 'Main', columns: 2, fields: ['name'] }] };

    setupDomControls({
      saveStatusId: 'status',
      recordIndicatorId: 'indicator',
    });

    const root = document.createElement('div');

    renderBlinxForm({
      root,
      view,
      store,
      ui,
      controls: {
        saveStatusId: 'status',
        recordIndicatorId: 'indicator',
      }
    });

    store.updateIndex(0);
    expect(getText('status')).toBe('Record updated elsewhere; refreshed view.');

    store.reset();
    // reset status message is scheduled with setTimeout(0)
    jest.runOnlyPendingTimers();
    expect(getText('status')).toBe('Store reset elsewhere; refreshed view.');

    jest.useRealTimers();
  });
});
