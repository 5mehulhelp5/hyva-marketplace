#!/bin/bash
# Mirrors the skills of hyva-themes/hyva-ai-tools into hyva/skills/.
# hyva/skills/ is an exact copy of upstream: skills removed upstream are removed here too.
# Internal Synolia skills live in the hyva-extras plugin of synolia-marketplace, never here.
# Review the resulting diff, then commit.
set -euo pipefail

UPSTREAM="${UPSTREAM:-https://github.com/hyva-themes/hyva-ai-tools.git}"
REF="${1:-main}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

git clone -q --depth 1 --branch "$REF" "$UPSTREAM" "$tmp"
[ -d "$tmp/skills" ] || { echo "No skills/ directory upstream, aborting." >&2; exit 1; }

rsync -a --delete --exclude '.DS_Store' "$tmp/skills/" "$ROOT/hyva/skills/"

echo "Synced from upstream $REF @ $(git -C "$tmp" rev-parse --short HEAD)"
git -C "$ROOT" status --short -- hyva/skills
