#!/usr/bin/env bash
set -euo pipefail
# Snapshot of the installed Hyvä vendor packages, as a baseline BEFORE composer update.
# Usage: snapshot-vendor.sh [WORKDIR] [PKG ...]
# Default PKG: default-theme + theme-module. Prints WORKDIR on stdout (last line).

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
WORKDIR="${1:-$PROJECT_ROOT/var/hyva-upgrade/$(date +%Y%m%d-%H%M%S)}"
[ $# -gt 0 ] && shift || true
PKGS=("$@")
if [ "${#PKGS[@]}" -eq 0 ]; then
  PKGS=("hyva-themes/magento2-default-theme" "hyva-themes/magento2-theme-module")
fi

BASELINE="$WORKDIR/baseline"
mkdir -p "$BASELINE"
for pkg in "${PKGS[@]}"; do
  src="$PROJECT_ROOT/vendor/$pkg"
  if [ -d "$src" ]; then
    dest="$BASELINE/$pkg"
    mkdir -p "$(dirname "$dest")"
    cp -a "$src" "$dest"
    echo "snapshot: $pkg -> $dest" >&2
  else
    echo "WARN: package not found: $src" >&2
  fi
done
echo "$WORKDIR"
