# Full Codex Security Candidate Report: Eastern State KPI

This report expands the completed Codex Security dashboard result from 4 reportable findings into the full set of 8 canonical candidates discovered during deep scan validation. It includes reportable, suppressed, and deferred candidates, so the discovery-to-validation story is preserved in one file.

## Scan Metadata

| Field | Value |
| --- | --- |
| Scan ID |  |
| Mode | deep_repository |
| Target | Eastern State KPI |
| Target path | /Users/jacobcyber/Documents/Eastern State KPI |
| Revision | ea7263d5c5d908a88398ee4ce0217337e429ad5e |
| Final dashboard findings | 4 |
| Canonical candidates | 8 |
| Coverage completeness | partial |
| Report generated from artifacts | /private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01 |

## Executive Summary

| Count | Meaning |
| --- | --- |
| 8 | Canonical candidates discovered and deduplicated. |
| 4 | Reportable findings after validation and attack-path analysis. |
| 3 | Suppressed/ignored after validation: production auth bypass guard, entries year-filter DoS, breakdowns year-filter DoS. |
| 1 | Deferred follow-up: admin mutation CSRF/browser same-site proof gap. |

## Candidate Outcome Matrix

| Candidate | Title | Validation | Survives | Attack-path decision | Severity | Priority | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D8AD-CAN-001 | Fresh bootstrap passwords are printed to runtime logs until rotation | reportable | yes | reportable | medium | P2 | medium-high |
| D8AD-CAN-002 | Development auth bypass grants anonymous admin when a dev server is reachable | suppressed | no | ignore | ignore |  | high |
| D8AD-CAN-003 | Deleted or reset users retain access through stale stateless session cookies | reportable | yes | reportable | medium | P2 | medium-high |
| D8AD-CAN-004 | Cookie-authenticated admin JSON mutation routes lack CSRF, Origin, and content-type gates | deferred | uncertain | deferred | unknown |  | low-medium |
| D8AD-CAN-005 | KPI/category deletion can hide durable edit-history rows from the admin history endpoint | reportable | yes | reportable | low | P3 | high behavior / medium security |
| D8AD-CAN-006 | GET /api/entries accepts unbounded repeated year filters into a dynamic SQL IN list | suppressed | no | ignore | ignore |  | medium |
| D8AD-CAN-007 | GET /api/breakdowns accepts unbounded repeated year filters into a dynamic SQL IN list | suppressed | no | ignore | ignore |  | medium |
| D8AD-CAN-008 | Smoke harness embeds a live HTTP response inside bash -c | reportable | yes | reportable | medium | P2 | high behavior / medium surface |

## Discovery Closure

# Discovery Terminal State

- State: saturated
- Final completed round: round-03
- Canonical candidates: 8
- Reason: full six-worker round completed with zero new canonical clusters.

# Canonical Candidate Inventory

- D8AD-CAN-001: Fresh bootstrap passwords are printed to runtime logs until rotation
- D8AD-CAN-002: Development auth bypass grants anonymous admin when a dev server is reachable
- D8AD-CAN-003: Deleted or reset users retain access through stale stateless session cookies
- D8AD-CAN-004: Cookie-authenticated admin JSON mutation routes lack CSRF, Origin, and content-type gates
- D8AD-CAN-005: KPI/category deletion can hide durable edit-history rows from the admin history endpoint
- D8AD-CAN-006: GET /api/entries accepts unbounded repeated year filters into a dynamic SQL IN list
- D8AD-CAN-007: GET /api/breakdowns accepts unbounded repeated year filters into a dynamic SQL IN list
- D8AD-CAN-008: Smoke harness embeds a live HTTP response inside bash -c

Terminal discovery state after round 3: saturated (zero new canonical clusters).

## Coverage And Open Questions

Coverage completeness: `partial`.

Deferred items:

- `D8AD-CAN-004`: Browser-level CSRF reproduction and same-site attacker-origin evidence were not available; route-layer missing controls remain a follow-up item. Paths: src/app/api/users/route.ts, src/app/api/entries/route.ts, src/app/api/breakdowns/route.ts, src/app/api/kpis/route.ts, src/app/api/categories/route.ts

Open questions:

- Can a same-site or otherwise cookie-sending attacker origin exist in the deployed environment for admin mutation CSRF? Follow-up prompt: Using target revision ea7263d5c5d908a88398ee4ce0217337e429ad5e, reproduce browser cookie behavior for src/app/api/users/route.ts and sibling admin mutation routes with SameSite=Lax cookies from an attacker-controlled same-site origin.
- Who can read first-run Fly/process logs before seeded account rotation? Follow-up prompt: For the Eastern State KPI Fly deployment at revision ea7263d5c5d908a88398ee4ce0217337e429ad5e, verify log-reader roles and rotation timing for first-run seed credentials printed by src/lib/auth.ts:253-260.

## Central Validation Summary

# Validation Summary

Centralized validation ran after discovery saturation. Runtime checks used disposable databases and artifact-local files; repository files remained unchanged.

| Candidate | Disposition | Survives | Method | Counterevidence / proof gap |
| --- | --- | --- | --- | --- |
| D8AD-CAN-001 | reportable | yes | disposable runtime reproduction plus static trace | Passwords are random, not committed, printed only when the fresh/named-seed branch runs, and docs expect operator rotation. The surviving risk depends on startup logs being readable by someone below intended app-admin trust before rotation. Proof gap: Need deployment log access policy and rotation SLA for exact severity. |
| D8AD-CAN-002 | suppressed | no | targeted module import under production/test/development envs | A reachable development server with AUTH_DISABLED=true would still grant anonymous admin, but the repository production/test paths reproduced fail-closed and no repo-supported deployment exposes `next dev`. Proof gap: Only an out-of-policy exposed dev server would make this a live vulnerability. |
| D8AD-CAN-003 | reportable | yes | static source/control/sink assessment | Cookie integrity depends on `SESSION_SECRET`, so attackers cannot forge arbitrary sessions. The issue is revocation after a legitimate cookie is issued, not forgery. Proof gap: A full Next.js cookie replay PoC was not built because static code directly establishes the stateless revocation gap; dynamic replay would improve confidence but is not needed to preserve the finding. |
| D8AD-CAN-004 | deferred | uncertain | static source/control/sink assessment with browser-precondition proof gap | No repository evidence shows a user-controlled same-site sibling origin or stored HTML surface that can issue same-site admin requests. SameSite=Lax likely blocks ordinary unrelated-site POST/fetch cookie inclusion, and zod schemas constrain bodies. Proof gap: Needs browser-level reproduction in the deployed cookie/origin model or evidence of a same-site hostile origin before reportability can be decided strongly. |
| D8AD-CAN-005 | reportable | yes | disposable runtime reproduction plus static trace | The actor must be admin or able to induce/admin-compromise an admin action; this is audit visibility/integrity impact, not direct unauthenticated data access. Proof gap: Need product policy on whether admins are expected to be able to remove metadata while retaining visible history; behavior is confirmed. |
| D8AD-CAN-006 | suppressed | no | disposable repository runtime stress check plus static trace | Values are parameter-bound, the route requires an authenticated session, 40k parameters did not trigger a practical failure, and no severe availability impact was demonstrated. Proof gap: A much larger request might consume CPU/memory, but no material DoS was shown within bounded validation. |
| D8AD-CAN-007 | suppressed | no | disposable repository runtime stress check plus static trace | Values are parameter-bound, the route requires an authenticated session, 40k parameters did not trigger a practical failure, and no severe availability impact was demonstrated. Proof gap: A much larger request might consume CPU/memory, but no material DoS was shown within bounded validation. |
| D8AD-CAN-008 | reportable | yes | isolated reproduction of exact bash -c interpolation pattern | This is developer/CI tooling, not a production web route. Exploitation requires a developer or CI smoke run against a malicious/compromised `BASE` response. Proof gap: Full end-to-end smoke-run PoC against a local fake app was not necessary after exact shell interpolation reproduced command execution, but would further demonstrate script-level reach. |

## Closure Rows

| ledger row id | instance key | root-control file:line | entrypoint/source | sink/control | disposition | counterevidence or proof gap | survives |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D8AD-CAN-001-central-validation | credential-log-exposure:src/lib/auth.ts:253 | src/lib/auth.ts:253-260 | scripts/start-production.sh:6 -> scripts/ensure-seeded.mjs:67-71 | stdout process logs | reportable | Need deployment log access policy and rotation SLA for exact severity. | yes |
| D8AD-CAN-002-central-validation | auth-bypass:src/lib/session.ts:63 | src/lib/auth-flag.ts:28-39 | development server with AUTH_DISABLED=true | src/lib/session.ts:63-91 bypass session | suppressed | Only an out-of-policy exposed dev server would make this a live vulnerability. | no |
| D8AD-CAN-003-central-validation | authz/session-revalidation/stale-iron-session-user-after-delete-or-password-reset | src/lib/session.ts:76-91 | previously issued authenticated session cookie | admin routes after delete/reset | reportable | A full Next.js cookie replay PoC was not built because static code directly establishes the stateless revocation gap; dynamic replay would improve confidence but is not needed to preserve the finding. | yes |
| D8AD-CAN-004-central-validation | csrf-json-admin-mutations:src/app/api/users/route.ts:28 | src/app/api/users/route.ts:22-34 and sibling admin mutation routes | browser request with victim admin cookie under same-site/cookie-sending precondition | admin state changes | deferred | Needs browser-level reproduction in the deployed cookie/origin model or evidence of a same-site hostile origin before reportability can be decided strongly. | uncertain |
| D8AD-CAN-005-central-validation | audit-history-integrity:src/lib/repository.ts:769 | src/lib/repository.ts:763-777 | admin deletes KPI/category metadata after entry changes | /api/entries/history listEntryHistory join result | reportable | Need product policy on whether admins are expected to be able to remove metadata while retaining visible history; behavior is confirmed. | yes |
| D8AD-CAN-006-central-validation | dos-sql-placeholder:src/app/api/entries/route.ts:22 | src/lib/repository.ts:388-401 | authenticated repeated year query parameters on /api/entries | dynamic SQL placeholder list | suppressed | A much larger request might consume CPU/memory, but no material DoS was shown within bounded validation. | no |
| D8AD-CAN-007-central-validation | dos-sql-placeholder:src/app/api/breakdowns/route.ts:22 | src/lib/repository.ts:601-614 | authenticated repeated year query parameters on /api/breakdowns | dynamic SQL placeholder list | suppressed | A much larger request might consume CPU/memory, but no material DoS was shown within bounded validation. | no |
| D8AD-CAN-008-central-validation | command-injection:scripts/smoke.sh:104 | scripts/smoke.sh:102-104 | live HTTP response from BASE/dashboard/overview | bash -c command string | reportable | Full end-to-end smoke-run PoC against a local fake app was not necessary after exact shell interpolation reproduced command execution, but would further demonstrate script-level reach. | yes |

## Central Attack-Path Summary

# Attack Path Analysis Report

Centralized attack-path analysis consumed `artifacts/01_context/threat_model.md` and the validation closure rows.

| Candidate | Decision | Severity | Priority | Confidence |
| --- | --- | --- | --- | --- |
| D8AD-CAN-001 | reportable | medium | P2 | medium-high |
| D8AD-CAN-002 | ignore | ignore |  | high |
| D8AD-CAN-003 | reportable | medium | P2 | medium-high |
| D8AD-CAN-004 | deferred | unknown |  | low-medium |
| D8AD-CAN-005 | reportable | low | P3 | high behavior / medium security |
| D8AD-CAN-006 | ignore | ignore |  | medium |
| D8AD-CAN-007 | ignore | ignore |  | medium |
| D8AD-CAN-008 | reportable | medium | P2 | high behavior / medium surface |

## Candidate Details

---

## D8AD-CAN-001: Fresh bootstrap passwords are printed to runtime logs until rotation

| Field | Value |
| --- | --- |
| Validation disposition | reportable |
| Survives validation | yes |
| Validation method | disposable runtime reproduction plus static trace |
| Attack-path decision | reportable |
| Attack-path severity | medium |
| Priority | P2 |
| Attack-path confidence | medium-high |
| Rule ID | credential-log-exposure |
| Instance key | credential-log-exposure:src/lib/auth.ts:253 |
| Taxonomy | {"cwe":["CWE-532","CWE-798"]} |
| Coverage surface | auth-seed-credentials (reported) |

Coverage notes: Fresh seed passwords are printed to stdout; reported as D8AD-CAN-001.

### Discovery Candidate Record

Attacker-controlled source: Fresh database or schema-mismatch seeding in production or deployment bootstrap, with attacker or insider access to application stdout/log aggregation before operator rotation.

Vulnerable sink or broken control: Passwords are random and not stored in source, but the repo prints live bootstrap passwords to stdout and relies on operators to read and rotate them; there is no repository-enforced out-of-band delivery, forced first-login rotation, or log redaction.

Impact: A log reader can recover the seeded admin password and authenticate to mutate KPI data, users, and audit-affecting records until rotation. Log retention can extend the exposure window.

Why plausible: Nine worker candidates across three completed discovery rounds found the same source-to-log-sink path through ensureSeedAdmin and production startup. The candidates differ only in framing and deployment context; one remediation that avoids logging live bootstrap secrets or forces immediate rotation would address all upstream instances.

Closest apparent control: Passwords are random and not stored in source, but the repo prints live bootstrap passwords to stdout and relies on operators to read and rotate them; there is no repository-enforced out-of-band delivery, forced first-login rotation, or log redaction.

Validation plan from discovery: Validate current seed behavior under NODE_ENV=production and fresh DATABASE_PATH, confirm whether stdout includes usable credentials, and confirm any operational controls that narrow log access or force rotation.

### Affected Locations

| Label | Path | Lines | Detail |
| --- | --- | --- | --- |
| secret_generation | src/lib/auth.ts | 196-198 | Random per-install passwords are generated for seeded accounts. |
| log_sink | src/lib/auth.ts | 232-260 | Fresh bootstrap passwords are emitted to stdout outside tests. |
| production_seed_entrypoint | scripts/start-production.sh | 4-7 | Production startup runs seeding before next start. |
| seed_wrapper | scripts/ensure-seeded.mjs | 61-75 | Seed command inherits process output during production startup. |
| seed_data_trigger | scripts/seed.ts | 503-510, 605-610 | Seed path creates named accounts when needed. |
| deployment_context | Dockerfile | 14-22 | Container startup path uses the production start script. |
| deployment_context | fly.toml | 7-17 | Fly deployment runs the production server with mounted SQLite data. |

### Upstream Worker Candidates

| Round | Worker | Source candidate | Title |
| --- | --- | --- | --- |
| round-01-retry-02 | worker-01 | ESKPI-D8-W01-C001 | First-run seed passwords are printed to runtime logs and remain valid until manual rotation |
| round-01-retry-02 | worker-04 | ESKPI-W04-CAN-003 | Fresh production seeding writes live bootstrap passwords to application stdout |
| round-01-retry-02 | worker-05 | d8adcf5f-w05-c002 | Fresh database seed credentials are printed to server stdout until operators rotate them |
| round-01-retry-02 | worker-06 | D8AD-W06-002 | Fresh seeded admin passwords are printed to production stdout during automatic DB seeding |
| round-02 | worker-02 | r02w02-c001 | First-run seed account passwords are written to production stdout before operators can rotate them |
| round-02 | worker-03 | ESKPI-R02W03-C01 | First-run seeded account passwords are emitted to production stdout when bootstrap seeding creates users |
| round-02 | worker-04 | D8-R02-W04-CAN-002 | First-run seeded account passwords are emitted to process stdout during production seeding |
| round-03 | worker-01 | R03W01-CAND-001 | First-run seeded account passwords are written to startup stdout |
| round-03 | worker-04 | ESKPI-R03-W04-CAND-001 | First-run seed admin password is written to process stdout |

### Validation Report

# Validation Report: D8AD-CAN-001 - Fresh bootstrap passwords are printed to runtime logs until rotation

Candidate id: D8AD-CAN-001
Instance key: credential-log-exposure:src/lib/auth.ts:253
Disposition: reportable
Survives validation: yes
Confidence: high behavior / medium impact
Validation method: disposable runtime reproduction plus static trace

## Rubric

- [x] Claimed attacker input or trigger identified.
- [x] Closest control and sink identified with repository file/line evidence.
- [x] Existing controls and counterevidence considered.
- [x] Bounded runtime or static validation method chosen proportionately.
- [x] Candidate receives an explicit closure disposition and ledger receipt.

## Evidence Observed

- Disposable `DATABASE_PATH` seed under `NODE_ENV=production` exited 0 and printed first-run named account lines to stdout; passwords were redacted before saving artifact evidence.
- Static trace shows Docker/Fly production startup runs `scripts/start-production.sh`, which invokes `scripts/ensure-seeded.mjs`; the wrapper runs `npm run db:seed` with inherited stdio when the DB is missing/stale/unseeded.
- `src/lib/auth.ts:239-260` generates per-install passwords, creates admin/viewer users, and logs the plaintext outside `NODE_ENV=test`.

## Counterevidence

Passwords are random, not committed, printed only when the fresh/named-seed branch runs, and docs expect operator rotation. The surviving risk depends on startup logs being readable by someone below intended app-admin trust before rotation.

## Remaining Uncertainty

Need deployment log access policy and rotation SLA for exact severity.

## Affected Locations

- secret_generation: src/lib/auth.ts:196-198 - Random per-install passwords are generated for seeded accounts.
- log_sink: src/lib/auth.ts:232-260 - Fresh bootstrap passwords are emitted to stdout outside tests.
- production_seed_entrypoint: scripts/start-production.sh:4-7 - Production startup runs seeding before next start.
- seed_wrapper: scripts/ensure-seeded.mjs:61-75 - Seed command inherits process output during production startup.
- seed_data_trigger: scripts/seed.ts:503-510, 605-610 - Seed path creates named accounts when needed.
- deployment_context: Dockerfile:14-22 - Container startup path uses the production start script.
- deployment_context: fly.toml:7-17 - Fly deployment runs the production server with mounted SQLite data.

## Validation Artifacts

- artifacts/05_findings/D8AD-CAN-001/validation_artifacts/D8AD-CAN-001-seed-stdout-redacted.log

### Attack Path Report

# Attack Path Analysis: D8AD-CAN-001 - Fresh bootstrap passwords are printed to runtime logs until rotation

Final policy decision: reportable
Severity: medium
Priority: P2
Confidence: medium-high

## Affected Lines

