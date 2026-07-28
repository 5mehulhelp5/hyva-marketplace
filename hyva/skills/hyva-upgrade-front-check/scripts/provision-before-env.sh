#!/usr/bin/env bash
set -euo pipefail
# Provisions (or refreshes/tears down) the read-only "before" reference environment used by
# hyva-upgrade-front-check: a full clone of the current Warden project (code + media) plus a
# LOGICAL clone of its database (dump the original -> import into the clone's own db), deployed as a
# PREFIXED Warden env so it never collides with the current ("after") environment.
#
# `create` snapshots the project AS IT IS AT CALL TIME: to be a valid "before" baseline it must run
# BEFORE the migration touches any file or the DB (in the hyva-upgrade flow: before Phase 1). Once the
# working project is migrated, only `status`/`teardown` are safe -- `refresh` re-imports the migrated
# DB and destroys the baseline.
#
# Wiring: env.php resolves infra hosts through `$_ENV['WARDEN_ENV_NAME_PREFIX']`, so the clone is
# created as a PREFIXED env (WARDEN_ENV_NAME=before-<name> + WARDEN_ENV_NAME_PREFIX=before-). env.php
# then auto-wires db/redis/es to the clone's own containers and keeps resolving correctly after
# env-install regenerates env.php -- which a plain env.php sed would not survive.
#
# The DB is cloned logically (dump the original -> import into the clone's own db via its `db`
# container, mysql on localhost), NOT via `warden volume backup-env`/`restore-env`: the latter key
# the restore off the tar's ORIGINAL volume name and do not populate the clone's volumes.
#
# Usage:
#   provision-before-env.sh status                # report whether a "before" clone exists
#   provision-before-env.sh create [--dry-run]     # clone project + DB, wire + deploy the clone
#   provision-before-env.sh refresh [--dry-run]    # re-import the DB into an existing clone
#   provision-before-env.sh teardown [--dry-run]   # warden env down -v + remove the clone directory
#
# --dry-run prints every command that would run, without executing anything -- always run this
# first and show the output to the user before asking for confirmation to run for real.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

find_env_file() {
  local f
  for f in "$PROJECT_ROOT"/.env "$PROJECT_ROOT"/.env.*; do
    [ -f "$f" ] || continue
    grep -q '^WARDEN_ENV_NAME=' "$f" && { echo "$f"; return 0; }
  done
  return 1
}

ENV_FILE="$(find_env_file)" || { echo "ERROR: no .env/.env.* file with WARDEN_ENV_NAME found at $PROJECT_ROOT" >&2; exit 1; }
ENV_BASENAME="$(basename "$ENV_FILE")"
WARDEN_ENV_NAME="$(grep '^WARDEN_ENV_NAME=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
TRAEFIK_DOMAIN_SUFFIX="$(grep '^TRAEFIK_DOMAIN_SUFFIX=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
[ -n "$WARDEN_ENV_NAME" ] || { echo "ERROR: WARDEN_ENV_NAME empty in $ENV_FILE" >&2; exit 1; }

BEFORE_ENV_PREFIX="before-"
BEFORE_ENV_NAME="${BEFORE_ENV_PREFIX}${WARDEN_ENV_NAME}"
BEFORE_DOMAIN_SUFFIX="before.${TRAEFIK_DOMAIN_SUFFIX:-}"
BEFORE_DIR="$(dirname "$PROJECT_ROOT")/${BEFORE_ENV_PREFIX}$(basename "$PROJECT_ROOT")"
DB_DUMP_REL="var/hvc-before-db.sql"   # relative to project root (mounted at /var/www/html)

ACTION="${1:-}"; shift || true
DRY_RUN=false
for a in "$@"; do [ "$a" = "--dry-run" ] && DRY_RUN=true; done

run() {
  if [ "$DRY_RUN" = true ]; then
    printf 'DRY-RUN: %s\n' "$*"
  else
    "$@"
  fi
}

# n98-magerun present in the php-fpm image? (not probed under --dry-run)
has_magerun() {
  bash -c "cd '$PROJECT_ROOT' && warden env exec -T php-fpm sh -c 'command -v n98-magerun >/dev/null 2>&1'"
}

# Echo "dbname username password" (newline-terminated) read from the ORIGINAL project's env.php.
orig_db_creds() {
  bash -c "cd '$PROJECT_ROOT' && warden env exec -T php-fpm php -r '\$d=(require \"app/etc/env.php\")[\"db\"][\"connection\"][\"default\"]; echo \$d[\"dbname\"].\" \".\$d[\"username\"].\" \".\$d[\"password\"].PHP_EOL;'"
}

