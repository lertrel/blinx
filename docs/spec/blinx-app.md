# Blinx App Registry (`blinx.app.js`)
#
# Status: v0 (approved for nested model work). Call shape is stable; additional metadata keys may be added later without breaking current semantics.
#
# Purpose:
# - Provide a single place to register base stores (one per model) so that nested flows, action facades, and background persistence can resolve the correct store lazily.
# - Decouple model definitions from data-source wiring by keeping endpoints, views, and store instances in an application-level object.

## 1) `registerBlinxApp(app: BlinxAppConfig)`

```ts
type BlinxAppConfig = {
  stores: {
    [modelIdOrName: string]: StoreRegistration;
  };
};

type StoreRegistration =
  | { store: BlinxStoreInstance }
  | {
      model: DataModel;           // same shape used by blinxStore()
      dataSource: DataSourceCfg;  // see docs/spec/data-views.md
      views: Record<string, ViewConfig>;
      defaultView?: string;
      // any other blinxStore() options (cache, criteria, etc.) pass through untouched
    };
```

Rules:

- `modelIdOrName` is matched using `modelKey(model)` (id → name → entity). Register a key that matches the model objects you will pass to `getBaseStore`.
- You **must** provide either `store` (an already created `blinxStore` instance) or a plain configuration object that can be passed to `blinxStore()`. Mixing both is allowed but redundant (if `store` is present it is used as-is).
- Calling `registerBlinxApp` replaces the previous registry and clears the internal base-store cache. Re-register when you need to hot-reload configuration (e.g., in tests) so new stores are constructed.
- The function validates that `app` is an object; passing `null/undefined` throws immediately to prevent silent misconfiguration.

### 1.1 Typical bootstrapping code

```js
import { registerBlinxApp } from '../lib/blinx.app.js';
import { CustomerModel } from './models/customer.js';
import { OrdersDataSource } from './data/orders.js';

registerBlinxApp({
  stores: {
    Customer: {
      model: CustomerModel,
      dataSource: CustomerDataSource,
      views: {
        default: { resource: 'customers', entityType: 'Customer', keyField: 'id', versionField: 'version' },
      },
      defaultView: 'default',
    },
    Order: {
      store: createPreconfiguredOrderStore(), // reuse an existing instance
    },
  },
});
```

## 2) `getBaseStore(modelOrDescriptor)`

```ts
import { getBaseStore } from '../lib/blinx.app.js';

const store = getBaseStore({ id: 'Customer' });
```

Behavior:

- Accepts either a model object (`{ id, name, entity }`) or a string descriptor. Internally it uses `modelKey(model)` to resolve the canonical key.
- If a base store was already constructed for the key, it is returned from the internal cache.
- If the registry entry contains `{ store }`, that instance is cached and returned.
- Otherwise `blinxStore(registration)` is invoked to build a new base store, which is cached for subsequent calls.
- The function throws when:
  - `modelKey(model)` is missing (e.g., the model lacks `id/name/entity`), or
  - there is no registration for the requested key (`No base store registered for model "Foo"`).

## 3) Relationship to SNM (Self-contained Nested Models)

SNM fields described in [`nested.md`](./nested.md) require that every child model referenced with `embedded: false` has a corresponding base store in the app registry. The action facade (`ctx.model().get(...).patch/delete`) resolves child stores via `getBaseStore`, so missing registrations surface immediately with a descriptive error.

Checklist when introducing a new SNM relationship:

1. Define the child model (with `id/name/entity` for `modelKey`).
2. Ensure `registerBlinxApp` contains an entry for that child model.
3. Verify the entry’s `views.default` matches the remote resource the child store should load/persist through.

## 4) API summary

| Function            | Description                                                                                           |
|---------------------|-------------------------------------------------------------------------------------------------------|
| `registerBlinxApp`  | Registers `{ stores }`, clears cached base stores, and becomes the source of truth for lazy lookups.  |
| `getBlinxApp`       | Returns the raw config last passed to `registerBlinxApp` (mainly for diagnostics/testing).            |
| `getBaseStore`      | Resolves or constructs a base `blinxStore` for the supplied model key, throwing if no entry exists.   |

Remember: `registerBlinxApp` does **not** perform deep validation of each store config; it simply forwards configs to `blinxStore`. Refer to [`data-views.md`](./data-views.md) for the detailed store/view schema.
