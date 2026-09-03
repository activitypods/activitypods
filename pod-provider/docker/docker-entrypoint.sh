#!/bin/bash

set -e

cd /app/frontend

echo "Updating the build/index.html file to use ${VITE_CONFIG_URL} as a config url..."

# Replace VITE_CONFIG_URL set during build with runtime env var
# See https://stackoverflow.com/a/7189727
sed -r -i -e 's|<script id="config-script" src="([^"]*)"></script>|<script id="config-script" src="'"${VITE_CONFIG_URL}"'"></script>|g' /app/frontend/build/index.html

# Execute the CMD (usually "serve")
exec "$@"

# Prevent the container to exit
tail -f /dev/null
