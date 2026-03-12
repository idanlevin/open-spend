# Open Spend (MVP)

Local-first AMEX statement analytics desktop app (front-end-only core flows) built with Tauri + React + TypeScript.

## Stack

- Tauri
- React + Vite + TypeScript
- Tailwind CSS + shadcn-style UI primitives
- Zustand
- Dexie + IndexedDB
- SheetJS (`xlsx`)
- TanStack Table
- Recharts
- React Hook Form + Zod
- Vitest + React Testing Library

## Setup

Prerequisites:

- Node.js 20+
- npm 10+
- Rust + Cargo (required for full desktop shell)

Install:

```bash
npm install
```

## Run Commands

Frontend dev:

```bash
npm run dev
```

Desktop dev:

```bash
npm run tauri:dev
```

## Build Commands

Frontend production build:

```bash
npm run build
```

Desktop build:

```bash
npm run tauri:build
```

## Tests

```bash
npm run test
```

## Architecture Overview

Main layers:

- `src/lib/parsing/`: AMEX workbook parser (metadata extraction + flexible column mapping)
- `src/lib/normalization/`: merchant/category/date/amount normalization + stable transaction fingerprints
- `src/lib/import/`: file import pipeline, dedupe/re-import safety, rule application, import summaries
- `src/lib/storage/`: Dexie schema, seed setup, override layering, workspace operations
- `src/lib/analytics/`: metrics, filtering, recurring heuristics
- `src/lib/export/`: CSV/XLSX export + JSON workspace backup
- `src/features/*`: page-level modules (dashboard, explorer, insights, statements, categories, tags, merchants, rules, review, settings)
- `src/stores/*`: Zustand workspace and view-filter stores

Data flow:

1. User selects local folder of `.xlsx` files.
2. Parser extracts statement metadata + transaction rows.
3. Normalizer computes canonical fields + fingerprints.
4. Dedupe checks file hash + transaction identity.
5. Raw and normalized records are stored; overrides/tags/rules are stored separately.
6. UI materializes enriched transactions for analytics and editing.

## Storage Approach

IndexedDB via Dexie stores:

- `imports`, `files`, `statements`
- `transactionsRaw`, `transactionsNormalized`
- `transactionOverrides`
- `categories`, `categoryAliases`
- `tags`, `transactionTags`
- `rules`
- `merchantMappings`
- `savedViews`, `appSettings`, `auditLog`

Storage guarantees:

- Raw imported rows are immutable/auditable.
- Manual overrides are separate and durable.
- Re-import uses stable fingerprints to prevent duplicates and keep edits attached when possible.

## Major Tradeoffs / Assumptions

- Folder import uses browser/WebView directory upload support for a zero-backend local flow.
- Rules engine supports practical import-time automation in MVP; advanced conflict tooling remains lightweight.
- Budgets and split-transaction UX are deferred to keep this MVP cohesive and reliable.
- Bundle size is currently large due charting/table/parser stack; route chunking can reduce it in a follow-up.
