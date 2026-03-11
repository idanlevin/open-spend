# Product Specification: Local-First AMEX Spending Analysis App

## 1. Product Overview

### 1.1 Working title

**Open Spend** — a front-end-only, local-first spending analysis web app for AMEX statement `.xlsx` files.

### 1.2 Product goal

Enable a user to drop in a folder of AMEX statement Excel files and immediately explore, clean, categorize, tag, and analyze spending across statements, date ranges, card members, merchants, and custom categories — entirely on-device, with no backend required.

### 1.3 Core promise

* **Private**: all data stays on the user’s Mac.
* **Fast**: runs locally in the browser or packaged desktop shell.
* **Flexible**: supports statement-level review and cross-statement analysis.
* **Correctable**: user can rename categories, tag charges, split/reclassify transactions, and maintain local rules.
* **Insightful**: provides tables, charts, trends, anomalies, merchant summaries, and budget-oriented views.

### 1.4 Primary use cases

1. Import a folder of AMEX `.xlsx` statement exports.
2. See all transactions normalized into one local dataset.
3. Filter by statement, date range, cardholder, category, merchant, amount, tags, and location.
4. Review spending in a smart table.
5. Visualize spend by category, merchant, card member, statement period, and time.
6. Correct messy or inconsistent categories.
7. Tag transactions for tax, reimbursement, travel, household, subscriptions, gifts, etc.
8. Save all edits locally and have them persist across app sessions.
9. Re-import updated or new files without losing user annotations.
10. Export cleaned data and insights.

---

## 2. Product Scope

### 2.1 In scope

* Front-end-only app
* Runs locally on macOS
* Processes `.xlsx` files from a selected folder
* Uses local persistence only
* Rich data table and analytics dashboard
* Local category and tagging management
* Local rules engine for merchant/category/tag automation
* Visual analytics and trend analysis
* Export of user-enriched data

### 2.2 Out of scope for v1

* Bank sync / Plaid / live financial institution connections
* Multi-user collaboration
* Cloud sync by default
* OCR or PDF parsing
* Mobile-first app
* Full accounting / double-entry bookkeeping
* Tax filing workflows

### 2.3 Future-friendly scope

Architecture should allow future addition of:

* Receipt attachment handling
* CSV/PDF support
* Shared profiles
* Encrypted sync via iCloud/Dropbox/Git-backed storage
* AI-assisted merchant normalization or insights generation

---

## 3. Target Users

### 3.1 Primary user

A single consumer or household power user with multiple AMEX statements who wants a better way to understand and clean spending locally.

### 3.2 Secondary users

* Small business owner using AMEX for expenses
* Family finance manager tracking multiple cardholders
* Tax/reimbursement-focused user who needs tagging and export

### 3.3 User needs

* “Show me where money went.”
* “Combine many statements into one view.”
* “Fix bad categories.”
* “Find all charges from a merchant.”
* “Tag expenses for taxes, travel, home, kids, etc.”
* “Break down spending by person/cardholder.”
* “Keep everything private and local.”

---

## 4. Product Principles

1. **Local first**: no network required for primary functionality.
2. **Transparent transformations**: parsing, normalization, and overrides are visible.
3. **Powerful by default**: advanced filtering and group-by should feel like a lightweight BI tool.
4. **Safe editing**: user changes are reversible and never overwrite original imported files.
5. **Human-friendly design**: clean, premium, data-dense without feeling cluttered.
6. **Progressive disclosure**: simple defaults, advanced controls when needed.

---

## 5. Recommended Technology Stack

### 5.1 Front-end framework

* **Next.js (App Router) with React + TypeScript**
* Rationale: leading front-end stack, strong ecosystem, component architecture, local build support, easy packaging.

### 5.2 Local desktop runtime

Preferred options:

1. **Tauri** (recommended)

   * Lightweight desktop shell for macOS
   * Good filesystem access for selecting and reading a folder
   * Can persist local files safely
2. **Electron** (acceptable alternative)

   * Easier plugin ecosystem but heavier

**Recommendation:** build as a **Tauri + React + TypeScript** desktop app.

### 5.3 UI system

* **Tailwind CSS** for layout and styling
* **shadcn/ui** for composable UI primitives
* **Lucide React** for icons
* **Framer Motion** for subtle interactions and transitions

### 5.4 Data and state

