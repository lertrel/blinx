import { getBaseStore } from './blinx.app.js';
import { isSNMFieldDef, extractSNMId, extractSNMIds } from './blinx.nested.js';

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function defaultPredicate(_item) {
  return true;
}

export function createActionFacade({
  store,
  getRecord,
  getRecordIndex,
  setStatus,
  strict = false,
} = {}) {
  const issues = [];
  const touchedChildStores = new Set();

  function report(issue) {
    issues.push(issue);
    if (strict) throw new Error(issue?.message || String(issue));
  }

  async function flush() {
    // v0: persist any child stores lazily touched by SNM operations, then persist parent.
    for (const s of touchedChildStores) {
      if (s && typeof s.save === 'function') {
        try { await s.save(); } catch (e) { report({ code: 'CHILD_SAVE_FAILED', message: e?.message || String(e) }); }
      } else if (s && typeof s.commit === 'function') {
        try { s.commit(); } catch (e) { report({ code: 'CHILD_COMMIT_FAILED', message: e?.message || String(e) }); }
      }
    }
    if (store && typeof store.save === 'function') return await store.save();
    if (store && typeof store.commit === 'function') return store.commit();
    return null;
  }

  function model(record = null) {
    const rec = record ?? getRecord?.();
    const modelDef = store?.getModel?.();

    function getFieldDef(fieldKey) {
      return modelDef?.fields?.[fieldKey] || null;
    }

    function fieldHandle(fieldKey) {
      const def = getFieldDef(fieldKey);
      const getCurVal = () => (getRecord?.() || {})?.[fieldKey];

      function setValue(value) {
        const idx = getRecordIndex?.() ?? 0;
        // Normalize "clear" for collections.
        if (def?.type === 'collection' && (value === null || value === undefined)) value = [];
        try {
          store?.setField?.(idx, fieldKey, value);
        } catch (e) {
          report({ code: 'SET_FAILED', field: fieldKey, message: e?.message || String(e) });
        }
        return api;
      }

      function patchValue(partial) {
        if (!isPlainObject(partial)) return api;
        const idx = getRecordIndex?.() ?? 0;
        const curVal = getCurVal();

        // Nested semantics:
        if (def?.type === 'model' || def?.type === 'collection') {
          if (isSNMFieldDef(def)) {
            // SNM patch: patch child entity via child store (lazy resolution).
            if (def.type !== 'model') {
              report({ code: 'SNM_PATCH_UNSCOPED', field: fieldKey, message: `SNM patch requires scoping for collection field "${String(fieldKey)}".` });
              return api;
            }
            const id = (() => {
              try { return extractSNMId(def, curVal); } catch (e) { report({ code: 'SNM_ID', field: fieldKey, message: e?.message || String(e) }); return null; }
            })();
            if (!id) {
              report({ code: 'SNM_MISSING_ID', field: fieldKey, message: `Cannot patch SNM field "${String(fieldKey)}" without an id.` });
              return api;
            }
            try {
              const childStore = getBaseStore(def.model);
              if (typeof childStore.updateById !== 'function') {
                report({ code: 'SNM_CHILD_STORE_UNSUPPORTED', field: fieldKey, message: 'Child store does not support updateById().' });
                return api;
              }
              childStore.updateById(id, partial);
              touchedChildStores.add(childStore);
              return api;
            } catch (e) {
              report({ code: 'SNM_CHILD_PATCH_FAILED', field: fieldKey, message: e?.message || String(e) });
              return api;
            }
          }

          // ENM patch: patch embedded object(s) in parent.
          if (def.type === 'model') {
            const base = isPlainObject(curVal) ? curVal : {};
            return setValue({ ...base, ...partial });
          }
          // ENM collection patch without scoping is not supported here.
          report({ code: 'ENM_PATCH_UNSCOPED', field: fieldKey, message: `ENM patch requires scoping for collection field "${String(fieldKey)}".` });
          return api;
        }

        // Non-nested: best-effort patch for plain objects.
        if (isPlainObject(curVal)) return setValue({ ...curVal, ...partial });
        return setValue(partial);
      }

      function clear() {
        if (def?.type === 'collection') return setValue([]);
        return setValue(null);
      }

      function unlink() {
        // Unlink is meaningful only for nested fields; fall back to clear otherwise.
        return clear();
      }

      function del() {
        // Delete child entity is only supported for SNM model fields in v0.
        if (!(def?.type === 'model' || def?.type === 'collection')) {
          report({ code: 'DELETE_UNSUPPORTED', field: fieldKey, message: `Delete is only supported for nested fields (got "${String(fieldKey)}").` });
          return api;
        }
        if (!isSNMFieldDef(def)) {
          report({ code: 'ENM_DELETE_DENIED', field: fieldKey, message: `ENM delete is not allowed by default for "${String(fieldKey)}". Use unlink() or delete the parent record.` });
          return api;
        }
        if (def.type !== 'model') {
          report({ code: 'SNM_DELETE_UNSCOPED', field: fieldKey, message: `SNM delete requires scoping for collection field "${String(fieldKey)}".` });
          return api;
        }
        const curVal = getCurVal();
        const id = (() => {
          try { return extractSNMId(def, curVal); } catch (e) { report({ code: 'SNM_ID', field: fieldKey, message: e?.message || String(e) }); return null; }
        })();
        if (!id) {
          report({ code: 'SNM_MISSING_ID', field: fieldKey, message: `Cannot delete SNM field "${String(fieldKey)}" without an id.` });
          return api;
        }
        try {
          const childStore = getBaseStore(def.model);
          if (typeof childStore.deleteById !== 'function') {
            report({ code: 'SNM_CHILD_STORE_UNSUPPORTED', field: fieldKey, message: 'Child store does not support deleteById().' });
            return api;
          }
          childStore.deleteById(id);
          touchedChildStores.add(childStore);
          // Unlink relationship after deletion.
          return unlink();
        } catch (e) {
          report({ code: 'SNM_CHILD_DELETE_FAILED', field: fieldKey, message: e?.message || String(e) });
          return api;
        }
      }

      function items() {
        const arr = Array.isArray(getCurVal()) ? getCurVal() : [];
        const collectionDef = def;

        function itemHandle(idOrIndex) {
          const index = Number.isFinite(idOrIndex) ? idOrIndex : null;
          const valueAt = index !== null ? arr[index] : null;
          const resolvedId = (() => {
            if (!collectionDef || collectionDef?.type !== 'collection') return null;
            if (!isSNMFieldDef(collectionDef)) return null;
            if (index !== null) {
              try { return extractSNMId(collectionDef, valueAt); } catch { return null; }
            }
            try { return extractSNMId(collectionDef, idOrIndex); } catch { return null; }
          })();

          return {
            get: (k) => {
              if (isPlainObject(valueAt)) return valueAt?.[k];
              return undefined;
            },
            patch: (partial) => {
              if (!collectionDef) return;
              if (!isPlainObject(partial)) return;
              if (isSNMFieldDef(collectionDef)) {
                if (!resolvedId) return report({ code: 'SNM_MISSING_ID', field: fieldKey, message: `Cannot patch SNM collection item without an id (field "${String(fieldKey)}").` });
                try {
                  const childStore = getBaseStore(collectionDef.model);
                  childStore.updateById(resolvedId, partial);
                  touchedChildStores.add(childStore);
                } catch (e) {
                  report({ code: 'SNM_CHILD_PATCH_FAILED', field: fieldKey, message: e?.message || String(e) });
                }
                return;
              }
              // ENM embedded item patch: mutate by replacing the item object at index.
              if (index === null) return report({ code: 'ENM_PATCH_NEEDS_INDEX', field: fieldKey, message: 'ENM item patch requires numeric index.' });
              const latest = getRecord?.()?.[fieldKey];
              const base = Array.isArray(latest) ? latest : [];
              const next = base.slice();
              const baseItem = isPlainObject(next[index]) ? next[index] : {};
              next[index] = { ...baseItem, ...partial };
              setValue(next);
            },
            delete: () => {
              if (!collectionDef) return;
              if (!isSNMFieldDef(collectionDef)) return report({ code: 'ENM_DELETE_DENIED', field: fieldKey, message: `ENM delete is not allowed by default for "${String(fieldKey)}". Use removeWhere/unlink.` });
              if (!resolvedId) return report({ code: 'SNM_MISSING_ID', field: fieldKey, message: `Cannot delete SNM collection item without an id (field "${String(fieldKey)}").` });
              try {
                const childStore = getBaseStore(collectionDef.model);
                childStore.deleteById(resolvedId);
                touchedChildStores.add(childStore);
              } catch (e) {
                report({ code: 'SNM_CHILD_DELETE_FAILED', field: fieldKey, message: e?.message || String(e) });
              }
            },
          };
        }

        function removeWhere(predicate = defaultPredicate) {
          if (!collectionDef || collectionDef?.type !== 'collection') return api;
          const latest = getRecord?.()?.[fieldKey];
          const base = Array.isArray(latest) ? latest : [];
          try {
            const keep = [];
            for (let i = 0; i < base.length; i++) {
              const it = base[i];
              const handle = itemHandle(i);
              const remove = !!predicate(handle, it, i);
              if (!remove) keep.push(it);
            }
            setValue(keep);
          } catch (e) {
            report({ code: 'REMOVE_WHERE_FAILED', field: fieldKey, message: e?.message || String(e) });
          }
          return api;
        }

        function add(value) {
          const latest = getRecord?.()?.[fieldKey];
          const base = Array.isArray(latest) ? latest : [];
          setValue(base.concat([value]));
          return api;
        }

        return {
          forEach(fn) {
            const latest = getRecord?.()?.[fieldKey];
            const base = Array.isArray(latest) ? latest : [];
            for (let i = 0; i < base.length; i++) fn(itemHandle(i), base[i], i);
            return api;
          },
          removeWhere,
          add,
          item: itemHandle,
        };
      }

      const api = {
        get: () => (getRecord?.() || {})?.[fieldKey],
        set: setValue,
        patch: patchValue,
        clear,
        unlink,
        delete: del,
        items,
      };
      return api;
    }

    const api = {
      get: (fieldKey) => fieldHandle(fieldKey),
      set: (fieldKey, value) => fieldHandle(fieldKey).set(value),
      patch: (fieldKey, partial) => fieldHandle(fieldKey).patch(partial),
    };

    // Expose record snapshot for convenience.
    api.getRecord = () => rec;
    return api;
  }

  return {
    getRecord: () => getRecord?.(),
    flush,
    model,
    getIssues: () => issues.slice(),
    setStatus: typeof setStatus === 'function' ? setStatus : null,
  };
}

