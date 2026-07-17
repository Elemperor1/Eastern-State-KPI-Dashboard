# Repository hygiene audit

Date: 2026-07-17

Repository: `Elemperor1/Eastern-State-KPI-Dashboard`

Scope: complete tracked, untracked, ignored, build, test, deployment, scanner,
editor, database, export, and agent-tool surface

## Outcome

The tracked snapshot now contains the inputs needed to install, build, test,
deploy, operate, and understand the application without retaining raw scanner
dumps, an empty placeholder, or a local source PDF. The change does not alter
application behavior or Git history.

A pattern-based regression guard now fails CI when a local/generated path is
tracked or when an already tracked file becomes hidden by `.gitignore`.

## Baseline receipt

The user checkout at audit start was `master` at
`f6cfe607364869f7da204200563294772e8808c6`, two commits behind
`origin/master`. It already contained an unrelated modified `opencode.json`
and untracked `docs/security/code-scanning-triage-2026-07-16.md`; both were
preserved outside this pull request. The audit worktree was created from the
current default-branch revision
`9f7f5e084e5cb5bea496f42017e75d2fb04d02fe`.

| Baseline measure | Result |
| --- | ---: |
| Tracked files | 417 |
| Tracked snapshot bytes | 23,983,468 (22.872 MiB) |
| Modified paths in the user checkout | 1 |
| Untracked paths in the user checkout | 1 |
| Ignored file entries in the user checkout | 42,831 |
| Physical user checkout, including dependencies/build output | 1,868,716 KiB |
| `.git` directory | 26,360 KiB |

The ignored inventory was dominated by `node_modules` (41,831 entries),
`.next` (631), `.playwright-cli` (135), `output` (83), local agent/editor
integrations, coverage, and the local SQLite database. The complete inventories
remain reproducible from the immutable baseline with:

```sh
git ls-tree -r --name-only 9f7f5e084e5cb5bea496f42017e75d2fb04d02fe
git status --short --untracked-files=all
git status --short --ignored --untracked-files=all
git ls-files -ci --exclude-standard
```

Top-level tracked bytes at baseline were: `docs` 19,203,971; `src` 2,144,503;
root files 1,672,327; `public` 611,411; `scripts` 143,559;
`security-audit` 102,105; and `e2e` 44,770. The leading file types were 175
TypeScript files, 93 TSX files, 66 Markdown files, 16 gzip traces, 12 JSON
files, 11 shell scripts, 10 MJS files, and 7 workflow YAML files.

## Classification and disposition

| Category | Paths reviewed | Disposition and proof |
| --- | --- | --- |
| Required source or configuration | `src/`, `scripts/`, `e2e/`, `package*.json`, TypeScript/Next/Tailwind/Playwright/Vitest/ESLint config | Retained. Imports, npm scripts, and compiler/test entry points consume them. |
| Required durable documentation | `README.md`, `AGENTS.md`, `CONTEXT.md`, `DESIGN.md`, `PRODUCT.md`, `SECURITY.md`, ADRs, workflow/operator/product docs | Retained. These own the product, migration, operating, security, and design contracts. |
| Intentional test fixture | `security-audit/D8AD-CAN-004/fixtures/`, strategy fixtures, e2e helpers | Retained. The CSRF report names the browser harness and its 40-record result as reproducible ground truth; test fixtures remain exempt from database ignore patterns. |
| Deployment or operational input | `.github/workflows/`, `Dockerfile`, `.dockerignore`, `fly.toml`, migration/seed/start scripts | Retained. CI, the Docker build, and Fly deployment consume them directly. |
| Generated but intentionally versioned | 16 `docs/performance/traces/*.json.gz` files (8,295,691 bytes), `.impeccable/`, `report.md`, `full_report.md` | Retained. The traces are the documented before/after performance evidence; Impeccable artifacts support the dated design audit; the security reports are explicit historical remediation records. Machine-local paths in `full_report.md` were replaced with stable placeholders. |
| Reproducible generated output | `ultimate-bug-scan-report.txt`, `docs/ultimate-bug-scan-report.txt` | Deleted. They are unreferenced raw UBS console output, contain local absolute paths, and total 11,136,595 bytes. Future copies are ignored. |
| Local developer state | `.next/`, `node_modules/`, coverage, Playwright CLI/output, agent/editor folders, `data/kpi.db*`, local caches | Retained locally and ignored. None is required by CI, Docker, or source imports. |
| Local source material | `Eastern.State.Strategic.Dashboard.2025.2029.8.1.25.pdf` | Removed from the index only and left in the audit worktree. It was already described and ignored as a local source document; durable conclusions remain in `docs/product-foundation.md` and the completed strategic plan. |
| Temporary artifact | logs, backup/temp files, package/test caches, downloads/uploads/generated exports | Ignored with precise family or root-level rules. No tracked instance was retained. |
| Cache | npm/pnpm/Yarn, Next, SWC, Vitest, pytest, Ruff, Playwright and coverage caches | Ignored; all are reproducible. |
| Secret or environment-specific data | `.env*`, PEM files, local SQLite databases/journals, cookies/tokens, machine-specific paths | Environment/database paths remain ignored. No real tracked credential was found. Machine-specific paths were removed from retained docs and the CSRF fixture. |
| Obsolete artifact | empty `bug-report.txt` | Deleted. It has zero bytes, no consumer, and no durable evidence. |
| Agent/development-tool input | `.codex/config.toml`, `.mcp.json`, `opencode.json`, two `.ok/skills/*/SKILL.md` files, wiki stubs/logs | Retained as deliberate repository-scoped development inputs. `.ok` workspace metadata and per-editor generated skill mirrors stay ignored; the two versioned pack contracts are explicitly unignored. |
| Uncertain | None | Every suspicious tracked group was resolved through content, reference, history, script, workflow, Docker, and documentation checks. No uncertain file was removed. |

