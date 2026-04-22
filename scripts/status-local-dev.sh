#!/usr/bin/env sh
set -eu

SCRIPT_NAME="status-local-dev"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=./lib/dev-common.sh
. "$SCRIPT_DIR/lib/dev-common.sh"

AP_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
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
  if is_pid_running "$pid"; then
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
  if is_port_listening "$port"; then
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

"$SCRIPT_DIR/infra-core-status.sh"

print_section "Local Service Ports"
print_port_status 3000 "ActivityPods backend"
print_port_status 5000 "ActivityPods frontend"
print_port_status 8080 "Fedify sidecar"
print_port_status 8090 "Media pipeline sidecar"

print_section "HTTP Endpoints"
print_http_status "http://localhost:3000/" "ActivityPods backend root"
print_http_status "http://localhost:5000/" "ActivityPods frontend"
print_http_status "http://localhost:8080/health" "Fedify sidecar health"
print_http_status "http://localhost:8080/metrics" "Fedify sidecar metrics"
print_http_status "http://localhost:8090/health" "Media pipeline sidecar health"
print_http_status "http://localhost:8090/ready" "Media pipeline sidecar ready"
