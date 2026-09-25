#!/bin/bash

set -e

cd /app/frontend

# Backward compatibility: deployments made before the Vite migration used REACT_APP_CONFIG_URL
CONFIG_URL="${VITE_CONFIG_URL:-${REACT_APP_CONFIG_URL:-}}"

if [ -z "${CONFIG_URL}" ]; then
  echo "WARNING: VITE_CONFIG_URL is not set, the config script will not be loaded by the frontend!"
else
  echo "Updating the build/index.html file to use ${CONFIG_URL} as a config url..."

  # Replace VITE_CONFIG_URL set during build with runtime env var
  # See https://stackoverflow.com/a/7189727
  sed -r -i -e 's|<script id="config-script" src="([^"]*)"></script>|<script id="config-script" src="'"${CONFIG_URL}"'"></script>|g' /app/frontend/build/index.html
fi

# Execute the CMD (usually "serve")
exec "$@"
