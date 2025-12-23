import { blinxStore } from '../lib/blinx.store.js';

describe('computed fields', () => {
  test('exposes virtual computed fields via getRecord() and toJSON()', () => {
    const model = {
      fields: {
        price: { type: 'number' },
        discount: { type: 'number' },
        priceAfterDiscount: {
          type: 'number',
          computed: true,
          dependsOn: ['price', 'discount'],
          compute: (record) => record.price * (1 - record.discount),
        },
      },
    };
    const store = blinxStore([{ price: 100, discount: 0.2 }], model);

    expect(store.getRecord(0).priceAfterDiscount).toBe(80);
    expect(store.toJSON()[0].priceAfterDiscount).toBe(80);
  });

  test('caches computed values per-record and invalidates when dependencies change', () => {
    const compute = jest.fn((record) => record.price * 2);
    const model = {
      fields: {
        price: { type: 'number' },
        doublePrice: {
          type: 'number',
          computed: true,
          dependsOn: ['price'],
          compute,
        },
      },
    };
    const store = blinxStore([{ price: 5 }], model);

    expect(store.getRecord(0).doublePrice).toBe(10);
    expect(store.getRecord(0).doublePrice).toBe(10);
    expect(compute).toHaveBeenCalledTimes(1);

    store.setField(0, 'price', 7);
    expect(store.getRecord(0).doublePrice).toBe(14);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  test('computed fields are read-only and are stripped from stored records', () => {
    const model = {
      fields: {
        price: { type: 'number' },
        discount: { type: 'number' },
        priceAfterDiscount: {
          type: 'number',
          computed: true,
          dependsOn: ['price', 'discount'],
          compute: (record) => record.price * (1 - record.discount),
        },
      },
    };
    const store = blinxStore([{ price: 100, discount: 0.5 }], model);

    expect(() => store.setField(0, 'priceAfterDiscount', 1)).toThrow('Cannot set computed field');

    store.addRecord({ price: 20, discount: 0.25, priceAfterDiscount: 999 });

    // Value is computed (not persisted from input)
    expect(store.toJSON()[1].priceAfterDiscount).toBe(15);
    // And the underlying stored object should not have the computed key at all
    expect(Object.prototype.hasOwnProperty.call(store.getRecord(1), 'priceAfterDiscount')).toBe(false);
  });

  test('supports computed fields depending on other computed fields', () => {
    const calls = [];
    const model = {
      fields: {
        price: { type: 'number' },
        qty: { type: 'number' },
        tax: { type: 'number' },
        subtotal: {
          type: 'number',
          computed: true,
          dependsOn: ['price', 'qty'],
          compute: (r) => {
            calls.push('subtotal');
            return r.price * r.qty;
          },
        },
        total: {
          type: 'number',
          computed: true,
          dependsOn: ['subtotal', 'tax'],
          compute: (r) => {
            calls.push('total');
            return r.subtotal * (1 + r.tax);
          },
        },
      },
    };
    const store = blinxStore([{ price: 10, qty: 2, tax: 0.1 }], model);

    expect(store.getRecord(0).total).toBe(22);
    // total may compute subtotal lazily during evaluation, so call order is not guaranteed.
    expect(calls.sort()).toEqual(['subtotal', 'total']);
  });

  test('throws on computed dependency cycles', () => {
    const model = {
      fields: {
        a: {
          type: 'number',
          computed: true,
          dependsOn: ['b'],
          compute: (r) => (r.b ?? 0) + 1,
        },
        b: {
          type: 'number',
          computed: true,
          dependsOn: ['a'],
          compute: (r) => (r.a ?? 0) + 1,
        },
      },
    };

    expect(() => blinxStore([], model)).toThrow('dependency cycle');
  });
});

