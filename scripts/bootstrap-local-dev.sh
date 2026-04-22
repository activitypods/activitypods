#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

"$SCRIPT_DIR/infra-core-up.sh"
"$SCRIPT_DIR/start-local-services.sh"
