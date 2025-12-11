import { createBlinxStore, EventTypes } from '../lib/blinx.store.js';

describe('createBlinxStore', () => {
  test('tracks updates and additions via diff()', () => {
    const store = createBlinxStore(
      [{ id: 1, name: 'Alpha' }],
      { id: 'number', name: 'string' },
    );

    store.setField(0, 'name', 'Beta');
    store.addRecord({ id: 2, name: 'Gamma' });

    const diff = store.diff();

    expect(diff).toEqual(expect.arrayContaining([
      expect.objectContaining({ index: 0, field: 'name', from: 'Alpha', to: 'Beta' }),
      expect.objectContaining({ index: 1, added: true, to: { id: 2, name: 'Gamma' } }),
    ]));
  });

  test('removeRecords deduplicates indexes and emits a single event', () => {
    const store = createBlinxStore(
      [
        { id: 10, name: 'First' },
        { id: 20, name: 'Second' },
      ],
      {},
    );

    const events = [];
    store.subscribe(payload => events.push(payload));

    const removed = store.removeRecords([1, 1, 0, 0]);

    expect(removed).toBe(2);
    expect(store.getLength()).toBe(0);

    const removeEvent = events.find(event => event.path[0] === EventTypes.remove);

    expect(removeEvent).toBeDefined();
    expect(removeEvent.path[1]).toEqual([1, 0]);
    expect(removeEvent.value).toEqual([
      { id: 20, name: 'Second' },
      { id: 10, name: 'First' },
    ]);
  });
});
