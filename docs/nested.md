# Nested Models (SNM/ENM) — Spec v0
#
# Status: Approved (design v0). Implementation may evolve, but semantics here should remain stable.
#
# Scope:
# - Persistency semantics for nested models/collections: ENM (embedded) vs SNM (self-contained)
# - Normalization rules (input/output), including diff semantics
# - Nested journeys (picker/edit) resolution and precedence
# - Beginner-friendly action facade API, including delete + cascade policy
#

## 1) Terminology

- **Parent**: the model currently rendered by a top-level UI component (e.g. `blinxForm`, `blinxCollection`).
- **Nested field**: a parent model field whose `type` is `'model'` (1-to-1) or `'collection'` (1-to-many) and has `model: ChildModel`.
- **ENM (Embedded Nested Model)**: `embedded: true` — parent owns child data; persisted by the parent service.
- **SNM (Self-contained Nested Model)**: `embedded: false` — parent owns only the relationship; child data persisted by a child service/store.

Notes:
- M2M is modeled as two 1-to-many relationships (no dedicated DSL).
- “Nested” and “child” are used interchangeably.

## 2) Store registry (fixed decision)

### 2.1 `blinxApp` is canonical for persistence wiring

- Base stores and remote views are declared in an app-level registry (referred to as `blinxApp`).
- Data models remain portable and contain no `dataSource` wiring.

### 2.2 Required invariants

- For any model used as an SNM child, `blinxApp` **must** have a base store registered for that child model; otherwise SNM journeys/actions that require a child store **must throw**.

## 3) Data model field spec (nested semantics)

### 3.1 Nested field shape

A nested field is declared by existing keywords:

- 1-to-1: `type: 'model'`
- 1-to-many: `type: 'collection'`

Both must include:

- `model: <ChildModel>`

Add new semantics:

- `embedded: boolean` (default: `true` for backwards compatibility)
- `ref?: { keyField?: string, labelField?: string, previewFields?: string[] }`
  - allowed and meaningful only when `embedded: false` (SNM)

Example (SNM-12M):

```js
products: {
  type: 'collection',
  model: ProductModel,
  embedded: false,
  ref: { keyField: 'id', labelField: 'title' }
}
```

### 3.2 Defaults

- `embedded`: defaults to `true`
- `ref.keyField`: defaults to `'id'`
- `ref.labelField`: optional
- `ref.previewFields`: optional; defaults:
  - if `labelField` exists: `[keyField, labelField]`
  - else: `[keyField]`

## 4) Normalization rules (input/output semantics)

This section defines how Blinx interprets values for nested fields, how it stores them in the parent record, how it displays them, and what it sends to persistence.

### 4.1 ENM (embedded: true)

#### 4.1.1 Canonical stored form in the parent record

- 1-to-1: `object | null`
- 1-to-many: `object[]` (empty array allowed)

#### 4.1.2 Accepted inputs (from UI/actions)

- 1-to-1: `object | null | undefined`
- 1-to-many: `object[] | null | undefined` (null/undefined normalize to `[]`)

#### 4.1.3 Persisted output (parent save payload)

- Parent payload includes embedded object(s) as-is (subject to any generic model serialization rules).

#### 4.1.4 Diff semantics

- Diff compares embedded values normally (existing store diff behavior). No SNM-specific normalization.

### 4.2 SNM (embedded: false)

SNM fields are relationship fields. Parent persists only ids.

#### 4.2.1 Canonical stored form in the parent record

- 1-to-1: `id | null`
- 1-to-many: `id[]` (empty array allowed)

Where `id` is taken from `ref.keyField` (default `'id'`).

#### 4.2.2 Accepted inputs (from UI/actions)

For SNM 1-to-1:
- `id`
- `{ [keyField]: id, [labelField]?: label, ... }`
- `{ ...fullRecordIncludingKeyField }`

For SNM 1-to-many:
- `id[]`
- `Array<{ [keyField]: id, [labelField]?: label, ... }>`
- `Array<{ ...fullRecordIncludingKeyField }>`

#### 4.2.3 Normalization to canonical stored form

When setting a SNM field value, Blinx normalizes:

- Extract id(s) using `ref.keyField`.
- **Store only id(s)** in the parent record.
- Optionally extract `{id,label}` for display cache if `labelField` exists and is provided.

If an object input does not contain `keyField`:
- **Strict mode**: throw with a clear message (missing keyField on SNM input)
- **Non-strict mode**: ignore that item (1-to-many) / set null (1-to-1) and record a warning in the action context

