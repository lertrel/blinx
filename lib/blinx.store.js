
export const DataTypes = {
  string: 'string',
  longText: 'longText',
  number: 'number',
  boolean: 'boolean',
  date: 'date',
  enum: 'enum',
  array: 'array',
  json: 'json',
  blob: 'blob',
  secret: 'secret',
  email: 'email',
  phone: 'phone',
  url: 'url',
  slug: 'slug',
  currency: 'currency',
  percent: 'percent',
  rating: 'rating',
  uuid: 'uuid',
  id: 'id',
  geoPoint: 'geoPoint',
  address: 'address',
  richText: 'richText',
  markdown: 'markdown',
};

export const EventTypes = {
  add: 'add',
  remove: 'remove',
  update: 'update',
  commit: 'commit',
  reset: 'reset',
};

const clone = value => JSON.parse(JSON.stringify(value));

export function createBlinxStore(initialArray, dataModel) {
  let original = clone(initialArray);
  let current = clone(initialArray);
  const model = dataModel;
  const subs = new Set();
  let storeApi;

  function notify(path, value) {
    subs.forEach(fn => fn({ path, value, data: current, store: storeApi }));
  }

  function getRecord(idx) { return current[idx]; }
  function getModel() { return model; }
  function getLength() { return current.length; }

  function setField(idx, field, value) {
    current[idx][field] = value;
    notify([idx, field], value);
  }

  function addRecord(record, atIndex = current.length) {
    current.splice(atIndex, 0, record);
    notify([EventTypes.add, atIndex], record);
    return atIndex;
  }

  function removeRecords(indexes) {
    const sorted = Array.from(new Set(indexes)).sort((a, b) => b - a);
    const removed = [];
    sorted.forEach(i => {
      if (i >= 0 && i < current.length) {
        const [record] = current.splice(i, 1);
        removed.push({ index: i, record });
      }
    });
    if (removed.length > 0) {
      const removedIndexes = removed.map(item => item.index);
      const removedRecords = removed.map(item => item.record);
      notify([EventTypes.remove, removedIndexes], removedRecords);
    }
    return removed.length;
  }

  function updateIndex(index) {
    if (index < 0 || index >= current.length) return null;
    const record = current[index];
    notify([EventTypes.update, index], record);
    return record;
  }

  function update(index, record) {
    if (index < 0 || index >= current.length) return null;
    current[index] = record;
    notify([EventTypes.update, index], record);
    return record;
  }

  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
  function toJSON() { return clone(current); }

  function diff() {
    const changes = [];
    const max = Math.max(current.length, original.length);
    for (let i = 0; i < max; i++) {
      const rec = current[i];
      const orig = original[i];
      if (rec && !orig) { changes.push({ index: i, added: true, to: rec }); continue; }
      if (!rec && orig) { changes.push({ index: i, deleted: true, from: orig }); continue; }
      if (rec && orig) {
        for (const k of Object.keys(rec)) {
          if (JSON.stringify(rec[k]) !== JSON.stringify(orig[k])) {
            changes.push({ index: i, field: k, from: orig[k], to: rec[k] });
          }
        }
      }
    }
    return changes;
  }

  function commit() {
    const snapshot = clone(current);
    original = snapshot;
    notify([EventTypes.commit], snapshot);
  }

  function reset() {
    current = clone(original);
    current.forEach((record, idx) => notify([EventTypes.reset, idx], record));
  }

  storeApi = {
    getRecord,
    getLength,
    setField,
    addRecord,
    removeRecords,
    updateIndex,
    update,
    subscribe,
    toJSON,
    diff,
    commit,
    reset,
    getModel,
  };

  return storeApi;
}
