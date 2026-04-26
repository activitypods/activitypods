#!/usr/bin/env sh
set -eu

SCRIPT_NAME="infra-core-down"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=./lib/dev-common.sh
. "$SCRIPT_DIR/lib/dev-common.sh"

AP_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
WORK_ROOT=$(CDPATH= cd -- "$AP_ROOT/.." && pwd)
FEDIFY_ROOT="$WORK_ROOT/mastopod-federation-architecture/fedify-sidecar"

main() {
  require_cmd docker

  log "stopping federation compose services"
  retry_with_backoff 3 1 4 "stopping federation compose" docker compose -f "$FEDIFY_ROOT/docker-compose.yml" down

  log "stopping activitypods compose services"
  retry_with_backoff 3 1 4 "stopping activitypods compose" docker compose -f "$AP_ROOT/pod-provider/docker-compose.yml" down

  log "core infra stopped"
}

main "$@"
