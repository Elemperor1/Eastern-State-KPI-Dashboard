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
updates are grouped, and open pull requests are capped to keep review volume
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

The workflow starts on every pull request so the lightweight
`Production container security` contract is always present. A first job compares
the pull-request base and head using NUL-delimited Git paths with rename
detection disabled. It skips the full image build only when every changed path
is an explicitly Docker-excluded documentation/evidence path. Every other path,
including any new or previously unknown root file, requires the full build and
Trivy scan. The stable contract succeeds only when that required scan succeeds,
or when the classifier proves all changes are excluded from the image. A
classifier failure, invalid decision, unexpected skip, cancelled scan, or red
scan makes the contract fail closed.

Pushes to `master`, manual runs, and the weekly schedule always build and scan
the exact commit, regardless of paths, so newly published distro or npm
advisories are detected even without a source change. GitHub does not grant
`security-events: write` to fork pull requests, so fork runs still classify,
build when required, retain the text artifact, and enforce the blocking policy,
but skip SARIF publication. GitHub may also issue a read-only token to a
Dependabot-authored push. Only that narrowly detected push case may tolerate a
failed SARIF upload; an upload failure on an ordinary trusted run fails the job.
The independent blocking Trivy scan remains authoritative in every case. No
workflow reads repository secrets.

### Release container readiness

`.github/workflows/release-security.yml` is the authoritative release-security
declaration. Dispatch it from `master` immediately before a release. The
read-only workflow refuses a non-default ref, refuses a stale SHA if `master`
moved, selects the latest Container Security run for that exact commit, and
requires all three of these results to be completed and successful:

- the exact-commit Container Security workflow run;
- `Container image / Trivy` (the full image build and blocking scan); and
- `Production container security` (the stable fail-closed contract).

Missing, queued, in-progress, skipped, cancelled, stale, or red evidence fails
the release check. A prior green run does not authorize a newer commit, and a
newer failed exact-commit scan supersedes older green evidence. Record the SHA
and Container Security run linked in the successful `Release container
readiness` summary. If `master` moves before deployment, dispatch it again and
deploy only the newly recorded clean commit.

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
`Dependency Review` check. `.github/workflows/container-security.yml` always
exposes `Container scan decision` and `Production container security`; it also
exposes `Container image / Trivy` when a pull request changes the production
image, and on every push to `master`, weekly schedule, and manual dispatch.
Dependency Review and the container contract carry the blocking policies
described above; their summaries and SARIF also contain informational findings.

`.github/workflows/release-security.yml` is manual-only and exposes `Release
container readiness`. It has read-only `actions` and `contents` permissions,
uses no checkout or third-party action, and validates current GitHub Actions
evidence rather than rebuilding or deploying. It is a release authorization
record, not a pull-request required check.

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

As live-verified on July 22, 2026, active repository ruleset
[`Default branch safety`](https://github.com/Elemperor1/Eastern-State-KPI-Dashboard/rules/19106275)
targets `~DEFAULT_BRANCH` (`master`) and requires these 11 completed GitHub
Actions check names:

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

Completed GitHub Actions runs prove those names and the path-filter hazard:

- docs-only PR #59 at `8aae67ac03804069af300ef5f28aa6cee5de8e7f`
  completed all 11 required names under GitHub Actions app ID `15368`, while
  `Container image / Trivy` was absent;
- production-input PR #73 at
  `5afe0660c71286e01d571a2ee6a1da252012a2b3` completed the same 11 names plus
  `Container image / Trivy`, also under app ID `15368`; and
- the July 22, 2026 `master` snapshot at
  `3e446acd52da4a68a48cda453b0c9c406598edaa` has a completed successful
  `Container image / Trivy` run.

This evidence proves the existing 11 contexts are stable and proves that the
path-filtered Trivy context is unsafe to require. It does not yet prove the new
`Production container security` context, because that job has not run on
GitHub. Therefore no live ruleset mutation is recommended from this local patch.

The live ruleset also requires pull requests with **zero approving reviews**,
resolved review conversations, squash-only merges, linear history, deletion
protection, and non-fast-forward protection. `Elemperor1` is the only bypass
actor and its bypass mode is `pull_request`, so the owner can use an explicit
PR emergency bypass but cannot bypass the ruleset with a direct push. The
status-check policy is not strict about updating a branch before merge and does
not enforce checks while the branch is first created. It is bound to the
GitHub Actions app, preventing an unrelated status provider from satisfying the
same text name. There is no separate legacy branch-protection record; the
active ruleset is the protection authority.

Repository merge settings match that policy: squash is the only enabled merge
method, squash title/body use the PR title/body, update-branch is enabled, and
merged head branches are deleted automatically. Do not add an approval
requirement until an independent reviewer is reliably available, do not add a
broad administrator bypass, and do not change the owner bypass to `always`.

Live Actions settings use a read-only default `GITHUB_TOKEN`, prohibit Actions
from approving pull requests, and permit all action publishers. GitHub's
repository-level SHA-pinning switch is currently off, so the repository guard
in `scripts/security-workflow-policy.test.ts` is the blocking control that
requires every external `uses:` reference to be a full 40-character commit SHA.
The same guard requires every checkout to disable credential persistence.

Do **not** require `Container image / Trivy`: it remains intentionally
conditional on pull requests and can be absent when the production image is
unchanged. Do not require `Container scan decision`, `Release container
readiness`, `Scorecard analysis`, Vercel, CodeRabbit, or dynamically generated
code-scanning contexts. The existing 11 checks above remain the current live
required set.

`Production container security` is the proposed future twelfth required check
because it is designed to be unconditional and fail closed. A GitHub
administrator must not add it based on this source edit alone. First merge the
workflow through the existing rules, then prove the exact check name and
GitHub Actions app ID on completed pull-request runs for both a production-path
change and a docs-only change, and on a completed `master` push with a real
Trivy scan. Only after that live proof may an administrator add exactly
`Production container security` while preserving all existing 11 entries and
every policy setting above.

Live repository security settings currently show Dependabot security updates
enabled and GitHub Secret Scanning enabled, while Secret Scanning push
protection remains disabled. Repository files implement the workflows and
Dependabot schedule; administrator actions still requiring separate approval
are:

- enable Secret Scanning push protection after confirming the intended owner
  recovery path;
- add `Production container security` only after the completed-name proof above;
- optionally enable GitHub's repository-level action SHA-pinning enforcement
  after confirming it accepts every already-pinned workflow;
- continue reviewing workflow and action-SHA updates as security-sensitive
  changes.

## Why UBS is not a gate

Ultimate Bug Scanner output is heuristic, broad, and report-oriented. It does
not provide the stable rule identity, reproducible dependency graph, commit
range, typed project model, or maintained GitHub integration required for a
blocking gate. UBS reports may remain historical review evidence, but UBS is
not referenced by npm scripts, Semgrep configuration, or GitHub Actions. The
compiler, type-aware ESLint, tests, CodeQL, OSV-Scanner, Gitleaks, and Semgrep
are the maintained sources of blocking signal.
