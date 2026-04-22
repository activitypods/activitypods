#!/usr/bin/env sh
set -eu

SCRIPT_NAME="infra-core-up"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=./lib/dev-common.sh
. "$SCRIPT_DIR/lib/dev-common.sh"

AP_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
WORK_ROOT=$(CDPATH= cd -- "$AP_ROOT/.." && pwd)
FEDIFY_ROOT="$WORK_ROOT/mastopod-federation-architecture/fedify-sidecar"

ensure_colima() {
  if ! command -v colima >/dev/null 2>&1; then
    log "colima not found, assuming Docker runtime is already available"
    return 0
  fi

  want_cpu="${COLIMA_CPU:-4}"
  want_mem="${COLIMA_MEMORY_GIB:-8}"

  if colima status >/dev/null 2>&1; then
    log "colima already running"
    return 0
  fi

  log "starting colima (${want_cpu} CPU, ${want_mem}GiB RAM)"
  retry_with_backoff 3 2 8 "starting colima" colima start --cpu "$want_cpu" --memory "$want_mem" --disk 100
}

main() {
  require_cmd docker
  require_cmd npm
  require_cmd lsof

  [ -d "$FEDIFY_ROOT" ] || fail "fedify-sidecar directory not found: $FEDIFY_ROOT"

  ensure_colima

  log "starting ActivityPods core compose services"
  retry_with_backoff 4 1 8 "starting activitypods compose" docker compose -f "$AP_ROOT/pod-provider/docker-compose.yml" up -d

  log "starting federation core compose services"
  # pdq-hash resolves 'redis' via activitypods-network; that network doesn't
  # include the pod-provider redis container. Override to reach redis on host.
  retry_with_backoff 4 1 8 "starting federation compose" \
    env PDQ_HASH_REDIS_URI=redis://host.docker.internal:6379 \
    docker compose -f "$FEDIFY_ROOT/docker-compose.yml" up -d \
      pdq-hash opensearch opensearch-dashboards redpanda redpanda-console prometheus grafana

  wait_for_port 6379  "redis"
  wait_for_port 19092 "redpanda"
  wait_for_port 9200  "opensearch"
  # pdq-hash is a locally-built image with no healthcheck; give it up to ~90s
  wait_for_port 7070  "pdq-hash" 16 2

  bootstrap_brokers="${REDPANDA_BROKERS_BOOTSTRAP:-localhost:19092}"

  log "bootstrapping messaging topics via $bootstrap_brokers"
  retry_with_backoff 5 1 8 "bootstrapping topics" \
    env REDPANDA_BROKERS="$bootstrap_brokers" npm --prefix "$FEDIFY_ROOT" run topics:bootstrap

  log "core infra is healthy"
}

main "$@"
