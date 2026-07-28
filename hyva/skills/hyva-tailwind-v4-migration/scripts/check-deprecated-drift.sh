#!/usr/bin/env bash
set -euo pipefail
# Drift guard: compares the official Hyvä deprecated-classes list
# (deprecatedTailwind4Classes, upstream source; our coverage is described in references/renamed-classes.tsv) against our
# baked-in list, and alerts if Hyvä covers classes that OUR scan does not.
# Degrades gracefully: if the Hyvä package or node are not available -> skip without error (exit 0).
# Exit 1 only when drift is detected (actionable signal).
# Runner: HYVA_RUNNER runs `node` INSIDE the project's PHP container. Default = Warden; override for a
# plain-Docker setup, e.g. HYVA_RUNNER="docker compose exec -T php" check-deprecated-drift.sh
# Usage: check-deprecated-drift.sh   (run from the project root, when bumping upgrade-helper-tools)

PROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MODULE="$PROOT/vendor/hyva-themes/upgrade-helper-tools/src/utils/tailwind.js"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TSV="$SCRIPT_DIR/../references/renamed-classes.tsv"
# Names covered by our single source (1st column, excluding comments/empty lines).
OURS="$(awk -F'\t' '!/^#/ && NF { print $1 }' "$TSV" | LC_ALL=C sort -u)"

if [ ! -f "$MODULE" ]; then
  echo "drift-check: Hyvä module absent ($MODULE) -> skip (the scan stays functional)." >&2
  exit 0
fi

# Extract the names from the official list via node, inside the project's PHP container.
read -r -a RUNNER <<< "${HYVA_RUNNER:-warden env exec php-fpm}"
HYVA="$("${RUNNER[@]}" node -e \
  'const m=require("./vendor/hyva-themes/upgrade-helper-tools/src/utils/tailwind.js"); process.stdout.write(m.deprecatedTailwind4Classes.map(p=>p.name).sort().join("\n"))' \
  2>/dev/null || true)"

if [ -z "$HYVA" ]; then
  echo "drift-check: node extraction unavailable -> skip (the scan stays functional)." >&2
  exit 0
fi

# Entries present in Hyvä but absent from our list.
MISSING="$(comm -23 <(printf '%s\n' "$HYVA" | sort -u) <(printf '%s\n' "$OURS" | sort -u) || true)"

if [ -n "$MISSING" ]; then
  echo "⚠️  drift-check: Hyvä lists deprecated classes NOT covered by our scan:" >&2
  printf '   - %s\n' $MISSING >&2
  echo "   -> add these classes to references/renamed-classes.tsv (single source) [+ cat.6 of the catalogue]." >&2
  exit 1
fi

echo "drift-check: OK, our scan covers the entire Hyvä deprecatedTailwind4Classes list." >&2
