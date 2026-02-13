#!/bin/sh
echo "Running DB migrations..."
node database/migrate_all.js
echo "Running Game System migrations..."
node scripts/migrate_game_system.js
echo "Running Feedback System migrations..."
node scripts/migrate_feedback.js

echo "Running Tichu migrations..."
node scripts/migrate_tichu.js

echo "Starting application..."
node server.js
