#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
registry="${NPM_REGISTRY:-}"

if [ -z "$registry" ] && [ -f "$repo_root/.env" ]; then
  registry="$(sed -nE 's/^[[:space:]]*NPM_REGISTRY[[:space:]]*=[[:space:]]*(.*)$/\1/p' "$repo_root/.env" | tail -n 1)"
  case "$registry" in
    \"*\") registry="${registry#\"}"; registry="${registry%\"}" ;;
    \'*\') registry="${registry#\'}"; registry="${registry%\'}" ;;
  esac
fi

if [ -z "$registry" ] && command -v npm >/dev/null 2>&1; then
  registry="$(npm config get registry 2>/dev/null || true)"
  if [ "$registry" = "null" ] || [ "$registry" = "undefined" ]; then
    registry=""
  fi
fi

registry="${registry:-https://registry.npmjs.org/}"
export NPM_REGISTRY="$registry"

echo "Building with npm registry: $NPM_REGISTRY"
cd "$repo_root"
docker compose up -d --build