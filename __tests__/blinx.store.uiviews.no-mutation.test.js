/** @jest-environment jsdom */

import { blinxStore } from '../lib/blinx.store.js';
import { BlinxArrayDataSource } from '../lib/blinx.store.js';
import { blinxCollection } from '../lib/blinx.collection.js';

describe('blinxStore uiViews are store-scoped (no model mutation)', () => {
  test('two stores can share the same model object but use different uiViews', async () => {
    const sharedModel = {
      fields: {
        id: { type: 'number' },
        name: { type: 'string' },
        version: { type: 'string' },
      }
    };

    const uiViewsA = {
      list: { layout: 'table', columns: [{ field: 'name', label: 'Name (A)' }] }
    };
    const uiViewsB = {
      list: { layout: 'table', columns: [{ field: 'name', label: 'Name (B)' }] }
    };

    const ds = new BlinxArrayDataSource([{ id: 1, name: 'X', version: '1' }], { entityType: 'Item', keyField: 'id', versionField: 'version' });

    const storeA = blinxStore({
      model: sharedModel,
      dataSource: ds,
      view: { name: 'items', resource: 'items', entityType: 'Item', keyField: 'id', versionField: 'version', defaultPage: { mode: 'page', page: 0, limit: 10 } },
      uiViews: uiViewsA,
    });

    const storeB = blinxStore({
      model: sharedModel,
      dataSource: ds,
      view: { name: 'items', resource: 'items', entityType: 'Item', keyField: 'id', versionField: 'version', defaultPage: { mode: 'page', page: 0, limit: 10 } },
      uiViews: uiViewsB,
    });

    // Ensure the model object was not mutated.
    expect(sharedModel.uiViews).toBeUndefined();
    expect(storeA.getUIViews()).toBe(uiViewsA);
    expect(storeB.getUIViews()).toBe(uiViewsB);

    await storeA.loadFirst();
    await storeB.loadFirst();

    const rootA = document.createElement('div');
    const rootB = document.createElement('div');

    blinxCollection({ root: rootA, store: storeA, dataView: 'active', view: 'list' });
    blinxCollection({ root: rootB, store: storeB, dataView: 'active', view: 'list' });

    const thA = rootA.querySelector('thead th:nth-child(2)')?.textContent; // 1st is 'Sel'
    const thB = rootB.querySelector('thead th:nth-child(2)')?.textContent;
    expect(thA).toBe('Name (A)');
    expect(thB).toBe('Name (B)');
  });
});

