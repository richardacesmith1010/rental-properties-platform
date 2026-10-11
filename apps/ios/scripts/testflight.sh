#!/usr/bin/env bash
set -euo pipefail

IOS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$IOS_DIR/ios/App/build/testflight"
COUNTER="$IOS_DIR/build-number.txt"
PENDING="$IOS_DIR/build-number.pending"
SIGNING="$IOS_DIR/ios/App/Signing.local.xcconfig"
NUMBER="$IOS_DIR/scripts/build-number.cjs"
TEAM_MESSAGE='Add your Apple Team ID to apps/ios/ios/App/Signing.local.xcconfig (see Signing.local.xcconfig.example).'
DRY=false
ALLOW_DIRTY=false
OVERRIDE=''
RESOLVE=''
LOCKED=false
TEMP_FILE=''
STEP='preflight'
EXPORT_STARTED=false
TEAM=''

fail() { printf '%s\n' "$1" >&2; exit 1; }
unknown() {
  printf 'Upload status unknown for build %s. Check App Store Connect → TestFlight, then run with --resolve.\n' "$NEXT" >&2
}
cleanup() {
  local status=$?
  if [[ $status -ne 0 ]]; then
    if $EXPORT_STARTED; then
      printf 'Upload failed at %s. Build may not have been uploaded.\n' "$STEP" >&2
      unknown
    elif [[ "$STEP" != preflight ]]; then
      printf 'Upload failed at %s. Nothing was uploaded.\n' "$STEP" >&2
    fi
  fi
  if [[ -n "$TEMP_FILE" ]]; then
    rm -f "$TEMP_FILE" || printf 'Could not remove temporary counter file.\n' >&2
  fi
  if $LOCKED; then
    rmdir "$BUILD_DIR.lock" || printf 'Could not remove upload lock; check for a stale lock before retrying.\n' >&2
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY=true; shift ;;
    --allow-dirty) ALLOW_DIRTY=true; shift ;;
    --build|--resolve)
      [[ $# -ge 2 ]] || fail "Missing value for $1."
      if [[ "$1" == --build ]]; then OVERRIDE="$2"; else RESOLVE="$2"; fi
      shift 2 ;;
    *) fail "Unknown option: $1" ;;
  esac
done
if [[ -n "$RESOLVE" ]]; then
  [[ "$RESOLVE" == uploaded || "$RESOLVE" == not-uploaded ]] || fail 'Use --resolve uploaded or --resolve not-uploaded.'
  [[ -z "$OVERRIDE" ]] && ! $DRY || fail '--resolve cannot be combined with --build or --dry-run.'
fi

atomic_write() {
  # mv treats a directory destination as success, which must never confirm an upload.
  [[ ! -d "$1" ]] || return 1
  TEMP_FILE="$(mktemp "${1}.tmp.XXXXXX")"
  printf '%s\n' "$2" > "$TEMP_FILE"
  mv -f "$TEMP_FILE" "$1"
  TEMP_FILE=''
}
# Xcode can print signing details itself. Redact before both terminal and log.
redact() {
  DOMUS_REDACT_TEAM="$TEAM" node -e '
    const readline = require("node:readline");
    readline.createInterface({input: process.stdin}).on("line", line => {
      const team = process.env.DOMUS_REDACT_TEAM;
      console.log(team ? line.split(team).join("<team>") : line);
    });'
}

if ! $DRY; then
  mkdir -p "$(dirname "$BUILD_DIR")"
  mkdir "$BUILD_DIR.lock" 2>/dev/null || fail 'Another upload is running.'
  LOCKED=true
fi
LAST="$(node "$NUMBER" parse "$(cat "$COUNTER")")"
if [[ -e "$PENDING" ]]; then
  PENDING_NUMBER="$(node "$NUMBER" parse "$(cat "$PENDING")")"
  if [[ -z "$RESOLVE" ]]; then
    fail "Build $PENDING_NUMBER may already be uploaded. Check App Store Connect → TestFlight, then run with --resolve uploaded or --resolve not-uploaded."
  fi
  if [[ "$RESOLVE" == uploaded ]]; then
    [[ "$PENDING_NUMBER" -ge "$LAST" ]] || fail 'Pending build is below the counter; check the files before resolving.'
    atomic_write "$COUNTER" "$PENDING_NUMBER"
  fi
  rm "$PENDING"
  printf 'Resolved build %s as %s.\n' "$PENDING_NUMBER" "$RESOLVE"
  if [[ "$RESOLVE" == uploaded ]]; then printf 'Commit apps/ios/build-number.txt so the next upload uses a higher number.\n'; fi
  exit 0
elif [[ -n "$RESOLVE" ]]; then
  fail 'There is no pending upload to resolve.'
fi
if [[ -n "$OVERRIDE" ]]; then NEXT="$(node "$NUMBER" next "$LAST" "$OVERRIDE")";
else NEXT="$(node "$NUMBER" next "$LAST")"; fi

[[ -f "$SIGNING" ]] || fail "$TEAM_MESSAGE"
# Accept one literal assignment only; never execute the local configuration.
TEAM="$(sed -nE 's/^[[:space:]]*DEVELOPMENT_TEAM[[:space:]]*=[[:space:]]*([A-Z0-9]{10})[[:space:]]*$/\1/p' "$SIGNING")"
[[ "$TEAM" =~ ^[A-Z0-9]{10}$ ]] || fail "$TEAM_MESSAGE"
[[ "$(grep -Ec '^[[:space:]]*DEVELOPMENT_TEAM[[:space:]]*=' "$SIGNING")" == 1 ]] || fail "$TEAM_MESSAGE"

ARCHIVE=(xcodebuild archive -project "$IOS_DIR/ios/App/App.xcodeproj" -scheme App -configuration Release
  -destination 'generic/platform=iOS' -archivePath "$BUILD_DIR/Domus.xcarchive"
  -allowProvisioningUpdates "CURRENT_PROJECT_VERSION=$NEXT")
EXPORT=(xcodebuild -exportArchive -archivePath "$BUILD_DIR/Domus.xcarchive"
  -exportOptionsPlist "$BUILD_DIR/ExportOptions.plist" -exportPath "$BUILD_DIR/export" -allowProvisioningUpdates)
print_command() { printf '%q ' "$@"; printf '\n'; }
if $DRY; then
  printf 'Dry run: no commands executed or files written. Build %s; team <team>.\n' "$NEXT"
  print_command xcodebuild -version
  print_command xcodebuild -help
  print_command git -C "$IOS_DIR" status --porcelain -- .
  print_command mkdir "$BUILD_DIR.lock"
  print_command rm -rf "$BUILD_DIR"
  print_command mkdir -p "$BUILD_DIR"
  printf 'Generate %s from ExportOptions.template.plist (teamID=<team>).\n' "$BUILD_DIR/ExportOptions.plist"
  printf 'cd %q && npx cap sync ios\n' "$IOS_DIR"
  print_command "${ARCHIVE[@]}"
  printf 'Validate App.app, bundle ID, build %s and PrivacyInfo.xcprivacy.\n' "$NEXT"
  printf 'Atomically write pending build %s before export.\n' "$NEXT"
  print_command "${EXPORT[@]}"
  printf 'On confirmed success only: atomically write counter %s, remove pending.\n' "$NEXT"
  print_command rmdir "$BUILD_DIR.lock"
  exit 0
fi
xcodebuild -version >/dev/null 2>&1 || fail 'Install Xcode and select it as the active developer tools before uploading.'
XCODE_HELP="$(xcodebuild -help 2>&1)" || fail 'Unable to read Xcode export support.'
[[ "$XCODE_HELP" == *-exportArchive* ]] || fail 'This Xcode does not support -exportArchive. Select a supported Xcode version.'
DIRTY="$(git -C "$IOS_DIR" status --porcelain -- .)" || fail 'Unable to check the apps/ios git working tree.'
if [[ -n "$DIRTY" ]]; then
  printf 'Warning: apps/ios has uncommitted changes.\n' >&2
  $ALLOW_DIRTY || fail 'Review the changes, then use --allow-dirty to continue.'
fi
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
# Only this generated file contains the team; it is ignored by git.
sed "s/__TEAM__/$TEAM/" "$IOS_DIR/scripts/ExportOptions.template.plist" > "$BUILD_DIR/ExportOptions.plist"
STEP=sync
(cd "$IOS_DIR" && npx cap sync ios) 2>&1 | redact
STEP=archive
"${ARCHIVE[@]}" 2>&1 | redact
STEP='archive validation'
APP="$BUILD_DIR/Domus.xcarchive/Products/Applications/App.app"
[[ -d "$APP" ]] || fail 'The archive does not contain App.app.'
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Info.plist")" == com.domusbase.app ]] || fail 'The archive has the wrong bundle identifier.'
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP/Info.plist")" == "$NEXT" ]] || fail 'The archive has the wrong build number.'
[[ -f "$APP/PrivacyInfo.xcprivacy" ]] || fail 'The archive is missing PrivacyInfo.xcprivacy.'
plutil -lint "$APP/PrivacyInfo.xcprivacy" >/dev/null
STEP='pending guard'
atomic_write "$PENDING" "$NEXT"
STEP=export
EXPORT_STARTED=true
"${EXPORT[@]}" 2>&1 | redact | tee "$BUILD_DIR/export.log"
# Xcode 27 IDEDistribution prints ** EXPORT SUCCEEDED ** or ** EXPORT FAILED **.
grep -Eq '^\*\* EXPORT SUCCEEDED \*\*[[:space:]]*$' "$BUILD_DIR/export.log" || exit 1
STEP='counter update'
atomic_write "$COUNTER" "$NEXT"
rm "$PENDING"
EXPORT_STARTED=false
printf 'Upload submitted for build %s. Check App Store Connect for processing status.\n' "$NEXT"
printf 'Commit apps/ios/build-number.txt so the next upload uses a higher number.\n'
