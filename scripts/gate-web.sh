#!/usr/bin/env bash
set -euo pipefail

echo "[gate] Verifying runtime readiness"
npm run verify:phase9-runtime

echo "[gate] Running web tests"
npm test --workspace @domus/web

echo "[gate] Running web lint"
npm run lint:web

echo "[gate] Running production build"
npm run build:web

echo "[gate] Running mobile typecheck"
npx tsc -p apps/mobile/tsconfig.json --noEmit

if [[ -n "${APP_URL:-}" ]]; then
  echo "[gate] Running smoke checks against APP_URL=$APP_URL"
  npm run smoke:web
else
  echo "[gate] APP_URL not set; skipping smoke checks"
fi

echo "[gate] All checks passed"