- secret_generation: src/lib/auth.ts:196-198 - Random per-install passwords are generated for seeded accounts.
- log_sink: src/lib/auth.ts:232-260 - Fresh bootstrap passwords are emitted to stdout outside tests.
- production_seed_entrypoint: scripts/start-production.sh:4-7 - Production startup runs seeding before next start.
- seed_wrapper: scripts/ensure-seeded.mjs:61-75 - Seed command inherits process output during production startup.
- seed_data_trigger: scripts/seed.ts:503-510, 605-610 - Seed path creates named accounts when needed.
- deployment_context: Dockerfile:14-22 - Container startup path uses the production start script.
- deployment_context: fly.toml:7-17 - Fly deployment runs the production server with mounted SQLite data.

## Attack Path Steps

1. Production container starts through `scripts/start-production.sh`.
2. If the mounted DB is missing, stale, or unseeded, `scripts/ensure-seeded.mjs` runs `npm run db:seed` with inherited stdout.
3. `ensureSeedAdmin()` creates random named admin/viewer passwords and prints them to stdout outside tests.
4. A lower-privileged log reader who sees the line before rotation can authenticate as the seeded admin and mutate dashboard data/users.

## Attack Path Facts

- Assumptions: operator/log-reader precondition; candidate remains within the synthesized threat model only when that actor/path is realistic.
- Context: Eastern State KPI is a single-organization internal dashboard; cross-tenant impact is out of scope, while admin/session/data-integrity and developer/CI boundaries are in scope when lower-privilege actors can cross them.
- In-scope status: In scope for analysis; reportability shown by the final policy decision.
- Exposure: none/operational-log access.
- Identity: Next.js app process, SQLite DB, admin/viewer cookie sessions, or developer/CI shell user depending on candidate.
- Cross-boundary behavior: credential exposure.
- Vector: none/operational-log access.
- Preconditions: operator/log-reader precondition.
- Attacker input control: Production container starts through `scripts/start-production.sh`.
- Category: credential exposure.
- Mitigations already present: see counterevidence below.
- Auth scope: operator/log-reader precondition.
- Impact surface: high.
- Target reach: single application/developer workflow.
- Secrets references: seeded account passwords in stdout logs.
- Counterevidence: Passwords are random and not source-controlled; the exposure is first-run/fresh-seed only and intended operators are told to rotate. A fully trusted production operator reading logs is not a boundary crossing; the reportable path depends on log readers or retained logs being lower privilege than app admin.
- Blindspots: deployment/log policies, browser same-site assumptions, or operational use as noted in validation where applicable.
- Controls: repository controls and recommended remediation below.
- Confidence: medium-high.

## Severity Calibration

Impact: high
Likelihood: unknown
Final severity/policy: medium / reportable

## Remediation

Do not print live bootstrap passwords to process stdout. Prefer one-time out-of-band secret delivery, forced first-login rotation, or a sealed operator-only setup step with log redaction.

### Runtime Evidence Excerpts

Artifact: `artifacts/05_findings/D8AD-CAN-001/validation_artifacts/D8AD-CAN-001-seed-stdout-redacted.log`

```
command: DATABASE_PATH=/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/06_validation/runtime-evidence/seed-disposable.db NODE_ENV=production npm run db:seed
exit: 0
output-redacted:

> eastern-state-kpi@0.1.0 db:seed
> tsx scripts/seed.ts

Resetting KPI data...
  - Video views: monthly 2024,2025,2026
  - Webpage views: monthly 2024,2025,2026
  - Lesson downloads: monthly 2024,2025,2026
  - Virtual program attendees: monthly 2024,2025,2026
  - States and countries represented: monthly 2024,2025,2026
  - Teachers attending in-person PDs: monthly 2024,2025,2026
  - Teachers attending online PDs: monthly 2024,2025,2026
  - State/national conferences with ES presence: monthly 2024,2025,2026
  - Overall attendance in education programs: monthly 2024,2025,2026
  - Educational/program partners: annual 2024,2025,2026
  - Speaker program attendance onsite: monthly 2024,2025,2026
  - Speaker program attendance online: monthly 2024,2025,2026
  - YouTube views of videos: monthly 2024,2025,2026
  - Participants in open call event: monthly 2024,2025,2026
  - Percent of participants completing program: annual 2024,2025,2026
  - Programs offered: annual 2024,2025,2026
  - Percent job placement at program completion: annual 2024,2025,2026
  - Percent job placement 1 year post-graduation: annual 2024,2025,2026
  - Percent female: annual 2024,2025,2026
  - Percent justice impacted: annual 2024,2025,2026
  - Community partners: annual 2024,2025,2026
  - Awareness of workforce programs: annual 2024,2025,2026
  - Articles on Eastern State preservation work: monthly 2024,2025,2026
  - Percent of site in triage: annual 2024,2025,2026
  - Conferences presented: annual 2024,2025,2026
  - Items in collection: annual 2024,2025,2026
  - Percent of items in collection available online: annual 2024,2025,2026
  - Overall museum attendance: monthly 2024,2025,2026
  - School groups attendance: monthly 2024,2025,2026
  - Virtual exhibit participants: monthly 2024,2025,2026
  - Festival attendees: monthly 2024,2025,2026
  - Media mentions during festival: monthly 2024,2025,2026
  - Festivals with partner sponsors: annual 2024,2025,2026
  - Public events team participated in as speaker: monthly 2024,2025,2026
  - Broadcast/streaming/radio/podcast interviews: monthly 2024,2025,2026
  - Print/online mentions of Eastern State: monthly 2024,2025,2026
  - Overall media hits: monthly 2024,2025,2026
  - People referred to development who became donors: monthly breakdown 2024,2025,2026
  - Number of overall individual donors: annual 2024,2025,2026
  - Percent of overall revenue from development: annual 2024,2025,2026
  - Percent of board engagement: annual 2024,2025,2026
  - Percent of board giving: annual 2024,2025,2026
  - Number of corporate sponsorships: annual 2024,2025,2026
  - Percent of donors retained from prior year, all categories: annual 2024,2025,2026
  - Percent of members converted to donors: annual 2024,2025,2026
  - Percent of donors converted to members: annual 2024,2025,2026
  - Number of funders by breakdown: breakdown 2024,2025,2026
  - First-time, returning, and lapsed donors: breakdown 2024,2025,2026
  - Total annual budget: annual 2024,2025,2026
  - Economic impact: annual 2024,2025,2026
  - Jobs held at ES: annual 2024,2025,2026
  - Indirect jobs held at ES via vendors: annual 2024,2025,2026
[seed] created named accounts on first run. Read these once, rotate them through /admin/users, and they are gone from the log forever:
[seed]   kerry@easternstate.org  (admin)   <redacted-disposable-password>
[seed]   zach@easternstate.org   (viewer)  <redacted-disposable-password>

Seed complete. 52 KPIs ready across 2024–2026 (792 values).
```

### Candidate Ledger

```jsonl
{"phase":"discovery","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","round_id":"round-01-retry-02","candidate_id":"D8AD-CAN-001","status":"discovered_canonical_candidate","title":"Fresh bootstrap passwords are printed to runtime logs until rotation","affected_locations":[{"label":"secret_generation","path":"src/lib/auth.ts","lines":"196-198","detail":"Random per-install passwords are generated for seeded accounts."},{"label":"log_sink","path":"src/lib/auth.ts","lines":"232-260","detail":"Fresh bootstrap passwords are emitted to stdout outside tests."},{"label":"production_seed_entrypoint","path":"scripts/start-production.sh","lines":"4-7","detail":"Production startup runs seeding before next start."},{"label":"seed_wrapper","path":"scripts/ensure-seeded.mjs","lines":"61-75","detail":"Seed command inherits process output during production startup."},{"label":"deployment_context","path":"Dockerfile","lines":"14-22","detail":"Container startup path uses the production start script."},{"label":"deployment_context","path":"fly.toml","lines":"7-17","detail":"Fly deployment runs the production server with mounted SQLite data."}],"upstream_worker_candidates":[{"worker":"worker-01","source_candidate_id":"ESKPI-D8-W01-C001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-01","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-01/findings/ESKPI-D8-W01-C001/candidate_ledger.jsonl","title":"First-run seed passwords are printed to runtime logs and remain valid until manual rotation"},{"worker":"worker-04","source_candidate_id":"ESKPI-W04-CAN-003","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-04","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-04/findings/ESKPI-W04-CAN-003/candidate_ledger.jsonl","title":"Fresh production seeding writes live bootstrap passwords to application stdout"},{"worker":"worker-05","source_candidate_id":"d8adcf5f-w05-c002","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-05","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-05/findings/d8adcf5f-w05-c002/candidate_ledger.jsonl","title":"Fresh database seed credentials are printed to server stdout until operators rotate them"},{"worker":"worker-06","source_candidate_id":"D8AD-W06-002","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-06","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-06/findings/D8AD-W06-002/candidate_ledger.jsonl","title":"Fresh seeded admin passwords are printed to production stdout during automatic DB seeding"}],"discovery_artifact":"artifacts/02_discovery/finding_discovery_report.md","merge_record":"artifacts/deep_merge/round-01_merge_record.md","validation_status":"pending_centralized_validation_after_discovery_saturation","attack_path_status":"pending_centralized_attack_path_after_validation"}
{"phase":"discovery","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","round_id":"round-02-merge","candidate_id":"D8AD-CAN-001","status":"rediscovered_or_preserved_canonical_candidate","title":"Fresh bootstrap passwords are printed to runtime logs until rotation","affected_locations":[{"label":"secret_generation","path":"src/lib/auth.ts","lines":"196-198","detail":"Random per-install passwords are generated for seeded accounts."},{"label":"log_sink","path":"src/lib/auth.ts","lines":"232-260","detail":"Fresh bootstrap passwords are emitted to stdout outside tests."},{"label":"production_seed_entrypoint","path":"scripts/start-production.sh","lines":"4-7","detail":"Production startup runs seeding before next start."},{"label":"seed_wrapper","path":"scripts/ensure-seeded.mjs","lines":"61-75","detail":"Seed command inherits process output during production startup."},{"label":"seed_data_trigger","path":"scripts/seed.ts","lines":"503-510, 605-610","detail":"Seed path creates named accounts when needed."},{"label":"deployment_context","path":"Dockerfile","lines":"14-22","detail":"Container startup path uses the production start script."},{"label":"deployment_context","path":"fly.toml","lines":"7-17","detail":"Fly deployment runs the production server with mounted SQLite data."}],"upstream_worker_candidates":[{"round":"round-01-retry-02","worker":"worker-01","source_candidate_id":"ESKPI-D8-W01-C001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-01","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-01/findings/ESKPI-D8-W01-C001/candidate_ledger.jsonl","title":"First-run seed passwords are printed to runtime logs and remain valid until manual rotation"},{"round":"round-01-retry-02","worker":"worker-04","source_candidate_id":"ESKPI-W04-CAN-003","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-04","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-04/findings/ESKPI-W04-CAN-003/candidate_ledger.jsonl","title":"Fresh production seeding writes live bootstrap passwords to application stdout"},{"round":"round-01-retry-02","worker":"worker-05","source_candidate_id":"d8adcf5f-w05-c002","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-05","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-05/findings/d8adcf5f-w05-c002/candidate_ledger.jsonl","title":"Fresh database seed credentials are printed to server stdout until operators rotate them"},{"round":"round-01-retry-02","worker":"worker-06","source_candidate_id":"D8AD-W06-002","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-06","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-06/findings/D8AD-W06-002/candidate_ledger.jsonl","title":"Fresh seeded admin passwords are printed to production stdout during automatic DB seeding"},{"round":"round-02","worker":"worker-02","source_candidate_id":"r02w02-c001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-02","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-02/findings/r02w02-c001/candidate_ledger.jsonl","title":"First-run seed account passwords are written to production stdout before operators can rotate them"},{"round":"round-02","worker":"worker-03","source_candidate_id":"ESKPI-R02W03-C01","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-03","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-03/findings/ESKPI-R02W03-C01/candidate_ledger.jsonl","title":"First-run seeded account passwords are emitted to production stdout when bootstrap seeding creates users"},{"round":"round-02","worker":"worker-04","source_candidate_id":"D8-R02-W04-CAN-002","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-04","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-04/findings/D8-R02-W04-CAN-002/candidate_ledger.jsonl","title":"First-run seeded account passwords are emitted to process stdout during production seeding"}],"discovery_artifact":"artifacts/02_discovery/finding_discovery_report.md","merge_record":"artifacts/deep_merge/round-02_merge_record.md","validation_status":"pending_centralized_validation_after_discovery_saturation","attack_path_status":"pending_centralized_attack_path_after_validation"}
{"phase":"discovery","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","round_id":"round-03-merge","merge_round":"round-03","row_id":"D8AD-CAN-001-round-03-merge","candidate_id":"D8AD-CAN-001","status":"rediscovered_or_preserved_canonical_candidate","title":"Fresh bootstrap passwords are printed to runtime logs until rotation","affected_locations":[{"label":"secret_generation","path":"src/lib/auth.ts","lines":"196-198","detail":"Random per-install passwords are generated for seeded accounts."},{"label":"log_sink","path":"src/lib/auth.ts","lines":"232-260","detail":"Fresh bootstrap passwords are emitted to stdout outside tests."},{"label":"production_seed_entrypoint","path":"scripts/start-production.sh","lines":"4-7","detail":"Production startup runs seeding before next start."},{"label":"seed_wrapper","path":"scripts/ensure-seeded.mjs","lines":"61-75","detail":"Seed command inherits process output during production startup."},{"label":"seed_data_trigger","path":"scripts/seed.ts","lines":"503-510, 605-610","detail":"Seed path creates named accounts when needed."},{"label":"deployment_context","path":"Dockerfile","lines":"14-22","detail":"Container startup path uses the production start script."},{"label":"deployment_context","path":"fly.toml","lines":"7-17","detail":"Fly deployment runs the production server with mounted SQLite data."}],"upstream_worker_candidates":[{"round":"round-01-retry-02","worker":"worker-01","source_candidate_id":"ESKPI-D8-W01-C001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-01","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-01/findings/ESKPI-D8-W01-C001/candidate_ledger.jsonl","title":"First-run seed passwords are printed to runtime logs and remain valid until manual rotation"},{"round":"round-01-retry-02","worker":"worker-04","source_candidate_id":"ESKPI-W04-CAN-003","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-04","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-04/findings/ESKPI-W04-CAN-003/candidate_ledger.jsonl","title":"Fresh production seeding writes live bootstrap passwords to application stdout"},{"round":"round-01-retry-02","worker":"worker-05","source_candidate_id":"d8adcf5f-w05-c002","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-05","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-05/findings/d8adcf5f-w05-c002/candidate_ledger.jsonl","title":"Fresh database seed credentials are printed to server stdout until operators rotate them"},{"round":"round-01-retry-02","worker":"worker-06","source_candidate_id":"D8AD-W06-002","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-06","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-06/findings/D8AD-W06-002/candidate_ledger.jsonl","title":"Fresh seeded admin passwords are printed to production stdout during automatic DB seeding"},{"round":"round-02","worker":"worker-02","source_candidate_id":"r02w02-c001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-02","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-02/findings/r02w02-c001/candidate_ledger.jsonl","title":"First-run seed account passwords are written to production stdout before operators can rotate them"},{"round":"round-02","worker":"worker-03","source_candidate_id":"ESKPI-R02W03-C01","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-03","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-03/findings/ESKPI-R02W03-C01/candidate_ledger.jsonl","title":"First-run seeded account passwords are emitted to production stdout when bootstrap seeding creates users"},{"round":"round-02","worker":"worker-04","source_candidate_id":"D8-R02-W04-CAN-002","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-04","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-04/findings/D8-R02-W04-CAN-002/candidate_ledger.jsonl","title":"First-run seeded account passwords are emitted to process stdout during production seeding"},{"round":"round-03","worker":"worker-01","source_candidate_id":"R03W01-CAND-001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-03/worker-01","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-03/worker-01/findings/R03W01-CAND-001/candidate_ledger.jsonl","title":"First-run seeded account passwords are written to startup stdout"},{"round":"round-03","worker":"worker-04","source_candidate_id":"ESKPI-R03-W04-CAND-001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-03/worker-04","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-03/worker-04/findings/ESKPI-R03-W04-CAND-001/candidate_ledger.jsonl","title":"First-run seed admin password is written to process stdout"}],"discovery_artifact":"artifacts/02_discovery/finding_discovery_report.md","merge_record":"artifacts/deep_merge/round-03_merge_record.md","validation_status":"pending_centralized_validation_after_discovery_saturation","attack_path_status":"pending_centralized_attack_path_after_validation","created_at":"2026-07-03T16:08:37.567Z"}
{"phase":"validation","validation_round":"centralized","row_id":"D8AD-CAN-001-central-validation","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","candidate_id":"D8AD-CAN-001","disposition":"reportable","survives":"yes","confidence":"high behavior / medium impact","method":"disposable runtime reproduction plus static trace","evidence":["Disposable `DATABASE_PATH` seed under `NODE_ENV=production` exited 0 and printed first-run named account lines to stdout; passwords were redacted before saving artifact evidence.","Static trace shows Docker/Fly production startup runs `scripts/start-production.sh`, which invokes `scripts/ensure-seeded.mjs`; the wrapper runs `npm run db:seed` with inherited stdio when the DB is missing/stale/unseeded.","`src/lib/auth.ts:239-260` generates per-install passwords, creates admin/viewer users, and logs the plaintext outside `NODE_ENV=test`."],"counterevidence":"Passwords are random, not committed, printed only when the fresh/named-seed branch runs, and docs expect operator rotation. The surviving risk depends on startup logs being readable by someone below intended app-admin trust before rotation.","proof_gap":"Need deployment log access policy and rotation SLA for exact severity.","validation_report":"artifacts/05_findings/D8AD-CAN-001/validation_report.md","validation_artifacts":["artifacts/05_findings/D8AD-CAN-001/validation_artifacts/D8AD-CAN-001-seed-stdout-redacted.log"],"created_at":"2026-07-03T16:14:29.618Z"}
{"phase":"attack_path","attack_path_round":"centralized","row_id":"D8AD-CAN-001-central-attack-path","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","candidate_id":"D8AD-CAN-001","decision":"reportable","severity":"medium","priority":"P2","confidence":"medium-high","impact":"high","likelihood":"unknown","attack_path_steps":["Production container starts through `scripts/start-production.sh`.","If the mounted DB is missing, stale, or unseeded, `scripts/ensure-seeded.mjs` runs `npm run db:seed` with inherited stdout.","`ensureSeedAdmin()` creates random named admin/viewer passwords and prints them to stdout outside tests.","A lower-privileged log reader who sees the line before rotation can authenticate as the seeded admin and mutate dashboard data/users."],"counterevidence":"Passwords are random and not source-controlled; the exposure is first-run/fresh-seed only and intended operators are told to rotate. A fully trusted production operator reading logs is not a boundary crossing; the reportable path depends on log readers or retained logs being lower privilege than app admin.","attack_path_report":"artifacts/05_findings/D8AD-CAN-001/attack_path_analysis_report.md","created_at":"2026-07-03T16:16:06.215Z"}
```