* **Zustand** for app state
* **TanStack Query** only if needed for async local workflows; optional
* **TanStack Table** for the smart transaction table
* **Dexie + IndexedDB** for structured local persistence
* Optional file-based export/import of app data snapshots as JSON

### 5.5 File parsing

* **SheetJS (xlsx)** for `.xlsx` parsing

### 5.6 Charts and visual analytics

* **Recharts** for standard charts
* Optional **visx** for advanced custom visuals

### 5.7 Forms and validation

* **React Hook Form**
* **Zod** for schemas and parsing validation

### 5.8 Testing

* **Vitest** + **React Testing Library**
* **Playwright** for end-to-end local workflows

---

## 6. Platform Architecture

### 6.1 High-level architecture

The application is fully client-side with local persistence.

**Flow:**

1. User selects folder containing `.xlsx` statement files.
2. App enumerates files locally.
3. Parser extracts statement metadata and transaction rows.
4. Normalization pipeline standardizes merchant names, amounts, dates, cardholders, and categories.
5. Raw import data is stored in local IndexedDB.
6. User-defined overrides, category mappings, tags, and rules are stored separately.
7. Derived views and aggregations are computed client-side.
8. UI renders dashboards, tables, charts, and management pages.

### 6.2 Storage model

Use **IndexedDB via Dexie** with these logical stores:

* `imports`
* `files`
* `statements`
* `transactions_raw`
* `transactions_normalized`
* `transaction_overrides`
* `categories`
* `category_aliases`
* `tags`
* `transaction_tags`
* `rules`
* `saved_views`
* `budgets`
* `app_settings`
* `audit_log`

### 6.3 Local persistence

* Persistent local app database in IndexedDB
* Optional user-triggered export/import of full local workspace as JSON backup
* Optional local filesystem sidecar config file for portability

---

## 7. Data Model

### 7.1 Core entities

#### Statement

* `statementId`
* `sourceFileId`
* `cardProductName`
* `preparedFor`
* `accountNumberMasked`
* `statementStartDate`
* `statementEndDate`
* `currency`
* `importedAt`
* `fileHash`
* `parseVersion`

#### Transaction

* `transactionId`
* `statementId`
* `transactionDate`
* `postDate` (nullable if unavailable)
* `descriptionRaw`
* `descriptionNormalized`
* `cardMember`
* `accountLastDigits`
* `amount`
* `merchantRaw`
* `merchantNormalized`
* `extendedDetails`
* `statementDescriptor`
* `address`
* `city`
* `state`
* `zip`
* `country`
* `reference`
* `amexCategoryRaw`
* `categoryIdResolved`
* `isCredit`
* `isRefund`
* `isPendingLike` (for future extensibility)
* `duplicateGroupKey`
* `sourceRowFingerprint`
* `importBatchId`

#### Category

* `categoryId`
* `name`
* `parentCategoryId` (nullable)
* `colorToken`
* `iconToken`
* `isSystem`
* `isHidden`
* `sortOrder`

#### Tag

* `tagId`
* `name`
* `colorToken`
* `description`
* `isArchived`

#### Transaction Override

* `transactionId`
* `merchantOverride`
* `categoryOverrideId`
* `notes`
* `splitDefinition` (optional JSON)
* `isExcludedFromAnalytics`
* `isReimbursable`
* `isBusiness`
* `updatedAt`

#### Rule

* `ruleId`
* `name`
* `enabled`
* `priority`
* `conditions`
* `actions`
* `applyMode` (`new-only` / `retroactive`)

### 7.2 Transaction identity strategy

Because imported files may overlap or be re-imported, transactions need stable deduplication keys.

Use a composite fingerprint based on:

* statement date range
  n- transaction date
* amount
* normalized raw description
* card member
* reference when available

Also store file hash and row hash for resilient re-import behavior.

---

## 8. File Import and Processing

### 8.1 Folder import behavior

The user selects a folder from the local filesystem. The app should:

* Recursively or non-recursively scan for `.xlsx` files depending on user setting
* Ignore unsupported files
* Show import preview and file count
* Detect already-imported files by file hash
* Allow import all / import only new / reprocess selected files

### 8.2 Parsing behavior

The parser should detect AMEX statement workbook structure and extract:

* Statement metadata block
* Header row
* Transaction rows
* Relevant columns even if order shifts slightly

It should be resilient to:

* Minor formatting changes
* Empty rows
* Merged cells in header areas
* Extra sheets or cover sheets

### 8.3 Import pipeline

