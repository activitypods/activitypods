#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
AP_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
WORK_ROOT=$(CDPATH= cd -- "$AP_ROOT/.." && pwd)
FEDIFY_ROOT="$WORK_ROOT/mastopod-federation-architecture/fedify-sidecar"
MEDIA_ROOT="$WORK_ROOT/mastopod-federation-architecture/media-pipeline-sidecar"

log() {
  printf '%s\n' "[bootstrap] $*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf '%s\n' "[bootstrap] missing required command: $1" >&2
    exit 1
  fi
}

is_port_listening() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

is_pid_running() {
  pid="$1"
  [ -n "$pid" ] && kill -0 "$pid" >/dev/null 2>&1
}

load_env_file() {
  path="$1"
  if [ -f "$path" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$path"
    set +a
  fi
}

cleanup_stale_pidfile() {
  pidfile="$1"
  if [ ! -f "$pidfile" ]; then
    return 0
  fi

  pid=$(cat "$pidfile" 2>/dev/null || true)
  if [ -z "$pid" ] || ! is_pid_running "$pid"; then
    rm -f "$pidfile"
  fi
}

start_bg_if_needed() {
  name="$1"
  port="$2"
  logfile="$3"
  pidfile="$4"
  shift 4

  cleanup_stale_pidfile "$pidfile"
  if [ -f "$pidfile" ]; then
    pid=$(cat "$pidfile" 2>/dev/null || true)
    log "$name already running (pid ${pid:-unknown})"
    return 0
  fi

  if [ "$port" != "-" ] && is_port_listening "$port"; then
    log "$name already listening on :$port"
    return 0
  fi

  log "starting $name (logs: $logfile)"
  nohup "$@" >"$logfile" 2>&1 &
  pid=$!
  printf '%s\n' "$pid" >"$pidfile"
}

ensure_colima() {
  require_cmd colima

  want_cpu=4
  want_mem=8
  running=0

  if colima status >/dev/null 2>&1; then
    running=1
  fi

  current_cpu=$(colima list 2>/dev/null | awk '$1=="default" {print $4}')
  current_mem=$(colima list 2>/dev/null | awk '$1=="default" {print $5}')
  current_mem_num=$(printf '%s' "$current_mem" | sed 's/GiB//g')

  if [ "$running" -eq 1 ] && [ -n "$current_cpu" ] && [ -n "$current_mem_num" ] && [ "$current_cpu" -ge "$want_cpu" ] && [ "$current_mem_num" -ge "$want_mem" ]; then
    log "colima already running with sufficient resources (${current_cpu} CPU, ${current_mem})"
    return 0
  fi

  if [ "$running" -eq 1 ]; then
    log "restarting colima with ${want_cpu} CPU and ${want_mem}GiB RAM"
    colima stop
  else
    log "starting colima with ${want_cpu} CPU and ${want_mem}GiB RAM"
  fi

  colima start --cpu "$want_cpu" --memory "$want_mem" --disk 100
}

main() {
  require_cmd docker
  require_cmd npm
  require_cmd lsof

  if [ ! -d "$FEDIFY_ROOT" ]; then
    printf '%s\n' "[bootstrap] fedify-sidecar directory not found: $FEDIFY_ROOT" >&2
    exit 1
  fi

  if [ ! -d "$MEDIA_ROOT" ]; then
    printf '%s\n' "[bootstrap] media-pipeline-sidecar directory not found: $MEDIA_ROOT" >&2
    exit 1
  fi

  if [ ! -d "$AP_ROOT" ]; then
    printf '%s\n' "[bootstrap] ActivityPods directory not found: $AP_ROOT" >&2
    exit 1
  fi

  ensure_colima

  log "starting ActivityPods compose dependencies"
  docker compose -f "$AP_ROOT/pod-provider/docker-compose.yml" up -d

  log "starting federation compose dependencies"
  docker compose -f "$FEDIFY_ROOT/docker-compose.yml" up -d opensearch opensearch-dashboards redpanda redpanda-console prometheus grafana

  if [ ! -f "$FEDIFY_ROOT/.env.local" ] && [ -f "$FEDIFY_ROOT/.env.local.example" ]; then
    log "creating $FEDIFY_ROOT/.env.local from template"
    cp "$FEDIFY_ROOT/.env.local.example" "$FEDIFY_ROOT/.env.local"
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
  AT_LOCAL_FIXTURE=true
  ENABLE_XRPC_SERVER=false
  ENABLE_AT_JETSTREAM=false
  ENABLE_FEDIFY_RUNTIME_INTEGRATION=false
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
  export AT_LOCAL_FIXTURE
  export ENABLE_XRPC_SERVER
  export ENABLE_AT_JETSTREAM
  export ENABLE_FEDIFY_RUNTIME_INTEGRATION
  export OPENSEARCH_URL

  log "bootstrapping RedPanda topics"
  npm --prefix "$FEDIFY_ROOT" run topics:bootstrap

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

  log "done"
  log "frontend:       http://localhost:${FRONTEND_PORT}"
  log "backend:        ${ACTIVITYPODS_URL}"
  log "fedify sidecar: http://localhost:8080/health"
  log "media sidecar:  http://localhost:${MEDIA_PIPELINE_PORT}/health"
}

main "$@"
