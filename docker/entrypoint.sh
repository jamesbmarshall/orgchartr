#!/bin/sh
set -e

# The bind-mounted .git directory is owned by the host user, which git treats
# as "dubious ownership" by default when running as a different uid in the container.
git config --global --add safe.directory "${REPO_DIR:-/app}"

# Configure the commit identity used by the in-app "Commit changes" action.
if [ -n "$GIT_AUTHOR_NAME" ]; then
  git config --global user.name "$GIT_AUTHOR_NAME"
fi
if [ -n "$GIT_AUTHOR_EMAIL" ]; then
  git config --global user.email "$GIT_AUTHOR_EMAIL"
fi

exec "$@"
