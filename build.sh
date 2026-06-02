#!/usr/bin/env bash
# build.sh — Inject Cloudflare Pages env vars into app.js
# Set as Build command in Cloudflare Pages: ./build.sh
# Set Output directory: public
set -e

APP_JS="public/js/app.js"

if [ ! -f "$APP_JS" ]; then
  echo "ERROR: $APP_JS not found. Run from repo root."
  exit 1
fi

# Validate required vars
REQUIRED=(
  FIREBASE_API_KEY
  FIREBASE_AUTH_DOMAIN
  FIREBASE_PROJECT_ID
  FIREBASE_STORAGE_BUCKET
  FIREBASE_MESSAGING_SENDER_ID
  FIREBASE_APP_ID
  IMGBB_KEY
)

MISSING=()
for var in "${REQUIRED[@]}"; do
  if [ -z "${!var}" ]; then
    MISSING+=("$var")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "ERROR: Missing environment variables:"
  for v in "${MISSING[@]}"; do
    echo "  - $v"
  done
  echo ""
  echo "Set these in Cloudflare Pages → Settings → Environment variables"
  exit 1
fi

# Replace placeholders using sed
sed -i "s|__FIREBASE_API_KEY__|${FIREBASE_API_KEY}|g" "$APP_JS"
sed -i "s|__FIREBASE_AUTH_DOMAIN__|${FIREBASE_AUTH_DOMAIN}|g" "$APP_JS"
sed -i "s|__FIREBASE_PROJECT_ID__|${FIREBASE_PROJECT_ID}|g" "$APP_JS"
sed -i "s|__FIREBASE_STORAGE_BUCKET__|${FIREBASE_STORAGE_BUCKET}|g" "$APP_JS"
sed -i "s|__FIREBASE_MESSAGING_SENDER_ID__|${FIREBASE_MESSAGING_SENDER_ID}|g" "$APP_JS"
sed -i "s|__FIREBASE_APP_ID__|${FIREBASE_APP_ID}|g" "$APP_JS"
sed -i "s|__IMGBB_KEY__|${IMGBB_KEY}|g" "$APP_JS"

echo "✓ Environment variables injected into $APP_JS"
