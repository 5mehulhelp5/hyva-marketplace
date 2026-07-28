#!/usr/bin/env bash
set -euo pipefail
# Picks one real URL per page template for visual-regression comparison. READ-ONLY, pure text
# processing -- no Warden/DB/HTTP calls here (kept out on purpose so this stays unit-testable).
# Fixed-route templates (home/cart/checkout/account) are Magento core routes, identical on every
# Magento 2 install, so they never need discovery.
# Entity templates (category/product/cms) need a real slug: feed rows via stdin/--from-file,
# format entity_type<TAB>request_path (e.g. from a `url_rewrite` SQL query run separately -- see
# the skill's SKILL.md for how to obtain that file with warden-run-sql-query or bin/magento).
#
# Usage:
#   discover-pages.sh [--from-file FILE] [--path-prefix PREFIX] [TEMPLATE_KEY...]
#   (reads stdin instead of --from-file when entity rows are needed and FILE is omitted)
#
# Output TSV on stdout: template_key<TAB>path
# Known template keys: home cart checkout account category product cms

FROM_FILE=""
PREFIX=""
TEMPLATES=()
while [ $# -gt 0 ]; do
  case "$1" in
    --from-file) FROM_FILE="$2"; shift 2 ;;
    --path-prefix) PREFIX="$2"; shift 2 ;;
    *) TEMPLATES+=("$1"); shift ;;
  esac
done
if [ "${#TEMPLATES[@]}" -eq 0 ]; then
  TEMPLATES=(home cart checkout account category product cms)
fi

emit() { printf '%s\t%s%s\n' "$1" "$PREFIX" "$2"; }

entity_type_for() {
  case "$1" in
    category) echo "category" ;;
    product) echo "product" ;;
    cms) echo "cms-page" ;;
    *) echo "" ;;
  esac
}

need_entity_rows=false
for t in "${TEMPLATES[@]}"; do
  [ -n "$(entity_type_for "$t")" ] && need_entity_rows=true
done

ROWS=""
if [ "$need_entity_rows" = true ]; then
  if [ -n "$FROM_FILE" ] && [ "$FROM_FILE" != "-" ]; then
    ROWS="$(cat "$FROM_FILE")"
  else
    ROWS="$(cat)"
  fi
fi

first_path_for_entity() {
  local etype="$1"
  printf '%s\n' "$ROWS" | awk -F'\t' -v t="$etype" '$1==t { print $2; exit }'
}

for t in "${TEMPLATES[@]}"; do
  case "$t" in
    home) emit "home" "/" ;;
    cart) emit "cart" "checkout/cart/" ;;
    checkout) emit "checkout" "checkout/" ;;
    account) emit "account" "customer/account/login/" ;;
    category|product|cms)
      etype="$(entity_type_for "$t")"
      path="$(first_path_for_entity "$etype")"
      if [ -n "$path" ]; then
        emit "$t" "$path"
      else
        echo "WARN: no $etype row found, skipping template '$t'" >&2
      fi
      ;;
    *)
      echo "WARN: unknown template key '$t', skipping" >&2
      ;;
  esac
done
