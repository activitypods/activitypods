#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

"$SCRIPT_DIR/stop-local-services.sh"
"$SCRIPT_DIR/infra-core-down.sh"
