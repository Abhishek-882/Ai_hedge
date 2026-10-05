#!/usr/bin/env bash
# Exit immediately if a command exits with a non-zero status
set -o errexit

echo ">>> Setting npm configuration to suppress audit and funding noise..."
export NPM_CONFIG_AUDIT=false
export NPM_CONFIG_FUND=false
export NPM_CONFIG_UPDATE_NOTIFIER=false

echo ">>> Installing dependencies in web/..."
cd web
npm install --no-audit --no-fund

echo ">>> Building Next.js application..."
npm run build

echo ">>> Render build completed successfully!"
