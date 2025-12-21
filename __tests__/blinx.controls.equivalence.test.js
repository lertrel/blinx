/** @jest-environment jsdom */

import { blinxStore } from '../lib/blinx.store.js';
import { blinxForm } from '../lib/blinx.form.js';
import { blinxCollection } from '../lib/blinx.collection.js';

function setupExternalControls(ids = []) {
  for (const id of ids) {
    const el = document.createElement('button');
    el.id = id;
    document.body.appendChild(el);
  }
}

function getToolbarButtonLabels(root) {
  const toolbar = root.querySelector('.blinx-controls');
  if (!toolbar) return [];
  return Array.from(toolbar.querySelectorAll('button')).map(b => b.textContent);
}

describe('Controls equivalence + mixed domId/auto-render + custom actions', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('controls param supports partial + mixed domId and auto-render, including custom action (form)', async () => {
    setupExternalControls(['save', 'custom-external']);
    const indicator = document.createElement('div');
    indicator.id = 'indicator';
    document.body.appendChild(indicator);

    const model = { fields: { name: { type: 'string' } } };
    const store = blinxStore([{ name: 'A' }, { name: 'B' }], model);
    const root = document.createElement('div');

    const onExternal = jest.fn();
    const onInternal = jest.fn();

    const view = { sections: [{ title: 'Main', columns: 1, fields: ['name'] }] };

    blinxForm({
      root,
      store,
      view,
      recordIndex: 0,
      controls: {
        // Mixed: external dom binding + auto-rendered builtins
        saveButton: 'save',
        recordIndicator: 'indicator',
        prevButton: true,
        nextButton: true,

        // Custom control (external) + custom control (auto-rendered)
        customExternal: { domId: 'custom-external', action: async () => onExternal('ok') },
        customInternal: { label: 'Custom Internal', action: async () => onInternal('ok') },
      },
    });

    // Auto-rendered controls should create an internal toolbar (even though some controls are external).
    expect(root.querySelector('.blinx-controls')).not.toBeNull();
    expect(getToolbarButtonLabels(root)).toEqual(expect.arrayContaining(['Previous', 'Next', 'Custom Internal']));

    // Built-in next/prev should update external indicator.
    expect(document.getElementById('indicator')?.textContent).toBe('Record 1 of 2');
    Array.from(root.querySelectorAll('.blinx-controls button')).find(b => b.textContent === 'Next')?.click();
    expect(document.getElementById('indicator')?.textContent).toBe('Record 2 of 2');

    Array.from(root.querySelectorAll('.blinx-controls button')).find(b => b.textContent === 'Previous')?.click();
    expect(document.getElementById('indicator')?.textContent).toBe('Record 1 of 2');

    // Custom actions should fire for external and internal custom controls.
    document.getElementById('custom-external')?.click();
    await Promise.resolve();
    expect(onExternal).toHaveBeenCalledWith('ok');

    Array.from(root.querySelectorAll('.blinx-controls button')).find(b => b.textContent === 'Custom Internal')?.click();
    await Promise.resolve();
    expect(onInternal).toHaveBeenCalledWith('ok');
  });

  test('same control spec behaves the same via view.controls vs controls param (form)', async () => {
    const model = { fields: { name: { type: 'string' } } };
    const storeA = blinxStore([{ name: 'A' }, { name: 'B' }], model);
    const storeB = blinxStore([{ name: 'A' }, { name: 'B' }], model);

    // External DOM elements:
    // IMPORTANT: controls bind event listeners directly to the target element.
    // If two forms bind to the same element id, the second binding replaces the first.
    // Use distinct buttons so we can assert both instances independently.
    setupExternalControls(['custom-external-a', 'custom-external-b']);
    const indicator = document.createElement('div');
    indicator.id = 'indicator';
    document.body.appendChild(indicator);

    const onExternalA = jest.fn();
    const onInternalA = jest.fn();
    const onExternalB = jest.fn();
    const onInternalB = jest.fn();

    const commonControlsForView = {
      recordIndicator: 'indicator',
      prevButton: true,
      nextButton: true,
      customExternal: { domId: 'custom-external-a', action: async () => onExternalA('ok') },
      customInternal: { label: 'Custom Internal', action: async () => onInternalA('ok') },
    };

    const commonControlsForParam = {
      recordIndicator: 'indicator',
      prevButton: true,
      nextButton: true,
      customExternal: { domId: 'custom-external-b', action: async () => onExternalB('ok') },
      customInternal: { label: 'Custom Internal', action: async () => onInternalB('ok') },
    };

    const rootViewControls = document.createElement('div');
    const rootParamControls = document.createElement('div');

    blinxForm({
      root: rootViewControls,
      store: storeA,
      recordIndex: 0,
      view: {
        sections: [{ title: 'Main', columns: 1, fields: ['name'] }],
        controls: commonControlsForView,
      },
    });

    blinxForm({
      root: rootParamControls,
      store: storeB,
      recordIndex: 0,
      view: { sections: [{ title: 'Main', columns: 1, fields: ['name'] }] },
      controls: commonControlsForParam,
    });

    // Compare rendered toolbar buttons (labels should match).
    expect(getToolbarButtonLabels(rootViewControls).sort()).toEqual(getToolbarButtonLabels(rootParamControls).sort());

    // Compare navigation effect: both should update the same external indicator text (Record 1 -> 2).
    document.getElementById('indicator').textContent = '';
    Array.from(rootViewControls.querySelectorAll('.blinx-controls button')).find(b => b.textContent === 'Next')?.click();
    expect(document.getElementById('indicator')?.textContent).toBe('Record 2 of 2');

    // Reset indicator and test the other instance.
    document.getElementById('indicator').textContent = '';
    Array.from(rootParamControls.querySelectorAll('.blinx-controls button')).find(b => b.textContent === 'Next')?.click();
    expect(document.getElementById('indicator')?.textContent).toBe('Record 2 of 2');

    // Compare custom action firing for external and internal controls.
    document.getElementById('custom-external-a')?.click();
    await Promise.resolve();
    expect(onExternalA).toHaveBeenCalledWith('ok');
    expect(onExternalB).not.toHaveBeenCalled();

    document.getElementById('custom-external-b')?.click();
    await Promise.resolve();
    expect(onExternalB).toHaveBeenCalledWith('ok');

    Array.from(rootViewControls.querySelectorAll('.blinx-controls button')).find(b => b.textContent === 'Custom Internal')?.click();
    Array.from(rootParamControls.querySelectorAll('.blinx-controls button')).find(b => b.textContent === 'Custom Internal')?.click();
    await Promise.resolve();
    expect(onInternalA).toHaveBeenCalledWith('ok');
    expect(onInternalB).toHaveBeenCalledWith('ok');
  });

  test('custom controls work with domId and without (plus action) (collection)', async () => {
    // One custom control is bound externally, one auto-renders.
    setupExternalControls(['custom-external']);

    const model = { fields: { name: { type: 'string' } } };
    const store = blinxStore([{ name: 'A' }], model);
    const root = document.createElement('div');

    const onExternal = jest.fn();
    const onInternal = jest.fn();

    blinxCollection({
      root,
      store,
      paging: { pageSize: 20 },
      view: {
        layout: 'table',
        columns: [{ field: 'name', label: 'Name' }],
        controls: {
          customExternal: { domId: 'custom-external', action: async () => onExternal('ok') },
          customInternal: { label: 'Custom Internal', action: async () => onInternal('ok') },
        },
      },
    });

    // Since customInternal has no domId, it should be auto-rendered in an internal toolbar.
    expect(getToolbarButtonLabels(root)).toEqual(['Custom Internal']);

    document.getElementById('custom-external')?.click();
    await Promise.resolve();
    expect(onExternal).toHaveBeenCalledWith('ok');

    Array.from(root.querySelectorAll('.blinx-controls button')).find(b => b.textContent === 'Custom Internal')?.click();
    await Promise.resolve();
    expect(onInternal).toHaveBeenCalledWith('ok');
  });
});

