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

Here’s a sprint-friendly breakdown for **Aspect 2 (UX / presentation)** proposal. Each iteration clusters related user stories so you can track progress in smaller, reviewable batches.

---

### Iteration 1 – Relation Controls & Hooks
- `blinxForm`/`blinxCollection` schema updates: add `relation.mode: 'inline' | 'journey'` plus per-field overrides (`pick`, `edit`, `delete` flags).
- Wire new relation config to the action façade: ensure controls call `model().get(field)` handles rather than touching stores directly.
- Surface façade errors in UI actions (`ctx.getIssues()` → toast/banner) so journey failures are visible.

### Iteration 2 – Journey Infrastructure
- Implement picker/edit “journeys” as reusable components (modal/drawer UIs) driven by the relation config.
- Build journey resolution pipeline (child store lookup via BlinxApp, local view selection, cart support for multi-select).
- Add tests around journey flows (mock child store save, verify `flush()` order, ensure carts clear).

### Iteration 3 – Presentation & Preview
- Inline SNM preview rendering: show label/badge for id fields using cached `ref.labelField`/`previewFields`.
- Embed unlink/delete controls with clear affordances (icons, confirmations) respecting ENM/SNM policies.
- Ensure collection rows reflect relationship updates instantly (e.g., remove dangling ids after child delete).

### Iteration 4 – Polish & Docs
- Expand `docs/spec/nested.md` with a “Future Work / UX semantics” section detailing the new controls, their relation to `action-facade.md`, and journey behavior.
- Update `docs/spec/ui-views.md` with examples of the new relation config and screenshots/wireframes if available.
- Add end-to-end coverage (Playwright) for a representative form + collection that exercises pick/edit/delete journeys.

Each iteration builds on the previous specs (`action-facade.md`, `blinx-app.md`, `wip.md`), so we keep momentum while delivering reviewable chunks.

---

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