1. Read workbook
2. Detect valid transaction sheet(s)
3. Parse statement metadata
4. Parse transaction rows
5. Normalize types
6. Validate rows against schema
7. Compute fingerprints
8. Merge with existing workspace
9. Run rules and category mappings
10. Save results and show summary

### 8.4 Import UX summary

Show after import:

* Files processed
* Statements found
* Transactions added
* Duplicates skipped
* Parse warnings
* New merchants discovered
* Uncategorized transactions count

### 8.5 Error handling

* Corrupted file warning
* Unsupported format warning
* Partial parse with row-level errors
* “View parse issues” panel
* Ability to retry failed files

---

## 9. Core Functional Areas

## 9.1 Workspace Home / Dashboard

Primary landing page after import.

### Goals

* Show key spending metrics at a glance
* Provide quick entry points into detailed analysis
* Surface issues needing user attention

### Components

* Top navigation bar
* Workspace selector / current local profile
* Folder import button
* Date range picker
* Statement selector
* KPI cards:

  * Total spend
  * Transaction count
  * Avg transaction size
  * Largest merchant
  * Top category
  * Refund total
  * Uncategorized count
* Spending over time chart
* Category donut / treemap
* Top merchants list
* Card member comparison chart
* Recent statement imports panel
* “Needs review” module:

  * Uncategorized transactions
  * New merchants
  * Suspected duplicates
  * Rule conflicts
* Saved views shortcuts

### Important behavior

All dashboard widgets respect current filters.

---

## 9.2 Transactions Explorer Page

This is the power-user hub.

### Goals

* Review all spending in a smart, high-density table
* Filter, sort, group, tag, edit, and bulk-update transactions

### Layout

* Left filter rail (collapsible)
* Main content area with toolbar + smart table
* Right details drawer for selected transaction

### Toolbar controls

* Search box (merchant, description, reference, note)
* Date range picker
* Statement multi-select
* Cardholder multi-select
* Category multi-select
* Tags multi-select
* Amount range filter
* Country / city filter
* Toggle chips:

  * Uncategorized only
  * Excluded only
  * Refunds only
  * Business only
  * Reimbursable only
* Group-by control
* Column chooser
* Save view
* Export current result

### Smart table capabilities

* Virtualized rows for performance
* Multi-column sorting
* Resizable and reorderable columns
* Pin columns
* Inline quick edit for category/tag/notes
* Bulk selection and bulk actions
* Group rows by:

  * Category
  * Merchant
  * Cardholder
  * Statement
  * Month
  * Country/state/city
  * Tag
* Aggregates in grouped rows:

  * sum amount
  * count
  * avg
  * min/max
* Quick subtotals for current filter
* Conditional formatting for high-dollar charges, refunds, edited rows, excluded rows

### Row click details drawer

* Full transaction details
* Original AMEX category
* Current resolved category
* Tags
* Note field
* Merchant normalization details
* Import/source info
* Related transactions from same merchant
* Rule match history
* Actions:

  * Change category
  * Add/remove tags
  * Rename merchant locally
  * Exclude/include in analytics
  * Mark reimbursable
  * Mark business/personal
  * Split transaction
  * Undo overrides

### Bulk actions

* Change category
* Add tags
* Remove tags
* Exclude/include
* Mark business/personal
* Apply merchant rename
* Create automation rule from selection

---

## 9.3 Charts & Insights Page

Focused visual analysis experience.

### Goals

* Make trends and composition easy to understand
* Allow flexible slicing by date, cardholder, category, merchant, and tags

### Chart types

* Spend over time (line/area/bar)
* Category breakdown (donut, bar, treemap)
* Merchant ranking (horizontal bar)
* Cardholder comparison (stacked bar)
* Monthly trend by category (stacked area / stacked bar)
* Heatmap of spending by weekday and hour surrogate is not available unless statement has time; skip for v1
* Geographic distribution by country/state/city
* Refunds vs charges
* Budget vs actual (if budgets enabled)
* Subscription trend view

### Controls

* Universal filter bar
* Metric switcher:

  * total amount
  * transaction count
  * average transaction value
* Time granularity:

  * weekly
  * monthly
  * per statement
* Breakdown dimension
* Compare mode
* Top N selector
* Include excluded toggle

### Insight modules

* Spending concentration: percent spent in top 5 merchants/categories
* Largest month-over-month increase
* New merchant detection
* Recurring charge candidates
* Travel spend summary
* Dining/grocery/healthcare split
* Outlier transactions

