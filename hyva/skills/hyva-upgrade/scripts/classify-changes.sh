#!/usr/bin/env bash
set -euo pipefail
# Classifies each patch: auto-safe vs needs-review.
# - pristine override (identical to the old vendor) -> auto-safe (nothing custom to preserve).
# - class/whitespace-only change -> auto-safe; DOM/logic -> needs-review.
# Usage: classify-changes.sh OUT_DIR  (must contain patches/; pristine.txt optional)

OUT="${1:?OUT_DIR required}"
report="$OUT/classification.tsv"
: > "$report"
PRISTINE="$OUT/pristine.txt"; [ -f "$PRISTINE" ] || PRISTINE=/dev/null

shopt -s nullglob
for patch in "$OUT"/patches/*.patch; do
  rel="$(basename "${patch%.patch}")"; rel="${rel//__//}"

  # 1) Pristine override -> auto-safe regardless of the upstream change.
  if grep -Fxq "$rel" "$PRISTINE"; then
    printf '%s\t%s\t%s\n' "auto-safe" "pristine" "$rel" >> "$report"
    continue
  fi

  changed="$(grep -E '^[+-]' "$patch" | grep -Ev '^(\+\+\+|---)' || true)"
  priority="class"; classification="auto-safe"

  # 2) Neutralize the class="..." values before the DOM test (5.2).
  neutralised="$(printf '%s\n' "$changed" | sed -E 's/class="[^"]*"/class=""/g')"

  # DOM structure: tag added/removed AFTER class neutralization.
  if printf '%s\n' "$neutralised" | grep -Eq '^[+-].*<[a-zA-Z/][^>]*>'; then
    priority="dom"; classification="needs-review"
  fi
  # Logic: PHP, Alpine, Magewire, JS.
  if printf '%s\n' "$changed" | grep -Eq '^[+-].*(<\?php|\$block|x-data|x-init|@click|wire:|=>|function )'; then
    priority="logic"; classification="needs-review"
  fi
  # Pure whitespace.
  nonws="$(printf '%s\n' "$changed" | sed -E 's/^[+-][[:space:]]*//' | grep -v '^$' || true)"
  if [ -z "$nonws" ]; then priority="whitespace"; classification="auto-safe"; fi

  printf '%s\t%s\t%s\n' "$classification" "$priority" "$rel" >> "$report"
done

echo "classification -> $report ($(wc -l < "$report") file(s))" >&2
