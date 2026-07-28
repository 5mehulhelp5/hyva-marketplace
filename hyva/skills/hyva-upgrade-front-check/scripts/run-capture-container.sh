#!/usr/bin/env bash
set -euo pipefail
# Launches the EPHEMERAL Playwright container that executes capture-run.js (spec v2 §6a).
# - Image pinned below; it MUST match the exact "playwright-core" version in scripts/package.json
#   (browser builds are version-coupled). Bump both together, never one alone.
# - Joins the global "warden" Docker network (where traefik lives) and maps every domain used by
#   the manifest onto the traefik container IP, so the project's https:// domains resolve
#   in-container without touching host DNS.
# - Bind-mounts the project root at /work: captures land under the project tree (var/...), on the
#   same filesystem the diff step reads via `warden env exec php-fpm node`.
#
# Usage: run-capture-container.sh MANIFEST_REL OUT_REL [--dry-run]
#   MANIFEST_REL / OUT_REL: paths RELATIVE to the project root (must live inside it).
#   --dry-run: print the docker command instead of running it. ALWAYS show the dry-run to the
#   user first -- the first real run pulls a ~1-2 GB image and needs explicit confirmation.

PLAYWRIGHT_IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v1.61.1-noble}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

MANIFEST_REL="${1:?MANIFEST_REL required (relative to project root)}"
OUT_REL="${2:?OUT_REL required (relative to project root)}"
DRY_RUN=false
[ "${3:-}" = "--dry-run" ] && DRY_RUN=true

[ -f "$PROJECT_ROOT/$MANIFEST_REL" ] || { echo "ERROR: manifest not found: $PROJECT_ROOT/$MANIFEST_REL" >&2; exit 1; }

# Hostnames used by the manifest, parsed with node INSIDE the php-fpm container (never host node).
DOMAINS="$(warden env exec -T php-fpm node -e '
  const m = require("/var/www/html/" + process.argv[1])
  const hosts = new Set([new URL(m.before.baseUrl).hostname, new URL(m.after.baseUrl).hostname])
  console.log([...hosts].join(" "))
' "$MANIFEST_REL" || true)"
[ -n "$DOMAINS" ] || { echo "ERROR: could not extract domains from $MANIFEST_REL" >&2; exit 1; }

TRAEFIK_IP="$(docker inspect -f '{{with index .NetworkSettings.Networks "warden"}}{{.IPAddress}}{{end}}' traefik || true)"
[ -n "$TRAEFIK_IP" ] || { echo "ERROR: cannot resolve the traefik IP on the warden network (warden svc up?)" >&2; exit 1; }

ADD_HOSTS=()
for d in $DOMAINS; do ADD_HOSTS+=(--add-host "$d:$TRAEFIK_IP"); done

# Run as the HOST user: as root, captures land root-owned and the php-fpm-side differs cannot write
# heatmaps next to them. HOME=/tmp gives Chromium a writable home (crashpad/fontconfig) for an
# arbitrary uid.
CMD=(docker run --rm --ipc=host --network warden "${ADD_HOSTS[@]}"
  --user "$(id -u):$(id -g)" -e HOME=/tmp
  -v "$PROJECT_ROOT:/work" -w /work
  "$PLAYWRIGHT_IMAGE"
  node .claude/skills/hyva-upgrade-front-check/scripts/capture-run.js
  --manifest "$MANIFEST_REL" --out "$OUT_REL")

if [ "$DRY_RUN" = true ]; then
  printf 'DRY-RUN:'
  printf ' %q' "${CMD[@]}"
  printf '\n'
else
  exec "${CMD[@]}"
fi
