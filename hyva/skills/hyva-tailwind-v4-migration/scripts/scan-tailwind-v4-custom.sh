#!/usr/bin/env bash
set -euo pipefail
# Scans a Hyvä theme (+ additional sources like app/code) to detect the Tailwind v3 authoring
# patterns to migrate to v4. READ-ONLY. TSV output: file<TAB>pattern<TAB>tier<TAB>note
# The renamed/removed classes are read from references/renamed-classes.tsv (single source).
# Usage: scan-tailwind-v4-custom.sh THEME_DIR [VENDOR_DEFAULT_THEME_DIR] [SOURCE_ROOT...]
#   THEME_DIR    = theme root (or a module vendor folder for a "module-only" scan)
#   VENDOR_...   = default-theme package root (auto default if empty "") — used for the baseline filter
#   SOURCE_ROOT… = additional folders (e.g. app/code) — scanned .phtml AND .css/.scss, without baseline filter
# Env override:
#   TW_DIR       = CSS scan root (default "$THEME_DIR/web/tailwind"). Point it at the backup for the
#                  Finalize step B, e.g. TW_DIR="$THEME_DIR/web/tailwind.backup.<date>" — the official
#                  tool moves the custom CSS there. The .phtml scan (theme + SOURCE_ROOTs) is unaffected.

THEME_DIR="${1:?THEME_DIR required}"
TWDIR="${TW_DIR:-$THEME_DIR/web/tailwind}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TSV="$SCRIPT_DIR/../references/renamed-classes.tsv"

VENDOR_ROOT="${2:-}"
EXTRA_ROOTS=()
if [ "$#" -gt 2 ]; then EXTRA_ROOTS=("${@:3}"); fi

if [ -z "$VENDOR_ROOT" ]; then
  PROOT="$(git -C "$THEME_DIR" rev-parse --show-toplevel 2>/dev/null || pwd)"
  VENDOR_ROOT="$PROOT/vendor/hyva-themes/magento2-default-theme"
fi
[ -d "$VENDOR_ROOT" ] || VENDOR_ROOT=""

# --- Build the patterns from the .tsv (single source) ---
RENAME_ALT=""        # alternation of the renamed + decoration classes (kind rename/removed-decoration)
while IFS=$'\t' read -r name replacement tier kind; do
  case "$name" in ''|'#'*) continue ;; esac
  case "$kind" in
    rename|removed-decoration)
      RENAME_ALT="${RENAME_ALT:+$RENAME_ALT|}$name" ;;
  esac
done < "$TSV"
# Pattern of the opacity families (prefix-opacity-<n>), independent of the .tsv for the shape:
OPACITY_RE='\b(bg|text|border|divide|ring|placeholder)-opacity-[0-9]+\b'

