
import { coerceFieldValue, createDefaultValue } from './blinx.validate.js';

export const DataTypes = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  date: 'date',
  enum: 'enum',
  array: 'array',
};

export const EventTypes = {
  add: 'add',
  remove: 'remove',
  update: 'update',
  commit: 'commit',
  reset: 'reset',
};

const clone = value => JSON.parse(JSON.stringify(value));

function materializeRecord(model, record = {}) {
  if (!model || !model.fields) return clone(record);
  const next = {};
  const fieldEntries = Object.entries(model.fields);
  fieldEntries.forEach(([key, def]) => {
    if (record[key] === undefined) next[key] = createDefaultValue(def);
    else next[key] = coerceFieldValue(record[key], def);
  });
  Object.keys(record).forEach(key => {
    if (next[key] === undefined) next[key] = record[key];
  });
  return next;
}

export function createRecordTemplate(model) {
  return materializeRecord(model, {});
}

export function createBlinxStore(initialArray, dataModel) {
  const seed = Array.isArray(initialArray) ? initialArray : [];
  const model = dataModel;
  let original = seed.map(record => materializeRecord(model, record));
  let current = clone(original);
  const subs = new Set();
  let storeApi;

  function notify(path, value) {
    subs.forEach(fn => fn({ path, value, data: current, store: storeApi }));
  }

  function getRecord(idx) { return current[idx]; }
  function getModel() { return model; }
  function getLength() { return current.length; }

  function setField(idx, field, value) {
    const def = model?.fields?.[field];
    const nextValue = def ? coerceFieldValue(value, def) : value;
    current[idx][field] = nextValue;
    notify([idx, field], nextValue);
  }

  function addRecord(record, atIndex = current.length) {
    const prepared = materializeRecord(model, record);
    current.splice(atIndex, 0, prepared);
    notify([EventTypes.add, atIndex], prepared);
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
    const prepared = materializeRecord(model, record);
    current[index] = prepared;
    notify([EventTypes.update, index], prepared);
    return prepared;
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
    createRecordTemplate: () => createRecordTemplate(model),
  };

  return storeApi;
}
