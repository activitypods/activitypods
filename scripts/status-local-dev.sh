#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
AP_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
WORK_ROOT=$(CDPATH= cd -- "$AP_ROOT/.." && pwd)
SIDE_ROOT="$WORK_ROOT/mastopod-federation-architecture/fedify-sidecar"

print_section() {
  printf '\n== %s ==\n' "$1"
}

print_port_status() {
  port="$1"
  name="$2"
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    printf '[up]   %s (:%s)\n' "$name" "$port"
  else
    printf '[down] %s (:%s)\n' "$name" "$port"
  fi
}

print_http_status() {
  url="$1"
  name="$2"
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "$url" || true)
  if [ -n "$code" ] && [ "$code" != "000" ]; then
    printf '[http] %s -> %s\n' "$name" "$code"
  else
    printf '[http] %s -> unreachable\n' "$name"
  fi
}

print_section "Colima"
if command -v colima >/dev/null 2>&1; then
  if colima status >/dev/null 2>&1; then
    colima list
  else
    echo "colima is not running"
  fi
else
  echo "colima command not found"
fi

print_section "ActivityPods Compose"
docker compose -f "$AP_ROOT/pod-provider/docker-compose.yml" ps || true

print_section "Federation Compose"
docker compose -f "$SIDE_ROOT/docker-compose.yml" ps || true

print_section "Local Ports"
print_port_status 3000 "ActivityPods backend"
print_port_status 5002 "ActivityPods frontend"
print_port_status 8080 "Fedify sidecar"
print_port_status 9200 "OpenSearch"
print_port_status 19092 "RedPanda"

print_section "HTTP Endpoints"
print_http_status "http://localhost:3000/" "ActivityPods backend root"
print_http_status "http://localhost:5002/" "ActivityPods frontend"
print_http_status "http://localhost:8080/health" "Fedify sidecar health"
print_http_status "http://localhost:8080/metrics" "Fedify sidecar metrics"
print_http_status "http://localhost:9200" "OpenSearch"
