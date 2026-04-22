#!/usr/bin/env sh
set -eu

SCRIPT_NAME="stop-local-services"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=./lib/dev-common.sh
. "$SCRIPT_DIR/lib/dev-common.sh"

AP_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
PID_DIR="$AP_ROOT/.pids"

main() {
  require_cmd lsof

  kill_pidfile "$PID_DIR/media-pipeline-sidecar.pid" "Media pipeline sidecar"
  kill_pidfile "$PID_DIR/fedify-sidecar.pid" "Fedify sidecar"
  kill_pidfile "$PID_DIR/frontend.pid" "ActivityPods frontend"
  kill_pidfile "$PID_DIR/backend.pid" "ActivityPods backend"
  kill_pattern "media-pipeline-sidecar/src/dev/runLocalStack.ts" "Media pipeline supervisor"

  kill_port 8090 "Media pipeline sidecar"
  kill_port 8080 "Fedify sidecar"
  kill_port 5000 "ActivityPods frontend"
  kill_port 3000 "ActivityPods backend"

  log "local source services stopped"
}

main "$@"
