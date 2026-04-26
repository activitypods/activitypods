#!/usr/bin/env sh
set -eu

log() {
  printf '%s\n' "[$SCRIPT_NAME] $*"
}

fail() {
  printf '%s\n' "[$SCRIPT_NAME] ERROR: $*" >&2
  exit 1
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "missing required command: $1"
  fi
}

is_port_listening() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

is_pid_running() {
  pid="$1"
  [ -n "$pid" ] && kill -0 "$pid" >/dev/null 2>&1
}

# Exponential backoff with bounded delay and deterministic max attempts.
retry_with_backoff() {
  attempts="$1"
  base_delay="$2"
  max_delay="$3"
  description="$4"
  shift 4

  try=1
  delay="$base_delay"
  while [ "$try" -le "$attempts" ]; do
    if "$@"; then
      return 0
    fi

    if [ "$try" -ge "$attempts" ]; then
      break
    fi

    log "$description failed (attempt $try/$attempts), retrying in ${delay}s"
    sleep "$delay"

    next_delay=$((delay * 2))
    if [ "$next_delay" -gt "$max_delay" ]; then
      delay="$max_delay"
    else
      delay="$next_delay"
    fi

    try=$((try + 1))
  done

  fail "$description failed after $attempts attempts"
}

wait_for_port() {
  port="$1"
  name="$2"
  attempts="${3:-8}"
  delay="${4:-1}"

  retry_with_backoff "$attempts" "$delay" 8 "waiting for $name on :$port" is_port_listening "$port"
}

cleanup_stale_pidfile() {
  pidfile="$1"
  if [ ! -f "$pidfile" ]; then
    return 0
  fi

  pid=$(cat "$pidfile" 2>/dev/null || true)
  if [ -z "$pid" ] || ! is_pid_running "$pid"; then
    rm -f "$pidfile"
  fi
}

start_bg_if_needed() {
  name="$1"
  port="$2"
  logfile="$3"
  pidfile="$4"
  shift 4

  cleanup_stale_pidfile "$pidfile"
  if [ -f "$pidfile" ]; then
    pid=$(cat "$pidfile" 2>/dev/null || true)
    log "$name already running (pid ${pid:-unknown})"
    return 0
  fi

  if [ "$port" != "-" ] && is_port_listening "$port"; then
    log "$name already listening on :$port"
    return 0
  fi

  log "starting $name"
  nohup "$@" >"$logfile" 2>&1 &
  pid=$!
  printf '%s\n' "$pid" >"$pidfile"

  if [ "$port" != "-" ]; then
    wait_for_port "$port" "$name" 8 1
  fi
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
