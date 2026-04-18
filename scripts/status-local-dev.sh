#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
AP_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
WORK_ROOT=$(CDPATH= cd -- "$AP_ROOT/.." && pwd)
FEDIFY_ROOT="$WORK_ROOT/mastopod-federation-architecture/fedify-sidecar"

PID_DIR="$AP_ROOT/.pids"

print_section() {
  printf '\n== %s ==\n' "$1"
}

print_pid_status() {
  pidfile="$1"
  name="$2"
  if [ ! -f "$pidfile" ]; then
    printf '[pid]  %s -> not tracked\n' "$name"
    return 0
  fi

  pid=$(cat "$pidfile" 2>/dev/null || true)
  if [ -n "$pid" ] && kill -0 "$pid" >/dev/null 2>&1; then
    printf '[pid]  %s -> running (%s)\n' "$name" "$pid"
  else
    printf '[pid]  %s -> stale pidfile\n' "$name"
  fi
}

print_pattern_status() {
  pattern="$1"
  name="$2"
  pids=$(pgrep -f "$pattern" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    printf '[proc] %s -> %s\n' "$name" "$(printf '%s' "$pids" | tr '\n' ' ' | sed 's/ $//')"
  else
    printf '[proc] %s -> not found\n' "$name"
  fi
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

print_section "Tracked Processes"
print_pid_status "$PID_DIR/backend.pid" "ActivityPods backend"
print_pid_status "$PID_DIR/frontend.pid" "ActivityPods frontend"
print_pid_status "$PID_DIR/fedify-sidecar.pid" "Fedify sidecar"
print_pid_status "$PID_DIR/media-pipeline-sidecar.pid" "Media pipeline sidecar"
print_pattern_status "media-pipeline-sidecar/src/dev/runLocalStack.ts" "Media pipeline supervisor"

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
docker compose -f "$FEDIFY_ROOT/docker-compose.yml" ps || true

print_section "Local Ports"
print_port_status 3000 "ActivityPods backend"
print_port_status 5000 "ActivityPods frontend"
print_port_status 8080 "Fedify sidecar"
print_port_status 8090 "Media pipeline sidecar"
print_port_status 9200 "OpenSearch"
print_port_status 19092 "RedPanda"

print_section "HTTP Endpoints"
print_http_status "http://localhost:3000/" "ActivityPods backend root"
print_http_status "http://localhost:5000/" "ActivityPods frontend"
print_http_status "http://localhost:8080/health" "Fedify sidecar health"
print_http_status "http://localhost:8080/metrics" "Fedify sidecar metrics"
print_http_status "http://localhost:8090/health" "Media pipeline sidecar health"
print_http_status "http://localhost:8090/ready" "Media pipeline sidecar ready"
print_http_status "http://localhost:9200" "OpenSearch"