---

## 9.4 Statements Page

Statement-centric management.

### Goals

* Make each imported statement inspectable and auditable

### Components

* Statement list/grid
* Metadata cards per statement:

  * statement period
  * account number masked
  * prepared for
  * file name
  * transactions count
  * total debits
  * total credits/refunds
  * import date
* Statement detail view:

  * summary metrics
  * charts scoped to statement
  * transactions table scoped to statement
  * parse warnings
  * file provenance
  * reprocess/delete statement actions

---

## 9.5 Categories Management Page

### Goals

* Manage normalized categories cleanly
* Support user-controlled remapping from raw AMEX categories

### Features

* View all system and custom categories
* Rename category labels
* Create custom categories and subcategories
* Merge categories
* Hide unused categories
* Assign icon/color
* Map raw AMEX category strings to normalized categories
* See transaction count and spend total by category
* Bulk recategorize transactions
* Preview impact before merge/remap

### Important logic

* Original AMEX category remains preserved as source metadata
* User-facing category can differ from raw imported category
* Category renames may be display-only or actual merge depending on user action

### Suggested taxonomy model

Two-tier model:

* Parent categories: Food & Dining, Shopping, Travel, Home, Health, Family, Transportation, Business, Financial, Entertainment, Utilities, Education, Gifts, Uncategorized, Transfers/Credits
* Optional subcategories underneath

---

## 9.6 Tags Management Page

### Goals

* Add flexible metadata beyond categories

### Features

* Create/edit/archive tags
* Color-coded tags
* Tag descriptions and intended usage
* Bulk tag transactions
* Suggested tags from merchant rules
* Tag analytics filters

### Suggested starter tags

* Tax deductible
* Reimbursable
* Vacation
* Work travel
* Household
* Kids
* Medical
* Subscription
* Gift
* One-time purchase

---

## 9.7 Rules & Automations Page

### Goals

* Reduce repeated manual cleanup

### Rule conditions

* Merchant contains / equals / normalized merchant
* Raw description contains
* Amount equals / greater than / range
* Cardholder equals
* AMEX raw category equals
* Country/state/city matches
* Statement date range matches
* Existing tag exists

### Rule actions

* Set category
* Add tag(s)
* Rename merchant
* Mark business/personal
* Mark reimbursable
* Exclude from analytics
* Flag for review

### Rule UX

* Rule list with enable/disable
* Natural-language summary of rule
* Priority ordering
* “Test on sample transactions” preview
* Show affected transaction count before save
* Re-run on all history option
* Conflict resolution rules

---

## 9.8 Merchant Directory Page

### Goals

* Normalize merchant identities and understand merchant-level spend

### Features

* Merchant list with normalized names
* Raw merchant aliases under each normalized merchant
* Spend totals, transaction counts, first seen, last seen
* Merchant detail page:

  * charts
  * recent transactions
  * common categories/tags
  * locations
* Merge merchant aliases
* Rename normalized merchant
* Create merchant-specific rule

### Important logic

Examples:

* `AMAZON MARKETPLACE NA`, `AMAZON.COM AMZN.COM/BILL`, and similar variants can be grouped under `Amazon`
* Preserve raw text while providing normalized merchant identity

---

## 9.9 Budgets Page (important addition)

### Goals

* Turn historical spending analysis into active management

### Features

* Set monthly budgets by category, merchant group, or tag
* Optional separate budgets by cardholder
* Compare actual vs budget
* Forecast month-end spend based on current trajectory
* Alert list for over-budget categories

### Visuals

* Progress bars
* Budget vs actual bar chart
* Trend line

---

## 9.10 Recurring Charges Page (important addition)

### Goals

* Detect subscriptions and repeated bills

### Detection heuristics

* Similar merchant
* Similar amount or bounded variance
* Roughly monthly cadence

### Features

* Candidate recurring charges list
* Confidence score
* Mark as subscription / not subscription
* Filter active vs stale recurring charges
* Estimate monthly subscription total

---

## 9.11 Review Queue Page (important addition)

### Goals

* Central inbox for cleanup work

### Sections

* Uncategorized transactions
* New merchants
* Ambiguous merchant groups
* Suspected duplicates
* Rule conflicts
* Split transactions needing confirmation
* Large unusual transactions

### UX

* Keyboard-friendly triage flow
* Quick actions inline

---

## 9.12 Settings / Data Management Page

