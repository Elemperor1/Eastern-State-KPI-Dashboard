# Vendored Semgrep registry packs (finding S046-C1)

`scripts/run-semgrep.mjs` previously fetched the mutable registry packs
`p/nodejs` and `p/react` from semgrep.dev on every run, so gate coverage could
silently drift (or be altered registry-side) with no repository-visible diff.
The packs are now vendored in this directory and the scan runs with the
container network disabled (`dockerArgs(..., { network: false })`), making
the gate fully offline and reproducible.

## Snapshot provenance

| File           | Source pack | Rules | Fetched    |
| -------------- | ----------- | ----- | ---------- |
| `p-nodejs.yml` | `p/nodejs`  | 36    | 2026-07-28 |
| `p-react.yml`  | `p/react`   | 4     | 2026-07-28 |

Fetched as the exact YAML the scanner resolves via the registry `/c/`
endpoint (`curl -sfL -H 'User-Agent: semgrep/1.164.0'
https://semgrep.dev/c/p/<pack>`) and validated by rule count: the pinned
image reports `Ran 40 rules` for the live packs and for the vendored files.

Scanner image (unchanged, digest-pinned):
`semgrep/semgrep:1.164.0@sha256:207983631beecdbe7fa29196c7f4a7a5f29033933cdb76c687ce4a672e07618d`.

## Refresh procedure

Refreshing the packs is a deliberate, reviewable change:

1. Fetch both packs at the URLs above into this directory (keep the header
   comments and update the fetched date).
2. Run `npm run security:semgrep` and confirm the rule count matches the sum
   of the two snapshots plus the in-repo `.semgrep.yml` rules.
3. Review the snapshot diff in the PR like any other security-gate change.

Do not reintroduce `p/` registry references in `scripts/run-semgrep.mjs`;
`scripts/security-workflow-policy.test.ts` fails if they return.
