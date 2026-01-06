# Blinx Specs (Model / Data Views / UI Views)

This folder documents the **supported shapes** (syntax) and **semantics** (behavior) of Blinx’s:

- [**Model schema**](model.md): field definitions, constraints, computed fields
- [**Data views**](data-views.md): store/data-source configuration and multi-view manager behavior
- [**UI views**](ui-views.md): form/collection/table schemas, view resolution, and presentation hooks (`present`, `rowPresent`)

Docs:

- [`model.md`](model.md)
- [`data-views.md`](data-views.md)
- [`ui-views.md`](ui-views.md)
- [`action-facade.md`](action-facade.md)
- [`nested.md`](nested.md)
- [`blinx-app.md`](blinx-app.md)

## Spec Index (all schema/DSL surfaces)

Use this as a quick “map” of the declarative shapes Blinx supports:

- **Model schema** (`model.md`)
  - **field definitions / validation constraints**
  - **computed fields**: `computed`, `dependsOn`, `compute`
- **Data view schema** (`data-views.md`)
  - **remote view config**: `resource/entityType/keyField/versionField/defaultFilter/defaultSort/defaultPage`
  - **cache strategy**: `cache.{completeness,maxEntities,eviction,fields,persist}` (including `fields.include/exclude` precedence)
  - **local views**: `remoteView.localView(localViewKey[, { mutable }])`
  - **local criteria**: `setCriteria({ filter, sort, page, meta })`
    - **filter DSL**: `and/or`, `{field,op,value}`, plus predicate escape hatch
- **UI view schema** (`ui-views.md`)
  - **form view** (`sections/fields`)
  - **collection/table views** (`layout/columns/item/searchFields/defaultSort`)
  - **controls spec**: built-in + custom controls, `action`, and dynamic `disabled/visible: (ctx)=>boolean`
  - **selection config**: `selection.mode` + `selection.isRowSelectable(ctx, record, index)`
  - **presentation hooks**: `present()` / `rowPresent()` returning `{ attrs: ... }`
- **Action facade** (`action-facade.md`)
  - `createActionFacade` inputs
  - `ctx.model()`, `FieldHandle`, `CollectionHandle`, SNM vs ENM semantics, `flush()`
- **Nested models** (`nested.md`)
  - **ENM vs SNM**: `embedded: true|false`
  - **SNM refs**: `ref.keyField/ref.labelField` and id-only persistence
  - **nestedJourneys** resolution and action facade semantics
- **App registry** (`blinx-app.md`)
  - **`registerBlinxApp` schema**: `{ stores: { [modelKey]: { store } | blinxStoreConfig } }`
  - **`getBaseStore` semantics**: lazy construction, cache invalidation, SNM requirements

Protocol-like shapes (implemented in code, consumed by the store/data sources):

- **DataSource query spec** (`lib/blinx.datasource.js`): `querySpec = { resource, entityType, filter, sort, page, params }`
- **Mutation op spec** (`lib/blinx.datasource.js`): ops for `create/update/delete` and conflict handling payloads



