#!/usr/bin/env bash
set -euo pipefail
# Runs the official Hyvä migration engine: refresh of the web/tailwind baseline + conversion
# of the config to CSS v4 (automatic backups). Via the project runner.
#
# Deliberately does NOT run `find-deprecated-classes.js`: it is report-only, scans only
# the .phtml/.xml, and its report is consumed by no step (dead-end). The detection of
# deprecated/renamed classes is done by scan-tailwind-v4-custom.sh (which also covers the .css
# and feeds the Finalize step B); the drift of the official Hyvä list is watched by
# check-deprecated-drift.sh.
#
# Runner: HYVA_RUNNER runs the command INSIDE the project's PHP container. Default = Warden;
# override for a plain-Docker setup, e.g.:
#   HYVA_RUNNER="docker compose exec -T php" run-tailwind-v4-migration.sh <THEME>
# Prerequisite: $HYVA_RUNNER composer require --dev hyva-themes/upgrade-helper-tools:dev-main
# Usage: run-tailwind-v4-migration.sh THEME_REL_PATH

THEME="${1:?theme path (relative to the project root) required}"
read -r -a RUNNER <<< "${HYVA_RUNNER:-warden env exec php-fpm}"

echo "==> Tailwind v4 migration (refresh baseline + config conversion; automatic backups)" >&2
echo "==> Runner: ${RUNNER[*]}" >&2
"${RUNNER[@]}" ./vendor/bin/update-to-tailwind-v4.js "$THEME"

echo "==> Done. web/tailwind is now the vendor copy; the custom CSS is in web/tailwind.backup.<date>." >&2
echo "==> Next: Finalize step (A consolidate tokens into hyva.config.json, B re-migrate customs from the backup, C keep CSS a full vendor copy + configure the parent scan, D/E checks), then rebuild (phase 7)." >&2
