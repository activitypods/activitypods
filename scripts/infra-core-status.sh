#!/usr/bin/env sh
set -eu

SCRIPT_NAME="infra-core-status"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=./lib/dev-common.sh
. "$SCRIPT_DIR/lib/dev-common.sh"

AP_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
WORK_ROOT=$(CDPATH= cd -- "$AP_ROOT/.." && pwd)
FEDIFY_ROOT="$WORK_ROOT/mastopod-federation-architecture/fedify-sidecar"

print_section() {
  printf '\n== %s ==\n' "$1"
}

print_port_status() {
  port="$1"
  name="$2"
  if is_port_listening "$port"; then
    printf '[up]   %s (:%s)\n' "$name" "$port"
  else
    printf '[down] %s (:%s)\n' "$name" "$port"
  fi
}

main() {
  require_cmd docker
  require_cmd lsof

  print_section "ActivityPods Compose"
  docker compose -f "$AP_ROOT/pod-provider/docker-compose.yml" ps || true

  print_section "Federation Compose"
  docker compose -f "$FEDIFY_ROOT/docker-compose.yml" ps || true

  print_section "Core Ports"
  print_port_status 6379 "Redis"
  print_port_status 19092 "RedPanda"
  print_port_status 9200 "OpenSearch"
  print_port_status 7070 "PDQ Hash"
}

main "$@"
