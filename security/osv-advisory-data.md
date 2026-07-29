# OSV advisory data — live-data variance policy (finding S052-C3)

`npm run security:dependencies` (`scripts/run-osv-scanner.mjs`) scans
`package-lock.json` with the digest-pinned OSV-Scanner image
(`ghcr.io/google/osv-scanner:v2.3.8@sha256:64e86bec6df2466feea5137fc7c78fb3b7c21ec077f014d7130f64810e50676b`),
but the **advisory data** is fetched live from `https://api.osv.dev` at scan
time. The scanner engine is pinned; the vulnerability database is not — this
is inherent to live vulnerability scanning (an offline snapshot would fail
open on newly published advisories).

## Accepted variance

- Identical code can produce different scan results on different days as
  advisories are published, withdrawn, or amended. A scan that passed
  yesterday can fail today without any repository change; that is the gate
  working, not drift.
- Newly disclosed advisories appear at OSV after ingestion from their
  source ecosystems (GitHub Advisory Database, npm, NVD); expect hours of
  lag, not days.

## Why the residual risk is accepted

- **Corroborating controls:** the `dependency-review` workflow evaluates the
  GitHub Advisory Database independently on every dependency-changing PR,
  `production-dependencies:guard` rejects vulnerable version ranges in the
  lockfile, and the lockfile pins resolved content by integrity hash.
- **Failure direction:** an api.osv.dev outage fails the gate closed (the
  scan errors and blocks merge), so the live-data path cannot silently
  weaken coverage the way mutable *rules* could (contrast S046-C1, which
  was vendored for exactly that reason).
- **Suppression risk:** a compromised or intercepted feed could in theory
  withhold an advisory. This is rated low-plausibility (TLS + service
  compromise required) and is cross-checked by the independent GitHub
  advisory path above.

## Policy

1. Do not cache or vendor the OSV advisory database; a pinned stale feed is
   worse than a live one for a vulnerability gate.
2. Keep the scanner **image** digest-pinned; bump it deliberately via PR.
3. If api.osv.dev is unreachable, treat the gate as failed (do not bypass
   with `--offline` or result caching).

## Current expiring exception

`GHSA-mh99-v99m-4gvg` is ignored only until **2026-08-29**. The affected
`brace-expansion@1.1.17` copy is development-only through
`eslint-config-next` and the shared `minimatch@3.1.5` dependency used by
`eslint-plugin-import`, `eslint-plugin-jsx-a11y`, and `eslint-plugin-react`. It
processes repository-authored static lint patterns and is absent from the
production dependency tree. The installed 1.1.17 source contains the
advisory's `maxLength` bound, but current advisory metadata recognizes only
5.0.8 as patched. `scripts/security-workflow-policy.test.ts` therefore locks
the sole ignored path, versions, three consumers, and development-only flags;
any new or downgraded copy fails the repository policy even while the scanner
exception exists. The pull-request dependency-review workflow carries the same
single exact GHSA allowance so its independently live advisory gate applies the
same reviewed decision. The repository maintainer owns both exceptions and must
remove them when advisory metadata or the upstream lint chain converges, or
re-review them at expiry.
