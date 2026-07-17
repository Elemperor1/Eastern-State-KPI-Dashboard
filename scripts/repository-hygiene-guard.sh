#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

ignored_tracked="$(git ls-files -ci --exclude-standard)"
if [[ -n "$ignored_tracked" ]]; then
  echo "Repository hygiene guard failed: tracked files are hidden by .gitignore:" >&2
  printf '%s\n' "$ignored_tracked" >&2
  exit 1
fi

forbidden_tracked="$({
  git ls-files | awk '
    /(^|\/)(\.DS_Store|Thumbs\.db)$/ ||
    /(^|\/)(\.next|node_modules|coverage|\.nyc_output|\.turbo|\.vercel|playwright-report|test-results|blob-report)(\/|$)/ ||
    /(^|\/)(\.idea|\.vscode|\.history|\.claude|\.cursor|\.opencode|\.pi|\.agents)(\/|$)/ ||
    /(^|\/)\.codex\/(skills|security-scans|tmp)(\/|$)/ ||
    /(^|\/)(data|downloads|generated-exports|uploads)(\/|$)/ ||
    /(^|\/)\.env($|\.)/ && $0 !~ /\.env(\.[^.]+)*\.example$/ ||
    /(^|\/)next-env\.d\.ts$/ ||
    /\.(db|sqlite|sqlite3)(-(journal|shm|wal))?$/ && $0 !~ /(^|\/)(fixtures|testdata)\// ||
    /(^|\/)ultimate-bug-scan-report\./ ||
    /(^|\/)(trivy-results|semgrep-results|gitleaks-report|osv-results)\./ {
      print
    }
  '
} | sort -u)"

if [[ -n "$forbidden_tracked" ]]; then
  echo "Repository hygiene guard failed: generated or local-only paths are tracked:" >&2
  printf '%s\n' "$forbidden_tracked" >&2
  exit 1
fi

echo "Repository hygiene guard passed."