#### 4.2.4 Display resolution is lazy and label-first (“join”)

For SNM fields, display is a lazy join that runs only when UI needs human-readable info **and** it is not already available.

- **Preferred display source (no join needed)**:
  - If the parent service already provided `labelField` (or an equivalent label in the relationship payload), Blinx uses it directly.
  - In this case, Blinx does **not** resolve from the child store.

- **Lazy join (only when needed)**:
  1) Attempt to resolve missing labels/preview via the child store cache / working set / localView.
  2) If still missing and supported: best-effort fetch-by-ids (dedicated “byIds” view or datasource query mode).
  3) Fallback: render `#<id>`.

- **Lazy child-store resolution for patching**:
  - Blinx does not require child store resolution/loading just to render ids.
  - Child store is resolved lazily at the point an operation requires it (e.g. SNM `.patch(...)`, edit journey, or explicit “open child” action).

#### 4.2.5 Truncation of excess fields (SNM)

When SNM display receives full records from a remote service:
- Blinx may keep only a projection needed for display: `ref.previewFields` (defaults in 3.2).
- Child store may still keep richer records for its own screens. Truncation applies to:
  - what the parent stores/persists (ids only), and
  - minimal display cache (id/label), not necessarily the entire child store cache.

#### 4.2.6 Upload / persistence output (parent save payload)

- Parent payload includes **only id(s)** for SNM fields.
- Any cached labels/previews are not persisted as relationship state.

#### 4.2.7 Diff semantics for SNM

- Diff considers **only normalized id(s)**:
  - SNM 1-to-1: compare id scalars
  - SNM 1-to-many: compare arrays of ids (**order matters** by default in v0)

## 5) Nested journeys (`nestedJourneys`) and resolution

### 5.1 Purpose

Journeys define how nested interactions are performed when a nested field is rendered in `relation.mode: 'journey'`, without requiring per-field sub-routine definitions everywhere.

### 5.2 Where journeys are declared

Journeys are declared **once per child UI-view** (per model + kind + view), not per parent field.

Shape:

```js
{
  // regular ui-view schema...
  nestedJourneys: {
    pick: { view: 'picker', dataView: 'search', localView: 'auto', mutable: false },
    edit: { view: 'editDrawer', dataView: 'default', localView: 'auto', mutable: true }
  }
}
```

### 5.3 Parent field relation mode

In parent ui-view field spec:

- `relation.mode: 'inline' | 'journey'`

Defaults:
- If `fieldDef.embedded === true` (ENM): default `inline`
- If `fieldDef.embedded === false` (SNM): default `journey`

### 5.4 Parent overrides (minimal per-field knobs)

Parent field spec may override a subset of journey behavior without redefining routines:

```js
{
  field: 'product',
  relation: {
    mode: 'journey',
    pick: { mutable: false },        // e.g. disallow create inside picker
    edit: { enabled: false }         // e.g. disallow editing Product from Order
  }
}
```

### 5.5 Override precedence (highest → lowest)

When resolving how to run a journey for a nested field:

1) **Parent field override** (`fieldSpec.relation.pick/edit/...`)
2) **Child ui-view `nestedJourneys`** (for the resolved child ui-view)
3) **Blinx framework defaults** (if allowed)

Notes:
- `localView: 'auto'` derives a stable key from `(parent model id, parent view id/name, fieldKey, purpose)`.

### 5.6 Store resolution inside journeys (v0)

For journey purposes:
- `pick` and `edit` journeys resolve a store from `blinxApp` for the child model:
  - base store → `dataView` → remote view store → `localView`
- Cart store (J1 selection cart) is always an ephemeral array store and **never cached**.

## 6) Intuitive action facade (beginner-friendly) + SNM/ENM semantics

### 6.1 Goals

- Most actions should not require optional chaining.
- Same action code should work on SNM and ENM when it makes sense.
- Misuse is either:
  - collected and surfaced on `flush()` (non-strict), or
  - throws immediately (strict).

### 6.2 Entry points

In action context `ctx`:

- `ctx.getRecord()` → current parent record (snapshot)
- `ctx.model(record?)` → returns a **ModelHandle**
  - If record omitted: uses current record
  - If record is null/undefined: returns a “null handle” that safely no-ops but records issues (non-strict)
- `ctx.flush()` → applies queued changes and persists as needed (policy-driven)