The large retained files were reviewed rather than deleted by size alone. The
16 compressed performance traces are referenced by the performance evidence;
the 370,326-byte favicon and bundled fonts/logos are runtime assets; the
319,440-byte lockfile is the reproducible dependency contract; and the
245,190 bytes of historical security reports document findings that drove the
current controls.

## Files removed from tracking

- `Eastern.State.Strategic.Dashboard.2025.2029.8.1.25.pdf` — index-only
  removal; the local working copy remains ignored.

## Files deleted as obsolete or reproducible

- `bug-report.txt` — empty obsolete placeholder.
- `ultimate-bug-scan-report.txt` — raw generated scanner output.
- `docs/ultimate-bug-scan-report.txt` — raw generated scanner output.

No source, migration, fixture, operational configuration, durable product
documentation, production data, or local user database was deleted.

## `.gitignore` changes

Rules were added or tightened for:

- npm, pnpm, Yarn, Next, SWC, and general tool caches;
- SQLite database, journal, WAL, and SHM files, with explicit fixture/testdata
  exceptions;
- environment templates such as `.env.local.example`;
- Vitest, pytest, Ruff, Python bytecode, coverage, and Playwright output;
- logs, temp files, editor metadata, backups, and OS metadata;
- generated downloads, exports, uploads, raw scanner output, and scan folders;
- agent scratch/workspace state while preserving repository-scoped tool config;
- OpenKnowledge local metadata while explicitly keeping the two versioned
  project pack contracts visible to Git.

Representative positive and negative `git check-ignore --no-index` checks are
part of the validation receipt below. `git ls-files -ci --exclude-standard`
returns no path after the change.

## Sensitive-material findings

- No tracked environment file, private key, PEM key, local database, real API
  key, access token, session cookie, or exported production dataset was found.
- Gitleaks identified only two already documented `generic-api-key` prose false
  positives: the Impeccable critique and CSRF-hardening documentation. No
  credential value was printed during this audit.
- The catalog strings that resemble an `sk-` token are the ordinary slug
  `high-risk-areas-climate-resilience`, not credentials.
- Expected Eastern State bootstrap/test email addresses and deterministic test
  passwords remain in documentation and fixtures. They are test/operational
  identifiers, not live secrets.
- The ignored local `data/kpi.db`, WAL, and SHM files were detected and left
  untouched. Binary data can contain application records, so it was neither
  opened nor copied into the pull request.
- The 16 retained performance traces contain no authorization, cookie,
  set-cookie, Eastern State email, private-key, or known token-format match.
  The CSRF JSON records cookie-attachment booleans and deterministic attack
  payloads, not raw session cookies.
- User-specific home paths and ephemeral scan paths were removed from retained
  documents. The historical CSRF harness now uses Playwright's managed browser
  by default and accepts `PLAYWRIGHT_CHROMIUM_EXECUTABLE` only as an optional
  override.

