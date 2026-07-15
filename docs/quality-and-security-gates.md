# Quality and security gates

This repository uses deterministic compiler, linter, test, build, and security
checks as the blocking signal. The commands below are the same entry points
used by GitHub Actions.

## Toolchain baseline

- Package manager: npm with `package-lock.json` lockfile version 3.
- Declared runtime: Node.js 24 or newer and npm 11. CI and Docker use Node 24.
- Application: Next.js 15 App Router, React 19, and strict TypeScript.
- Lint: ESLint 9 flat config with Next.js/React Hooks rules and
  `typescript-eslint` project service.
- Tests: Vitest for unit/integration tests and Playwright with Google Chrome for
  serial browser acceptance tests.
- E2E data: a newly reserved private SQLite database under the OS temp root;
  `data/kpi.db` is never used by Playwright.
- Hooks: no hook manager is installed. Run `npm run check` before each commit.

The remote points at `Elemperor1/Eastern-State-KPI-Dashboard` and the primary
branch is `master`. Repository visibility cannot be established from the local
checkout, so GitHub feature availability must be confirmed by an administrator.

## Local commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install exactly the committed lockfile. |
| `npm run typecheck` | Run `tsc --noEmit` with the repository TypeScript project. |
| `npm run lint` | Run repository guards and type-aware ESLint; warnings fail. |
| `npm run lint:fix` | Apply safe ESLint fixes explicitly; never used by CI. |
| `npm run test:ci` | Run all Vitest unit and integration tests non-interactively. |
| `npm run test:e2e` | Run the isolated Playwright acceptance suite. |
| `npm run build` | Build the production Next.js application. |
| `npm run check` | Typecheck, lint/guards, and unit/integration tests. |
| `npm run check:all` | `check`, production build, and E2E tests. |
| `npm run security:dependencies` | Scan the committed lockfile with OSV-Scanner 2.3.8. |
| `npm run security:secrets` | Scan Git history or the supplied commit range with Gitleaks 8.30.1. |
| `npm run security:semgrep` | Run Semgrep 1.164.0 maintained packs and local rules. |
| `npm run security:scan` | Run all three local security scanners. |

`npm run design-system:test` remains the existing combined design, auth,
architecture, shell-injection, typecheck, and production-build aggregate.
Those guards are also reached through `npm run lint` via `quality:guards` so
the main `check` command cannot bypass them.

## What the gates cover

### TypeScript

`strict`, `noImplicitOverride`, `noFallthroughCasesInSwitch`,
`noImplicitReturns`, and `forceConsistentCasingInFileNames` are enabled.
Compilation excludes Next build output, coverage, scanner/test reports, caches,
and vendored dependencies while retaining `.next/types` for Next-generated
route typing.

`noUncheckedIndexedAccess` is not enabled. A direct compatibility probe found a
repository-wide migration across hydrated UI arrays, SQLite row access,
migration tests, and E2E helpers. Enabling it as part of this gate would mix a
large unrelated typing refactor into a behavior-preserving infrastructure
change. Reconsider it when boundary collections encode missing indexes or when
that migration is explicitly scheduled.

TypeScript proves static contracts; it does not prove authorization, data
correctness, browser behavior, dependency safety, or runtime configuration.

### ESLint and repository guards

The blocking lint command uses type information and detects floating/misused
promises, unsafe runtime data access, unused values, inconsistent type imports,
non-exhaustive switches, React Hooks mistakes, and invalid Next.js patterns.
Promise-returning UI handlers are invoked through a synchronous boundary that
catches rejections, and untyped JSON responses are narrowed before use.

The pre-lint guards additionally enforce design tokens/components, the
loopback-only auth bypass, architectural boundaries, and the shell-injection
regression suite. Formatting preferences are deliberately not blocking.

Calibrated exceptions are visible in `eslint.config.mjs`:

- `no-base-to-string` is disabled after 92 baseline matches at typed
  SQLite/form scalar conversion boundaries. Remove this calibration when those
  boundaries use primitive-specific formatters.
- `no-unnecessary-type-assertion` is disabled after 133 primarily mechanical
  `node:sqlite` result assertions. Re-enable it after DB result rows have a
  shared typed adapter and the assertion cleanup is scoped work.
- `require-await` is disabled after 29 intentional promise-shaped framework and
  mock contracts. Re-enable it when those interfaces no longer require async
  implementations.
- `no-unnecessary-condition` stays blocking by default. Its temporary override
  is an explicit list of existing UI/persistence boundary files whose runtime
  guards intentionally distrust hydrated or legacy data more than their static
  types do. Remove each file when its boundary types encode absence, or after
  adopting `noUncheckedIndexedAccess`.
- Unsafe-value rules are relaxed only for `*.test.ts(x)`, Playwright, and the
  auth regression helper, where mocks and `Response.json()` are deliberately
  untyped. Runtime application files retain the blocking rules.

Do not add inline disables merely to clear CI. Fix a real defect first. A
temporary exception must identify the exact rule and smallest file/range,
explain why the rule is inapplicable, name an owner, and state a removal
condition. Review exceptions during monthly dependency/security triage and
before their stated expiration.

### Tests and build

Vitest exercises pure calculations, API contracts, SQLite integration,
authentication, authorization, session revocation, security utilities, and
migrations. Playwright separately validates the four product destinations,
strategic save recovery, removed routes, Setup, responsive navigation, and
CSV/PNG/PDF outputs through a real credentialed browser session. The Next.js
build verifies the production compiler path with `AUTH_DISABLED` cleared.

Tests do not replace manual accessibility/usability review, production
observability, or live infrastructure validation.

### Semgrep

