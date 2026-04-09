#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${MIGRATION_BOOTSTRAP_ENV_FILE:-$ROOT_DIR/.tmp/migration-proof.env}"

MIGRATION_BOOTSTRAP_ENV_FILE="$ENV_FILE" node "$ROOT_DIR/scripts/proof-atproto-migration-bootstrap-local.js"
set -a
source "$ENV_FILE"
set +a

node "$ROOT_DIR/scripts/proof-atproto-migration-full.js"
