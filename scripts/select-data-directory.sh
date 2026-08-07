#!/usr/bin/env bash
#
# macOS/Linux counterpart to select-data-directory.ps1.
# Chooses the folder where orgchartr stores its data and records it as
# ORGCHARTR_DATA_DIR in the repository's .env file. Other lines in .env are preserved.
#
# Usage:  ./scripts/select-data-directory.sh
# Then:   docker compose up -d --build

set -euo pipefail

# .env lives in the repository root (the parent of this scripts/ directory).
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
env_file="$repo_root/.env"

prompt="Choose the folder where orgchartr will store its data"
selected=""

# Try a native folder picker first; fall back to typing a path so this also works over SSH.
if [ "$(uname)" = "Darwin" ] && command -v osascript >/dev/null 2>&1; then
  selected="$(osascript -e 'try
    set chosen to choose folder with prompt "'"$prompt"'"
    POSIX path of chosen
  end try' 2>/dev/null || true)"
elif command -v zenity >/dev/null 2>&1; then
  selected="$(zenity --file-selection --directory --title="$prompt" 2>/dev/null || true)"
fi

if [ -z "$selected" ]; then
  # No graphical picker (or the user cancelled it): ask for a path on the terminal.
  printf '%s\n' "$prompt"
  printf 'Enter the full folder path (leave blank to cancel): '
  read -r selected || true
fi

# Trim a single trailing slash so the stored value is tidy (but keep "/").
if [ "${#selected}" -gt 1 ]; then
  selected="${selected%/}"
fi

if [ -z "$selected" ]; then
  echo "No folder selected. Configuration was not changed."
  exit 0
fi

if [ ! -d "$selected" ]; then
  echo "That folder does not exist yet: $selected"
  printf 'Create it now? [y/N] '
  read -r reply || true
  case "$reply" in
    [yY]*) mkdir -p "$selected" ;;
    *) echo "Configuration was not changed."; exit 0 ;;
  esac
fi

setting="ORGCHARTR_DATA_DIR=\"$selected\""

# Upsert the setting: replace an existing ORGCHARTR_DATA_DIR line, otherwise append it,
# leaving every other line in .env untouched.
if [ -f "$env_file" ] && grep -qE '^[[:space:]]*ORGCHARTR_DATA_DIR[[:space:]]*=' "$env_file"; then
  tmp_file="$(mktemp)"
  replaced=0
  while IFS= read -r line || [ -n "$line" ]; do
    if [ "$replaced" -eq 0 ] && printf '%s' "$line" | grep -qE '^[[:space:]]*ORGCHARTR_DATA_DIR[[:space:]]*='; then
      printf '%s\n' "$setting" >> "$tmp_file"
      replaced=1
    else
      printf '%s\n' "$line" >> "$tmp_file"
    fi
  done < "$env_file"
  mv "$tmp_file" "$env_file"
else
  # Append (creating .env if needed), keeping any existing content.
  printf '%s\n' "$setting" >> "$env_file"
fi

echo "orgchartr data directory set to: $selected"
echo "Run 'docker compose up -d --build' to apply it."