emit() { printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4"; }

is_baseline() {
  local rel="$1"
  [ -n "$VENDOR_ROOT" ] && [ -f "$VENDOR_ROOT/$rel" ] && diff -q "$THEME_DIR/$rel" "$VENDOR_ROOT/$rel" >/dev/null 2>&1
}

check_css() {
  local rel="$1" f="$2"
  if [[ "$f" == *.scss ]]; then
    if grep -Eq '(\$[a-zA-Z_][a-zA-Z0-9_-]*|@mixin|@include|@function|@each|@if)' "$f"; then
      emit "$rel" "scss-features" "needs-review" "real SCSS features -> de-SCSS-ify + rename .css"
    else
      emit "$rel" "scss-rename" "auto-safe" "no SCSS feature -> rename to .css"
    fi
  fi
  if grep -Eq '@layer[[:space:]]+(utilities|components)' "$f"; then
    emit "$rel" "layer-to-utility" "needs-review" "@layer utilities/components -> @utility (otherwise no more variants)"
  fi
  if grep -Eq 'theme\(' "$f"; then
    emit "$rel" "theme-fn" "auto-safe" "theme(...) -> var(--...) ; in @media -> theme(--breakpoint-*)"
  fi
  if [ -n "$RENAME_ALT" ] && grep -Eq "@apply[^;]*($RENAME_ALT)" "$f"; then
    emit "$rel" "apply-renamed-class" "auto-safe" "v4 renamed class in @apply (see renamed-classes.tsv)"
  fi
  if grep -Eq "@apply[^;]*$OPACITY_RE" "$f"; then
    emit "$rel" "removed-opacity-util" "needs-review" "*-opacity-* removed -> modifier (e.g. bg-white/50)"
  fi
  if grep -Eq "[a-z-]+-\[--" "$f"; then
    emit "$rel" "arbitrary-var" "auto-safe" "v4 syntax: -[--x] -> -(--x)"
  fi
  # Border-color compatibility shim left by the migration tool (universal selector + v3 default reset).
  if grep -Eq 'border-color:[[:space:]]*(currentColor|var\(--color-gray-200|theme\()' "$f" \
     && grep -Eq '(^|[^.[:alnum:]])\*[[:space:]]*(,|\{)' "$f"; then
    emit "$rel" "border-shim" "needs-review" "universal border-color reset (v3 default shim) -> keep intentional or remove (cat.7)"
  fi
}

check_phtml() {
  local rel="$1" f="$2"
  if [ -n "$RENAME_ALT" ] && grep -EqI "[[:space:]\":]($RENAME_ALT)[[:space:]\"]" "$f"; then
    emit "$rel" "tpl-renamed-class" "auto-safe" "v4 renamed/removed class in a template (see renamed-classes.tsv)"
  fi
  if grep -EqI "$OPACITY_RE" "$f"; then
    emit "$rel" "removed-opacity-util" "needs-review" "*-opacity-* removed -> modifier (e.g. bg-white/50)"
  fi
}

# --- 1) Theme: custom CSS under web/tailwind ---
if [ -d "$TWDIR" ]; then
  while IFS= read -r f; do
    rel="${f#"$THEME_DIR"/}"; is_baseline "$rel" && continue
    check_css "$rel" "$f"
  done < <(find "$TWDIR" -type f \( -name '*.css' -o -name '*.scss' \) \
             -not -path '*/generated/*' -not -path '*/node_modules/*' | LC_ALL=C sort)

  while IFS= read -r cfg; do
    [ -z "$cfg" ] && continue
    rel="${cfg#"$THEME_DIR"/}"
    if grep -Eq 'addUtilities|addComponents|plugins[[:space:]]*:' "$cfg"; then
      emit "$rel" "js-plugin" "needs-review" "JS plugin/addUtilities -> port to @utility (CSS v4 config)"
    fi
  done < <(find "$TWDIR" -maxdepth 2 -type f \
             \( -name 'tailwind.config.js' -o -name 'tailwind.config.js.bak' -o -name 'tailwind.config.js.orig' \) 2>/dev/null)
fi

# --- 2) Theme: .phtml templates (outside web/) ---
while IFS= read -r f; do
  rel="${f#"$THEME_DIR"/}"; is_baseline "$rel" && continue
  check_phtml "$rel" "$f"
done < <(find "$THEME_DIR" -type f -name '*.phtml' \
           -not -path '*/web/*' -not -path '*/node_modules/*' | LC_ALL=C sort)

# --- 3) Additional sources (e.g. app/code): .phtml AND .css/.scss, without baseline filter ---
if [ "${#EXTRA_ROOTS[@]}" -gt 0 ]; then
  for root in "${EXTRA_ROOTS[@]}"; do
    [ -z "$root" ] && continue
    [ -d "$root" ] || continue
    while IFS= read -r f; do rel="${f#"$root"/}"; check_phtml "$rel" "$f"; done \
      < <(find "$root" -type f -name '*.phtml' -not -path '*/node_modules/*' | LC_ALL=C sort)
    while IFS= read -r f; do rel="${f#"$root"/}"; check_css "$rel" "$f"; done \
      < <(find "$root" -type f \( -name '*.css' -o -name '*.scss' \) \
            -not -path '*/node_modules/*' -not -path '*/generated/*' | LC_ALL=C sort)
  done
fi
