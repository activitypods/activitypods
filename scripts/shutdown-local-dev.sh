#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
AP_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
WORK_ROOT=$(CDPATH= cd -- "$AP_ROOT/.." && pwd)
FEDIFY_ROOT="$WORK_ROOT/mastopod-federation-architecture/fedify-sidecar"

PID_DIR="$AP_ROOT/.pids"

log() {
  printf '%s\n' "[shutdown] $*"
}

kill_pidfile() {
  pidfile="$1"
  name="$2"

  if [ ! -f "$pidfile" ]; then
    log "$name pidfile not present"
    return 0
  fi

  pid=$(cat "$pidfile" 2>/dev/null || true)
  rm -f "$pidfile"
  if [ -z "$pid" ]; then
    log "$name pidfile was empty"
    return 0
  fi

  if kill -0 "$pid" >/dev/null 2>&1; then
    log "stopping $name (pid $pid)"
    kill "$pid" 2>/dev/null || true
    sleep 1
    if kill -0 "$pid" >/dev/null 2>&1; then
      log "force stopping $name (pid $pid)"
      kill -9 "$pid" 2>/dev/null || true
    fi
  else
    log "$name process already exited"
  fi
}

kill_port() {
  port="$1"
  name="$2"

  pids=$(lsof -t -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -z "$pids" ]; then
    log "$name not running on :$port"
    return 0
  fi

  log "stopping $name on :$port"
  for pid in $pids; do
    kill "$pid" 2>/dev/null || true
  done

  sleep 1

  pids_left=$(lsof -t -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids_left" ]; then
    log "force stopping $name on :$port"
    for pid in $pids_left; do
      kill -9 "$pid" 2>/dev/null || true
    done
  fi
}

kill_pattern() {
  pattern="$1"
  name="$2"

  pids=$(pgrep -f "$pattern" 2>/dev/null || true)
  if [ -z "$pids" ]; then
    log "$name pattern not running"
    return 0
  fi

  log "stopping $name by pattern"
  for pid in $pids; do
    kill "$pid" 2>/dev/null || true
  done

  sleep 1

  pids_left=$(pgrep -f "$pattern" 2>/dev/null || true)
  if [ -n "$pids_left" ]; then
    log "force stopping $name by pattern"
    for pid in $pids_left; do
      kill -9 "$pid" 2>/dev/null || true
    done
  fi
}

main() {
  log "stopping local dev processes"
  kill_pidfile "$PID_DIR/media-pipeline-sidecar.pid" "Media pipeline sidecar"
  kill_pidfile "$PID_DIR/fedify-sidecar.pid" "Fedify sidecar"
  kill_pidfile "$PID_DIR/frontend.pid" "ActivityPods frontend"
  kill_pidfile "$PID_DIR/backend.pid" "ActivityPods backend"
  kill_pattern "media-pipeline-sidecar/src/dev/runLocalStack.ts" "Media pipeline supervisor"

  kill_port 8090 "Media pipeline sidecar"
  kill_port 8080 "Fedify sidecar"
  kill_port 5000 "ActivityPods frontend"
  kill_port 3000 "ActivityPods backend"

  log "stopping federation compose services"
  docker compose -f "$FEDIFY_ROOT/docker-compose.yml" down || true

  log "stopping ActivityPods compose services"
  docker compose -f "$AP_ROOT/pod-provider/docker-compose.yml" down || true

  log "done"
}

main "$@"
