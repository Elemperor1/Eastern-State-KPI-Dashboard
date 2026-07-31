Eastern State KPI Dashboard — Complete Codex Handoff
1. Executive Summary
Product Identity and Audience
The Eastern State KPI Dashboard is an internal strategic metrics and key performance indicator tracking application built specifically for Eastern State Penitentiary Historic Site (Philadelphia, PA). It serves site leadership, department heads, strategic planning committees, staff members, and board members by consolidating institutional performance indicators across historical site operations, visitor engagement, education, preservation, financial stability, and community impact.
Core Business Purpose
The primary purpose of the application is to operationalize Eastern State Penitentiary's multi-year Strategic Plan. It transforms static planning documents into an interactive decision-support system, enabling continuous reporting, historical year-over-year comparisons, progress tracking against multi-year strategic goals, demographic distribution reporting, and board-level presentation exports.
Current Development and Release State
Repository Location: /Users/jacobcyber/Documents/Eastern State KPI
Current Schema Version: Schema 16 (src/lib/schema-version.json). Schema 16 introduces Successor Strategic Plan lifecycle state, lineage tracking, activation readiness checks, recovery evidence, and database-enforced plan immutability.
Current Product Boundary: Defined by ADR 0022 and Issue 42. The application has exactly four top-level destinations:/dashboard/overview (Executive overview, progress scorecards, KPI drill-downs, filters)
/data-entry (Monthly/annual reporting checklist, focused observation batch forms, component entry)
/reports (Board report, strategic priority breakdowns, multi-year trend analysis, CSV/PNG/PDF export)
/setup (Six administrative sub-areas: Plans, Measures, Goals, Board, People, and Activity)

