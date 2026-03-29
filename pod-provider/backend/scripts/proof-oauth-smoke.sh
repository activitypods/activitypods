#!/usr/bin/env bash
set -euo pipefail

required=(
  OAUTH_PROOF_BASE_URL
  OAUTH_PROOF_SIDECAR_BASE_URL
  OAUTH_PROOF_CANONICAL_ACCOUNT_ID
  OAUTH_PROOF_CLIENT_ID
  OAUTH_PROOF_REDIRECT_URI
)

for key in "${required[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "[proof-oauth-smoke] Missing required env var: $key" >&2
    exit 2
  fi
done

if [[ -z "${OAUTH_PROOF_USER_TOKEN:-}" && -z "${OAUTH_PROOF_INTERNAL_BEARER:-${ACTIVITYPODS_TOKEN:-}}" ]]; then
  echo "[proof-oauth-smoke] Provide OAUTH_PROOF_USER_TOKEN for user-auth flow, or OAUTH_PROOF_INTERNAL_BEARER/ACTIVITYPODS_TOKEN for internal fallback" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[proof-oauth-smoke] Running managed login proof"
node "$SCRIPT_DIR/proof-oauth-managed-login.js"

echo "[proof-oauth-smoke] Running backend-sidecar bridge proof"
node "$SCRIPT_DIR/proof-oauth-backend-sidecar-bridge.js"

echo "[proof-oauth-smoke] PASS"
