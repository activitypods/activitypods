#!/bin/bash
# Exit immediately if a command exits with a non-zero status
set -e

# ============================================================================
# This script adds `defineAction` and `defineServiceEvent` dummy functions. The functions are only necessary to improve typing.
# ============================================================================


# SETUP AND CONFIGURATION
# =============================================================================

# Determine the absolute path of the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Define paths for TypeScript definitions
DEST_DIR_PATH="${SCRIPT_DIR}/../node_modules/moleculer"
SOURCE_FILE_PATH="${SCRIPT_DIR}/moleculer/index.d.ts"
DEST_FILE_PATH="${DEST_DIR_PATH}/index.d.ts"
BACKUP_FILE_PATH="${DEST_DIR_PATH}/index.d.ts.original"

# Define paths for JavaScript files
MOLECULER_INDEX_JS="${DEST_DIR_PATH}/index.js"
MOLECULER_INDEX_MJS="${DEST_DIR_PATH}/index.mjs"
INJECTION_SOURCE="${SCRIPT_DIR}/moleculer/injections.js.template"


# PATCH TYPESCRIPT DEFINITIONS
# =============================================================================

# Ensure the destination directory exists
mkdir -p "${DEST_DIR_PATH}"

# Create backup of TypeScript definitions if it doesn't exist
if [ -f "${DEST_FILE_PATH}" ] && [ ! -f "${BACKUP_FILE_PATH}" ]; then
  cp "${DEST_FILE_PATH}" "${BACKUP_FILE_PATH}"
fi

# Copy our custom TypeScript definitions to moleculer's directory
# This overwrites the original index.d.ts with our patched version
cp -f "${SOURCE_FILE_PATH}" "${DEST_FILE_PATH}"


# PATCH COMMONJS MODULE (index.js)
# =============================================================================

# Create backup of index.js if it doesn't exist
if [ -f "${MOLECULER_INDEX_JS}" ] && [ ! -f "${MOLECULER_INDEX_JS}.original" ]; then
  cp "${MOLECULER_INDEX_JS}" "${MOLECULER_INDEX_JS}.original"
fi

# Read the injection functions from the template file
INJECTION_CONTENT=$(cat "${INJECTION_SOURCE}")

# Add the injection functions to module.exports in index.js
# Only apply the patch if defineAction is not already present (avoid duplicates)
if ! grep -q "defineAction" "${MOLECULER_INDEX_JS}"; then
  # Create a temporary file with the new content:
  # 1. Add the injection functions at the top
  # 2. Modify the module.exports line to include our new functions
  {
    echo "${INJECTION_CONTENT}"
    echo ""
    sed 's/module\.exports = {/module.exports = {\n\tdefineAction, defineServiceEvent,/' "${MOLECULER_INDEX_JS}"
  } > "${MOLECULER_INDEX_JS}.tmp"
  
  # Replace the original file with our patched version
  mv "${MOLECULER_INDEX_JS}.tmp" "${MOLECULER_INDEX_JS}"
fi


# PATCH ESM MODULE (index.mjs)
# =============================================================================

# Create backup of index.mjs if it doesn't exist
if [ -f "${MOLECULER_INDEX_MJS}" ] && [ ! -f "${MOLECULER_INDEX_MJS}.original" ]; then
  cp "${MOLECULER_INDEX_MJS}" "${MOLECULER_INDEX_MJS}.original"
fi

# Add named exports to index.mjs for ESM compatibility
# Only apply the patch if the exports are not already present (avoid duplicates)
if [ -f "${MOLECULER_INDEX_MJS}" ] && ! grep -q "export const defineAction" "${MOLECULER_INDEX_MJS}"; then
  # Insert the named exports after the default export line
  # This enables: import { defineAction, defineServiceEvent } from 'moleculer'
  sed -i '/export default mod;/a\
export const defineAction = mod.defineAction;\
export const defineServiceEvent = mod.defineServiceEvent;' "${MOLECULER_INDEX_MJS}"
fi
