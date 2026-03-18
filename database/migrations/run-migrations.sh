#!/bin/bash
# Run all migration files in order

set -e

PGUSER="${POSTGRES_USER:-user}"
PGDATABASE="${POSTGRES_DB:-boardgameclub}"

echo "Running migrations..."

for migration in /docker-entrypoint-initdb.d/migrations/*.sql; do
    if [ -f "$migration" ]; then
        echo "Applying $(basename $migration)..."
        psql -U "$PGUSER" -d "$PGDATABASE" -f "$migration"
    fi
done

echo "Migrations completed."