Semgrep runs the maintained `p/nodejs` and `p/react` packs plus `.semgrep.yml`.
Only error-severity findings block. Local rules reject dynamic code evaluation
and `dangerouslySetInnerHTML`; the maintained packs add framework-aware
injection, XSS, request, redirect, subprocess, and session checks without
duplicating the TypeScript compiler.

`.semgrepignore` excludes generated/build output, scanner reports, vendored
code, caches, and only the D8AD-CAN-004 fixture directory that intentionally
contains attack payloads. Regular tests remain scan targets. There are no
Semgrep finding suppressions. Review every new finding; use a narrow rule/path
exception only after recording why the code is safe and when the exception
will be removed.

The wrapper uses an installed Semgrep 1.164.0, an isolated pinned `pipx`
environment, or the pinned Docker image in that order. Registry packs require
network access on first use.

### Dependencies

OSV-Scanner 2.3.8 scans `package-lock.json`, including production and
development packages, and fails on every active known vulnerability regardless
of severity. Withdrawn advisories are handled by OSV metadata. `npm audit` may
remain a supplemental observation but is not the blocking policy.

`osv-scanner.toml` contains no ignores. Any future `[[IgnoredVulns]]` entry must
include the exact advisory ID, a technical justification, an owner in the
reason, and `ignoreUntil` as the expiration/review date. Never add a blanket
package or severity exclusion, and never perform an automatic major upgrade
solely to hide a finding.

Dependabot checks npm and GitHub Actions weekly. Minor/patch development
updates are grouped; open pull requests are capped to keep review volume
bounded.

### Secrets

Gitleaks 8.30.1 scans all retained commits locally. CI passes a validated
`base..head` range for pushes and pull requests and checks out history with
`fetch-depth: 0`; findings are always redacted. The scanner has no network in
Docker and no credentials are passed to it.

`.gitleaksignore` contains one exact historical fingerprint. A prose list of
CSRF test cases in commit `7d2e5e2` was classified as a generic API-key
assignment; the allowlist is limited to that commit, file, rule, and line. It
must be removed when the commit leaves retained history or the upstream rule no
longer matches that prose. Do not allowlist realistic test credentials; replace
them with obviously deterministic fixtures.

Gitleaks cannot revoke a credential or prove that an exposed credential was
never used. Treat a real match as an incident: revoke/rotate it, remove it from
the current tree, assess history rewrite separately, then add regression proof.

## GitHub Actions

`.github/workflows/quality.yml` runs these stable independent checks on pushes
and pull requests to `master`, plus manual dispatch:

1. `Typecheck`
2. `Lint`
3. `Unit and Integration Tests`
4. `Build`
5. `End-to-End Tests`
6. `Dependency Vulnerabilities`
7. `Secret Scan`
8. `Semgrep`

Every job has a timeout, least-privilege read-only repository permissions, and
concurrency cancellation. Node jobs use Node 24 and lockfile-enforcing installs
where dependencies are needed. Unit/build databases live under
`runner.temp`; Playwright provisions and removes its own private temp database.
Only Playwright's dedicated temp output is uploaded, only on failure, for seven
days. No workspace, environment file, database, or credential is uploaded.

`.github/workflows/codeql.yml` runs the stable `CodeQL` check for JavaScript and
TypeScript on pushes/pull requests to `master`, weekly, and on manual dispatch.
It uses build mode `none`, the security-focused `security-extended` suite,
read-only contents access, and only the `security-events: write` permission
required to publish results. The extended suite is intentionally isolated from
the fast local gate; review any lower-confidence result before suppression.
Neither workflow references repository secrets, including on fork pull
requests.

Action references use supported stable major versions. Dependabot manages
GitHub Actions updates separately; review action ownership and release notes as
security-sensitive dependency changes.

## Investigating failures

1. Re-run the exact failing npm command locally.
2. Read the first root-cause error; later errors may be cascades.
3. For lint/type failures, narrow the data or async boundary rather than adding
   a disable.
4. For test/build failures, reproduce with an isolated temp database and keep
   `AUTH_DISABLED` unset for production paths.
5. For OSV, confirm the advisory, reachable package path, fixed version, and
   whether the package is production or development-only.
6. For Gitleaks, keep redaction enabled; inspect only rule/file/commit metadata
   until the value can be handled as a secret.
7. For Semgrep/CodeQL, trace source-to-sink behavior. Fix reachable findings;
   record precise evidence for false positives.

Do not commit generated SARIF/JSON reports, scanner caches, Playwright output,
build output, temp databases, or copied logs.

## Required checks and repository settings

After these workflows run successfully on the default branch, an administrator
should protect `master` and require all nine stable checks:

- `Typecheck`
- `Lint`
- `Unit and Integration Tests`
- `Build`
- `End-to-End Tests`
- `Dependency Vulnerabilities`
- `Secret Scan`
- `Semgrep`
- `CodeQL`

Repository files implement the workflows and Dependabot schedule. The following
settings are **not** changed by this work and still require a GitHub
administrator, subject to plan/visibility availability:

- enable branch protection/rulesets, required pull requests, and the checks
  above;
- enable Dependabot alerts and Dependabot security updates;
- confirm code scanning accepts CodeQL uploads and alerts are visible;
- enable GitHub Secret Scanning and push protection;
- restrict workflow changes and review third-party/action updates carefully.

## Why UBS is not a gate

Ultimate Bug Scanner output is heuristic, broad, and report-oriented. It does
not provide the stable rule identity, reproducible dependency graph, commit
range, typed project model, or maintained GitHub integration required for a
blocking gate. UBS reports may remain historical review evidence, but UBS is
not referenced by npm scripts, Semgrep configuration, or GitHub Actions. The
compiler, type-aware ESLint, tests, CodeQL, OSV-Scanner, Gitleaks, and Semgrep
are the maintained sources of blocking signal.
