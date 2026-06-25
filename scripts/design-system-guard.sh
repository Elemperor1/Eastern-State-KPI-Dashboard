#!/usr/bin/env bash
# Design System guard — prevents bypassing the shared library in src/components/ui/.
#
# Scans src/app and src/components (excluding the library itself) for direct use of
# primitive classes and elements that should be owned by the library.
set -euo pipefail

cd "$(dirname "$0")/.."

FAILED=0

# Direct primitive class usage outside the library
flag_class() {
  local pattern="$1"
  local name="$2"
  local hits
  hits=$(grep -R -n "${pattern}" src/app src/components \
    --include='*.tsx' --include='*.ts' \
    | grep -v 'src/components/ui/' \
    | head -20 || true)
  if [ -n "$hits" ]; then
    echo "❌ ${name}"
    echo "$hits"
    FAILED=$((FAILED+1))
  fi
}

flag_class 'className="[^"]*surface'     'surface class used outside library'
flag_class 'className="[^"]*btn-'        'button class used outside library'
flag_class 'className="[^"]*input'       'input class used outside library'
flag_class 'className="[^"]*pill'        'pill class used outside library'
flag_class 'className="[^"]*chip-active' 'chip-active class used outside library'
flag_class 'className="[^"]*chip-inactive' 'chip-inactive class used outside library'
flag_class 'scroll-hint'                  'scroll-hint class used outside library'
flag_class 'data-table'                   'data-table class used outside library'

# Direct primitive elements outside the library (with className; bare tags are harder to distinguish)
flag_element() {
  local tag="$1"
  local hits
  hits=$(grep -R -n "<${tag}[[:space:]]" src/app src/components \
    --include='*.tsx' --include='*.ts' \
    | grep -v 'src/components/ui/' \
    | head -20 || true)
  if [ -n "$hits" ]; then
    echo "❌ raw <${tag}> used outside library"
    echo "$hits"
    FAILED=$((FAILED+1))
  fi
}

flag_element 'button'
flag_element 'input'
flag_element 'select'
flag_element 'table'

if [ "$FAILED" -eq 0 ]; then
  echo "✅ Design System guard passed: no primitive bypasses detected outside src/components/ui/."
  exit 0
else
  echo ""
  echo "Design System guard failed with $FAILED violation(s)."
  echo "Route new UI through components exported from src/components/ui/."
  exit 1
fi