# Clone the DB: dump the ORIGINAL (stripped when magerun is present -> keeps all rendering data,
# blanks only logs/sessions/reports), then import into the CLONE's own db via its db container
# (mysql on localhost) -- independent of env.php host resolution, so ordering vs env.php is a non-issue.
# Ignores unrelated envs' databases entirely (unlike volume backup-env).
clone_db() {
  local dump="$PROJECT_ROOT/$DB_DUMP_REL"
  local db='<db>' user='<user>' pass='<pass>'
  # `read` returns 1 at EOF even after assigning; `|| true` keeps set -e from aborting here.
  if [ "$DRY_RUN" != true ]; then read -r db user pass < <(orig_db_creds) || true; fi
  if [ "$DRY_RUN" = true ] || has_magerun; then
    run bash -c "cd '$PROJECT_ROOT' && warden env exec -T php-fpm n98-magerun db:dump --strip='@stripped' -n '$DB_DUMP_REL'"
  else
    run bash -c "cd '$PROJECT_ROOT' && warden env exec -T db mysqldump -u'$user' -p'$pass' '$db' > '$dump'"
  fi
  # MariaDB 10.5+ mariadb-dump prepends `/*M!999999\- enable the sandbox mode */`, which the older
  # (10.4) mysql client rejects ("Unknown command '\-'"); strip that line before importing.
  run bash -c "cd '$BEFORE_DIR' && sed '/enable the sandbox mode/d' '$dump' | warden env exec -T db mysql -u'$user' -p'$pass' '$db'"
  run rm -f "$dump"
}

cmd_status() {
  if [ -d "$BEFORE_DIR" ]; then
    echo "before env dir: $BEFORE_DIR (exists)"
    if [ -f "$BEFORE_DIR/.env" ] || compgen -G "$BEFORE_DIR/.env.*" >/dev/null; then
      echo "before env looks provisioned (env file present)"
    else
      echo "before env dir exists but has no env file -- likely incomplete"
    fi
  else
    echo "before env dir: $BEFORE_DIR (missing)"
  fi
}

cmd_create() {
  [ -d "$BEFORE_DIR" ] && { echo "ERROR: $BEFORE_DIR already exists, use 'refresh' or 'teardown' first" >&2; exit 1; }
  # 1. clone files (code + media)
  run cp -a "$PROJECT_ROOT" "$BEFORE_DIR"
  # 2. clone env identity in the clone's env file: PREFIXED env name + the prefix var (auto-wires
  #    env.php's db/redis/es to the clone's own containers) + a distinct domain suffix (no traefik
  #    collision). env.php itself is NOT edited -- the prefix var drives its host resolution.
  run bash -c "cd '$BEFORE_DIR' && sed -i 's/^WARDEN_ENV_NAME=.*/WARDEN_ENV_NAME=$BEFORE_ENV_NAME/' '$ENV_BASENAME'"
  run bash -c "cd '$BEFORE_DIR' && sed -i '/^WARDEN_ENV_NAME_PREFIX=/d' '$ENV_BASENAME' && printf 'WARDEN_ENV_NAME_PREFIX=%s\n' '$BEFORE_ENV_PREFIX' >> '$ENV_BASENAME'"
  if [ -n "$TRAEFIK_DOMAIN_SUFFIX" ]; then
    run bash -c "cd '$BEFORE_DIR' && sed -i 's/^TRAEFIK_DOMAIN_SUFFIX=.*/TRAEFIK_DOMAIN_SUFFIX=$BEFORE_DOMAIN_SUFFIX/' '$ENV_BASENAME'"
    run bash -c "cd '$BEFORE_DIR' && sed -i '/^TRAEFIK_DOMAIN=/ s/$TRAEFIK_DOMAIN_SUFFIX/$BEFORE_DOMAIN_SUFFIX/' '$ENV_BASENAME'"
  fi
  # 3. bring up the clone (fresh empty volumes; WARDEN_ENV_NAME_PREFIX now in the containers)
  run bash -c "cd '$BEFORE_DIR' && warden env up -d"
  # 4. clone the DB into the clone's own db (via its db container -- env.php-independent)
  clone_db
  # 5. deploy: regenerates env.php (prefix -> clone hosts), setup:upgrade, reindex (clone ES),
  #    /etc/hosts, static content, cache -- all correctly wired thanks to WARDEN_ENV_NAME_PREFIX.
  run bash -c "cd '$BEFORE_DIR' && warden env-install deploy -q"
  echo "before env ready: $BEFORE_ENV_NAME (domain suffix: $BEFORE_DOMAIN_SUFFIX)"
}

cmd_refresh() {
  [ -d "$BEFORE_DIR" ] || { echo "ERROR: $BEFORE_DIR missing, use 'create' first" >&2; exit 1; }
  run bash -c "cd '$BEFORE_DIR' && warden env up -d"
  clone_db
  run bash -c "cd '$BEFORE_DIR' && warden env-install deploy -q"
  echo "before env DB refreshed: $BEFORE_ENV_NAME"
}

cmd_teardown() {
  [ -d "$BEFORE_DIR" ] || { echo "before env already absent: $BEFORE_DIR"; return 0; }
  run bash -c "cd '$BEFORE_DIR' && warden env down -v"
  run rm -rf "$BEFORE_DIR"
  echo "before env removed: $BEFORE_DIR"
}

case "$ACTION" in
  status) cmd_status ;;
  create) cmd_create ;;
  refresh) cmd_refresh ;;
  teardown) cmd_teardown ;;
  *) echo "Usage: provision-before-env.sh {status|create|refresh|teardown} [--dry-run]" >&2; exit 2 ;;
esac
