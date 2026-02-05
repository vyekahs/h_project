#!/bin/sh
echo "Running DB migrations..."
node database/migrate_all.js
echo "Running Game System migrations..."
node scripts/migrate_game_system.js

echo "Starting application..."
node build
