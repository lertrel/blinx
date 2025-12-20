/** @jest-environment jsdom */

import { blinxStore } from '../lib/blinx.store.js';
import { blinxCollection } from '../lib/blinx.collection.js';
import { blinxForm } from '../lib/blinx.form.js';

import { ProductModel, ProductDataViews, ProductUIViews } from '../test-fixtures/models/product/index.js';

describe('Declarative data views + UI views (integration)', () => {
  test('components can resolve ui view by key and update when active data view changes', async () => {
    const queryCalls = [];

    const dataSource = {
      init() {},
      async query(spec) {
        queryCalls.push(spec.resource);
        if (spec.resource === 'products') {
          return {
            entities: { Product: [{ id: 'p1', name: 'Catalog A', price: 1, version: '1' }] },
            result: [{ type: 'Product', id: 'p1' }],
            pageInfo: { totalCount: 1 },
          };
        }
        if (spec.resource === 'products-featured') {
          return {
            entities: { Product: [{ id: 'p9', name: 'Featured Z', price: 99, version: '1' }] },
            result: [{ type: 'Product', id: 'p9' }],
            pageInfo: { totalCount: 1 },
          };
        }
        return { entities: { Product: [] }, result: [], pageInfo: { totalCount: 0 } };
      },
      async mutate() {
        return { applied: [], rejected: [], conflicts: [], entities: {} };
      },
    };

    const store = blinxStore({
      model: ProductModel,
      dataSource,
      views: ProductDataViews,
      defaultView: 'catalog',
      uiViews: ProductUIViews,
    });

    // Load default (catalog)
    await store.loadFirst();

    const listRoot = document.createElement('div');
    const formRoot = document.createElement('div');

    blinxCollection({
      root: listRoot,
      store,
      dataView: 'active',
      view: 'list',
      paging: { pageSize: 20 },
    });

    blinxForm({
      root: formRoot,
      store,
      dataView: 'active',
      view: 'edit',
      recordIndex: 0,
    });

    // Assert initial catalog render
    expect(listRoot.querySelectorAll('tbody tr').length).toBe(1);
    expect(listRoot.textContent).toContain('Catalog A');
    expect(formRoot.querySelector('input')?.value).toBe('Catalog A');

    // Switch active view => components should refresh via viewChanged + subsequent loadFirst/reset
    store.setActiveView('featured');
    await store.loadFirst();
    // blinxCollection/blinxForm schedule reset refresh via setTimeout(0)
    await new Promise(r => setTimeout(r, 0));

    expect(listRoot.textContent).toContain('Featured Z');
    expect(formRoot.querySelector('input')?.value).toBe('Featured Z');
    expect(queryCalls).toEqual(expect.arrayContaining(['products', 'products-featured']));
  });
});

