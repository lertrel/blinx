/** @jest-environment jsdom */

import { blinxStore } from '../lib/blinx.store.js';
import { blinxForm } from '../lib/blinx.form.js';
import { registerModelViews } from '../lib/blinx.ui-views.js';

describe('Nested UI views (Option A registry) (integration)', () => {
  test('blinxForm renders nested model + collection using model defaults and parent overrides', () => {
    const AddressModel = {
      id: 'Address',
      fields: {
        line1: { type: 'string' },
        city: { type: 'string' },
        zip: { type: 'string' },
        country: { type: 'string' },
      },
    };

    const CustomerModel = {
      id: 'Customer',
      fields: {
        customerId: { type: 'string' },
        name: { type: 'string' },
        address: { type: 'model', model: AddressModel },
      },
    };

    const OrderItemModel = {
      id: 'OrderItem',
      fields: {
        sku: { type: 'string' },
        qty: { type: 'number' },
        price: { type: 'number' },
      },
    };

    const OrderModel = {
      id: 'Order',
      fields: {
        orderId: { type: 'string' },
        customer: { type: 'model', model: CustomerModel },
        items: { type: 'collection', model: OrderItemModel },
        shippingAddress: { type: 'model', model: AddressModel },
      },
    };

    registerModelViews(AddressModel, {
      form: {
        default: { sections: [{ title: 'Address', columns: 2, fields: ['line1', 'city', 'zip', 'country'] }] },
        'short-address': { sections: [{ title: 'Short Address', columns: 2, fields: ['city', 'zip'] }] },
      },
    });

    registerModelViews(CustomerModel, {
      form: {
        default: { sections: [{ title: 'Customer', columns: 2, fields: ['customerId', 'name', 'address'] }] },
      },
    });

    registerModelViews(OrderItemModel, {
      form: {
        default: { sections: [{ title: 'Item', columns: 3, fields: ['sku', 'qty', 'price'] }] },
        'name-qty-price-only': { sections: [{ title: 'Item Compact', columns: 2, fields: ['sku', 'qty'] }] },
      },
    });

    registerModelViews(OrderModel, {
      form: {
        default: {
          sections: [
            {
              title: 'Order',
              columns: 1,
              fields: [
                'orderId',
                'customer', // uses CustomerModel form.default
                { field: 'items', itemView: 'name-qty-price-only' }, // override item view
                { field: 'shippingAddress', view: 'short-address' }, // override nested model view
              ],
            },
          ],
        },
      },
    });

    const store = blinxStore([{
      orderId: 'o-1',
      customer: {
        customerId: 'c-1',
        name: 'Alice',
        address: { line1: '1 Main', city: 'NY', zip: '10001', country: 'US' },
      },
      items: [
        { sku: 'SKU-1', qty: 2, price: 10 },
      ],
      shippingAddress: { line1: '2 Ship', city: 'SF', zip: '94105', country: 'US' },
    }], OrderModel);

    const root = document.createElement('div');
    blinxForm({ root, store }); // no `view`: should resolve OrderModel form.default from registry

    // Top-level field renders
    expect(root.textContent).toContain('orderId');
    expect(root.querySelector('input')?.value).toBe('o-1');

    // Nested model: customer uses CustomerModel default view and renders its own nested address (AddressModel default view)
    const customerRoot = root.querySelector('[data-blinx-field="customer"]');
    expect(customerRoot).toBeTruthy();
    expect(customerRoot.textContent).toContain('customerId');
    expect(customerRoot.querySelector('[data-blinx-field="address"]')).toBeTruthy();
    // Address default view includes "country"
    expect(customerRoot.textContent).toContain('country');

    // Nested collection: items uses override itemView, so it should NOT include "price" label
    const itemsRoot = root.querySelector('[data-blinx-field="items"]');
    expect(itemsRoot).toBeTruthy();
    expect(itemsRoot.textContent).toContain('sku');
    expect(itemsRoot.textContent).toContain('qty');
    expect(itemsRoot.textContent).not.toContain('price');

    // Nested model override: shippingAddress uses "short-address", so it should NOT include "country" label
    const shippingRoot = root.querySelector('[data-blinx-field="shippingAddress"]');
    expect(shippingRoot).toBeTruthy();
    expect(shippingRoot.textContent).toContain('city');
    expect(shippingRoot.textContent).toContain('zip');
    expect(shippingRoot.textContent).not.toContain('country');
  });
});

