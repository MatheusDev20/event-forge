#!/usr/bin/env bash
#
# Wrapper around the TypeORM migration CLI so a migration can be made by name
# alone, instead of by remembering the data-source flag and the output path.
#
#   pnpm db:migrate:generate AddSeatMaps    diff entities against the database
#   pnpm db:migrate:create   BackfillPrices empty migration, written by hand
#
set -euo pipefail

MODE=${1:-}
NAME=${2:-}

DATA_SOURCE="src/database/data-source.ts"
MIGRATIONS_DIR="src/database/migrations"

usage() {
  cat >&2 <<USAGE
usage: pnpm db:migrate:${MODE:-generate} <MigrationName>

  <MigrationName> is PascalCase and describes the change, not the ticket:
  AddSeatMaps, AddHoldExpiryIndex, BackfillEventSlugs.

  generate  diffs the entities against the live database and writes the SQL
  create    writes an empty migration for changes TypeORM cannot diff —
            data backfills, and anything needing CONCURRENTLY or a lock hint
USAGE
  exit 1
}

case "$MODE" in
  generate | create) ;;
  *) usage ;;
esac

if [[ -z "$NAME" ]]; then
  echo "error: no migration name given" >&2
  usage
fi

if [[ ! "$NAME" =~ ^[A-Z][A-Za-z0-9]*$ ]]; then
  echo "error: '$NAME' must be PascalCase, letters and digits only" >&2
  usage
fi

# `generate` needs a live database to diff against; `create` does not.
if [[ "$MODE" == "generate" ]]; then
  exec npx typeorm-ts-node-commonjs migration:generate \
    "$MIGRATIONS_DIR/$NAME" -d "$DATA_SOURCE" --pretty
fi

exec npx typeorm-ts-node-commonjs migration:create "$MIGRATIONS_DIR/$NAME"