---

## D8AD-CAN-002: Development auth bypass grants anonymous admin when a dev server is reachable

| Field | Value |
| --- | --- |
| Validation disposition | suppressed |
| Survives validation | no |
| Validation method | targeted module import under production/test/development envs |
| Attack-path decision | ignore |
| Attack-path severity | ignore |
| Priority |  |
| Attack-path confidence | high |
| Rule ID | dev-auth-bypass |
| Instance key | auth-bypass:src/lib/session.ts:63 |
| Taxonomy | {"cwe":["CWE-306","CWE-287"]} |
| Coverage surface | dev-auth-bypass (rejected) |

Coverage notes: Development bypass exists, but production/test imports fail closed when AUTH_DISABLED is set; no supported deployment exposes next dev.

### Discovery Candidate Record

Attacker-controlled source: Unauthenticated HTTP requests to a development-mode server where AUTH_DISABLED=true and the server is reachable by untrusted users.

Vulnerable sink or broken control: The production/test guard appears strong for next build/next start/Fly, but development mode intentionally converts every request into the bypass admin.

Impact: If a dev server is exposed, an unauthenticated requester can read dashboard data and use admin write APIs as the bypass admin.

Why plausible: Three worker candidates found the same dev-only fail-open behavior. The production guard is important counterevidence but does not close exposed development deployments.

Closest apparent control: The production/test guard appears strong for next build/next start/Fly, but development mode intentionally converts every request into the bypass admin.

Validation plan from discovery: Validate exact production/test guard behavior, dev-server reachability assumptions, and whether any deployment or docs path could expose npm run dev beyond localhost.

### Affected Locations

| Label | Path | Lines | Detail |
| --- | --- | --- | --- |
| root_control | src/lib/auth-flag.ts | 18-39 | AUTH_DISABLED is forced off for production/test and allowed in development. |
| broken_control | src/lib/session.ts | 63-91 | When enabled, getSession/requireSession/requireAdmin return the bypass admin without cookies. |
| routing | src/app/page.tsx | 9-17 | Bypass path redirects directly into the dashboard. |
| admin_write_sink | src/app/api/entries/route.ts | 35-67 | Admin-gated data mutation becomes reachable under bypass. |
| admin_user_sink | src/app/api/users/route.ts | 22-73 | Admin-gated user management becomes reachable under bypass. |
| production_control | fly.toml | 7-13 | Production deployment sets AUTH_DISABLED=false and NODE_ENV=production. |
| production_control | Dockerfile | 14-22 | Container uses production next start path. |

### Upstream Worker Candidates

| Round | Worker | Source candidate | Title |
| --- | --- | --- | --- |
| round-01-retry-02 | worker-01 | ESKPI-D8-W01-C002 | Development auth-bypass flag grants anonymous admin if a dev server is exposed |
| round-01-retry-02 | worker-05 | d8adcf5f-w05-c001 | Development AUTH_DISABLED mode grants anonymous admin privileges if the dev server is reachable |
| round-02 | worker-04 | D8-R02-W04-CAN-001 | Development auth bypass grants anonymous admin if a dev server is reachable |

### Validation Report

# Validation Report: D8AD-CAN-002 - Development auth bypass grants anonymous admin when a dev server is reachable

Candidate id: D8AD-CAN-002
Instance key: auth-bypass:src/lib/session.ts:63
Disposition: suppressed
Survives validation: no
Confidence: high for production/test suppression; true only in development
Validation method: targeted module import under production/test/development envs

## Rubric

- [x] Claimed attacker input or trigger identified.
- [x] Closest control and sink identified with repository file/line evidence.
- [x] Existing controls and counterevidence considered.
- [x] Bounded runtime or static validation method chosen proportionately.
- [x] Candidate receives an explicit closure disposition and ledger receipt.

## Evidence Observed

- `AUTH_DISABLED=true` with `NODE_ENV=production` and `NODE_ENV=test` exits through the module-load guard with the fail-closed error.
- `AUTH_DISABLED=true` with `NODE_ENV=development` returns `AUTH_DISABLED=true`, matching the documented local development bypass.
- `AUTH_DISABLED=false` with production returns `AUTH_DISABLED=false`.
- Fly/Docker production config sets `NODE_ENV=production` and `AUTH_DISABLED=false`.

## Counterevidence

A reachable development server with AUTH_DISABLED=true would still grant anonymous admin, but the repository production/test paths reproduced fail-closed and no repo-supported deployment exposes `next dev`.

## Remaining Uncertainty

Only an out-of-policy exposed dev server would make this a live vulnerability.

## Affected Locations

- root_control: src/lib/auth-flag.ts:18-39 - AUTH_DISABLED is forced off for production/test and allowed in development.
- broken_control: src/lib/session.ts:63-91 - When enabled, getSession/requireSession/requireAdmin return the bypass admin without cookies.
- routing: src/app/page.tsx:9-17 - Bypass path redirects directly into the dashboard.
- admin_write_sink: src/app/api/entries/route.ts:35-67 - Admin-gated data mutation becomes reachable under bypass.
- admin_user_sink: src/app/api/users/route.ts:22-73 - Admin-gated user management becomes reachable under bypass.
- production_control: fly.toml:7-13 - Production deployment sets AUTH_DISABLED=false and NODE_ENV=production.
- production_control: Dockerfile:14-22 - Container uses production next start path.

## Validation Artifacts

- artifacts/05_findings/D8AD-CAN-002/validation_artifacts/D8AD-CAN-002-auth-flag-prod-true.log
- artifacts/05_findings/D8AD-CAN-002/validation_artifacts/D8AD-CAN-002-auth-flag-test-true.log
- artifacts/05_findings/D8AD-CAN-002/validation_artifacts/D8AD-CAN-002-auth-flag-dev-true.log
- artifacts/05_findings/D8AD-CAN-002/validation_artifacts/D8AD-CAN-002-auth-flag-prod-false.log

### Attack Path Report

# Attack Path Analysis: D8AD-CAN-002 - Development auth bypass grants anonymous admin when a dev server is reachable

Final policy decision: ignore
Severity: ignore
Priority: none
Confidence: high

## Affected Lines

- root_control: src/lib/auth-flag.ts:18-39 - AUTH_DISABLED is forced off for production/test and allowed in development.
- broken_control: src/lib/session.ts:63-91 - When enabled, getSession/requireSession/requireAdmin return the bypass admin without cookies.
- routing: src/app/page.tsx:9-17 - Bypass path redirects directly into the dashboard.
- admin_write_sink: src/app/api/entries/route.ts:35-67 - Admin-gated data mutation becomes reachable under bypass.
- admin_user_sink: src/app/api/users/route.ts:22-73 - Admin-gated user management becomes reachable under bypass.
- production_control: fly.toml:7-13 - Production deployment sets AUTH_DISABLED=false and NODE_ENV=production.
- production_control: Dockerfile:14-22 - Container uses production next start path.

## Attack Path Steps

1. `AUTH_DISABLED=true` grants bypass admin only in `NODE_ENV=development`.
2. Production/test module imports with the flag set throw before serving.
3. Fly/Docker production paths set production mode and `AUTH_DISABLED=false`.

## Attack Path Facts

- Assumptions: anonymous only in dev bypass; candidate remains within the synthesized threat model only when that actor/path is realistic.
- Context: Eastern State KPI is a single-organization internal dashboard; cross-tenant impact is out of scope, while admin/session/data-integrity and developer/CI boundaries are in scope when lower-privilege actors can cross them.
- In-scope status: Not reportable after validation and policy adjustment.
- Exposure: development only.
- Identity: Next.js app process, SQLite DB, admin/viewer cookie sessions, or developer/CI shell user depending on candidate.
- Cross-boundary behavior: suppressed dev-only auth bypass.
- Vector: development only.
- Preconditions: anonymous only in dev bypass.
- Attacker input control: `AUTH_DISABLED=true` grants bypass admin only in `NODE_ENV=development`.
- Category: suppressed dev-only auth bypass.
- Mitigations already present: see counterevidence below.
- Auth scope: anonymous only in dev bypass.
- Impact surface: ignore.
- Target reach: single application/developer workflow.
- Secrets references: none material to final decision.
- Counterevidence: The repository production and test paths reproduce fail-closed; no supported deployment path exposes `next dev` to users. An exposed development server would be an operational violation outside the production threat model.
- Blindspots: deployment/log policies, browser same-site assumptions, or operational use as noted in validation where applicable.
- Controls: repository controls and recommended remediation below.
- Confidence: high.

## Severity Calibration

Impact: ignore
Likelihood: ignore
Final severity/policy: ignore / ignore

## Remediation

Keep production/test guard and CI gate. If dev servers may be exposed, remove or bind the bypass to localhost-only development.

### Runtime Evidence Excerpts

Artifact: `artifacts/05_findings/D8AD-CAN-002/validation_artifacts/D8AD-CAN-002-auth-flag-prod-true.log`

```
NODE_ENV=production AUTH_DISABLED=true
exit: 42
stdout:

stderr:
AUTH_DISABLED is set in NODE_ENV=production (value: "true"). Refusing to start: this configuration would grant anonymous admin access. Unset AUTH_DISABLED (or set NODE_ENV=development) to run the dev bypass.
```

Artifact: `artifacts/05_findings/D8AD-CAN-002/validation_artifacts/D8AD-CAN-002-auth-flag-test-true.log`

```
NODE_ENV=test AUTH_DISABLED=true
exit: 42
stdout:

stderr:
AUTH_DISABLED is set in NODE_ENV=test (value: "true"). Refusing to start: this configuration would grant anonymous admin access. Unset AUTH_DISABLED (or set NODE_ENV=development) to run the dev bypass.
```

Artifact: `artifacts/05_findings/D8AD-CAN-002/validation_artifacts/D8AD-CAN-002-auth-flag-dev-true.log`

```
NODE_ENV=development AUTH_DISABLED=true
exit: 0
stdout:
AUTH_DISABLED=true

stderr:
```

Artifact: `artifacts/05_findings/D8AD-CAN-002/validation_artifacts/D8AD-CAN-002-auth-flag-prod-false.log`

```
NODE_ENV=production AUTH_DISABLED=false
exit: 0
stdout:
AUTH_DISABLED=false

stderr:
```

### Candidate Ledger

```jsonl
{"phase":"discovery","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","round_id":"round-01-retry-02","candidate_id":"D8AD-CAN-002","status":"discovered_canonical_candidate","title":"Development auth bypass grants anonymous admin when a dev server is reachable","affected_locations":[{"label":"root_control","path":"src/lib/auth-flag.ts","lines":"18-39","detail":"AUTH_DISABLED is forced off for production/test and allowed in development."},{"label":"broken_control","path":"src/lib/session.ts","lines":"63-91","detail":"When enabled, getSession/requireSession/requireAdmin return the bypass admin without cookies."},{"label":"routing","path":"src/app/page.tsx","lines":"9-17","detail":"Bypass path redirects directly into the dashboard."},{"label":"admin_write_sink","path":"src/app/api/entries/route.ts","lines":"35-67","detail":"Admin-gated data mutation becomes reachable under bypass."},{"label":"admin_user_sink","path":"src/app/api/users/route.ts","lines":"22-73","detail":"Admin-gated user management becomes reachable under bypass."},{"label":"production_control","path":"fly.toml","lines":"7-13","detail":"Production deployment sets AUTH_DISABLED=false and NODE_ENV=production."}],"upstream_worker_candidates":[{"worker":"worker-01","source_candidate_id":"ESKPI-D8-W01-C002","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-01","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-01/findings/ESKPI-D8-W01-C002/candidate_ledger.jsonl","title":"Development auth-bypass flag grants anonymous admin if a dev server is exposed"},{"worker":"worker-05","source_candidate_id":"d8adcf5f-w05-c001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-05","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-05/findings/d8adcf5f-w05-c001/candidate_ledger.jsonl","title":"Development AUTH_DISABLED mode grants anonymous admin privileges if the dev server is reachable"}],"discovery_artifact":"artifacts/02_discovery/finding_discovery_report.md","merge_record":"artifacts/deep_merge/round-01_merge_record.md","validation_status":"pending_centralized_validation_after_discovery_saturation","attack_path_status":"pending_centralized_attack_path_after_validation"}
{"phase":"discovery","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","round_id":"round-02-merge","candidate_id":"D8AD-CAN-002","status":"rediscovered_or_preserved_canonical_candidate","title":"Development auth bypass grants anonymous admin when a dev server is reachable","affected_locations":[{"label":"root_control","path":"src/lib/auth-flag.ts","lines":"18-39","detail":"AUTH_DISABLED is forced off for production/test and allowed in development."},{"label":"broken_control","path":"src/lib/session.ts","lines":"63-91","detail":"When enabled, getSession/requireSession/requireAdmin return the bypass admin without cookies."},{"label":"routing","path":"src/app/page.tsx","lines":"9-17","detail":"Bypass path redirects directly into the dashboard."},{"label":"admin_write_sink","path":"src/app/api/entries/route.ts","lines":"35-67","detail":"Admin-gated data mutation becomes reachable under bypass."},{"label":"admin_user_sink","path":"src/app/api/users/route.ts","lines":"22-73","detail":"Admin-gated user management becomes reachable under bypass."},{"label":"production_control","path":"fly.toml","lines":"7-13","detail":"Production deployment sets AUTH_DISABLED=false and NODE_ENV=production."},{"label":"production_control","path":"Dockerfile","lines":"14-22","detail":"Container uses production next start path."}],"upstream_worker_candidates":[{"round":"round-01-retry-02","worker":"worker-01","source_candidate_id":"ESKPI-D8-W01-C002","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-01","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-01/findings/ESKPI-D8-W01-C002/candidate_ledger.jsonl","title":"Development auth-bypass flag grants anonymous admin if a dev server is exposed"},{"round":"round-01-retry-02","worker":"worker-05","source_candidate_id":"d8adcf5f-w05-c001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-05","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-05/findings/d8adcf5f-w05-c001/candidate_ledger.jsonl","title":"Development AUTH_DISABLED mode grants anonymous admin privileges if the dev server is reachable"},{"round":"round-02","worker":"worker-04","source_candidate_id":"D8-R02-W04-CAN-001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-04","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-04/findings/D8-R02-W04-CAN-001/candidate_ledger.jsonl","title":"Development auth bypass grants anonymous admin if a dev server is reachable"}],"discovery_artifact":"artifacts/02_discovery/finding_discovery_report.md","merge_record":"artifacts/deep_merge/round-02_merge_record.md","validation_status":"pending_centralized_validation_after_discovery_saturation","attack_path_status":"pending_centralized_attack_path_after_validation"}
{"phase":"discovery","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","round_id":"round-03-merge","merge_round":"round-03","row_id":"D8AD-CAN-002-round-03-merge","candidate_id":"D8AD-CAN-002","status":"preserved_canonical_candidate_no_round3_candidate","title":"Development auth bypass grants anonymous admin when a dev server is reachable","affected_locations":[{"label":"root_control","path":"src/lib/auth-flag.ts","lines":"18-39","detail":"AUTH_DISABLED is forced off for production/test and allowed in development."},{"label":"broken_control","path":"src/lib/session.ts","lines":"63-91","detail":"When enabled, getSession/requireSession/requireAdmin return the bypass admin without cookies."},{"label":"routing","path":"src/app/page.tsx","lines":"9-17","detail":"Bypass path redirects directly into the dashboard."},{"label":"admin_write_sink","path":"src/app/api/entries/route.ts","lines":"35-67","detail":"Admin-gated data mutation becomes reachable under bypass."},{"label":"admin_user_sink","path":"src/app/api/users/route.ts","lines":"22-73","detail":"Admin-gated user management becomes reachable under bypass."},{"label":"production_control","path":"fly.toml","lines":"7-13","detail":"Production deployment sets AUTH_DISABLED=false and NODE_ENV=production."},{"label":"production_control","path":"Dockerfile","lines":"14-22","detail":"Container uses production next start path."}],"upstream_worker_candidates":[{"round":"round-01-retry-02","worker":"worker-01","source_candidate_id":"ESKPI-D8-W01-C002","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-01","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-01/findings/ESKPI-D8-W01-C002/candidate_ledger.jsonl","title":"Development auth-bypass flag grants anonymous admin if a dev server is exposed"},{"round":"round-01-retry-02","worker":"worker-05","source_candidate_id":"d8adcf5f-w05-c001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-05","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-05/findings/d8adcf5f-w05-c001/candidate_ledger.jsonl","title":"Development AUTH_DISABLED mode grants anonymous admin privileges if the dev server is reachable"},{"round":"round-02","worker":"worker-04","source_candidate_id":"D8-R02-W04-CAN-001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-04","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-04/findings/D8-R02-W04-CAN-001/candidate_ledger.jsonl","title":"Development auth bypass grants anonymous admin if a dev server is reachable"}],"discovery_artifact":"artifacts/02_discovery/finding_discovery_report.md","merge_record":"artifacts/deep_merge/round-03_merge_record.md","validation_status":"pending_centralized_validation_after_discovery_saturation","attack_path_status":"pending_centralized_attack_path_after_validation","created_at":"2026-07-03T16:08:37.567Z"}
{"phase":"validation","validation_round":"centralized","row_id":"D8AD-CAN-002-central-validation","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","candidate_id":"D8AD-CAN-002","disposition":"suppressed","survives":"no","confidence":"high for production/test suppression; true only in development","method":"targeted module import under production/test/development envs","evidence":["`AUTH_DISABLED=true` with `NODE_ENV=production` and `NODE_ENV=test` exits through the module-load guard with the fail-closed error.","`AUTH_DISABLED=true` with `NODE_ENV=development` returns `AUTH_DISABLED=true`, matching the documented local development bypass.","`AUTH_DISABLED=false` with production returns `AUTH_DISABLED=false`.","Fly/Docker production config sets `NODE_ENV=production` and `AUTH_DISABLED=false`."],"counterevidence":"A reachable development server with AUTH_DISABLED=true would still grant anonymous admin, but the repository production/test paths reproduced fail-closed and no repo-supported deployment exposes `next dev`.","proof_gap":"Only an out-of-policy exposed dev server would make this a live vulnerability.","validation_report":"artifacts/05_findings/D8AD-CAN-002/validation_report.md","validation_artifacts":["artifacts/05_findings/D8AD-CAN-002/validation_artifacts/D8AD-CAN-002-auth-flag-prod-true.log","artifacts/05_findings/D8AD-CAN-002/validation_artifacts/D8AD-CAN-002-auth-flag-test-true.log","artifacts/05_findings/D8AD-CAN-002/validation_artifacts/D8AD-CAN-002-auth-flag-dev-true.log","artifacts/05_findings/D8AD-CAN-002/validation_artifacts/D8AD-CAN-002-auth-flag-prod-false.log"],"created_at":"2026-07-03T16:14:29.618Z"}
{"phase":"attack_path","attack_path_round":"centralized","row_id":"D8AD-CAN-002-central-attack-path","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","candidate_id":"D8AD-CAN-002","decision":"ignore","severity":"ignore","priority":null,"confidence":"high","impact":"ignore","likelihood":"ignore","attack_path_steps":["`AUTH_DISABLED=true` grants bypass admin only in `NODE_ENV=development`.","Production/test module imports with the flag set throw before serving.","Fly/Docker production paths set production mode and `AUTH_DISABLED=false`."],"counterevidence":"The repository production and test paths reproduce fail-closed; no supported deployment path exposes `next dev` to users. An exposed development server would be an operational violation outside the production threat model.","attack_path_report":"artifacts/05_findings/D8AD-CAN-002/attack_path_analysis_report.md","created_at":"2026-07-03T16:16:06.215Z"}
```

