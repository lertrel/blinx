# UI views spec (form / collection / table)

This describes the **UI view schema** Blinx uses to render:

- `blinxForm(...)` (single-record)
- `blinxCollection(...)` (multi-record, multiple layouts)
- `blinxTable(...)` (a convenience wrapper around `blinxCollection` forcing table layout)

It also documents how UI views are **resolved** (registry vs store-scoped maps vs generated fallbacks).

---

## UI view resolution (where views come from)

Blinx can resolve a UI view from multiple sources (in this order):

1) **Explicit object** passed as `view` to the component call (always wins)
2) **String view name** passed as `view`:
   - first: store-scoped `store.getUIViews()[name]` (legacy)
   - then: model registry via `registerModelViews(model, views)` (preferred)
3) **Omitted `view`**:
   - use model registry default for the kind (`form` or `collection`)
   - if allowed, fall back to **schema-generated default view** (see `BlinxConfig.isGeneratedViewAllowed()`)

Registry/resolution logic lives in `lib/blinx.ui-views.js`.

---

## Shared concepts

### Renderer selection

UI views can reference a named renderer:

- **`view.renderer?: string`** (default renderer name)
- **field/column `renderer?: string`** overrides per entry

Renderers are registered via `RegisteredUI.register(name, renderer)`.

### `present()` and `rowPresent` (minimal conditional behavior)

Instead of a large DSL, Blinx supports **attrs-only presentation hooks**:

```js
present: (ctx, record, index) => ({
  attrs: {
    // part -> attrs bag
  }
})
```

Notes:
- `ctx` is a merged object: `{ store, model, view, kind, ...context }`
- `present()` is **recomputed whenever the UI rebuilds/refreshes** (no caching)
- Boolean mapping:
  - standard HTML boolean attrs like `hidden/disabled/required/readonly` are applied as real DOM semantics
  - `data-*` booleans serialize to `"true"` / removed (to work well with CSS selectors)

You provide extra keys for `ctx` via the optional `context` argument:

```js
blinxForm({ root, store, view, context: { role: 'admin', tenant: 't1' } });
blinxCollection({ root, store, view, context: { role: 'admin', tenant: 't1' } });
```

---

## Form UI view schema (`kind: 'form'`)

### Top-level

```js
const formView = {
  renderer: 'default',          // optional
  controls: undefined | false | { /* control spec */ },
  sections: [ /* Section[] */ ],
};
```

### Section

```js
{
  title: 'Basics',
  columns: 1 | 2 | 3,
  present: (ctx, record, index) => ({
    attrs: {
      root: { 'data-section': 'basics' },     // applied to section container
      wrapper: { 'data-grid': 'main' },       // applied to the section grid
    }
  }),
  fields: [ /* FieldSpec[] */ ],
}
```

### FieldSpec

Supported entries:

1) **String field key**:

```js
'name'
```

2) **Object field entry** (recommended for customization):

```js
{
  field: 'price',
  span: 1 | 2,                 // grid span (supported by default adapter)
  renderer: 'default',         // override renderer for this field

  // Nested model overrides (only meaningful when the model field type is 'model' / 'collection')
  view: 'some-nested-form-view-name',
  itemView: 'some-item-form-view-name',

  present: (ctx, record, index) => ({
    attrs: {
      cell: { 'data-cell': 'price' },         // applied to outer grid cell wrapper
      wrapper: { hidden: false },             // applied to widget wrapper (default adapter: same as widget root)
      root: { 'data-field': 'price' },        // applied to widget root
      label: { title: 'Your price' },         // best-effort
      input: { readonly: !!record?.id },      // best-effort (native semantics where possible)
      error: { 'data-error-for': 'price' },   // best-effort
      help: { 'data-help': 'price' },         // best-effort
    }
  }),
}
```

Implementation notes:
- The default adapter exposes `parts: { wrapper, label, input, error }` from `createField(...)`.
- For custom adapters, `present().attrs.*` is applied best-effort (Blinx tries to locate `label/input/error` under the returned `el`).

---

## Collection UI view schema (`kind: 'collection'`)

### Top-level

```js
const collectionView = {
  layout: 'table' | 'cards' | 'feed' | { mount(...) { ... } },
  renderer: 'default',                // optional default cell renderer
  columns: [ /* Column[] */ ],        // used by table layout
  item: { titleField?: string, bodyField?: string }, // used by cards/feed layouts

  searchFields: ['name'],             // optional UI-level keyword search fields
  defaultSort: [{ field: 'updatedAt', dir: 'desc' }], // optional UI-level sort

  controls: undefined | false | { /* control spec */ },

  // Row-level presentation hook (table: <tr>, cards/feed: <article>)
  rowPresent: (ctx, record, index) => ({
    attrs: { row: { 'data-id': record?.id || '' } }
  }),
};
```

### Column

```js
{
  field: 'name',
  label: 'Name',
  renderer: 'default',
  present: (ctx, record, index) => ({
    attrs: {
      header: { 'data-tenant': ctx.tenant },                  // applied to <th>
      cell: { 'data-variant': `primary-${ctx.role}` },        // applied to <td>
      row: { 'data-has-id': !!record?.id },                   // optional: applied to <tr>
    }
  }),
}
```

---

## Table UI view schema (`blinxTable`)

`blinxTable(...)` resolves the same **collection view**, then forces `layout: 'table'`.
All collection/table schema rules apply.

