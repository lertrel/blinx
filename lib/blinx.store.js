
export const DataTypes = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  date: 'date',
  enum: 'enum',
  array: 'array',
};

export function createBlinxStore(initialArray, dataModel) {
  let original = JSON.parse(JSON.stringify(initialArray));
  let current = JSON.parse(JSON.stringify(initialArray));
  const model = dataModel;
  const subs = new Set();

  function notify(path, value) {
    subs.forEach(fn => fn({ path, value, data: current }));
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
    notify(['add', atIndex], record);
    return atIndex;
  }

  function removeRecords(indexes) {
    const sorted = Array.from(new Set(indexes)).sort((a, b) => b - a);
    sorted.forEach(i => {
      if (i >= 0 && i < current.length) {
        const removed = current.splice(i, 1);
        notify(['remove', i], removed[0]);
      }
    });
    return sorted.length;
  }

  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
  function toJSON() { return JSON.parse(JSON.stringify(current)); }

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

  function commit() { original = JSON.parse(JSON.stringify(current)); }
  function reset() { current = JSON.parse(JSON.stringify(original)); notify(['reset'], null); }

  return {
    getRecord, getLength, setField, addRecord, removeRecords,
    subscribe, toJSON, diff, commit, reset, getModel,
    subscribe, toJSON, diff, commit, reset,
  };
}