---

## D8AD-CAN-003: Deleted or reset users retain access through stale stateless session cookies

| Field | Value |
| --- | --- |
| Validation disposition | reportable |
| Survives validation | yes |
| Validation method | static source/control/sink assessment |
| Attack-path decision | reportable |
| Attack-path severity | medium |
| Priority | P2 |
| Attack-path confidence | medium-high |
| Rule ID | stale-stateless-session |
| Instance key | authz/session-revalidation/stale-iron-session-user-after-delete-or-password-reset |
| Taxonomy | {"cwe":["CWE-613","CWE-285"]} |
| Coverage surface | session-revocation (reported) |

Coverage notes: Stale stateless session cookies remain trusted after reset/delete; reported as D8AD-CAN-003.

### Discovery Candidate Record

Attacker-controlled source: An already-authenticated admin or viewer keeps a valid encrypted session cookie issued before account deletion or password reset.

Vulnerable sink or broken control: The session is encrypted but stateless; authorization trusts the cookie payload and does not re-check the user row, role, disabled state, password version, or session epoch on each request.

Impact: A revoked or deleted admin session can continue calling admin-only APIs until cookie expiration or SESSION_SECRET rotation.

Why plausible: Two worker candidates across two rounds found this distinct session-revocation proof tuple. It is not remediated by fixing seed logging or dev bypass.

Closest apparent control: The session is encrypted but stateless; authorization trusts the cookie payload and does not re-check the user row, role, disabled state, password version, or session epoch on each request.

Validation plan from discovery: Validate by logging in, deleting/resetting the user from another admin context, then replaying the old cookie against requireAdmin routes.

### Affected Locations

| Label | Path | Lines | Detail |
| --- | --- | --- | --- |
| session_storage_source | src/app/api/auth/login/route.ts | 125-127 | Login stores a SessionUser in the encrypted cookie. |
| broken_authorization_control | src/lib/session.ts | 76-91 | requireSession/requireAdmin trust the cookie SessionUser without DB revalidation. |
| revocation_gap_password_reset | src/app/api/users/route.ts | 46-57 | Password reset changes DB state but does not revoke existing cookies. |
| revocation_gap_account_delete | src/app/api/users/route.ts | 62-73 | User deletion removes DB row but does not invalidate existing cookies. |
| data_mutation_sink | src/app/api/entries/route.ts | 35-50 | Admin-only entry mutation remains reachable with a stale admin cookie. |
| user_management_sink | src/app/api/users/route.ts | 22-73 | Admin-only user management remains reachable with a stale admin cookie. |

### Upstream Worker Candidates

| Round | Worker | Source candidate | Title |
| --- | --- | --- | --- |
| round-01-retry-02 | worker-06 | D8AD-W06-001 | Deleted or reset users retain admin access through stale stateless session cookies |
| round-02 | worker-05 | d8adcf5f-r02w05-cand-001 | Deleted or reset users can keep using previously issued cookie sessions |

### Validation Report

# Validation Report: D8AD-CAN-003 - Deleted or reset users retain access through stale stateless session cookies

Candidate id: D8AD-CAN-003
Instance key: authz/session-revalidation/stale-iron-session-user-after-delete-or-password-reset
Disposition: reportable
Survives validation: yes
Confidence: medium-high static validation
Validation method: static source/control/sink assessment

## Rubric

- [x] Claimed attacker input or trigger identified.
- [x] Closest control and sink identified with repository file/line evidence.
- [x] Existing controls and counterevidence considered.
- [x] Bounded runtime or static validation method chosen proportionately.
- [x] Candidate receives an explicit closure disposition and ledger receipt.

## Evidence Observed

- Login stores the full `SessionUser` object in the encrypted session cookie at `src/app/api/auth/login/route.ts:125-127`.
- `requireSession()` and `requireAdmin()` trust `session.user` and role from the cookie at `src/lib/session.ts:76-91`; no DB lookup, disabled flag, password version, session epoch, or deletion check is performed.
- Password reset and user delete in `src/app/api/users/route.ts:46-73` update/delete DB state but do not revoke extant cookies or rotate a session epoch.
- Admin write routes continue to trust `requireAdmin()` results for data/user mutations.

## Counterevidence

Cookie integrity depends on `SESSION_SECRET`, so attackers cannot forge arbitrary sessions. The issue is revocation after a legitimate cookie is issued, not forgery.

## Remaining Uncertainty

A full Next.js cookie replay PoC was not built because static code directly establishes the stateless revocation gap; dynamic replay would improve confidence but is not needed to preserve the finding.

## Affected Locations

- session_storage_source: src/app/api/auth/login/route.ts:125-127 - Login stores a SessionUser in the encrypted cookie.
- broken_authorization_control: src/lib/session.ts:76-91 - requireSession/requireAdmin trust the cookie SessionUser without DB revalidation.
- revocation_gap_password_reset: src/app/api/users/route.ts:46-57 - Password reset changes DB state but does not revoke existing cookies.
- revocation_gap_account_delete: src/app/api/users/route.ts:62-73 - User deletion removes DB row but does not invalidate existing cookies.
- data_mutation_sink: src/app/api/entries/route.ts:35-50 - Admin-only entry mutation remains reachable with a stale admin cookie.
- user_management_sink: src/app/api/users/route.ts:22-73 - Admin-only user management remains reachable with a stale admin cookie.

## Validation Artifacts

- None; validation used static repository evidence.

### Attack Path Report

# Attack Path Analysis: D8AD-CAN-003 - Deleted or reset users retain access through stale stateless session cookies

Final policy decision: reportable
Severity: medium
Priority: P2
Confidence: medium-high

## Affected Lines

- session_storage_source: src/app/api/auth/login/route.ts:125-127 - Login stores a SessionUser in the encrypted cookie.
- broken_authorization_control: src/lib/session.ts:76-91 - requireSession/requireAdmin trust the cookie SessionUser without DB revalidation.
- revocation_gap_password_reset: src/app/api/users/route.ts:46-57 - Password reset changes DB state but does not revoke existing cookies.
- revocation_gap_account_delete: src/app/api/users/route.ts:62-73 - User deletion removes DB row but does not invalidate existing cookies.
- data_mutation_sink: src/app/api/entries/route.ts:35-50 - Admin-only entry mutation remains reachable with a stale admin cookie.
- user_management_sink: src/app/api/users/route.ts:22-73 - Admin-only user management remains reachable with a stale admin cookie.

## Attack Path Steps

1. A user logs in and receives an encrypted cookie containing `SessionUser`.
2. An admin resets that user password or deletes the account.
3. The old browser keeps sending the existing cookie until expiry.
4. `requireSession()`/`requireAdmin()` trusts the cookie payload and role without rechecking the user row or session epoch, so revoked admin cookies can continue using admin APIs.

## Attack Path Facts

- Assumptions: previously authenticated user/session; candidate remains within the synthesized threat model only when that actor/path is realistic.
- Context: Eastern State KPI is a single-organization internal dashboard; cross-tenant impact is out of scope, while admin/session/data-integrity and developer/CI boundaries are in scope when lower-privilege actors can cross them.
- In-scope status: In scope for analysis; reportability shown by the final policy decision.
- Exposure: remote authenticated existing cookie.
- Identity: Next.js app process, SQLite DB, admin/viewer cookie sessions, or developer/CI shell user depending on candidate.
- Cross-boundary behavior: session revocation gap.
- Vector: remote authenticated existing cookie.
- Preconditions: previously authenticated user/session.
- Attacker input control: A user logs in and receives an encrypted cookie containing `SessionUser`.
- Category: session revocation gap.
- Mitigations already present: see counterevidence below.
- Auth scope: previously authenticated user/session.
- Impact surface: high.
- Target reach: single application/developer workflow.
- Secrets references: session cookie contents and SESSION_SECRET integrity.
- Counterevidence: Attackers cannot forge cookies without `SESSION_SECRET`; this is post-issuance revocation, not session forgery. Exposure is limited to users who already obtained a valid session.
- Blindspots: deployment/log policies, browser same-site assumptions, or operational use as noted in validation where applicable.
- Controls: repository controls and recommended remediation below.
- Confidence: medium-high.

## Severity Calibration

Impact: high
Likelihood: medium
Final severity/policy: medium / reportable

## Remediation

Revalidate the session user against the database on protected requests, add a session/password version or revoked-at epoch to sessions, and clear or invalidate sessions after password reset/delete.

### Runtime Evidence Excerpts

_No runtime artifact was produced for this candidate; validation used static repository evidence._
### Candidate Ledger

```jsonl
{"phase":"discovery","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","round_id":"round-01-retry-02","candidate_id":"D8AD-CAN-003","status":"discovered_canonical_candidate","title":"Deleted or reset users retain access through stale stateless session cookies","affected_locations":[{"label":"session_storage_source","path":"src/app/api/auth/login/route.ts","lines":"125-127","detail":"Login stores a SessionUser in the encrypted cookie."},{"label":"broken_authorization_control","path":"src/lib/session.ts","lines":"76-91","detail":"requireSession/requireAdmin trust the cookie SessionUser without DB revalidation."},{"label":"revocation_gap_password_reset","path":"src/app/api/users/route.ts","lines":"46-57","detail":"Password reset changes DB state but does not revoke existing cookies."},{"label":"revocation_gap_account_delete","path":"src/app/api/users/route.ts","lines":"62-73","detail":"User deletion removes DB row but does not invalidate existing cookies."},{"label":"data_mutation_sink","path":"src/app/api/entries/route.ts","lines":"35-50","detail":"Admin-only entry mutation remains reachable with a stale admin cookie."},{"label":"user_management_sink","path":"src/app/api/users/route.ts","lines":"22-73","detail":"Admin-only user management remains reachable with a stale admin cookie."}],"upstream_worker_candidates":[{"worker":"worker-06","source_candidate_id":"D8AD-W06-001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-06","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-06/findings/D8AD-W06-001/candidate_ledger.jsonl","title":"Deleted or reset users retain admin access through stale stateless session cookies"}],"discovery_artifact":"artifacts/02_discovery/finding_discovery_report.md","merge_record":"artifacts/deep_merge/round-01_merge_record.md","validation_status":"pending_centralized_validation_after_discovery_saturation","attack_path_status":"pending_centralized_attack_path_after_validation"}
{"phase":"discovery","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","round_id":"round-02-merge","candidate_id":"D8AD-CAN-003","status":"rediscovered_or_preserved_canonical_candidate","title":"Deleted or reset users retain access through stale stateless session cookies","affected_locations":[{"label":"session_storage_source","path":"src/app/api/auth/login/route.ts","lines":"125-127","detail":"Login stores a SessionUser in the encrypted cookie."},{"label":"broken_authorization_control","path":"src/lib/session.ts","lines":"76-91","detail":"requireSession/requireAdmin trust the cookie SessionUser without DB revalidation."},{"label":"revocation_gap_password_reset","path":"src/app/api/users/route.ts","lines":"46-57","detail":"Password reset changes DB state but does not revoke existing cookies."},{"label":"revocation_gap_account_delete","path":"src/app/api/users/route.ts","lines":"62-73","detail":"User deletion removes DB row but does not invalidate existing cookies."},{"label":"data_mutation_sink","path":"src/app/api/entries/route.ts","lines":"35-50","detail":"Admin-only entry mutation remains reachable with a stale admin cookie."},{"label":"user_management_sink","path":"src/app/api/users/route.ts","lines":"22-73","detail":"Admin-only user management remains reachable with a stale admin cookie."}],"upstream_worker_candidates":[{"round":"round-01-retry-02","worker":"worker-06","source_candidate_id":"D8AD-W06-001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-06","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-06/findings/D8AD-W06-001/candidate_ledger.jsonl","title":"Deleted or reset users retain admin access through stale stateless session cookies"},{"round":"round-02","worker":"worker-05","source_candidate_id":"d8adcf5f-r02w05-cand-001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-05","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-05/findings/d8adcf5f-r02w05-cand-001/candidate_ledger.jsonl","title":"Deleted or reset users can keep using previously issued cookie sessions"}],"discovery_artifact":"artifacts/02_discovery/finding_discovery_report.md","merge_record":"artifacts/deep_merge/round-02_merge_record.md","validation_status":"pending_centralized_validation_after_discovery_saturation","attack_path_status":"pending_centralized_attack_path_after_validation"}
{"phase":"discovery","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","round_id":"round-03-merge","merge_round":"round-03","row_id":"D8AD-CAN-003-round-03-merge","candidate_id":"D8AD-CAN-003","status":"preserved_canonical_candidate_no_round3_candidate","title":"Deleted or reset users retain access through stale stateless session cookies","affected_locations":[{"label":"session_storage_source","path":"src/app/api/auth/login/route.ts","lines":"125-127","detail":"Login stores a SessionUser in the encrypted cookie."},{"label":"broken_authorization_control","path":"src/lib/session.ts","lines":"76-91","detail":"requireSession/requireAdmin trust the cookie SessionUser without DB revalidation."},{"label":"revocation_gap_password_reset","path":"src/app/api/users/route.ts","lines":"46-57","detail":"Password reset changes DB state but does not revoke existing cookies."},{"label":"revocation_gap_account_delete","path":"src/app/api/users/route.ts","lines":"62-73","detail":"User deletion removes DB row but does not invalidate existing cookies."},{"label":"data_mutation_sink","path":"src/app/api/entries/route.ts","lines":"35-50","detail":"Admin-only entry mutation remains reachable with a stale admin cookie."},{"label":"user_management_sink","path":"src/app/api/users/route.ts","lines":"22-73","detail":"Admin-only user management remains reachable with a stale admin cookie."}],"upstream_worker_candidates":[{"round":"round-01-retry-02","worker":"worker-06","source_candidate_id":"D8AD-W06-001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-06","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-06/findings/D8AD-W06-001/candidate_ledger.jsonl","title":"Deleted or reset users retain admin access through stale stateless session cookies"},{"round":"round-02","worker":"worker-05","source_candidate_id":"d8adcf5f-r02w05-cand-001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-05","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-05/findings/d8adcf5f-r02w05-cand-001/candidate_ledger.jsonl","title":"Deleted or reset users can keep using previously issued cookie sessions"}],"discovery_artifact":"artifacts/02_discovery/finding_discovery_report.md","merge_record":"artifacts/deep_merge/round-03_merge_record.md","validation_status":"pending_centralized_validation_after_discovery_saturation","attack_path_status":"pending_centralized_attack_path_after_validation","created_at":"2026-07-03T16:08:37.567Z"}
{"phase":"validation","validation_round":"centralized","row_id":"D8AD-CAN-003-central-validation","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","candidate_id":"D8AD-CAN-003","disposition":"reportable","survives":"yes","confidence":"medium-high static validation","method":"static source/control/sink assessment","evidence":["Login stores the full `SessionUser` object in the encrypted session cookie at `src/app/api/auth/login/route.ts:125-127`.","`requireSession()` and `requireAdmin()` trust `session.user` and role from the cookie at `src/lib/session.ts:76-91`; no DB lookup, disabled flag, password version, session epoch, or deletion check is performed.","Password reset and user delete in `src/app/api/users/route.ts:46-73` update/delete DB state but do not revoke extant cookies or rotate a session epoch.","Admin write routes continue to trust `requireAdmin()` results for data/user mutations."],"counterevidence":"Cookie integrity depends on `SESSION_SECRET`, so attackers cannot forge arbitrary sessions. The issue is revocation after a legitimate cookie is issued, not forgery.","proof_gap":"A full Next.js cookie replay PoC was not built because static code directly establishes the stateless revocation gap; dynamic replay would improve confidence but is not needed to preserve the finding.","validation_report":"artifacts/05_findings/D8AD-CAN-003/validation_report.md","validation_artifacts":[],"created_at":"2026-07-03T16:14:29.618Z"}
{"phase":"attack_path","attack_path_round":"centralized","row_id":"D8AD-CAN-003-central-attack-path","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","candidate_id":"D8AD-CAN-003","decision":"reportable","severity":"medium","priority":"P2","confidence":"medium-high","impact":"high","likelihood":"medium","attack_path_steps":["A user logs in and receives an encrypted cookie containing `SessionUser`.","An admin resets that user password or deletes the account.","The old browser keeps sending the existing cookie until expiry.","`requireSession()`/`requireAdmin()` trusts the cookie payload and role without rechecking the user row or session epoch, so revoked admin cookies can continue using admin APIs."],"counterevidence":"Attackers cannot forge cookies without `SESSION_SECRET`; this is post-issuance revocation, not session forgery. Exposure is limited to users who already obtained a valid session.","attack_path_report":"artifacts/05_findings/D8AD-CAN-003/attack_path_analysis_report.md","created_at":"2026-07-03T16:16:06.215Z"}
```

---

## D8AD-CAN-004: Cookie-authenticated admin JSON mutation routes lack CSRF, Origin, and content-type gates

| Field | Value |
| --- | --- |
| Validation disposition | deferred |
| Survives validation | uncertain |
| Validation method | static source/control/sink assessment with browser-precondition proof gap |
| Attack-path decision | deferred |
| Attack-path severity | unknown |
| Priority |  |
| Attack-path confidence | low-medium |
| Rule ID | csrf-admin-json-mutations |
| Instance key | csrf-json-admin-mutations:src/app/api/users/route.ts:28 |
| Taxonomy | {"cwe":["CWE-352"]} |
| Coverage surface | admin-mutation-csrf (needs_follow_up) |

Coverage notes: Routes lack explicit CSRF/origin/content-type gates, but SameSite=Lax and lack of same-site hostile origin evidence prevented final reportability.

### Discovery Candidate Record