No credential rotation or history rewrite is required based on the findings.
The removed blobs remain in existing Git history because history rewriting was
explicitly out of scope.

## Regression guard

`scripts/repository-hygiene-guard.sh` checks two stable invariants:

1. no tracked file is hidden by the active ignore rules; and
2. no tracked path belongs to a known local/generated family.

It deliberately does not list every allowed repository file. The guard is
available as `npm run hygiene:guard` and runs through both lint/prelint and the
official `npm run design-system:test` CI gate.

## Validation

| Check | Result |
| --- | --- |
| `npm ci --cache /private/tmp/eastern-state-npm-cache` | Passed: 504 packages installed, 0 npm audit vulnerabilities. The default user cache first failed with a pre-existing ownership error; the isolated cache proved the lockfile install. |
| `npm run hygiene:guard` | Passed. |
| Representative `git check-ignore --no-index` matrix | Passed for build, test, coverage, cache, log, env, SQLite, export, scanner, OS/editor, and agent paths; required source, docs, workflows, fixtures, traces, and `.ok` pack files remained visible. |
| `git ls-files -ci --exclude-standard` | Empty. |
| `git diff --check` | Passed. |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed, including all repository guards and ShellCheck. |
| `npm run test:ci` | Passed: 81 files / 1,204 tests. |
| `npx vitest run scripts/security-workflow-policy.test.ts` | Passed: 6/6 policy tests. |
| `npm run design-system:test` | Passed: guards, typecheck, and Next.js 16.2.10 production build. |
| `npm run test:e2e` | Passed: 11/11 Google Chrome workflows with isolated temporary SQLite state. |
| OSV-Scanner 2.3.8 | Passed: 595 packages scanned, no issues. |
| Gitleaks 8.30.1 | Passed: the current tree produced only the two documented prose false positives; the post-commit Git scan covered 107 commits / 17.16 MB and found no leaks. |
| Semgrep 1.164.0 | Passed: 271 targets, 13 rules, 0 findings. |
| Docker production build | Passed from a 3.628 MB context; image `sha256:8b5f42dbfb6f3e2b1ad4591ba7b7f0cbfac1dd2750689f6e24974329a7c7beb8`. Required runtime inputs exist and excluded docs, audit fixtures, PDF, and raw scanner output are absent. |
| Machine-specific absolute-path scan | No user-home or ephemeral macOS temp path remains in the intended tracked snapshot. |

The scanner wrapper's first local run could not bind-mount the isolated
`/private/tmp` worktree into Docker Desktop and therefore saw an empty `/repo`.
The exact pinned OSV, Gitleaks, and Semgrep images were rerun by copying the
audited inputs into short-lived containers; this changes transport only, not
scanner versions or policies.

Together, the isolated worktree, lockfile install, import/consumer review,
production build, e2e build/server cycle, and Docker build prove that a clean
checkout contains the required application and operational inputs. Removed
files were already excluded from the Docker context and had no import, script,
test, workflow, or deployment consumer.

## Repository size before and after

| Snapshot | Files | Bytes | MiB |
| --- | ---: | ---: | ---: |
| Default-branch baseline | 417 | 23,983,468 | 22.872 |
| Hygiene pull request | 415 | 12,484,936 | 11.907 |

The tracked checkout shrank by approximately 48%. The removed raw outputs and
local PDF account for 11,498,832 bytes; path sanitization also removes repeated
machine-specific prefixes from `full_report.md`. Git object storage and clone
history do not immediately shrink because this pull request does not rewrite
history; the table measures the checked-out tracked snapshot.

## Unresolved uncertainties

None in the tracked-file classification. Two environmental facts remain
outside repository control:

- the user's ignored local SQLite files may contain private application data
  and should continue to be protected and backed up as operational data; and
- old commits retain the removed generated blobs until a separately authorized
  history-retention decision is made.

Neither requires a change in this pull request.

## Rollback

Before merge, close the pull request and delete its branch. After merge, revert
the hygiene commit with `git revert <commit>`; do not reset or rewrite history.
The local PDF was not deleted in the audit worktree. If the raw scanner outputs
are needed for debugging, regenerate them locally; `.gitignore` prevents an
accidental recommit. Application/database rollback is unnecessary because no
runtime behavior, schema, migration, or user data changed.
