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
- **`nullable?: boolean`**  
  If `true`, the value may explicitly be `null` even when `required: true`.  
  (This distinguishes “must be present” from “may be empty/null”.)
- **`readonly: boolean`**
- **`defaultValue?: any | (def)=>any`**  
  Used when creating new records (see `seedRecord(...)` below).
- **`coerce?: (value, def)=>any`**  
  Runs before validation and before persisting UI values (default adapter also applies coercion on change/blur).
- **`css?: string`** (default adapter uses this on the field wrapper)

#### Strings (`type: DataTypes.string | DataTypes.longText | DataTypes.secret`)

- **`length?: { max?: number, min?: number }`** (legacy shape; still supported)
- **`minLength?: number` / `maxLength?: number`** (synonyms)
- **`exactLength?: number`** (identifiers that must be a specific size)
- **`pattern?: string | RegExp`** (regex validation)
- **`format?: 'email' | 'url' | 'uuid' | 'slug' | 'phone'`** (built-in patterns to avoid inline regex)
- **`trim?: boolean` / `lowercase?: boolean`** (string normalization, applied via coercion)

#### Numbers (`type: DataTypes.number`)

- **`min?: number` / `max?: number`**
- **`step?: number` / `multipleOf?: number`** (data validation; not just HTML attributes)
- **`integerOnly?: boolean`**
- **`precision?: number` / `scale?: number`** (decimal precision + decimal places)

#### Dates (`type: DataTypes.date` or `type: 'datetime'`)

- **`minDate?: string | Date` / `maxDate?: string | Date`**
- **`pastOnly?: boolean` / `futureOnly?: boolean`**

#### Arrays (`type: DataTypes.array`)

- **`minItems?: number` / `maxItems?: number`**
- **`uniqueItems?: boolean`**
- **`itemType?: string | FieldDef`**  
  Enforced **recursively** so arrays stay homogeneous (supports nested arrays too).

#### Enums (`type: DataTypes.enum`)

- **`values?: string[]`**

#### Custom validation hooks

- **`validators?: Array<(value, def)=> (string | string[] | null | undefined)>`**  
  Synchronous, domain-specific rules.
- **`asyncValidators?: Array<(value, def)=> (Promise<string|string[]|null|undefined> | string | string[] | null | undefined)>`**  
  Async checks (e.g. uniqueness against a service). Used by `validateFieldAsync(...)` and by form save validation.

Notes:
- Validation runs through `validateField(value, def)` in `lib/blinx.validate.js`.
- Async validation runs through `validateFieldAsync(value, def)` in `lib/blinx.validate.js`.
- Computed fields are always treated as read-only by the store (cannot be set via `setField`).

### Seeding new records (defaults)

When `blinxForm` creates a new record, it uses `seedRecord(model)` from `lib/blinx.validate.js`.
This seeds every non-computed field using:

- `defaultValue` (if present; function is called)
- otherwise `null` for `nullable: true`
- otherwise a type default (e.g. `[]` for arrays, `false` for booleans, `''` for most others)

Example:

```js
import { DataTypes } from '../../lib/blinx.store.js';

const ProductModel = {
  id: 'Product',
  fields: {
    id: { type: DataTypes.string, required: true, exactLength: 6 },
    email: { type: DataTypes.string, format: 'email', trim: true, lowercase: true },
    tags: { type: DataTypes.array, itemType: DataTypes.string, minItems: 0, uniqueItems: true },
    price: { type: DataTypes.number, min: 0, multipleOf: 0.01, precision: 10, scale: 2 },
    releaseDate: { type: DataTypes.date, pastOnly: true, nullable: true },
    sku: {
      type: DataTypes.string,
      validators: [(v) => (v && v.startsWith('SKU-') ? null : 'SKU must start with "SKU-".')],
      asyncValidators: [async (v) => (await isUniqueSku(v) ? null : 'SKU already exists.')],
    },
  },
};
```

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

