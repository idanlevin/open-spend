# Implementation Notes

## Complete in this MVP

- Local-first desktop app scaffold with Tauri + React + TypeScript + Vite.
- Folder import of AMEX `.xlsx` files using local directory picker flow.
- Workbook parsing with:
  - statement metadata extraction
  - flexible header detection
  - resilient column mapping
  - parse warning capture
- Statement + transaction normalization pipeline:
  - canonical dates and amounts
  - merchant normalization
  - category resolution
  - fingerprints for dedupe/re-import
- Deduplication and re-import safety:
  - file hash detection
  - transaction identity dedupe
- IndexedDB persistence (Dexie) with schema for:
  - imports/files/statements/raw+normalized transactions
  - overrides/categories/aliases/tags/rules/mappings/settings/audit
- Dashboard page with KPI cards, category composition, trend, top merchants, review summary.
- Transactions explorer with:
  - search/filter/sort/group
  - detail drawer edits
  - transaction-level overrides
  - tag assignment
  - bulk category action
  - CSV/XLSX export of filtered data
- Statements page with statement-scoped metrics and provenance.
- Insights page with trend/category/merchant/cardholder views and recurring candidates.
- Categories page with rename and raw-category remap.
- Tags page with create + usage metrics.
- Merchant directory page with normalization rename workflow.
- Rules page with local automation rule creation.
- Review queue page for uncategorized/new merchants/duplicates/large transactions.
- Settings page with workspace backup export and clear/reset.
- Automated tests for parser, normalization, dedupe, persistence, and UI flows.

## Partially Implemented

- Rules:
  - Core condition/action engine is functional.
  - Full preview simulation and conflict-resolution UX are simplified.
- Grouping/table:
  - Grouping/sorting/filtering supported.
  - Full virtualized rendering and advanced column reordering/pinning are not yet complete.
- Merchant normalization:
  - Strong baseline heuristics and mappings implemented.
  - Advanced parent-brand intelligence is intentionally basic.
- Review queue:
  - High-value sections implemented.
  - Some queue buckets (e.g. split-confirmation conflicts) are not yet specialized.

## Deferred

- Budgets page and budget forecasting workflows.
- Split transaction editor and split-child analytic materialization.
- Compare-periods dedicated UX.
- Full command palette and advanced keyboard workflows.
- Workspace profile switching UI.
- Import retry queue and per-file reprocess actions in dedicated workflow.
- End-to-end Playwright desktop tests (unit + component flow tests are present).

## Notes

- The app is designed to prioritize local reliability, correctness, and re-import safety.
- Core functionality runs locally with no backend dependency.
