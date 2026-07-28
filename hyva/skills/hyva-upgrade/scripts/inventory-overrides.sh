#!/usr/bin/env bash
set -euo pipefail
# Lists the child theme files that OVERRIDE a default-theme Hyvä file.
# An override = a theme file whose same relative path exists in the vendor.
# Usage: inventory-overrides.sh THEME_DIR VENDOR_DEFAULT_THEME_DIR

THEME_DIR="${1:?THEME_DIR required}"
VENDOR_DIR="${2:?VENDOR_DEFAULT_THEME_DIR required}"

# Resolve VENDOR_DIR to an absolute path BEFORE the cd (otherwise the relative one breaks after cd).
VENDOR_DIR="$(cd "$VENDOR_DIR" && pwd)"

cd "$THEME_DIR"
find . -type f \
  \( -name '*.phtml' -o -path '*/layout/*.xml' -o -name '*.js' -o -name '*.html' -o -name '*.css' \) \
  -not -path '*/node_modules/*' \
  -not -path '*/web/tailwind/*' \
  -not -path '*/web/css/*' \
  | sed 's#^\./##' | LC_ALL=C sort | while read -r rel; do
      if [ -f "$VENDOR_DIR/$rel" ]; then
        echo "$rel"
      fi
    done
