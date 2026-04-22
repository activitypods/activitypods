#!/usr/bin/env sh
set -eu

SCRIPT_NAME="start-local-services"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=./lib/dev-common.sh
. "$SCRIPT_DIR/lib/dev-common.sh"

AP_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
WORK_ROOT=$(CDPATH= cd -- "$AP_ROOT/.." && pwd)
FEDIFY_ROOT="$WORK_ROOT/mastopod-federation-architecture/fedify-sidecar"
MEDIA_ROOT="$WORK_ROOT/mastopod-federation-architecture/media-pipeline-sidecar"

load_env_file() {
  path="$1"
  if [ -f "$path" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$path"
    set +a
  fi
}

main() {
  require_cmd npm
  require_cmd lsof

  [ -d "$FEDIFY_ROOT" ] || fail "fedify-sidecar directory not found: $FEDIFY_ROOT"
  [ -d "$MEDIA_ROOT" ] || fail "media-pipeline-sidecar directory not found: $MEDIA_ROOT"

  if [ ! -f "$FEDIFY_ROOT/.env.local" ] && [ -f "$FEDIFY_ROOT/.env.local.example" ]; then
    cp "$FEDIFY_ROOT/.env.local.example" "$FEDIFY_ROOT/.env.local"
    chmod 600 "$FEDIFY_ROOT/.env.local" || true
  fi

  load_env_file "$FEDIFY_ROOT/.env.local"
  load_env_file "$AP_ROOT/pod-provider/backend/.env"

  : "${ACTIVITYPODS_URL:=http://localhost:3000}"
  ACTIVITYPODS_URL=$(printf '%s' "$ACTIVITYPODS_URL" | sed 's#/*$##')
  : "${ACTIVITYPODS_TOKEN:=test-atproto-signing-token-local}"
  : "${SIDECAR_TOKEN:=sidecar-local-token}"
  : "${REDPANDA_BROKERS:=localhost:19092}"
  : "${MEDIA_PIPELINE_PORT:=8090}"
  : "${MEDIA_PIPELINE_HOST:=0.0.0.0}"
  : "${MEDIA_PIPELINE_TOKEN:=$ACTIVITYPODS_TOKEN}"
  : "${MEDIA_PIPELINE_ALLOWED_SOURCE_ORIGINS:=$ACTIVITYPODS_URL}"
  : "${MEDIA_PIPELINE_INGRESS_URL:=http://localhost:${MEDIA_PIPELINE_PORT}/internal/media/ingest}"
  : "${ACTIVITYPODS_MEDIA_SOURCE_BASE_URL:=$ACTIVITYPODS_URL}"
  : "${ACTIVITYPODS_MEDIA_SOURCE_TOKEN:=$ACTIVITYPODS_TOKEN}"
  : "${ACTIVITYPODS_MEDIA_SOURCE_PATH:=/api/internal/media-pipeline/resolve-source}"
  : "${ACTIVITYPODS_SIGNING_API_URL:=${ACTIVITYPODS_URL}/api/internal/signatures/batch}"
  : "${MEDIA_OBJECT_STORE_BACKEND:=file}"
  : "${MEDIA_OBJECT_ROOT:=$MEDIA_ROOT/.local/object-store}"
  : "${MEDIA_OBJECT_PUBLIC_BASE_URL:=http://localhost:${MEDIA_PIPELINE_PORT}/media}"
  : "${MEDIA_ASSET_TOPIC:=media.asset.created.v1}"
  : "${ENABLE_EVENT_PUBLISH:=true}"
  : "${ENABLE_MEDIA_ASSET_SYNC:=true}"
  : "${ENABLE_PROVIDER_CAPABILITIES_ENDPOINT:=true}"
  : "${FRONTEND_PORT:=5000}"
  : "${OPENSEARCH_URL:=http://localhost:9200}"

  export ACTIVITYPODS_URL
  export ACTIVITYPODS_TOKEN
  export SIDECAR_TOKEN
  export REDPANDA_BROKERS
  export MEDIA_PIPELINE_TOKEN
  export MEDIA_PIPELINE_ALLOWED_SOURCE_ORIGINS
  export MEDIA_PIPELINE_INGRESS_URL
  export ACTIVITYPODS_MEDIA_SOURCE_BASE_URL
  export ACTIVITYPODS_MEDIA_SOURCE_TOKEN
  export ACTIVITYPODS_MEDIA_SOURCE_PATH
  export ACTIVITYPODS_SIGNING_API_URL
  export MEDIA_OBJECT_STORE_BACKEND
  export MEDIA_OBJECT_ROOT
  export MEDIA_OBJECT_PUBLIC_BASE_URL
  export MEDIA_ASSET_TOPIC
  export ENABLE_EVENT_PUBLISH
  export ENABLE_MEDIA_ASSET_SYNC
  export ENABLE_PROVIDER_CAPABILITIES_ENDPOINT
  export OPENSEARCH_URL

  LOG_DIR="$AP_ROOT/.logs"
  PID_DIR="$AP_ROOT/.pids"
  mkdir -p "$LOG_DIR" "$PID_DIR"

  start_bg_if_needed "ActivityPods backend" 3000 "$LOG_DIR/backend-dev.log" "$PID_DIR/backend.pid" \
    npm --prefix "$AP_ROOT/pod-provider/backend" start

  start_bg_if_needed "ActivityPods frontend" "$FRONTEND_PORT" "$LOG_DIR/frontend-dev.log" "$PID_DIR/frontend.pid" \
    env BROWSER=none npm --prefix "$AP_ROOT/pod-provider/frontend" run dev

  start_bg_if_needed "Fedify sidecar" 8080 "$LOG_DIR/sidecar-dev.log" "$PID_DIR/fedify-sidecar.pid" \
    env PORT=8080 HOST=0.0.0.0 npm --prefix "$FEDIFY_ROOT" run server:dev

  start_bg_if_needed "Media pipeline sidecar" "$MEDIA_PIPELINE_PORT" "$LOG_DIR/media-pipeline-dev.log" "$PID_DIR/media-pipeline-sidecar.pid" \
    env PORT="$MEDIA_PIPELINE_PORT" HOST="$MEDIA_PIPELINE_HOST" INTERNAL_BEARER_TOKEN="$MEDIA_PIPELINE_TOKEN" npm --prefix "$MEDIA_ROOT" run server:dev

  log "local source services are healthy"
}

main "$@"
