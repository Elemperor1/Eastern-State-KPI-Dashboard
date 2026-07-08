#!/usr/bin/env bash
# Architecture boundary guard for the modular-monolith refactor.
#
# Keeps server-owned code on direct feature calls instead of self-HTTP, and
# prevents fully removed internal read adapters from reappearing in source or
# smoke tooling.
set -euo pipefail

cd "$(dirname "$0")/.."

FAILED=0

flag_failure() {
  local title="$1"
  local hits="$2"
  echo "❌ ${title}"
  echo "$hits"
  FAILED=$((FAILED + 1))
}

removed_route_hits="$(
  grep -R -n -E '(/api/(meta|entries/years|entries/history)|src/app/api/(meta|entries/years|entries/history)|app/api/(meta|entries/years|entries/history))' src scripts \
    --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
    --include='*.mjs' --include='*.cjs' --include='*.sh' --include='*.py' \
    | grep -v 'scripts/architecture-boundary-guard.sh' \
    | head -40 || true
)"

if [ -n "$removed_route_hits" ]; then
  flag_failure "removed internal read API route referenced from source or scripts" "$removed_route_hits"
fi

for route_dir in \
  src/app/api/meta \
  src/app/api/entries/years \
  src/app/api/entries/history
do
  if [ -e "$route_dir" ]; then
    flag_failure "removed API route directory still exists" "$route_dir"
  fi
done

server_self_http_hits="$(
  find src/app src/features src/lib -type f \( -name '*.ts' -o -name '*.tsx' \) \
    ! -name '*.test.ts' ! -name '*.test.tsx' \
    ! -path 'src/lib/api-client.ts' \
    -print \
    | sort \
    | while IFS= read -r file; do
        awk '
          BEGIN { client = 0; checked = 0; in_block = 0 }
          {
            text = $0
            trimmed = $0
            sub(/^[[:space:]]+/, "", trimmed)

            if (!checked) {
              if (in_block) {
                if (trimmed ~ /\*\//) {
                  in_block = 0
                }
                next
              }
              if (trimmed == "" || trimmed ~ /^\/\//) {
                next
              }
              if (trimmed ~ /^\/\*/) {
                if (trimmed !~ /\*\//) {
                  in_block = 1
                }
                next
              }
              checked = 1
              if (trimmed ~ /^["\047]use client["\047];?$/) {
                client = 1
              }
            }

            if (client) {
              next
            }
            if (text ~ /apiFetch[[:space:]]*\(/ || (text ~ /fetch[[:space:]]*\(/ && text ~ /\/api\//)) {
              printf "%s:%d:%s\n", FILENAME, FNR, text
            }
          }
        ' "$file"
      done \
    | head -40 || true
)"

if [ -n "$server_self_http_hits" ]; then
  flag_failure "server-owned code calls the app's own API boundary" "$server_self_http_hits"
fi

is_client_component() {
  awk '
    BEGIN { checked = 0; in_block = 0 }
    {
      trimmed = $0
      sub(/^[[:space:]]+/, "", trimmed)

      if (in_block) {
        if (trimmed ~ /\*\//) {
          in_block = 0
        }
        next
      }
      if (trimmed == "" || trimmed ~ /^\/\//) {
        next
      }
      if (trimmed ~ /^\/\*/) {
        if (trimmed !~ /\*\//) {
          in_block = 1
        }
        next
      }

      checked = 1
      if (trimmed ~ /^["\047]use client["\047];?$/) {
        exit 0
      }
      exit 1
    }
    END {
      if (!checked) {
        exit 1
      }
    }
  ' "$1"
}

client_server_import_hits="$(
  find src/app src/components src/features -type f \( -name '*.ts' -o -name '*.tsx' \) \
    ! -name '*.test.ts' ! -name '*.test.tsx' \
    -print \
    | sort \
    | while IFS= read -r file; do
        if is_client_component "$file"; then
          grep -n -E "from ['\"](@/lib/db|@/features/[^'\"]+/server|node:sqlite)['\"]|import[[:space:]]*\\([[:space:]]*['\"](@/lib/db|@/features/[^'\"]+/server|node:sqlite)['\"]" "$file" \
            | sed "s#^#${file}:#" || true
        fi
      done \
    | head -40 || true
)"

if [ -n "$client_server_import_hits" ]; then
  flag_failure "client component imports server-only data access" "$client_server_import_hits"
fi

ui_database_import_hits="$(
  find src/app src/components -type f \( -name '*.ts' -o -name '*.tsx' \) \
    ! -name '*.test.ts' ! -name '*.test.tsx' \
    -print \
    | sort \
    | while IFS= read -r file; do
        grep -n -E "from ['\"](@/lib/db|node:sqlite)['\"]|import[[:space:]]*\\([[:space:]]*['\"](@/lib/db|node:sqlite)['\"]" "$file" \
          | sed "s#^#${file}:#" || true
      done \
    | head -40 || true
)"

if [ -n "$ui_database_import_hits" ]; then
  flag_failure "app or component layer imports low-level database access" "$ui_database_import_hits"
fi

cross_feature_internal_hits="$(
  find src/features -type f \( -name '*.ts' -o -name '*.tsx' \) \
    ! -name '*.test.ts' ! -name '*.test.tsx' \
    -print \
    | sort \
    | while IFS= read -r file; do
        grep -n -E "from ['\"]@/features/[^/'\"]+/[^'\"]+['\"]|import[[:space:]]*\\([[:space:]]*['\"]@/features/[^/'\"]+/[^'\"]+['\"]" "$file" \
          | grep -v -E '^[0-9]+:[[:space:]]*(\*|//)' \
          | grep -v -E "@/features/[^/'\"]+/server['\"]" \
          | sed "s#^#${file}:#" || true
      done \
    | head -40 || true
)"

if [ -n "$cross_feature_internal_hits" ]; then
  flag_failure "feature imports another feature's internal module" "$cross_feature_internal_hits"
fi

calculation_dependency_hits="$(
  find src/features src/lib -type f \( \
      -name '*calculation*.ts' -o \
      -name 'analytics.ts' -o \
      -name 'period-rules.ts' \
    \) \
    ! -name '*.test.ts' \
    -print \
    | sort \
    | while IFS= read -r file; do
        grep -n -E "from ['\"](react|react/|next|next/|@/lib/db|node:sqlite)['\"]|import[[:space:]]*\\([[:space:]]*['\"](react|react/|next|next/|@/lib/db|node:sqlite)['\"]" "$file" \
          | sed "s#^#${file}:#" || true
      done \
    | head -40 || true
)"

if [ -n "$calculation_dependency_hits" ]; then
  flag_failure "calculation module depends on React, Next.js, or database code" "$calculation_dependency_hits"
fi

if [ "$FAILED" -eq 0 ]; then
  echo "✅ Architecture boundary guard passed: server code uses feature calls, app/components avoid low-level DB access, client code avoids server-only imports, cross-feature imports use public surfaces, pure calculations avoid framework/database dependencies, and removed read APIs stay removed."
  exit 0
fi

echo ""
echo "Architecture boundary guard failed with $FAILED violation(s)."
echo "Use feature-owned server operations for trusted server reads, keep low-level DB access out of app/components, keep server-only modules out of client components, import other features only through public surfaces, keep calculations framework/database-free, and keep removed read adapters out of src/scripts."
exit 1