Attacker-controlled source: Browser-initiated requests from attacker-controlled content while a victim admin has a valid session cookie, strongest for same-site sibling-origin compromise or deployments where cookie SameSite behavior sends the cookie.

Vulnerable sink or broken control: Handlers rely on session cookies and zod body validation; no explicit CSRF token, Origin/Referer allowlist, or content-type gate is visible at the mutation route layer.

Impact: If cookies are sent, attacker-controlled browser content can drive privileged admin state changes including user management, KPI/category edits, and data tampering.

Why plausible: Seven worker candidates across three completed discovery rounds found the same route-layer browser request-forgery proof tuple. Round three split the same missing CSRF/origin/content-type control across user, entry, breakdown, KPI, and category POST handlers; one shared mutation-boundary remediation would address all upstream instances.

Closest apparent control: Handlers rely on session cookies and zod body validation; no explicit CSRF token, Origin/Referer allowlist, or content-type gate is visible at the mutation route layer.

Validation plan from discovery: Validate exact iron-session SameSite defaults in this version, cookie attributes in production, and whether cross-origin no-cors forms/fetches can satisfy JSON route requirements.

### Affected Locations

| Label | Path | Lines | Detail |
| --- | --- | --- | --- |
| cookie_control | src/lib/session.ts | 48-58 | Session cookie attributes are the primary browser-side CSRF control. |
| user_mutation_entrypoint | src/app/api/users/route.ts | 22-28,46-52,62-68 | User create/password/delete handlers parse JSON after admin auth. |
| data_entry_mutation_entrypoint | src/app/api/entries/route.ts | 35-42,55-63 | Entry POST/DELETE handlers parse JSON after admin auth. |
| data_entry_mutation_entrypoint | src/app/api/breakdowns/route.ts | 36-43,56-63 | Breakdown POST/DELETE handlers parse JSON after admin auth. |
| definition_mutation_entrypoint | src/app/api/kpis/route.ts | 37-43,70-76,87-93 | KPI mutation handlers parse JSON after admin auth. |
| definition_mutation_entrypoint | src/app/api/categories/route.ts | 27-33,56-62,73-79 | Category mutation handlers parse JSON after admin auth. |

### Upstream Worker Candidates

| Round | Worker | Source candidate | Title |
| --- | --- | --- | --- |
| round-01-retry-02 | worker-03 | worker-03-cand-001 | Cookie-authenticated admin JSON mutation routes lack CSRF, Origin, and content-type gates |
| round-02 | worker-02 | r02w02-c002 | Admin mutation APIs rely only on SameSite=Lax cookies and accept simple cross-origin JSON bodies without a CSRF/origin guard |
| round-03 | worker-03 | W03-CSRF-USERS-POST-001 | Admin user creation POST lacks an origin/content-type CSRF boundary |
| round-03 | worker-03 | W03-CSRF-ENTRIES-POST-001 | Admin monthly/annual entry upsert POST lacks an origin/content-type CSRF boundary |
| round-03 | worker-03 | W03-CSRF-BREAKDOWNS-POST-001 | Admin breakdown entry upsert POST lacks an origin/content-type CSRF boundary |
| round-03 | worker-03 | W03-CSRF-KPIS-POST-001 | Admin KPI definition creation POST lacks an origin/content-type CSRF boundary |
| round-03 | worker-03 | W03-CSRF-CATEGORIES-POST-001 | Admin category creation POST lacks an origin/content-type CSRF boundary |

### Validation Report

# Validation Report: D8AD-CAN-004 - Cookie-authenticated admin JSON mutation routes lack CSRF, Origin, and content-type gates

Candidate id: D8AD-CAN-004
Instance key: csrf-json-admin-mutations:src/app/api/users/route.ts:28
Disposition: deferred
Survives validation: uncertain
Confidence: medium for missing route-layer guard; low/uncertain for generic cross-site exploitability
Validation method: static source/control/sink assessment with browser-precondition proof gap

## Rubric

- [x] Claimed attacker input or trigger identified.
- [x] Closest control and sink identified with repository file/line evidence.
- [x] Existing controls and counterevidence considered.
- [x] Bounded runtime or static validation method chosen proportionately.
- [x] Candidate receives an explicit closure disposition and ledger receipt.

## Evidence Observed

- Admin mutation routes call `requireAdmin()` and then parse `req.json()` without an Origin/Referer allowlist, CSRF token, or route-level content-type enforcement.
- Affected POST/PATCH/DELETE surfaces include users, entries, breakdowns, KPIs, and categories.
- Session cookies are `httpOnly`, secure by default, and `sameSite: "lax"`, which is meaningful counterevidence against ordinary unrelated-site cross-site POST CSRF.

## Counterevidence

No repository evidence shows a user-controlled same-site sibling origin or stored HTML surface that can issue same-site admin requests. SameSite=Lax likely blocks ordinary unrelated-site POST/fetch cookie inclusion, and zod schemas constrain bodies.

## Remaining Uncertainty

Needs browser-level reproduction in the deployed cookie/origin model or evidence of a same-site hostile origin before reportability can be decided strongly.

## Affected Locations

- cookie_control: src/lib/session.ts:48-58 - Session cookie attributes are the primary browser-side CSRF control.
- user_mutation_entrypoint: src/app/api/users/route.ts:22-28,46-52,62-68 - User create/password/delete handlers parse JSON after admin auth.
- data_entry_mutation_entrypoint: src/app/api/entries/route.ts:35-42,55-63 - Entry POST/DELETE handlers parse JSON after admin auth.
- data_entry_mutation_entrypoint: src/app/api/breakdowns/route.ts:36-43,56-63 - Breakdown POST/DELETE handlers parse JSON after admin auth.
- definition_mutation_entrypoint: src/app/api/kpis/route.ts:37-43,70-76,87-93 - KPI mutation handlers parse JSON after admin auth.
- definition_mutation_entrypoint: src/app/api/categories/route.ts:27-33,56-62,73-79 - Category mutation handlers parse JSON after admin auth.

## Validation Artifacts

- None; validation used static repository evidence.

### Attack Path Report

# Attack Path Analysis: D8AD-CAN-004 - Cookie-authenticated admin JSON mutation routes lack CSRF, Origin, and content-type gates

Final policy decision: deferred
Severity: unknown
Priority: none
Confidence: low-medium

## Affected Lines

- cookie_control: src/lib/session.ts:48-58 - Session cookie attributes are the primary browser-side CSRF control.
- user_mutation_entrypoint: src/app/api/users/route.ts:22-28,46-52,62-68 - User create/password/delete handlers parse JSON after admin auth.
- data_entry_mutation_entrypoint: src/app/api/entries/route.ts:35-42,55-63 - Entry POST/DELETE handlers parse JSON after admin auth.
- data_entry_mutation_entrypoint: src/app/api/breakdowns/route.ts:36-43,56-63 - Breakdown POST/DELETE handlers parse JSON after admin auth.
- definition_mutation_entrypoint: src/app/api/kpis/route.ts:37-43,70-76,87-93 - KPI mutation handlers parse JSON after admin auth.
- definition_mutation_entrypoint: src/app/api/categories/route.ts:27-33,56-62,73-79 - Category mutation handlers parse JSON after admin auth.

## Attack Path Steps

1. Admin mutation routes rely on ambient cookie auth and parse JSON bodies after `requireAdmin()`.
2. No route-level CSRF token, Origin/Referer allowlist, or content-type enforcement is present.
3. A same-site hostile origin or other browser context that sends the admin cookie could attempt user/KPI/category/entry mutations.

## Attack Path Facts

- Assumptions: victim admin cookie required; candidate remains within the synthesized threat model only when that actor/path is realistic.
- Context: Eastern State KPI is a single-organization internal dashboard; cross-tenant impact is out of scope, while admin/session/data-integrity and developer/CI boundaries are in scope when lower-privilege actors can cross them.
- In-scope status: In scope for analysis; reportability shown by the final policy decision.
- Exposure: browser same-site/cookie-sending context unproven.
- Identity: Next.js app process, SQLite DB, admin/viewer cookie sessions, or developer/CI shell user depending on candidate.
- Cross-boundary behavior: CSRF/missing request origin boundary.
- Vector: browser same-site/cookie-sending context unproven.
- Preconditions: victim admin cookie required.
- Attacker input control: Admin mutation routes rely on ambient cookie auth and parse JSON bodies after `requireAdmin()`.
- Category: CSRF/missing request origin boundary.
- Mitigations already present: see counterevidence below.
- Auth scope: victim admin cookie required.
- Impact surface: high.
- Target reach: single application/developer workflow.
- Secrets references: none material to final decision.
- Counterevidence: Session cookies use explicit `SameSite=Lax`, which likely blocks ordinary unrelated-site POST/fetch cookies. The repo does not show a user-controlled same-site origin or stored HTML surface capable of issuing same-site requests. Browser reproduction in deployment context was not performed.
- Blindspots: deployment/log policies, browser same-site assumptions, or operational use as noted in validation where applicable.
- Controls: repository controls and recommended remediation below.
- Confidence: low-medium.

## Severity Calibration

Impact: high
Likelihood: unknown
Final severity/policy: unknown / deferred

## Remediation

If this remains in scope, add a shared admin mutation boundary: CSRF token or Origin/Referer allowlist plus enforced `Content-Type: application/json` for cookie-authenticated state changes.

### Runtime Evidence Excerpts

_No runtime artifact was produced for this candidate; validation used static repository evidence._
### Candidate Ledger

