# Design Notes

## Purpose
Blinx is a model-driven UI framework that renders forms and tables from a shared schema. The goal is to keep the core headless and let lightweight adapters provide the actual DOM widgets, which keeps the rendering fast, predictable, and adaptable to any design system.

## Core Data Flow
1. **Demo model** (`demo/basic-model/model/product.model.js`) defines field metadata (type, constraints, defaults).
2. **View descriptions** feed the renderer sections/columns and layout preferences.
3. **Store** (`lib/blinx.store.js`) hydrates the model + dataset, exposes mutation APIs, and emits granular events.
4. **UI adapters** (`lib/blinx.form.js`, `lib/blinx.table.js`, and adapter helpers) consume both the model and view to create actual DOM nodes.

This layering lets us swap adapters (Tailwind, Chakra, Headless UI) without rewriting validation, diffing, or persistence logic.

## Store Principles
- Snapshot cloning keeps `original` and `current` arrays isolated so diffing remains cheap JSON comparisons.
- Every mutator (`setField`, `addRecord`, `removeRecords`, `commit`, `reset`) funnels through `notify`, which publishes both structured paths and payloads for downstream listeners.
- `diff()` operates index-first and only walks keys that actually exist on the record, making commit payloads easy to serialize in status messages.
- Store consumers should never mutate returned records in-place; instead rely on the provided setters to keep notifications and diffs accurate.

## Form Rendering
- Sections are rendered into a `DocumentFragment`, then flushed into the DOM in one pass to minimize layout thrash.
- Each field delegates to the active UI adapter via `ui.createField(...)`. The adapter returns `{ el, ... }`, so custom widgets can manage their own lifecycle.
- Navigation (`Next/Prev`) is purely index-based; the form rebinds itself by re-rendering sections with the newly selected record.
- Indicator + status nodes are optional, wired up through `controls` so integrators can map them to any markup.
- Interceptor pattern wraps each command (`save`, `reset`, `create`, `delete`, `next`, `prev`). Interceptors receive a `processor` with state, DOM refs, and an idempotent `proceed()` so multiple middlewares can cooperate.

## Table Rendering
- Pagination is client-side with a default page size of 20. Prev/Next buttons update a shared `page` pointer.
- Checkbox selection is tracked in a `Set` of row indexes. Interceptors can read a copy via `processor.state.selected` before destructive actions.
- `ui.formatCell(value, fieldDef)` lets adapters decide how to visualize any primitive (chips, currency, badges, etc.).
- Table subscribes to the store and rebuilds the visible page whenever the dataset mutates.

## Validation Lifecycle
- `validateField` encapsulates the rule set (required, enum, length, etc.).
- Form validation runs on demand inside `doSave`, short-circuiting on the first failing section.
- Failed validations push a status message and keep the user on the same record; adapters are free to decorate fields with inline messages.

## Status + Messaging Strategy
- Save/Reset/Delete actions surface user-friendly messages via the injected `status` DOM node using semantic colors (`#2f855a` for success, `#e53e3e` for errors, slate for neutral states).
- Table + form share this pattern so embedding apps can style a single CSS class to affect both widgets.

## Extensibility Hooks
- **Interceptors**: Extensible pre/post logic without mutating core behavior; ideal for analytics, confirmation dialogs, or API orchestration.
- **Adapters**: Override `createField` and `formatCell` to integrate with any component library.
- **View schema**: Sections/columns can be expanded with conditional visibility, spans, custom renderers.
- **Store subscribe**: External listeners can sync with remote APIs, websockets, or optimistic UI flows.

## Remote data layer (client-server)

In “remote mode”, the store delegates reads and writes to a `BlinxDataSource` implementation:

- **`query(querySpec)`** returns `{ entities, result, pageInfo }`
  - `entities` is a normalized entity bag (`{ [entityType]: record[] }`).
  - `result` is an array of `{ type, id }` references that describe which entities are in the page.
  - `pageInfo` carries pagination metadata (`totalCount` and optional cursor info).

- **`mutate(ops)`** returns `{ applied, rejected, conflicts, entities }`
  - `applied[]` acknowledges which opIds were successfully persisted (and may include `serverId` for creates).
  - `rejected[]` is for definitive failures (validation, not-found, permissions).
  - `conflicts[]` is for optimistic concurrency failures.
  - `entities` may return canonical server records (new version, computed fields, etc.).

### Optimistic concurrency: `baseVersion` as an opaque token

The store uses `versionField` from the last committed snapshot as `baseVersion` for update/delete ops.

REST implementations should treat `baseVersion` as opaque and map it to standard HTTP concurrency:

- Server returns `ETag` on reads and successful writes.
- Client sends `If-Match: <etag>` on update/delete.
- Server returns `409/412` on stale writes; clients fetch latest and surface `{ server, local, latestVersion }` for resolution.

## Non-Goals (for now)
- Server-side rendering (SSR) — current focus is client-first experiences.
- Real-time collaboration — store emits events locally only.
- Persistence — we surface diffs, but the host application decides how to store them.

## Open Questions / Next Bets
- How should conditional visibility rules be authored so both form and table understand them?
- Can we add adapter-level theming tokens so Tailwind/Chakra share the same semantic names?
- Should diff batching be aware of array moves (drag-and-drop reordering) rather than treating them as delete+add pairs?
