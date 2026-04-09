#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
AP_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
WORK_ROOT=$(CDPATH= cd -- "$AP_ROOT/.." && pwd)
SIDE_ROOT="$WORK_ROOT/mastopod-federation-architecture/fedify-sidecar"

log() {
  printf '%s\n' "[shutdown] $*"
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

  # Give processes a chance to exit cleanly.
  sleep 1

  pids_left=$(lsof -t -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids_left" ]; then
    log "force stopping $name on :$port"
    for pid in $pids_left; do
      kill -9 "$pid" 2>/dev/null || true
    done
  fi
}

main() {
  log "stopping local dev processes"
  kill_port 8080 "Fedify sidecar"
  kill_port 5002 "ActivityPods frontend"
  kill_port 3000 "ActivityPods backend"

  log "stopping federation compose services"
  docker compose -f "$SIDE_ROOT/docker-compose.yml" down || true

  log "stopping ActivityPods compose services"
  docker compose -f "$AP_ROOT/pod-provider/docker-compose.yml" down || true

  log "done"
}

main "$@"
