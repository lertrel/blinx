# WIP Notes — Nested Spec v0

This file captures the current state of the nested-model rollout so future iterations can resume without re-discovering the context.

## Past (what landed in this PR)

- **Store plumbing** (Aspect 1 of the original proposal):
  - SNM normalization and diffing in `blinx.store.js` (`setField/addRecord/updateById` now persist ids only).
  - Blinx App registry (`docs/spec/blinx-app.md`) + runtime APIs (`registerBlinxApp`, `getBaseStore`) so child stores can be resolved lazily.
  - Action facade (`docs/spec/action-facade.md`) providing `ctx.model().get(...).set/patch/clear/unlink/delete` and `ctx.flush()` with SNM-aware child store patch/delete flows.
  - `blinxForm` / `blinxCollection` now inject `getRecord/model/flush/getIssues` into custom actions, so façade methods are reachable from UI actions.
  - Regression tests: `__tests__/blinx.nested.persistency.test.js`, `__tests__/blinx.nested.helpers.test.js`, `__tests__/blinx.app.test.js`.

## Present (what exists today)

- Data layer is wired for SNM:
  - Parent records hold ids; child mutations go through base stores.
  - Specs documenting the API surface: `docs/spec/nested.md`, `docs/spec/blinx-app.md`, `docs/spec/action-facade.md`.
- UI layer only exposes hooks:
  - No picker/edit journeys, inline previews, or declarative relation controls yet.
  - Custom actions can call the façade, but built-in controls still behave like pre-SNM ENM fields.

## Future (Aspect 2 — UX/Presentation backlog)

Outstanding work that should be tackled in a follow-up iteration:

- **Controls & relation modes**
  - Add `relation.mode: 'journey' | 'inline'` support in `blinxForm` / `blinxCollection` schemas.
  - Provide per-field overrides for pick/edit journeys (mutable flags, disable flags, etc.).
- **Journey UX**
  - Implement picker/edit journeys described in `docs/spec/nested.md` (modal/drawer flows, carts, by-id loaders).
  - Ensure journey resolution uses the base stores + local views we introduced (child store lookup, criteria, carts).
- **Presentation**
  - Inline previews for SNM references (label + badge rendering given id/label cache).
  - Visual affordances for unlink/delete vs. child edit (buttons, icons, confirmation flows).
- **Wiring**
  - Hook the new UI controls to the action façade so they invoke `model().get(...).patch/delete` instead of touching store internals.
  - Surface journey-specific errors through `ctx.getIssues()` and UI notifications.

## How to keep context for the next pass

1. **Spec breadcrumbs**
   - Keep updating `docs/spec/nested.md`’s “Future work” (or similar) with the bullets above, linking to `action-facade.md` and `blinx-app.md`.
2. **Issue tracking**
   - Open a follow-up issue titled “Nested Spec v0 — Aspect 2 (UX/Presentation)” and copy the Future section bullets there with links to relevant specs/tests.
3. **Action notes**
   - Reference this file (`docs/wip.md`) in the issue so future contributors know where the historical context lives.
4. **Testing pointers**
   - When implementing Aspect 2, expand the existing Jest suites (persistency + helper tests) and add UI-level tests once picker/edit journeys exist.

With these breadcrumbs (spec docs + this WIP log + a follow-up issue), the next iteration can rehydrate the context quickly and focus on shipping the presentation-layer pieces.*** End Patch
