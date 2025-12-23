# Model schema spec

This describes the **model object** used by `blinxStore(...)` and UI renderers.

## Top-level model shape

```js
export const ProductModel = {
  id: 'Product',          // optional but strongly recommended (used in error messages + UI view registry)
  name: 'Product',        // optional alternative identifier in some places
  entity: 'Product',      // optional alternative identifier in some places
  fields: {
    // fieldName: FieldDef
  },
  // Optional legacy: model.uiViews (store-scoped UI view map; prefer registerModelViews or cfg.uiViews)
  uiViews: { /* legacy map */ },
};
```

## Field definitions (`model.fields[fieldKey]`)

Each field definition is a plain object. Common keys:

### `type`

Supported primitives are exported as `DataTypes` from `lib/blinx.store.js`:

- `DataTypes.string`
- `DataTypes.longText`
- `DataTypes.number`
- `DataTypes.boolean`
- `DataTypes.date`
- `DataTypes.enum`
- `DataTypes.array`
- `DataTypes.json`
- `DataTypes.blob`
- `DataTypes.secret`

In UI rendering, two additional structural types are supported:

- **nested model**: `{ type: 'model', model: <Model> }`
- **nested collection**: `{ type: 'collection', model: <Model> }`

### Validation / constraints (consumed by validation + default UI adapter)

- **`required: boolean`**
- **`readonly: boolean`**
- **`length?: { max?: number, min?: number }`** (mostly used for strings)
- **`min?: number` / `max?: number` / `step?: number`** (numbers)
- **`values?: string[]`** (enums)
- **`css?: string`** (default adapter uses this on the field wrapper)

Notes:
- Validation runs through `validateField(value, def)` in `lib/blinx.validate.js`.
- Computed fields are always treated as read-only by the store (cannot be set via `setField`).

### Computed fields

A field can be declared as computed (virtual, read-only, derived at read-time):

```js
{
  type: DataTypes.string,
  computed: true,
  dependsOn: ['firstName', 'lastName'],      // required for correctness (no inference from function body)
  compute: (record, ctx) => `${record.firstName} ${record.lastName}`,
}
```

Semantics:

- **Not persisted**: computed values are not stored in the underlying record state.
- **Read-only**: `store.setField(..., computedField, ...)` throws.
- **Invalidation**: when a dependency changes, cached computed values are invalidated.
- **Cycle detection**: dependency cycles throw early (during model analysis).

See `lib/blinx.computed.js` for implementation.

