#!/bin/sh
echo "Running DB migrations..."
node database/migrate_all.js

echo "Starting application..."
node build
