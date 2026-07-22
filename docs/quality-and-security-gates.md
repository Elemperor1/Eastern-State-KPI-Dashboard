# Quality and security gates

This repository uses deterministic compiler, linter, test, build, and security
checks as the blocking signal. The commands below are the same entry points
used by GitHub Actions.

## Toolchain baseline

- Package manager: npm with `package-lock.json` lockfile version 3.
- Declared runtime: Node.js 24 or newer and npm 11.18. CI and Docker use Node
  24; Docker installs the declared npm release instead of retaining the base
  image's older bundled npm.
- Application: Next.js 16 App Router, React 19, and strict TypeScript.
- Lint: ESLint 10 flat config with Next.js/React Hooks rules and
  `typescript-eslint` project service.
- Tests: Vitest for unit/integration tests and Playwright with Google Chrome for
  serial browser acceptance tests.
- E2E data: a newly reserved private SQLite database under the OS temp root;
  `data/kpi.db` is never used by Playwright.
- Hooks: no hook manager is installed. Run `npm run check` before each commit.

The remote points at the public
`Elemperor1/Eastern-State-KPI-Dashboard` repository and the primary branch is
`master`. If repository visibility or GitHub plan changes, re-check Dependency
Review and code-scanning availability before making those checks required.

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
| `npm run hygiene:guard` | Reject tracked generated, ignored, local-only, database, environment, scanner, and editor artifacts. |
| `npm run check` | Typecheck, lint/guards, and unit/integration tests. |
| `npm run check:all` | `check`, production build, and E2E tests. |
| `npm run security:dependencies` | Scan the committed lockfile with OSV-Scanner 2.3.8. |
| `npm run security:secrets` | Scan Git history or the supplied commit range with Gitleaks 8.30.1. |
| `npm run security:semgrep` | Run Semgrep 1.164.0 maintained packs and local rules. |
| `npm run security:scan` | Run all three local security scanners. |
| `npm run production-dependencies:guard` | Reject known vulnerable lockfile ranges and verify runtime dependency ownership. |

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
loopback-only auth bypass, architectural boundaries, repository hygiene, and
the shell-injection regression suite. The hygiene guard is pattern-based: it
rejects tracked local/generated families and any tracked file hidden by
`.gitignore`, without maintaining a fragile allowlist of every repository file.
Formatting preferences are deliberately not blocking.

Local databases, environment files, build/test output, downloaded exports,
raw scanner output, editor state, and agent scratch state stay untracked. The
two OpenKnowledge pack contracts under `.ok/skills/` are deliberate versioned
development inputs; other `.ok/` workspace metadata remains local. Historical
security reports, performance traces, Impeccable design evidence, and the
D8AD-CAN-004 browser fixture are intentionally versioned evidence rather than
live scanner output.

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

The offline production-dependency guard complements OSV with fixed regression
boundaries for the release-candidate advisories and manifest ownership. It
rejects vulnerable `brace-expansion`, `sharp`, or `dompurify` versions, requires
image optimization and seed/migration tooling to remain production dependencies,
and requires Next's transitive `sharp` request to follow the validated direct
version. OSV remains authoritative for newly disclosed advisories.

`osv-scanner.toml` contains no ignores. Any future `[[IgnoredVulns]]` entry must
include the exact advisory ID, a technical justification, an owner in the
reason, and `ignoreUntil` as the expiration/review date. Never add a blanket
package or severity exclusion, and never perform an automatic major upgrade
solely to hide a finding.

Dependabot checks npm and GitHub Actions weekly. Minor/patch development
updates are grouped; open pull requests are capped to keep review volume
bounded.

### Dependency Review

`.github/workflows/dependency-review.yml` compares the dependency graph on
every pull request. It blocks newly introduced `high` or `critical`
vulnerabilities in runtime, development, or unknown scopes. Lower-severity
findings and patched-version guidance remain visible in the job summary without
failing the check. License enforcement is disabled because this repository has
no approved/denied license policy; adding one requires a separate policy
decision.

Dependency Review complements OSV rather than replacing it: OSV scans the
whole committed npm lockfile, while Dependency Review evaluates only the
dependency delta introduced by a pull request. The action is available for
public repositories. A private repository requires GitHub Advanced Security;
if visibility changes, confirm that entitlement before making this check
required.

### Production container

`.github/workflows/container-security.yml` builds the root `Dockerfile`, the
same Docker build definition selected by `fly.toml`, and scans the resulting
local image without pushing it to a registry. Trivy scans both Debian OS
packages and language dependencies. The all-severity scan (`UNKNOWN` through
`CRITICAL`, including unfixed findings) is informational and is retained as a
table artifact and job-summary evidence. Code-scanning SARIF and the blocking
pass contain only fixable `HIGH` and `CRITICAL` findings, so the alert backlog
stays actionable without discarding lower-severity or unfixed evidence.

The image is assembled from a dedicated dependency stage. That stage removes
the root `devDependencies` declarations from its disposable manifest, then runs
lock-enforcing `npm ci --omit=dev --omit=peer`. The final image retains the
original manifest, while the derived install prevents development tools that
also satisfy optional framework peers from leaking back into production.
Both the Docker build and the workflow re-run the production-dependency guard
against the final image: every lock entry marked development-only must be absent,
while Next, React, jsPDF, sharp, and the `tsx` seed/migration runner must remain.

Pull requests run this workflow only when the production image inputs,
application, scripts, or workflows change. Pushes to `master`, manual runs,
and the weekly schedule scan the image again so newly published distro or npm
advisories are detected even without a source change. GitHub does not grant
`security-events: write` to fork pull requests, so those runs still build,
scan, retain the text artifact, and enforce the blocking policy but skip SARIF
publication.

