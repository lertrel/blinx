# Change Log

All notable changes to this project will be documented here.

## [0.4.0] - 2025-12-25
- Expanded `DataTypes` to cover ids, email/phone/url formats, currency/percent/rating numerics, geo points, and rich/markdown text.
- Enhanced `validateField` with built-in validators (regex, URL parsing, E.164, UUID) plus sensible numeric defaults and geo bounds.
- Upgraded the default HTML adapter to render format-aware inputs (email/tel/password, currency sliders, dual lat/lng controls) and to format currency/percent/rating values in tables.
- Refreshed the sample `productModel` to showcase the new schema capabilities in both the form and table views.

## [0.3.0] - 2025-12-11
- Added formal design notes under `docs/design-notes.md` to capture architectural decisions and future bets.
- Documented change history to improve onboarding for new contributors.

## [0.2.0] - 2025-09-15
- Introduced interceptor pattern for every form and table action, enabling custom workflows without forking core logic.
- Added bulk delete selection in the table along with toolbar controls for pagination.
- Moved `formatCell` into the UI adapter so each adapter can render domain-specific widgets.
- Ensured store-driven events (`reset`, `remove`) trigger form/table refreshes to keep UI and data in sync.

## [0.1.0] - 2025-06-30
- Initial release of the model-driven UI engine with:
  - Schema-aware form rendering (sections, column spans, basic validation).
  - Table rendering with client-side pagination and row click navigation.
  - Two-way binding via the headless store, including diff/commit/reset APIs.
  - Basic status messaging and navigation controls (save, reset, next, previous, create, delete).