```jsonl
{"phase":"discovery","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","round_id":"round-01-retry-02","candidate_id":"D8AD-CAN-004","status":"discovered_canonical_candidate","title":"Cookie-authenticated admin JSON mutation routes lack CSRF, Origin, and content-type gates","affected_locations":[{"label":"cookie_control","path":"src/lib/session.ts","lines":"48-57","detail":"Session cookie attributes are the primary browser-side CSRF control."},{"label":"user_mutation_entrypoint","path":"src/app/api/users/route.ts","lines":"22-28,46-52,62-68","detail":"User create/password/delete handlers parse JSON after admin auth."},{"label":"data_entry_mutation_entrypoint","path":"src/app/api/entries/route.ts","lines":"35-42,55-63","detail":"Entry POST/DELETE handlers parse JSON after admin auth."},{"label":"data_entry_mutation_entrypoint","path":"src/app/api/breakdowns/route.ts","lines":"36-43,56-63","detail":"Breakdown POST/DELETE handlers parse JSON after admin auth."},{"label":"definition_mutation_entrypoint","path":"src/app/api/kpis/route.ts","lines":"37-43,70-76,87-93","detail":"KPI mutation handlers parse JSON after admin auth."},{"label":"definition_mutation_entrypoint","path":"src/app/api/categories/route.ts","lines":"27-33,56-62,73-79","detail":"Category mutation handlers parse JSON after admin auth."}],"upstream_worker_candidates":[{"worker":"worker-03","source_candidate_id":"worker-03-cand-001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-03","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-03/findings/worker-03-cand-001/candidate_ledger.jsonl","title":"Cookie-authenticated admin JSON mutation routes lack CSRF, Origin, and content-type gates"}],"discovery_artifact":"artifacts/02_discovery/finding_discovery_report.md","merge_record":"artifacts/deep_merge/round-01_merge_record.md","validation_status":"pending_centralized_validation_after_discovery_saturation","attack_path_status":"pending_centralized_attack_path_after_validation"}
{"phase":"discovery","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","round_id":"round-02-merge","candidate_id":"D8AD-CAN-004","status":"rediscovered_or_preserved_canonical_candidate","title":"Cookie-authenticated admin JSON mutation routes lack CSRF, Origin, and content-type gates","affected_locations":[{"label":"cookie_control","path":"src/lib/session.ts","lines":"48-58","detail":"Session cookie attributes are the primary browser-side CSRF control."},{"label":"user_mutation_entrypoint","path":"src/app/api/users/route.ts","lines":"22-28,46-52,62-68","detail":"User create/password/delete handlers parse JSON after admin auth."},{"label":"data_entry_mutation_entrypoint","path":"src/app/api/entries/route.ts","lines":"35-42,55-63","detail":"Entry POST/DELETE handlers parse JSON after admin auth."},{"label":"data_entry_mutation_entrypoint","path":"src/app/api/breakdowns/route.ts","lines":"36-43,56-63","detail":"Breakdown POST/DELETE handlers parse JSON after admin auth."},{"label":"definition_mutation_entrypoint","path":"src/app/api/kpis/route.ts","lines":"37-43,70-76,87-93","detail":"KPI mutation handlers parse JSON after admin auth."},{"label":"definition_mutation_entrypoint","path":"src/app/api/categories/route.ts","lines":"27-33,56-62,73-79","detail":"Category mutation handlers parse JSON after admin auth."}],"upstream_worker_candidates":[{"round":"round-01-retry-02","worker":"worker-03","source_candidate_id":"worker-03-cand-001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-03","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-03/findings/worker-03-cand-001/candidate_ledger.jsonl","title":"Cookie-authenticated admin JSON mutation routes lack CSRF, Origin, and content-type gates"},{"round":"round-02","worker":"worker-02","source_candidate_id":"r02w02-c002","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-02","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-02/findings/r02w02-c002/candidate_ledger.jsonl","title":"Admin mutation APIs rely only on SameSite=Lax cookies and accept simple cross-origin JSON bodies without a CSRF/origin guard"}],"discovery_artifact":"artifacts/02_discovery/finding_discovery_report.md","merge_record":"artifacts/deep_merge/round-02_merge_record.md","validation_status":"pending_centralized_validation_after_discovery_saturation","attack_path_status":"pending_centralized_attack_path_after_validation"}
{"phase":"discovery","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","round_id":"round-03-merge","merge_round":"round-03","row_id":"D8AD-CAN-004-round-03-merge","candidate_id":"D8AD-CAN-004","status":"rediscovered_or_preserved_canonical_candidate","title":"Cookie-authenticated admin JSON mutation routes lack CSRF, Origin, and content-type gates","affected_locations":[{"label":"cookie_control","path":"src/lib/session.ts","lines":"48-58","detail":"Session cookie attributes are the primary browser-side CSRF control."},{"label":"user_mutation_entrypoint","path":"src/app/api/users/route.ts","lines":"22-28,46-52,62-68","detail":"User create/password/delete handlers parse JSON after admin auth."},{"label":"data_entry_mutation_entrypoint","path":"src/app/api/entries/route.ts","lines":"35-42,55-63","detail":"Entry POST/DELETE handlers parse JSON after admin auth."},{"label":"data_entry_mutation_entrypoint","path":"src/app/api/breakdowns/route.ts","lines":"36-43,56-63","detail":"Breakdown POST/DELETE handlers parse JSON after admin auth."},{"label":"definition_mutation_entrypoint","path":"src/app/api/kpis/route.ts","lines":"37-43,70-76,87-93","detail":"KPI mutation handlers parse JSON after admin auth."},{"label":"definition_mutation_entrypoint","path":"src/app/api/categories/route.ts","lines":"27-33,56-62,73-79","detail":"Category mutation handlers parse JSON after admin auth."}],"upstream_worker_candidates":[{"round":"round-01-retry-02","worker":"worker-03","source_candidate_id":"worker-03-cand-001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-03","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-03/findings/worker-03-cand-001/candidate_ledger.jsonl","title":"Cookie-authenticated admin JSON mutation routes lack CSRF, Origin, and content-type gates"},{"round":"round-02","worker":"worker-02","source_candidate_id":"r02w02-c002","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-02","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-02/findings/r02w02-c002/candidate_ledger.jsonl","title":"Admin mutation APIs rely only on SameSite=Lax cookies and accept simple cross-origin JSON bodies without a CSRF/origin guard"},{"round":"round-03","worker":"worker-03","source_candidate_id":"W03-CSRF-USERS-POST-001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-03/worker-03","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-03/worker-03/findings/W03-CSRF-USERS-POST-001/candidate_ledger.jsonl","title":"Admin user creation POST lacks an origin/content-type CSRF boundary"},{"round":"round-03","worker":"worker-03","source_candidate_id":"W03-CSRF-ENTRIES-POST-001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-03/worker-03","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-03/worker-03/findings/W03-CSRF-ENTRIES-POST-001/candidate_ledger.jsonl","title":"Admin monthly/annual entry upsert POST lacks an origin/content-type CSRF boundary"},{"round":"round-03","worker":"worker-03","source_candidate_id":"W03-CSRF-BREAKDOWNS-POST-001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-03/worker-03","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-03/worker-03/findings/W03-CSRF-BREAKDOWNS-POST-001/candidate_ledger.jsonl","title":"Admin breakdown entry upsert POST lacks an origin/content-type CSRF boundary"},{"round":"round-03","worker":"worker-03","source_candidate_id":"W03-CSRF-KPIS-POST-001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-03/worker-03","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-03/worker-03/findings/W03-CSRF-KPIS-POST-001/candidate_ledger.jsonl","title":"Admin KPI definition creation POST lacks an origin/content-type CSRF boundary"},{"round":"round-03","worker":"worker-03","source_candidate_id":"W03-CSRF-CATEGORIES-POST-001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-03/worker-03","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-03/worker-03/findings/W03-CSRF-CATEGORIES-POST-001/candidate_ledger.jsonl","title":"Admin category creation POST lacks an origin/content-type CSRF boundary"}],"discovery_artifact":"artifacts/02_discovery/finding_discovery_report.md","merge_record":"artifacts/deep_merge/round-03_merge_record.md","validation_status":"pending_centralized_validation_after_discovery_saturation","attack_path_status":"pending_centralized_attack_path_after_validation","created_at":"2026-07-03T16:08:37.567Z"}
{"phase":"validation","validation_round":"centralized","row_id":"D8AD-CAN-004-central-validation","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","candidate_id":"D8AD-CAN-004","disposition":"deferred","survives":"uncertain","confidence":"medium for missing route-layer guard; low/uncertain for generic cross-site exploitability","method":"static source/control/sink assessment with browser-precondition proof gap","evidence":["Admin mutation routes call `requireAdmin()` and then parse `req.json()` without an Origin/Referer allowlist, CSRF token, or route-level content-type enforcement.","Affected POST/PATCH/DELETE surfaces include users, entries, breakdowns, KPIs, and categories.","Session cookies are `httpOnly`, secure by default, and `sameSite: \"lax\"`, which is meaningful counterevidence against ordinary unrelated-site cross-site POST CSRF."],"counterevidence":"No repository evidence shows a user-controlled same-site sibling origin or stored HTML surface that can issue same-site admin requests. SameSite=Lax likely blocks ordinary unrelated-site POST/fetch cookie inclusion, and zod schemas constrain bodies.","proof_gap":"Needs browser-level reproduction in the deployed cookie/origin model or evidence of a same-site hostile origin before reportability can be decided strongly.","validation_report":"artifacts/05_findings/D8AD-CAN-004/validation_report.md","validation_artifacts":[],"created_at":"2026-07-03T16:14:29.618Z"}
{"phase":"attack_path","attack_path_round":"centralized","row_id":"D8AD-CAN-004-central-attack-path","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","candidate_id":"D8AD-CAN-004","decision":"deferred","severity":"unknown","priority":null,"confidence":"low-medium","impact":"high","likelihood":"unknown","attack_path_steps":["Admin mutation routes rely on ambient cookie auth and parse JSON bodies after `requireAdmin()`.","No route-level CSRF token, Origin/Referer allowlist, or content-type enforcement is present.","A same-site hostile origin or other browser context that sends the admin cookie could attempt user/KPI/category/entry mutations."],"counterevidence":"Session cookies use explicit `SameSite=Lax`, which likely blocks ordinary unrelated-site POST/fetch cookies. The repo does not show a user-controlled same-site origin or stored HTML surface capable of issuing same-site requests. Browser reproduction in deployment context was not performed.","attack_path_report":"artifacts/05_findings/D8AD-CAN-004/attack_path_analysis_report.md","created_at":"2026-07-03T16:16:06.215Z"}
```

---

## D8AD-CAN-005: KPI/category deletion can hide durable edit-history rows from the admin history endpoint

| Field | Value |
| --- | --- |
| Validation disposition | reportable |
| Survives validation | yes |
| Validation method | disposable runtime reproduction plus static trace |
| Attack-path decision | reportable |
| Attack-path severity | low |
| Priority | P3 |
| Attack-path confidence | high behavior / medium security |
| Rule ID | audit-history-hidden-by-delete |
| Instance key | audit-history-integrity:src/lib/repository.ts:769 |
| Taxonomy | {"cwe":["CWE-778","CWE-664"]} |
| Coverage surface | audit-history-visibility (reported) |

Coverage notes: Runtime reproduction confirmed durable rows disappear from the joined history listing; reported as D8AD-CAN-005.

### Discovery Candidate Record

Attacker-controlled source: Authenticated admin, compromised admin session, or successful privileged request forgery deletes KPI/category metadata after prior entry changes exist.

Vulnerable sink or broken control: entry_history rows survive, but the admin history browser relies on INNER JOINs to current KPI/category rows, so deleted metadata can suppress visibility of historical records.

Impact: A malicious or compromised admin can reduce audit visibility for prior KPI-entry changes, weakening incident review and audit-trail integrity.

Why plausible: The proof tuple is audit-integrity specific and not fixed by authentication or CSRF alone; preserving history visibility needs query/schema behavior changes.

Closest apparent control: entry_history rows survive, but the admin history browser relies on INNER JOINs to current KPI/category rows, so deleted metadata can suppress visibility of historical records.

Validation plan from discovery: Validate by creating an entry, deleting its KPI/category, then checking whether /api/entries/history omits existing entry_history rows.

### Affected Locations

| Label | Path | Lines | Detail |
| --- | --- | --- | --- |
| history_schema | src/lib/db.ts | 208-226 | entry_history persists before/after values and references source entries. |
| history_query | src/lib/repository.ts | 763-777 | History listing inner-joins current KPI/category metadata. |
| history_entrypoint | src/app/api/entries/history/route.ts | 18-34 | Admin history endpoint returns the joined history listing. |
| kpi_delete_sink | src/app/api/kpis/route.ts | 87-98 | Admin route deletes KPI definitions. |
| kpi_delete_sink | src/lib/repository.ts | 360-362 | Repository deletes KPI rows. |
| category_delete_sink | src/app/api/categories/route.ts | 73-84 | Admin route deletes categories. |
| category_delete_sink | src/lib/repository.ts | 209-211 | Repository deletes category rows. |

### Upstream Worker Candidates

| Round | Worker | Source candidate | Title |
| --- | --- | --- | --- |
| round-01-retry-02 | worker-03 | worker-03-cand-002 | KPI/category deletion can hide durable edit-history rows from the admin history endpoint |

### Validation Report

# Validation Report: D8AD-CAN-005 - KPI/category deletion can hide durable edit-history rows from the admin history endpoint

Candidate id: D8AD-CAN-005
Instance key: audit-history-integrity:src/lib/repository.ts:769
Disposition: reportable
Survives validation: yes
Confidence: high behavior / medium security impact
Validation method: disposable runtime reproduction plus static trace

## Rubric

- [x] Claimed attacker input or trigger identified.
- [x] Closest control and sink identified with repository file/line evidence.
- [x] Existing controls and counterevidence considered.
- [x] Bounded runtime or static validation method chosen proportionately.
- [x] Candidate receives an explicit closure disposition and ledger receipt.

## Evidence Observed

- Disposable DB reproduction created a KPI entry and history row, then deleted the KPI. Raw SQL still found `entry_history` row count 1 for that KPI, but `listEntryHistory()` returned 0 rows after delete.
- Static schema comments state history itself is durable, but `listEntryHistory()` inner-joins `kpis` and `categories`, so deleted metadata hides history rows from the admin browser/API.
- Admin category/KPI delete routes call repository delete helpers that remove rows referenced by the history join.

## Counterevidence

The actor must be admin or able to induce/admin-compromise an admin action; this is audit visibility/integrity impact, not direct unauthenticated data access.

## Remaining Uncertainty

Need product policy on whether admins are expected to be able to remove metadata while retaining visible history; behavior is confirmed.

## Affected Locations

- history_schema: src/lib/db.ts:208-226 - entry_history persists before/after values and references source entries.
- history_query: src/lib/repository.ts:763-777 - History listing inner-joins current KPI/category metadata.
- history_entrypoint: src/app/api/entries/history/route.ts:18-34 - Admin history endpoint returns the joined history listing.
- kpi_delete_sink: src/app/api/kpis/route.ts:87-98 - Admin route deletes KPI definitions.
- kpi_delete_sink: src/lib/repository.ts:360-362 - Repository deletes KPI rows.
- category_delete_sink: src/app/api/categories/route.ts:73-84 - Admin route deletes categories.
- category_delete_sink: src/lib/repository.ts:209-211 - Repository deletes category rows.

## Validation Artifacts

- artifacts/05_findings/D8AD-CAN-005/validation_artifacts/D8AD-CAN-005-audit-history-delete.log

### Attack Path Report

# Attack Path Analysis: D8AD-CAN-005 - KPI/category deletion can hide durable edit-history rows from the admin history endpoint

Final policy decision: reportable
Severity: low
Priority: P3
Confidence: high behavior / medium security

## Affected Lines

- history_schema: src/lib/db.ts:208-226 - entry_history persists before/after values and references source entries.
- history_query: src/lib/repository.ts:763-777 - History listing inner-joins current KPI/category metadata.
- history_entrypoint: src/app/api/entries/history/route.ts:18-34 - Admin history endpoint returns the joined history listing.
- kpi_delete_sink: src/app/api/kpis/route.ts:87-98 - Admin route deletes KPI definitions.
- kpi_delete_sink: src/lib/repository.ts:360-362 - Repository deletes KPI rows.
- category_delete_sink: src/app/api/categories/route.ts:73-84 - Admin route deletes categories.
- category_delete_sink: src/lib/repository.ts:209-211 - Repository deletes category rows.

## Attack Path Steps

1. An admin or induced admin action changes a KPI entry, creating a durable `entry_history` row.
2. The same admin deletes the KPI or category metadata.
3. Raw `entry_history` rows survive, but `listEntryHistory()` inner-joins current KPI/category rows.
4. The admin history API/browser omits the surviving history rows, reducing audit visibility for prior changes.

## Attack Path Facts

- Assumptions: admin required; candidate remains within the synthesized threat model only when that actor/path is realistic.
- Context: Eastern State KPI is a single-organization internal dashboard; cross-tenant impact is out of scope, while admin/session/data-integrity and developer/CI boundaries are in scope when lower-privilege actors can cross them.
- In-scope status: In scope for analysis; reportability shown by the final policy decision.
- Exposure: remote authenticated admin or compromised admin browser.
- Identity: Next.js app process, SQLite DB, admin/viewer cookie sessions, or developer/CI shell user depending on candidate.
- Cross-boundary behavior: audit trail visibility integrity.
- Vector: remote authenticated admin or compromised admin browser.
- Preconditions: admin required.
- Attacker input control: An admin or induced admin action changes a KPI entry, creating a durable `entry_history` row.
- Category: audit trail visibility integrity.
- Mitigations already present: see counterevidence below.
- Auth scope: admin required.
- Impact surface: medium.
- Target reach: single application/developer workflow.
- Secrets references: none material to final decision.
- Counterevidence: The actor already needs admin authority or an admin-compromise path. This does not give unauthenticated access or direct privilege escalation; it weakens integrity/auditability after privileged metadata deletion.
- Blindspots: deployment/log policies, browser same-site assumptions, or operational use as noted in validation where applicable.
- Controls: repository controls and recommended remediation below.
- Confidence: high behavior / medium security.

## Severity Calibration

Impact: medium
Likelihood: medium
Final severity/policy: low / reportable

## Remediation

Make the history listing resilient to deleted metadata: denormalize snapshot labels/slugs into `entry_history`, use left joins with tombstone metadata, or prevent deletion while history exists.

### Runtime Evidence Excerpts

Artifact: `artifacts/05_findings/D8AD-CAN-005/validation_artifacts/D8AD-CAN-005-audit-history-delete.log`

```
command: disposable tsx audit-history validation
exit: 0
stdout:
{"kpi_id":1,"history_before_delete":1,"raw_history_rows_after_delete":1,"listed_history_rows_after_delete":0}

stderr:
```

### Candidate Ledger

```jsonl
{"phase":"discovery","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","round_id":"round-01-retry-02","candidate_id":"D8AD-CAN-005","status":"discovered_canonical_candidate","title":"KPI/category deletion can hide durable edit-history rows from the admin history endpoint","affected_locations":[{"label":"history_schema","path":"src/lib/db.ts","lines":"208-226","detail":"entry_history persists before/after values and references source entries."},{"label":"history_query","path":"src/lib/repository.ts","lines":"763-777","detail":"History listing inner-joins current KPI/category metadata."},{"label":"history_entrypoint","path":"src/app/api/entries/history/route.ts","lines":"18-34","detail":"Admin history endpoint returns the joined history listing."},{"label":"kpi_delete_sink","path":"src/app/api/kpis/route.ts","lines":"87-98","detail":"Admin route deletes KPI definitions."},{"label":"kpi_delete_sink","path":"src/lib/repository.ts","lines":"360-362","detail":"Repository deletes KPI rows."},{"label":"category_delete_sink","path":"src/app/api/categories/route.ts","lines":"73-84","detail":"Admin route deletes categories."},{"label":"category_delete_sink","path":"src/lib/repository.ts","lines":"209-211","detail":"Repository deletes category rows."}],"upstream_worker_candidates":[{"worker":"worker-03","source_candidate_id":"worker-03-cand-002","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-03","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-03/findings/worker-03-cand-002/candidate_ledger.jsonl","title":"KPI/category deletion can hide durable edit-history rows from the admin history endpoint"}],"discovery_artifact":"artifacts/02_discovery/finding_discovery_report.md","merge_record":"artifacts/deep_merge/round-01_merge_record.md","validation_status":"pending_centralized_validation_after_discovery_saturation","attack_path_status":"pending_centralized_attack_path_after_validation"}
{"phase":"discovery","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","round_id":"round-02-merge","candidate_id":"D8AD-CAN-005","status":"rediscovered_or_preserved_canonical_candidate","title":"KPI/category deletion can hide durable edit-history rows from the admin history endpoint","affected_locations":[{"label":"history_schema","path":"src/lib/db.ts","lines":"208-226","detail":"entry_history persists before/after values and references source entries."},{"label":"history_query","path":"src/lib/repository.ts","lines":"763-777","detail":"History listing inner-joins current KPI/category metadata."},{"label":"history_entrypoint","path":"src/app/api/entries/history/route.ts","lines":"18-34","detail":"Admin history endpoint returns the joined history listing."},{"label":"kpi_delete_sink","path":"src/app/api/kpis/route.ts","lines":"87-98","detail":"Admin route deletes KPI definitions."},{"label":"kpi_delete_sink","path":"src/lib/repository.ts","lines":"360-362","detail":"Repository deletes KPI rows."},{"label":"category_delete_sink","path":"src/app/api/categories/route.ts","lines":"73-84","detail":"Admin route deletes categories."},{"label":"category_delete_sink","path":"src/lib/repository.ts","lines":"209-211","detail":"Repository deletes category rows."}],"upstream_worker_candidates":[{"round":"round-01-retry-02","worker":"worker-03","source_candidate_id":"worker-03-cand-002","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-03","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-03/findings/worker-03-cand-002/candidate_ledger.jsonl","title":"KPI/category deletion can hide durable edit-history rows from the admin history endpoint"}],"discovery_artifact":"artifacts/02_discovery/finding_discovery_report.md","merge_record":"artifacts/deep_merge/round-02_merge_record.md","validation_status":"pending_centralized_validation_after_discovery_saturation","attack_path_status":"pending_centralized_attack_path_after_validation"}
{"phase":"discovery","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","round_id":"round-03-merge","merge_round":"round-03","row_id":"D8AD-CAN-005-round-03-merge","candidate_id":"D8AD-CAN-005","status":"preserved_canonical_candidate_no_round3_candidate","title":"KPI/category deletion can hide durable edit-history rows from the admin history endpoint","affected_locations":[{"label":"history_schema","path":"src/lib/db.ts","lines":"208-226","detail":"entry_history persists before/after values and references source entries."},{"label":"history_query","path":"src/lib/repository.ts","lines":"763-777","detail":"History listing inner-joins current KPI/category metadata."},{"label":"history_entrypoint","path":"src/app/api/entries/history/route.ts","lines":"18-34","detail":"Admin history endpoint returns the joined history listing."},{"label":"kpi_delete_sink","path":"src/app/api/kpis/route.ts","lines":"87-98","detail":"Admin route deletes KPI definitions."},{"label":"kpi_delete_sink","path":"src/lib/repository.ts","lines":"360-362","detail":"Repository deletes KPI rows."},{"label":"category_delete_sink","path":"src/app/api/categories/route.ts","lines":"73-84","detail":"Admin route deletes categories."},{"label":"category_delete_sink","path":"src/lib/repository.ts","lines":"209-211","detail":"Repository deletes category rows."}],"upstream_worker_candidates":[{"round":"round-01-retry-02","worker":"worker-03","source_candidate_id":"worker-03-cand-002","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-03","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-03/findings/worker-03-cand-002/candidate_ledger.jsonl","title":"KPI/category deletion can hide durable edit-history rows from the admin history endpoint"}],"discovery_artifact":"artifacts/02_discovery/finding_discovery_report.md","merge_record":"artifacts/deep_merge/round-03_merge_record.md","validation_status":"pending_centralized_validation_after_discovery_saturation","attack_path_status":"pending_centralized_attack_path_after_validation","created_at":"2026-07-03T16:08:37.567Z"}
{"phase":"validation","validation_round":"centralized","row_id":"D8AD-CAN-005-central-validation","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","candidate_id":"D8AD-CAN-005","disposition":"reportable","survives":"yes","confidence":"high behavior / medium security impact","method":"disposable runtime reproduction plus static trace","evidence":["Disposable DB reproduction created a KPI entry and history row, then deleted the KPI. Raw SQL still found `entry_history` row count 1 for that KPI, but `listEntryHistory()` returned 0 rows after delete.","Static schema comments state history itself is durable, but `listEntryHistory()` inner-joins `kpis` and `categories`, so deleted metadata hides history rows from the admin browser/API.","Admin category/KPI delete routes call repository delete helpers that remove rows referenced by the history join."],"counterevidence":"The actor must be admin or able to induce/admin-compromise an admin action; this is audit visibility/integrity impact, not direct unauthenticated data access.","proof_gap":"Need product policy on whether admins are expected to be able to remove metadata while retaining visible history; behavior is confirmed.","validation_report":"artifacts/05_findings/D8AD-CAN-005/validation_report.md","validation_artifacts":["artifacts/05_findings/D8AD-CAN-005/validation_artifacts/D8AD-CAN-005-audit-history-delete.log"],"created_at":"2026-07-03T16:14:29.618Z"}
{"phase":"attack_path","attack_path_round":"centralized","row_id":"D8AD-CAN-005-central-attack-path","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","candidate_id":"D8AD-CAN-005","decision":"reportable","severity":"low","priority":"P3","confidence":"high behavior / medium security","impact":"medium","likelihood":"medium","attack_path_steps":["An admin or induced admin action changes a KPI entry, creating a durable `entry_history` row.","The same admin deletes the KPI or category metadata.","Raw `entry_history` rows survive, but `listEntryHistory()` inner-joins current KPI/category rows.","The admin history API/browser omits the surviving history rows, reducing audit visibility for prior changes."],"counterevidence":"The actor already needs admin authority or an admin-compromise path. This does not give unauthenticated access or direct privilege escalation; it weakens integrity/auditability after privileged metadata deletion.","attack_path_report":"artifacts/05_findings/D8AD-CAN-005/attack_path_analysis_report.md","created_at":"2026-07-03T16:16:06.215Z"}
```

---

## D8AD-CAN-006: GET /api/entries accepts unbounded repeated year filters into a dynamic SQL IN list

| Field | Value |
| --- | --- |
| Validation disposition | suppressed |
| Survives validation | no |
| Validation method | disposable repository runtime stress check plus static trace |
| Attack-path decision | ignore |
| Attack-path severity | ignore |
| Priority |  |
| Attack-path confidence | medium |
| Rule ID | unbounded-year-filter-entries |
| Instance key | dos-sql-placeholder:src/app/api/entries/route.ts:22 |
| Taxonomy | {"cwe":["CWE-400"]} |
| Coverage surface | entries-year-filters (rejected) |

Coverage notes: Values are parameter-bound and a 40k-value runtime check completed without material failure.

### Discovery Candidate Record

Attacker-controlled source: Authenticated viewer or admin can send an arbitrary number of repeated year query parameters to /api/entries.

Vulnerable sink or broken control: Values are parameter-bound, so SQL injection is not apparent, but there is no maximum length before SQL string and parameter-array construction.

Impact: A low-privileged authenticated user can force large SQL preparation and response work, plausibly degrading dashboard API availability.

Why plausible: This endpoint is independently reachable and must remain separate from the breakdowns endpoint because each has its own route and repository sink.

Closest apparent control: Values are parameter-bound, so SQL injection is not apparent, but there is no maximum length before SQL string and parameter-array construction.

Validation plan from discovery: Validate practical parameter limits, SQLite variable caps, route/runtime request limits, and whether the issue is material under expected auth and deployment constraints.

### Affected Locations

| Label | Path | Lines | Detail |
| --- | --- | --- | --- |
| entrypoint_source | src/app/api/entries/route.ts | 22-24 | The route reads all repeated year query parameters. |
| closest_control | src/app/api/entries/route.ts | 10-24 | requireSession authenticates but no count bound is applied. |
| sink_broken_control | src/lib/repository.ts | 388-401 | The year list is expanded into a dynamic SQL IN placeholder list. |

### Upstream Worker Candidates

| Round | Worker | Source candidate | Title |
| --- | --- | --- | --- |
| round-01-retry-02 | worker-04 | ESKPI-W04-CAN-001 | GET /api/entries accepts unbounded repeated year filters into a dynamic SQL IN list |

### Validation Report

# Validation Report: D8AD-CAN-006 - GET /api/entries accepts unbounded repeated year filters into a dynamic SQL IN list

Candidate id: D8AD-CAN-006
Instance key: dos-sql-placeholder:src/app/api/entries/route.ts:22
Disposition: suppressed
Survives validation: no
Confidence: medium
Validation method: disposable repository runtime stress check plus static trace

## Rubric

- [x] Claimed attacker input or trigger identified.
- [x] Closest control and sink identified with repository file/line evidence.
- [x] Existing controls and counterevidence considered.
- [x] Bounded runtime or static validation method chosen proportionately.
- [x] Candidate receives an explicit closure disposition and ledger receipt.

## Evidence Observed

- Static trace confirms repeated `year` query params are expanded into a dynamic placeholder list.
- Disposable repository check with 40,000 year values completed successfully for `listEntries()` without error in the local SQLite runtime.

## Counterevidence

Values are parameter-bound, the route requires an authenticated session, 40k parameters did not trigger a practical failure, and no severe availability impact was demonstrated.

## Remaining Uncertainty

A much larger request might consume CPU/memory, but no material DoS was shown within bounded validation.

## Affected Locations

- entrypoint_source: src/app/api/entries/route.ts:22-24 - The route reads all repeated year query parameters.
- closest_control: src/app/api/entries/route.ts:10-24 - requireSession authenticates but no count bound is applied.
- sink_broken_control: src/lib/repository.ts:388-401 - The year list is expanded into a dynamic SQL IN placeholder list.

## Validation Artifacts

- artifacts/05_findings/D8AD-CAN-006/validation_artifacts/D8AD-CAN-006-007-unbounded-years.log

### Attack Path Report

# Attack Path Analysis: D8AD-CAN-006 - GET /api/entries accepts unbounded repeated year filters into a dynamic SQL IN list

Final policy decision: ignore
Severity: ignore
Priority: none
Confidence: medium

## Affected Lines

- entrypoint_source: src/app/api/entries/route.ts:22-24 - The route reads all repeated year query parameters.
- closest_control: src/app/api/entries/route.ts:10-24 - requireSession authenticates but no count bound is applied.
- sink_broken_control: src/lib/repository.ts:388-401 - The year list is expanded into a dynamic SQL IN placeholder list.

## Attack Path Steps

1. Authenticated clients can repeat `year` filters on `/api/entries`.
2. The repository expands placeholders dynamically.
3. A 40,000-value disposable runtime check completed without error and values are parameter-bound.

## Attack Path Facts

- Assumptions: viewer/admin session required; candidate remains within the synthesized threat model only when that actor/path is realistic.
- Context: Eastern State KPI is a single-organization internal dashboard; cross-tenant impact is out of scope, while admin/session/data-integrity and developer/CI boundaries are in scope when lower-privilege actors can cross them.
- In-scope status: Not reportable after validation and policy adjustment.
- Exposure: remote authenticated.
- Identity: Next.js app process, SQLite DB, admin/viewer cookie sessions, or developer/CI shell user depending on candidate.
- Cross-boundary behavior: suppressed availability hypothesis.
- Vector: remote authenticated.
- Preconditions: viewer/admin session required.
- Attacker input control: Authenticated clients can repeat `year` filters on `/api/entries`.
- Category: suppressed availability hypothesis.
- Mitigations already present: see counterevidence below.
- Auth scope: viewer/admin session required.
- Impact surface: low.
- Target reach: single application/developer workflow.
- Secrets references: none material to final decision.
- Counterevidence: No practical availability impact was demonstrated, SQL injection is not present, and the endpoint requires authentication. The bounded test weakens reportability.
- Blindspots: deployment/log policies, browser same-site assumptions, or operational use as noted in validation where applicable.
- Controls: repository controls and recommended remediation below.
- Confidence: medium.

## Severity Calibration

Impact: low
Likelihood: low
Final severity/policy: ignore / ignore

## Remediation

Optionally cap repeated year filters for robustness, but this scan does not treat the candidate as a reportable security issue.

### Runtime Evidence Excerpts

Artifact: `artifacts/05_findings/D8AD-CAN-006/validation_artifacts/D8AD-CAN-006-007-unbounded-years.log`

```
command: disposable tsx oversized years validation
exit: 0
stdout:
{"endpoint":"entries","result":"completed"}
{"endpoint":"breakdowns","result":"completed"}

