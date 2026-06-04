# Release Notes

Chronological summary of closed pull requests, from oldest to newest. Dates below use the PR close date; merged PRs use the same date as their merge date. Open or in-progress PRs are excluded.

## 2025-12-11

- #1 Remove render model params - Removed `model` arguments from form and table renderers, made them read model metadata from the store, and updated demo calls.
- #2 Model event bus refactor - Added `EventTypes`, standardized store notifications, emitted commit/reset events, and cleaned up the returned store API.
- #3 Merge update-store-event-notification - Merged main's store event notification changes into the update-store-event-notification branch.
- #4 Merge pull request #3 from lertrel/main - Merged the update-store-event-notification branch back with no code or file changes.
- #5 Update documentation files - Added design notes and a change log covering architecture, behavior, and version history.
- #6 Update readme with design notes - Rewrote the README to consolidate architecture, rendering flows, events, extensibility, roadmap, and design notes.
- #7 Optimize record events and updates - Added store `update`/`updateIndex`, batched remove notifications, granular reset events, cloning cleanup, and README event documentation.
- #8 Update form and table status - Made form/table renderers respond to external store events with refreshed UI/status while suppressing self-triggered refreshes.
- #9 Setup jest unit tests - Added Jest, Babel, JUnit, initial store tests, npm scripts, a CI workflow, and ignore rules for reports/dependencies.

## 2025-12-16

- #10 Jest unit test coverage - Expanded Jest coverage across store, validation, adapters, form, and table modules, adding jsdom support.
- #11 Unit test coverage report - Enabled Jest coverage reporting in CI, added coverage scripts/configuration, uploaded artifacts, and ignored coverage output.
- #12 Test click handler cleanup - Added form render cleanup/destroy support to prevent accumulated click handlers and store subscriptions on repeated renders.
- #13 RenderBlinxTable design discussion - Introduced `renderBlinxCollection` with table/cards/feed layouts and refactored `renderBlinxTable` into a compatibility wrapper with tests.
- #14 Single selection UI refresh - Fixed single-selection checkbox refresh behavior in collection rendering and added a regression test.

## 2025-12-17

- #15 Demo folder structure - Moved the demo to `demo/basic-model.html`, fixed relative asset/import paths, and updated planning references.
- #16 Playwright end-to-end integration - Added Playwright E2E tests, a demo server, configuration, npm scripts, sharded CI workflow, and reporting artifacts.
- #17 Api function renaming - Renamed core APIs/classes to shorter names, added deprecated aliases, and updated tests/demo usage.
- #18 Registered ui system redesign - Added `RegisteredUI`, removed direct `ui` plumbing, and refactored collection/form/table renderer resolution.
- #19 E2e table visibility issue - Fixed `blinxTable` integration with `RegisteredUI` after `blinxCollection` stopped accepting `ui`.
- #20 Blinx table and form ui removal - Removed `ui` from `blinxForm`/`blinxTable` and moved renderer lookup fully to `RegisteredUI`.
- #21 BlinxCollection ui param cleanup - Removed the legacy `ui` option from `blinxCollection` and added fail-fast test coverage.
- #22 Render strict mode bypass - Fixed strict-mode render-start state handling and added regression tests.
- #23 Feature/create demo and simplify common api - Merged the demo/API simplification branch into `develop/mvp1`, bringing in Playwright setup, UI registry changes, store events, collection layouts, and tests.

## 2025-12-18

- #24 Blinx data source abstraction - Added remote-capable data sources, refactored `blinxStore` for query/mutate pagination/save flows, and updated UI/tests.

## 2025-12-19

- #25 Blinx rest data source design - Added `BlinxRestDataSource` with HTTP query/mutate behavior, ETag conflict handling, temporary-ID reconciliation, and tests.

## 2025-12-20

- #26 Demo basic model structure - Moved the basic demo into `demo/basic-model/`, updated paths/docs/tests, and removed scratch notes.
- #27 Blinx store collection strategy - Added multi-view store management plus declarative `dataView`/`uiView` binding for forms and collections.

## 2025-12-21

- #28 Declarative form controls - Added declarative/auto-rendered controls, removed legacy control IDs, and updated demo/docs/tests.
- #29 Blinx ui view design - Added a model UI-view registry, nested model/collection rendering, view overrides, and expanded controls tests.

## 2025-12-22

- #30 Default view schema exploration - Added schema-generated default UI views, new data types, configuration toggles, dump support, search/sort, and tests.

## 2025-12-23

- #31 Blinx computed fields exploration - Added virtual computed fields with caching, dependency invalidation, store/UI integration, and read-only tests.

## 2025-12-24

- #32 View schema conditional display - Added `present()`/`rowPresent` attribute hooks across form, collection, and table rendering, with docs/tests.
- #33 Blinx css token exploration - Introduced scoped tokenized CSS/classes, data-part hooks, toolbar and empty-state UX updates, and demo/test updates.

## 2025-12-25

- #43 Github context implementation - Closed without merge after proposing expanded data types, schema-driven UI rendering, and validation rules.
- #44 DataModel field constraints exploration - Closed without merge after proposing richer field constraints for nullability, numbers, strings, arrays, dates, and custom validators.
- #45 Schema validation enhancements - Added validation/coercion/seeding, async validators, UI/form integration, documentation, and tests.
- #47 Validation module refactor - Split validation into type-specific modules while preserving the public facade and adding module tests.
- #77 Data type exploration and additions - Added phone format validation plus an extensible format registry exported from validation APIs.
- #78 Custom action management strategy - Introduced declarative action execution with registries/runners, validation chains, UI wiring, documentation, and tests.

## 2025-12-31

- #85 Blinx ui-view declaration support - Added renderer capability/fallback handling, registry-first UI-view resolution, removed legacy view paths, improved array uniqueness, and updated docs/tests.

## 2026-01-04

- #95 Data filtering investigation - Added cached local views, criteria/filter/sort/page APIs, collection/table integration, dynamic controls, documentation, and tests.

## 2026-01-06

- #99 Nested model persistency design - Merged nested model persistency work into develop with SNM normalization, an action facade, app registry, documentation, and tests.
- #100 feat: add nested spec v0 and SNM persist normalization - Implemented SNM id-only persistence, nested helpers, app registry, action facade, UI action context integration, documentation, and tests.
- #117 New cart collection type - Added `blinxCart`, cart styles, record controls, selection baseline/reset APIs, documentation, and tests.

## 2026-01-07

- #123 Blinx picker component design - Added `blinxPicker` built from cart/collection behavior, picker controls, add/remove behavior, create action hook, and tests.
- #124 Relation controls implementation check - Added relation mode parsing, journey relation widgets, facade-routed nested mutations, summaries/status updates, and integration tests.

## 2026-01-08

- #132 Pluggable issue notifier system - Added a central notifier plus form/collection post-action issue surfacing with fallback status handling and integration tests.
- #133 Toast notifier implementation design - Added an opt-in DOM toast notifier, toast CSS, documentation/demo registration, and tests.
