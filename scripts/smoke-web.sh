#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-http://localhost:3000}"

echo "[smoke] Using APP_URL=$APP_URL"

echo "[smoke] Checking landing page"
curl -fsS "$APP_URL/" >/dev/null

echo "[smoke] Checking login page"
curl -fsS "$APP_URL/login" >/dev/null

echo "[smoke] Checking role portal redirect behavior"
PORTAL_HEADERS="$(mktemp)"
PORTAL_STATUS="$(curl -s -D "$PORTAL_HEADERS" -o /dev/null -w "%{http_code}" "$APP_URL/portal")"
if [[ "$PORTAL_STATUS" != "307" && "$PORTAL_STATUS" != "302" && "$PORTAL_STATUS" != "200" ]]; then
  echo "[smoke] Unexpected /portal status: $PORTAL_STATUS"
  rm -f "$PORTAL_HEADERS"
  exit 1
fi
if [[ "$PORTAL_STATUS" == "307" || "$PORTAL_STATUS" == "302" ]]; then
  PORTAL_LOCATION="$(grep -i '^location:' "$PORTAL_HEADERS" | head -n1 | tr -d '\r' | awk '{print $2}')"
  if [[ "$PORTAL_LOCATION" != *"/login"* ]]; then
    echo "[smoke] Expected /portal redirect to /login for unauthenticated user, got: ${PORTAL_LOCATION:-<none>}"
    rm -f "$PORTAL_HEADERS"
    exit 1
  fi
fi
rm -f "$PORTAL_HEADERS"

echo "[smoke] Checking protected route guards"
for path in /owner /manager /tenant; do
  HEADERS="$(mktemp)"
  STATUS="$(curl -s -D "$HEADERS" -o /dev/null -w "%{http_code}" "$APP_URL$path")"
  if [[ "$STATUS" != "307" && "$STATUS" != "302" ]]; then
    echo "[smoke] Expected redirect for unauthenticated $path, got $STATUS"
    rm -f "$HEADERS"
    exit 1
  fi
  LOCATION="$(grep -i '^location:' "$HEADERS" | head -n1 | tr -d '\r' | awk '{print $2}')"
  if [[ "$LOCATION" != *"/login"* ]]; then
    echo "[smoke] Expected redirect location to include /login for $path, got: ${LOCATION:-<none>}"
    rm -f "$HEADERS"
    exit 1
  fi
  rm -f "$HEADERS"
done

echo "[smoke] Checking private asset API auth guards"
for path in /api/assets/maintenance-photo/test-id /api/assets/document-packet/test-id; do
  STATUS="$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL$path")"
  if [[ "$STATUS" != "401" ]]; then
    echo "[smoke] Expected 401 from unauthenticated $path, got $STATUS"
    exit 1
  fi
done

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
