# Blinx – Model-Driven UI Framework

## Overview

Blinx is a headless, model-driven UI framework that renders forms and tables from a shared schema. The core runtime stays agnostic of any design system and delegates DOM concerns to adapters (`lib/blinx.form.js`, `lib/blinx.table.js`, or custom renderers). This separation keeps rendering fast, predictable, and portable across Tailwind, Chakra, Headless UI, Radix UI, or any bespoke component library while reusing validation, diffing, and persistence semantics.

What ships today:

- Dynamic forms and tables generated from the combination of model metadata and view descriptions.
- Two-way binding between UI and dataset via the store.
- Field rendering driven by datatype, constraints, and view preferences (readonly, required, min/max, CSS hints).
- Layout definitions that allow form grouping to evolve independently from the data model.
- Client-side runtime with pagination, diff tracking, and interceptor hooks.

## Core Goals

1. Keep the runtime headless so any adapter can own DOM concerns.
2. Provide schema-aware rendering to avoid hand-written forms/tables.
3. Funnel every action (`save`, `reset`, `next`, `prev`, `create`, `delete`) through a shared interceptor pipeline.
4. Stay client-first and performance-conscious without leaning on SSR.

## Architecture & Data Flow

```
            Core (Headless)
             ├─ Model engine (types, constraints, preferences)
             ├─ View engine (layout, grouping, visibility)
             ├─ Store (two-way binding, diff, reset/commit/add/remove)
             ├─ Validation lifecycle
             └─ Runtime orchestrator

            UI Adapters
             ├─ Default HTML adapter (Tailwind-friendly)
             ├─ Chakra adapter (React)
             └─ Headless UI / Radix UI adapters
```

1. **Model** (`model/product.model.js`) describes fields, datatypes, constraints, and defaults.
2. **View descriptors** outline sections, column layouts, and visibility rules.
3. **Store** (`lib/blinx.store.js`) hydrates model + dataset, exposes mutation APIs, and emits granular events.
4. **UI adapters** (`lib/blinx.form.js`, `lib/blinx.table.js`, or customs) build DOM widgets using model + view metadata.

This layering keeps validation, diffing, and messaging logic reusable while adapters focus on look-and-feel.

## Store Principles

- Snapshot cloning keeps `original` and `current` arrays isolated so diffing remains cheap JSON comparisons.
- Every mutator (`setField`, `addRecord`, `removeRecords`, `update`, `updateIndex`, `commit`, `reset`) routes through `notify`, which publishes both structured paths and payloads for downstream listeners.
- `diff()` walks records index-first and only inspects keys that exist on the record, making commit payloads small and easy to surface in status messages.
- Store consumers should never mutate returned records in-place; use the provided setters to keep notifications and diffs accurate.
- `update(index, record)` replaces the record in-place and emits an `update` event with both the index and record, while `updateIndex(index)` replays the same event when the object was mutated externally and only needs to be re-announced.

## Form Rendering

- Sections render into a `DocumentFragment`, then flush to the DOM in one pass to minimize layout thrash.
- Fields delegate to the active adapter through `ui.createField(...)`, which returns `{ el, ... }` so widgets can manage their own lifecycle.
- Navigation (`Next/Prev`) is purely index-driven; the form rebinds itself whenever the selected record changes.
- Indicator and status nodes stay optional and are wired up through injected `controls`, letting integrators map them to any markup.
- Interceptors wrap every command, receiving a `processor` object with state, DOM references, and an idempotent `proceed()` so middleware chains cannot double-run defaults.

### Default Form Controls

- Save, Reset, Next, Previous, Create, Delete buttons.
- Record indicator.
- Status message region.

## Table Rendering

- Client-side pagination (default page size 20) maintains a shared `page` pointer and updates Prev/Next controls.
- Checkbox selection tracks row indexes inside a `Set`. Interceptors can read `processor.state.selected` before destructive actions.
- `ui.formatCell(value, fieldDef)` lets adapters decide how to visualize primitives (chips, currency, badges, etc.).
- The table subscribes to store events and rebuilds the visible page whenever the dataset mutates.

### Default Table Controls

- Pagination controls.
- Create button.
- Delete Selected button.
- Status message region.
- Selection checkboxes.

## Validation Lifecycle

- `validateField` encapsulates the rule set (required, enum, length, min/max, etc.).
- Form validation runs on demand inside `doSave`, short-circuiting on the first failing section.
- Failed validations push a status message and keep the user on the same record; adapters are free to paint inline errors.

