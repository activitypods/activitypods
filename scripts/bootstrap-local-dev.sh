#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
AP_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
WORK_ROOT=$(CDPATH= cd -- "$AP_ROOT/.." && pwd)
SIDE_ROOT="$WORK_ROOT/mastopod-federation-architecture/fedify-sidecar"

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

start_bg_if_needed() {
  name="$1"
  port="$2"
  logfile="$3"
  shift 3

  if is_port_listening "$port"; then
    log "$name already listening on :$port"
    return 0
  fi

  log "starting $name (logs: $logfile)"
  nohup "$@" >"$logfile" 2>&1 &
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

  if [ ! -d "$SIDE_ROOT" ]; then
    printf '%s\n' "[bootstrap] sidecar directory not found: $SIDE_ROOT" >&2
    exit 1
  fi

  ensure_colima

  log "starting ActivityPods compose dependencies"
  docker compose -f "$AP_ROOT/pod-provider/docker-compose.yml" up -d

  log "starting federation compose dependencies"
  docker compose -f "$SIDE_ROOT/docker-compose.yml" up -d opensearch opensearch-dashboards redpanda redpanda-console prometheus grafana

  if [ ! -f "$SIDE_ROOT/.env.local" ] && [ -f "$SIDE_ROOT/.env.local.example" ]; then
    log "creating $SIDE_ROOT/.env.local from template"
    cp "$SIDE_ROOT/.env.local.example" "$SIDE_ROOT/.env.local"
  fi

  if [ -f "$SIDE_ROOT/.env.local" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$SIDE_ROOT/.env.local"
    set +a
  fi

  : "${REDPANDA_BROKERS:=localhost:19092}"
  export REDPANDA_BROKERS

  log "bootstrapping RedPanda topics"
  npm --prefix "$SIDE_ROOT" run topics:bootstrap

  mkdir -p "$AP_ROOT/.logs"

  start_bg_if_needed "ActivityPods backend" 3000 "$AP_ROOT/.logs/backend-dev.log" sh -lc "cd '$AP_ROOT/pod-provider/backend' && npm run dev"
  start_bg_if_needed "ActivityPods frontend" 5002 "$AP_ROOT/.logs/frontend-dev.log" sh -lc "cd '$AP_ROOT/pod-provider/frontend' && npm run dev"
  start_bg_if_needed "Fedify sidecar" 8080 "$AP_ROOT/.logs/sidecar-dev.log" npm --prefix "$SIDE_ROOT" run dev:local

  log "done"
  log "frontend: http://localhost:5002"
  log "backend:  http://localhost:3000"
  log "sidecar:  http://localhost:8080/health"
}

main "$@"
