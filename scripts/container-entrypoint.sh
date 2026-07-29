#!/bin/sh
# Fly mounts the persistent volume over /app/data after the image's build-time
# ownership is applied. Start in the pinned container root context only long
# enough to validate that exact mount, restore its app ownership, and then
# irreversibly drop to uid/gid 10001 before running any application command.
set -eu

DATA_DIR=/app/data
APP_UID=10001
APP_GID=10001

if [ "$(id -u)" -ne 0 ]; then
  echo "container-entrypoint: expected the image entrypoint to start as root" >&2
  exit 1
fi

if [ -L "$DATA_DIR" ]; then
  echo "container-entrypoint: refusing a symbolic-link data mount" >&2
  exit 1
fi

mkdir -p "$DATA_DIR"
chown -hR "$APP_UID:$APP_GID" "$DATA_DIR"

exec setpriv \
  --reuid="$APP_UID" \
  --regid="$APP_GID" \
  --init-groups \
  --no-new-privs \
  -- "$@"