### Features

* Workspace/profile name
* Import preferences
* Folder rescanning preferences
* Category defaults
* Currency formatting
* Theme preference
* Export/import workspace backup
* Clear local data
* Rebuild derived indices
* View storage usage
* Version info

---

## 10. Business Logic and Functional Requirements

## 10.1 Data normalization

The app must normalize:

* Dates to a canonical ISO format
* Amounts to signed numeric values
* Merchant names to normalized identities
* Text casing and spacing
* Location fields where available
* Category assignments through mapping rules

## 10.2 Deduplication

The app must:

* Detect identical files by file hash
* Detect duplicate statements by metadata + file hash heuristics
* Detect duplicate transactions across imports
* Allow user review of suspected duplicates
* Avoid double-counting in analytics

## 10.3 User overrides precedence

Order of precedence:

1. Transaction-level manual override
2. Applied rule action
3. Merchant/category mapping
4. Imported AMEX category

## 10.4 Split transactions

Users should be able to split a transaction into multiple logical sub-transactions.

### Split capabilities

* Divide amount across two or more categories/tags
* Use fixed amount or percentage
* Preserve original raw transaction
* Derived split children drive analytics while parent is kept for audit

Example:
A Costco charge can be split into Grocery, Household, and Pharmacy.

## 10.5 Exclusions

Users can exclude transactions from analytics, budgets, or recurring detection.

Examples:

* Internal reimbursements
* Credits and statement adjustments
* Temporary personal loan repayment

## 10.6 Refund and credit handling

The app should automatically identify likely refunds or credits via:

* Negative amount
* Raw category cues
* Description heuristics

Users can choose whether refunds reduce spending totals or are shown separately.

## 10.7 Date scoping modes

Analytics should support:

* Per statement
* Custom date range
* Month/quarter/year presets
* Last N statements
* Year-to-date
* Compare two date ranges

## 10.8 Saved views

Users should be able to save combinations of:

* filters
* columns
* grouping
* sort order
* charts state

Examples:

* “Tax-deductible 2025”
* “Family dining by cardholder”
* “Subscriptions”

## 10.9 Notes and annotations

Users should be able to attach notes to transactions, merchants, and categories.

## 10.10 Search behavior

Global search should support:

* merchant names
* raw descriptions
* notes
* tags
* category names
* references

## 10.11 Export behavior

Export options:

* Current filtered transactions to CSV/XLSX
* Category summary report
* Merchant summary report
* Budget report
* Full enriched dataset JSON backup

## 10.12 Offline behavior

App should be fully usable offline after installation.

---

## 11. Information Architecture

### Top-level navigation

* Dashboard
* Transactions
* Insights
* Statements
* Merchants
* Categories
* Tags
* Rules
* Budgets
* Recurring
* Review Queue
* Settings

### Secondary navigation patterns

* Sticky filter bar on data-heavy pages
* Details drawer on the right
* Collapsible side panels

---

## 12. UX and Interaction Design

## 12.1 Design direction

A premium local analytics tool with a balance of:

* Apple-adjacent desktop polish
* Modern fintech clarity
* Data-tool density

### Visual style keywords

* calm
* precise
* premium
* trustworthy
* spacious but efficient

## 12.2 Layout system

* 12-column responsive grid for desktop
* Left sidebar navigation
* Top command bar for global actions
* Content cards with soft radius and subtle elevation
* Dense data tables with roomy detail drawers

## 12.3 Color approach

* Neutral base palette with soft grays
* One strong accent color for actions and selected state
* Semantic colors for positive/negative/warning/info
* Category colors should be stable and subdued, not neon

## 12.4 Typography

* Clean sans-serif system stack
* Strong hierarchy:

  * Page title
  * Section title
  * Metric label
  * Data body text
  * Secondary metadata text

## 12.5 UI components list

* App shell
* Sidebar nav
* Top bar
* Command palette
* Date picker
* Multi-select filters
* Smart chips
* KPI cards
* Virtualized table
* Details drawer
* Sheet/modal dialogs
* Chart cards
* Empty states
* Import wizard
* Toasts
* Badge/tag pills
* Budget progress bars
* Rule builder rows
* Diff/preview panels

## 12.6 Core interactions

* Drag-and-drop folder or “Choose folder” action
* Keyboard shortcuts for search, tagging, category assignment
* Multi-select transaction workflows
* Hover insights on charts
* Click-through from chart segment to filtered table
* Undo snackbar for destructive edits

