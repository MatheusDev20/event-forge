#!/usr/bin/env bash
#
# Fails when the entities and the migrated schema disagree.
#
# The failure this catches: someone edits an entity, never generates a
# migration, and everything works locally because their database was already
# in the new shape. CI runs on a database built purely from migrations, so it
# is the only place that mismatch is visible.
#
set -euo pipefail

OUTPUT=$(npx typeorm-ts-node-commonjs schema:log -d src/database/data-source.ts 2>&1)

if grep -q "Schema synchronization will execute" <<<"$OUTPUT"; then
  echo "$OUTPUT"
  cat >&2 <<'MESSAGE'

Schema drift: the entities describe something the database does not have.

Either generate the missing migration:

    pnpm db:migrate:generate <MigrationName>

or, if the schema is right and an index/constraint simply is not declared on
the entity, declare it there with the name the migration gave it. TypeORM
treats anything undeclared as drift and will try to drop it.
MESSAGE
  exit 1
fi

echo "No schema drift: entities match the migrated schema."
