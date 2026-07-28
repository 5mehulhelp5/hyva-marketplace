#!/usr/bin/env bash
set -euo pipefail
# Diffs the default-theme between baseline and target, restricted to the overridden files.
# Usage: diff-overrides.sh BASELINE_DIR NEW_DIR OVERRIDES_LIST OUT_DIR THEME_DIR

BASELINE="${1:?BASELINE_DIR required}"
NEW="${2:?NEW_DIR required}"
LIST="${3:?OVERRIDES_LIST required}"
OUT="${4:?OUT_DIR required}"
THEME_DIR="${5:?THEME_DIR required}"

mkdir -p "$OUT/patches"
: > "$OUT/changed.txt"
: > "$OUT/unchanged.txt"
: > "$OUT/removed-in-target.txt"
: > "$OUT/pristine.txt"

while IFS= read -r rel; do
  [ -z "$rel" ] && continue
  old="$BASELINE/$rel"
  new="$NEW/$rel"
  safe="${rel//\//__}"
  if [ -f "$old" ] && [ -f "$new" ]; then
    set +e
    git --no-pager diff --no-index --no-color "$old" "$new" > "$OUT/patches/$safe.patch"
    rc=$?
    set -e
    if [ "$rc" -eq 0 ]; then
      rm -f "$OUT/patches/$safe.patch"
      echo "$rel" >> "$OUT/unchanged.txt"
    else
      echo "$rel" >> "$OUT/changed.txt"
    fi
    # 3rd comparison: is the child override an exact copy of the old vendor?
    if [ -f "$THEME_DIR/$rel" ] && [ -f "$old" ] && diff -q "$THEME_DIR/$rel" "$old" >/dev/null 2>&1; then
      echo "$rel" >> "$OUT/pristine.txt"
    fi
  elif [ -f "$old" ] && [ ! -f "$new" ]; then
    echo "$rel" >> "$OUT/removed-in-target.txt"
  fi
done < "$LIST"

echo "diff: $(wc -l < "$OUT/changed.txt") changed, $(wc -l < "$OUT/unchanged.txt") unchanged, $(wc -l < "$OUT/removed-in-target.txt") removed, $(wc -l < "$OUT/pristine.txt") pristine" >&2