### 6.3 ModelHandle methods (v0)

- `.get(fieldKey)` → **FieldHandle**
- `.set(fieldKey, value)` → convenience; same as `.get(fieldKey).set(value)`
- `.patch(fieldKey, partial)` → convenience; same as `.get(fieldKey).patch(partial)`

### 6.4 FieldHandle methods and semantics

#### 6.4.1 Common (all fields)

- `.get()` → current value (best-effort)
- `.set(value)` → sets field
- `.clear()` → sets to null (1-to-1) or [] (1-to-many)

#### 6.4.2 Nested fields (`type:'model'|'collection'`)

##### `.set(value)` semantics

- **ENM (embedded:true)**:
  - 1-to-1: sets embedded object (or null)
  - 1-to-many: sets embedded array (or [])
- **SNM (embedded:false)**:
  - 1-to-1: accepts id or record; stores **id only**
  - 1-to-many: accepts ids or records; stores **ids only**

##### `.patch(partial)` semantics (the key intuitive rule)

- **ENM**: patches embedded object(s) inside the parent record.
- **SNM**: patches the child entity/entities via child store (if edit is enabled and mutable). Relationship ids remain unchanged.
  - SNM 1-to-1: patches the referenced child entity (if id exists)
  - SNM 1-to-many: patch requires scoping (see 6.5)

If patch cannot be applied (missing id, edit disabled, child store missing):
- strict: throw
- non-strict: record issue; no-op

### 6.5 Collection helpers (for `type:'collection'`)

- `.items()` → **CollectionHandle** (never null; may be empty)

CollectionHandle:
- `.forEach(fn)` → iterates ItemHandles
- `.removeWhere(predicate)`:
  - ENM: removes embedded items from parent array
  - SNM: removes ids from relationship array (does **not** delete child entities)
- `.add(value)`:
  - ENM: pushes embedded object
  - SNM: pushes id (or record normalized to id)
- `.item(idOrIndex)` → **ItemHandle**

ItemHandle:
- `.get(fieldKey)` (best-effort)
- `.patch(partial)`:
  - ENM: patches that embedded item
  - SNM: patches the child entity by id via child store

## 6.6 Deletion and cascade (v0)

### 6.6.1 Two distinct operations

- **Unlink (relationship deletion)**: remove the relationship from the parent.
- **Delete child entity**: delete the child record from its own store/service.

These must not be conflated, especially for SNM.

### 6.6.2 Facade deletion methods

For nested 1-to-1 (`type:'model'`):
- `field.unlink()`
  - ENM: sets embedded object to `null`
  - SNM: sets id to `null` (and clears any local label cache)
- `field.delete(options?)`
  - ENM: **not allowed by default**; use `unlink()` or delete the parent record (server-defined lifecycle)
  - SNM: deletes the child entity by id via child store (if allowed), then unlinks from parent

For nested 1-to-many (`type:'collection'`):
- `field.removeWhere(predicate)` is always unlink semantics (defined in 6.5)
- `field.deleteWhere(predicate, options?)`
  - ENM: **not allowed by default**; use `removeWhere`
  - SNM: deletes matching child entities by id via child store (if allowed), then removes those ids from the relationship

Optional convenience:
- `field.item(id).delete()` (SNM 1-to-many)

### 6.6.3 Cascade policy (explicit allow/deny)

Default v0: **no cascade delete**.

Policy sources (highest → lowest):
1) Parent field spec override: `relation.delete: { allow: boolean }`
2) Child ui-view journey defaults (optional): `nestedJourneys.delete`
3) Framework default: `allow: false`

### 6.6.4 Guidance when delete is not allowed

If delete/cascade is not allowed:
- Use `unlink()` (1-to-1) or `removeWhere(...)` (1-to-many) to remove the relationship.
- If the requirement is “delete the child entity too”, developers must either:
  - enable delete in ui-view policy, or
  - implement a custom action that explicitly calls the child model store, then unlinks.

### 6.6.5 Parent record delete and embedded children

When deleting the **parent record**:
- ENM children are deleted implicitly as part of the parent payload lifecycle (server-defined).
- SNM children are **not** deleted automatically; only the relationship disappears with the parent.

## 7) Non-goals / v0 simplifications

- No parent UI support for “children of a child” directly; deeper levels are handled by stacked edit journeys.
- SNM 1-to-many `.patch(partial)` without scoping is not supported in v0 (must scope items via `.item(...)` or per-item iteration).