## 12.7 Accessibility

* Full keyboard navigation
* Visible focus states
* Sufficient color contrast
* ARIA labeling for charts and controls
* Table interactions accessible without mouse

---

## 13. Page-by-Page Specification

## 13.1 Onboarding / First Run

### Purpose

Help the user get from zero to usable dataset quickly.

### Components

* App intro panel
* Privacy/local-first reassurance
* “Choose folder” button
* Optional sample-data mode
* Import checklist
* Recent workspace restore option

### States

* Empty state before import
* Import in progress
* Import success
* Import error

---

## 13.2 Dashboard

### Sections

* Header with global filters
* KPI row
* Spend-over-time chart
* Category composition card
* Top merchants card
* Cardholder comparison card
* Review queue summary
* Recent activity/imports

### Actions

* Jump to transactions
* Jump to uncategorized
* Save current dashboard view

---

## 13.3 Transactions

See section 9.2.

Additional required columns:

* Date
* Statement period
* Merchant
* Raw description
* Cardholder
* Amount
* Category
* Tags
* City/state
* Country
* Reference
* Notes
* Edited status
* Excluded status

---

## 13.4 Insights

### Recommended chart gallery

* Monthly spend trend
* Spend by category
* Merchant concentration
* Cardholder mix
* Refunds trend
* Category trend over time
* Geographic spend map/list

---

## 13.5 Statements

### Filters

* Year
* Card product
* Prepared for
* Account number suffix

---

## 13.6 Merchant detail page

### Components

* Merchant summary header
* Merchant aliases panel
* Spend trend chart
* Category distribution for merchant
* Transactions table
* Create/edit rule actions

---

## 13.7 Categories

### Components

* Category list/tree
* Raw category mapping panel
* Usage metrics
* Edit modal
* Merge preview modal

---

## 13.8 Tags

### Components

* Tag list
* Usage stats
* Tag detail transactions view

---

## 13.9 Rules

### Components

* Rule list
* Create rule drawer
* Conditions builder
* Actions builder
* Preview results table

---

## 13.10 Budgets

### Components

* Budget cards
* Budget editor
* Over-budget alerts
* Trend chart

---

## 13.11 Recurring

### Components

* Detection summary cards
* Candidates table
* Subscription detail drawer
* Ignore/confirm actions

---

## 13.12 Review Queue

### Components

* Queue tabs
* Inline triage table
* Bulk apply actions

---

## 13.13 Settings

### Components

* Storage panel
* Import behavior settings
* Data backup/restore actions
* Theme and display settings
* Reset workspace tools

---

## 14. Important Additional Features

### 14.1 Compare periods

Users should be able to compare:

* current month vs previous month
* statement vs previous statement
* custom date range A vs B

Show delta amounts and percentage change.

### 14.2 Household / cardholder attribution

Support strong cardholder analytics:

* spend share by person
* categories by person
* per-person budgeting
* merchant affinity by person

### 14.3 Merchant intelligence

Add heuristics for:

* parent merchant grouping
* online vs in-person variants
* likely travel merchants
* marketplace merchants

### 14.4 Large transaction alerts

Flag transactions above user-set thresholds.

### 14.5 Tax and reimbursement workflows

* mark reimbursable
* mark deductible
* export tagged subset
* show outstanding reimbursable total

### 14.6 Data quality diagnostics

* imported rows missing categories
* weird dates
* location parsing issues
* merchant normalization candidates

### 14.7 Workspace profiles

Support multiple local workspaces, e.g.:

* Personal
* Family
* Business card analysis

### 14.8 Backup and portability

* Export workspace snapshot
* Re-import snapshot on another Mac

---

## 15. Non-Functional Requirements

### 15.1 Performance

* Import 12–36 statement files in seconds, not minutes, on a modern Mac
* Table interactions remain smooth with 50k+ transactions
* Charts should render under 200ms for common filtered views

### 15.2 Reliability

* Raw imported data should never be mutated
* User overrides should be durable across restarts
* Re-import should not lose edits

### 15.3 Privacy and security

* No required network calls
* All financial data remains on-device
* Optional local encryption for app database in future release

### 15.4 Maintainability

* Typed domain models
* Clear separation of parsing, normalization, rules, and presentation layers
* Schema versioning and migration strategy for local DB

---

## 16. Suggested App Structure

### 16.1 Front-end module structure

