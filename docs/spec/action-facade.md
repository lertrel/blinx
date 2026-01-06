# Action Facade (`lib/blinx.action-facade.js`)
#
# Status: v0 — the API exposed through `createActionFacade()` is stable for the nested spec rollout. Future versions may add helpers, but existing method semantics should remain compatible.
#
# Purpose:
# - Provide a beginner-friendly surface that lets UI actions mutate models without navigating the raw store APIs.
# - Normalize nested (ENM vs SNM) behavior so the same code path can `patch`, `unlink`, or `delete` fields regardless of whether the child data is embedded or lives in a child store.
# - Buffer child-store mutations and expose a single `flush()` entry point so saves happen in the right order (child stores first, then parent).

## 1) Creating the facade

```js
import { createActionFacade } from '../lib/blinx.action-facade.js';

const facade = createActionFacade({
  store,             // required: parent blinxStore instance
  getRecord,         // () => current parent record snapshot
  getRecordIndex,    // () => numeric index of the parent record inside the store
  setStatus,         // optional: status reporter passthrough
  strict,            // optional boolean (default false). true = throw on issues.
});
```

- `getRecord` / `getRecordIndex` are evaluated lazily so actions always act on the latest parent record.
- The facade tracks `issues` so actions can be tolerant (`strict: false`) or fail-fast (`strict: true`).
- Child store interactions are resolved lazily through `getBaseStore()`; any child store touched during an action is queued for persistence at `flush()` time.

## 2) Facade API surface

```ts
facade.getRecord(): ParentRecord | null;
facade.model(record?: ParentRecord): ModelHandle;
facade.flush(): Promise<void>; // saves child stores first, then parent
facade.getIssues(): Issue[];
facade.setStatus: typeof setStatus | null;
```

- `model()` without arguments uses `getRecord()`. Passing a specific record lets you operate on snapshots (e.g., list items).
- `flush()` iterates over touched child stores. It calls `save()` if available, otherwise `commit()`, before saving the parent store.

## 3) ModelHandle

```ts
const modelHandle = facade.model();

modelHandle.get(fieldKey): FieldHandle;
modelHandle.set(fieldKey, value);
modelHandle.patch(fieldKey, partial);
modelHandle.getRecord(): ParentRecord;
```

- `set`/`patch` are conveniences that forward to the field handle.
- `patch` is a shallow merge for plain object fields, but gains nested semantics when the field definition is `type: 'model' | 'collection'`.

## 4) FieldHandle

Available for all fields:

```ts
field.get(): any;
field.set(value): FieldHandle;
field.patch(partial): FieldHandle;
field.clear(): FieldHandle;       // null for scalars, [] for collections
field.unlink(): FieldHandle;      // alias of clear() in v0
field.delete(): FieldHandle;      // nested-aware delete (see below)
field.items(): CollectionHandle;  // only when field.type === 'collection'
```

### 4.1 ENM vs SNM semantics

| Operation | ENM (`embedded: true`)                                  | SNM (`embedded: false`)                                                                 |
|-----------|---------------------------------------------------------|-----------------------------------------------------------------------------------------|
| `set`     | Stores the embedded object/array directly               | Accepts ids or objects; normalizes to id(s) using `ref.keyField`                        |
| `patch`   | Shallow merges the embedded object (model fields only)  | Delegates to the child store: resolves the child id, calls `childStore.updateById(id)`  |
| `clear`   | Nulls the object / empties the array                    | Sets id(s) to `null` / `[]`                                                             |
| `delete`  | Not allowed by default (reports `ENM_DELETE_DENIED`)    | Deletes the child entity via `childStore.deleteById(id)` and unlinks the relationship   |

- When the child store cannot be resolved or `updateById/deleteById` is missing, the facade reports an issue (or throws in strict mode).
- Missing ids also surface as `SNM_MISSING_ID` so callers can fallback gracefully.

### 4.2 Collection helpers

`field.items()` returns a `CollectionHandle` even if the collection is empty. It exposes:

```ts
itemsHandle.forEach((itemHandle, rawItem, index) => { ... });
itemsHandle.removeWhere((itemHandle, rawItem, index) => boolean);
itemsHandle.add(value);       // normalizes ENM/SNM automatically
itemsHandle.item(idOrIndex);  // returns ItemHandle
```

- `removeWhere` mutates the parent relationship only (unlink semantics). For ENM it splices embedded records; for SNM it removes the normalized ids.
- `add` handles both ENM objects and SNM ids transparently.

## 5) ItemHandle

Item handles are built on demand and always re-read the latest collection snapshot before each operation (so stale handles remain correct even if the parent record changes).

```ts
const item = itemsHandle.item(0);      // by index
const same = itemsHandle.item('c3');   // by SNM id when supported

item.get(fieldKey);
item.patch(partial);
item.delete(); // SNM only
```

- `patch` shares the same ENM vs SNM semantics as field-level patching, but scoped to the item’s index/id.
- `delete` on a SNM collection removes the child entity (`childStore.deleteById`) **and** unlinks the id from the parent array to avoid dangling references.

## 6) `flush()` and child store persistence

Whenever an operation touches a child store, the facade adds that store to `touchedChildStores`. `flush()` performs:

1. For each touched child store: call `save()` if defined, otherwise `commit()`. Failures are reported as `CHILD_SAVE_FAILED` / `CHILD_COMMIT_FAILED`.
2. Persist the parent store (`store.save()` or `store.commit()`).

Developers can call `facade.getIssues()` after flushing to detect non-fatal problems when `strict: false`.

## 7) Example usage

```js
const facade = createActionFacade({ store, getRecord, getRecordIndex, strict: true });
const customer = facade.model().get('customer');

// SNM: patch the child entity without loading it into the parent record
customer.patch({ tier: 'gold' });

// SNM collection: delete a line item via child store + unlink parent array
const products = facade.model().get('products').items();
products.item('prod-123').delete();

await facade.flush();
```

In the example above:
- `patch` resolves the child store registered for the `Customer` model via `getBaseStore`, calls `updateById`, and queues the child store for persistence.
- `item.delete()` calls `deleteById` on the child store and immediately removes the deleted id from the parent’s `products` field to keep local state consistent.

Use this facade inside `action` handlers for forms/collections to avoid reaching into low-level store methods and to ensure nested semantics are applied consistently.

## 8) Custom actions in `blinxForm` and `blinxCollection`

Both `blinxForm` and `blinxCollection` expose the action facade to custom controls/actions so developers can use the API without manual wiring:

- `blinxForm` action context includes:
  ```js
  {
    getRecord,       // current form record
    model,           // facade.model()
    flush,           // facade.flush
    getIssues,       // facade.getIssues
    setStatus,       // optional status reporter
  }
  ```

- `blinxCollection` yields an action context per row/selection, supplying:
  ```js
  {
    getRecord(recordIndex),
    model(record?),  // defaults to the row
    flush,
    getIssues,
  }
  ```

Custom action definitions (e.g., `controls: [{ type: 'action', action: async (ctx) => { ... } }]`) can call `ctx.model().get('field')` to mutate fields, `ctx.flush()` to persist, and inspect `ctx.getIssues()` for non-fatal warnings. Because these contexts delegate to `createActionFacade` internally, SNM-specific behavior (child store patch/delete, lazy store resolution, issue tracking) works identically in forms, collections, and standalone action runners.