stderr:
```

### Candidate Ledger

```jsonl
{"phase":"discovery","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","round_id":"round-01-retry-02","candidate_id":"D8AD-CAN-006","status":"discovered_canonical_candidate","title":"GET /api/entries accepts unbounded repeated year filters into a dynamic SQL IN list","affected_locations":[{"label":"entrypoint_source","path":"src/app/api/entries/route.ts","lines":"22-24","detail":"The route reads all repeated year query parameters."},{"label":"closest_control","path":"src/app/api/entries/route.ts","lines":"10-24","detail":"requireSession authenticates but no count bound is applied."},{"label":"sink_broken_control","path":"src/lib/repository.ts","lines":"388-401","detail":"The year list is expanded into a dynamic SQL IN placeholder list."}],"upstream_worker_candidates":[{"worker":"worker-04","source_candidate_id":"ESKPI-W04-CAN-001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-04","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-04/findings/ESKPI-W04-CAN-001/candidate_ledger.jsonl","title":"GET /api/entries accepts unbounded repeated year filters into a dynamic SQL IN list"}],"discovery_artifact":"artifacts/02_discovery/finding_discovery_report.md","merge_record":"artifacts/deep_merge/round-01_merge_record.md","validation_status":"pending_centralized_validation_after_discovery_saturation","attack_path_status":"pending_centralized_attack_path_after_validation"}
{"phase":"discovery","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","round_id":"round-02-merge","candidate_id":"D8AD-CAN-006","status":"rediscovered_or_preserved_canonical_candidate","title":"GET /api/entries accepts unbounded repeated year filters into a dynamic SQL IN list","affected_locations":[{"label":"entrypoint_source","path":"src/app/api/entries/route.ts","lines":"22-24","detail":"The route reads all repeated year query parameters."},{"label":"closest_control","path":"src/app/api/entries/route.ts","lines":"10-24","detail":"requireSession authenticates but no count bound is applied."},{"label":"sink_broken_control","path":"src/lib/repository.ts","lines":"388-401","detail":"The year list is expanded into a dynamic SQL IN placeholder list."}],"upstream_worker_candidates":[{"round":"round-01-retry-02","worker":"worker-04","source_candidate_id":"ESKPI-W04-CAN-001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-04","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-04/findings/ESKPI-W04-CAN-001/candidate_ledger.jsonl","title":"GET /api/entries accepts unbounded repeated year filters into a dynamic SQL IN list"}],"discovery_artifact":"artifacts/02_discovery/finding_discovery_report.md","merge_record":"artifacts/deep_merge/round-02_merge_record.md","validation_status":"pending_centralized_validation_after_discovery_saturation","attack_path_status":"pending_centralized_attack_path_after_validation"}
{"phase":"discovery","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","round_id":"round-03-merge","merge_round":"round-03","row_id":"D8AD-CAN-006-round-03-merge","candidate_id":"D8AD-CAN-006","status":"preserved_canonical_candidate_no_round3_candidate","title":"GET /api/entries accepts unbounded repeated year filters into a dynamic SQL IN list","affected_locations":[{"label":"entrypoint_source","path":"src/app/api/entries/route.ts","lines":"22-24","detail":"The route reads all repeated year query parameters."},{"label":"closest_control","path":"src/app/api/entries/route.ts","lines":"10-24","detail":"requireSession authenticates but no count bound is applied."},{"label":"sink_broken_control","path":"src/lib/repository.ts","lines":"388-401","detail":"The year list is expanded into a dynamic SQL IN placeholder list."}],"upstream_worker_candidates":[{"round":"round-01-retry-02","worker":"worker-04","source_candidate_id":"ESKPI-W04-CAN-001","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-04","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-04/findings/ESKPI-W04-CAN-001/candidate_ledger.jsonl","title":"GET /api/entries accepts unbounded repeated year filters into a dynamic SQL IN list"}],"discovery_artifact":"artifacts/02_discovery/finding_discovery_report.md","merge_record":"artifacts/deep_merge/round-03_merge_record.md","validation_status":"pending_centralized_validation_after_discovery_saturation","attack_path_status":"pending_centralized_attack_path_after_validation","created_at":"2026-07-03T16:08:37.567Z"}
{"phase":"validation","validation_round":"centralized","row_id":"D8AD-CAN-006-central-validation","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","candidate_id":"D8AD-CAN-006","disposition":"suppressed","survives":"no","confidence":"medium","method":"disposable repository runtime stress check plus static trace","evidence":["Static trace confirms repeated `year` query params are expanded into a dynamic placeholder list.","Disposable repository check with 40,000 year values completed successfully for `listEntries()` without error in the local SQLite runtime."],"counterevidence":"Values are parameter-bound, the route requires an authenticated session, 40k parameters did not trigger a practical failure, and no severe availability impact was demonstrated.","proof_gap":"A much larger request might consume CPU/memory, but no material DoS was shown within bounded validation.","validation_report":"artifacts/05_findings/D8AD-CAN-006/validation_report.md","validation_artifacts":["artifacts/05_findings/D8AD-CAN-006/validation_artifacts/D8AD-CAN-006-007-unbounded-years.log"],"created_at":"2026-07-03T16:14:29.618Z"}
{"phase":"attack_path","attack_path_round":"centralized","row_id":"D8AD-CAN-006-central-attack-path","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","candidate_id":"D8AD-CAN-006","decision":"ignore","severity":"ignore","priority":null,"confidence":"medium","impact":"low","likelihood":"low","attack_path_steps":["Authenticated clients can repeat `year` filters on `/api/entries`.","The repository expands placeholders dynamically.","A 40,000-value disposable runtime check completed without error and values are parameter-bound."],"counterevidence":"No practical availability impact was demonstrated, SQL injection is not present, and the endpoint requires authentication. The bounded test weakens reportability.","attack_path_report":"artifacts/05_findings/D8AD-CAN-006/attack_path_analysis_report.md","created_at":"2026-07-03T16:16:06.215Z"}
```

---

## D8AD-CAN-007: GET /api/breakdowns accepts unbounded repeated year filters into a dynamic SQL IN list

| Field | Value |
| --- | --- |
| Validation disposition | suppressed |
| Survives validation | no |
| Validation method | disposable repository runtime stress check plus static trace |
| Attack-path decision | ignore |
| Attack-path severity | ignore |
| Priority |  |
| Attack-path confidence | medium |
| Rule ID | unbounded-year-filter-breakdowns |
| Instance key | dos-sql-placeholder:src/app/api/breakdowns/route.ts:22 |
| Taxonomy | {"cwe":["CWE-400"]} |
| Coverage surface | breakdowns-year-filters (rejected) |

Coverage notes: Values are parameter-bound and a 40k-value runtime check completed without material failure.

### Discovery Candidate Record

Attacker-controlled source: Authenticated viewer or admin can send an arbitrary number of repeated year query parameters to /api/breakdowns.

Vulnerable sink or broken control: Values are parameter-bound, so SQL injection is not apparent, but there is no maximum length before SQL string and parameter-array construction.

Impact: A low-privileged authenticated user can force large SQL preparation and response work, plausibly degrading dashboard API availability.

Why plausible: This endpoint is independently reachable and must remain separate from entries because the sink and API surface are distinct.

Closest apparent control: Values are parameter-bound, so SQL injection is not apparent, but there is no maximum length before SQL string and parameter-array construction.

Validation plan from discovery: Validate practical parameter limits, SQLite variable caps, route/runtime request limits, and whether the issue is material under expected auth and deployment constraints.

### Affected Locations

| Label | Path | Lines | Detail |
| --- | --- | --- | --- |
| entrypoint_source | src/app/api/breakdowns/route.ts | 22-24 | The route reads all repeated year query parameters. |
| closest_control | src/app/api/breakdowns/route.ts | 10-24 | requireSession authenticates but no count bound is applied. |
| sink_broken_control | src/lib/repository.ts | 601-614 | The year list is expanded into a dynamic SQL IN placeholder list. |

### Upstream Worker Candidates

| Round | Worker | Source candidate | Title |
| --- | --- | --- | --- |
| round-01-retry-02 | worker-04 | ESKPI-W04-CAN-002 | GET /api/breakdowns accepts unbounded repeated year filters into a dynamic SQL IN list |

### Validation Report

# Validation Report: D8AD-CAN-007 - GET /api/breakdowns accepts unbounded repeated year filters into a dynamic SQL IN list

Candidate id: D8AD-CAN-007
Instance key: dos-sql-placeholder:src/app/api/breakdowns/route.ts:22
Disposition: suppressed
Survives validation: no
Confidence: medium
Validation method: disposable repository runtime stress check plus static trace

## Rubric

- [x] Claimed attacker input or trigger identified.
- [x] Closest control and sink identified with repository file/line evidence.
- [x] Existing controls and counterevidence considered.
- [x] Bounded runtime or static validation method chosen proportionately.
- [x] Candidate receives an explicit closure disposition and ledger receipt.

## Evidence Observed

- Static trace confirms repeated `year` query params are expanded into a dynamic placeholder list.
- Disposable repository check with 40,000 year values completed successfully for `listBreakdowns()` without error in the local SQLite runtime.

## Counterevidence

Values are parameter-bound, the route requires an authenticated session, 40k parameters did not trigger a practical failure, and no severe availability impact was demonstrated.

## Remaining Uncertainty

A much larger request might consume CPU/memory, but no material DoS was shown within bounded validation.

## Affected Locations

- entrypoint_source: src/app/api/breakdowns/route.ts:22-24 - The route reads all repeated year query parameters.
- closest_control: src/app/api/breakdowns/route.ts:10-24 - requireSession authenticates but no count bound is applied.
- sink_broken_control: src/lib/repository.ts:601-614 - The year list is expanded into a dynamic SQL IN placeholder list.

## Validation Artifacts

- artifacts/05_findings/D8AD-CAN-007/validation_artifacts/D8AD-CAN-006-007-unbounded-years.log

### Attack Path Report

# Attack Path Analysis: D8AD-CAN-007 - GET /api/breakdowns accepts unbounded repeated year filters into a dynamic SQL IN list

Final policy decision: ignore
Severity: ignore
Priority: none
Confidence: medium

## Affected Lines

- entrypoint_source: src/app/api/breakdowns/route.ts:22-24 - The route reads all repeated year query parameters.
- closest_control: src/app/api/breakdowns/route.ts:10-24 - requireSession authenticates but no count bound is applied.
- sink_broken_control: src/lib/repository.ts:601-614 - The year list is expanded into a dynamic SQL IN placeholder list.

## Attack Path Steps

1. Authenticated clients can repeat `year` filters on `/api/breakdowns`.
2. The repository expands placeholders dynamically.
3. A 40,000-value disposable runtime check completed without error and values are parameter-bound.

## Attack Path Facts

- Assumptions: viewer/admin session required; candidate remains within the synthesized threat model only when that actor/path is realistic.
- Context: Eastern State KPI is a single-organization internal dashboard; cross-tenant impact is out of scope, while admin/session/data-integrity and developer/CI boundaries are in scope when lower-privilege actors can cross them.
- In-scope status: Not reportable after validation and policy adjustment.
- Exposure: remote authenticated.
- Identity: Next.js app process, SQLite DB, admin/viewer cookie sessions, or developer/CI shell user depending on candidate.
- Cross-boundary behavior: suppressed availability hypothesis.
- Vector: remote authenticated.
- Preconditions: viewer/admin session required.
- Attacker input control: Authenticated clients can repeat `year` filters on `/api/breakdowns`.
- Category: suppressed availability hypothesis.
- Mitigations already present: see counterevidence below.
- Auth scope: viewer/admin session required.
- Impact surface: low.
- Target reach: single application/developer workflow.
- Secrets references: none material to final decision.
- Counterevidence: No practical availability impact was demonstrated, SQL injection is not present, and the endpoint requires authentication. The bounded test weakens reportability.
- Blindspots: deployment/log policies, browser same-site assumptions, or operational use as noted in validation where applicable.
- Controls: repository controls and recommended remediation below.
- Confidence: medium.

## Severity Calibration

Impact: low
Likelihood: low
Final severity/policy: ignore / ignore

## Remediation

Optionally cap repeated year filters for robustness, but this scan does not treat the candidate as a reportable security issue.

### Runtime Evidence Excerpts

Artifact: `artifacts/05_findings/D8AD-CAN-007/validation_artifacts/D8AD-CAN-006-007-unbounded-years.log`

```
command: disposable tsx oversized years validation
exit: 0
stdout:
{"endpoint":"entries","result":"completed"}
{"endpoint":"breakdowns","result":"completed"}