* `app/` routes and layouts
* `components/` shared UI
* `features/import/`
* `features/transactions/`
* `features/insights/`
* `features/statements/`
* `features/categories/`
* `features/tags/`
* `features/rules/`
* `features/budgets/`
* `features/recurring/`
* `features/review/`
* `lib/parsing/`
* `lib/normalization/`
* `lib/storage/`
* `lib/export/`
* `lib/analytics/`
* `stores/`
* `types/`

### 16.2 Key client services

* File system service
* Workbook parser
* Statement extractor
* Transaction normalizer
* Merchant normalizer
* Rules engine
* Analytics engine
* Export service
* Persistence service

---

## 17. Analytics Logic

### 17.1 Standard metrics

* total spend
* total refunds/credits
* net spend
* transaction count
* average spend per transaction
* median transaction value
* top category by spend
* top merchant by spend
* spend concentration ratio

### 17.2 Derived insights

* monthly trend slope
* category growth/decline
* first-time merchants
* recurring candidates
* unusually large charges
* category/categoryholder anomalies

### 17.3 Budget metrics

* actual vs budget
* burn rate
* projected month-end total
* remaining budget

---

## 18. Import and Re-import Rules

### v1 requirements

* Re-importing same file should not duplicate transactions
* New files with overlapping periods should be flagged
* User overrides should reattach to matching transactions
* If parser version changes, user can optionally “rebuild normalized data” while preserving manual overrides

---

## 19. Empty States and Edge Cases

### Empty states

* No workspace yet
* No files found in selected folder
* No transactions match current filters
* No uncategorized transactions
* No recurring charges found

### Edge cases

* Statement files with slightly different header naming
* Negative charges/refunds
* Missing address/location fields
* Same merchant spelled many ways
* Extremely large imports
* Renamed categories that collide with existing categories

---

## 20. MVP Definition

### MVP must include

* Folder import of `.xlsx` files
* Parsing and normalization of AMEX statement data
* Persistent local storage
* Dashboard
* Transactions table with sort/filter/group
* Statement view
* Charts and basic insights
* Category rename/remap
* Tagging
* Transaction-level category override
* Merchant normalization
* Export filtered data
* Review queue for uncategorized/new merchants

### MVP should include if feasible

* Rules engine
* Budgeting
* Recurring charge detection
* Split transactions

---

## 21. Recommended Delivery Phases

### Phase 1: Foundation

* App shell
* Local storage
* Folder import
* Parser
* Normalized transaction model
* Statement list

### Phase 2: Analysis core

* Dashboard
* Transactions explorer
* Filters/sorting/grouping
* Insights charts

### Phase 3: Cleanup tools

* Categories page
* Tags page
* Merchant normalization
* Review queue
* Export

### Phase 4: Power features

* Rules engine
* Budgets
* Recurring detection
* Split transactions
* Compare periods

---

## 22. Acceptance Criteria Highlights

1. User can choose a local folder containing AMEX `.xlsx` files and import them successfully.
2. App extracts statement metadata and transaction rows from supported files.
3. Imported transactions persist across restarts.
4. User can filter and group transactions by date range, statement, cardholder, merchant, category, and tags.
5. User can rename categories and map raw categories to normalized categories.
6. User can tag transactions and edit categories for specific charges.
7. User can visualize spend by category, merchant, cardholder, and over time.
8. User can export cleaned transaction data.
9. Re-import does not duplicate data or lose manual edits.
10. App works offline on macOS.

---

## 23. Recommendation Summary

The strongest implementation approach is:

* **Tauri desktop shell** for native local folder access on macOS
* **React + TypeScript + Next.js** for the front-end app
* **Tailwind + shadcn/ui** for the interface
* **TanStack Table** for the spending explorer
* **SheetJS** for parsing `.xlsx`
* **Dexie/IndexedDB** for local persistence
* **Recharts** for analytics
* **Zustand** for state

This yields a modern, local-first, privacy-preserving spending analysis tool that feels like a polished desktop finance workspace rather than a basic file viewer.

---

## 24. Nice-to-Have Future Enhancements

* Receipt image attachments stored locally
* Smart merchant normalization suggestions
* Custom formula fields
* Sankey diagram for money flow by category/tag
* Goal tracking / savings implications
* Smart anomaly detection
* PDF statement support
* Dark mode and compact mode
* Keyboard command palette for power users
* Import from multiple card issuers
* End-to-end encrypted sync across Macs
