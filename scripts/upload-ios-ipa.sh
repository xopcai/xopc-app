#!/usr/bin/env bash
set -euo pipefail

API_KEY="${APP_STORE_CONNECT_API_KEY:-}"
API_ISSUER="${APP_STORE_CONNECT_API_ISSUER:-}"
DIST_DIR="${DIST_DIR:-dist}"
IPA_PATH="${IPA_PATH:-$DIST_DIR/xopc.ipa}"

usage() {
  cat <<EOF
Usage:
  $0 <ipa-download-url>

Required environment variables:
  APP_STORE_CONNECT_API_KEY       App Store Connect API Key ID
  APP_STORE_CONNECT_API_ISSUER    App Store Connect API Issuer ID

Optional environment variables:
  APP_STORE_CONNECT_PRIVATE_KEY_PATH
                                  default: ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8
  IPA_PATH                        default: dist/xopc.ipa
  DIST_DIR                        default: dist
  SKIP_VALIDATE=1                 skip altool validation

Example:
  APP_STORE_CONNECT_API_KEY="KEY_ID" \
  APP_STORE_CONNECT_API_ISSUER="ISSUER_ID" \
  $0 "https://expo.dev/artifacts/eas/xxx.ipa"
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

IPA_URL="${1:-}"
if [[ -z "$IPA_URL" ]]; then
  echo "Error: missing IPA download URL" >&2
  usage >&2
  exit 1
fi

if [[ -z "$API_KEY" ]]; then
  echo "Error: missing APP_STORE_CONNECT_API_KEY" >&2
  usage >&2
  exit 1
fi

if [[ -z "$API_ISSUER" ]]; then
  echo "Error: missing APP_STORE_CONNECT_API_ISSUER" >&2
  usage >&2
  exit 1
fi

PRIVATE_KEY_PATH="${APP_STORE_CONNECT_PRIVATE_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${API_KEY}.p8}"

if [[ ! -f "$PRIVATE_KEY_PATH" ]]; then
  cat >&2 <<EOF
Error: App Store Connect private key not found:
  $PRIVATE_KEY_PATH

Expected file name:
  AuthKey_${API_KEY}.p8

Put it under:
  ~/.appstoreconnect/private_keys/
EOF
  exit 1
fi

mkdir -p "$(dirname "$IPA_PATH")"

echo "Downloading IPA..."
echo "  URL: $IPA_URL"
echo "  Out: $IPA_PATH"
curl -fL --retry 3 --retry-delay 2 "$IPA_URL" -o "$IPA_PATH"

if [[ "${SKIP_VALIDATE:-}" != "1" ]]; then
  echo "Validating IPA with altool..."
  xcrun altool --validate-app -f "$IPA_PATH" -t ios \
    --api-key "$API_KEY" \
    --api-issuer "$API_ISSUER"
fi

echo "Uploading IPA to App Store Connect..."
xcrun altool --upload-app -f "$IPA_PATH" -t ios \
  --api-key "$API_KEY" \
  --api-issuer "$API_ISSUER"

echo "Done. Check processing status in App Store Connect:"
echo "https://appstoreconnect.apple.com/apps/6772332549/testflight/ios"