A separate Syft workflow is intentionally omitted. Trivy can already generate
SPDX or CycloneDX from this exact image, while the repository currently has no
tagged-release, signing, or attestation lifecycle that would give a second SBOM
inventory durable release identity. Revisit an image SBOM when releases are
tagged or attestations become part of the Fly deployment process; generate it
from the production image and retain it with that release.

### Secrets

Gitleaks 8.30.1 scans all retained commits locally. CI passes a validated
`base..head` range for pushes and pull requests and checks out history with
`fetch-depth: 0`; findings are always redacted. The scanner has no network in
Docker and no credentials are passed to it.

`.gitleaksignore` contains two exact historical fingerprints. A prose list of
CSRF test cases in commit `7d2e5e2` and Impeccable critique prose about an
authentication heading in commit `4232ee7` were classified as generic API-key
assignments. Each allowlist entry is limited to its commit, file, rule, and
line. Remove an entry when its commit leaves retained history or the upstream
rule no longer matches that prose. Do not allowlist realistic test credentials;
replace them with obviously deterministic fixtures.

Gitleaks cannot revoke a credential or prove that an exposed credential was
never used. Treat a real match as an incident: revoke/rotate it, remove it from
the current tree, assess history rewrite separately, then add regression proof.

## GitHub Actions

`.github/workflows/quality.yml` runs these stable independent checks on pushes
and pull requests to `master`, plus manual dispatch:

1. `Typecheck`
2. `Lint`
3. `Unit and Integration Tests`
4. `Required CI Gate`
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

`.github/workflows/codeql.yml` runs the stable `CodeQL (javascript-typescript)`
and `CodeQL (python)` checks on pushes/pull requests to `master`, weekly, and on
manual dispatch.
It uses build mode `none`, the security-focused `security-extended` suite,
read-only contents access, and only the `security-events: write` permission
required to publish results. The extended suite is intentionally isolated from
the fast local gate; review any lower-confidence result before suppression.
Neither workflow references repository secrets, including on fork pull
requests.

`.github/workflows/dependency-review.yml` exposes one pull-request-only
`Dependency Review` check. `.github/workflows/container-security.yml` exposes
`Container image / Trivy` on relevant pull requests, pushes to `master`, the
weekly schedule, and manual dispatch. These two checks carry the blocking
policies described above; their summaries and SARIF also contain informational
findings.

`.github/workflows/scorecard.yml` runs on pushes to `master`, weekly, and by
manual dispatch. OpenSSF Scorecard evaluates repository and workflow
supply-chain hygiene, publishes the public-repository result using OIDC,
retains the raw SARIF artifact for 14 days, and uploads the distinct
`openssf-scorecard` SARIF category. It is informational and is not a normal
pull-request gate. `id-token: write` is granted only to this job because
`publish_results: true` requires it. Public repositories support the action and
code-scanning upload; private repositories require the applicable GitHub code
security/Advanced Security features, and Scorecard result publication is
disabled for private repositories.

Every action added by these workflows is pinned to an immutable commit SHA
with its release tag in a comment. Dependabot continues to manage the GitHub
Actions ecosystem; review proposed SHA moves, action ownership, and release
notes as security-sensitive dependency changes. The Scorecard job uses only
the actions approved by Scorecard publication policy, runs on GitHub-hosted
Ubuntu, and has no service container or job environment. Harden Runner is not
added because the repository has no existing egress policy to preserve; adding
one should be a repository-wide workflow-hardening decision.

## Investigating failures

1. Re-run the exact failing npm command locally.
2. Read the first root-cause error; later errors may be cascades.
3. For lint/type failures, narrow the data or async boundary rather than adding
   a disable.
4. For test/build failures, reproduce with an isolated temp database and keep
   `AUTH_DISABLED` unset for production paths.
5. For OSV, confirm the advisory, reachable package path, fixed version, and
   whether the package is production or development-only.
6. For Dependency Review, confirm the introduced package/version and advisory;
   use `allow-ghsas` only for a documented, time-bounded false positive.
7. For Trivy, confirm the image package, source layer, fixed version, and
   production reachability. Keep unfixed findings visible; any ignore must name
   the advisory, owner, justification, and review date.
8. For Scorecard, verify the repository setting or workflow evidence behind the
   check before changing policy. A lower score is not by itself a PR failure.
9. For Gitleaks, keep redaction enabled; inspect only rule/file/commit metadata
   until the value can be handled as a secret.
10. For Semgrep/CodeQL, trace source-to-sink behavior. Fix reachable findings;
   record precise evidence for false positives.

Do not commit generated SARIF/JSON reports, scanner caches, Playwright output,
build output, temp databases, or copied logs.

## Required checks and repository settings

After these workflows run successfully, an administrator should protect
`master` and require the existing ten stable checks plus the two intentionally
blocking security checks:

- `Typecheck`
- `Lint`
- `Unit and Integration Tests`
- `Required CI Gate`
- `End-to-End Tests`
- `Dependency Vulnerabilities`
- `Secret Scan`
- `Semgrep`
- `CodeQL (javascript-typescript)`
- `CodeQL (python)`
- `Dependency Review`
- `Container image / Trivy`

Do not require `Scorecard analysis`; it is scheduled/default-branch
informational signal rather than a pull-request gate.

Repository files implement the workflows and Dependabot schedule. The following
settings are **not** changed by this work and still require a GitHub
administrator, subject to plan/visibility availability:

- enable branch protection/rulesets, required pull requests, and the checks
  above (the repository currently has neither branch protection nor a
  ruleset);
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
