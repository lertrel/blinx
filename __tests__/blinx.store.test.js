import { blinxStore, EventTypes } from '../lib/blinx.store.js';

describe('blinxStore', () => {
  test('tracks updates and additions via diff()', () => {
    const store = blinxStore(
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
    const store = blinxStore(
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

  test('toJSON returns a deep clone', () => {
    const store = blinxStore([{ id: 1, meta: { a: 1 } }], {});
    const snapshot = store.toJSON();
    snapshot[0].meta.a = 999;
    expect(store.getRecord(0).meta.a).toBe(1);
  });

  test('subscribe returns an unsubscribe function', () => {
    const store = blinxStore([{ id: 1 }], {});
    const events = [];
    const unsubscribe = store.subscribe(ev => events.push(ev));

    store.setField(0, 'id', 2);
    unsubscribe();
    store.setField(0, 'id', 3);

    expect(events.length).toBe(1);
    expect(events[0].path).toEqual([0, 'id']);
  });

  test('addRecord inserts at index and emits add event', () => {
    const store = blinxStore([{ id: 1 }, { id: 3 }], {});
    const events = [];
    store.subscribe(ev => events.push(ev));

    const idx = store.addRecord({ id: 2 }, 1);

    expect(idx).toBe(1);
    expect(store.toJSON().map(r => r.id)).toEqual([1, 2, 3]);
    const addEvent = events.find(e => e.path[0] === EventTypes.add);
    expect(addEvent).toBeDefined();
    expect(addEvent.path).toEqual([EventTypes.add, 1]);
    expect(addEvent.value).toEqual({ id: 2 });
  });

  test('removeRecords ignores invalid indexes and emits no event when nothing removed', () => {
    const store = blinxStore([{ id: 1 }], {});
    const events = [];
    store.subscribe(ev => events.push(ev));

    const removed = store.removeRecords([-1, 99]);
    expect(removed).toBe(0);
    expect(events.length).toBe(0);
  });

  test('updateIndex returns null when out of bounds, otherwise notifies and returns record', () => {
    const store = blinxStore([{ id: 1 }], {});
    const events = [];
    store.subscribe(ev => events.push(ev));

    expect(store.updateIndex(-1)).toBeNull();
    expect(store.updateIndex(1)).toBeNull();
    expect(events.length).toBe(0);

    const rec = store.updateIndex(0);
    expect(rec).toEqual({ id: 1 });
    expect(events[0].path).toEqual([EventTypes.update, 0]);
    expect(events[0].value).toEqual({ id: 1 });
  });

  test('update returns null when out of bounds, otherwise replaces record and notifies', () => {
    const store = blinxStore([{ id: 1 }], {});
    const events = [];
    store.subscribe(ev => events.push(ev));

    expect(store.update(1, { id: 2 })).toBeNull();
    expect(store.update(-1, { id: 2 })).toBeNull();

    const rec = store.update(0, { id: 2 });
    expect(rec).toEqual({ id: 2 });
    expect(store.getRecord(0)).toEqual({ id: 2 });
    const updateEvent = events.find(e => e.path[0] === EventTypes.update);
    expect(updateEvent).toBeDefined();
    expect(updateEvent.path).toEqual([EventTypes.update, 0]);
    expect(updateEvent.value).toEqual({ id: 2 });
  });

  test('commit snapshots current, clears diff, and emits commit event', () => {
    const store = blinxStore([{ id: 1, name: 'A' }], {});
    const events = [];
    store.subscribe(ev => events.push(ev));

    store.setField(0, 'name', 'B');
    expect(store.diff()).toEqual([{ index: 0, field: 'name', from: 'A', to: 'B' }]);

    store.commit();

    expect(store.diff()).toEqual([]);
    const commitEvent = events.find(e => e.path[0] === EventTypes.commit);
    expect(commitEvent).toBeDefined();
    expect(commitEvent.path).toEqual([EventTypes.commit]);
    expect(commitEvent.value).toEqual([{ id: 1, name: 'B' }]);
  });

  test('reset restores original snapshot and emits reset events for each record', () => {
    const store = blinxStore([{ id: 1 }, { id: 2 }], {});
    const events = [];
    store.subscribe(ev => events.push(ev));

    store.removeRecords([0]); // current: [{id:2}]
    store.commit(); // original: [{id:2}]

    store.addRecord({ id: 3 }); // current: [{id:2},{id:3}]
    expect(store.getLength()).toBe(2);

    events.length = 0;
    store.reset();

    expect(store.toJSON()).toEqual([{ id: 2 }]);
    expect(events.map(e => e.path)).toEqual([[EventTypes.reset, 0]]);
    expect(events[0].value).toEqual({ id: 2 });
  });

  test('diff reports deletions by index', () => {
    const store = blinxStore([{ id: 1 }, { id: 2 }], {});
    store.commit();
    store.removeRecords([1]);

    expect(store.diff()).toEqual([{ index: 1, deleted: true, from: { id: 2 } }]);
  });
});