Auth & Access Boundary: 32 protected API route/method combinations (30 Admin-gated, 1 staff viewer session-gated for distribution bands, and 1 general session-gated for Board report export).
Git & Release Status: Current HEAD commit is cd561d6 (docs: record ultimate security remediation & PR #87 verification evidence). The working tree is clean with no uncommitted or staged changes. PR #87 was merged into main following full release gate verification.
What Is Working
Complete Product Flow: All four product destinations are fully implemented and functional.
Authentication & Authorization: Secure iron-session cookie management with durable per-user revocation watermarks (sessions_valid_after), password rotation rules, bootstrap account lockouts, CSRF double-submit protection, input streaming body byte limits, and login rate throttling.
Data Layer & Strategy Engine: Schema 16 SQLite database engine supporting observation recording (kpi_observations), component value entries (kpi_component_entries), demographic distribution observations (distribution_observations), target definitions, baseline-to-target calculations, annual vs. full-plan progress, and immutable strategic plan successor transitions.
Quality & CI Gate: npm run design-system:test (which runs the full quality:guards suite, Next typecheck/tsc, and production Webpack build with AUTH_DISABLED cleared) passes cleanly. Vitest test suite passes 1,699 tests across 117 test files. Playwright E2E suite passes 13/13 workflows.
Audit & Safety: Complete immutable audit history (strategic_audit_events and user_lifecycle_audit_events). Non-strategic catalog deletions are blocked by DependentEntriesError (409) if live data exists.
What Is Unfinished, Risky, or Requires Attention
Production Deployment & Environment Secrets: BOOTSTRAP_ADMIN_PASSWORD and BOOTSTRAP_VIEWER_PASSWORD must be supplied via secret management (e.g., Fly secrets) on first boot. Default randomly generated passwords lock bootstrap accounts until npm run setup:admin is executed.
Reverse Proxy Configuration: Production deployments behind proxies (e.g., Fly.io, Cloudflare) must set TRUST_PROXY=true to prevent IP rate-throttling from collapsing all client traffic onto a single unknown IP key.
Large Diff CodeRabbit Boundary: As documented in PR #87 history, large refactor diffs (>100 files) exceed external scanning tool limits and require independent chunked code review.
Codebase Maintenance: Strategic calculation and report loading rely on effective-dated targets and component configurations; edits to component definitions must follow archive/successor lifecycle workflows to avoid invalidating historical baseline calculations.
Most Important Takeaway for the Next Codex Instance
The repository is in a pristine, highly guarded, evidence-verified state. All tests and guards pass cleanly. Do not bypass existing architecture guards (npm run architecture:guard, npm run design-system:guard, npm run docstrings:guard). Always use apply_patch for edits, preserve the four-destination boundary (ADR 0022), never expose unauthenticated routes beyond GET /api/health/ready, and run npm run design-system:test to verify changes before concluding work.
2. Product Requirements and User Workflows
Primary Users and Roles
The system enforces three primary access roles (src/lib/types.ts):
Admin (admin): Complete system authority. Access to all 4 destinations, Setup administration (Plans, Measures, Goals, Board, People, Activity), catalog editing, user lifecycle management, and target configuration.
Viewer / Staff (viewer): Staff access. Can view Overview, Data Entry, Reports, and staff-level demographic distribution bands. Cannot access Setup administration or mutate system configuration.
Board (board): Board member access. Restricted view access to Overview, Reports (/reports), and strategic exports (/api/strategy/export). Excluded from Data Entry, Setup, and staff-only demographic band details.
Authentication & Authorization Expectations
Login Flow: /login path rendering a dual-column layout. Unauthenticated users accessing protected routes are redirected to /login.
Session Lifetime & Watermarking: Session cookies are stored securely via iron-session. Every request re-verifies the user against the database. If a security event occurs (password change, role change, account disablement), sessions_valid_after is updated, revoking all existing sessions issued prior to that timestamp.
Dev Bypass Mode (AUTH_DISABLED=true): Allowed only in development (NODE_ENV=development) bound strictly to loopback (127.0.0.1, ::1, localhost). Bypasses authentication by assigning identity auth-disabled@local. Forced to false in production or test modes.
Data Entry Workflow (/data-entry)
Reporting Period: Monthly or annual observations recorded against defined KPIs.
Reporting Checklist: Displays missing vs. completed observations for the active period.
Batch Submission: Multi-input submissions hit POST /api/strategy/observations as an atomic batch transaction.
Storage Types:Scalar KPIs: Store values in kpi_observations (month 1–12 for monthly KPIs; month 0 for annual KPIs).
Breakdown KPIs: Store category/segment values in distribution_observations and distribution_values.
Component Entries: Store underlying raw component observations in kpi_component_entries for calculated KPIs.

Reporting & Comparison Behavior
Reporting Year vs. Baseline Year: Progress calculations compare observation values for a specified reporting_year against a fixed baseline_year (defined per Goal/Target, e.g., 2023 baseline vs. 2026 reporting year).
Cumulative YTD Behavior: For monthly metrics, overview and report scorecards calculate cumulative sums/averages from January through the selected target month.
Direction Handling: Direction is explicitly defined (higher is good, lower is good, or neutral). Color indicators (green/red) and progress percentages adapt based on direction.
Strategic Plan Functionality (/setup/plans)
Multi-Year Plan Management: Defines Strategic Plans (e.g., 2024–2028 Strategic Plan) with active, successor, and archived lifecycle states.
Successor Plan Lifecycle (Schema 16): Allows drafting and staging successor plans, validating activation readiness, executing seamless plan transitions, and preserving historical plan immutability.
Priority & Goal Mapping: Priorities contain Goals, which map to specific KPIs, Targets, and Component configurations.
Administrative Workflows (/setup)
Plans: Create, edit, activate, and archive multi-year strategic plans.
Measures (KPIs): Define metric metadata, unit types (count, percent, currency, attendance, note, breakdown), update frequency, and assigned owners.
Goals: Configure baseline year, baseline value, target year, target value, and priority association.
People: Manage user accounts, role assignments (admin, viewer, board), password resets, and account enablement/disablement.
Activity: Read-only immutable audit trail displaying historical catalog updates, entry modifications, user lifecycle events, and system mutations.
PDF & Export Requirements
Board Report Export: Accessible from /reports or GET /api/strategy/export. Generates formatted CSV summaries, high-resolution PNG scorecards, and print-ready PDF reports.
Visual Styling: Strict adherence to site design guidelines: high contrast, brand palette (Slate, Crimson accents, Muted neutrals), printable CSS, and vector mark rendering.
3. Current Repository State
Repository Metadata
Absolute Path: /Users/jacobcyber/Documents/Eastern State KPI
Current Branch: main
HEAD Commit: cd561d6 (docs: record ultimate security remediation & PR #87 verification evidence)
Git Remotes:origin -> git@github.com:eastern-state/kpi-dashboard.git (fetch & push)

Worktrees: /Users/jacobcyber/Documents/Eastern State KPI (main worktree)
Stashes: None (git stash list is empty)
Working Tree Cleanliness
Status: Clean working tree.
Modified Files: None.
Untracked Files: None.
Staged Files: None.
Local vs. Remote Sync: Local main is up to date with origin/main. No unpushed commits.
4. Architecture
Technology Stack
Framework: Next.js 16.2.11 (App Router)
Runtime: Node.js 20+
Language: TypeScript 5.x (Strict mode enabled)
Database: SQLite 3 (via better-sqlite3 in src/lib/db.ts)
Authentication: iron-session (Encrypted stateless cookie sessions)
Styling: Tailwind CSS 3.4 + CSS Modules / globals.css + Radix UI primitives
Testing: Vitest 3.x (Unit/Integration), Playwright 1.50+ (E2E), ESLint 9.x
High-Level Component & Data Flow Diagram
 +-----------------------------------------------------------------------+
 |                            CLIENT BROWSER                             |
 |  /dashboard/overview   /data-entry       /reports           /setup    |
 +-----------------------------------------------------------------------+
                                    |
                        HTTP / HTTPS (iron-session cookie)
                                    |
 +-----------------------------------------------------------------------+
 |                         NEXT.JS 16 APP ROUTER                         |
 |                                                                       |
 |  +-----------------------+  +--------------------------------------+  |
 |  | App Pages & Shell     |  | Protected API Route Handlers         |  |
 |  | (React Server/Client) |  | (/api/strategy/*, /api/auth/*)      |  |
 |  +-----------------------+  +--------------------------------------+  |
 |              |                                 |                      |
 |              +-----------------+---------------+                      |
 |                                |                                      |
 |  +-----------------------------------------------------------------+  |
 |  | Security & Request Guard Layer                              |  |
 |  | - assertMutationRequest() [CSRF Double-Submit Token Check]     |  |
 |  | - readJsonBody() [Strict 1MiB / 16KiB Request Byte Limits]     |  |
 |  | - loginThrottleGuard() [Per-IP & Account Lockout Defenses]    |  |
 |  | - requireSession() / requireAdmin() [D8AD-CAN-003 Authz]      |  |
 |  +-----------------------------------------------------------------+  |
 |                                |                                      |
 |  +-----------------------------------------------------------------+  |
 |  | Feature Business Logic Layer                                    |  |
 |  | - src/features/strategy/   (Calculations, Progress, Reports)   |  |
 |  | - src/features/auth/       (Revocation Watermarks, Users)     |  |
 |  | - src/features/installation/ (Strategic Plan Ownership)        |  |
 |  +-----------------------------------------------------------------+  |
 |                                |                                      |
 |  +-----------------------------------------------------------------+  |
 |  | Database Access Layer (src/lib/db.ts)                         |  |
 |  | - getDb() [WAL Mode SQLite Connection, Foreign Keys Enabled]   |  |
 |  +-----------------------------------------------------------------+  |
 +-----------------------------------------------------------------------+
                                    |
                                    v
                     +-----------------------------+
                     |  SQLite Database (kpi.db)   |
                     |  - Schema 16 Persisted      |
                     |  - Strategic Tables         |
                     |  - User & Lifecycle Audit   |
                     +-----------------------------+
Key Architecture Boundaries & Rules
Server vs. Client Separation: Server components and API routes access getDb() directly. Client components must fetch from /api/strategy/* or receive props from server components. Client components must never import src/lib/db.ts (enforced by npm run architecture:guard).
No Self-API Fetching: Server-side code must call feature domain functions in src/features/* directly rather than making HTTP requests to its own /api/* routes (enforced by architecture:guard).
UI Design System Guard: Raw HTML buttons, inputs, or inline hex color styles outside src/components/ui/ are prohibited (enforced by npm run design-system:guard).
TSDoc Coverage Guard: All exported and top-level functions must have attached TSDoc commentary (enforced by npm run docstrings:guard).
5. Repository Map
Root Configuration & Control Files
package.json — Project dependencies, test scripts, design system guards, database utilities.
next.config.mjs — Next.js configuration, security headers, build-time env checks.
tailwind.config.ts — Eastern State brand design system tokens, colors, typography.
tsconfig.json — TypeScript strict compiler configuration and path aliases (@/* -> src/*).
Dockerfile & fly.toml — Containerization and Fly.io deployment specifications.
Source Code Directory (src/)
src/app/ — Next.js App Router Pages & API Endpoints:src/app/dashboard/ — Overview scorecard grid, category drill-downs, metric details.
src/app/data-entry/ — Monthly/annual observation batch reporting interface.
src/app/reports/ — Strategic Board report view, trend charts, export triggers.
src/app/setup/ — Admin management (Plans, Measures, Goals, Board, People, Activity).
src/app/login/ — Authenticated login interface.
src/app/api/auth/ — Login, logout, session state, password change routes.
src/app/api/strategy/ — Strategic observations, distributions, configurations, targets, exports.
src/app/api/users/ — User management, role updates, account enablement/disablement.
src/app/api/health/ready/ — Unauthenticated production readiness health check.

src/components/ — Shared UI & Design System Components:src/components/ui/ — Atomic design primitives (Button, Input, Select, Table, Card, Dialog, Skeleton, Badge, BrandMark).
src/components/AppShell.tsx — Core layout shell, navigation bar, user account block.
src/components/reports/ — Report views, export formatting controls.
src/components/setup/ — Plan editors, goal forms, user management tables.

src/features/ — Core Domain & Business Logic:src/features/strategy/ — Strategic plan calculations, YTD aggregations, trend analysis, export generators, successor plan lifecycle.
src/features/auth/ — Session validation, password hashing, lifecycle audit events, permission checks.
src/features/installation/ — Strategic Plan organization ownership and active plan context.
src/features/catalog/ — Metric definitions, goal mapping, strategic categories.
src/features/audit/ — Historical change tracking, activity query engine.

src/lib/ — Shared Infrastructure & Database Utilities:src/lib/db.ts — SQLite connection manager, WAL mode configuration, transaction wrappers.
src/lib/schema-version.json — Single source of truth for database schema version (16).
src/lib/session.ts — iron-session configuration and cookie encryption.
src/lib/request-guard.ts — CSRF double-submit token validation.
src/lib/request-body.ts — Streaming JSON request body byte-length limits.
src/lib/login-throttle.ts — In-memory login attempt rate limiter and lockout tracker.
src/lib/auth-flag.ts — Environment-based dev auth bypass flag evaluator.

Test & Automation Scripts (scripts/ & e2e/)
scripts/migrate.ts — Idempotent additive database schema migration runner.
scripts/seed.ts — Destructive disposable sample data generator (requires SEED_CONFIRM).
scripts/setup-admin.ts — Break-glass operator admin provisioning utility.
scripts/smoke.sh — Standalone HTTP smoke test suite for all routes and exports.
e2e/dashboard-acceptance.spec.ts — Playwright Chrome end-to-end acceptance suite.
6. Domain Model and Database
Core Database Configuration
Engine: SQLite 3 via better-sqlite3.
Database Path: Configurable via DATABASE_PATH env var (defaults to $(pwd)/data/kpi.db).
Pragmas: PRAGMA journal_mode = WAL;, PRAGMA foreign_keys = ON;, PRAGMA busy_timeout = 5000;.
Key Tables & Schema 16 Structure
meta: Schema version tracking (key = 'schema_version', value = '16').
users: System user accounts (id, email, password_hash, name, role, disabled, must_change_password, sessions_valid_after).
organizations & strategic_plans: High-level strategic plan ownership, start/end plan years, active flag, successor lineage pointers.
strategic_priorities & strategic_goals: Multi-year strategic themes, goal titles, baseline years, target years, baseline/target values.
kpis: Metric definitions (id, slug, name, unit_type, direction, frequency, category_id).
kpi_observations: Primary scalar time-series values (kpi_id, year, month, value, notes, updated_at, updated_by).
kpi_component_entries: Raw component entries used in calculated metrics (component_id, year, month, value).
distribution_observations & distribution_values: Demographic breakdown categories and multi-segment observation percentages.
user_lifecycle_audit_events: Immutable user account management audit log (creation, password reset, role changes, disablement, deletion).
strategic_audit_events: Immutable catalog and configuration change audit log.
Migration & Upgrade Guarantees
Additive Migration (npm run db:migrate): Safely upgrades existing databases from schema 9–15 to schema 16 without data loss.
Destructive Reseed (npm run db:seed): Wipes and rebuilds sample KPI metrics/observations; preserves user accounts. Requires explicit confirmation: SEED_CONFIRM=/absolute/path/to/kpi.db.
Downgrade Protection: getDb() throws immediately if the database schema version is newer than the codebase supports.
7. Authentication and Security Model
Security Protections Implemented (D8AD-CAN Findings Remediation)
D8AD-CAN-001 (Credential Secrecy): Zero plaintext passwords in logs or stdout. Seeding consumes BOOTSTRAP_ADMIN_PASSWORD from environment secrets or generates unlogged cryptographically random passwords.
D8AD-CAN-002 (Auth Bypass Boundaries): AUTH_DISABLED=true is restricted exclusively to development mode (NODE_ENV=development) on loopback binds (127.0.0.1). Build and start scripts fail if set in production.
D8AD-CAN-003 (Durable Session Revocation): Per-user sessions_valid_after timestamp invalidates all outstanding cookies upon security-sensitive mutations (password reset, role change, account disablement).
D8AD-CAN-004 (CSRF Hardening): All mutating API endpoints require same-origin headers, application/json content type, and double-submit CSRF token validation (src/lib/request-guard.ts).
D8AD-CAN-005 (Audit Trail Integrity): Immutable audit event logging (user_lifecycle_audit_events and strategic_audit_events). Non-strategic metric deletions are blocked (HTTP 409 DependentEntriesError) if live observations depend on them.
S004-C1 / S019-C2 (Request Body Byte Caps): JSON request body parser (src/lib/request-body.ts) enforces a strict 1 MiB limit on general APIs and a tight 16 KiB limit on login/credential routes to prevent DoS via memory exhaustion.
Rate Throttling & Lockout: src/lib/login-throttle.ts enforces per-IP and per-account failed attempt limits (10 failures within 5 minutes results in a 5-minute lockout).
8. Strategic Plan Functionality
Strategic Plan Model
Strategic plans group priorities, goals, KPIs, and targets across multi-year horizons (e.g., 2024–2028).
Progress calculation tracks both annual pacing (current year actual vs. current year target) and full-plan progress (current year actual vs. final multi-year plan target).
Schema 16 Successor Plan Lifecycle
Supports creating a successor plan while an existing plan is active.
Includes validation of activation readiness (all priorities must have mapped goals and targets).
Guarantees atomic transition when activating a successor plan, archiving the previous plan and preserving historical data immutability.
9. User Interface and Design System
Design System Authority (DESIGN.md & docs/design-system.md)
Design Philosophy: Clean, institutional, highly readable, inspired by historical site architecture and museum standards.
Color Tokens:Primary: Deep Slate / Iron (#1E293B, #0F172A)
Accent: Crimson / Brick (#991B1B, #7F1D1D)
Neutrals: Warm Gray, Off-white background (#F8FAFC)

Component Library (src/components/ui/): Standardized Radix-backed primitives (Button, Input, Select, Table, Card, Dialog, Skeleton, Badge, BrandMark). Direct raw HTML buttons or hardcoded inline styles are strictly prohibited by npm run design-system:guard.
10. Tests and Verification
Summary of Verification Suite
Suite / Check	Command	Verified Outcome	Scope & Coverage
Quality & Architecture Guards	npm run quality:guards	PASSED (0 errors)	Architecture boundary, design system, TSDoc docstrings, production dependencies.
Unit & Integration Tests	npm test	PASSED (1,699 / 1,699 tests)	117 test files covering auth, session revocation, strategy engine, database migrations, body caps, CSRF guards.
TypeScript Typecheck	npx tsc --noEmit	PASSED (0 errors)	Full strict type checking across all app routes and lib modules.
End-to-End Acceptance	npm run test:e2e	PASSED (13 / 13 workflows)	Playwright Chrome suite validating all 4 destinations, auth flows, exports, and offline recovery.
HTTP Smoke Test	bash ./scripts/smoke.sh	PASSED (52 / 52 checks)	Full endpoint verification on loopback production server.
CI Gate Script	npm run design-system:test	PASSED	Complete pre-PR CI check combining guards, typecheck, and production Webpack build.


11. CI/CD and Repository Rules
Continuous Integration Workflow (.github/workflows/ci.yml)
Automatically runs on pull requests and pushes to main.
Executes npm run design-system:test (CI gate).
Runs Vitest unit/integration test suite (npm test).
Runs Playwright E2E acceptance tests (npm run test:e2e).
Branch Protection & Merge Policy
Direct pushes to main should be avoided; changes land via Pull Requests.
Required status checks: quality-guards, unit-tests, e2e-tests, production-build.
PR merges require green checks across all gates.
12. GitHub Issues and Pull Requests
Key Historical PRs & Issues
PR #87 (Merged): Ultimate Security Remediation & Schema 16 Successor Plan Lifecycle. Comprehensive evidence-led bug hunt remediating D8AD-CAN security findings, implementing body limits, CSRF hardening, session revocation watermarks, and schema 16 successor plan mechanics.
PR #76 (Merged): Production readiness, privacy-safe /api/health/ready endpoint, Next.js 16 upgrade.
Issue 42 (Closed): Product boundary simplification establishing the four primary destinations (/dashboard/overview, /data-entry, /reports, /setup).
13. Work Completed So Far
Four-Destination Refactor (ADR 0022 / Issue 42): Unified UI around Overview, Data Entry, Reports, and Setup.
Security Remediation (D8AD-CAN Findings): Fixed credential logging, dev bypass boundaries, durable session revocation, CSRF hardening, and request body byte limits.
Database Architecture & Schema 16: Evolved schema from v8 legacy models to schema 16 with strategic sidecars, distribution bands, organization plan ownership, and successor plan lifecycle.
Comprehensive Test Suite & Guards: Created strict automated guards for architecture boundaries, design system tokens, TSDoc comments, and production dependencies. Achieved 1,699 passing unit tests and 13 passing E2E workflows.
14. Current Uncommitted or Unpublished Work
Working Tree Status: Clean.
Uncommitted Changes: None.
Unpushed Commits: None.
Staged Files: None.
State Assessment: The workspace is in a fully committed, pristine, verified state.
15. Known Bugs, Risks, and Technical Debt
Operational & Configuration Risks
Reverse Proxy Rate Limiting: Must set TRUST_PROXY=true when deploying behind proxies (Fly.io/Cloudflare) to ensure correct IP extraction in rate limiters.
First-Boot Password Provisioning: Operator must set BOOTSTRAP_ADMIN_PASSWORD in secrets during deployment; otherwise bootstrap accounts default to locked state requiring break-glass recovery (npm run setup:admin).
Technical Debt & Maintenance Considerations
Large Diff External Scanning Limits: Scanners (e.g., CodeRabbit) skip diffs exceeding 100 files. High-volume refactors require chunked review.
Target & Configuration Archival: In-place modifications to active target definitions invalidates historical progress. Operators must archive affected targets and issue successor configurations when calculation mechanics change.
16. Decisions and Rationale (Architectural Decision Records)
ADR 0022 (Four Destinations Boundary): Consolidated navigation into /dashboard/overview, /data-entry, /reports, and /setup. Removed legacy /admin and /dashboard/trends top-level routes.
ADR 0023 (Schema 16 Strategic Plan Successor Lifecycle): Introduced successor plan drafting, activation readiness checks, and immutable plan transitions.
ADR 0024 (Durable Session Revocation & Watermarking): Implemented database-backed sessions_valid_after timestamp validation on every request to instantly terminate active sessions upon security events.
17. Agent Operating Instructions
Required Workflow Rules for Codex
Read Instructions First: Review AGENTS.md and this handoff document before making any changes.
Preserve Product Boundaries: Never restore removed legacy routes (/admin/*, /api/entries) or create new top-level destinations outside the four defined in ADR 0022.
Use apply_patch: Perform file modifications strictly via apply_patch. Do not use shell redirection or script-based overwrites for source files.
Mandatory Guard & Verification Run: Before completing any task involving code changes, execute the full CI gate:npm run design-system:test
npm test

No Unapproved Mutations: Do not commit, push, create PRs, or modify external infrastructure without explicit user confirmation.
18. Environment Setup
Prerequisites
Node.js: v20.0.0 or higher
npm: v10.0.0 or higher
Platform: macOS, Linux, or Windows (WSL2 / PowerShell supported)
Quickstart Commands
# 1. Install dependencies
npm run install:controlled

# 2. Initialize database schema & seed sample data (Development)
DATABASE_PATH="$(pwd -P)/data/kpi.db" SEED_CONFIRM="$(pwd -P)/data/kpi.db" npm run db:seed

# 3. Start development server with loopback auth bypass
AUTH_DISABLED=true npm run dev
# App is available at http://localhost:3000
Production Environment Variables
DATABASE_PATH — Absolute path to SQLite database file.
SESSION_SECRET — Secret key for cookie encryption (minimum 32 characters).
BOOTSTRAP_ADMIN_PASSWORD — Initial password for seeded admin account.
BOOTSTRAP_VIEWER_PASSWORD — Initial password for seeded viewer account.
TRUST_PROXY — Set to true when running behind reverse proxies (Fly.io, Cloudflare).
19. Recommended Next Steps
Maintain Quality Gates: Continue enforcing npm run design-system:test on all PRs.
Deploy Prep & Secret Provisioning: Ensure production deployments set BOOTSTRAP_ADMIN_PASSWORD and TRUST_PROXY=true.
Monitor Successor Plan Usage: Validate operational workflow in Setup -> Plans as site leadership stages the next multi-year strategic plan cycle.
20. “Do Not Accidentally Break This” Checklist

Auth Bypass Isolation: Never allow AUTH_DISABLED=true in production or non-loopback environments.

Four Destinations: Do not add top-level navigation routes outside Overview, Data Entry, Reports, and Setup.

Unauthenticated Health Route: Keep GET /api/health/ready completely unauthenticated, constant, and non-disclosing.

Request Body Limits: Ensure all mutating JSON route handlers use readJsonBody() to enforce byte caps.

CSRF Protection: Ensure all mutating routes retain assertMutationRequest().

Design System Tokens: Do not introduce raw buttons, raw inputs, or inline hex colors outside src/components/ui/.

TSDoc Coverage: Maintain TSDoc commentary on all exported functions.
21. Useful Commands
# Run full CI Gate (Guards + Typecheck + Production Webpack Build)
npm run design-system:test

# Run Architecture, Design System & TSDoc Guards
npm run quality:guards

# Run Vitest Unit & Integration Test Suite
npm test

# Run Playwright End-to-End Acceptance Suite
npm run test:e2e

# Run Standalone HTTP Route Smoke Harness (Requires running server)
AUTH_DISABLED=true PORT=3290 BASE=http://127.0.0.1:3290 bash ./scripts/smoke.sh

# Migrate Existing Database to Latest Schema (Schema 16)
DATABASE_PATH="/path/to/kpi.db" npm run db:migrate

# Reset & Reseed Disposable Sample Data (Development Only)
DATABASE_PATH="$(pwd -P)/data/kpi.db" SEED_CONFIRM="$(pwd -P)/data/kpi.db" npm run db:seed
22. Evidence Index
Topic	Source File / Artifact	Evidence / Provenance	Confidence
Product Boundaries	CONTEXT.md, AGENTS.md	ADR 0022 & Issue 42 defining 4 destinations	High
Schema Version (16)	src/lib/schema-version.json	Single source of truth file specifying 16	Verified
Unit Test Passing State	npm test execution	1,699 / 1,699 tests passed across 117 files	Verified
Quality Guards Passing State	npm run quality:guards	Zero violations across architecture, design, and TSDoc guards	Verified
Security Remediation	docs/security-audit-report.md	Full documentation of D8AD-CAN findings remediation	High
Session Revocation	src/lib/session.ts, src/features/auth/session.ts	sessions_valid_after validation logic	Verified


23. Compact Context Block for a New Codex Session
Paste This Into a New Codex Session
PROJECT: Eastern State KPI Dashboard (Eastern State Penitentiary Historic Site)
PATH: /Users/jacobcyber/Documents/Eastern State KPI
FRAMEWORK: Next.js 16.2.11 App Router + SQLite3 (better-sqlite3) + iron-session
SCHEMA VERSION: 16 (src/lib/schema-version.json)
GIT STATUS: Main branch, HEAD commit cd561d6. Working tree is CLEAN. All PRs merged.

PRODUCT BOUNDARY (ADR 0022 / Issue 42):
The app has EXACTLY FOUR top-level destinations:
1. /dashboard/overview (KPI Scorecards, Filters, Category Drill-downs)
2. /data-entry (Monthly/Annual Observation Checklist & Batch Entry)
3. /reports (Strategic Board Report, Multi-year Trends, Exports)
4. /setup (Plans, Measures, Goals, Board, People, Activity)

ROLES & ACCESS:
- admin: Full access across all destinations and setup options.
- viewer: Staff access to Overview, Data Entry, Reports, and staff distribution bands.
- board: Access limited to Overview, Reports, and Board Export API. Excluded from Data Entry & Setup.

SECURITY & ARCHITECTURE HIGHLIGHTS:
- GET /api/health/ready is the ONLY unauthenticated route (returns constant {"status":"ready"}).
- Auth revocation uses database-backed sessions_valid_after timestamp on every protected request.
- CSRF double-submit token guard (assertMutationRequest) enforced on all mutations.
- Streaming JSON request body byte caps (readJsonBody): 1 MiB general, 16 KiB auth.
- Login attempt rate limiting & lockout via src/lib/login-throttle.ts.
- Development auth bypass (AUTH_DISABLED=true) is strictly allowed ONLY in development mode bound to loopback (127.0.0.1).

REQUIRED GUARDS & VERIFICATION COMMANDS:
- CI Gate: npm run design-system:test (Quality guards + Typecheck + Production Webpack Build)
- Unit Tests: npm test (1,699 tests passing across 117 test files)
- E2E Tests: npm run test:e2e (13 Playwright Chrome workflows passing)
- Architecture Guard: npm run architecture:guard (No client DB access, no self-API fetching)
- Design Guard: npm run design-system:guard (No raw buttons/inputs outside src/components/ui/)

OPERATING RULES FOR AGENTS:
1. Read AGENTS.md and CODEX_PROJECT_HANDOFF.md before editing code.
2. Maintain the four-destination boundary; never restore legacy /admin routes.
3. Make code changes using apply_patch only.
4. Run npm run design-system:test before reporting completion on code changes.
5. Do not commit, push, or deploy without explicit user confirmation.