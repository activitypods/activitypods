#!/usr/bin/env bash
# fuseki-bootstrap.sh
#
# Pre-creates the Fuseki datasets required for ActivityPods to start.
#
# Fuseki 6 changed dataset creation: datasets are no longer automatically
# provisioned on first write.  This script must run before the backend
# starts, or the triplestore will fail with 404 on the first SPARQL request.
#
# Usage:
#   ./scripts/fuseki-bootstrap.sh
#
# Environment variables (all optional — defaults match docker-compose.yml):
#   FUSEKI_URL          Fuseki base URL          (default: http://localhost:3030)
#   FUSEKI_USER         Admin username            (default: admin)
#   FUSEKI_PASSWORD     Admin password            (default: admin)
#   AUTH_DATASET        Auth/accounts dataset     (default: settings)
#   EXTRA_DATASETS      Space-separated list of   (default: empty)
#                       additional datasets to
#                       pre-create (e.g. test user slugs)
#   WAIT_SECONDS        Seconds to wait for ready (default: 30)
#
# Example for CI / local dev with a test user:
#   EXTRA_DATASETS="alice bob" ./scripts/fuseki-bootstrap.sh

set -euo pipefail

FUSEKI_URL="${FUSEKI_URL:-http://localhost:3030}"
FUSEKI_USER="${FUSEKI_USER:-admin}"
FUSEKI_PASSWORD="${FUSEKI_PASSWORD:-admin}"
AUTH_DATASET="${AUTH_DATASET:-settings}"
EXTRA_DATASETS="${EXTRA_DATASETS:-}"
WAIT_SECONDS="${WAIT_SECONDS:-30}"

PING_URL="${FUSEKI_URL}/\$/ping"
DATASETS_URL="${FUSEKI_URL}/\$/datasets"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() { echo "[fuseki-bootstrap] $*"; }

wait_for_fuseki() {
  log "Waiting up to ${WAIT_SECONDS}s for Fuseki at ${FUSEKI_URL} ..."
  local elapsed=0
  until curl -sf -u "${FUSEKI_USER}:${FUSEKI_PASSWORD}" "${PING_URL}" > /dev/null 2>&1; do
    if [[ $elapsed -ge $WAIT_SECONDS ]]; then
      log "ERROR: Fuseki did not become ready within ${WAIT_SECONDS}s"
      exit 1
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  log "Fuseki is ready."
}

list_datasets() {
  curl -sf \
    -u "${FUSEKI_USER}:${FUSEKI_PASSWORD}" \
    -H "Accept: application/json" \
    "${DATASETS_URL}" \
    | grep -o '"ds.name" *: *"[^"]*"' \
    | sed 's|.*"\(/[^"]*\)"|\1|' \
    | sed 's|^/||'
}

dataset_exists() {
  local name="$1"
  list_datasets | grep -q "^${name}$"
}

create_dataset() {
  local name="$1"
  if dataset_exists "${name}"; then
    log "Dataset '${name}' already exists — skipping."
    return 0
  fi

  log "Creating dataset '${name}' (tdb2) ..."
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST \
    -u "${FUSEKI_USER}:${FUSEKI_PASSWORD}" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "dbName=${name}" \
    --data-urlencode "dbType=tdb2" \
    "${DATASETS_URL}")

  if [[ "${http_code}" == "200" || "${http_code}" == "201" ]]; then
    log "  Created '${name}' (HTTP ${http_code})"
  else
    log "ERROR: Failed to create dataset '${name}' (HTTP ${http_code})"
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

wait_for_fuseki

log "Bootstrap starting. Auth dataset: '${AUTH_DATASET}'"

# Always create the auth/accounts dataset
create_dataset "${AUTH_DATASET}"

# Create any extra pre-provisioned user datasets
if [[ -n "${EXTRA_DATASETS}" ]]; then
  for ds in ${EXTRA_DATASETS}; do
    create_dataset "${ds}"
  done
fi

log "Bootstrap complete."