stderr:
```

### Candidate Ledger

```jsonl
{"phase":"discovery","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","round_id":"round-01-retry-02","candidate_id":"D8AD-CAN-007","status":"discovered_canonical_candidate","title":"GET /api/breakdowns accepts unbounded repeated year filters into a dynamic SQL IN list","affected_locations":[{"label":"entrypoint_source","path":"src/app/api/breakdowns/route.ts","lines":"22-24","detail":"The route reads all repeated year query parameters."},{"label":"closest_control","path":"src/app/api/breakdowns/route.ts","lines":"10-24","detail":"requireSession authenticates but no count bound is applied."},{"label":"sink_broken_control","path":"src/lib/repository.ts","lines":"601-614","detail":"The year list is expanded into a dynamic SQL IN placeholder list."}],"upstream_worker_candidates":[{"worker":"worker-04","source_candidate_id":"ESKPI-W04-CAN-002","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-04","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-04/findings/ESKPI-W04-CAN-002/candidate_ledger.jsonl","title":"GET /api/breakdowns accepts unbounded repeated year filters into a dynamic SQL IN list"}],"discovery_artifact":"artifacts/02_discovery/finding_discovery_report.md","merge_record":"artifacts/deep_merge/round-01_merge_record.md","validation_status":"pending_centralized_validation_after_discovery_saturation","attack_path_status":"pending_centralized_attack_path_after_validation"}
{"phase":"discovery","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","round_id":"round-02-merge","candidate_id":"D8AD-CAN-007","status":"rediscovered_or_preserved_canonical_candidate","title":"GET /api/breakdowns accepts unbounded repeated year filters into a dynamic SQL IN list","affected_locations":[{"label":"entrypoint_source","path":"src/app/api/breakdowns/route.ts","lines":"22-24","detail":"The route reads all repeated year query parameters."},{"label":"closest_control","path":"src/app/api/breakdowns/route.ts","lines":"10-24","detail":"requireSession authenticates but no count bound is applied."},{"label":"sink_broken_control","path":"src/lib/repository.ts","lines":"601-614","detail":"The year list is expanded into a dynamic SQL IN placeholder list."}],"upstream_worker_candidates":[{"round":"round-01-retry-02","worker":"worker-04","source_candidate_id":"ESKPI-W04-CAN-002","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-04","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-04/findings/ESKPI-W04-CAN-002/candidate_ledger.jsonl","title":"GET /api/breakdowns accepts unbounded repeated year filters into a dynamic SQL IN list"}],"discovery_artifact":"artifacts/02_discovery/finding_discovery_report.md","merge_record":"artifacts/deep_merge/round-02_merge_record.md","validation_status":"pending_centralized_validation_after_discovery_saturation","attack_path_status":"pending_centralized_attack_path_after_validation"}
{"phase":"discovery","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","round_id":"round-03-merge","merge_round":"round-03","row_id":"D8AD-CAN-007-round-03-merge","candidate_id":"D8AD-CAN-007","status":"preserved_canonical_candidate_no_round3_candidate","title":"GET /api/breakdowns accepts unbounded repeated year filters into a dynamic SQL IN list","affected_locations":[{"label":"entrypoint_source","path":"src/app/api/breakdowns/route.ts","lines":"22-24","detail":"The route reads all repeated year query parameters."},{"label":"closest_control","path":"src/app/api/breakdowns/route.ts","lines":"10-24","detail":"requireSession authenticates but no count bound is applied."},{"label":"sink_broken_control","path":"src/lib/repository.ts","lines":"601-614","detail":"The year list is expanded into a dynamic SQL IN placeholder list."}],"upstream_worker_candidates":[{"round":"round-01-retry-02","worker":"worker-04","source_candidate_id":"ESKPI-W04-CAN-002","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-04","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-01-retry-02/worker-04/findings/ESKPI-W04-CAN-002/candidate_ledger.jsonl","title":"GET /api/breakdowns accepts unbounded repeated year filters into a dynamic SQL IN list"}],"discovery_artifact":"artifacts/02_discovery/finding_discovery_report.md","merge_record":"artifacts/deep_merge/round-03_merge_record.md","validation_status":"pending_centralized_validation_after_discovery_saturation","attack_path_status":"pending_centralized_attack_path_after_validation","created_at":"2026-07-03T16:08:37.567Z"}
{"phase":"validation","validation_round":"centralized","row_id":"D8AD-CAN-007-central-validation","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","candidate_id":"D8AD-CAN-007","disposition":"suppressed","survives":"no","confidence":"medium","method":"disposable repository runtime stress check plus static trace","evidence":["Static trace confirms repeated `year` query params are expanded into a dynamic placeholder list.","Disposable repository check with 40,000 year values completed successfully for `listBreakdowns()` without error in the local SQLite runtime."],"counterevidence":"Values are parameter-bound, the route requires an authenticated session, 40k parameters did not trigger a practical failure, and no severe availability impact was demonstrated.","proof_gap":"A much larger request might consume CPU/memory, but no material DoS was shown within bounded validation.","validation_report":"artifacts/05_findings/D8AD-CAN-007/validation_report.md","validation_artifacts":["artifacts/05_findings/D8AD-CAN-007/validation_artifacts/D8AD-CAN-006-007-unbounded-years.log"],"created_at":"2026-07-03T16:14:29.618Z"}
{"phase":"attack_path","attack_path_round":"centralized","row_id":"D8AD-CAN-007-central-attack-path","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","candidate_id":"D8AD-CAN-007","decision":"ignore","severity":"ignore","priority":null,"confidence":"medium","impact":"low","likelihood":"low","attack_path_steps":["Authenticated clients can repeat `year` filters on `/api/breakdowns`.","The repository expands placeholders dynamically.","A 40,000-value disposable runtime check completed without error and values are parameter-bound."],"counterevidence":"No practical availability impact was demonstrated, SQL injection is not present, and the endpoint requires authentication. The bounded test weakens reportability.","attack_path_report":"artifacts/05_findings/D8AD-CAN-007/attack_path_analysis_report.md","created_at":"2026-07-03T16:16:06.215Z"}
```

---

## D8AD-CAN-008: Smoke harness embeds a live HTTP response inside bash -c

| Field | Value |
| --- | --- |
| Validation disposition | reportable |
| Survives validation | yes |
| Validation method | isolated reproduction of exact bash -c interpolation pattern |
| Attack-path decision | reportable |
| Attack-path severity | medium |
| Priority | P2 |
| Attack-path confidence | high behavior / medium surface |
| Rule ID | smoke-harness-command-injection |
| Instance key | command-injection:scripts/smoke.sh:104 |
| Taxonomy | {"cwe":["CWE-78"]} |
| Coverage surface | smoke-harness-shell (reported) |

Coverage notes: Exact bash interpolation pattern executed a marker command from response-like bytes; reported as D8AD-CAN-008.

### Discovery Candidate Record

Attacker-controlled source: HTTP response from BASE/dashboard/overview, controlled by a malicious server or compromised app instance that a developer or CI smoke run targets.

Vulnerable sink or broken control: Most other script checks use grep here-strings or Python stdin; this check bypasses that safer pattern by constructing a bash command string from response content.

Impact: A malicious response containing shell-breaking characters can execute commands as the developer or CI user running scripts/smoke.sh.

Why plausible: Round two found a new local/CI command-injection proof tuple not remediated by the application auth/session fixes. It is scoped to the smoke harness and needs validation before reportability.

Closest apparent control: Most other script checks use grep here-strings or Python stdin; this check bypasses that safer pattern by constructing a bash command string from response content.

Validation plan from discovery: Validate by serving a crafted dashboard response through BASE and observing whether scripts/smoke.sh executes injected shell syntax at the bash -c line.

### Affected Locations

| Label | Path | Lines | Detail |
| --- | --- | --- | --- |
| source | scripts/smoke.sh | 21-23 | The smoke harness targets operator-controlled BASE and fetches live HTTP responses. |
| source | scripts/smoke.sh | 102-104 | A live dashboard response is embedded into a shell command string. |
| sink | scripts/smoke.sh | 104 | bash -c evaluates a string containing response-controlled content. |

### Upstream Worker Candidates

| Round | Worker | Source candidate | Title |
| --- | --- | --- | --- |
| round-02 | worker-02 | r02w02-c003 | Smoke harness embeds a live HTTP response inside bash -c, enabling local command execution from a malicious checked server |

### Validation Report

# Validation Report: D8AD-CAN-008 - Smoke harness embeds a live HTTP response inside bash -c

Candidate id: D8AD-CAN-008
Instance key: command-injection:scripts/smoke.sh:104
Disposition: reportable
Survives validation: yes
Confidence: high behavior / medium surface
Validation method: isolated reproduction of exact bash -c interpolation pattern

## Rubric

- [x] Claimed attacker input or trigger identified.
- [x] Closest control and sink identified with repository file/line evidence.
- [x] Existing controls and counterevidence considered.
- [x] Bounded runtime or static validation method chosen proportionately.
- [x] Candidate receives an explicit closure disposition and ledger receipt.

## Evidence Observed

- The smoke harness stores live dashboard HTML from `$BASE/dashboard/overview` in `ov` and evaluates `bash -c "echo '$ov' | grep ..."` at `scripts/smoke.sh:102-104`.
- A crafted response-like payload containing a single-quote breakout and shell command created the marker file under validation artifacts when run through the same `bash -c` interpolation pattern.
- The script is designed to target operator-selected live servers; a malicious or compromised checked server can therefore supply the bytes that enter the shell string.

## Counterevidence

This is developer/CI tooling, not a production web route. Exploitation requires a developer or CI smoke run against a malicious/compromised `BASE` response.

## Remaining Uncertainty

Full end-to-end smoke-run PoC against a local fake app was not necessary after exact shell interpolation reproduced command execution, but would further demonstrate script-level reach.

## Affected Locations

- source: scripts/smoke.sh:21-23 - The smoke harness targets operator-controlled BASE and fetches live HTTP responses.
- source: scripts/smoke.sh:102-104 - A live dashboard response is embedded into a shell command string.
- sink: scripts/smoke.sh:104 - bash -c evaluates a string containing response-controlled content.

## Validation Artifacts

- artifacts/05_findings/D8AD-CAN-008/validation_artifacts/D8AD-CAN-008-smoke-bash-c-poc.log

### Attack Path Report

# Attack Path Analysis: D8AD-CAN-008 - Smoke harness embeds a live HTTP response inside bash -c

Final policy decision: reportable
Severity: medium
Priority: P2
Confidence: high behavior / medium surface

## Affected Lines

- source: scripts/smoke.sh:21-23 - The smoke harness targets operator-controlled BASE and fetches live HTTP responses.
- source: scripts/smoke.sh:102-104 - A live dashboard response is embedded into a shell command string.
- sink: scripts/smoke.sh:104 - bash -c evaluates a string containing response-controlled content.

## Attack Path Steps

1. Developer or CI runs `scripts/smoke.sh` against an operator-selected `BASE`.
2. The script fetches live dashboard HTML into `ov`.
3. Line 104 builds a new shell command with `bash -c "echo '$ov' | grep ..."`.
4. A malicious response containing a single quote breakout can inject shell syntax; validation created a marker file through the same interpolation pattern.

## Attack Path Facts

- Assumptions: developer/CI operator runs smoke script; candidate remains within the synthesized threat model only when that actor/path is realistic.
- Context: Eastern State KPI is a single-organization internal dashboard; cross-tenant impact is out of scope, while admin/session/data-integrity and developer/CI boundaries are in scope when lower-privilege actors can cross them.
- In-scope status: In scope for analysis; reportability shown by the final policy decision.
- Exposure: developer/CI command line against malicious BASE.
- Identity: Next.js app process, SQLite DB, admin/viewer cookie sessions, or developer/CI shell user depending on candidate.
- Cross-boundary behavior: command injection in tooling.
- Vector: developer/CI command line against malicious BASE.
- Preconditions: developer/CI operator runs smoke script.
- Attacker input control: Developer or CI runs `scripts/smoke.sh` against an operator-selected `BASE`.
- Category: command injection in tooling.
- Mitigations already present: see counterevidence below.
- Auth scope: developer/CI operator runs smoke script.
- Impact surface: high.
- Target reach: single application/developer workflow.
- Secrets references: developer/CI shell user context.
- Counterevidence: This is not a production web route and requires a smoke run against a malicious or compromised server. The impact is limited to the developer/CI user context running the script.
- Blindspots: deployment/log policies, browser same-site assumptions, or operational use as noted in validation where applicable.
- Controls: repository controls and recommended remediation below.
- Confidence: high behavior / medium surface.

## Severity Calibration

Impact: high
Likelihood: medium
Final severity/policy: medium / reportable

## Remediation

Remove `bash -c` and pass response bytes through stdin or here-strings without reparsing by a shell, e.g. `grep -q ... <<< "$ov"` or `printf %s "$ov" | grep -q ...`.

### Runtime Evidence Excerpts

Artifact: `artifacts/05_findings/D8AD-CAN-008/validation_artifacts/D8AD-CAN-008-smoke-bash-c-poc.log`

```
command: isolated reproduction of scripts/smoke.sh:104 bash -c interpolation
marker: /private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/06_validation/runtime-evidence/D8AD-CAN-008-marker
exit: 0
stdout:
x
marker_created

stderr:
```

### Candidate Ledger

```jsonl
{"phase":"discovery","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","round_id":"round-02-merge","candidate_id":"D8AD-CAN-008","status":"discovered_new_canonical_candidate","title":"Smoke harness embeds a live HTTP response inside bash -c","affected_locations":[{"label":"source","path":"scripts/smoke.sh","lines":"21-23","detail":"The smoke harness targets operator-controlled BASE and fetches live HTTP responses."},{"label":"source","path":"scripts/smoke.sh","lines":"102-104","detail":"A live dashboard response is embedded into a shell command string."},{"label":"sink","path":"scripts/smoke.sh","lines":"104","detail":"bash -c evaluates a string containing response-controlled content."}],"upstream_worker_candidates":[{"round":"round-02","worker":"worker-02","source_candidate_id":"r02w02-c003","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-02","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-02/findings/r02w02-c003/candidate_ledger.jsonl","title":"Smoke harness embeds a live HTTP response inside bash -c, enabling local command execution from a malicious checked server"}],"discovery_artifact":"artifacts/02_discovery/finding_discovery_report.md","merge_record":"artifacts/deep_merge/round-02_merge_record.md","validation_status":"pending_centralized_validation_after_discovery_saturation","attack_path_status":"pending_centralized_attack_path_after_validation"}
{"phase":"discovery","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","round_id":"round-03-merge","merge_round":"round-03","row_id":"D8AD-CAN-008-round-03-merge","candidate_id":"D8AD-CAN-008","status":"preserved_canonical_candidate_no_round3_candidate","title":"Smoke harness embeds a live HTTP response inside bash -c","affected_locations":[{"label":"source","path":"scripts/smoke.sh","lines":"21-23","detail":"The smoke harness targets operator-controlled BASE and fetches live HTTP responses."},{"label":"source","path":"scripts/smoke.sh","lines":"102-104","detail":"A live dashboard response is embedded into a shell command string."},{"label":"sink","path":"scripts/smoke.sh","lines":"104","detail":"bash -c evaluates a string containing response-controlled content."}],"upstream_worker_candidates":[{"round":"round-02","worker":"worker-02","source_candidate_id":"r02w02-c003","worker_dir":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-02","worker_candidate_ledger":"/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/artifacts/deep_discovery/round-02/worker-02/findings/r02w02-c003/candidate_ledger.jsonl","title":"Smoke harness embeds a live HTTP response inside bash -c, enabling local command execution from a malicious checked server"}],"discovery_artifact":"artifacts/02_discovery/finding_discovery_report.md","merge_record":"artifacts/deep_merge/round-03_merge_record.md","validation_status":"pending_centralized_validation_after_discovery_saturation","attack_path_status":"pending_centralized_attack_path_after_validation","created_at":"2026-07-03T16:08:37.567Z"}
{"phase":"validation","validation_round":"centralized","row_id":"D8AD-CAN-008-central-validation","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","candidate_id":"D8AD-CAN-008","disposition":"reportable","survives":"yes","confidence":"high behavior / medium surface","method":"isolated reproduction of exact bash -c interpolation pattern","evidence":["The smoke harness stores live dashboard HTML from `$BASE/dashboard/overview` in `ov` and evaluates `bash -c \"echo '$ov' | grep ...\"` at `scripts/smoke.sh:102-104`.","A crafted response-like payload containing a single-quote breakout and shell command created the marker file under validation artifacts when run through the same `bash -c` interpolation pattern.","The script is designed to target operator-selected live servers; a malicious or compromised checked server can therefore supply the bytes that enter the shell string."],"counterevidence":"This is developer/CI tooling, not a production web route. Exploitation requires a developer or CI smoke run against a malicious/compromised `BASE` response.","proof_gap":"Full end-to-end smoke-run PoC against a local fake app was not necessary after exact shell interpolation reproduced command execution, but would further demonstrate script-level reach.","validation_report":"artifacts/05_findings/D8AD-CAN-008/validation_report.md","validation_artifacts":["artifacts/05_findings/D8AD-CAN-008/validation_artifacts/D8AD-CAN-008-smoke-bash-c-poc.log"],"created_at":"2026-07-03T16:14:29.618Z"}
{"phase":"attack_path","attack_path_round":"centralized","row_id":"D8AD-CAN-008-central-attack-path","scan_id":"d8adcf5f-e257-4e3a-9494-b7adc5de2cbc","candidate_id":"D8AD-CAN-008","decision":"reportable","severity":"medium","priority":"P2","confidence":"high behavior / medium surface","impact":"high","likelihood":"medium","attack_path_steps":["Developer or CI runs `scripts/smoke.sh` against an operator-selected `BASE`.","The script fetches live dashboard HTML into `ov`.","Line 104 builds a new shell command with `bash -c \"echo '$ov' | grep ...\"`.","A malicious response containing a single quote breakout can inject shell syntax; validation created a marker file through the same interpolation pattern."],"counterevidence":"This is not a production web route and requires a smoke run against a malicious or compromised server. The impact is limited to the developer/CI user context running the script.","attack_path_report":"artifacts/05_findings/D8AD-CAN-008/attack_path_analysis_report.md","created_at":"2026-07-03T16:16:06.215Z"}
```

## Final Dashboard Projection

The Codex Security dashboard indexes only the 4 reportable findings. The suppressed and deferred candidates above are intentionally not counted as dashboard vulnerabilities. The original dashboard markdown report remains at `/private/var/folders/r4/q09msy8d3zj7lyd70ls7tq0r0000gs/T/codex-security-scans-nxZGEb/Eastern-State-KPI/ea7263d5c5d908a88398ee4ce0217337e429ad5e_20260701T194538Z_vka38m01/report.md`.

Reportable dashboard finding IDs:

- `csf_c2afa276d7334f24b762655f`: Fresh bootstrap credentials are printed to runtime logs until rotation (medium, confidence high)
- `csf_66c9fbb44ab6912a99bc6c9d`: Deleted or reset users can keep using stale stateless session cookies (medium, confidence medium)
- `csf_a853f907be34bb48ffd67fe1`: KPI or category deletion hides durable edit-history rows from the admin history view (low, confidence high)
- `csf_1b5cbaec9a400576530cb4da`: Smoke harness evaluates live dashboard HTML inside `bash -c` (medium, confidence high)

## Source Artifact Index

- `artifacts/04_reconciliation/deduped_candidates.jsonl`
- `artifacts/05_findings/validation_summary.md`
- `artifacts/05_findings/attack_path_analysis_report.md`
- `artifacts/05_findings/D8AD-CAN-*/validation_report.md`
- `artifacts/05_findings/D8AD-CAN-*/attack_path_analysis_report.md`
- `artifacts/05_findings/D8AD-CAN-*/candidate_ledger.jsonl`
- `coverage.json`
- `findings.json`
- `scan-manifest.json`
