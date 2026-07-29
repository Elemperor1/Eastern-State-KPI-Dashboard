#!/usr/bin/env bash
# Design System guard — prevents bypassing the shared library in src/components/ui/.
#
# Scans src/app and src/components (excluding the library itself) for direct use of
# primitive classes and elements that should be owned by the library.
#
# Multiline-aware (finding S048-C4): matches className written with double
# quotes, single quotes, or template literals (including JSX expression
# containers), and primitive elements written in the Prettier multiline form
# (<button on its own line, props on following lines). perl -0777 slurp mode
# is used so matches span lines; perl ships on macOS and ubuntu runners.
set -euo pipefail

cd "$(dirname "$0")/.."

FAILED=0

# Slurp-mode perl scanner: prints file:line: match for every hit of the
# pattern in $GUARD_PATTERN (exported by the caller).
# shellcheck disable=SC2016 # $ENV is perl code reading the exported var, not shell expansion.
GUARD_PERL_SCAN='
  my $pat = $ENV{"GUARD_PATTERN"};
  while (/$pat/g) {
    my $prefix = substr($_, 0, $-[0]);
    my $line = 1 + ($prefix =~ tr/\n//);
    my $text = $&;
    $text =~ s/\s+/ /g;
    print "$ARGV:$line: $text\n";
  }
'

# Slurp-mode scan of src/app and src/components (minus the ui library) for
# the perl regex in $1; prints file:line: match for every hit.
scan_files() {
  local pattern="$1"
  find src/app src/components -type f \( -name '*.tsx' -o -name '*.ts' \) \
    ! -path 'src/components/ui/*' \
    -print0 2>/dev/null \
    | sort -z \
    | GUARD_PATTERN="$pattern" xargs -0 perl -0777 -ne "$GUARD_PERL_SCAN" \
    | head -20 || true
}

# Direct primitive class usage outside the library
# className may be double-quoted, single-quoted, a template literal, or a
# JSX expression container wrapping any of those (finding S048-C4).
flag_class() {
  local token="$1"
  local name="$2"
  local hits
  hits=$(scan_files "className\\s*=\\s*\\{?\\s*[\"'\\\`][^\"'\\\`]*${token}")
  if [ -n "$hits" ]; then
    echo "❌ ${name}"
    echo "$hits"
    FAILED=$((FAILED+1))
  fi
}

flag_class 'surface'       'surface class used outside library'
flag_class 'btn-'          'button class used outside library'
flag_class 'input'         'input class used outside library'
flag_class 'pill'          'pill class used outside library'
flag_class 'chip-active'   'chip-active class used outside library'
flag_class 'chip-inactive' 'chip-inactive class used outside library'

# Bare class tokens that are not className-anchored (utility hints).
flag_bare() {
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

flag_bare 'scroll-hint' 'scroll-hint class used outside library'
flag_bare 'data-table'  'data-table class used outside library'
flag_bare 'focus-visible:outline-2' '2px focus ring used outside library; interactive focus rings are uniformly 3px'

# Direct primitive elements outside the library. The lookahead accepts a
# space, '>', '/', or a newline after the tag, so the multiline Prettier
# form (<button on its own line) is caught as well (finding S048-C4).
flag_element() {
  local tag="$1"
  local hits
  hits=$(scan_files "<${tag}(?=[\\s/>])")
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
