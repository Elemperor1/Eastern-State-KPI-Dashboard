#!/usr/bin/env bash
# Design-tokens guard — prevents bypassing the Tailwind theme tokens.
#
# Scans src/app and src/components (excluding the design-system library at
# src/components/ui/ and the source-of-truth globals.css) for the three
# known bypass patterns:
#
#   1. Literal hex colors in source files
#        e.g. style={{ color: "#150f23" }}
#             bgColor: "#c2ef4e"
#             fill="#6a5fc1"
#
#   2. Raw `transition: all` (or `transition:all`) in CSS / inline styles
#        e.g. .foo { transition: all 200ms ease; }
#        Note: Tailwind utilities like `transition-[scale,...]` are
#        fine — they live in the design system already.
#
#   3. Inline `style={{ … }}` blocks that hard-code a hex literal
#        Same surface as #1, but reported with its own heading so the
#        failure message points at the exact JSX node.
#
# Exits non-zero if any pattern is found, with file:line citations.
set -euo pipefail

cd "$(dirname "$0")/.."

# Files we never lint — these own the tokens by design. The library lives
# at src/components/ui/, and the source-of-truth CSS variables live at
# src/app/globals.css. Both are excluded from every scan below.
EXCLUDE_FILE_PATTERNS=(
  'src/components/ui/'
  'src/app/globals.css'
)

# run_scan <name> <grep args...>
# Pipes raw grep output through the exclude filter, returning the surviving
# file:line hits. Uses a temp file so we can distinguish "no matches" from
# "exclude-filtered everything" without eval'ing user-controlled patterns.
run_scan() {
  local name="$1"
  shift

  local tmp
  tmp="$(mktemp)"
  # shellcheck disable=SC2068
  grep -R -n -E "$@" src/app src/components --include='*.tsx' --include='*.ts' >"$tmp" 2>/dev/null || true

  # Apply excludes via grep -v in a single chain.
  local filtered="$tmp"
  for pat in "${EXCLUDE_FILE_PATTERNS[@]}"; do
    local next
    next="$(mktemp)"
    grep -v -F "$pat" "$filtered" >"$next" 2>/dev/null || true
    rm -f "$filtered"
    filtered="$next"
  done

  # Truncate to first 40 hits so a runaway regex doesn't spam logs.
  local hits
  hits="$(head -40 "$filtered")"
  rm -f "$filtered"

  if [ -n "$hits" ]; then
    echo "❌ ${name}"
    echo "${hits}"
    echo ""
    local count
    count="$(echo "${hits}" | wc -l | tr -d ' ')"
    FAILED=$((FAILED + 1))
    TOTAL_HITS=$((TOTAL_HITS + count))
  fi
}

FAILED=0
TOTAL_HITS=0

# 1. Hex color literals — 3, 4, 6, or 8 hex digits, word-boundary terminated.
#    Examples that match: #fff, #ffff, #ffffff, #ffffff00.
#    Anchor links like #section-2 will not match (chars > 'f' present).
HEX_PATTERN='#[0-9a-fA-F]{3}([0-9a-fA-F]{1}|[0-9a-fA-F]{3}|[0-9a-fA-F]{5})?\b'

run_scan "literal hex color found outside design-system library" "${HEX_PATTERN}"

# 2. Raw `transition: all` (the "all" token). Tailwind's `transition-[…]`
#    utilities do not match this because they use brackets and CSS variables,
#    not a `transition: all` property.
run_scan "raw 'transition: all' found outside design-system library" \
         'transition[[:space:]]*:[[:space:]]*all\b'

# 3. Inline style props containing a hex literal. Same regex as #1, reported
#    separately so the violation block names the JSX surface explicitly.
INLINE_STYLE_HEX_PATTERN="style=\\{[^}]*${HEX_PATTERN}"

run_scan "inline style prop contains hex literal (use a token, not a literal)" \
         "${INLINE_STYLE_HEX_PATTERN}"

if [ "$FAILED" -eq 0 ]; then
  echo "✅ Design-tokens guard passed: no hex literals, no 'transition: all', no inline-style color bypasses outside src/components/ui/."
  exit 0
else
  echo "Design-tokens guard failed with ${FAILED} violation type(s) (${TOTAL_HITS} total hits)."
  echo ""
  echo "Remediation:"
  echo "  - Replace hex literals with Tailwind theme classes (text-ink-950, bg-brand-500, …) or CSS variables from src/app/globals.css."
  echo "  - Replace raw 'transition: all' with a named-property Tailwind utility (transition-colors, transition-opacity, transition-[scale,bg-color])."
  echo "  - If a token doesn't exist yet, add it to tailwind.config.ts and globals.css — never inline a literal in a page or feature component."
  exit 1
fi