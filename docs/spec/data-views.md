# Data views spec (store + multi-view manager)

This describes how Blinx models **data access** and **multiple “data views”** (collections) via `blinxStore`.

## Two store modes

### 1) Legacy local store (array-backed)

```js
import { blinxStore, DataTypes } from '../lib/blinx.store.js';

const model = { id: 'Product', fields: { id: { type: DataTypes.string }, name: { type: DataTypes.string } } };
const store = blinxStore([{ id: '1', name: 'A' }], model);
```

This returns a single store with:
- local mutation (`setField`, `addRecord`, `removeRecords`, `commit`, `reset`)
- diffing (`diff`)
- event subscription (`subscribe`)

### 2) Data-source + multi-view manager (remote-capable)

```js
import { blinxStore } from '../lib/blinx.store.js';
import { BlinxRestDataSource } from '../lib/blinx.datasource.js';

const store = blinxStore({
  model,
  dataSource: new BlinxRestDataSource({ baseUrl: 'https://api.example.com' }),
  views: {
    default: { resource: 'products', entityType: 'Product', keyField: 'id', versionField: 'version' },
    archived: { resource: 'products', defaultFilter: { archived: true } },
  },
  defaultView: 'default',
});
```

This returns a **manager** that:
- exposes a **single event bus** for the model
- proxies store-like operations to the **active view store**
- lets you create/select per-view stores via `store.view(name)` / `store.collection(name)`

## Store config shape (remote-capable)

`blinxStore({ ... })` accepts either:

### A) `{ model, dataSource, views, defaultView }`

- **`model`**: model schema (see `model.md`)
- **`dataSource`**: object implementing `query(querySpec)` and `mutate(ops)` (see `lib/blinx.datasource.js`)
  - convenience: if `dataSource` is an array, it is wrapped in `BlinxArrayDataSource`
  - convenience: `initialArray` can be used instead of `dataSource`
- **`views`**: map of viewName -> viewConfig (see below)
- **`defaultView`**: name of the default active view (fallback: first key, else `"default"`)
- **`dataSourceOptions`**: optional defaults passed to `dataSource.init(...)` (if implemented)

### B) `{ model, dataSource, view }` (single-view shorthand)

If you pass a single `view` object, Blinx normalizes it into `views: { [view.name||'default']: view }`.

## Data view config (`views[viewName]`)

These are consumed by the remote view store layer (and partially by array data source implementations):

Common keys:
- **`name?: string`** (the view name is also provided by the `views` map key)
- **`resource?: string`** (used for querySpec)
- **`entityType?: string`** (normalization namespace)
- **`keyField?: string`** (default `"id"`)
- **`versionField?: string`** (default `"version"`)

Defaults & criteria:
- **`defaultFilter?: object | (record)=>boolean`**
- **`defaultSort?: Array<{ field: string, dir?: 'asc'|'desc' }>`**
- **`defaultSelect?: string[]`** (field selection hint)

Pagination defaults (one of):
- **`defaultPage?: { mode: 'cursor'|'page'|'offset', limit?: number, after?: string|null, page?: number, offset?: number }`**
- alias: **`page`** (same shape as `defaultPage`)

## Optional: per-view cache strategy (multi-page / working-set / full)

Remote view stores can optionally maintain an **entity cache** across multiple pages/queries. This enables **local criteria** (client-side filtering) over:

- the **loaded working set** (default when enabled), or
- a best-effort **full cache** (warm all pages; bounded by configured caps).

Declare cache config per data view:

```js
views: {
  default: {
    resource: 'products',
    entityType: 'Product',
    cache: {
      completeness: 'loaded' | 'all',        // 'loaded' caches what you fetched; 'all' can warm all pages
      maxEntities: 20000,                    // optional safety cap (recommended)
      eviction: { policy: 'lru'|'ttl'|'lru+ttl', ttlMs?: number },
      fields: { include?: string[], exclude?: string[] }, // avoid caching heavy fields unless needed
      persist: { adapter: 'memory'|'indexeddb' },         // adapter-driven (indexeddb optional)
    }
  }
}
```

Notes:
- This cache is **deduped by id** (keyed by `keyField`).
- Local criteria is only guaranteed correct over the cached subset unless `completeness: 'all'` is used (and the warm succeeds).

## Multi-view manager API surface (important bits)

- **`store.view(name)` / `store.collection(name)`**
  - with a name: returns the per-view store for that view name
  - without a name: returns the **active** per-view store
- **`store.setActiveView(name)` / `store.getActiveView()`**
- **`store.getViews()`**: returns the configured data views

The manager also proxies common store APIs to the active view:
`getRecord/getLength/setField/addRecord/removeRecords/update/updateIndex/toJSON/diff/commit/reset`
and remote APIs: `loadFirst/pageNext/pagePrev/search/save/getStatus/getPagingState`.

## Local view criteria (per-consumer projections)

To avoid “one criteria change affects all components”, Blinx supports **local views**: derived, store-compatible projections of a remote view that have their **own event bus** and their **own criteria**.

- **`remoteView.localView(localViewKey)`** returns a derived store for that consumer key.
- **`localView.setCriteria(criteria)`** applies local criteria (from the shared per-view cache) and emits `EventTypes.criteriaChanged` + `EventTypes.reset` on the **local view** bus only.

Example:

```js
const remoteView = store.view('default');               // per-view remote store (shared cache)
const productSearch = remoteView.localView('search');   // per-consumer local view store (read-only by default)

await productSearch.setCriteria({
  scope: 'cached' | 'all',
  filter: null | { /* DSL or equality */ } | ((record, ctx) => boolean), // escape hatch supported
  sort: [{ field: 'price', dir: 'asc' }],
  page: { limit: 50 },                   // local paging uses offset mode
  meta: { label: 'Men + 1000-5000' },    // optional debugging/UI metadata
});
```

Notes:
- Local criteria does **not** mutate the remote view store’s `toJSON()` dataset.
- Predicate filters are supported as an escape hatch and are **not serialized** in event payloads.

### Mutability

Local views are **read-only by default**. To allow mutations through a local view (proxied to the upstream remote view store), opt in:

```js
const editableSearch = remoteView.localView('search', { mutable: true });
editableSearch.isMutable(); // => true
```

All stores also expose:
- **`store.isMutable() => boolean`**