### Field Constraint Coverage

The model schema now supports a larger catalog of constraints that are enforced uniformly by `validateField` and surfaced by adapters:

- **Presence & nullability** – `required`, `nullable`, plus `defaultValue` helpers that seed newly-created records through the store.
- **Numbers** – `min`, `max`, `integerOnly`, `step/stepBase`, `multipleOf`, and decimal `precision`/`scale`.
- **Strings** – `length.min/max`, `length.exact`, regex `pattern`, common `format` helpers (`email`, `url`, `uuid`, `slug`), and optional coercions (`trim`, `lowercase`, `uppercase`, `collapseWhitespace`).
- **Arrays** – `minItems`, `maxItems`, `uniqueItems`, and nested `itemType`/`items` definitions (recursively validated).
- **Dates** – `minDate`, `maxDate`, `pastOnly`, `futureOnly`.
- **Custom validators** – `validators: [fn]` receives the normalized value and can return a string or string[] of error messages.

Adapters automatically coerce values (trim, casing, etc.) before storing them, and the store applies defaults+coercions whenever records are created or mutated so invariants stay intact even for programmatic updates.

## Status & Messaging Strategy

- Save/Reset/Delete actions surface user-friendly messages through the injected `status` DOM node using semantic colors (`#2f855a` success, `#e53e3e` errors, slate for neutral states).
- Form and table share this pattern so embedding apps can style a single CSS class to affect both widgets.

## Interceptors & Events

- Store events are granular: `add`, `update`, and `reset` fire once per record, while `remove` batches all removed records into a single payload and `commit` ships the entire dataset snapshot plus the store reference for query access.
- The form listens for `reset` to rebuild UI, and for `remove` to adjust index, rebuild sections, and clear status.
- Table refreshes rows automatically on store mutations, so `doDelete()` relies on event-driven updates instead of manual DOM surgery.
- Interceptors provide hooks for analytics, confirmations, or API orchestration without touching core logic.

## Performance Considerations

- `DocumentFragment` batching reduces layout thrash across both form and table renders.
- Pagination keeps table work bounded; virtualization remains on the roadmap for larger datasets.
- Diff-aware commits skip writes when no changes exist and clear `saveStatus` on record navigation.

## Extensibility Hooks

- **Interceptors**: Pre/post logic without mutating core behavior.
- **Adapters**: Override `createField` and `formatCell` to integrate with any component library.
- **View schema**: Extend sections/columns with conditional visibility, spans, or custom renderers.
- **Store subscribe**: External listeners can sync with remote APIs, websockets, or optimistic UI flows.

## Current Capabilities

- Dynamic form rendering from model + view.
- Dynamic table rendering with pagination.
- Two-way data binding via the store.
- Click-to-edit from table rows.
- Record navigation (Next/Prev, direct index) plus record indicator.
- Reset & Save with diff tracking and messaging.
- Create/Delete operations for both form and table.
- Selection in the table for bulk delete.
- Interceptor pattern for every action with access to state, controls, and `proceed()`.
- Event-driven UI refresh so actions stay slim and predictable.

## Future Enhancements

- Conditional display rules baked into the view schema.
- Undo/Redo stack in the store.
- Soft delete flows (mark inactive instead of removal).
- Bulk create with prefilled values.
- "No records" placeholder state when the dataset is empty.
- React/Chakra adapter for enterprise-grade UI.
- Virtualized table rendering for very large datasets.

## Open Questions / Next Bets

- How should conditional visibility rules be declared so both form and table understand them?
- Can adapter-level theming tokens keep Tailwind, Chakra, and other libraries aligned?
- Should diff batching understand array moves (drag-and-drop) rather than treating them as delete+add pairs?

## Non-Goals (Current)

- Server-side rendering (SSR); focus is on client-first experiences.
- Real-time collaboration; store events remain local.
- Built-in persistence; Blinx surfaces diffs, but host applications choose how and where to store them.

## Key Improvements Over Time

1. Added Next/Prev navigation and the record indicator.
2. Introduced the interceptor pattern for all actions with idempotent `proceed()`.
3. Added Create/Delete buttons for both form and table.
4. Implemented table selection for bulk delete.
5. Moved `formatCell` into adapters for pluggable rendering.
6. Optimized rendering with `DocumentFragment`.
7. Enhanced `store.diff()` to detect add/remove events.
8. Let the form listen to `remove` events for auto-refresh.
9. Cleared `saveStatus` on record navigation.
10. Simplified `doDelete()` to rely on event-driven refresh.
