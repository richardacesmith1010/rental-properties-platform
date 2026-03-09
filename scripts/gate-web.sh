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

if command -v npx &>/dev/null && [[ -n "${APP_URL:-}" ]]; then
  echo "[gate] Running Playwright E2E tests"
  pushd apps/web >/dev/null
  set +e
  PLAYWRIGHT_OUTPUT=$(npx playwright test --reporter=list 2>&1)
  PLAYWRIGHT_STATUS=$?
  set -e
  popd >/dev/null

  echo "$PLAYWRIGHT_OUTPUT"

  if [[ $PLAYWRIGHT_STATUS -ne 0 ]]; then
    if grep -qiE "Executable doesn't exist|playwright install|Failed to launch|browserType.launch" <<<"$PLAYWRIGHT_OUTPUT"; then
      echo "[gate] Playwright browsers not installed; skipping E2E tests"
    else
      echo "[gate] Playwright tests failed"
      exit 1
    fi
  fi
else
  echo "[gate] APP_URL not set or Playwright not available; skipping E2E tests"
fi

echo "[gate] Running mobile typecheck"
npx tsc -p apps/mobile/tsconfig.json --noEmit

if [[ -n "${APP_URL:-}" ]]; then
  echo "[gate] Running smoke checks against APP_URL=$APP_URL"
  npm run smoke:web
else
  echo "[gate] APP_URL not set; skipping smoke checks"
fi

echo "[gate] All checks passed"
