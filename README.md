***

# Model-Driven JavaScript Framework (Conceptual Summary)

***

## **Initial Goal**

Build a **model-driven, schema-aware UI framework** that:

*   Dynamically generates UI from **data model** + **view description**.
*   Supports **two-way binding** between UI and dataset.
*   Decides field rendering based on **datatype** and **preferences** (readonly, required, min/max, CSS).
*   Allows **view layout** separate from data model (grouping, visibility).
*   Integrates with modern CSS frameworks (Tailwind, Chakra UI).
*   Avoids SSR, works client-side, and is **performance-friendly**.

***

## **Core Architecture**

    Core (Headless)
     ├─ Model Engine (types, constraints, preferences)
     ├─ View Engine (layout, grouping, visibility)
     ├─ Store (two-way binding, diff, reset, commit, add/remove)
     ├─ Validation (rules, lifecycle)
     └─ Runtime (render orchestration)

    UI Adapters
     ├─ Default HTML Adapter (Tailwind-friendly)
     ├─ Chakra Adapter (React)
     ├─ Headless UI / Radix UI Adapter

***

## **Key Features Implemented**

*   **Dynamic Form Rendering** from model + view.
*   **Dynamic Table Rendering** with pagination.
*   **Two-way binding** via store.
*   **Validation** (basic, extendable).
*   **Navigation** between records (Next/Prev, direct index).
*   **Click-to-edit** from table rows.
*   **Reset & Save** with diff tracking.
*   **Create/Delete** operations for form and table.
*   **Selection in table** for bulk delete.
*   **Interceptor pattern** for all actions (Save, Reset, Next, Prev, Create, Delete):
    *   Listeners receive a `processor` object with:
        *   `state` (currentIndex, record, store)
        *   `controls` (DOM refs for buttons/status)
        *   `proceed()` method to execute default behavior.
    *   Allows pre/post custom logic without breaking defaults.

***

## **Default Components**

*   Form:
    *   Save, Reset, Next, Previous, Create, Delete buttons.
    *   Record indicator.
    *   Status message.
*   Table:
    *   Pagination controls.
    *   Create button.
    *   Delete Selected button.
    *   Status message.
    *   Selection checkboxes.

***

## **Performance Enhancements**

*   **DocumentFragment** for batch DOM updates in form and table rendering.
*   **Pagination** for tables.
*   **Diff-aware commit** (commit only if changes exist).
*   **Clear saveStatus** on record navigation.
*   **Virtualization** suggested for large datasets (future).

***

## **Extensibility**

*   **formatCell** moved to UI adapter for pluggable cell rendering.
*   Future adapters (Chakra, Radix) can override:
    *   `createField()` for custom widgets.
    *   `formatCell()` for richer table cells (badges, chips).
*   Interceptor hooks allow enterprise-specific logic without modifying core.

***

## **Event Handling**

*   Store emits events: `reset`, `add`, `remove`.
*   Form listens to:
    *   `reset` → refresh UI.
    *   `remove` → adjust index, rebuild form, clear status.
*   Table listens to store changes → refresh rows.
*   Avoid redundant refresh in `doDelete()` since `remove` event handles UI update.

***

## **Design Decisions**

*   **Centralized UI refresh** in event handlers (not in action methods).
*   **Idempotent proceed()** in interceptors (runs default only once).
*   **Default record creation** based on model field types.
*   **Status messaging** standardized for all actions.

***

## **Future Enhancements**

*   **Conditional display rules** in view.
*   **Undo/Redo stack** in store.
*   **Soft delete** (mark inactive instead of removal).
*   **Bulk create** with prefilled values.
*   **No records placeholder** in form when dataset is empty.
*   **React/Chakra adapter** for enterprise-grade UI.
*   **Virtualized table rendering** for large datasets.

***

## ✅ Why This Framework Is Robust

*   **Headless core** decoupled from UI.
*   **Interceptor pattern** for enterprise customization.
*   **Performance-conscious** (DocumentFragment, pagination).
*   **Extensible** (UI adapters, hooks).
*   **Reactive** (listens to store events for sync).

***

### ✅ Key Improvements Over Time

1.  Added **Next/Prev navigation** and record indicator.
2.  Introduced **interceptor pattern** for all actions.
3.  Added **Create/Delete** buttons for form and table.
4.  Implemented **selection** in table for bulk delete.
5.  Moved **formatCell** to adapter for extensibility.
6.  Optimized rendering with **DocumentFragment**.
7.  Enhanced **store.diff()** to detect add/remove.
8.  Handled **remove event** in form for auto-refresh.
9.  Cleared **saveStatus** on record navigation.
10. Simplified `doDelete()` to rely on event-driven refresh.

***
