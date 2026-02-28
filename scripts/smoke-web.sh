#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-http://localhost:3000}"

echo "[smoke] Using APP_URL=$APP_URL"

echo "[smoke] Checking landing page"
curl -fsS "$APP_URL/" >/dev/null

echo "[smoke] Checking login page"
curl -fsS "$APP_URL/login" >/dev/null

echo "[smoke] Checking role portal redirect behavior"
PORTAL_STATUS="$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL/portal")"
if [[ "$PORTAL_STATUS" != "307" && "$PORTAL_STATUS" != "302" && "$PORTAL_STATUS" != "200" ]]; then
  echo "[smoke] Unexpected /portal status: $PORTAL_STATUS"
  exit 1
fi

echo "[smoke] Checking cron endpoint auth guard"
UNAUTH_CRON_STATUS="$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL/api/cron/generate-charges")"
if [[ "$UNAUTH_CRON_STATUS" != "401" ]]; then
  echo "[smoke] Expected 401 from unauthenticated cron call, got $UNAUTH_CRON_STATUS"
  exit 1
fi

if [[ -n "${CRON_SECRET:-}" ]]; then
  echo "[smoke] Triggering authenticated cron endpoint"
  AUTH_CRON_STATUS="$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/generate-charges")"
  if [[ "$AUTH_CRON_STATUS" != "200" ]]; then
    echo "[smoke] Expected 200 from authenticated cron call, got $AUTH_CRON_STATUS"
    exit 1
  fi
else
  echo "[smoke] CRON_SECRET not set; skipping authenticated cron check"
fi

echo "[smoke] Smoke checks passed"
