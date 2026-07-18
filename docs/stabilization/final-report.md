# Pre-architecture stabilization report

Date: July 18, 2026

Repository: `Elemperor1/Eastern-State-KPI-Dashboard`

Merged baseline: `ef29cfbf2f396c061063a15fcd6f2cfbeff48922`

Stabilization branch: `codex/pre-architecture-stabilization-2026-07-17`

Pull request: [#62](https://github.com/Elemperor1/Eastern-State-KPI-Dashboard/pull/62)
(draft; do not merge)

## Executive result

The audit confirmed 13 pre-existing defects: two misleading empty-reporting
states, ten security/control defects, and one responsive E2E reliability defect.
All 13 received the smallest durable
correction and a regression that failed against the merged baseline before the
fix. No confirmed defect is deferred. Nine additional candidates were rejected
as expected behavior, enhancement, duplicate, or not reproducible. One
security candidate remains an explicitly unconfirmed deployment proof gap.

Within the tested scope, no known blocker remains for the architecture refactor.
Architecture work should begin only after this unmerged stabilization pull
request passes its live GitHub checks and is reviewed/merged through the normal
protected-branch path. This is readiness category **1: no known blocker found
in tested scope**. It is not a claim that the repository is bug-free.

## 1. Workflows tested

- Fresh bootstrap, forced credential rotation, login failure equivalence,
  logout, durable session revocation, in-flight authentication races, stale
  password changes, Viewer/Admin authorization, CSRF, and loopback-only bypass.
- The four product destinations: Overview, Data Entry, Reports, and Setup;
  supporting Priority/Measure drill-downs; direct routes; refresh/history; and
  all removed page/API boundaries.
- Measure/Goal configuration, value validation, atomic scalar/component/
  distribution writes, retries, repeated submissions, audit history,
  archive/restore, dependency-aware deletion, and persistence after reload.
- Reporting-period selection, current/prior-year comparisons, cumulative/YTD,
  percentage and ratio rules, zero denominators, missing values, negative and
  decimal inputs, Target zero, effective-year boundaries, and completion rules.
- Board Report and Trends screen truth; CSV formula safety; PNG/PDF signatures
  and dimensions; browser-print media behavior; DOM restoration after export;
  and stable report identity/provenance.
- Empty/unseeded and partial states, route-error recovery, loading/error copy,
  keyboard/focus behavior, screen-reader semantics, live regions, contrast,
  reduced motion, and responsive/zoom-equivalent widths from 320 to 1,920 px.
- Fresh database initialization, schema-9/10 migration fixtures, schema-11
  idempotency/integrity, production build, production container startup,
  private-volume persistence, credentialed smoke, and container vulnerability
  policy.

The authoritative expected behavior is in `behavior-inventory.md`; the 57-case
execution matrix is in `bug-test-matrix.json`.

## 2. Confirmed bugs found

| Candidate | Severity | Defect |
| --- | --- | --- |
| BUG-CAND-003 | Medium | Empty Overview claimed all included Goals were ready. |
| BUG-CAND-004 | Medium | Empty Board Report claimed reporting was complete. |
| BUG-CAND-005 | Low | A one-shot responsive geometry probe could fail before the long Measure row was paint-ready. |
| CAN-001 | Low | Login throttle retained unbounded attacker-controlled state and did linear cleanup. |
| CAN-002 | Medium | Identity-dependent bcrypt work exposed an active-account timing oracle. |
| CAN-004 | Medium | In-flight old-password verification could mint a post-rotation session. |
| CAN-005 | Medium | Anonymous failures could impose a victim-wide fresh-login lockout. |
| CAN-006 | Low | Leading whitespace/control characters bypassed Trends CSV formula neutralization. |
| CAN-007 | Low | OSV Docker fallback selected a mutable scanner tag. |
| CAN-008 | Low | Gitleaks Docker fallback selected a mutable scanner tag. |
| CAN-012 | Medium | One successful account login erased the shared source-IP spray budget. |
| CAN-013 | Medium | Stale self-service reauthentication could overwrite an administrator reset. |
| CAN-015 | Medium | OpenCode could execute an unreviewed `@latest` MCP registry fallback. |

Every candidate was recorded before remediation. Full reproduction, impact,
root cause, and disposition evidence is retained in `defect-ledger.json` and
`security-candidate-ledger.json`.

## 3. Bugs fixed

- Empty Overview and Board Report now distinguish zero configured Strategic
  Goals from a configured model with nothing needing attention. Calculations
  and nonempty success behavior were not changed.
- Login now performs one bcrypt comparison for every identity class, bounds
  retained throttle cardinality and cleanup work, preserves source-IP spray
  history across unrelated success, and allows a correct credential through an
  attacker-driven account counter.
- Sessions carry the exact credential/revocation version read with the verified
  hash. A concurrent rotation invalidates resumed old-password authentication.
  Self-service password changes use compare-and-swap and return 409 while
  destroying the stale session if an administrator reset wins the race.
- CSV formula detection checks the first meaningful character after any leading
  whitespace/control run.
- OSV and Gitleaks fallback images are digest-pinned. OpenCode accepts only the
  installed reviewed desktop bundle and otherwise fails closed.
- The responsive long-Measure assertion now polls for paint-ready geometry but
  retains the same existence, stacking, and non-clipping requirements.

No architecture layer, schema, product destination, or feature workflow was
introduced or redesigned.

## 4. Regression tests added

- `ExecutiveOverview.test.tsx`: empty Goals versus configured/all-ready state.
- `StrategicBoardReport.test.tsx`: empty report versus configured/complete state.
- `login-throttle.test.ts`: maximum retained identities and bounded prune batch.
- `auth.test.ts`: one bcrypt comparison for reserved, unknown, and disabled
  identities.
- Login/session tests: correct-password recovery, independent IP budget,
  credential-version issuance, and stale-version replay.
- Password/CSRF tests: compare-and-swap loss after concurrent administrator
  reset and the observable 409 contract.
- CSV tests: mixed whitespace/control formula prefixes.
- Security workflow policy tests: immutable OSV/Gitleaks images and fail-closed
  local MCP provenance.
- Responsive E2E: the first GitHub run exposed the nullable one-shot geometry
  read, the unchanged rerun passed, and the targeted retry-aware assertion
  passed locally without weakening the layout contract.

The focused security phase ended with 429 passing authentication/session tests
and 34 passing export/supply-chain tests. The complete suite ended at 80 files
and 1,201 tests.

## 5. Candidates rejected

- BUG-CAND-001 could not reproduce: all five real Priority rows reflowed without
  overlap/overflow at 390 px; the documented observation predated an existing
  responsive fix.
- BUG-CAND-002 was expected behavior: the first smoke invocation pointed its
  record selector and server at different databases. With the required shared
  `DATABASE_PATH`, the harness passed 51/51.
- CAN-003 and CAN-014 could not reproduce through their required supported
  paths.
- CAN-009, CAN-016, and CAN-018 match the documented session/password threat
  model and did not cross an authorization boundary.
- CAN-010 is a separate operator password-policy enhancement, not an existing
  enforced contract.
- CAN-017 duplicates the documented bcrypt 72-byte-prefix behavior in CAN-016.

These were not changed and no GitHub issues were created for them.

## 6. Deferred defects and issues

No confirmed bug is deferred, so this audit created no deferred-defect GitHub
issue.

CAN-011 remains **unconfirmed**: the application parses large schema-invalid
login JSON before throttle accounting, but bounded local production tests did
not demonstrate an outage and the deployed ingress/body-size boundary was not
proven. Per the goal contract, an unconfirmed suspicion is retained in the
ledger rather than promoted to a bug or GitHub issue. Its proof gap belongs to
deployment/ingress validation, not the architecture refactor.

## 7. Before-and-after validation

| Gate | Merged baseline | Stabilization result |
| --- | --- | --- |
| Unit/integration/contract | 78 files / 1,187 tests passed | 80 files / 1,201 tests passed |
| Typecheck | Passed | Passed |
| Lint/guards | Passed | Passed; embedded smoke 51/51 |
| Design-system/production build | Baseline post-merge Quality passed | Passed locally and in Docker |
| Authenticated browser acceptance | Discovery/manual paths | 11/11 workflows passed locally; unchanged GitHub rerun 11/11; retry-aware responsive regression passed |
| Reporting-cycle coverage | Existing threshold | 100% statements/lines/functions, 97.05% branches |
| Development smoke | 51/51 with matched private DB | Contract retained |
| Production-container smoke | Baseline workflow passed | 53/53 with real admin session |
| OSV | Baseline post-merge check passed | 594 packages, no issues |
| Gitleaks | Baseline post-merge check passed | 110 commits / 17.19 MB, no leaks |
| Semgrep | Baseline post-merge check passed | 13 rules / 271 targets, zero findings |
| Trivy blocking policy | Baseline post-merge check passed | Zero fixable HIGH/CRITICAL findings |
| SQLite | Existing fixtures passed | Fresh migration twice; integrity `ok`; no FK violations |
| GitHub CodeQL / Vercel | Exact baseline passed | PR #62 JavaScript/TypeScript and Python CodeQL plus Vercel preview passed on the stabilization code head |

The initial official Google Chrome run passed two workflows, then encountered a
focus timeout. The exact rerun could not launch because the application bundle
had updated while the user's older Chrome framework was still running. The
user-owned browser was not killed. The isolated Playwright Chromium reran the
focus workflow successfully and then passed the complete suite; this evidence
classifies the first failure as transient rather than a confirmed defect.

All detailed command receipts, including the Docker-visible mirror explanation
for macOS `/private/tmp` scanner mounts, are machine-readable in
`validation-evidence.json`.

## 8. Remaining known risks and uncertainty

- CAN-011 is an unconfirmed ingress/resource-bound proof gap, as described
  above.
- The full acceptance suite ran in Chromium. The repository's configured
  official Chrome channel was temporarily unavailable because of the local
  application update/process mismatch; Firefox/WebKit are not configured
  product gates.
- The product remains online-required and does not promise offline draft sync
  or versioned concurrent-edit conflict prevention; this is documented
  behavior, not a newly discovered defect.
- Local tests cannot reproduce every production proxy, Vercel, Fly volume, or
  operator-secret condition. The container used the production startup path,
  private SQLite volume, credentialed auth, and repository Trivy policy; live
  PR checks remain the final independent environment receipt.
- Security scans and 57 matrix cases reduce uncertainty but cannot prove the
  absence of undiscovered defects.

## 9. Behavioral baseline for the architecture refactor

### Supported routes

- Destinations: `/dashboard/overview`, `/data-entry`, `/reports`, `/setup`.
- Supporting pages: `/dashboard/category/[slug]`,
  `/dashboard/metric/[slug]`, `/login`, `/setup-password`.
- Protected APIs: the exhaustive 28 route/method matrix remains 26 Admin-gated
  combinations plus session-gated `GET /api/strategy/export` and
  `GET /api/strategy/distribution-bands`.
- Removed `/admin/*`, `/dashboard/trends`, and legacy mutation adapters remain
  404 boundaries.

### Critical invariants

- Strategic observations/components/distributions are the sole live reporting
  source; retained legacy rows are read-only archive evidence.
- Raw writes, lifecycle/configuration changes, and immutable audit snapshots
  commit atomically. Effective definitions and Targets preserve compatible
  coverage. SQLite foreign-key checks remain empty.
- Calculation ownership stays in `src/features/strategy/calculations.ts`.
  Missing and invalid are not zero; target zero is valid; annual pacing and
  full-plan progress remain separate; completion derives from eligible Goals.
- Security-sensitive account changes revoke existing and in-flight stale
  sessions. Viewer/Admin boundaries, CSRF, loopback bypass, secret handling,
  and scanner/tool provenance remain fixed contracts.
- Screen, CSV, PNG, PDF, and print preserve the same sanitized report truth.
  Accessibility, local table scrolling, reduced motion, and responsive reflow
  are observable contracts, not implementation details.

### E2E inventory

The 11 production-browser workflows cover forced rotation, failed atomic-save
recovery, unsaved navigation, complete multi-component forms, distributions,
four-destination/removed-route boundaries, responsive and zoom-equivalent
geometry, concise Overview truth, flat Setup plus focus return, Board/Trends/
CSV/PNG/PDF/print truth, and route-error focus/recovery.

## 10. Readiness recommendation

**Recommendation: ready for architectural change after this stabilization PR
passes live checks and is merged normally.** No known blocker or unfixed
confirmed defect remains in the tested scope. The later refactor should use the
behavior inventory, 57-case matrix, 1,201-test suite, 11 browser workflows, and
machine-readable candidate/evidence ledgers as its comparison baseline. Any
future mismatch should be evaluated against these observable contracts before
being attributed to the old architecture or accepted as intentional change.
